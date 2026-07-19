import { describe, it, expect } from "vitest";
import { buildWhisper, WF_SAFE_LEN } from "./whisper";

describe("buildWhisper", () => {
  it("itemizes a small bundle that fits", () => {
    const msg = buildWhisper("Ada", [{ item_name: "Bronco Prime Barrel", quantity: 1 }], 3);
    expect(msg).toBe("/w Ada Hi! WTB: Bronco Prime Barrel for 3p (warframe.market)");
    expect(msg.length).toBeLessThanOrEqual(WF_SAFE_LEN);
  });

  it("includes quantity when > 1", () => {
    const msg = buildWhisper("Ada", [{ item_name: "Fang Prime Handle", quantity: 3 }], 6);
    expect(msg).toContain("Fang Prime Handle x3");
  });

  it("falls back to a count summary when the itemized form is too long", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      item_name: `Some Prime Part Number ${i}`,
      quantity: 1,
    }));
    const msg = buildWhisper("LongSellerNameHere", items, 44);
    expect(msg).toContain("WTB 8 prime parts, 44p");
    expect(msg).not.toContain("Some Prime Part Number 0");
    expect(msg.length).toBeLessThanOrEqual(WF_SAFE_LEN);
  });

  it("the summary fallback stays short even for many items", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      item_name: `Prime Part ${i}`,
      quantity: 1,
    }));
    const msg = buildWhisper("Seller", items, 200);
    expect(msg.length).toBeLessThanOrEqual(WF_SAFE_LEN);
    expect(msg).toContain("WTB 30 prime parts");
  });
});
