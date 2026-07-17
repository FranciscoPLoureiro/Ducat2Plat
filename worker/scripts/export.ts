/**
 * Export Supabase tables to CSV files in ./export/.
 *
 * Usage:
 *   npx tsx scripts/export.ts
 *
 * Exports trade_stats, baro_visits, baro_visit_items, and vault_events.
 * Files are written to ./export/ with the current date in the filename
 * (e.g. trade_stats_2026-07-17.csv). Existing files are overwritten.
 *
 * Uses fetchAll-style pagination (1000 rows per page) to stream all rows
 * without loading the full table into memory at once.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const PAGE_SIZE = 1000;
const EXPORT_DIR = join(import.meta.dirname!, "..", "export");
const TODAY = new Date().toISOString().slice(0, 10);

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvLine(values: unknown[]): string {
  return values.map(escapeCsv).join(",") + "\n";
}

interface TableExport {
  name: string;
  select: string;
  orderBy: string;
  columns: string[];
  extract: (row: Record<string, unknown>) => unknown[];
}

const TABLES: TableExport[] = [
  {
    name: "trade_stats",
    select: "item_id, stat_date, mod_rank, volume, median, avg_price, min_price, max_price, sweep_id",
    orderBy: "stat_date",
    columns: ["item_id", "stat_date", "mod_rank", "volume", "median", "avg_price", "min_price", "max_price", "sweep_id"],
    extract: (r) => [r.item_id, r.stat_date, r.mod_rank, r.volume, r.median, r.avg_price, r.min_price, r.max_price, r.sweep_id],
  },
  {
    name: "baro_visits",
    select: "id, arrival, departure, relay",
    orderBy: "arrival",
    columns: ["id", "arrival", "departure", "relay"],
    extract: (r) => [r.id, r.arrival, r.departure, r.relay],
  },
  {
    name: "baro_visit_items",
    select: "visit_id, item_id, item_name, ducat_cost, credit_cost",
    orderBy: "visit_id",
    columns: ["visit_id", "item_id", "item_name", "ducat_cost", "credit_cost"],
    extract: (r) => [r.visit_id, r.item_id, r.item_name, r.ducat_cost, r.credit_cost],
  },
  {
    name: "vault_events",
    select: "id, item_id, event, effective_date",
    orderBy: "effective_date",
    columns: ["id", "item_id", "event", "effective_date"],
    extract: (r) => [r.id, r.item_id, r.event, r.effective_date],
  },
];

async function exportTable(table: TableExport): Promise<number> {
  const filePath = join(EXPORT_DIR, `${table.name}_${TODAY}.csv`);
  const stream = createWriteStream(filePath, { encoding: "utf-8" });
  stream.write(csvLine(table.columns));

  let totalRows = 0;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from(table.name)
      .select(table.select)
      .order(table.orderBy, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`${table.name} query error: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    if (!rows.length) break;

    for (const row of rows) {
      stream.write(csvLine(table.extract(row)));
    }
    totalRows += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.on("error", reject);
  });

  return totalRows;
}

async function main() {
  mkdirSync(EXPORT_DIR, { recursive: true });
  console.log(`Exporting to ${EXPORT_DIR}\n`);

  for (const table of TABLES) {
    const count = await exportTable(table);
    console.log(`  ${table.name}: ${count} rows → ${table.name}_${TODAY}.csv`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
