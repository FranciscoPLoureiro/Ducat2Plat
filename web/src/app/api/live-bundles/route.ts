import { getLatestSweepId, fetchAll, type BundleSeller } from "@/lib/data";
import { getSupabase } from "@/lib/supabase";

// On-demand fresh bundles, two-stage:
//   Stage 1 — DISCOVER: re-fetch live order books for the top-ranked candidate
//     items and group in-game sell listings by seller.
//   Stage 2 — COMPLETE: for the most promising sellers, fetch their full
//     profile order list (one request per seller) and add EVERY ducat-worthy
//     item they sell — a seller request completes an entire basket, where an
//     item request only fills one cell of the item×seller matrix.
// Everything is computed in memory; nothing is written to the DB, so SPEC's
// "no high-frequency snapshotting" non-goal holds.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WFM_V2 = "https://api.warframe.market/v2";
const USER_AGENT =
  "Ducat2Plat/1.0 (+https://github.com/FranciscoPLoureiro/Ducat2Plat)";
const RATE_MS = 340; // ~2.9 req/s launch spacing, under WFM's 3/s
const STAGE1_ITEMS = 80;
const STAGE2_SELLERS = 30;
// Per-item basket filter: only "good ducat value" listings enter a bundle.
// PpD >= 7.5 means a 45d part at <=6p; overpriced inventory is invisible.
const MIN_ITEM_PPD = 7.5;
// And never pay far above the going rate even if PpD clears the floor.
const MAX_OVER_MEDIAN = 1.5;
const DEADLINE_MS = 50_000; // leave headroom under maxDuration
const COOLDOWN_MS = 60_000;

let lastRun = 0;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface JunkItem {
  url_name: string;
  item_name: string;
  ducats: number;
  median: number | null;
}

function passesFilter(item: JunkItem, price: number): boolean {
  if (price <= 0) return false;
  if (item.ducats / price < MIN_ITEM_PPD) return false;
  if (item.median !== null && price > item.median * MAX_OVER_MEDIAN) return false;
  return true;
}

// Launch tasks spaced RATE_MS apart without awaiting each completion — the
// request *rate* respects the API limit while latency overlaps, roughly
// halving wall time versus fully serial fetching.
async function pacedAll<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
  const running: Promise<T>[] = [];
  for (const task of tasks) {
    running.push(task());
    await sleep(RATE_MS);
  }
  return Promise.all(running);
}

async function fetchItemSells(
  urlName: string,
): Promise<
  { seller: string; sellerId: string; price: number; quantity: number }[] | null
> {
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
    const out: { seller: string; sellerId: string; price: number; quantity: number }[] = [];
    for (const o of json.data as Record<string, unknown>[]) {
      const user = o.user as Record<string, unknown> | undefined;
      if (
        o.type === "sell" &&
        typeof o.platinum === "number" &&
        user?.status === "ingame" &&
        typeof user.ingameName === "string" &&
        typeof user.id === "string"
      ) {
        out.push({
          seller: user.ingameName,
          sellerId: user.id,
          price: o.platinum,
          quantity: typeof o.quantity === "number" ? o.quantity : 1,
        });
      }
    }
    out.sort((a, b) => a.price - b.price);
    return out.slice(0, 20);
  } catch {
    return null;
  }
}

// A seller's complete visible sell list via v2, keyed by their user id
// (discovered in stage 1). Orders reference items by WFM's item id, which we
// store as prime_items.wfm_id.
async function fetchUserSells(
  userId: string,
): Promise<{ wfm_id: string; price: number; quantity: number }[] | null> {
  try {
    const res = await fetch(`${WFM_V2}/orders/user/${userId}`, {
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
    const out: { wfm_id: string; price: number; quantity: number }[] = [];
    for (const o of json.data as Record<string, unknown>[]) {
      if (
        o.type === "sell" &&
        o.visible === true &&
        typeof o.platinum === "number" &&
        typeof o.itemId === "string"
      ) {
        out.push({
          wfm_id: o.itemId,
          price: o.platinum,
          quantity: typeof o.quantity === "number" ? o.quantity : 1,
        });
      }
    }
    return out;
  } catch {
    return null;
  }
}

export async function GET() {
  const started = Date.now();
  if (started - lastRun < COOLDOWN_MS) {
    return Response.json(
      { error: "cooling down", retryInMs: COOLDOWN_MS - (started - lastRun) },
      { status: 429 },
    );
  }
  lastRun = started;

  try {
    const db = getSupabase();
    const sweepId = await getLatestSweepId();
    if (!sweepId) return Response.json({ error: "no sweep" }, { status: 503 });

    // Junk universe: every item with a ducat value, plus its latest median
    // (via the precomputed rankings) for the price-sanity filter.
    const junkRows = await fetchAll<{
      id: string;
      wfm_id: string;
      url_name: string;
      item_name: string;
      ducats: number;
    }>((from, to) =>
      db
        .from("prime_items")
        .select("id, wfm_id, url_name, item_name, ducats")
        .not("ducats", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
    );
    const rankRows = await fetchAll<{ item_id: string; rank: number; ppd: number }>(
      (from, to) =>
        db
          .from("rankings")
          .select("item_id, rank, ppd")
          .eq("sweep_id", sweepId)
          .order("rank", { ascending: true })
          .range(from, to),
    );

    const ppdById = new Map<string, number>();
    for (const r of rankRows) ppdById.set(r.item_id, Number(r.ppd));

    const junkById = new Map<string, JunkItem>();
    const junkByWfm = new Map<string, JunkItem>();
    for (const j of junkRows) {
      const ppd = ppdById.get(j.id);
      const median = ppd && ppd > 0 ? j.ducats / ppd : null;
      const entry: JunkItem = {
        url_name: j.url_name,
        item_name: j.item_name,
        ducats: j.ducats,
        median,
      };
      junkById.set(j.id, entry);
      junkByWfm.set(j.wfm_id, entry);
    }

    // Stage-1 candidates: top-ranked items from the latest sweep.
    const candidates = rankRows
      .slice(0, STAGE1_ITEMS)
      .map((r) => junkById.get(r.item_id))
      .filter((j): j is JunkItem => j !== undefined);

    // ── Stage 1: discover sellers ──
    let checked = 0;
    let failed = 0;
    const sellerItems = new Map<string, BundleSeller["items"]>();
    const sellerIds = new Map<string, string>();

    const stage1 = await pacedAll(
      candidates.map((item) => async () => ({
        item,
        sells: await fetchItemSells(item.url_name),
      })),
    );
    for (const { item, sells } of stage1) {
      if (sells === null) {
        failed++;
        continue;
      }
      checked++;
      for (const s of sells) {
        if (!passesFilter(item, s.price)) continue;
        sellerIds.set(s.seller, s.sellerId);
        if (!sellerItems.has(s.seller)) sellerItems.set(s.seller, []);
        const basket = sellerItems.get(s.seller)!;
        if (!basket.some((e) => e.url_name === item.url_name)) {
          basket.push({
            item_name: item.item_name,
            url_name: item.url_name,
            ducats: item.ducats,
            price: s.price,
            quantity: s.quantity,
          });
        }
      }
    }

    // ── Stage 2: complete the most promising baskets ──
    // Rank sellers by what we already know (multi-item first, then ducats);
    // their profile fetch reveals everything else they sell.
    const rankedSellers = [...sellerItems.entries()]
      .map(([name, items]) => ({
        name,
        count: items.length,
        ducats: items.reduce((s, i) => s + i.ducats, 0),
      }))
      .sort((a, b) => b.count - a.count || b.ducats - a.ducats)
      .slice(0, STAGE2_SELLERS)
      .filter(() => Date.now() - started < DEADLINE_MS);

    let sellersCompleted = 0;
    const stage2 = await pacedAll(
      rankedSellers.map((s) => async () => ({
        name: s.name,
        sells:
          Date.now() - started < DEADLINE_MS && sellerIds.has(s.name)
            ? await fetchUserSells(sellerIds.get(s.name)!)
            : null,
      })),
    );
    for (const { name, sells } of stage2) {
      if (sells === null) continue;
      sellersCompleted++;
      const basket = sellerItems.get(name)!;
      for (const s of sells) {
        const item = junkByWfm.get(s.wfm_id);
        if (!item || !passesFilter(item, s.price)) continue;
        const existing = basket.find((e) => e.url_name === item.url_name);
        if (existing) {
          if (s.price < existing.price) {
            existing.price = s.price;
            existing.quantity = s.quantity;
          }
        } else {
          basket.push({
            item_name: item.item_name,
            url_name: item.url_name,
            ducats: item.ducats,
            price: s.price,
            quantity: s.quantity,
          });
        }
      }
    }

    const bundles: BundleSeller[] = [];
    for (const [seller_name, items] of sellerItems) {
      if (items.length < 2) continue;
      items.sort((a, b) => b.ducats / b.price - a.ducats / a.price);
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
      sellersCompleted,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
