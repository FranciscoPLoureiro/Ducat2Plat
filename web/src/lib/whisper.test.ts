import { describe, it, expect } from "vitest";
import { buildWhispers, partitionIntoTrades, WF_SAFE_LEN, TRADE_SIZE } from "./whisper";

const item = (name: string, ducats: number, price: number, quantity = 1) => ({
  item_name: name,
  ducats,
  price,
  quantity,
});

describe("partitionIntoTrades", () => {
  it("keeps a small basket in one non-partial trade", () => {
    const trades = partitionIntoTrades([item("A", 45, 3), item("B", 45, 4)]);
    expect(trades).toHaveLength(1);
    expect(trades[0].units).toBe(2);
    expect(trades[0].partial).toBe(false);
  });

  it("splits into trades of 6 units and flags a partial last trade", () => {
    const items = Array.from({ length: 8 }, (_, i) => item(`Item${i}`, 45, 3));
    const trades = partitionIntoTrades(items);
    expect(trades).toHaveLength(2);
    expect(trades[0].units).toBe(6);
    expect(trades[1].units).toBe(2);
    expect(trades[1].partial).toBe(true);
    expect(trades[0].partial).toBe(false);
  });

  it("does not flag partial when the last trade is exactly full", () => {
    const items = Array.from({ length: 12 }, (_, i) => item(`Item${i}`, 45, 3));
    const trades = partitionIntoTrades(items);
    expect(trades).toHaveLength(2);
    expect(trades.every((t) => !t.partial)).toBe(true);
  });

  it("orders by ducat value so the last (partial) trade is the least valuable", () => {
    const items = [
      item("Cheap", 15, 2),
      item("Rich1", 100, 9),
      item("Rich2", 100, 9),
      item("Rich3", 100, 9),
      item("Rich4", 100, 9),
      item("Rich5", 100, 9),
      item("Rich6", 100, 9),
    ];
    const trades = partitionIntoTrades(items);
    expect(trades).toHaveLength(2);
    // first trade holds the six 100-ducat items
    expect(trades[0].ducatTotal).toBe(600);
    // the leftover partial trade holds only the 15-ducat one
    expect(trades[1].units).toBe(1);
    expect(trades[1].ducatTotal).toBe(15);
    expect(trades[1].partial).toBe(true);
  });

  it("counts stacked quantities as separate slots", () => {
    const trades = partitionIntoTrades([item("A", 45, 3, 4), item("B", 45, 3, 3)]);
    // 7 units -> 2 trades (6 + 1)
    expect(trades).toHaveLength(2);
    expect(trades[0].units).toBe(TRADE_SIZE);
    expect(trades[1].units).toBe(1);
    expect(trades[1].partial).toBe(true);
  });
});

describe("buildWhispers", () => {
  it("single trade: one message with the total, within the cap", () => {
    const msgs = buildWhispers("Ada", [item("Bronco Prime Barrel", 45, 3)], 3);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toBe("/w Ada Hi! WTB: Bronco Prime Barrel 3p for 3p total (warframe.market)");
    expect(msgs[0].length).toBeLessThanOrEqual(WF_SAFE_LEN);
  });

  it("multi-trade: one labeled message per trade, all within the cap", () => {
    const items = Array.from({ length: 8 }, (_, i) => item(`Prime Part ${i}`, 45, 3));
    const msgs = buildWhispers("Seller", items, 24);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toContain("WTB trade 1/2:");
    expect(msgs[1]).toContain("trade 2/2 (partial):");
    expect(msgs[1]).toContain("total 24p");
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(WF_SAFE_LEN);
  });

  it("every message is a valid pasteable /w to the same seller", () => {
    const items = Array.from({ length: 15 }, (_, i) => item(`Prime Part Number ${i}`, 45, 3));
    const msgs = buildWhispers("SomeSeller", items, 45);
    for (const m of msgs) expect(m.startsWith("/w SomeSeller ")).toBe(true);
  });

  it("includes per-item price and quantity", () => {
    const msgs = buildWhispers("Ada", [item("Fang Prime Handle", 25, 2, 3)], 6);
    expect(msgs[0]).toContain("Fang Prime Handle x3 2p");
  });
});
