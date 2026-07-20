import { describe, it, expect } from "vitest";
import { buildWhispers, WF_SAFE_LEN } from "./whisper";

describe("buildWhispers", () => {
  it("small bundle fits in one message with the total", () => {
    const msgs = buildWhispers("Ada", [{ item_name: "Bronco Prime Barrel", quantity: 1 }], 3);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toBe("/w Ada Hi! WTB: Bronco Prime Barrel for 3p (warframe.market)");
    expect(msgs[0].length).toBeLessThanOrEqual(WF_SAFE_LEN);
  });

  it("includes quantity when > 1", () => {
    const msgs = buildWhispers("Ada", [{ item_name: "Fang Prime Handle", quantity: 3 }], 6);
    expect(msgs[0]).toContain("Fang Prime Handle x3");
  });

  it("splits a big bundle into sequential messages, all within the cap", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      item_name: `Some Prime Part Number ${i}`,
      quantity: 1,
    }));
    const msgs = buildWhispers("LongSellerNameHere", items, 44);
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(WF_SAFE_LEN);
    // Every item appears exactly once across the parts
    for (let i = 0; i < 8; i++) {
      expect(msgs.join("\n")).toContain(`Some Prime Part Number ${i}`);
    }
    // First opens the conversation; continuations are marked
    expect(msgs[0]).toContain("Hi! WTB:");
    for (const m of msgs.slice(1, -1)) expect(m).toContain("/w LongSellerNameHere + ");
    // Total appears exactly once, at the end
    expect(msgs[msgs.length - 1]).toMatch(/44p/);
    expect(msgs.join("\n").match(/44p/g)).toHaveLength(1);
  });

  it("every part addresses the same seller", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      item_name: `Prime Part Alpha Beta ${i}`,
      quantity: 1,
    }));
    const msgs = buildWhispers("Seller", items, 30);
    for (const m of msgs) expect(m.startsWith("/w Seller ")).toBe(true);
  });

  it("emits the total as its own message when the last part is full", () => {
    // Craft names so the final content message lands close to the cap
    const items = Array.from({ length: 10 }, (_, i) => ({
      item_name: `Extremely Long Prime Component Name ${i}`,
      quantity: 1,
    }));
    const msgs = buildWhispers("S", items, 99);
    const last = msgs[msgs.length - 1];
    expect(last).toContain("99p");
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(WF_SAFE_LEN);
  });
});
