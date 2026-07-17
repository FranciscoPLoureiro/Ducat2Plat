/**
 * Seed vault_events from the WFCD warframe-items dataset on GitHub.
 *
 * Usage:
 *   npx tsx scripts/seed-vault.ts          # dry-run: prints proposed events
 *   npx tsx scripts/seed-vault.ts --apply  # inserts into Supabase
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

const WFCD_BASE =
  "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json";

const CATEGORIES = [
  "Warframes",
  "Primary",
  "Secondary",
  "Melee",
  "Sentinels",
  "SentinelWeapons",
  "Arch-Gun",
  "Archwing",
];

interface WfcdItem {
  name: string;
  vaulted?: boolean;
  vaultDate?: string;
  components?: { name: string; ducats?: number }[];
}

interface ProposedEvent {
  item_id: string;
  item_name: string;
  url_name: string;
  event: "vaulted" | "unvaulted";
  effective_date: string;
  source_set: string;
}

async function fetchCategory(category: string): Promise<WfcdItem[]> {
  const url = `${WFCD_BASE}/${category}.json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Ducat2Plat/1.0 (+https://github.com/flour/Ducat2Plat)",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${category}: ${res.status}`);
  return (await res.json()) as WfcdItem[];
}

const PAGE_SIZE = 1000;

async function fetchAllPrimeItems(): Promise<
  { id: string; item_name: string; url_name: string; vaulted: boolean }[]
> {
  const all: { id: string; item_name: string; url_name: string; vaulted: boolean }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await db
      .from("prime_items")
      .select("id, item_name, url_name, vaulted")
      .order("item_name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (!data?.length) break;
    for (const r of data) {
      all.push(r as (typeof all)[number]);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

async function fetchExistingVaultEvents(): Promise<
  Set<string> // "item_id|event|date"
> {
  const set = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await db
      .from("vault_events")
      .select("item_id, event, effective_date")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (!data?.length) break;
    for (const r of data as { item_id: string; event: string; effective_date: string }[]) {
      set.add(`${r.item_id}|${r.event}|${r.effective_date}`);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return set;
}

async function main() {
  const apply = process.argv.includes("--apply");

  console.log("Fetching WFCD warframe-items data...\n");

  const vaultedSets: {
    name: string;
    vaultDate: string;
    componentNames: string[];
  }[] = [];

  for (const cat of CATEGORIES) {
    const items = await fetchCategory(cat);
    const primes = items.filter(
      (i) => i.name?.includes("Prime") && i.vaulted === true && i.vaultDate,
    );
    for (const p of primes) {
      const componentNames = (p.components || [])
        .filter((c) => c.ducats != null && c.ducats > 0)
        .map((c) => `${p.name} ${c.name}`);
      componentNames.push(`${p.name} Set`);
      vaultedSets.push({
        name: p.name,
        vaultDate: p.vaultDate!,
        componentNames,
      });
    }
    console.log(
      `  ${cat}: ${primes.length} vaulted Prime sets found`,
    );
  }

  console.log(`\nTotal vaulted sets: ${vaultedSets.length}`);

  console.log("\nFetching prime_items from database...");
  const primeItems = await fetchAllPrimeItems();
  console.log(`  ${primeItems.length} items in database`);

  const nameLookup = new Map<
    string,
    { id: string; url_name: string; vaulted: boolean }
  >();
  for (const item of primeItems) {
    nameLookup.set(item.item_name.toLowerCase(), {
      id: item.id,
      url_name: item.url_name,
      vaulted: item.vaulted,
    });
  }

  console.log("\nFetching existing vault_events...");
  const existingEvents = await fetchExistingVaultEvents();
  console.log(`  ${existingEvents.size} existing events\n`);

  const proposed: ProposedEvent[] = [];
  const unmatched: string[] = [];

  for (const set of vaultedSets) {
    for (const compName of set.componentNames) {
      const match = nameLookup.get(compName.toLowerCase());
      if (!match) {
        unmatched.push(compName);
        continue;
      }
      const key = `${match.id}|vaulted|${set.vaultDate}`;
      if (existingEvents.has(key)) continue;

      proposed.push({
        item_id: match.id,
        item_name: compName,
        url_name: match.url_name,
        event: "vaulted",
        effective_date: set.vaultDate,
        source_set: set.name,
      });
    }
  }

  // Also detect items that should be marked vaulted in prime_items
  const vaultUpdates: { id: string; item_name: string }[] = [];
  for (const set of vaultedSets) {
    for (const compName of set.componentNames) {
      const match = nameLookup.get(compName.toLowerCase());
      if (match && !match.vaulted) {
        vaultUpdates.push({ id: match.id, item_name: compName });
      }
    }
  }

  console.log("=".repeat(70));
  console.log("PROPOSED VAULT EVENTS");
  console.log("=".repeat(70));

  if (proposed.length === 0) {
    console.log("\nNo new vault events to insert (all already exist).\n");
  } else {
    console.log(`\n${proposed.length} new vault_events to insert:\n`);
    const bySet = new Map<string, ProposedEvent[]>();
    for (const p of proposed) {
      if (!bySet.has(p.source_set)) bySet.set(p.source_set, []);
      bySet.get(p.source_set)!.push(p);
    }
    for (const [setName, events] of [...bySet.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      console.log(`  ${setName} (vaulted ${events[0].effective_date}):`);
      for (const e of events) {
        console.log(`    - ${e.item_name} (${e.url_name})`);
      }
    }
  }

  if (vaultUpdates.length > 0) {
    console.log(
      `\n${vaultUpdates.length} prime_items to update (vaulted = true):`,
    );
    for (const u of vaultUpdates) {
      console.log(`  - ${u.item_name}`);
    }
  }

  if (unmatched.length > 0) {
    console.log(
      `\n${unmatched.length} WFCD components not found in prime_items (expected for non-tradeable parts):`,
    );
    for (const name of unmatched.slice(0, 20)) {
      console.log(`  ? ${name}`);
    }
    if (unmatched.length > 20) {
      console.log(`  ... and ${unmatched.length - 20} more`);
    }
  }

  console.log("\n" + "=".repeat(70));

  if (!apply) {
    console.log(
      "DRY RUN — no changes made. Pass --apply to insert into the database.",
    );
    return;
  }

  console.log("APPLYING...\n");

  if (proposed.length > 0) {
    const rows = proposed.map((p) => ({
      item_id: p.item_id,
      event: p.event,
      effective_date: p.effective_date,
    }));
    const BATCH = 100;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await db.from("vault_events").insert(batch);
      if (error) {
        console.error(`  Insert error: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }
    console.log(`  Inserted ${inserted} vault_events`);
  }

  if (vaultUpdates.length > 0) {
    const ids = vaultUpdates.map((u) => u.id);
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const { error } = await db
        .from("prime_items")
        .update({ vaulted: true })
        .in("id", chunk);
      if (error) {
        console.error(`  Update error: ${error.message}`);
      }
    }
    console.log(`  Updated ${vaultUpdates.length} prime_items.vaulted = true`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
