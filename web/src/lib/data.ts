import { getSupabase } from "./supabase";
import { SET_SLOTS } from "./set-slots";
import {
  computeBaroRoi,
  isSpecialVisit,
  computeBaseline,
  buildRecoverySeries,
  poolMedianCurve,
  extractRecoveryDays,
  computeRestockInterval,
  computeBaselineDrift,
  isInTennoConWindow,
  computeAdvisorVerdict,
  BARO_CYCLE_DAYS,
  type DailyPrice,
  type NormalizedPoint,
} from "./metrics";

const RESALE_WINDOW_DAYS = 30;

// PostgREST silently caps every query at 1000 rows; queries that can exceed
// that must paginate. The page factory MUST apply a deterministic order.
const PAGE_SIZE = 1000;
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await page(from, from + PAGE_SIZE - 1);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

function daysAgoDate(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export interface RankedItem {
  id: string;
  url_name: string;
  item_name: string;
  ducats: number;
  median: number;
  ppd: number;
  ppd_at_n: number | null;
  velocity: number;
  score: number;
  shallow: boolean;
  orders: Order[];
}

export interface Order {
  price: number;
  quantity: number;
  mod_rank: number | null;
  seller_name: string;
}

export interface BaroCountdown {
  daysUntil: number | null;
  active: boolean;
  relay: string | null;
  arrival: string | null;
  departure: string | null;
}

export async function getLatestSweepId(): Promise<number | null> {
  const db = getSupabase();
  const { data } = await db
    .from("sweeps")
    .select("id")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .single();

  return data?.id ?? null;
}

export async function getBaroCountdown(): Promise<BaroCountdown> {
  const db = getSupabase();

  // The worker stores the API's own schedule on the heartbeat — ground truth
  // for the next arrival, immune to off-cadence special visits.
  const { data: hb } = await db
    .from("heartbeat")
    .select("baro_activation, baro_expiry, baro_active")
    .eq("id", 1)
    .single();

  const now = Date.now();

  if (hb?.baro_activation && hb?.baro_expiry) {
    const arrival = new Date(hb.baro_activation).getTime();
    const departure = new Date(hb.baro_expiry).getTime();

    if (arrival <= now && now < departure) {
      const { data: visit } = await db
        .from("baro_visits")
        .select("relay")
        .order("arrival", { ascending: false })
        .limit(1)
        .single();
      return {
        daysUntil: 0,
        active: true,
        relay: visit?.relay ?? null,
        arrival: hb.baro_activation,
        departure: hb.baro_expiry,
      };
    }

    if (arrival > now) {
      return {
        daysUntil: Math.max(0, Math.ceil((arrival - now) / 86_400_000)),
        active: false,
        relay: null,
        arrival: hb.baro_activation,
        departure: null,
      };
    }
  }

  // Fallback (no heartbeat schedule yet): derive from the last recorded visit.
  const { data: visits } = await db
    .from("baro_visits")
    .select("arrival, departure, relay")
    .order("arrival", { ascending: false })
    .limit(1)
    .single();

  if (!visits) return { daysUntil: null, active: false, relay: null, arrival: null, departure: null };

  const arrival = new Date(visits.arrival).getTime();
  const departure = new Date(visits.departure).getTime();

  if (now >= arrival && now < departure) {
    return {
      daysUntil: 0,
      active: true,
      relay: visits.relay,
      arrival: visits.arrival,
      departure: visits.departure,
    };
  }

  const nextArrival = departure + 14 * 24 * 60 * 60 * 1000 - (departure - arrival);
  const daysUntil = Math.max(0, Math.ceil((nextArrival - now) / (1000 * 60 * 60 * 24)));

  return {
    daysUntil,
    active: false,
    relay: visits.relay,
    arrival: new Date(nextArrival).toISOString(),
    departure: null,
  };
}

export async function getRankedItems(): Promise<RankedItem[]> {
  const db = getSupabase();
  const sweepId = await getLatestSweepId();
  if (!sweepId) return [];

  const rows = await fetchAll<{
    item_id: string;
    rank: number;
    ppd: number;
    ppd_at_n: number | null;
    velocity: number;
    score: number;
    shallow: boolean;
    orders_json: Order[] | null;
  }>((from, to) =>
    db
      .from("rankings")
      .select("item_id, rank, ppd, ppd_at_n, velocity, score, shallow, orders_json")
      .eq("sweep_id", sweepId)
      .order("rank", { ascending: true })
      .range(from, to),
  );

  if (!rows.length) return [];

  const itemIds = rows.map((r) => r.item_id);
  const itemMap = new Map<string, { url_name: string; item_name: string; ducats: number }>();
  const CHUNK = 200;
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK);
    const { data: items } = await db
      .from("prime_items")
      .select("id, url_name, item_name, ducats")
      .in("id", chunk);
    if (items) {
      for (const it of items) {
        itemMap.set(it.id, { url_name: it.url_name, item_name: it.item_name, ducats: it.ducats as number });
      }
    }
  }

  return rows
    .filter((r) => itemMap.has(r.item_id))
    .map((r) => {
      const item = itemMap.get(r.item_id)!;
      return {
        id: r.item_id,
        url_name: item.url_name,
        item_name: item.item_name,
        ducats: item.ducats,
        median: Number(r.ppd) > 0 ? Math.round((item.ducats / Number(r.ppd)) * 100) / 100 : 0,
        ppd: Number(r.ppd),
        ppd_at_n: r.ppd_at_n !== null ? Number(r.ppd_at_n) : null,
        velocity: Number(r.velocity),
        score: Number(r.score),
        shallow: r.shallow,
        orders: (r.orders_json ?? []) as Order[],
      };
    });
}

export async function computeJunkRate(): Promise<number> {
  const db = getSupabase();
  const sweepId = await getLatestSweepId();
  if (!sweepId) return 0.10;

  const { data } = await db
    .from("sweeps")
    .select("junk_rate")
    .eq("id", sweepId)
    .single();

  return data?.junk_rate != null ? Number(data.junk_rate) : 0.10;
}

export interface BundleSeller {
  seller_name: string;
  items: {
    item_name: string;
    url_name: string;
    ducats: number;
    price: number;
    quantity: number;
    slots: number; // trade slots this listing occupies (set = part count; else 1)
  }[];
  total_ducats: number;
  total_plat: number;
  combined_ppd: number;
}

// A Prime set trades as its individual parts, so it costs that many trade
// slots — and dual weapons need multiples (Aksomati = barrel x2 + receiver x2
// + blueprint + link = 6). The exact counts live in the generated SET_SLOTS
// map (worker/scripts/gen-set-slots.mjs). For any set not yet in the map (a new
// release before the map is regenerated), fall back to the distinct-part count
// derived from sibling url_names — an undercount for dual weapons, but better
// than 1.
export function computeSetSlots(urlNames: string[]): Map<string, number> {
  const slots = new Map<string, number>();
  for (const u of urlNames) {
    if (!u.endsWith("_set")) continue;
    const known = SET_SLOTS[u];
    if (known != null) {
      slots.set(u, known);
      continue;
    }
    const prefix = u.slice(0, -4) + "_";
    let count = 0;
    for (const x of urlNames) {
      if (x !== u && !x.endsWith("_set") && x.startsWith(prefix)) count++;
    }
    if (count > 1) slots.set(u, count);
  }
  return slots;
}

export async function getBundles(): Promise<BundleSeller[]> {
  const db = getSupabase();
  const sweepId = await getLatestSweepId();
  if (!sweepId) return [];

  const orders = await fetchAll<{
    id: number;
    item_id: string;
    price: number;
    quantity: number;
    seller_name: string;
  }>((from, to) =>
    db
      .from("order_snapshots")
      .select("id, item_id, price, quantity, seller_name")
      .eq("sweep_id", sweepId)
      .order("price", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  if (!orders.length) return [];

  // All junk url_names, to derive set part-counts (a set spans several trades).
  const allJunk = await fetchAll<{ url_name: string }>((from, to) =>
    db
      .from("prime_items")
      .select("url_name")
      .not("ducats", "is", null)
      .order("url_name", { ascending: true })
      .range(from, to),
  );
  const setSlots = computeSetSlots(allJunk.map((j) => j.url_name));

  const itemIds = [...new Set(orders.map((o) => o.item_id))];

  const itemMap = new Map<string, { item_name: string; url_name: string; ducats: number }>();
  const CHUNK = 200;
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK);
    const { data: items } = await db
      .from("prime_items")
      .select("id, item_name, url_name, ducats")
      .in("id", chunk)
      .not("ducats", "is", null);
    if (items) {
      for (const it of items) {
        itemMap.set(it.id, { item_name: it.item_name, url_name: it.url_name, ducats: it.ducats as number });
      }
    }
  }

  const sellerItems = new Map<string, BundleSeller["items"]>();
  for (const o of orders) {
    const item = itemMap.get(o.item_id);
    if (!item) continue;
    if (!sellerItems.has(o.seller_name)) sellerItems.set(o.seller_name, []);
    const existing = sellerItems.get(o.seller_name)!;
    if (!existing.some((e) => e.url_name === item.url_name)) {
      existing.push({
        item_name: item.item_name,
        url_name: item.url_name,
        ducats: item.ducats,
        price: o.price,
        quantity: o.quantity,
        slots: setSlots.get(item.url_name) ?? 1,
      });
    }
  }

  const results: BundleSeller[] = [];
  for (const [seller_name, items] of sellerItems) {
    if (items.length < 2) continue;
    const total_ducats = items.reduce((s, i) => s + i.ducats * i.quantity, 0);
    const total_plat = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const combined_ppd = total_plat > 0 ? total_ducats / total_plat : 0;
    results.push({ seller_name, items, total_ducats, total_plat, combined_ppd });
  }

  results.sort((a, b) => b.combined_ppd - a.combined_ppd);
  return results;
}

export interface BaroVisit {
  id: number;
  arrival: string;
  departure: string;
  relay: string | null;
  is_special: boolean;
  items: BaroVisitItem[];
}

export interface BaroVisitItem {
  item_name: string;
  ducat_cost: number;
  credit_cost: number;
  item_id: string | null;
  url_name: string | null;
  is_primed_mod: boolean;
  resale_median: number | null;
  resale_median_max_rank: number | null;
  max_mod_rank: number | null;
  roi: number | null;
}

export async function getBaroVisits(): Promise<{ visits: BaroVisit[]; junkRate: number; activeVisit: BaroVisit | null }> {
  const db = getSupabase();
  const junkRate = await computeJunkRate();

  const { data: visits } = await db
    .from("baro_visits")
    .select("id, arrival, departure, relay")
    .order("arrival", { ascending: false })
    .limit(20);

  if (!visits?.length) return { visits: [], junkRate, activeVisit: null };

  const visitIds = visits.map((v) => v.id);
  const visitItems = await fetchAll<{
    visit_id: number;
    item_name: string;
    ducat_cost: number;
    credit_cost: number;
    item_id: string | null;
  }>((from, to) =>
    db
      .from("baro_visit_items")
      .select("visit_id, item_name, ducat_cost, credit_cost, item_id")
      .in("visit_id", visitIds)
      .order("visit_id", { ascending: true })
      .order("item_name", { ascending: true })
      .range(from, to),
  );

  const itemIds = (visitItems ?? [])
    .map((vi) => vi.item_id)
    .filter((id): id is string => id !== null);

  const primeItemMap = new Map<string, { url_name: string; is_primed_mod: boolean; max_mod_rank: number | null }>();
  if (itemIds.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < itemIds.length; i += CHUNK) {
      const chunk = itemIds.slice(i, i + CHUNK);
      const { data: items } = await db
        .from("prime_items")
        .select("id, url_name, is_primed_mod, max_mod_rank")
        .in("id", chunk);
      if (items) {
        for (const it of items) {
          primeItemMap.set(it.id, { url_name: it.url_name, is_primed_mod: it.is_primed_mod, max_mod_rank: it.max_mod_rank ?? null });
        }
      }
    }
  }

  const primedModIds = [...primeItemMap.entries()]
    .filter(([, v]) => v.is_primed_mod)
    .map(([id]) => id);

  const resaleMap = new Map<string, number>();
  const resaleMaxRankMap = new Map<string, number>();
  if (primedModIds.length > 0) {
    const resaleCutoff = daysAgoDate(RESALE_WINDOW_DAYS);
    const CHUNK = 200;
    for (let i = 0; i < primedModIds.length; i += CHUNK) {
      const chunk = primedModIds.slice(i, i + CHUNK);

      // Rank-0 resale
      const stats = await fetchAll<{
        item_id: string;
        median: number;
        stat_date: string;
      }>((from, to) =>
        db
          .from("trade_stats")
          .select("item_id, median, stat_date")
          .in("item_id", chunk)
          .eq("mod_rank", 0)
          .gte("stat_date", resaleCutoff)
          .order("stat_date", { ascending: false })
          .order("item_id", { ascending: true })
          .range(from, to),
      );
      for (const s of stats) {
        if (!resaleMap.has(s.item_id) && s.median > 0) {
          resaleMap.set(s.item_id, Number(s.median));
        }
      }

      // Max-rank resale: fetch all ranks, then pick latest for each item's max rank
      const maxRankStats = await fetchAll<{
        item_id: string;
        mod_rank: number;
        median: number;
        stat_date: string;
      }>((from, to) =>
        db
          .from("trade_stats")
          .select("item_id, mod_rank, median, stat_date")
          .in("item_id", chunk)
          .gt("mod_rank", 0)
          .gte("stat_date", resaleCutoff)
          .order("stat_date", { ascending: false })
          .order("item_id", { ascending: true })
          .range(from, to),
      );
      for (const s of maxRankStats) {
        const itemInfo = primeItemMap.get(s.item_id);
        if (!itemInfo || itemInfo.max_mod_rank === null) continue;
        if (s.mod_rank !== itemInfo.max_mod_rank) continue;
        if (!resaleMaxRankMap.has(s.item_id) && s.median > 0) {
          resaleMaxRankMap.set(s.item_id, Number(s.median));
        }
      }
    }
  }

  const visitItemsByVisit = new Map<number, typeof visitItems>();
  for (const vi of visitItems ?? []) {
    if (!visitItemsByVisit.has(vi.visit_id)) visitItemsByVisit.set(vi.visit_id, []);
    visitItemsByVisit.get(vi.visit_id)!.push(vi);
  }

  const result = visits.map((v) => {
    const rawItems = visitItemsByVisit.get(v.id) ?? [];
    const items: BaroVisitItem[] = rawItems.map((vi) => {
      const primeItem = vi.item_id ? primeItemMap.get(vi.item_id) : null;
      const is_primed_mod = primeItem?.is_primed_mod ?? false;
      const resale_median = vi.item_id ? (resaleMap.get(vi.item_id) ?? null) : null;
      const resale_median_max_rank = vi.item_id ? (resaleMaxRankMap.get(vi.item_id) ?? null) : null;
      const roi =
        is_primed_mod && resale_median !== null
          ? computeBaroRoi(resale_median, vi.ducat_cost, junkRate)
          : null;
      return {
        item_name: vi.item_name,
        ducat_cost: vi.ducat_cost,
        credit_cost: vi.credit_cost,
        item_id: vi.item_id,
        url_name: primeItem?.url_name ?? null,
        is_primed_mod,
        resale_median,
        resale_median_max_rank,
        max_mod_rank: primeItem?.max_mod_rank ?? null,
        roi,
      };
    });
    items.sort((a, b) => (b.roi ?? -Infinity) - (a.roi ?? -Infinity));
    return {
      id: v.id,
      arrival: v.arrival,
      departure: v.departure,
      relay: v.relay,
      is_special: isSpecialVisit(v.relay, rawItems.length),
      items,
    };
  });
  const now = Date.now();
  const active = result.find((v) => {
    const arr = new Date(v.arrival).getTime();
    const dep = new Date(v.departure).getTime();
    return now >= arr && now < dep;
  }) ?? null;

  return { visits: result, junkRate, activeVisit: active };
}

export interface BaroItemHistory {
  item_name: string;
  // True when the item matches a warframe.market item (tradeable); false for
  // Baro-only cosmetics, which are noise for arbitrage purposes.
  matched: boolean;
  // Costs from the most recent visit that carried the item (Baro reprices
  // rarely, so this is effectively "the" price).
  ducat_cost: number | null;
  credit_cost: number | null;
  visits: { arrival: string; visits_ago: number }[];
}

export async function getBaroItemHistory(): Promise<BaroItemHistory[]> {
  const db = getSupabase();

  const { data: allVisits } = await db
    .from("baro_visits")
    .select("id, arrival, relay")
    .order("arrival", { ascending: false });

  if (!allVisits?.length) return [];

  const visits = allVisits.filter((v) => !isSpecialVisit(v.relay, 0));

  if (!visits?.length) return [];

  const visitIds = visits.map((v) => v.id);
  const allItems = await fetchAll<{
    visit_id: number;
    item_name: string;
    item_id: string | null;
    ducat_cost: number;
    credit_cost: number;
  }>(
    (from, to) =>
      db
        .from("baro_visit_items")
        .select("visit_id, item_name, item_id, ducat_cost, credit_cost")
        .in("visit_id", visitIds)
        .order("visit_id", { ascending: true })
        .order("item_name", { ascending: true })
        .range(from, to),
  );

  if (!allItems.length) return [];

  const visitIndexMap = new Map<number, number>();
  visits.forEach((v, i) => visitIndexMap.set(v.id, i));

  const itemVisits = new Map<string, { arrival: string; visits_ago: number }[]>();
  const itemMatched = new Map<string, boolean>();
  const itemCost = new Map<string, { idx: number; ducat: number; credit: number }>();
  for (const vi of allItems) {
    const idx = visitIndexMap.get(vi.visit_id);
    if (idx === undefined) continue;
    if (!itemVisits.has(vi.item_name)) itemVisits.set(vi.item_name, []);
    itemVisits.get(vi.item_name)!.push({
      arrival: visits[idx].arrival,
      visits_ago: idx,
    });
    if (vi.item_id !== null) itemMatched.set(vi.item_name, true);
    const prev = itemCost.get(vi.item_name);
    if (!prev || idx < prev.idx) {
      itemCost.set(vi.item_name, { idx, ducat: vi.ducat_cost, credit: vi.credit_cost });
    }
  }

  const results: BaroItemHistory[] = [];
  for (const [item_name, v] of itemVisits) {
    v.sort((a, b) => a.visits_ago - b.visits_ago);
    const cost = itemCost.get(item_name);
    results.push({
      item_name,
      matched: itemMatched.get(item_name) ?? false,
      ducat_cost: cost?.ducat ?? null,
      credit_cost: cost?.credit ?? null,
      visits: v,
    });
  }
  results.sort((a, b) => a.visits[0].visits_ago - b.visits[0].visits_ago);
  return results;
}

export interface VaultEvent {
  event: "vaulted" | "unvaulted" | "resurgence";
  effective_date: string;
}

export interface ItemDetail {
  id: string;
  url_name: string;
  item_name: string;
  ducats: number | null;
  is_primed_mod: boolean;
  vaulted: boolean;
  max_mod_rank: number | null;
  stats: { stat_date: string; median: number; volume: number; mod_rank: number }[];
  vault_events: VaultEvent[];
  baro_visit_dates: string[];
  baro_special_dates: string[];
}

export async function getItemDetail(url_name: string): Promise<ItemDetail | null> {
  const db = getSupabase();

  const { data: item } = await db
    .from("prime_items")
    .select("id, url_name, item_name, ducats, is_primed_mod, vaulted, max_mod_rank")
    .eq("url_name", url_name)
    .single();

  if (!item) return null;

  const [statsResult, vaultResult, baroResult] = await Promise.all([
    db
      .from("trade_stats")
      .select("stat_date, median, volume, mod_rank")
      .eq("item_id", item.id)
      .order("stat_date", { ascending: true }),
    db
      .from("vault_events")
      .select("event, effective_date")
      .eq("item_id", item.id)
      .order("effective_date", { ascending: true }),
    db
      .from("baro_visits")
      .select("arrival, is_special")
      .order("arrival", { ascending: true }),
  ]);

  return {
    id: item.id,
    url_name: item.url_name,
    item_name: item.item_name,
    ducats: item.ducats,
    is_primed_mod: item.is_primed_mod,
    vaulted: item.vaulted,
    max_mod_rank: item.max_mod_rank,
    stats: (statsResult.data ?? []).map((s) => ({
      stat_date: s.stat_date,
      median: Number(s.median),
      volume: Number(s.volume ?? 0),
      mod_rank: s.mod_rank,
    })),
    vault_events: (vaultResult.data ?? []) as VaultEvent[],
    baro_visit_dates: (baroResult.data ?? [])
      .filter((v) => !v.is_special)
      .map((v) => v.arrival),
    baro_special_dates: (baroResult.data ?? [])
      .filter((v) => v.is_special)
      .map((v) => v.arrival),
  };
}

export interface PrimedModStats {
  item_name: string;
  url_name: string;
  item_id: string;
  stats: { stat_date: string; median: number; volume: number }[];
  vault_events: VaultEvent[];
}

export async function getPrimedModStats(): Promise<PrimedModStats[]> {
  const db = getSupabase();

  const { data: mods } = await db
    .from("prime_items")
    .select("id, item_name, url_name")
    .eq("is_primed_mod", true);

  if (!mods?.length) return [];

  const modIds = mods.map((m) => m.id);
  const allStats: { item_id: string; stat_date: string; median: number; volume: number }[] = [];
  const CHUNK = 200;
  for (let i = 0; i < modIds.length; i += CHUNK) {
    const chunk = modIds.slice(i, i + CHUNK);
    const stats = await fetchAll<(typeof allStats)[number]>((from, to) =>
      db
        .from("trade_stats")
        .select("item_id, stat_date, median, volume")
        .in("item_id", chunk)
        .eq("mod_rank", 0)
        .order("stat_date", { ascending: true })
        .order("item_id", { ascending: true })
        .range(from, to),
    );
    allStats.push(...stats);
  }

  const statsByMod = new Map<string, typeof allStats>();
  for (const s of allStats) {
    if (!statsByMod.has(s.item_id)) statsByMod.set(s.item_id, []);
    statsByMod.get(s.item_id)!.push(s);
  }

  const allVaultEvents: { item_id: string; event: string; effective_date: string }[] = [];
  for (let i = 0; i < modIds.length; i += CHUNK) {
    const chunk = modIds.slice(i, i + CHUNK);
    const { data: ve } = await db
      .from("vault_events")
      .select("item_id, event, effective_date")
      .in("item_id", chunk)
      .order("effective_date", { ascending: true });
    if (ve) allVaultEvents.push(...(ve as typeof allVaultEvents));
  }

  const vaultByMod = new Map<string, VaultEvent[]>();
  for (const v of allVaultEvents) {
    if (!vaultByMod.has(v.item_id)) vaultByMod.set(v.item_id, []);
    vaultByMod.get(v.item_id)!.push({
      event: v.event as VaultEvent["event"],
      effective_date: v.effective_date,
    });
  }

  return mods
    .map((m) => ({
      item_name: m.item_name,
      url_name: m.url_name,
      item_id: m.id,
      stats: (statsByMod.get(m.id) ?? []).map((s) => ({
        stat_date: s.stat_date,
        median: Number(s.median),
        volume: Number(s.volume ?? 0),
      })),
      vault_events: vaultByMod.get(m.id) ?? [],
    }))
    .filter((m) => m.stats.length > 0);
}

// ── Positions (M13) ────────────────────────────────────────────────

export interface Position {
  id: number;
  item_id: string;
  item_name: string;
  url_name: string;
  qty: number;
  cost_ducats: number;
  cost_credits: number;
  junk_rate_at_buy: number;
  baseline_at_buy: number;
  target_price: number;
  acquired_at: string;
  status: "open" | "closed";
  closed_price: number | null;
  closed_at: string | null;
  current_median: number | null;
  days_held: number;
  unrealized_pnl: number | null;
  realized_pnl: number | null;
  distance_to_target: number | null;
}

export async function getPositions(status: "open" | "closed" = "open"): Promise<Position[]> {
  const db = getSupabase();

  const { data: rows } = await db
    .from("positions")
    .select(`
      id, item_id, qty, cost_ducats, cost_credits,
      junk_rate_at_buy, baseline_at_buy, target_price,
      acquired_at, status, closed_price, closed_at,
      prime_items!inner(item_name, url_name)
    `)
    .eq("status", status)
    .order("acquired_at", { ascending: false });

  if (!rows?.length) return [];

  const itemIds = [...new Set(rows.map((r) => r.item_id as string))];
  const medianMap = new Map<string, number>();
  const CHUNK = 200;

  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK);
    const { data: stats } = await db
      .from("trade_stats")
      .select("item_id, median")
      .in("item_id", chunk)
      .eq("mod_rank", 0)
      .order("stat_date", { ascending: false });

    if (stats) {
      for (const s of stats as { item_id: string; median: number }[]) {
        if (!medianMap.has(s.item_id) && s.median > 0) {
          medianMap.set(s.item_id, Number(s.median));
        }
      }
    }
  }

  const now = Date.now();

  return rows.map((r) => {
    const pi = r.prime_items as unknown as { item_name: string; url_name: string };
    const currentMedian = medianMap.get(r.item_id as string) ?? null;
    const costPlat = (r.cost_ducats as number) * Number(r.junk_rate_at_buy);
    const daysHeld = Math.floor(
      (now - new Date(r.acquired_at as string).getTime()) / 86_400_000,
    );

    let unrealizedPnl: number | null = null;
    let distanceToTarget: number | null = null;
    if (currentMedian !== null) {
      unrealizedPnl = (currentMedian - costPlat) * (r.qty as number);
      distanceToTarget = (r.target_price as number) - currentMedian;
    }

    let realizedPnl: number | null = null;
    if (r.closed_price !== null) {
      realizedPnl = (Number(r.closed_price) - costPlat) * (r.qty as number);
    }

    return {
      id: r.id as number,
      item_id: r.item_id as string,
      item_name: pi.item_name,
      url_name: pi.url_name,
      qty: r.qty as number,
      cost_ducats: r.cost_ducats as number,
      cost_credits: r.cost_credits as number,
      junk_rate_at_buy: Number(r.junk_rate_at_buy),
      baseline_at_buy: Number(r.baseline_at_buy),
      target_price: Number(r.target_price),
      acquired_at: r.acquired_at as string,
      status: r.status as "open" | "closed",
      closed_price: r.closed_price !== null ? Number(r.closed_price) : null,
      closed_at: r.closed_at as string | null,
      current_median: currentMedian,
      days_held: daysHeld,
      unrealized_pnl: unrealizedPnl,
      realized_pnl: realizedPnl,
      distance_to_target: distanceToTarget,
    };
  });
}

// ── Baro Hold Advisor (M12) ─────────────────────────────────────────

export type MaturityStage = "A" | "B" | "C";

export interface AdvisorModResult {
  itemName: string;
  urlName: string | null;
  itemId: string | null;
  ducatCost: number;
  creditCost: number;
  resaleMedian: number | null;
  baseline: number | null;
  sellNowProfit: number;
  holdProfit: number | null;
  holdDays: number | null;
  profitPerDay: number | null;
  profitPerDucat: number;
  verdict: import("./metrics").Verdict;
  restockRisk: boolean;
  restockIntervalDays: number | null;
  n: number;
  stage: MaturityStage;
  stageLabel: string;
  baselineDrift: { drift: number; shortBaseline: number; longBaseline: number } | null;
}

export interface AdvisorData {
  mods: AdvisorModResult[];
  isSpecialVisit: boolean;
  isTennoConWindow: boolean;
  archiveMonths: number;
}

export async function getBaroAdvisorData(): Promise<AdvisorData | null> {
  const db = getSupabase();
  const junkRate = await computeJunkRate();

  // 1. Get all visits (chronological, newest first)
  const { data: allVisitsRaw } = await db
    .from("baro_visits")
    .select("id, arrival, departure, relay")
    .order("arrival", { ascending: false });

  if (!allVisitsRaw?.length) return null;

  // Fetch item counts per visit to compute is_special
  const visitIdList = (allVisitsRaw as { id: number }[]).map((v) => v.id);
  const visitItemCounts = new Map<number, number>();
  const itemCountRows = await fetchAll<{ visit_id: number }>((from, to) =>
    db
      .from("baro_visit_items")
      .select("visit_id")
      .in("visit_id", visitIdList)
      .order("visit_id", { ascending: true })
      .range(from, to),
  );
  for (const r of itemCountRows) {
    visitItemCounts.set(r.visit_id, (visitItemCounts.get(r.visit_id) ?? 0) + 1);
  }

  const allVisits = (allVisitsRaw as {
    id: number; arrival: string; departure: string;
    relay: string | null;
  }[]).map((v) => ({
    ...v,
    is_special: isSpecialVisit(v.relay, visitItemCounts.get(v.id) ?? 0),
  }));

  // Find active visit
  const now = Date.now();
  const activeVisit = allVisits.find((v) => {
    const arr = new Date(v.arrival).getTime();
    const dep = new Date(v.departure).getTime();
    return now >= arr && now < dep;
  });
  if (!activeVisit) return null;

  // 2. Get active visit items
  const { data: activeItems } = await db
    .from("baro_visit_items")
    .select("item_name, ducat_cost, credit_cost, item_id")
    .eq("visit_id", activeVisit.id);

  if (!activeItems?.length) return null;

  const visitItems = activeItems as {
    item_name: string; ducat_cost: number; credit_cost: number;
    item_id: string | null;
  }[];

  // Filter to primed mods
  const primedItemIds = visitItems
    .filter((vi) => vi.item_id !== null)
    .map((vi) => vi.item_id!);

  if (primedItemIds.length === 0) return null;

  const primeItemMap = new Map<string, { is_primed_mod: boolean; url_name: string }>();
  const CHUNK = 200;
  for (let i = 0; i < primedItemIds.length; i += CHUNK) {
    const chunk = primedItemIds.slice(i, i + CHUNK);
    const { data: items } = await db
      .from("prime_items")
      .select("id, is_primed_mod, url_name")
      .in("id", chunk);
    if (items) for (const it of items) {
      primeItemMap.set(it.id, { is_primed_mod: it.is_primed_mod, url_name: it.url_name });
    }
  }

  const primedMods = visitItems.filter((vi) => {
    const pi = vi.item_id ? primeItemMap.get(vi.item_id) : null;
    return pi?.is_primed_mod === true;
  });

  if (primedMods.length === 0) return null;

  // 3. Get all baro_visit_items to find restock events per mod
  const nonSpecialVisits = allVisits.filter((v) => !v.is_special);
  const nonSpecialIds = nonSpecialVisits.map((v) => v.id);

  const allBaroItems = await fetchAll<{ visit_id: number; item_id: string | null }>(
    (from, to) =>
      db
        .from("baro_visit_items")
        .select("visit_id, item_id")
        .in("visit_id", nonSpecialIds)
        .order("visit_id", { ascending: true })
        .order("item_id", { ascending: true })
        .range(from, to),
  );

  // Map: item_id → list of visit indices (0 = most recent non-special)
  const visitIndexMap = new Map<number, number>();
  nonSpecialVisits.forEach((v, i) => visitIndexMap.set(v.id, i));

  const restockMap = new Map<string, number[]>();
  for (const bi of allBaroItems) {
    if (!bi.item_id) continue;
    const idx = visitIndexMap.get(bi.visit_id);
    if (idx === undefined) continue;
    if (!restockMap.has(bi.item_id)) restockMap.set(bi.item_id, []);
    restockMap.get(bi.item_id)!.push(idx);
  }

  // 4. Get full rank-0 price history for all primed mods in this visit
  const primedModIds = primedMods
    .map((m) => m.item_id)
    .filter((id): id is string => id !== null);

  const priceHistory = new Map<string, DailyPrice[]>();
  for (let i = 0; i < primedModIds.length; i += CHUNK) {
    const chunk = primedModIds.slice(i, i + CHUNK);
    const stats = await fetchAll<{
      item_id: string; stat_date: string; median: number;
    }>((from, to) =>
      db
        .from("trade_stats")
        .select("item_id, stat_date, median")
        .in("item_id", chunk)
        .eq("mod_rank", 0)
        .order("stat_date", { ascending: true })
        .order("item_id", { ascending: true })
        .range(from, to),
    );
    for (const s of stats) {
      if (!priceHistory.has(s.item_id)) priceHistory.set(s.item_id, []);
      priceHistory.get(s.item_id)!.push({
        date: s.stat_date,
        median: Number(s.median),
      });
    }
  }

  // 5. Compute archive span
  let earliestDate: string | null = null;
  for (const [, prices] of priceHistory) {
    if (prices.length > 0 && (!earliestDate || prices[0].date < earliestDate)) {
      earliestDate = prices[0].date;
    }
  }
  const archiveMonths = earliestDate
    ? Math.floor(
        (now - new Date(earliestDate).getTime()) / (30.44 * 86_400_000),
      )
    : 0;

  // 6. Build recovery series for ALL (mod, restock) pairs
  const allRecoverySeries: NormalizedPoint[][] = [];
  const perModSeries = new Map<string, NormalizedPoint[][]>();

  for (const modId of primedModIds) {
    const prices = priceHistory.get(modId) ?? [];
    const restockVisitIndices = restockMap.get(modId) ?? [];
    const modSeries: NormalizedPoint[][] = [];

    for (const visitIdx of restockVisitIndices) {
      const visit = nonSpecialVisits[visitIdx];
      if (!visit) continue;

      const baseline = computeBaseline(prices, visit.arrival);
      if (baseline === null) continue;

      const series = buildRecoverySeries(prices, visit.departure, baseline);
      if (series.length === 0) continue;

      modSeries.push(series);
      allRecoverySeries.push(series);
    }

    if (modSeries.length > 0) {
      perModSeries.set(modId, modSeries);
    }
  }

  const pooledCurve = poolMedianCurve(allRecoverySeries);
  const pooledRecoveryDays = extractRecoveryDays(pooledCurve);

  // 7. TennoCon window detection
  const specialVisitDates = allVisits
    .filter((v) => v.is_special)
    .map((v) => v.arrival);
  const isTennoConWindow = isInTennoConWindow(
    specialVisitDates,
    new Date().toISOString(),
  );

  // 8. Compute advisor result per primed mod
  const results: AdvisorModResult[] = [];

  for (const mod of primedMods) {
    const pi = mod.item_id ? primeItemMap.get(mod.item_id) : null;
    const prices = mod.item_id ? (priceHistory.get(mod.item_id) ?? []) : [];
    const latestPrice = prices.length > 0 ? prices[prices.length - 1].median : null;

    const sellNowProfit =
      latestPrice !== null
        ? computeBaroRoi(latestPrice, mod.ducat_cost, junkRate)
        : 0;

    const baseline = computeBaseline(prices, activeVisit.arrival);

    const holdProfit =
      baseline !== null
        ? 0.95 * baseline - mod.ducat_cost * junkRate
        : null;

    // Stage resolution
    const modN = mod.item_id
      ? (perModSeries.get(mod.item_id)?.length ?? 0)
      : 0;

    let stage: MaturityStage = "A";
    let stageLabel = "generic estimate";
    let recoveryDays: number | null = pooledRecoveryDays;

    if (modN >= 3 && mod.item_id) {
      stage = "B";
      stageLabel = `per-mod estimate, n=${modN}`;
      const modCurve = poolMedianCurve(perModSeries.get(mod.item_id)!);
      recoveryDays = extractRecoveryDays(modCurve);
    }

    if (archiveMonths >= 12) {
      stage = modN >= 3 ? "B" : "A";
      if (modN >= 3) stageLabel = `per-mod estimate, n=${modN}`;
    }

    // Restock interval
    const restockIndices = mod.item_id
      ? (restockMap.get(mod.item_id) ?? [])
      : [];
    const restockIntervalVisits = computeRestockInterval(restockIndices);
    const restockIntervalDays =
      restockIntervalVisits !== null
        ? Math.round(restockIntervalVisits * BARO_CYCLE_DAYS)
        : null;
    const restockRisk =
      restockIntervalDays !== null &&
      recoveryDays !== null &&
      restockIntervalDays < recoveryDays;

    // Baseline drift (Stage C)
    let baselineDrift: AdvisorModResult["baselineDrift"] = null;
    if (archiveMonths >= 12 && prices.length > 0) {
      stage = modN >= 3 ? "C" : "A";
      if (stage === "C") stageLabel = `per-mod estimate, n=${modN}`;
      baselineDrift = computeBaselineDrift(prices, activeVisit.arrival);
    }

    // Verdict
    const verdictResult = computeAdvisorVerdict(
      sellNowProfit,
      modN >= 3 || allRecoverySeries.length > 0 ? holdProfit : null,
      modN >= 3 || allRecoverySeries.length > 0 ? recoveryDays : null,
      mod.ducat_cost,
    );

    results.push({
      itemName: mod.item_name,
      urlName: pi?.url_name ?? null,
      itemId: mod.item_id,
      ducatCost: mod.ducat_cost,
      creditCost: mod.credit_cost,
      resaleMedian: latestPrice,
      baseline,
      sellNowProfit,
      holdProfit,
      holdDays: recoveryDays,
      profitPerDay: verdictResult.profitPerDay,
      profitPerDucat: verdictResult.profitPerDucat,
      verdict: verdictResult.verdict,
      restockRisk,
      restockIntervalDays,
      n: modN,
      stage,
      stageLabel,
      baselineDrift,
    });
  }

  results.sort((a, b) => b.profitPerDucat - a.profitPerDucat);

  return {
    mods: results,
    isSpecialVisit: activeVisit.is_special,
    isTennoConWindow,
    archiveMonths,
  };
}
