import { describe, it, expect } from "vitest";
import { computeVisitForecast, likelihoodFor } from "./metrics";

const item = (name: string, visits_ago: number[], ducats = 100) => ({
  item_name: name,
  ducat_cost: ducats,
  credit_cost: 50000,
  visits_ago,
});

describe("computeVisitForecast", () => {
  it("skips items with fewer than 3 appearances", () => {
    const out = computeVisitForecast([item("Rare", [0, 5])]);
    expect(out).toHaveLength(0);
  });

  it("an every-visit item that came last visit is DUE next visit", () => {
    // gaps 1,1,1 -> median 1; last seen 0 -> gapAtNext 1 -> ratio 1
    const out = computeVisitForecast([item("Regular", [0, 1, 2, 3])]);
    expect(out).toHaveLength(1);
    expect(out[0].medianGap).toBe(1);
    expect(out[0].dueRatio).toBe(1);
    expect(out[0].likelihood).toBe("DUE");
  });

  it("an item absent far past its typical gap is OVERDUE", () => {
    // gaps 3,3 -> median 3; last seen 8 -> gapAtNext 9 -> ratio 3
    const out = computeVisitForecast([item("Ghost", [8, 11, 14])]);
    expect(out[0].dueRatio).toBe(3);
    expect(out[0].likelihood).toBe("OVERDUE");
  });

  it("an item that just restocked with a long cycle is UNLIKELY", () => {
    // gaps 6,6 -> median 6; last seen 0 -> gapAtNext 1 -> ratio ~0.17
    const out = computeVisitForecast([item("Fresh", [0, 6, 12])]);
    expect(out[0].likelihood).toBe("UNLIKELY");
  });

  it("sorts by due ratio descending", () => {
    const out = computeVisitForecast([
      item("Fresh", [0, 6, 12]),
      item("Ghost", [8, 11, 14]),
      item("Regular", [0, 1, 2, 3]),
    ]);
    expect(out.map((f) => f.item_name)).toEqual(["Ghost", "Regular", "Fresh"]);
  });
});

describe("likelihoodFor", () => {
  it("maps ratio bands to tiers", () => {
    expect(likelihoodFor(1.5)).toBe("OVERDUE");
    expect(likelihoodFor(1.0)).toBe("DUE");
    expect(likelihoodFor(0.7)).toBe("POSSIBLE");
    expect(likelihoodFor(0.3)).toBe("UNLIKELY");
  });
});
