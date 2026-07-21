/**
 * warframe.market API client — isolates all HTTP calls and response parsing.
 * sweep.ts calls only functions exported from this module; no raw fetch()
 * calls to warframe.market or warframestat.us exist outside this file.
 *
 * ── Endpoints used ──
 *
 *   GET https://api.warframe.market/v2/items
 *     Full item list with id, slug, i18n, tags, ducats, maxRank inline.
 *     One request per sweep.
 *     Response shape: { data: WfmItem[] }
 *
 *   GET https://api.warframe.market/v1/items/{url_name}/statistics
 *     Closed-trade stats for the trailing ~90 days: daily rows with volume,
 *     median, avg_price, min_price, max_price, and mod_rank for mods.
 *     ~600–700 requests per sweep.
 *     Response shape: { payload: { statistics_closed: { "90days": WfmStatRow[] } } }
 *
 *   GET https://api.warframe.market/v2/orders/item/{url_name}
 *     Live order book: type (buy/sell), user status/ingameName, platinum,
 *     quantity, modRank.
 *     ~60 requests per sweep (top candidates only).
 *     Response shape: { data: WfmOrder[] }
 *
 *   GET https://api.warframestat.us/pc/voidTrader
 *     Baro Ki'Teer: activation, expiry, location, active flag, inventory[].
 *     One request per sweep; different host, not rate-limited by us.
 *     Response shape: see VoidTraderResponseSchema
 *
 * ── Shape assumptions ──
 *
 *   All warframe.market responses are validated by Zod schemas (wfm-schemas.ts)
 *   before use. On validation failure the caller receives null, never a
 *   malformed object.
 *
 * ── Rate-limit policy ──
 *
 *   warframe.market allows ~3 req/s; we throttle to 2.5 req/s (400 ms gap).
 *   On HTTP 429 or 503: honor the Retry-After header if present (seconds or
 *   HTTP-date); otherwise exponential backoff (1 s, 2 s, 4 s, 8 s, 16 s),
 *   up to 5 attempts. After 5 failures the call throws; the sweep records
 *   the item as failed and continues.
 *   warframestat.us calls are not throttled (single request, different host).
 */

import {
  WfmItemsResponseSchema,
  WfmStatisticsResponseSchema,
  WfmOrdersResponseSchema,
  VoidTraderResponseSchema,
  type WfmItem,
  type WfmStatRow,
  type WfmOrder,
  type VoidTraderResponse,
} from "./wfm-schemas";

const WFM_V1 = "https://api.warframe.market/v1";
const WFM_V2 = "https://api.warframe.market/v2";
const BARO_URL = "https://api.warframestat.us/pc/voidTrader";
const RATE_MS = 400; // 2.5 req/s
const USER_AGENT =
  "Ducat2Plat/1.0 (+https://github.com/FranciscoPLoureiro/Ducat2Plat)";

let lastReq = 0;

function sleep(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    const delta = date - Date.now();
    return delta > 0 ? delta : null;
  }
  return null;
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
        // Warframe has cross-platform trading: merge crossplay-enabled console
        // sellers into the book (a PC player can trade with them in-game).
        Crossplay: "true",
        Language: "en",
        "User-Agent": USER_AGENT,
      },
    });

    if (res.status === 429 || res.status === 503) {
      if (attempt < 5) {
        const retryDelay = parseRetryAfter(res.headers.get("Retry-After"));
        const delay = retryDelay ?? 1000 * 2 ** (attempt - 1);
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

export async function fetchItems(): Promise<WfmItem[] | null> {
  const raw = await wfmFetch(`${WFM_V2}/items`);
  const parsed = WfmItemsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      `Items API schema validation failed: ${parsed.error.issues[0]?.message}`,
    );
    return null;
  }
  return parsed.data.data;
}

export async function fetchStatistics(
  urlName: string,
): Promise<WfmStatRow[] | null> {
  const raw = await wfmFetch(`${WFM_V1}/items/${urlName}/statistics`);
  const parsed = WfmStatisticsResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      `  ${urlName}: schema validation: ${parsed.error.issues[0]?.message}`,
    );
    return null;
  }
  return parsed.data.payload.statistics_closed["90days"];
}

export async function fetchOrders(
  urlName: string,
): Promise<WfmOrder[] | null> {
  const raw = await wfmFetch(`${WFM_V2}/orders/item/${urlName}`);
  const parsed = WfmOrdersResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      `  ${urlName}: orders schema validation: ${parsed.error.issues[0]?.message}`,
    );
    return null;
  }
  return parsed.data.data;
}

export async function fetchVoidTrader(): Promise<VoidTraderResponse | null> {
  let raw: unknown;
  try {
    const res = await fetch(BARO_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    if (!res.ok) {
      console.warn(`Baro API returned ${res.status}`);
      return null;
    }
    raw = await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Baro fetch failed: ${msg}`);
    return null;
  }

  const parsed = VoidTraderResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      `Baro API schema validation failed: ${parsed.error.issues[0]?.message}`,
    );
    return null;
  }
  return parsed.data;
}
