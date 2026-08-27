import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchItems } from "./wfm";

/**
 * Regression coverage for the retry classifier in wfm.ts.
 *
 * On 2026-07-31 the daily sweep died on its first request with
 * "HTTP 521: https://api.warframe.market/v2/items". Cloudflare fronts
 * api.warframe.market and serves 520-524 when the origin is unreachable;
 * wfmFetch only retried 429 and 503, so a transient outage was fatal.
 */

/** Stub global fetch with a fixed sequence of statuses; the last one repeats. */
function stubStatuses(statuses: number[]): { calls: number[] } {
  const calls: number[] = [];
  vi.stubGlobal("fetch", async () => {
    const status = statuses[Math.min(calls.length, statuses.length - 1)];
    calls.push(status);
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: () => null },
      json: async () => ({ data: [] }),
    } as unknown as Response;
  });
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wfmFetch retry classification", () => {
  // These walk the real 1/2/4/8 s backoff ladder, so they need generous timeouts.
  it("retries a Cloudflare 521 and recovers", { timeout: 20_000 }, async () => {
    const { calls } = stubStatuses([521, 521, 200]);
    await expect(fetchItems()).resolves.toEqual([]);
    expect(calls).toEqual([521, 521, 200]);
  });

  it("retries 500/502/504 as well", { timeout: 20_000 }, async () => {
    const { calls } = stubStatuses([500, 502, 504, 200]);
    await expect(fetchItems()).resolves.toEqual([]);
    expect(calls).toHaveLength(4);
  });

  it("gives up after 5 attempts on a persistent 521", { timeout: 40_000 }, async () => {
    const { calls } = stubStatuses([521]);
    await expect(fetchItems()).rejects.toThrow(/521 after 5 attempts/);
    expect(calls).toHaveLength(5);
  });

  it("does not retry a genuine 4xx", async () => {
    const { calls } = stubStatuses([404]);
    await expect(fetchItems()).rejects.toThrow(/HTTP 404/);
    expect(calls).toHaveLength(1);
  });
});
