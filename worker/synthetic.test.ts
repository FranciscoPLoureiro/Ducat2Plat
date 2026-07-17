import { describe, it, expect } from "vitest";
import {
  generateSyntheticData,
  MODS,
  EPOCH,
  VISIT_INTERVAL_DAYS,
  TOTAL_VISITS,
  TENNOCON_VISIT,
  dateStr,
  isoDate,
} from "./scripts/seed-synthetic";
import {
  computeBaseline,
  buildRecoverySeries,
  poolMedianCurve,
  extractRecoveryDays,
  computeRestockInterval,
  computeBaselineDrift,
  computeAdvisorVerdict,
  isInTennoConWindow,
  isSpecialVisit,
  BARO_CYCLE_DAYS,
  type DailyPrice,
} from "../shared/metrics";

const data = generateSyntheticData();

function pricesForMod(urlName: string): DailyPrice[] {
  return data.tradeStats
    .filter((s) => s.urlName === urlName)
    .map((s) => ({ date: s.statDate, median: s.median }));
}

function modDef(urlName: string) {
  return MODS.find((m) => m.urlName === urlName)!;
}

function runPipeline(urlName: string) {
  const mod = modDef(urlName);
  const prices = pricesForMod(urlName);

  const allSeries = [];
  const visitIndicesForMod: number[] = [];

  for (const visitIdx of mod.restockVisits) {
    const arrivalDays = visitIdx * VISIT_INTERVAL_DAYS;
    const arrivalDate = dateStr(EPOCH, arrivalDays);
    const departureDays = arrivalDays + 2;
    const departureDate = dateStr(EPOCH, departureDays);

    const baseline = computeBaseline(prices, arrivalDate);
    if (baseline === null || baseline <= 0) continue;

    const series = buildRecoverySeries(prices, departureDate, baseline);
    if (series.length > 0) {
      allSeries.push(series);
      visitIndicesForMod.push(visitIdx);
    }
  }

  const n = allSeries.length;
  const pooled = poolMedianCurve(allSeries);
  const recoveryDays = extractRecoveryDays(pooled);
  const restockInterval = computeRestockInterval(visitIndicesForMod);

  return { n, pooled, recoveryDays, restockInterval, allSeries };
}

// ── Stage / sample-size assertions ─────────────────────────────────

describe("synthetic pipeline — stage classification", () => {
  it("Synth-A1 → Stage A (n=1)", () => {
    const { n } = runPipeline("primed_synth_a1");
    expect(n).toBe(1);
    expect(n).toBeLessThan(3);
  });

  it("Synth-A2 → Stage A (n=1)", () => {
    const { n } = runPipeline("primed_synth_a2");
    expect(n).toBe(1);
    expect(n).toBeLessThan(3);
  });

  it("Synth-B1 → Stage B (n=4)", () => {
    const { n } = runPipeline("primed_synth_b1");
    expect(n).toBe(4);
    expect(n).toBeGreaterThanOrEqual(3);
  });

  it("Synth-B2 → Stage B (n=5)", () => {
    const { n } = runPipeline("primed_synth_b2");
    expect(n).toBe(5);
  });

  it("Synth-B3 → Stage B (n=3)", () => {
    const { n } = runPipeline("primed_synth_b3");
    expect(n).toBe(3);
  });

  it("Synth-C1 → Stage C candidate (n=6, archive > 12 months)", () => {
    const { n } = runPipeline("primed_synth_c1");
    expect(n).toBe(6);
    const totalDays = TOTAL_VISITS * VISIT_INTERVAL_DAYS;
    expect(totalDays / 30).toBeGreaterThan(12);
  });
});

// ── Recovery-days assertions ───────────────────────────────────────

describe("synthetic pipeline — recovery days", () => {
  it("Synth-B1 recovers within scripted window (21d)", () => {
    const { recoveryDays } = runPipeline("primed_synth_b1");
    expect(recoveryDays).not.toBeNull();
    expect(recoveryDays!).toBeGreaterThan(0);
    expect(recoveryDays!).toBeLessThanOrEqual(21);
  });

  it("Synth-B2 recovers within scripted window (14d)", () => {
    const { recoveryDays } = runPipeline("primed_synth_b2");
    expect(recoveryDays).not.toBeNull();
    expect(recoveryDays!).toBeGreaterThan(0);
    expect(recoveryDays!).toBeLessThanOrEqual(14);
  });

  it("Synth-B3 recovers within scripted window (35d)", () => {
    const { recoveryDays } = runPipeline("primed_synth_b3");
    expect(recoveryDays).not.toBeNull();
    expect(recoveryDays!).toBeGreaterThan(0);
    expect(recoveryDays!).toBeLessThanOrEqual(35);
  });

  it("Synth-C1 recovers within scripted window (21d)", () => {
    const { recoveryDays } = runPipeline("primed_synth_c1");
    expect(recoveryDays).not.toBeNull();
    expect(recoveryDays!).toBeLessThanOrEqual(21);
  });

  it("recovery days are always within MAX_RECOVERY_DAYS (42)", () => {
    for (const mod of MODS) {
      const { recoveryDays } = runPipeline(mod.urlName);
      if (recoveryDays !== null) {
        expect(recoveryDays).toBeLessThanOrEqual(42);
      }
    }
  });
});

// ── Restock risk ───────────────────────────────────────────────────

describe("synthetic pipeline — restock interval", () => {
  it("Synth-B4 has shortest restock interval (2 visits = 28d)", () => {
    const { restockInterval } = runPipeline("primed_synth_b4");
    expect(restockInterval).toBe(2);
  });

  it("Synth-B4 frequent restocking contaminates baselines", () => {
    // B4's restocks at [1,3,5,7] are so close that each recovery window
    // overlaps the next visit's baseline window, depressing the computed
    // baseline and making recovery appear artificially fast.
    const { recoveryDays } = runPipeline("primed_synth_b4");
    expect(recoveryDays).not.toBeNull();
    expect(recoveryDays!).toBeLessThan(modDef("primed_synth_b4").recoveryDays);
  });

  it("Synth-B1 has wide restock interval (7 visits = 98d)", () => {
    const { recoveryDays, restockInterval } = runPipeline("primed_synth_b1");
    expect(restockInterval).toBe(7);
    const restockDays = restockInterval! * BARO_CYCLE_DAYS;
    expect(recoveryDays).not.toBeNull();
    expect(restockDays).toBeGreaterThan(recoveryDays!);
  });
});

// ── Advisor verdict ────────────────────────────────────────────────

describe("synthetic pipeline — advisor verdict", () => {
  it("Synth-Skip → SKIP (baseline 20p far below ducat cost)", () => {
    const mod = modDef("primed_synth_skip");
    const prices = pricesForMod("primed_synth_skip");
    const latestVisitIdx = mod.restockVisits[mod.restockVisits.length - 1];
    const arrivalDate = dateStr(EPOCH, latestVisitIdx * VISIT_INTERVAL_DAYS);
    const baseline = computeBaseline(prices, arrivalDate);

    expect(baseline).not.toBeNull();
    expect(baseline!).toBeLessThan(mod.ducatCost);

    const sellNowProfit = (baseline ?? 0) - mod.ducatCost * 0.1;
    const { verdict } = computeAdvisorVerdict(
      sellNowProfit,
      null,
      null,
      mod.ducatCost,
    );
    expect(verdict).toBe("SKIP");
  });

  it("profitable mod → BUY & HOLD or BUY & FLIP (not SKIP)", () => {
    const mod = modDef("primed_synth_b1");
    const prices = pricesForMod("primed_synth_b1");
    const { recoveryDays, pooled } = runPipeline("primed_synth_b1");

    const latestVisitIdx = mod.restockVisits[mod.restockVisits.length - 1];
    const arrivalDate = dateStr(EPOCH, latestVisitIdx * VISIT_INTERVAL_DAYS);
    const baseline = computeBaseline(prices, arrivalDate)!;

    const currentPrice = prices[prices.length - 1].median;
    const sellNowProfit = currentPrice - mod.ducatCost * 0.1;
    const holdProfit = baseline * 0.95 - mod.ducatCost * 0.1;

    const { verdict } = computeAdvisorVerdict(
      sellNowProfit,
      holdProfit,
      recoveryDays,
      mod.ducatCost,
    );
    expect(verdict).not.toBe("SKIP");
  });
});

// ── Baseline drift ─────────────────────────────────────────────────

describe("synthetic pipeline — baseline drift", () => {
  it("Synth-C2 Declining has negative baseline drift", () => {
    const prices = pricesForMod("primed_synth_c2_declining");
    const totalDays = TOTAL_VISITS * VISIT_INTERVAL_DAYS;
    const referenceDate = dateStr(EPOCH, totalDays);

    const drift = computeBaselineDrift(prices, referenceDate);
    expect(drift).not.toBeNull();
    expect(drift!.drift).toBeLessThan(0);
    expect(drift!.shortBaseline).toBeLessThan(drift!.longBaseline);
  });

  it("Synth-B1 (constant baseline) has near-zero drift", () => {
    const prices = pricesForMod("primed_synth_b1");
    const totalDays = TOTAL_VISITS * VISIT_INTERVAL_DAYS;
    const referenceDate = dateStr(EPOCH, totalDays);

    const drift = computeBaselineDrift(prices, referenceDate);
    if (drift !== null) {
      expect(Math.abs(drift.drift)).toBeLessThan(0.05);
    }
  });
});

// ── TennoCon detection ─────────────────────────────────────────────

describe("synthetic pipeline — TennoCon", () => {
  it("detects TennoCon visit as special", () => {
    const tcVisit = data.visits[TENNOCON_VISIT];
    expect(isSpecialVisit(tcVisit.relay, data.visitItems.filter(
      (vi) => vi.visitIndex === TENNOCON_VISIT,
    ).length)).toBe(true);
  });

  it("TennoCon window detection works near the event", () => {
    const tcArrival = isoDate(EPOCH, TENNOCON_VISIT * VISIT_INTERVAL_DAYS);
    const specialDates = [tcArrival];
    const sixWeeksBefore = dateStr(
      EPOCH,
      TENNOCON_VISIT * VISIT_INTERVAL_DAYS - 30,
    );
    expect(isInTennoConWindow(specialDates, sixWeeksBefore, 6)).toBe(true);

    const longBefore = dateStr(
      EPOCH,
      TENNOCON_VISIT * VISIT_INTERVAL_DAYS - 100,
    );
    expect(isInTennoConWindow(specialDates, longBefore, 6)).toBe(false);
  });
});

// ── Data integrity ─────────────────────────────────────────────────

describe("synthetic data integrity", () => {
  it("generates expected number of visits", () => {
    expect(data.visits).toHaveLength(TOTAL_VISITS);
  });

  it("all visits have arrival < departure", () => {
    for (const v of data.visits) {
      expect(new Date(v.arrival).getTime()).toBeLessThan(
        new Date(v.departure).getTime(),
      );
    }
  });

  it("exactly one TennoCon visit", () => {
    const special = data.visits.filter((v) => v.isSpecial);
    expect(special).toHaveLength(1);
    expect(special[0].index).toBe(TENNOCON_VISIT);
  });

  it("every mod has trade stats covering the full timeline", () => {
    for (const mod of MODS) {
      const stats = data.tradeStats.filter((s) => s.urlName === mod.urlName);
      expect(stats.length).toBeGreaterThan(TOTAL_VISITS * VISIT_INTERVAL_DAYS);
    }
  });

  it("TennoCon visit has all mods", () => {
    const tcItems = data.visitItems.filter(
      (vi) => vi.visitIndex === TENNOCON_VISIT,
    );
    expect(tcItems.length).toBe(MODS.length);
  });

  it("generates deterministic output", () => {
    const data2 = generateSyntheticData();
    expect(data.tradeStats.length).toBe(data2.tradeStats.length);
    expect(data.tradeStats[100].median).toBe(data2.tradeStats[100].median);
    expect(data.visits.length).toBe(data2.visits.length);
  });
});
