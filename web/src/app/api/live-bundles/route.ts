import { getLatestSweepId, fetchAll, type BundleSeller } from "@/lib/data";
import { getSupabase } from "@/lib/supabase";

// On-demand fresh bundles. Re-fetches live order books for the sweep's
// candidate set straight from warframe.market and computes bundles in memory
// — nothing is written to the DB, so this stays within SPEC's "no
// high-frequency snapshotting" non-goal (we render a 30-second-old view at the
// moment of trading; we don't store listing noise).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WFM_V2 = "https://api.warframe.market/v2";
const USER_AGENT =
  "Ducat2Plat/1.0 (+https://github.com/FranciscoPLoureiro/Ducat2Plat)";
const RATE_MS = 340; // ~2.9 req/s, under WFM's 3/s
const MAX_CANDIDATES = 60;
const COOLDOWN_MS = 60_000; // best-effort per warm instance; client also gates

// Module-level guard: within a warm serverless instance this throttles abuse
// of the public route. Instances are ephemeral, so the client cooldown is the
// real limiter — this is just a cheap backstop.
let lastRun = 0;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface LiveOrder {
  type: string;
  platinum: number;
  quantity: number;
  user: { status: string; ingameName: string };
}

async function fetchLiveSells(urlName: string): Promise<LiveOrder[] | null> {
  try {
    const res = await fetch(`${WFM_V2}/orders/item/${urlName}`, {
      headers: {
        Accept: "application/json",
        Platform: "pc",
        Language: "en",
        "User-Agent": USER_AGENT,
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: unknown };
    if (!Array.isArray(json.data)) return null;
    const orders: LiveOrder[] = [];
    for (const o of json.data as Record<string, unknown>[]) {
      const user = o.user as Record<string, unknown> | undefined;
      if (
        typeof o.platinum === "number" &&
        typeof o.type === "string" &&
        user &&
        typeof user.status === "string" &&
        typeof user.ingameName === "string"
      ) {
        orders.push({
          type: o.type,
          platinum: o.platinum,
          quantity: typeof o.quantity === "number" ? o.quantity : 1,
          user: { status: user.status, ingameName: user.ingameName },
        });
      }
    }
    return orders;
  } catch {
    return null;
  }
}

export async function GET() {
  const now = Date.now();
  if (now - lastRun < COOLDOWN_MS) {
    return Response.json(
      { error: "cooling down", retryInMs: COOLDOWN_MS - (now - lastRun) },
      { status: 429 },
    );
  }
  lastRun = now;

  try {
    const db = getSupabase();
    const sweepId = await getLatestSweepId();
    if (!sweepId) return Response.json({ error: "no sweep" }, { status: 503 });

    // Candidate set = items the last sweep snapshotted orders for.
    const rows = await fetchAll<{ item_id: string }>((from, to) =>
      db
        .from("order_snapshots")
        .select("item_id")
        .eq("sweep_id", sweepId)
        .order("item_id", { ascending: true })
        .range(from, to),
    );
    const itemIds = [...new Set(rows.map((r) => r.item_id))].slice(0, MAX_CANDIDATES);
    if (!itemIds.length) return Response.json({ error: "no candidates" }, { status: 503 });

    const itemMap = new Map<
      string,
      { url_name: string; item_name: string; ducats: number }
    >();
    const CHUNK = 200;
    for (let i = 0; i < itemIds.length; i += CHUNK) {
      const { data: items } = await db
        .from("prime_items")
        .select("id, url_name, item_name, ducats")
        .in("id", itemIds.slice(i, i + CHUNK))
        .not("ducats", "is", null);
      for (const it of items ?? []) {
        itemMap.set(it.id, {
          url_name: it.url_name,
          item_name: it.item_name,
          ducats: it.ducats as number,
        });
      }
    }

    // Fetch live order books serially (polite to WFM), keep cheapest 20
    // in-game sell listings per item.
    const sellerItems = new Map<string, BundleSeller["items"]>();
    let checked = 0;
    let failed = 0;
    for (const itemId of itemIds) {
      const item = itemMap.get(itemId);
      if (!item) continue;
      await sleep(RATE_MS);
      const orders = await fetchLiveSells(item.url_name);
      if (orders === null) {
        failed++;
        continue;
      }
      checked++;
      const ingameSells = orders
        .filter((o) => o.type === "sell" && o.user.status === "ingame")
        .sort((a, b) => a.platinum - b.platinum)
        .slice(0, 20);
      for (const o of ingameSells) {
        if (!sellerItems.has(o.user.ingameName)) sellerItems.set(o.user.ingameName, []);
        const existing = sellerItems.get(o.user.ingameName)!;
        // cheapest listing per item per seller
        if (!existing.some((e) => e.url_name === item.url_name)) {
          existing.push({
            item_name: item.item_name,
            url_name: item.url_name,
            ducats: item.ducats,
            price: o.platinum,
            quantity: o.quantity,
          });
        }
      }
    }

    const bundles: BundleSeller[] = [];
    for (const [seller_name, items] of sellerItems) {
      if (items.length < 2) continue;
      const total_ducats = items.reduce((s, i) => s + i.ducats, 0);
      const total_plat = items.reduce((s, i) => s + i.price, 0);
      const combined_ppd = total_plat > 0 ? total_ducats / total_plat : 0;
      bundles.push({ seller_name, items, total_ducats, total_plat, combined_ppd });
    }
    bundles.sort((a, b) => b.combined_ppd - a.combined_ppd);

    return Response.json({
      bundles,
      fetchedAt: new Date().toISOString(),
      checked,
      failed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
