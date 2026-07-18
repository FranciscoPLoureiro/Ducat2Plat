/**
 * Seed a deterministic synthetic dataset for M12 development/testing.
 *
 * Generates ~10 primed mods with scripted restock events, price series with
 * KNOWN recovery shapes, and varying sample sizes (Stage A, B, C states).
 *
 * SAFETY: Requires a `dev_marker` table in the target DB. Refuses to run
 * against any database lacking it. Uses worker/.env.dev, never .env.local.
 *
 * Usage:
 *   npx tsx scripts/seed-synthetic.ts          # dry-run: prints plan
 *   npx tsx scripts/seed-synthetic.ts --apply  # inserts into dev DB
 */

async function connectDb() {
  const { config } = await import("dotenv");
  config({ path: ".env.dev" });

  const { createClient } = await import("@supabase/supabase-js");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.dev");
    process.exit(1);
  }
  return createClient(url, key);
}

// ── Safety interlock ────────────────────────────────────────────────

async function ensureDevMarker(db: Awaited<ReturnType<typeof connectDb>>): Promise<void> {
  const { error } = await db.from("dev_marker").select("id").limit(1);
  if (error) {
    console.error(
      "SAFETY: dev_marker table not found. This script only runs against a dev database.\n" +
        "Create it with: CREATE TABLE dev_marker (id int primary key default 1);\n" +
        "INSERT INTO dev_marker (id) VALUES (1);\n" +
        `Error: ${error.message}`,
    );
    process.exit(1);
  }
}

// ── Deterministic seed helpers ──────────────────────────────────────

export function dateStr(base: Date, offsetDays: number): string {
  return new Date(base.getTime() + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function isoDate(base: Date, offsetDays: number): string {
  return new Date(base.getTime() + offsetDays * 86_400_000).toISOString();
}

export function syntheticRecoveryPrice(
  baseline: number,
  dip: number,
  recoveryDay: number,
  targetRecoveryDays: number,
  day: number,
): number {
  if (day >= targetRecoveryDays) return baseline;
  const dipPrice = baseline * (1 - dip);
  const progress = day / targetRecoveryDays;
  const eased = progress * progress * (3 - 2 * progress); // smoothstep
  return dipPrice + (baseline - dipPrice) * eased;
}

// ── Synthetic world definition ──────────────────────────────────────

export interface SyntheticMod {
  name: string;
  urlName: string;
  baseline: number;
  dip: number;
  recoveryDays: number;
  ducatCost: number;
  creditCost: number;
  restockVisits: number[];
}

export const EPOCH = new Date("2024-01-01T00:00:00Z");
export const VISIT_INTERVAL_DAYS = 14;
export const TOTAL_VISITS = 40; // ~560 days of history → >12 months for Stage C
export const TENNOCON_VISIT = 26; // visit index for TennoCon

export const MODS: SyntheticMod[] = [
  // Stage A: n=1 (only 1 restock)
  { name: "Primed Synth-A1", urlName: "primed_synth_a1", baseline: 200, dip: 0.4, recoveryDays: 28, ducatCost: 300, creditCost: 150000, restockVisits: [5] },
  { name: "Primed Synth-A2", urlName: "primed_synth_a2", baseline: 150, dip: 0.35, recoveryDays: 14, ducatCost: 250, creditCost: 100000, restockVisits: [10] },

  // Stage B: n=3-5 (enough for per-mod curve)
  { name: "Primed Synth-B1", urlName: "primed_synth_b1", baseline: 300, dip: 0.5, recoveryDays: 21, ducatCost: 350, creditCost: 175000, restockVisits: [3, 10, 17, 24] },
  { name: "Primed Synth-B2", urlName: "primed_synth_b2", baseline: 180, dip: 0.3, recoveryDays: 14, ducatCost: 200, creditCost: 100000, restockVisits: [2, 8, 15, 22, 30] },
  { name: "Primed Synth-B3", urlName: "primed_synth_b3", baseline: 400, dip: 0.45, recoveryDays: 35, ducatCost: 500, creditCost: 250000, restockVisits: [4, 12, 20] },

  // Stage B with high frequency (restock risk)
  { name: "Primed Synth-B4", urlName: "primed_synth_b4", baseline: 120, dip: 0.25, recoveryDays: 30, ducatCost: 150, creditCost: 75000, restockVisits: [1, 3, 5, 7] },

  // Stage C candidates (will have data for >12 months)
  { name: "Primed Synth-C1", urlName: "primed_synth_c1", baseline: 250, dip: 0.4, recoveryDays: 21, ducatCost: 300, creditCost: 150000, restockVisits: [2, 9, 16, 23, 30, 37] },
  { name: "Primed Synth-C2 Declining", urlName: "primed_synth_c2_declining", baseline: 350, dip: 0.5, recoveryDays: 28, ducatCost: 400, creditCost: 200000, restockVisits: [3, 10, 18, 25, 33] },

  // Unprofitable mod (SKIP)
  { name: "Primed Synth-Skip", urlName: "primed_synth_skip", baseline: 20, dip: 0.2, recoveryDays: 14, ducatCost: 500, creditCost: 250000, restockVisits: [5, 15, 25] },

  // Current visit mod (most recent visit)
  { name: "Primed Synth-Current", urlName: "primed_synth_current", baseline: 280, dip: 0.45, recoveryDays: 21, ducatCost: 350, creditCost: 175000, restockVisits: [6, 14, 22, TOTAL_VISITS - 1] },
];

export function generateSyntheticData() {
  // Generate visit schedule
  const visits = Array.from({ length: TOTAL_VISITS }, (_, i) => {
    const arrivalDays = i * VISIT_INTERVAL_DAYS;
    const isSpecial = i === TENNOCON_VISIT;
    return {
      index: i,
      arrival: isoDate(EPOCH, arrivalDays),
      departure: isoDate(EPOCH, arrivalDays + 2),
      relay: isSpecial ? "TennoCon" : `Relay-${(i % 4) + 1}`,
      isSpecial,
    };
  });

  // Generate items per mod
  const primeItems = MODS.map((mod) => ({
    wfmId: `synth-${mod.urlName}`,
    urlName: mod.urlName,
    itemName: mod.name,
    ducats: null,
    isPrimedMod: true,
    maxModRank: 10,
  }));

  // Generate price history per mod
  const tradeStats: {
    urlName: string;
    statDate: string;
    modRank: number;
    median: number;
    volume: number;
  }[] = [];

  for (const mod of MODS) {
    const totalDays = TOTAL_VISITS * VISIT_INTERVAL_DAYS;

    // Determine baseline with drift for C2 (declining mod)
    const isDecl = mod.urlName === "primed_synth_c2_declining";

    for (let day = 0; day <= totalDays; day++) {
      let effectiveBaseline = mod.baseline;
      if (isDecl) {
        const progress = day / totalDays;
        effectiveBaseline = mod.baseline * (1 - 0.3 * progress);
      }

      // Check if this day is within a recovery window of any restock
      let price = effectiveBaseline;
      for (const visitIdx of mod.restockVisits) {
        const visit = visits[visitIdx];
        if (!visit) continue;
        const depDays = visitIdx * VISIT_INTERVAL_DAYS + 2;
        const daysSinceDep = day - depDays;
        if (daysSinceDep >= 0 && daysSinceDep <= 42) {
          const recovPrice = syntheticRecoveryPrice(
            effectiveBaseline,
            mod.dip,
            daysSinceDep,
            mod.recoveryDays,
            daysSinceDep,
          );
          price = Math.min(price, recovPrice);
        }
      }

      tradeStats.push({
        urlName: mod.urlName,
        statDate: dateStr(EPOCH, day),
        modRank: 0,
        median: Math.round(price * 100) / 100,
        volume: 10 + Math.floor(Math.abs(Math.sin(day * 0.1)) * 20),
      });
    }
  }

  // Generate visit items
  const visitItems: {
    visitIndex: number;
    itemName: string;
    ducatCost: number;
    creditCost: number;
  }[] = [];

  for (const mod of MODS) {
    for (const visitIdx of mod.restockVisits) {
      visitItems.push({
        visitIndex: visitIdx,
        itemName: mod.name,
        ducatCost: mod.ducatCost,
        creditCost: mod.creditCost,
      });
    }
    // TennoCon has all mods
    visitItems.push({
      visitIndex: TENNOCON_VISIT,
      itemName: mod.name,
      ducatCost: mod.ducatCost,
      creditCost: mod.creditCost,
    });
  }

  // Generate a sweep
  const sweep = {
    startedAt: isoDate(EPOCH, TOTAL_VISITS * VISIT_INTERVAL_DAYS),
    completedAt: isoDate(EPOCH, TOTAL_VISITS * VISIT_INTERVAL_DAYS),
    itemsTotal: MODS.length,
    itemsOk: MODS.length,
    itemsFailed: 0,
    junkRate: 0.1,
  };

  // Junk items for junk rate computation
  const junkItems = Array.from({ length: 20 }, (_, i) => ({
    wfmId: `synth-junk-${i}`,
    urlName: `synth_junk_${i}`,
    itemName: `Synth Junk Part ${i}`,
    ducats: [15, 25, 45, 65, 100][i % 5],
    isPrimedMod: false,
    maxModRank: null,
  }));

  return {
    visits,
    primeItems: [...primeItems, ...junkItems],
    tradeStats,
    visitItems,
    sweep,
    mods: MODS,
  };
}

// ── Insert into database ────────────────────────────────────────────

async function applyData(db: Awaited<ReturnType<typeof connectDb>>) {
  const data = generateSyntheticData();

  // Clear existing synthetic data
  console.log("  Clearing existing synthetic data...");
  await db.from("baro_visit_items").delete().neq("visit_id", 0);
  await db.from("baro_visits").delete().neq("id", 0);
  await db.from("trade_stats").delete().neq("item_id", "00000000-0000-0000-0000-000000000000");
  await db.from("rankings").delete().neq("sweep_id", 0);
  await db.from("order_snapshots").delete().neq("id", 0);
  await db.from("sweeps").delete().neq("id", 0);
  await db.from("vault_events").delete().neq("id", 0);
  await db.from("prime_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await db.from("heartbeat").delete().eq("id", 1);

  // Insert prime_items
  console.log(`  Inserting ${data.primeItems.length} prime_items...`);
  for (const item of data.primeItems) {
    const { error } = await db.from("prime_items").insert({
      wfm_id: item.wfmId,
      url_name: item.urlName,
      item_name: item.itemName,
      ducats: item.ducats,
      is_primed_mod: item.isPrimedMod,
      max_mod_rank: item.maxModRank,
    });
    if (error) console.error(`    Item error (${item.itemName}): ${error.message}`);
  }

  // Build URL→ID map
  const { data: itemRows } = await db
    .from("prime_items")
    .select("id, url_name")
    .order("url_name", { ascending: true });
  const itemIdMap = new Map<string, string>();
  for (const r of (itemRows ?? []) as { id: string; url_name: string }[]) {
    itemIdMap.set(r.url_name, r.id);
  }

  // Insert sweep
  console.log("  Inserting sweep...");
  const { data: sweepRow } = await db
    .from("sweeps")
    .insert({
      started_at: data.sweep.startedAt,
      completed_at: data.sweep.completedAt,
      items_total: data.sweep.itemsTotal,
      items_ok: data.sweep.itemsOk,
      items_failed: data.sweep.itemsFailed,
      junk_rate: data.sweep.junkRate,
    })
    .select("id")
    .single();
  const sweepId = (sweepRow as { id: number } | null)?.id;

  // Insert heartbeat
  if (sweepId) {
    await db.from("heartbeat").upsert({
      id: 1,
      last_sweep_id: sweepId,
      updated_at: data.sweep.completedAt,
    });
  }

  // Insert visits
  console.log(`  Inserting ${data.visits.length} visits...`);
  const visitIdMap = new Map<number, number>();
  for (const v of data.visits) {
    const { data: row, error } = await db
      .from("baro_visits")
      .insert({
        arrival: v.arrival,
        departure: v.departure,
        relay: v.relay,
        is_special: v.isSpecial,
      })
      .select("id")
      .single();
    if (error) {
      console.error(`    Visit error (${v.arrival}): ${error.message}`);
    } else if (row) {
      visitIdMap.set(v.index, (row as { id: number }).id);
    }
  }

  // Insert visit items
  console.log(`  Inserting ${data.visitItems.length} visit items...`);
  for (const vi of data.visitItems) {
    const dbVisitId = visitIdMap.get(vi.visitIndex);
    if (!dbVisitId) continue;
    const itemId = itemIdMap.get(
      data.mods.find((m) => m.name === vi.itemName)?.urlName ?? "",
    );
    const { error } = await db.from("baro_visit_items").insert({
      visit_id: dbVisitId,
      item_name: vi.itemName,
      ducat_cost: vi.ducatCost,
      credit_cost: vi.creditCost,
      item_id: itemId ?? null,
    });
    if (error) console.error(`    Visit item error: ${error.message}`);
  }

  // Insert trade_stats
  console.log(`  Inserting ${data.tradeStats.length} trade_stats rows...`);
  const BATCH = 500;
  let statsInserted = 0;
  for (let i = 0; i < data.tradeStats.length; i += BATCH) {
    const batch = data.tradeStats.slice(i, i + BATCH).map((s) => ({
      item_id: itemIdMap.get(s.urlName) ?? null,
      stat_date: s.statDate,
      mod_rank: s.modRank,
      volume: s.volume,
      median: s.median,
      avg_price: s.median,
      min_price: Math.round(s.median * 0.8),
      max_price: Math.round(s.median * 1.2),
      sweep_id: sweepId,
    })).filter(r => r.item_id !== null);
    const { error } = await db.from("trade_stats").upsert(batch);
    if (error) {
      console.error(`    Stats batch error: ${error.message}`);
    } else {
      statsInserted += batch.length;
    }
  }
  console.log(`    ${statsInserted} stats rows inserted`);

  console.log("\n  Done. Synthetic data inserted.");
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const apply = process.argv.includes("--apply");

  const db = await connectDb();
  await ensureDevMarker(db);

  const data = generateSyntheticData();

  console.log("=".repeat(70));
  console.log("SYNTHETIC DEV WORLD — PLAN");
  console.log("=".repeat(70));
  console.log(`\nSource DB: ${process.env.SUPABASE_URL} (via .env.dev)`);
  console.log(`Epoch: ${EPOCH.toISOString().slice(0, 10)}`);
  console.log(`Visit interval: ${VISIT_INTERVAL_DAYS} days`);
  console.log(`Total visits: ${data.visits.length} (includes TennoCon at index ${TENNOCON_VISIT})`);
  console.log(`\nMods (${data.mods.length}):`);

  for (const mod of data.mods) {
    const n = mod.restockVisits.length;
    const stage = n >= 3 ? "B" : "A";
    console.log(
      `  ${mod.name}: baseline=${mod.baseline}p, dip=${(mod.dip * 100).toFixed(0)}%, ` +
        `recovery=${mod.recoveryDays}d, n=${n} → Stage ${stage}, ` +
        `ducats=${mod.ducatCost}, restocks=[${mod.restockVisits.join(",")}]`,
    );
  }

  console.log(`\nPrime items: ${data.primeItems.length} (${data.mods.length} mods + ${data.primeItems.length - data.mods.length} junk)`);
  console.log(`Trade stats rows: ${data.tradeStats.length}`);
  console.log(`Visit items: ${data.visitItems.length}`);

  console.log(`\nGround truth assertions:`);
  console.log(`  Primed Synth-B1: recovery_days=21, n=4, Stage B`);
  console.log(`  Primed Synth-B2: recovery_days=14, n=5, Stage B`);
  console.log(`  Primed Synth-A1: recovery_days uses pooled curve, n=1, Stage A`);
  console.log(`  Primed Synth-Skip: verdict=SKIP (baseline 20p, cost 500 ducats)`);
  console.log(`  Primed Synth-B4: restock_risk=true (interval 2 visits = 28d < recovery 30d)`);
  console.log(`  Primed Synth-C2 Declining: baseline drift < 0 (declining price)`);

  console.log("\n" + "=".repeat(70));

  if (!apply) {
    console.log(
      "DRY RUN — no changes made. Pass --apply to insert into the dev database.",
    );
    return;
  }

  console.log("APPLYING...\n");
  await applyData(db);
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("seed-synthetic.ts") ||
    process.argv[1].endsWith("seed-synthetic.js"));

if (isDirectRun) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
