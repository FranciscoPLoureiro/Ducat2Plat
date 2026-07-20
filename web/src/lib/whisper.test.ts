import { describe, it, expect } from "vitest";
import { buildWhispers, partitionIntoTrades, WF_SAFE_LEN, TRADE_SIZE } from "./whisper";

const item = (
  name: string,
  ducats: number,
  price: number,
  quantity = 1,
  slots = 1,
) => ({ item_name: name, ducats, price, quantity, slots });

describe("partitionIntoTrades", () => {
  it("keeps a small basket in one non-partial trade", () => {
    const trades = partitionIntoTrades([item("A", 45, 3), item("B", 45, 4)]);
    expect(trades).toHaveLength(1);
    expect(trades[0].slots).toBe(2);
    expect(trades[0].partial).toBe(false);
  });

  it("splits into trades of 6 slots and flags a partial last trade", () => {
    const items = Array.from({ length: 8 }, (_, i) => item(`Item${i}`, 45, 3));
    const trades = partitionIntoTrades(items);
    expect(trades).toHaveLength(2);
    expect(trades[0].slots).toBe(6);
    expect(trades[1].slots).toBe(2);
    expect(trades[1].partial).toBe(true);
  });

  it("orders by ducat value so the partial last trade is least valuable", () => {
    const items = [
      item("Cheap", 15, 2),
      ...Array.from({ length: 6 }, (_, i) => item(`Rich${i}`, 100, 9)),
    ];
    const trades = partitionIntoTrades(items);
    expect(trades).toHaveLength(2);
    expect(trades[0].ducatTotal).toBe(600);
    expect(trades[1].slots).toBe(1);
    expect(trades[1].ducatTotal).toBe(15);
    expect(trades[1].partial).toBe(true);
  });

  it("counts a set as its part-count in slots, not as 1 item", () => {
    // a 4-part set + 2 single parts = 6 slots -> one full trade
    const trades = partitionIntoTrades([
      item("Rhino Prime Set", 220, 40, 1, 4),
      item("Braton Prime Barrel", 45, 3),
      item("Paris Prime Grip", 45, 3),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].slots).toBe(6);
  });

  it("a set that overflows the current trade starts a new one", () => {
    // 5-part set can't share with a 4-part set (9 > 6) -> two trades
    const trades = partitionIntoTrades([
      item("Ballistica Prime Set", 250, 33, 1, 5),
      item("Rhino Prime Set", 220, 40, 1, 4),
    ]);
    expect(trades).toHaveLength(2);
    expect(trades[0].slots).toBe(5);
    expect(trades[1].slots).toBe(4);
  });

  it("stacked quantities each cost their slot size", () => {
    const trades = partitionIntoTrades([item("A", 45, 3, 4), item("B", 45, 3, 3)]);
    expect(trades).toHaveLength(2);
    expect(trades[0].slots).toBe(TRADE_SIZE);
    expect(trades[1].slots).toBe(1);
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

  it("labels a set with its part count so the seller knows it's the whole set", () => {
    const msgs = buildWhispers("Ada", [item("Rhino Prime Set", 220, 40, 1, 4)], 40);
    expect(msgs[0]).toContain("Rhino Prime Set (4 parts) 40p");
  });

  it("multi-trade: one labeled message per trade, all within the cap", () => {
    const items = Array.from({ length: 8 }, (_, i) => item(`Prime Part ${i}`, 45, 3));
    const msgs = buildWhispers("Seller", items, 24);
    expect(msgs.some((m) => m.includes("WTB trade 1/2:"))).toBe(true);
    expect(msgs.some((m) => m.includes("trade 2/2 (partial):"))).toBe(true);
    expect(msgs.some((m) => m.includes("total 24p"))).toBe(true);
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
