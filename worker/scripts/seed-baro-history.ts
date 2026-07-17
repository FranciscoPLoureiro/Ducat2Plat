/**
 * Seed historical Baro Ki'Teer visits from the WARFRAME Wiki's Module:Baro/data.
 *
 * Source: https://wiki.warframe.com/w/Module:Baro/data
 * This Lua module lists every Baro offering with per-platform dates.
 * We reconstruct visits by grouping items that share the same offering date.
 *
 * PC dates = union of PcOfferingDates (pre-2022) + OfferingDates (merged era).
 * TennoCon dates from TennoConOfferingDates → is_special = true.
 *
 * Usage:
 *   npx tsx scripts/seed-baro-history.ts          # dry-run: prints review
 *   npx tsx scripts/seed-baro-history.ts --apply  # inserts into Supabase
 */

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

const WIKI_DATA_URL =
  "https://wiki.warframe.com/w/Module:Baro/data?action=raw";
const BARO_VISIT_MS = 48 * 3_600_000;
const TENNOCON_VISIT_MS = 72 * 3_600_000;
const PAGE_SIZE = 1000;

// ── Types ───────────────────────────────────────────────────────────

interface WikiBaroItem {
  name: string;
  creditCost: number;
  ducatCost: number;
  regularDates: string[];
  tennoConDates: string[];
  isAlways: boolean;
}

interface ReconstructedVisit {
  arrival: string;
  departure: string;
  relay: string | null;
  isSpecial: boolean;
  items: { name: string; ducatCost: number; creditCost: number }[];
}

// ── Lua parser (subset: tables, strings, numbers, booleans) ─────────

function stripLuaComments(raw: string): string {
  return raw
    .split("\n")
    .map((line) => {
      let inStr = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"' && (i === 0 || line[i - 1] !== "\\"))
          inStr = !inStr;
        if (
          !inStr &&
          line[i] === "-" &&
          i + 1 < line.length &&
          line[i + 1] === "-"
        )
          return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

function findMatchingBrace(text: string, openPos: number): number {
  let depth = 1;
  for (let i = openPos; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractNumber(block: string, key: string): number | null {
  const m = block.match(new RegExp(`\\b${key}\\s*=\\s*(\\d+)`));
  return m ? parseInt(m[1], 10) : null;
}

function extractBoolean(block: string, key: string): boolean {
  return new RegExp(`\\b${key}\\s*=\\s*true`).test(block);
}

function extractDateArray(block: string, key: string): string[] {
  const m = block.match(new RegExp(`\\b${key}\\s*=\\s*\\{([^}]*)\\}`));
  if (!m) return [];
  const dates: string[] = [];
  const re = /"(\d{4}-\d{2}-\d{2})"/g;
  let dm;
  while ((dm = re.exec(m[1])) !== null) dates.push(dm[1]);
  return dates;
}

function parseWikiBaroData(raw: string): WikiBaroItem[] {
  const clean = stripLuaComments(raw);

  const itemsIdx = clean.indexOf('["Items"]');
  if (itemsIdx === -1) throw new Error('["Items"] block not found');

  const eqIdx = clean.indexOf("=", itemsIdx);
  const braceOpen = clean.indexOf("{", eqIdx);
  if (braceOpen === -1) throw new Error("Items opening brace not found");

  const braceClose = findMatchingBrace(clean, braceOpen + 1);
  const itemsBlock = clean.slice(braceOpen + 1, braceClose);

  const items: WikiBaroItem[] = [];
  const keyRe = /\["(.+?)"\]\s*=\s*\{/g;
  let match;

  while ((match = keyRe.exec(itemsBlock)) !== null) {
    const name = match[1];
    const blockStart = match.index + match[0].length;
    const blockEnd = findMatchingBrace(itemsBlock, blockStart);
    if (blockEnd === -1) continue;

    const block = itemsBlock.slice(blockStart, blockEnd);

    const pcDates = extractDateArray(block, "PcOfferingDates");
    const offeringDates = extractDateArray(block, "OfferingDates");
    const tennoConDates = extractDateArray(block, "TennoConOfferingDates");

    const regularSet = new Set([...pcDates, ...offeringDates]);

    items.push({
      name,
      creditCost: extractNumber(block, "CreditCost") ?? 0,
      ducatCost: extractNumber(block, "DucatCost") ?? 0,
      regularDates: [...regularSet].sort(),
      tennoConDates: tennoConDates.sort(),
      isAlways: extractBoolean(block, "IsAlways"),
    });

    keyRe.lastIndex = blockEnd + 1;
  }

  return items;
}

// ── Visit reconstruction ────────────────────────────────────────────

function reconstructVisits(items: WikiBaroItem[]): ReconstructedVisit[] {
  const regularMap = new Map<
    string,
    { name: string; ducatCost: number; creditCost: number }[]
  >();
  const tennoConMap = new Map<
    string,
    { name: string; ducatCost: number; creditCost: number }[]
  >();

  for (const item of items) {
    if (item.isAlways) continue;
    const entry = {
      name: item.name,
      ducatCost: item.ducatCost,
      creditCost: item.creditCost,
    };
    for (const d of item.regularDates) {
      if (!regularMap.has(d)) regularMap.set(d, []);
      regularMap.get(d)!.push(entry);
    }
    for (const d of item.tennoConDates) {
      if (!tennoConMap.has(d)) tennoConMap.set(d, []);
      tennoConMap.get(d)!.push(entry);
    }
  }

  const visits: ReconstructedVisit[] = [];

  for (const [date, visitItems] of regularMap) {
    const t = new Date(`${date}T00:00:00Z`).getTime();
    visits.push({
      arrival: `${date}T00:00:00Z`,
      departure: new Date(t + BARO_VISIT_MS).toISOString(),
      relay: null,
      isSpecial: visitItems.length >= 150,
      items: visitItems,
    });
  }

  for (const [date, visitItems] of tennoConMap) {
    const t = new Date(`${date}T00:00:00Z`).getTime();
    visits.push({
      arrival: `${date}T00:00:00Z`,
      departure: new Date(t + TENNOCON_VISIT_MS).toISOString(),
      relay: "TennoCon",
      isSpecial: true,
      items: visitItems,
    });
  }

  visits.sort((a, b) => a.arrival.localeCompare(b.arrival));
  return visits;
}

// ── DB helpers ──────────────────────────────────────────────────────

async function fetchAllPrimeItems(): Promise<
  { id: string; item_name: string }[]
> {
  const all: { id: string; item_name: string }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await db
      .from("prime_items")
      .select("id, item_name")
      .order("item_name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (!data?.length) break;
    all.push(...(data as typeof all));
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

async function fetchExistingVisitDates(): Promise<Set<string>> {
  const set = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await db
      .from("baro_visits")
      .select("arrival")
      .order("arrival", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (!data?.length) break;
    for (const row of data as { arrival: string }[]) {
      set.add(row.arrival.slice(0, 10));
    }
    if (data.length < PAGE_SIZE) break;
  }
  return set;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const apply = process.argv.includes("--apply");

  console.log("Fetching Module:Baro/data from wiki.warframe.com...\n");
  const res = await fetch(WIKI_DATA_URL, {
    headers: {
      "User-Agent": "Ducat2Plat/1.0 (+https://github.com/flour/Ducat2Plat)",
    },
  });
  if (!res.ok) throw new Error(`Wiki fetch failed: ${res.status}`);
  const raw = await res.text();
  console.log(`  Fetched ${(raw.length / 1024).toFixed(0)} KB of Lua data\n`);

  console.log("Parsing Lua data...");
  const wikiItems = parseWikiBaroData(raw);
  console.log(`  ${wikiItems.length} items parsed\n`);

  console.log("Reconstructing visits...");
  const allVisits = reconstructVisits(wikiItems);
  const regular = allVisits.filter((v) => !v.isSpecial);
  const special = allVisits.filter((v) => v.isSpecial);
  console.log(`  ${regular.length} regular visits`);
  console.log(`  ${special.length} TennoCon / special visits`);
  if (allVisits.length > 0) {
    console.log(
      `  Date range: ${allVisits[0].arrival.slice(0, 10)} → ${allVisits[allVisits.length - 1].arrival.slice(0, 10)}`,
    );
  }

  const itemCounts = allVisits.map((v) => v.items.length).sort((a, b) => a - b);
  const medianItems = itemCounts[Math.floor(itemCounts.length / 2)] ?? 0;
  console.log(
    `  Items/visit: min=${itemCounts[0]}, median=${medianItems}, max=${itemCounts[itemCounts.length - 1]}\n`,
  );

  console.log("Fetching prime_items from database...");
  const primeItems = await fetchAllPrimeItems();
  console.log(`  ${primeItems.length} items in database\n`);

  const nameLookup = new Map<string, string>();
  for (const pi of primeItems) {
    nameLookup.set(pi.item_name.toLowerCase(), pi.id);
  }

  let totalMatched = 0;
  let totalUnmatched = 0;
  const unmatchedNames = new Set<string>();

  for (const visit of allVisits) {
    for (const item of visit.items) {
      if (nameLookup.has(item.name.toLowerCase())) {
        totalMatched++;
      } else {
        totalUnmatched++;
        unmatchedNames.add(item.name);
      }
    }
  }

  console.log("Checking existing visits in database...");
  const existingDates = await fetchExistingVisitDates();
  console.log(`  ${existingDates.size} visits already in database\n`);

  const newVisits = allVisits.filter(
    (v) => !existingDates.has(v.arrival.slice(0, 10)),
  );

  // ── Review summary ──
  console.log("=".repeat(70));
  console.log("REVIEW SUMMARY");
  console.log("=".repeat(70));
  console.log(`\nSource: wiki.warframe.com Module:Baro/data (Lua module)`);
  console.log(`Total visits reconstructed: ${allVisits.length}`);
  console.log(`  Regular: ${regular.length}`);
  console.log(`  TennoCon (is_special): ${special.length}`);
  if (allVisits.length > 0) {
    console.log(
      `Date range: ${allVisits[0].arrival.slice(0, 10)} → ${allVisits[allVisits.length - 1].arrival.slice(0, 10)}`,
    );
  }
  console.log(
    `Items/visit: min=${itemCounts[0]}, median=${medianItems}, max=${itemCounts[itemCounts.length - 1]}`,
  );
  console.log(`\nItem matching:`);
  console.log(`  Matched to prime_items: ${totalMatched}`);
  console.log(`  Unmatched (will keep with null item_id): ${totalUnmatched}`);
  console.log(`  Unique unmatched names: ${unmatchedNames.size}`);

  if (unmatchedNames.size > 0) {
    console.log(`\nUnmatched item name examples (first 20):`);
    for (const name of [...unmatchedNames].sort().slice(0, 20)) {
      console.log(`  ? ${name}`);
    }
    if (unmatchedNames.size > 20)
      console.log(`  ... and ${unmatchedNames.size - 20} more`);
  }

  console.log(`\nNew visits to insert: ${newVisits.length}`);
  console.log(`Already in database (skipped): ${existingDates.size}`);

  if (newVisits.length > 0) {
    console.log(`\nFirst 5 new visits:`);
    for (const v of newVisits.slice(0, 5)) {
      console.log(
        `  ${v.arrival.slice(0, 10)} ${v.isSpecial ? "(TennoCon) " : ""}— ${v.items.length} items`,
      );
    }
    if (newVisits.length > 5) {
      console.log(`Last 5 new visits:`);
      for (const v of newVisits.slice(-5)) {
        console.log(
          `  ${v.arrival.slice(0, 10)} ${v.isSpecial ? "(TennoCon) " : ""}— ${v.items.length} items`,
        );
      }
    }
  }

  console.log("\n" + "=".repeat(70));

  if (!apply) {
    console.log(
      "DRY RUN — no changes made. Pass --apply to insert into the database.",
    );
    return;
  }

  // ── Apply ──
  console.log("APPLYING...\n");

  let insertedVisits = 0;
  let insertedItems = 0;

  for (const visit of newVisits) {
    const { data: row, error } = await db
      .from("baro_visits")
      .upsert(
        {
          arrival: visit.arrival,
          departure: visit.departure,
          relay: visit.relay,
          is_special: visit.isSpecial,
        },
        { onConflict: "arrival" },
      )
      .select("id")
      .single();

    if (error || !row) {
      console.error(
        `  Visit insert error (${visit.arrival.slice(0, 10)}): ${error?.message}`,
      );
      continue;
    }

    insertedVisits++;
    const visitId = (row as { id: number }).id;

    const itemRows = visit.items.map((item) => ({
      visit_id: visitId,
      item_name: item.name,
      ducat_cost: item.ducatCost,
      credit_cost: item.creditCost,
      item_id: nameLookup.get(item.name.toLowerCase()) ?? null,
    }));

    const BATCH = 100;
    for (let i = 0; i < itemRows.length; i += BATCH) {
      const batch = itemRows.slice(i, i + BATCH);
      const { error: batchErr } = await db
        .from("baro_visit_items")
        .upsert(batch, { onConflict: "visit_id,item_name" });
      if (batchErr) {
        console.error(`  Item batch error: ${batchErr.message}`);
      } else {
        insertedItems += batch.length;
      }
    }
  }

  console.log(`  Inserted ${insertedVisits} visits with ${insertedItems} items`);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
