import { describe, it, expect } from "vitest";
import {
  generateSyntheticData,
  MODS,
  EPOCH,
  VISIT_INTERVAL_DAYS,
  TOTAL_VISITS,
  dateStr,
  isoDate,
} from "./scripts/seed-synthetic";
import {
  evaluateSellSignal,
  formatSellSignalMessage,
  type SellSignalCondition,
  type SellSignalPosition,
} from "../shared/metrics";

const data = generateSyntheticData();

function latestPriceForMod(urlName: string): number {
  const stats = data.tradeStats.filter((s) => s.urlName === urlName);
  return stats[stats.length - 1].median;
}

// Simulate the full position lifecycle:
// 1. Create a position for Synth-B1 (baseline 300, bought at ducat cost 350)
// 2. Evaluate sell signals with current price at baseline (target should hit)
// 3. Assert one alert fires
// 4. Evaluate again with same condition → assert zero (no re-alert)

describe("positions e2e — sell signal lifecycle", () => {
  const mod = MODS.find((m) => m.urlName === "primed_synth_b1")!;
  const totalDays = TOTAL_VISITS * VISIT_INTERVAL_DAYS;
  const currentPrice = latestPriceForMod(mod.urlName);
  const junkRate = 0.1;
  const costPlat = mod.ducatCost * junkRate; // 350 * 0.1 = 35p
  const baselineAtBuy = mod.baseline; // 300p
  const targetPrice = baselineAtBuy * 0.95; // 285p

  it("Synth-B1 current price is at or above baseline (recovered)", () => {
    expect(currentPrice).toBeGreaterThanOrEqual(baselineAtBuy * 0.9);
  });

  it("target_hit fires when current median >= target", () => {
    const signal = evaluateSellSignal({
      currentMedian: currentPrice,
      targetPrice,
      acquiredAt: isoDate(EPOCH, totalDays - 30),
      recoveryDays: 21,
      isRestocked: false,
      alertedConditions: [],
      now: isoDate(EPOCH, totalDays),
    });

    expect(signal).toBe("target_hit");
  });

  it("no re-alert for same condition (target_hit)", () => {
    // Only target_hit would fire (held < recovery_days, so no recovery_elapsed)
    const signal = evaluateSellSignal({
      currentMedian: currentPrice,
      targetPrice,
      acquiredAt: isoDate(EPOCH, totalDays - 10), // only 10 days held < 21 recovery
      recoveryDays: 21,
      isRestocked: false,
      alertedConditions: ["target_hit"],
      now: isoDate(EPOCH, totalDays),
    });

    expect(signal).toBeNull();
  });

  it("recovery_elapsed fires on a position held long enough", () => {
    const signal = evaluateSellSignal({
      currentMedian: 100, // below target, so target_hit won't fire
      targetPrice: 285,
      acquiredAt: isoDate(EPOCH, 0),
      recoveryDays: 21,
      isRestocked: false,
      alertedConditions: [],
      now: isoDate(EPOCH, 25), // 25 days held > 21 recovery_days
    });

    expect(signal).toBe("recovery_elapsed");
  });

  it("no re-alert after recovery_elapsed already recorded", () => {
    const signal = evaluateSellSignal({
      currentMedian: 100,
      targetPrice: 285,
      acquiredAt: isoDate(EPOCH, 0),
      recoveryDays: 21,
      isRestocked: false,
      alertedConditions: ["recovery_elapsed"],
      now: isoDate(EPOCH, 30),
    });

    expect(signal).toBeNull();
  });

  it("restocked signal fires and takes priority", () => {
    const signal = evaluateSellSignal({
      currentMedian: 300, // would trigger target_hit too
      targetPrice: 285,
      acquiredAt: isoDate(EPOCH, 0),
      recoveryDays: 21,
      isRestocked: true,
      alertedConditions: [],
      now: isoDate(EPOCH, 25),
    });

    expect(signal).toBe("restocked");
  });

  it("after restocked alert, target_hit can still fire separately", () => {
    const signal = evaluateSellSignal({
      currentMedian: 300,
      targetPrice: 285,
      acquiredAt: isoDate(EPOCH, 0),
      recoveryDays: 21,
      isRestocked: true,
      alertedConditions: ["restocked"],
      now: isoDate(EPOCH, 25),
    });

    // Restocked already alerted, check target_hit
    expect(signal).toBe("target_hit");
  });
});

describe("positions e2e — full sweep simulation", () => {
  it("create position → sweep → exactly one alert → sweep again → zero alerts", () => {
    const mod = MODS.find((m) => m.urlName === "primed_synth_b1")!;
    const totalDays = TOTAL_VISITS * VISIT_INTERVAL_DAYS;
    const currentPrice = latestPriceForMod(mod.urlName);
    const junkRate = 0.1;
    const costPlat = mod.ducatCost * junkRate;
    const baselineAtBuy = mod.baseline;
    const targetPrice = baselineAtBuy * 0.95;

    // Position held only 10 days — only target_hit can fire, not recovery_elapsed
    const alertedConditions: string[] = [];

    // --- First sweep ---
    const signal1 = evaluateSellSignal({
      currentMedian: currentPrice,
      targetPrice,
      acquiredAt: isoDate(EPOCH, totalDays - 10),
      recoveryDays: 21,
      isRestocked: false,
      alertedConditions,
      now: isoDate(EPOCH, totalDays),
    });

    expect(signal1).not.toBeNull();
    expect(signal1).toBe("target_hit");

    // Record the alert (simulating DB update)
    alertedConditions.push(signal1!);

    // Format and verify Discord message
    const positions: SellSignalPosition[] = [{
      id: 1,
      itemName: mod.name,
      qty: 1,
      costPlat,
      currentMedian: currentPrice,
      targetPrice,
      signal: signal1!,
      pnl: (currentPrice - costPlat) * 1,
    }];
    const message = formatSellSignalMessage(positions, 30);
    expect(message).toContain(mod.name);
    expect(message).toContain("Target price reached");
    expect(message.length).toBeGreaterThan(0);

    // --- Second sweep (same conditions, 1 day later — still <21d held) ---
    const signal2 = evaluateSellSignal({
      currentMedian: currentPrice,
      targetPrice,
      acquiredAt: isoDate(EPOCH, totalDays - 10),
      recoveryDays: 21,
      isRestocked: false,
      alertedConditions,
      now: isoDate(EPOCH, totalDays + 1),
    });

    // target_hit already alerted, and only 11 days held < 21 recovery, so no signal
    expect(signal2).toBeNull();
  });

  it("never re-alerts a condition that already fired (no ping-pong)", () => {
    const base = {
      currentMedian: 50,
      targetPrice: 40,
      acquiredAt: isoDate(EPOCH, 0),
      recoveryDays: 10,
      now: isoDate(EPOCH, 20),
    };
    const alerted: string[] = [];

    const s1 = evaluateSellSignal({ ...base, isRestocked: true, alertedConditions: alerted });
    expect(s1).toBe("restocked");
    alerted.push(s1!);

    const s2 = evaluateSellSignal({ ...base, isRestocked: true, alertedConditions: alerted });
    expect(s2).toBe("target_hit");
    alerted.push(s2!);

    // Restocked already alerted — must not fire again even though still restocked
    const s3 = evaluateSellSignal({ ...base, isRestocked: true, alertedConditions: alerted });
    expect(s3).toBe("recovery_elapsed");
    alerted.push(s3!);

    const s4 = evaluateSellSignal({ ...base, isRestocked: true, alertedConditions: alerted });
    expect(s4).toBeNull();
  });

  it("combined message when >3 positions signal with trade-cap reminder", () => {
    const signaling: SellSignalPosition[] = [];

    for (let i = 0; i < 4; i++) {
      const mod = MODS[i + 2]; // B1, B2, B3, B4
      const price = latestPriceForMod(mod.urlName);
      const costPlat = mod.ducatCost * 0.1;
      signaling.push({
        id: i + 1,
        itemName: mod.name,
        qty: 1,
        costPlat,
        currentMedian: price,
        targetPrice: mod.baseline * 0.95,
        signal: "target_hit",
        pnl: (price - costPlat) * 1,
      });
    }

    const message = formatSellSignalMessage(signaling, 20);
    expect(message).toContain("4 positions signaling");
    expect(message).toContain("20 trades");
    expect(message).toContain("MR20");

    // Verify sorted by P/L descending
    const lines = message.split("\n").filter((l) => l.startsWith("- **"));
    expect(lines.length).toBe(4);

    // Extract P/L values from lines
    const pnlValues = lines.map((l) => {
      const match = l.match(/P\/L ([+-]?\d+)p/);
      return match ? parseInt(match[1]) : 0;
    });
    for (let i = 1; i < pnlValues.length; i++) {
      expect(pnlValues[i - 1]).toBeGreaterThanOrEqual(pnlValues[i]);
    }
  });

  it("restock signal fires on newly-restocked mod in active visit", () => {
    // Simulate: Synth-Current was restocked at the final visit
    const mod = MODS.find((m) => m.urlName === "primed_synth_current")!;
    const totalDays = TOTAL_VISITS * VISIT_INTERVAL_DAYS;
    const currentPrice = latestPriceForMod(mod.urlName);

    const signal = evaluateSellSignal({
      currentMedian: currentPrice,
      targetPrice: mod.baseline * 0.95,
      acquiredAt: isoDate(EPOCH, totalDays - 60), // bought 60 days ago
      recoveryDays: 21,
      isRestocked: true, // this mod appeared in the newly-recorded visit
      alertedConditions: [],
      now: isoDate(EPOCH, totalDays),
    });

    expect(signal).toBe("restocked");

    // Verify message says why
    const message = formatSellSignalMessage([{
      id: 1,
      itemName: mod.name,
      qty: 1,
      costPlat: mod.ducatCost * 0.1,
      currentMedian: currentPrice,
      targetPrice: mod.baseline * 0.95,
      signal: "restocked",
      pnl: (currentPrice - mod.ducatCost * 0.1) * 1,
    }], 30);
    expect(message).toContain("Restocked by Baro");
    expect(message).toContain("price will drop");
  });
});
