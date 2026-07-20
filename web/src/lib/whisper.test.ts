import { describe, it, expect } from "vitest";
import { buildWhispers, WF_SAFE_LEN } from "./whisper";

describe("buildWhispers", () => {
  it("small bundle fits in one message with the total", () => {
    const msgs = buildWhispers("Ada", [{ item_name: "Bronco Prime Barrel", price: 3, quantity: 1 }], 3);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toBe("/w Ada Hi! WTB: Bronco Prime Barrel 3p for 3p total (warframe.market)");
    expect(msgs[0].length).toBeLessThanOrEqual(WF_SAFE_LEN);
  });

  it("includes quantity when > 1", () => {
    const msgs = buildWhispers("Ada", [{ item_name: "Fang Prime Handle", price: 2, quantity: 3 }], 6);
    expect(msgs[0]).toContain("Fang Prime Handle x3 2p");
  });

  it("includes per-item price", () => {
    const msgs = buildWhispers("Ada", [
      { item_name: "Braton Prime Barrel", price: 2, quantity: 1 },
      { item_name: "Paris Prime Lower Limb", price: 4, quantity: 1 },
    ], 6);
    expect(msgs.join("\n")).toContain("Braton Prime Barrel 2p");
    expect(msgs.join("\n")).toContain("Paris Prime Lower Limb 4p");
  });

  it("splits a big bundle into sequential messages, all within the cap", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      item_name: `Some Prime Part Number ${i}`,
      price: 3,
      quantity: 1,
    }));
    const msgs = buildWhispers("LongSellerNameHere", items, 60);
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(WF_SAFE_LEN);
    // Every item appears exactly once across the parts
    for (let i = 0; i < 20; i++) {
      expect(msgs.join("\n")).toContain(`Some Prime Part Number ${i}`);
    }
    // First opens the conversation; continuations are marked
    expect(msgs[0]).toContain("Hi! WTB:");
    for (const m of msgs.slice(1, -1)) expect(m).toContain("/w LongSellerNameHere + ");
    // Total appears exactly once, at the end
    expect(msgs[msgs.length - 1]).toMatch(/60p/);
    expect(msgs.join("\n").match(/60p/g)).toHaveLength(1);
  });

  it("every part addresses the same seller", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      item_name: `Prime Part Alpha Beta ${i}`,
      price: 5,
      quantity: 1,
    }));
    const msgs = buildWhispers("Seller", items, 100);
    for (const m of msgs) expect(m.startsWith("/w Seller ")).toBe(true);
  });

  it("emits the total as its own message when the last part is full", () => {
    // Craft enough items so the final content message is near the cap
    const items = Array.from({ length: 30 }, (_, i) => ({
      item_name: `Extremely Long Prime Component Name ${i}`,
      price: 10,
      quantity: 1,
    }));
    const msgs = buildWhispers("S", items, 300);
    const last = msgs[msgs.length - 1];
    expect(last).toContain("300p");
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(WF_SAFE_LEN);
  });
});
