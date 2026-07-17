import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  WfmItemsResponseSchema,
  WfmStatisticsResponseSchema,
  WfmOrdersResponseSchema,
  VoidTraderResponseSchema,
} from "./wfm-schemas";
import {
  computePpdAtN,
  computeVelocity,
  computeJunkRateFromRanked,
  VELOCITY_DAYS,
  VELOCITY_LIQUID,
  PPD_N,
} from "../shared/metrics";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const WFM_V1 = "https://api.warframe.market/v1";
const WFM_V2 = "https://api.warframe.market/v2";
const RATE_MS = 400; // 2.5 req/s
let lastReq = 0;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function wfmFetch(url: string): Promise<unknown> {
  const gap = RATE_MS - (Date.now() - lastReq);
  if (gap > 0) await sleep(gap);
  lastReq = Date.now();

  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Platform: "pc",
        Language: "en",
        "User-Agent": "Ducat2Plat/1.0 (+https://github.com/FranciscoPLoureiro/Ducat2Plat)",
      },
    });

    if (res.status === 429 || res.status === 503) {
      if (attempt < 5) {
        const delay = 1000 * 2 ** (attempt - 1);
        console.warn(
          `  ${res.status} on ${url}, backoff ${delay}ms (${attempt}/5)`,
        );
        await sleep(delay);
        lastReq = Date.now();
        continue;
      }
      throw new Error(`${res.status} after 5 attempts: ${url}`);
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.json();
  }
}

// Step 1
async function openSweep(): Promise<number> {
  const { data, error } = await db
    .from("sweeps")
    .insert({})
    .select("id")
    .single();
  if (error || !data) throw new Error(`Open sweep: ${error?.message}`);
  return (data as { id: number }).id;
}

// Step 2 — v2 /items includes ducats/tags/maxRank inline, no detail calls needed
async function syncCatalog(): Promise<{
  total: number;
  ok: number;
  failed: number;
}> {
  const rawJson = await wfmFetch(`${WFM_V2}/items`);
  const parsed = WfmItemsResponseSchema.safeParse(rawJson);
  if (!parsed.success) {
    console.warn(
      `Items API schema validation failed: ${parsed.error.issues[0]?.message}`,
    );
    return { total: 0, ok: 0, failed: 0 };
  }
  const apiItems = parsed.data.data;
  console.log(`API: ${apiItems.length} items`);

  const known = new Set<string>();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await db
      .from("prime_items")
      .select("url_name")
      .range(from, from + PAGE - 1);
    const rows = (data ?? []) as { url_name: string }[];
    if (!rows.length) break;
    for (const r of rows) known.add(r.url_name);
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  const fresh = apiItems.filter((i) => !known.has(i.slug));
  console.log(`${fresh.length} new items to insert`);

  let ok = 0;
  let failed = 0;
  const now = new Date().toISOString();

  const BATCH = 100;
  for (let i = 0; i < fresh.length; i += BATCH) {
    const batch = fresh.slice(i, i + BATCH);
    const mapped = batch.map((item) => {
      const name: string = item.i18n?.en?.name ?? item.slug;
      const tags: string[] = item.tags;
      const isPrimed = tags.includes("primed") || name.startsWith("Primed ");
      return {
        wfm_id: item.id,
        url_name: item.slug,
        item_name: name,
        ducats: item.ducats ?? null,
        is_primed_mod: isPrimed,
        max_mod_rank: item.maxRank ?? null,
        tags,
        last_seen_at: now,
      };
    });

    const { error } = await db
      .from("prime_items")
      .upsert(mapped, { onConflict: "url_name" });
    if (error) {
      console.warn(`  Batch insert error: ${error.message}`);
      failed += batch.length;
    } else {
      ok += batch.length;
    }
  }

  // Update last_seen_at for existing items
  const existing = apiItems
    .filter((i) => known.has(i.slug))
    .map((i) => i.slug);
  const CHUNK = 500;
  for (let i = 0; i < existing.length; i += CHUNK) {
    await db
      .from("prime_items")
      .update({ last_seen_at: now })
      .in("url_name", existing.slice(i, i + CHUNK));
  }

  return { total: apiItems.length, ok, failed };
}

// Step 3 — v1 statistics endpoint still works
async function fetchStats(
  sweepId: number,
): Promise<{ ok: number; failed: number }> {
  const { data, error } = await db
    .from("prime_items")
    .select("id, url_name")
    .or("ducats.not.is.null,is_primed_mod.eq.true");

  if (error) throw new Error(`Query items: ${error.message}`);
  const items = (data ?? []) as { id: string; url_name: string }[];
  if (!items.length) {
    console.log("No trackable items");
    return { ok: 0, failed: 0 };
  }

  console.log(`Fetching stats for ${items.length} items`);
  let ok = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const rawJson = await wfmFetch(
        `${WFM_V1}/items/${item.url_name}/statistics`,
      );
      const parsed = WfmStatisticsResponseSchema.safeParse(rawJson);
      if (!parsed.success) {
        console.warn(
          `  ${item.url_name}: schema validation: ${parsed.error.issues[0]?.message}`,
        );
        failed++;
        continue;
      }
      const closed = parsed.data.payload.statistics_closed["90days"];
      if (!closed.length) {
        ok++;
        continue;
      }

      const rows = closed.map((r) => ({
        item_id: item.id,
        stat_date: r.datetime.slice(0, 10),
        mod_rank: r.mod_rank ?? -1,
        volume: r.volume,
        median: r.median,
        avg_price: r.avg_price,
        min_price: r.min_price,
        max_price: r.max_price,
        sweep_id: sweepId,
      }));

      if (rows.length) {
        const { error: err } = await db
          .from("trade_stats")
          .upsert(rows, { onConflict: "item_id,stat_date,mod_rank" });
        if (err) {
          console.warn(`  ${item.url_name}: stats upsert: ${err.message}`);
          failed++;
          continue;
        }
      }
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ${item.url_name}: stats: ${msg}`);
      failed++;
    }
  }

  return { ok, failed };
}

// Step 4 — Order depth for top-60 candidates by preliminary PpD
async function fetchOrderDepth(
  sweepId: number,
): Promise<{ ok: number; failed: number }> {
  const { data: rawItemsData, error: qErr } = await db
    .from("prime_items")
    .select("id, url_name, ducats")
    .not("ducats", "is", null);
  if (qErr || !rawItemsData?.length) {
    console.log("No candidates for order depth");
    return { ok: 0, failed: 0 };
  }
  const rawItems = rawItemsData as { id: string; url_name: string; ducats: number }[];

  const itemIds = rawItems.map((i) => i.id);
  const ppds: { id: string; url_name: string; ducats: number; ppd: number }[] =
    [];

  const CHUNK = 200;
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK);
    const { data: statsRows } = await db
      .from("trade_stats")
      .select("item_id, median")
      .in("item_id", chunk)
      .eq("mod_rank", -1)
      .order("stat_date", { ascending: false });

    if (statsRows) {
      const typed = statsRows as { item_id: string; median: number }[];
      const seen = new Set<string>();
      for (const row of typed) {
        if (seen.has(row.item_id)) continue;
        seen.add(row.item_id);
        const item = rawItems.find((r) => r.id === row.item_id);
        if (item && row.median && row.median > 0) {
          ppds.push({
            id: item.id,
            url_name: item.url_name,
            ducats: item.ducats,
            ppd: item.ducats / Number(row.median),
          });
        }
      }
    }
  }

  ppds.sort((a, b) => b.ppd - a.ppd);
  const candidates = ppds.slice(0, 60);

  console.log(`Fetching orders for ${candidates.length} top candidates`);
  let ok = 0;
  let failed = 0;

  for (const item of candidates) {
    try {
      const rawJson = await wfmFetch(
        `${WFM_V2}/orders/item/${item.url_name}`,
      );
      const parsed = WfmOrdersResponseSchema.safeParse(rawJson);
      if (!parsed.success) {
        console.warn(
          `  ${item.url_name}: orders schema validation: ${parsed.error.issues[0]?.message}`,
        );
        failed++;
        continue;
      }
      const orders = parsed.data.data;

      const ingameSells = orders
        .filter((o) => o.type === "sell" && o.user.status === "ingame")
        .sort((a, b) => a.platinum - b.platinum)
        .slice(0, 20);

      if (ingameSells.length) {
        const rows = ingameSells.map((o) => ({
          sweep_id: sweepId,
          item_id: item.id,
          price: o.platinum,
          quantity: o.quantity,
          mod_rank: o.modRank ?? null,
          seller_name: o.user.ingameName,
          seller_status: "ingame",
        }));

        const { error: insErr } = await db
          .from("order_snapshots")
          .insert(rows);
        if (insErr) {
          console.warn(`  ${item.url_name}: order insert: ${insErr.message}`);
          failed++;
          continue;
        }
      }
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ${item.url_name}: orders: ${msg}`);
      failed++;
    }
  }

  return { ok, failed };
}

// Step 5 — Baro Ki'Teer
async function fetchBaro(): Promise<void> {
  const BARO_URL = "https://api.warframestat.us/pc/voidTrader";
  let rawBaroData: unknown;
  try {
    const res = await fetch(BARO_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Ducat2Plat/1.0 (+https://github.com/FranciscoPLoureiro/Ducat2Plat)",
      },
    });
    if (!res.ok) {
      console.warn(`Baro API returned ${res.status}`);
      return;
    }
    rawBaroData = await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Baro fetch failed: ${msg}`);
    return;
  }

  const baroParsed = VoidTraderResponseSchema.safeParse(rawBaroData);
  if (!baroParsed.success) {
    console.warn(
      `Baro API schema validation failed: ${baroParsed.error.issues[0]?.message}`,
    );
    return;
  }
  const baro = baroParsed.data;

  const arrival = baro.activation;
  const departure = baro.expiry;
  const relay = baro.location ?? null;
  const now = Date.now();
  const isActive =
    baro.active === true ||
    (new Date(arrival).getTime() <= now && now < new Date(departure).getTime());

  const isSpecial = relay !== null && /tennocon/i.test(relay);

  // Upsert visit keyed on arrival
  const visitPayload: Record<string, unknown> = { arrival, departure, relay };
  if (isSpecial) visitPayload.is_special = true;

  const { data: visitRow, error: visitErr } = await db
    .from("baro_visits")
    .upsert(visitPayload, { onConflict: "arrival" })
    .select("id")
    .single();

  if (visitErr || !visitRow) {
    console.warn(`Baro visit upsert: ${visitErr?.message}`);
    return;
  }

  const visitId = (visitRow as { id: number }).id;
  console.log(`Baro visit #${visitId} (active=${isActive}, relay=${relay})`);

  // If active and has inventory, upsert items
  const inventory = baro.inventory;
  if (!isActive || !inventory.length) {
    console.log(`Baro: ${isActive ? "active but no inventory" : "not active"}`);
    return;
  }

  console.log(`Baro: ${inventory.length} items in inventory`);

  // Get all prime_items for case-insensitive matching
  const allItems: { id: string; item_name: string }[] = [];
  let dbFrom = 0;
  const PAGE = 1000;
  while (true) {
    const { data: page } = await db
      .from("prime_items")
      .select("id, item_name")
      .range(dbFrom, dbFrom + PAGE - 1);
    const rows = (page ?? []) as { id: string; item_name: string }[];
    if (!rows.length) break;
    for (const r of rows) allItems.push(r);
    if (rows.length < PAGE) break;
    dbFrom += PAGE;
  }

  const nameLookup = new Map<string, string>();
  for (const item of allItems) {
    nameLookup.set(item.item_name.toLowerCase(), item.id);
  }

  const rows = inventory.map((inv) => {
    const matchedId = nameLookup.get(inv.item.toLowerCase()) ?? null;
    return {
      visit_id: visitId,
      item_id: matchedId,
      item_name: inv.item,
      ducat_cost: inv.ducats,
      credit_cost: inv.credits,
    };
  });

  const { error: itemsErr } = await db
    .from("baro_visit_items")
    .upsert(rows, { onConflict: "visit_id,item_name" });

  if (itemsErr) {
    console.warn(`Baro items upsert: ${itemsErr.message}`);
  } else {
    console.log(`Baro: ${rows.length} items upserted`);
  }

  if (!isSpecial && rows.length >= 150) {
    const { error: flagErr } = await db
      .from("baro_visits")
      .update({ is_special: true })
      .eq("id", visitId);
    if (!flagErr) {
      console.log(`Baro: flagged as special (${rows.length} items)`);
    }
  }
}

// Data-quality gate (M8.4)
const VALID_DUCATS = new Set([15, 25, 45, 65, 100]);

async function checkDataQuality(sweepId: number): Promise<string[]> {
  const violations: string[] = [];

  // 1. Ducats of junk items ∈ {15,25,45,65,100}
  const { data: junkData } = await db
    .from("prime_items")
    .select("url_name, ducats")
    .not("ducats", "is", null);
  const junkItems = (junkData ?? []) as { url_name: string; ducats: number }[];
  const badDucats = junkItems.filter((i) => !VALID_DUCATS.has(i.ducats));
  if (badDucats.length > 0) {
    const examples = badDucats
      .slice(0, 5)
      .map((i) => `${i.url_name}=${i.ducats}`)
      .join(", ");
    violations.push(
      `${badDucats.length} items with invalid ducats: ${examples}`,
    );
  }

  // 2. Medians > 0
  const { count: badMedians } = await db
    .from("trade_stats")
    .select("*", { count: "exact", head: true })
    .eq("sweep_id", sweepId)
    .lte("median", 0);
  if (badMedians && badMedians > 0) {
    violations.push(`${badMedians} trade_stats rows with median <= 0`);
  }

  // 3. Stats row count within 0.5×–2× of the previous sweep
  const { count: currentStatsRows } = await db
    .from("trade_stats")
    .select("*", { count: "exact", head: true })
    .eq("sweep_id", sweepId);

  const { data: prevSweepData } = await db
    .from("sweeps")
    .select("notes")
    .not("completed_at", "is", null)
    .order("id", { ascending: false })
    .limit(1)
    .single();

  if (prevSweepData?.notes) {
    const match = String(prevSweepData.notes).match(/stats_rows=(\d+)/);
    if (match && currentStatsRows != null) {
      const prevRows = parseInt(match[1]);
      if (prevRows > 0) {
        const ratio = currentStatsRows / prevRows;
        if (ratio < 0.5 || ratio > 2) {
          violations.push(
            `Stats row count ${currentStatsRows} is ${ratio.toFixed(2)}× previous (${prevRows})`,
          );
        }
      }
    }
  }

  return violations;
}

// Step 6 — Close sweep + heartbeat
async function closeSweep(
  sweepId: number,
  total: number,
  ok: number,
  failed: number,
  notes?: string,
) {
  await db
    .from("sweeps")
    .update({
      completed_at: new Date().toISOString(),
      items_total: total,
      items_ok: ok,
      items_failed: failed,
      notes: notes ?? null,
    })
    .eq("id", sweepId);

  // Upsert heartbeat
  const { error: hbErr } = await db
    .from("heartbeat")
    .upsert({
      id: 1,
      last_sweep_id: sweepId,
      updated_at: new Date().toISOString(),
    });
  if (hbErr) {
    console.warn(`Heartbeat upsert: ${hbErr.message}`);
  }
}

// Step 7 — Retention: prune old order snapshots
async function pruneOldSnapshots(): Promise<void> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await db
    .from("order_snapshots")
    .delete({ count: "exact" })
    .lt("captured_at", cutoff);

  if (error) {
    console.warn(`Retention prune: ${error.message}`);
  } else {
    console.log(`Retention: pruned ${count ?? 0} old order snapshots`);
  }
}

async function pruneOldRankings(): Promise<void> {
  const { data: recentSweeps } = await db
    .from("sweeps")
    .select("id")
    .not("completed_at", "is", null)
    .order("id", { ascending: false })
    .limit(30);

  if (!recentSweeps?.length) return;

  const keepIds = recentSweeps.map((s) => (s as { id: number }).id);
  const minKeepId = Math.min(...keepIds);

  const { error, count } = await db
    .from("rankings")
    .delete({ count: "exact" })
    .lt("sweep_id", minKeepId);

  if (error) {
    console.warn(`Rankings retention prune: ${error.message}`);
  } else {
    console.log(`Retention: pruned ${count ?? 0} old rankings rows`);
  }
}

async function appendRowCountTelemetry(sweepId: number): Promise<void> {
  const tables = ["rankings", "trade_stats", "order_snapshots", "prime_items"] as const;
  const counts: string[] = [];

  for (const table of tables) {
    const { count } = await db
      .from(table)
      .select("*", { count: "exact", head: true });
    counts.push(`${table}=${count ?? 0}`);
  }

  const telemetry = counts.join(", ");

  const { data: sweep } = await db
    .from("sweeps")
    .select("notes")
    .eq("id", sweepId)
    .single();

  const existing = sweep?.notes ? String(sweep.notes) : "";
  const updated = existing ? `${existing} | ${telemetry}` : telemetry;

  const { error } = await db
    .from("sweeps")
    .update({ notes: updated })
    .eq("id", sweepId);

  if (error) {
    console.warn(`Telemetry update error: ${error.message}`);
  } else {
    console.log(`Telemetry: ${telemetry}`);
  }
}

const PAGE_SIZE = 1000;
async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await query(from, from + PAGE_SIZE - 1);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

function daysAgoDate(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

async function computeAndWriteRankings(sweepId: number): Promise<void> {
  const { data: items } = await db
    .from("prime_items")
    .select("id, url_name, item_name, ducats")
    .not("ducats", "is", null);

  if (!items?.length) {
    console.log("No items with ducats — skipping rankings");
    return;
  }

  const itemIds = items.map((i) => i.id as string);
  const velocityCutoff = daysAgoDate(VELOCITY_DAYS);
  const CHUNK = 200;

  const allStats: Array<{
    item_id: string;
    stat_date: string;
    median: number;
    volume: number;
  }> = [];
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK);
    const rows = await fetchAllRows<(typeof allStats)[number]>((from, to) =>
      db
        .from("trade_stats")
        .select("item_id, stat_date, median, volume")
        .in("item_id", chunk)
        .eq("mod_rank", -1)
        .gte("stat_date", velocityCutoff)
        .order("stat_date", { ascending: false })
        .order("item_id", { ascending: true })
        .range(from, to),
    );
    allStats.push(...rows);
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
    id: number;
    item_id: string;
    price: number;
    quantity: number;
    mod_rank: number | null;
    seller_name: string;
  }> = [];
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK);
    const rows = await fetchAllRows<(typeof allOrders)[number]>((from, to) =>
      db
        .from("order_snapshots")
        .select("id, item_id, price, quantity, mod_rank, seller_name")
        .eq("sweep_id", sweepId)
        .in("item_id", chunk)
        .order("price", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    allOrders.push(...rows);
  }

  const ordersByItem = new Map<string, typeof allOrders>();
  for (const o of allOrders) {
    if (!ordersByItem.has(o.item_id)) ordersByItem.set(o.item_id, []);
    ordersByItem.get(o.item_id)!.push(o);
  }

  interface RankingRow {
    sweep_id: number;
    item_id: string;
    rank: number;
    ppd: number;
    ppd_at_n: number | null;
    velocity: number;
    score: number;
    shallow: boolean;
    orders_json: unknown;
  }

  const ranked: RankingRow[] = [];
  for (const item of items) {
    const median = latestMedian.get(item.id as string);
    if (!median || median <= 0) continue;

    const ducats = item.ducats as number;
    const ppd = ducats / median;

    const volumes = volumeByItem.get(item.id as string) ?? [];
    const velocity = computeVelocity(volumes, VELOCITY_DAYS);

    const orders = ordersByItem.get(item.id as string) ?? [];
    const { ppdAtN: ppd_at_n, shallow } = computePpdAtN(orders, ducats, PPD_N);

    const effectivePpd = ppd_at_n ?? ppd;
    const score = effectivePpd * Math.min(1, velocity / VELOCITY_LIQUID);

    ranked.push({
      sweep_id: sweepId,
      item_id: item.id as string,
      rank: 0,
      ppd: Math.round(ppd * 1000) / 1000,
      ppd_at_n: ppd_at_n !== null ? Math.round(ppd_at_n * 1000) / 1000 : null,
      velocity: Math.round(velocity * 10) / 10,
      score: Math.round(score * 1000) / 1000,
      shallow,
      orders_json: orders.map((o) => ({
        price: o.price,
        quantity: o.quantity,
        mod_rank: o.mod_rank,
        seller_name: o.seller_name,
      })),
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  ranked.forEach((r, i) => (r.rank = i + 1));

  const junkRate = computeJunkRateFromRanked(ranked.map((r) => ({
    ppd_at_n: r.ppd_at_n,
    shallow: r.shallow,
  })));

  const BATCH = 100;
  for (let i = 0; i < ranked.length; i += BATCH) {
    const batch = ranked.slice(i, i + BATCH);
    const { error } = await db.from("rankings").insert(batch);
    if (error) {
      console.warn(`  Rankings batch insert error: ${error.message}`);
    }
  }

  const { error: jrErr } = await db
    .from("sweeps")
    .update({ junk_rate: junkRate })
    .eq("id", sweepId);
  if (jrErr) {
    console.warn(`  Junk rate update error: ${jrErr.message}`);
  }

  console.log(
    `Rankings: ${ranked.length} rows written, junk_rate=${junkRate.toFixed(4)}`,
  );
}

async function main() {
  console.log("=== Ducat2Plat sweep ===\n");

  const sweepId = await openSweep();
  console.log(`Sweep #${sweepId} opened\n`);

  console.log("--- Item catalog ---");
  const catalog = await syncCatalog();
  console.log(
    `Catalog done: ${catalog.ok} new, ${catalog.failed} failed, ${catalog.total} total\n`,
  );

  console.log("--- Trade statistics ---");
  const stats = await fetchStats(sweepId);
  console.log(`Stats done: ${stats.ok} ok, ${stats.failed} failed\n`);

  console.log("--- Order depth ---");
  const orders = await fetchOrderDepth(sweepId);
  console.log(`Orders done: ${orders.ok} ok, ${orders.failed} failed\n`);

  console.log("--- Baro Ki'Teer ---");
  await fetchBaro();
  console.log();

  const totalOk = catalog.ok + stats.ok + orders.ok;
  const totalFailed = catalog.failed + stats.failed + orders.failed;
  const processed = totalOk + totalFailed;
  const rate = processed > 0 ? totalOk / processed : 1;

  // Data-quality gate
  console.log("--- Data-quality gate ---");
  const violations = await checkDataQuality(sweepId);

  const { count: statsRowCount } = await db
    .from("trade_stats")
    .select("*", { count: "exact", head: true })
    .eq("sweep_id", sweepId);
  const statsRowsNote = `stats_rows=${statsRowCount ?? 0}`;

  let notes = statsRowsNote;
  if (violations.length > 0) {
    for (const v of violations) console.warn(`  VIOLATION: ${v}`);
    notes = violations.join("; ") + " | " + statsRowsNote;
  } else {
    console.log("  All checks passed");
  }

  if (rate >= 0.9) {
    await closeSweep(sweepId, catalog.total, totalOk, totalFailed, notes);
    console.log(
      `Sweep #${sweepId} completed (${totalOk} ok, ${totalFailed} failed, ${(rate * 100).toFixed(1)}%)`,
    );

    console.log("\n--- Rankings ---");
    await computeAndWriteRankings(sweepId);

    const failRate = processed > 0 ? totalFailed / processed : 0;
    if (violations.length > 0 || failRate > 0.1) {
      console.warn(
        `Sweep #${sweepId} degraded: ${violations.length} quality violations, ${(failRate * 100).toFixed(1)}% item failures`,
      );
      process.exit(2);
    }
  } else {
    console.error(
      `Sweep #${sweepId} NOT completed: ${(rate * 100).toFixed(1)}% success (need >=90%)`,
    );
    process.exit(1);
  }

  console.log("\n--- Retention ---");
  await pruneOldSnapshots();
  await pruneOldRankings();

  console.log("\n--- Telemetry ---");
  await appendRowCountTelemetry(sweepId);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
