import { getSupabase } from "./supabase";

const VELOCITY_DAYS = 14;
const VELOCITY_LIQUID = 15;
const PPD_N = 6;
const DEFAULT_JUNK_RATE = 0.35;

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

export interface StalenessInfo {
  stale: boolean;
  hoursAgo: number | null;
}

export interface BaroCountdown {
  daysUntil: number | null;
  active: boolean;
  relay: string | null;
  arrival: string | null;
  departure: string | null;
}

export async function getStaleness(): Promise<StalenessInfo> {
  const db = getSupabase();
  const { data } = await db
    .from("heartbeat")
    .select("updated_at")
    .eq("id", 1)
    .single();

  if (!data) return { stale: true, hoursAgo: null };

  const hoursAgo =
    (Date.now() - new Date(data.updated_at).getTime()) / (1000 * 60 * 60);
  return { stale: hoursAgo > 36, hoursAgo: Math.round(hoursAgo) };
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

  const { data: items } = await db
    .from("prime_items")
    .select("id, url_name, item_name, ducats")
    .not("ducats", "is", null);

  if (!items?.length) return [];

  const itemIds = items.map((i) => i.id);

  const allStats: Array<{
    item_id: string;
    stat_date: string;
    median: number;
    volume: number;
    mod_rank: number;
  }> = [];
  const CHUNK = 200;
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK);
    const { data: statsRows } = await db
      .from("trade_stats")
      .select("item_id, stat_date, median, volume, mod_rank")
      .in("item_id", chunk)
      .eq("mod_rank", -1)
      .order("stat_date", { ascending: false });
    if (statsRows) allStats.push(...statsRows);
  }

  const latestMedian = new Map<string, number>();
  const volumeByItem = new Map<string, number[]>();

  for (const row of allStats) {
    if (!latestMedian.has(row.item_id) && row.median > 0) {
      latestMedian.set(row.item_id, Number(row.median));
    }
    if (!volumeByItem.has(row.item_id)) volumeByItem.set(row.item_id, []);
    volumeByItem.get(row.item_id)!.push(Number(row.volume ?? 0));
  }

  const allOrders: Array<{
    item_id: string;
    price: number;
    quantity: number;
    mod_rank: number | null;
    seller_name: string;
  }> = [];
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK);
    const { data: orderRows } = await db
      .from("order_snapshots")
      .select("item_id, price, quantity, mod_rank, seller_name")
      .eq("sweep_id", sweepId)
      .in("item_id", chunk)
      .order("price", { ascending: true });
    if (orderRows) allOrders.push(...orderRows);
  }

  const ordersByItem = new Map<string, typeof allOrders>();
  for (const o of allOrders) {
    if (!ordersByItem.has(o.item_id)) ordersByItem.set(o.item_id, []);
    ordersByItem.get(o.item_id)!.push(o);
  }

  const results: RankedItem[] = [];

  for (const item of items) {
    const median = latestMedian.get(item.id);
    if (!median || median <= 0) continue;

    const ducats = item.ducats as number;
    const ppd = ducats / median;

    const volumes = (volumeByItem.get(item.id) ?? []).slice(0, VELOCITY_DAYS);
    const velocity =
      volumes.length > 0
        ? volumes.reduce((a, b) => a + b, 0) / volumes.length
        : 0;

    const orders = ordersByItem.get(item.id) ?? [];
    let ppd_at_n: number | null = null;
    let shallow = false;

    if (orders.length > 0) {
      let cumQty = 0;
      let cumCost = 0;
      for (const o of orders) {
        const take = Math.min(o.quantity, PPD_N - cumQty);
        cumCost += o.price * take;
        cumQty += take;
        if (cumQty >= PPD_N) break;
      }
      if (cumQty >= PPD_N) {
        ppd_at_n = (ducats * PPD_N) / cumCost;
      } else {
        ppd_at_n = cumQty > 0 ? (ducats * cumQty) / cumCost : null;
        shallow = true;
      }
    }

    const effectivePpd = ppd_at_n ?? ppd;
    const score = effectivePpd * Math.min(1, velocity / VELOCITY_LIQUID);

    results.push({
      id: item.id,
      url_name: item.url_name,
      item_name: item.item_name,
      ducats,
      median: Math.round(median * 100) / 100,
      ppd: Math.round(ppd * 1000) / 1000,
      ppd_at_n: ppd_at_n !== null ? Math.round(ppd_at_n * 1000) / 1000 : null,
      velocity: Math.round(velocity * 10) / 10,
      score: Math.round(score * 1000) / 1000,
      shallow,
      orders: orders.map((o) => ({
        price: o.price,
        quantity: o.quantity,
        mod_rank: o.mod_rank,
        seller_name: o.seller_name,
      })),
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
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

  const { data: orders } = await db
    .from("order_snapshots")
    .select("item_id, price, quantity, seller_name")
    .eq("sweep_id", sweepId)
    .order("price", { ascending: true });

  if (!orders?.length) return [];

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

export async function getBaroVisits(): Promise<BaroVisit[]> {
  const db = getSupabase();

  const { data: visits } = await db
    .from("baro_visits")
    .select("id, arrival, departure, relay")
    .order("arrival", { ascending: false })
    .limit(20);

  if (!visits?.length) return [];

  const visitIds = visits.map((v) => v.id);
  const { data: visitItems } = await db
    .from("baro_visit_items")
    .select("visit_id, item_name, ducat_cost, credit_cost, item_id")
    .in("visit_id", visitIds);

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
    const CHUNK = 200;
    for (let i = 0; i < primedModIds.length; i += CHUNK) {
      const chunk = primedModIds.slice(i, i + CHUNK);
      const { data: stats } = await db
        .from("trade_stats")
        .select("item_id, median, stat_date")
        .in("item_id", chunk)
        .eq("mod_rank", 0)
        .order("stat_date", { ascending: false });
      if (stats) {
        for (const s of stats) {
          if (!resaleMap.has(s.item_id) && s.median > 0) {
            resaleMap.set(s.item_id, Number(s.median));
          }
        }
      }
    }
  }

  const visitItemsByVisit = new Map<number, typeof visitItems>();
  for (const vi of visitItems ?? []) {
    if (!visitItemsByVisit.has(vi.visit_id)) visitItemsByVisit.set(vi.visit_id, []);
    visitItemsByVisit.get(vi.visit_id)!.push(vi);
  }

  return visits.map((v) => {
    const rawItems = visitItemsByVisit.get(v.id) ?? [];
    const items: BaroVisitItem[] = rawItems.map((vi) => {
      const primeItem = vi.item_id ? primeItemMap.get(vi.item_id) : null;
      const is_primed_mod = primeItem?.is_primed_mod ?? false;
      const resale_median = vi.item_id ? (resaleMap.get(vi.item_id) ?? null) : null;
      const roi =
        is_primed_mod && resale_median !== null
          ? resale_median - vi.ducat_cost / DEFAULT_JUNK_RATE
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
      items,
    };
  });
}

export interface BaroItemHistory {
  item_name: string;
  visits: { arrival: string; visits_ago: number }[];
}

export async function getBaroItemHistory(): Promise<BaroItemHistory[]> {
  const db = getSupabase();

  const { data: visits } = await db
    .from("baro_visits")
    .select("id, arrival")
    .order("arrival", { ascending: false });

  if (!visits?.length) return [];

  const visitIds = visits.map((v) => v.id);
  const { data: allItems } = await db
    .from("baro_visit_items")
    .select("visit_id, item_name")
    .in("visit_id", visitIds);

  if (!allItems?.length) return [];

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
    const { data: stats } = await db
      .from("trade_stats")
      .select("item_id, stat_date, median, volume")
      .in("item_id", chunk)
      .eq("mod_rank", 0)
      .order("stat_date", { ascending: true });
    if (stats) allStats.push(...stats);
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
