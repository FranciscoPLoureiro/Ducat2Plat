import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

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

async function wfmFetch(url: string): Promise<any> {
  const gap = RATE_MS - (Date.now() - lastReq);
  if (gap > 0) await sleep(gap);
  lastReq = Date.now();

  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Platform: "pc",
        Language: "en",
        "User-Agent": "Ducat2Plat/1.0 (https://github.com)",
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
  return data.id;
}

// Step 2 — v2 /items includes ducats/tags/maxRank inline, no detail calls needed
async function syncCatalog(): Promise<{
  total: number;
  ok: number;
  failed: number;
}> {
  const json = await wfmFetch(`${WFM_V2}/items`);
  const apiItems: any[] = json.data;
  console.log(`API: ${apiItems.length} items`);

  const known = new Set<string>();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await db
      .from("prime_items")
      .select("url_name")
      .range(from, from + PAGE - 1);
    if (!data?.length) break;
    for (const r of data) known.add(r.url_name);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const fresh = apiItems.filter((i: any) => !known.has(i.slug));
  console.log(`${fresh.length} new items to insert`);

  let ok = 0;
  let failed = 0;
  const now = new Date().toISOString();

  const BATCH = 100;
  for (let i = 0; i < fresh.length; i += BATCH) {
    const batch = fresh.slice(i, i + BATCH);
    const mapped = batch.map((item: any) => {
      const name: string = item.i18n?.en?.name ?? item.slug;
      const tags: string[] = item.tags ?? [];
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
    .filter((i: any) => known.has(i.slug))
    .map((i: any) => i.slug);
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
  const { data: items, error } = await db
    .from("prime_items")
    .select("id, url_name")
    .or("ducats.not.is.null,is_primed_mod.eq.true");

  if (error) throw new Error(`Query items: ${error.message}`);
  if (!items?.length) {
    console.log("No trackable items");
    return { ok: 0, failed: 0 };
  }

  console.log(`Fetching stats for ${items.length} items`);
  let ok = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const json = await wfmFetch(
        `${WFM_V1}/items/${item.url_name}/statistics`,
      );
      const closed: any[] =
        json.payload?.statistics_closed?.["90days"] ?? [];
      if (!closed.length) {
        ok++;
        continue;
      }

      const rows = closed.map((r: any) => ({
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
    } catch (err: any) {
      console.warn(`  ${item.url_name}: stats: ${err.message}`);
      failed++;
    }
  }

  return { ok, failed };
}

// Step 4 — Order depth for top-60 candidates by preliminary PpD
async function fetchOrderDepth(
  sweepId: number,
): Promise<{ ok: number; failed: number }> {
  const { data: rawItems, error: qErr } = await db
    .from("prime_items")
    .select("id, url_name, ducats")
    .not("ducats", "is", null);
  if (qErr || !rawItems?.length) {
    console.log("No candidates for order depth");
    return { ok: 0, failed: 0 };
  }

  const itemIds = rawItems.map((i: any) => i.id);
  const ppds: { id: string; url_name: string; ducats: number; ppd: number }[] = [];

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
      const seen = new Set<string>();
      for (const row of statsRows) {
        if (seen.has(row.item_id)) continue;
        seen.add(row.item_id);
        const item = rawItems.find((r: any) => r.id === row.item_id);
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
  const items = ppds.slice(0, 60);

  console.log(`Fetching orders for ${items.length} top candidates`);
  let ok = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const json = await wfmFetch(
        `${WFM_V2}/orders/item/${item.url_name}`,
      );
      const orders: any[] = json.data ?? [];

      // Keep only sell orders from ingame sellers
      const ingameSells = orders
        .filter(
          (o: any) =>
            o.type === "sell" && o.user?.status === "ingame",
        )
        .sort((a: any, b: any) => a.platinum - b.platinum)
        .slice(0, 20);

      if (ingameSells.length) {
        const rows = ingameSells.map((o: any) => ({
          sweep_id: sweepId,
          item_id: item.id,
          price: o.platinum,
          quantity: o.quantity ?? 1,
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
    } catch (err: any) {
      console.warn(`  ${item.url_name}: orders: ${err.message}`);
      failed++;
    }
  }

  return { ok, failed };
}

// Step 5 — Baro Ki'Teer
async function fetchBaro(): Promise<void> {
  const BARO_URL = "https://api.warframestat.us/pc/voidTrader";
  let data: any;
  try {
    const res = await fetch(BARO_URL, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`Baro API returned ${res.status}`);
      return;
    }
    data = await res.json();
  } catch (err: any) {
    console.warn(`Baro fetch failed: ${err.message}`);
    return;
  }

  if (!data.activation || !data.expiry) {
    console.log("Baro: no activation/expiry data");
    return;
  }

  const arrival = data.activation;
  const departure = data.expiry;
  const relay = data.location ?? null;
  const now = Date.now();
  const isActive =
    data.active === true ||
    (new Date(arrival).getTime() <= now && now < new Date(departure).getTime());

  const isSpecial =
    (relay && /tennocon/i.test(relay)) || false;

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

  const visitId = visitRow.id;
  console.log(`Baro visit #${visitId} (active=${isActive}, relay=${relay})`);

  // If active and has inventory, upsert items
  const inventory: any[] = data.inventory ?? [];
  if (!isActive || !inventory.length) {
    console.log(`Baro: ${isActive ? "active but no inventory" : "not active"}`);
    return;
  }

  console.log(`Baro: ${inventory.length} items in inventory`);

  // Get all prime_items for case-insensitive matching
  const allItems: { id: string; item_name: string }[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data: page } = await db
      .from("prime_items")
      .select("id, item_name")
      .range(from, from + PAGE - 1);
    if (!page?.length) break;
    for (const r of page) allItems.push(r);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  const nameLookup = new Map<string, string>();
  for (const item of allItems) {
    nameLookup.set(item.item_name.toLowerCase(), item.id);
  }

  const rows = inventory.map((inv: any) => {
    const matchedId = nameLookup.get((inv.item ?? "").toLowerCase()) ?? null;
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

// Step 6 — Close sweep + heartbeat
async function closeSweep(
  sweepId: number,
  total: number,
  ok: number,
  failed: number,
) {
  await db
    .from("sweeps")
    .update({
      completed_at: new Date().toISOString(),
      items_total: total,
      items_ok: ok,
      items_failed: failed,
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

  if (rate >= 0.9) {
    await closeSweep(sweepId, catalog.total, totalOk, totalFailed);
    console.log(
      `Sweep #${sweepId} completed (${totalOk} ok, ${totalFailed} failed, ${(rate * 100).toFixed(1)}%)`,
    );

    const failRate = processed > 0 ? totalFailed / processed : 0;
    if (failRate > 0.1) {
      console.warn(
        `Sweep #${sweepId} degraded: ${(failRate * 100).toFixed(1)}% item failures exceed 10% threshold`,
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
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
