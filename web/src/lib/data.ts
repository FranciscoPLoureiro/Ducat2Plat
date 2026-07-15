import { getSupabase } from "./supabase";

const VELOCITY_DAYS = 14;
const VELOCITY_LIQUID = 15;
const PPD_N = 6;

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
