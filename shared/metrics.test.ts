import { describe, it, expect } from "vitest";
import {
  computePpdAtN,
  computeVelocity,
  computeJunkRateFromRanked,
  computeBaroRoi,
  isSpecialVisit,
  JUNK_RATE_FALLBACK,
} from "./metrics";

// ---------- computePpdAtN ----------

describe("computePpdAtN", () => {
  it("computes PpD@N for a single order with exact depth", () => {
    const orders = [{ price: 2, quantity: 6 }];
    const result = computePpdAtN(orders, 45, 6);
    // cost = 2*6 = 12, ppd = 45*6/12 = 22.5
    expect(result.ppdAtN).toBeCloseTo(22.5);
    expect(result.shallow).toBe(false);
  });

  it("walks across a quantity boundary mid-order", () => {
    const orders = [
      { price: 2, quantity: 3 },
      { price: 4, quantity: 5 },
    ];
    const result = computePpdAtN(orders, 45, 6);
    // take 3@2=6, then 3@4=12 → cost=18, ppd=45*6/18=15
    expect(result.ppdAtN).toBeCloseTo(15);
    expect(result.shallow).toBe(false);
  });

  it("handles shallow book (< N units)", () => {
    const orders = [
      { price: 3, quantity: 2 },
      { price: 5, quantity: 2 },
    ];
    const result = computePpdAtN(orders, 45, 6);
    // only 4 units: cost = 6+10 = 16, ppd = 45*4/16 = 11.25
    expect(result.ppdAtN).toBeCloseTo(11.25);
    expect(result.shallow).toBe(true);
  });

  it("returns null ppdAtN and shallow=false for empty orders", () => {
    const result = computePpdAtN([], 45, 6);
    expect(result.ppdAtN).toBeNull();
    expect(result.shallow).toBe(false);
  });

  it("returns null ppdAtN and shallow=true for orders with zero quantity", () => {
    const orders = [{ price: 5, quantity: 0 }];
    const result = computePpdAtN(orders, 45, 6);
    expect(result.ppdAtN).toBeNull();
    expect(result.shallow).toBe(true);
  });

  it("takes only needed units from a large order", () => {
    const orders = [{ price: 3, quantity: 100 }];
    const result = computePpdAtN(orders, 45, 6);
    // cost = 3*6 = 18, ppd = 45*6/18 = 15
    expect(result.ppdAtN).toBeCloseTo(15);
    expect(result.shallow).toBe(false);
  });

  it("crosses three orders to fill N", () => {
    const orders = [
      { price: 1, quantity: 2 },
      { price: 2, quantity: 2 },
      { price: 3, quantity: 2 },
    ];
    const result = computePpdAtN(orders, 45, 6);
    // cost = 1*2 + 2*2 + 3*2 = 2+4+6 = 12, ppd = 45*6/12 = 22.5
    expect(result.ppdAtN).toBeCloseTo(22.5);
    expect(result.shallow).toBe(false);
  });
});

// ---------- computeVelocity ----------

describe("computeVelocity", () => {
  it("computes mean daily volume over the window", () => {
    const volumes = [10, 20, 30];
    expect(computeVelocity(volumes, 14)).toBeCloseTo(60 / 14);
  });

  it("handles sparse days (fewer rows than window)", () => {
    const volumes = [5, 3, 7];
    expect(computeVelocity(volumes, 14)).toBeCloseTo(15 / 14);
  });

  it("returns 0 for empty volumes", () => {
    expect(computeVelocity([], 14)).toBe(0);
  });

  it("handles single-day volume", () => {
    expect(computeVelocity([42], 14)).toBeCloseTo(42 / 14);
  });
});

// ---------- computeJunkRateFromRanked ----------

describe("computeJunkRateFromRanked", () => {
  it("computes 1/median of top-20 ppd values (odd count)", () => {
    const items = [
      { ppd_at_n: 10, shallow: false },
      { ppd_at_n: 20, shallow: false },
      { ppd_at_n: 15, shallow: false },
    ];
    // sorted: [10, 15, 20] → median = 15 → rate = 1/15
    expect(computeJunkRateFromRanked(items)).toBeCloseTo(1 / 15);
  });

  it("computes median for even count", () => {
    const items = [
      { ppd_at_n: 10, shallow: false },
      { ppd_at_n: 20, shallow: false },
    ];
    // sorted: [10, 20] → median = 15 → rate = 1/15
    expect(computeJunkRateFromRanked(items)).toBeCloseTo(1 / 15);
  });

  it("falls back when no depth data (all null)", () => {
    const items = [{ ppd_at_n: null, shallow: false }];
    expect(computeJunkRateFromRanked(items)).toBe(JUNK_RATE_FALLBACK);
  });

  it("falls back when all items are shallow", () => {
    const items = [{ ppd_at_n: 5, shallow: true }];
    expect(computeJunkRateFromRanked(items)).toBe(JUNK_RATE_FALLBACK);
  });

  it("falls back for empty input", () => {
    expect(computeJunkRateFromRanked([])).toBe(JUNK_RATE_FALLBACK);
  });

  it("uses custom fallback", () => {
    expect(computeJunkRateFromRanked([], 0.05)).toBe(0.05);
  });

  it("takes only top 20 items", () => {
    const items = [
      ...Array.from({ length: 20 }, () => ({ ppd_at_n: 10 as number | null, shallow: false })),
      ...Array.from({ length: 5 }, () => ({ ppd_at_n: 100 as number | null, shallow: false })),
    ];
    // top 20 are all 10 → median = 10 → rate = 1/10 = 0.1
    expect(computeJunkRateFromRanked(items)).toBeCloseTo(0.1);
  });

  it("excludes shallow items from the pool", () => {
    const items = [
      { ppd_at_n: 10, shallow: true },
      { ppd_at_n: 20, shallow: false },
    ];
    // only one non-shallow: ppd=20 → rate = 1/20 = 0.05
    expect(computeJunkRateFromRanked(items)).toBeCloseTo(0.05);
  });
});

// ---------- computeBaroRoi ----------

describe("computeBaroRoi", () => {
  it("computes ROI = resale − ducatCost × junkRate", () => {
    // resale=200, ducatCost=300, junkRate=0.1 → 200 − 30 = 170
    expect(computeBaroRoi(200, 300, 0.1)).toBeCloseTo(170);
  });

  it("returns negative ROI when unprofitable", () => {
    expect(computeBaroRoi(10, 300, 0.1)).toBeCloseTo(-20);
  });

  it("handles ROI exactly at zero", () => {
    expect(computeBaroRoi(30, 300, 0.1)).toBeCloseTo(0);
  });

  it("uses multiplication not division (known bug regression)", () => {
    // Old bug: resale − ducatCost / junkRate = 200 − 3000 = −2800
    // Correct: resale − ducatCost × junkRate = 200 − 30 = 170
    const roi = computeBaroRoi(200, 300, 0.1);
    expect(roi).toBeCloseTo(170);
    expect(roi).not.toBeCloseTo(-2800);
  });

  it("ROI sign flips around breakeven", () => {
    // Just above breakeven
    expect(computeBaroRoi(31, 300, 0.1)).toBeGreaterThan(0);
    // Just below breakeven
    expect(computeBaroRoi(29, 300, 0.1)).toBeLessThan(0);
  });
});

// ---------- isSpecialVisit ----------

describe("isSpecialVisit", () => {
  it("detects TennoCon by relay name (case insensitive)", () => {
    expect(isSpecialVisit("TennoCon 2025", 10)).toBe(true);
    expect(isSpecialVisit("tennocon relay", 5)).toBe(true);
    expect(isSpecialVisit("TENNOCON", 0)).toBe(true);
  });

  it("detects special by item count >= 150", () => {
    expect(isSpecialVisit("Larunda Relay", 150)).toBe(true);
    expect(isSpecialVisit(null, 200)).toBe(true);
  });

  it("returns false for normal visit", () => {
    expect(isSpecialVisit("Larunda Relay", 50)).toBe(false);
    expect(isSpecialVisit(null, 0)).toBe(false);
  });

  it("returns false at item count 149", () => {
    expect(isSpecialVisit("Larunda Relay", 149)).toBe(false);
  });

  it("handles null relay with low item count", () => {
    expect(isSpecialVisit(null, 10)).toBe(false);
  });
});
