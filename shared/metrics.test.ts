import { describe, it, expect } from "vitest";
import {
  computePpdAtN,
  computeVelocity,
  computeJunkRateFromRanked,
  computeBaroRoi,
  isSpecialVisit,
  JUNK_RATE_FALLBACK,
  computeMedian,
  computeBaseline,
  buildRecoverySeries,
  poolMedianCurve,
  extractRecoveryDays,
  computeRestockInterval,
  computeBaselineDrift,
  isInTennoConWindow,
  computeAdvisorVerdict,
  greedyBasketOptimize,
  RECOVERY_THRESHOLD,
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

// ---------- computeMedian ----------

describe("computeMedian", () => {
  it("returns median of odd-length array", () => {
    expect(computeMedian([3, 1, 2])).toBe(2);
  });

  it("returns median of even-length array", () => {
    expect(computeMedian([4, 1, 3, 2])).toBe(2.5);
  });

  it("returns single element", () => {
    expect(computeMedian([5])).toBe(5);
  });

  it("returns null for empty array", () => {
    expect(computeMedian([])).toBeNull();
  });

  it("does not mutate input", () => {
    const arr = [3, 1, 2];
    computeMedian(arr);
    expect(arr).toEqual([3, 1, 2]);
  });
});

// ---------- computeBaseline ----------

describe("computeBaseline", () => {
  const prices = [
    { date: "2025-01-01", median: 100 },
    { date: "2025-01-10", median: 120 },
    { date: "2025-01-20", median: 110 },
    { date: "2025-01-25", median: 130 },
    { date: "2025-02-05", median: 80 },
    { date: "2025-02-10", median: 60 },
  ];

  it("computes median over 30d window before arrival", () => {
    // Before 2025-02-10, 30d window = [2025-01-11, 2025-02-10)
    // Prices in window: 120 (1/10 is outside), 110, 130, 80 → sorted [80,110,120,130] → median 115
    // Wait, 1/10 is not in [1/11, 2/10). Let me recalculate.
    // 2025-02-10 - 30d = 2025-01-11. So window = [2025-01-11, 2025-02-10)
    // 2025-01-10 < 2025-01-11, excluded
    // 2025-01-20 (110) ✓, 2025-01-25 (130) ✓, 2025-02-05 (80) ✓
    // sorted: [80, 110, 130] → median = 110
    expect(computeBaseline(prices, "2025-02-10")).toBe(110);
  });

  it("returns null when no prices in window", () => {
    expect(computeBaseline(prices, "2024-01-01")).toBeNull();
  });

  it("uses custom window size", () => {
    // 10d before 2025-02-10 = [2025-01-31, 2025-02-10)
    // Only 2025-02-05 (80) is in range → median = 80
    expect(computeBaseline(prices, "2025-02-10", 10)).toBe(80);
  });

  it("handles timestamps (ISO format) as beforeDate", () => {
    // Noon Feb 10 shifts window to [Jan 11 noon, Feb 10 noon)
    // Includes: 1/20 (110), 1/25 (130), 2/5 (80), 2/10 midnight (60) → median 95
    const result = computeBaseline(prices, "2025-02-10T12:00:00Z");
    expect(result).toBe(95);
  });

  it("excludes prices exactly on beforeDate", () => {
    // Before 2025-01-20, 30d window → only 2025-01-01 (100), 2025-01-10 (120)
    // sorted: [100, 120] → median 110
    expect(computeBaseline(prices, "2025-01-20")).toBe(110);
  });
});

// ---------- buildRecoverySeries ----------

describe("buildRecoverySeries", () => {
  const prices = [
    { date: "2025-01-01", median: 50 },
    { date: "2025-01-02", median: 60 },
    { date: "2025-01-03", median: 70 },
    { date: "2025-01-10", median: 90 },
    { date: "2025-03-01", median: 100 },
  ];

  it("normalizes prices after departure relative to baseline", () => {
    const series = buildRecoverySeries(prices, "2025-01-01", 100);
    // day 0 = 2025-01-01 → 50/100 = 0.5
    // day 1 = 2025-01-02 → 60/100 = 0.6
    // day 2 = 2025-01-03 → 70/100 = 0.7
    // day 9 = 2025-01-10 → 90/100 = 0.9
    expect(series).toHaveLength(4);
    expect(series[0]).toEqual({ day: 0, value: 0.5 });
    expect(series[1]).toEqual({ day: 1, value: 0.6 });
    expect(series[3]).toEqual({ day: 9, value: 0.9 });
  });

  it("caps at maxDays (default 42)", () => {
    // 2025-03-01 is 59 days after 2025-01-01, beyond 42
    const series = buildRecoverySeries(prices, "2025-01-01", 100);
    expect(series.every((p) => p.day <= 42)).toBe(true);
    expect(series).toHaveLength(4); // excludes 2025-03-01
  });

  it("returns empty for baseline <= 0", () => {
    expect(buildRecoverySeries(prices, "2025-01-01", 0)).toEqual([]);
    expect(buildRecoverySeries(prices, "2025-01-01", -10)).toEqual([]);
  });

  it("returns empty when no prices after departure", () => {
    const series = buildRecoverySeries(prices, "2025-04-01", 100);
    expect(series).toEqual([]);
  });

  it("handles timestamp departure date", () => {
    const series = buildRecoverySeries(prices, "2025-01-01T18:00:00Z", 100);
    expect(series[0]).toEqual({ day: 0, value: 0.5 });
  });

  it("respects custom maxDays", () => {
    const series = buildRecoverySeries(prices, "2025-01-01", 100, 5);
    // Only day 0,1,2 fit within 5 days
    expect(series).toHaveLength(3);
    expect(series.every((p) => p.day <= 5)).toBe(true);
  });
});

// ---------- poolMedianCurve ----------

describe("poolMedianCurve", () => {
  it("computes median across series at each day", () => {
    const s1 = [
      { day: 0, value: 0.5 },
      { day: 1, value: 0.7 },
      { day: 2, value: 0.9 },
    ];
    const s2 = [
      { day: 0, value: 0.6 },
      { day: 1, value: 0.8 },
      { day: 2, value: 1.0 },
    ];
    const s3 = [
      { day: 0, value: 0.4 },
      { day: 1, value: 0.6 },
      { day: 2, value: 0.95 },
    ];
    const curve = poolMedianCurve([s1, s2, s3]);
    expect(curve[0]).toEqual({ day: 0, median: 0.5 }); // [0.4, 0.5, 0.6] → 0.5
    expect(curve[1]).toEqual({ day: 1, median: 0.7 }); // [0.6, 0.7, 0.8] → 0.7
    expect(curve[2]).toEqual({ day: 2, median: 0.95 }); // [0.9, 0.95, 1.0] → 0.95
  });

  it("handles sparse days (not all series have every day)", () => {
    const s1 = [{ day: 0, value: 0.5 }, { day: 2, value: 0.9 }];
    const s2 = [{ day: 1, value: 0.7 }, { day: 2, value: 1.0 }];
    const curve = poolMedianCurve([s1, s2]);
    expect(curve).toHaveLength(3);
    expect(curve[0]).toEqual({ day: 0, median: 0.5 }); // only s1
    expect(curve[1]).toEqual({ day: 1, median: 0.7 }); // only s2
    expect(curve[2]).toEqual({ day: 2, median: 0.95 }); // [0.9, 1.0]
  });

  it("returns empty for empty input", () => {
    expect(poolMedianCurve([])).toEqual([]);
  });

  it("handles single series", () => {
    const s1 = [{ day: 0, value: 0.6 }, { day: 5, value: 0.95 }];
    const curve = poolMedianCurve([s1]);
    expect(curve).toEqual([
      { day: 0, median: 0.6 },
      { day: 5, median: 0.95 },
    ]);
  });
});

// ---------- extractRecoveryDays ----------

describe("extractRecoveryDays", () => {
  it("returns first day at or above threshold", () => {
    const curve = [
      { day: 0, median: 0.5 },
      { day: 5, median: 0.8 },
      { day: 10, median: 0.94 },
      { day: 15, median: 0.95 },
      { day: 20, median: 1.0 },
    ];
    expect(extractRecoveryDays(curve)).toBe(15);
  });

  it("returns null when never recovered", () => {
    const curve = [
      { day: 0, median: 0.5 },
      { day: 42, median: 0.9 },
    ];
    expect(extractRecoveryDays(curve)).toBeNull();
  });

  it("returns day 0 when already recovered at departure", () => {
    const curve = [
      { day: 0, median: 0.96 },
      { day: 5, median: 1.0 },
    ];
    expect(extractRecoveryDays(curve)).toBe(0);
  });

  it("returns null for empty curve", () => {
    expect(extractRecoveryDays([])).toBeNull();
  });

  it("uses custom threshold", () => {
    const curve = [
      { day: 0, median: 0.5 },
      { day: 5, median: 0.85 },
      { day: 10, median: 0.95 },
    ];
    expect(extractRecoveryDays(curve, 0.85)).toBe(5);
  });

  it("defaults to RECOVERY_THRESHOLD (0.95)", () => {
    const curve = [{ day: 7, median: RECOVERY_THRESHOLD }];
    expect(extractRecoveryDays(curve)).toBe(7);
  });
});

// ---------- computeRestockInterval ----------

describe("computeRestockInterval", () => {
  it("computes median gap between visit indices", () => {
    // Visits at indices [0, 5, 11, 20] → gaps [5, 6, 9] → median 6
    expect(computeRestockInterval([0, 5, 11, 20])).toBe(6);
  });

  it("handles two visits (single gap)", () => {
    expect(computeRestockInterval([0, 10])).toBe(10);
  });

  it("returns null for single visit", () => {
    expect(computeRestockInterval([5])).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(computeRestockInterval([])).toBeNull();
  });

  it("handles unsorted input", () => {
    expect(computeRestockInterval([20, 0, 11, 5])).toBe(6);
  });

  it("handles even number of gaps (median is average)", () => {
    // [0, 5, 15, 25] → gaps [5, 10, 10] → sorted [5, 10, 10] → median 10
    expect(computeRestockInterval([0, 5, 15, 25])).toBe(10);
  });
});

// ---------- computeBaselineDrift ----------

describe("computeBaselineDrift", () => {
  it("detects positive drift (price grew)", () => {
    // 365-day baseline=100, 90-day baseline=130 → drift = (130-100)/100 = 0.3
    const prices = [
      ...Array.from({ length: 300 }, (_, i) => ({
        date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
        median: 100,
      })),
      ...Array.from({ length: 90 }, (_, i) => ({
        date: new Date(Date.UTC(2024, 9, 28 + i)).toISOString().slice(0, 10),
        median: 130,
      })),
    ];
    const result = computeBaselineDrift(prices, "2025-02-01");
    expect(result).not.toBeNull();
    expect(result!.drift).toBeCloseTo(0.3);
    expect(result!.shortBaseline).toBe(130);
    expect(result!.longBaseline).toBe(100);
  });

  it("detects negative drift (price declined)", () => {
    const prices = [
      ...Array.from({ length: 300 }, (_, i) => ({
        date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
        median: 200,
      })),
      ...Array.from({ length: 90 }, (_, i) => ({
        date: new Date(Date.UTC(2024, 9, 28 + i)).toISOString().slice(0, 10),
        median: 140,
      })),
    ];
    const result = computeBaselineDrift(prices, "2025-02-01");
    expect(result).not.toBeNull();
    expect(result!.drift).toBeCloseTo(-0.3);
  });

  it("returns null when short window has no data", () => {
    const prices = [{ date: "2024-01-01", median: 100 }];
    expect(computeBaselineDrift(prices, "2025-06-01")).toBeNull();
  });

  it("returns null when no data covers either window", () => {
    const prices = [{ date: "2020-01-01", median: 100 }];
    expect(computeBaselineDrift(prices, "2025-06-01")).toBeNull();
  });
});

// ---------- isInTennoConWindow ----------

describe("isInTennoConWindow", () => {
  it("returns true when special visit is within window", () => {
    expect(isInTennoConWindow(["2025-07-19"], "2025-06-15", 6)).toBe(true);
  });

  it("returns false when special visit is beyond window", () => {
    expect(isInTennoConWindow(["2025-07-19"], "2025-05-01", 6)).toBe(false);
  });

  it("returns false when special visit is in the past", () => {
    expect(isInTennoConWindow(["2025-07-19"], "2025-08-01", 6)).toBe(false);
  });

  it("returns false for empty dates", () => {
    expect(isInTennoConWindow([], "2025-06-15", 6)).toBe(false);
  });

  it("checks multiple dates and finds one in window", () => {
    expect(
      isInTennoConWindow(["2024-07-20", "2025-07-19"], "2025-06-15", 6),
    ).toBe(true);
  });

  it("returns true at exact window boundary", () => {
    // 6 weeks = 42 days. 2025-07-19 - 42 days = 2025-06-07
    expect(isInTennoConWindow(["2025-07-19"], "2025-06-07", 6)).toBe(true);
  });
});

// ---------- computeAdvisorVerdict ----------

describe("computeAdvisorVerdict", () => {
  it("returns BUY & HOLD when hold profit > sell now", () => {
    const result = computeAdvisorVerdict(50, 100, 21, 300);
    expect(result.verdict).toBe("BUY & HOLD");
    expect(result.profitPerDay).toBeCloseTo(50 / 21);
    expect(result.profitPerDucat).toBeCloseTo(100 / 300);
  });

  it("returns BUY & FLIP when sell now >= hold profit", () => {
    const result = computeAdvisorVerdict(100, 80, 21, 300);
    expect(result.verdict).toBe("BUY & FLIP");
    expect(result.profitPerDay).toBeNull();
    expect(result.profitPerDucat).toBeCloseTo(100 / 300);
  });

  it("returns SKIP when both profits are negative", () => {
    const result = computeAdvisorVerdict(-10, -5, 21, 300);
    expect(result.verdict).toBe("SKIP");
    expect(result.profitPerDay).toBeNull();
    expect(result.profitPerDucat).toBe(0);
  });

  it("returns BUY & FLIP when hold data is null and sell is positive", () => {
    const result = computeAdvisorVerdict(50, null, null, 300);
    expect(result.verdict).toBe("BUY & FLIP");
    expect(result.profitPerDucat).toBeCloseTo(50 / 300);
  });

  it("returns SKIP when hold data is null and sell is negative", () => {
    const result = computeAdvisorVerdict(-10, null, null, 300);
    expect(result.verdict).toBe("SKIP");
  });

  it("returns BUY & FLIP when holdDays is 0", () => {
    const result = computeAdvisorVerdict(50, 100, 0, 300);
    expect(result.verdict).toBe("BUY & FLIP");
  });

  it("handles ducatCost = 0 without division error", () => {
    const result = computeAdvisorVerdict(50, 100, 21, 0);
    expect(result.profitPerDucat).toBe(0);
  });

  it("SKIP when sell now = 0 and hold = 0", () => {
    const result = computeAdvisorVerdict(0, 0, 21, 300);
    expect(result.verdict).toBe("SKIP");
  });
});

// ---------- greedyBasketOptimize ----------

describe("greedyBasketOptimize", () => {
  it("selects items greedily by profitPerDucat", () => {
    const items = [
      { index: 0, ducatCost: 300, profitPerDucat: 0.5 },
      { index: 1, ducatCost: 200, profitPerDucat: 0.8 },
      { index: 2, ducatCost: 100, profitPerDucat: 0.3 },
    ];
    // Wallet = 400. Sorted by ppd: [1(0.8,200), 0(0.5,300), 2(0.3,100)]
    // Take 1 (200 remain), take 2 (100 remain). 0 doesn't fit.
    const result = greedyBasketOptimize(items, 400);
    expect(result).toEqual([1, 2]);
  });

  it("returns all items when wallet is large enough", () => {
    const items = [
      { index: 0, ducatCost: 100, profitPerDucat: 0.5 },
      { index: 1, ducatCost: 200, profitPerDucat: 0.3 },
    ];
    const result = greedyBasketOptimize(items, 1000);
    expect(result).toHaveLength(2);
  });

  it("excludes items with non-positive profitPerDucat", () => {
    const items = [
      { index: 0, ducatCost: 100, profitPerDucat: 0.5 },
      { index: 1, ducatCost: 50, profitPerDucat: 0 },
      { index: 2, ducatCost: 50, profitPerDucat: -0.1 },
    ];
    const result = greedyBasketOptimize(items, 1000);
    expect(result).toEqual([0]);
  });

  it("returns empty for empty input", () => {
    expect(greedyBasketOptimize([], 500)).toEqual([]);
  });

  it("returns empty when wallet is 0", () => {
    const items = [{ index: 0, ducatCost: 100, profitPerDucat: 0.5 }];
    expect(greedyBasketOptimize(items, 0)).toEqual([]);
  });

  it("skips expensive items and takes cheaper ones", () => {
    const items = [
      { index: 0, ducatCost: 500, profitPerDucat: 1.0 },
      { index: 1, ducatCost: 100, profitPerDucat: 0.9 },
      { index: 2, ducatCost: 100, profitPerDucat: 0.8 },
    ];
    // Wallet = 200. Sorted: [0(1.0,500), 1(0.9,100), 2(0.8,100)]
    // 0 doesn't fit, take 1, take 2
    const result = greedyBasketOptimize(items, 200);
    expect(result).toEqual([1, 2]);
  });
});
