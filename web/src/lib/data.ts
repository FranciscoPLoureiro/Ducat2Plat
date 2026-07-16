import { getSupabase } from "./supabase";
import {
  computeBaroRoi,
  isSpecialVisit,
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
  const { data: visits } = await db
    .from("baro_visits")
    .select("arrival, departure, relay")
    .order("arrival", { ascending: false })
    .limit(1)
    .single();

  if (!visits) return { daysUntil: null, active: false, relay: null, arrival: null, departure: null };

  const now = Date.now();
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
  }[];
  total_ducats: number;
  total_plat: number;
  combined_ppd: number;
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
      });
    }
  }

  const results: BundleSeller[] = [];
  for (const [seller_name, items] of sellerItems) {
    if (items.length < 2) continue;
    const total_ducats = items.reduce((s, i) => s + i.ducats, 0);
    const total_plat = items.reduce((s, i) => s + i.price, 0);
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

  const primeItemMap = new Map<string, { url_name: string; is_primed_mod: boolean }>();
  if (itemIds.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < itemIds.length; i += CHUNK) {
      const chunk = itemIds.slice(i, i + CHUNK);
      const { data: items } = await db
        .from("prime_items")
        .select("id, url_name, is_primed_mod")
        .in("id", chunk);
      if (items) {
        for (const it of items) {
          primeItemMap.set(it.id, { url_name: it.url_name, is_primed_mod: it.is_primed_mod });
        }
      }
    }
  }

  const primedModIds = [...primeItemMap.entries()]
    .filter(([, v]) => v.is_primed_mod)
    .map(([id]) => id);

  const resaleMap = new Map<string, number>();
  if (primedModIds.length > 0) {
    const resaleCutoff = daysAgoDate(RESALE_WINDOW_DAYS);
    const CHUNK = 200;
    for (let i = 0; i < primedModIds.length; i += CHUNK) {
      const chunk = primedModIds.slice(i, i + CHUNK);
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
  const allItems = await fetchAll<{ visit_id: number; item_name: string }>(
    (from, to) =>
      db
        .from("baro_visit_items")
        .select("visit_id, item_name")
        .in("visit_id", visitIds)
        .order("visit_id", { ascending: true })
        .order("item_name", { ascending: true })
        .range(from, to),
  );

  if (!allItems.length) return [];

  const visitIndexMap = new Map<number, number>();
  visits.forEach((v, i) => visitIndexMap.set(v.id, i));

  const itemVisits = new Map<string, { arrival: string; visits_ago: number }[]>();
  for (const vi of allItems) {
    const idx = visitIndexMap.get(vi.visit_id);
    if (idx === undefined) continue;
    if (!itemVisits.has(vi.item_name)) itemVisits.set(vi.item_name, []);
    itemVisits.get(vi.item_name)!.push({
      arrival: visits[idx].arrival,
      visits_ago: idx,
    });
  }

  const results: BaroItemHistory[] = [];
  for (const [item_name, v] of itemVisits) {
    v.sort((a, b) => a.visits_ago - b.visits_ago);
    results.push({ item_name, visits: v });
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
      .select("arrival")
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
    baro_visit_dates: (baroResult.data ?? []).map((v) => v.arrival),
  };
}

export interface PrimedModStats {
  item_name: string;
  url_name: string;
  item_id: string;
  stats: { stat_date: string; median: number; volume: number }[];
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
    }))
    .filter((m) => m.stats.length > 0);
}
