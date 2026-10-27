import { describe, it, expect } from "vitest";
import {
  buildExtrasWhisper,
  buildWhispers,
  partitionIntoTrades,
  selectFullTrades,
  WF_SAFE_LEN,
  TRADE_SIZE,
} from "./whisper";

const item = (
  name: string,
  ducats: number,
  price: number,
  quantity = 1,
  slots = 1,
) => ({ item_name: name, ducats, price, quantity, slots });

// The 9-set basket from the bundles page: 37 parts that used to take 9 trades.
const screenshotBasket = [
  item("Trumna Prime Set", 260, 20, 1, 4),
  item("Cedo Prime Set", 205, 13, 1, 4),
  item("Paris Prime Set", 115, 5, 1, 5),
  item("Braton Prime Set", 110, 5, 2, 4),
  item("Burston Prime Set", 90, 5, 4, 4),
];

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

  it("keeps sets whole when splitting wouldn't save a trade", () => {
    // 5 + 4 = 9 parts needs 2 trades either way -> no split
    const trades = partitionIntoTrades([
      item("Ballistica Prime Set", 250, 33, 1, 5),
      item("Rhino Prime Set", 220, 40, 1, 4),
    ]);
    expect(trades).toHaveLength(2);
    expect(trades[0].slots).toBe(5);
    expect(trades[1].slots).toBe(4);
    expect(trades.every((t) => t.items.every((l) => l.parts === l.slots))).toBe(true);
  });

  it("splits sets across trades when that saves trades (37 parts -> 7 trades, not 9)", () => {
    const trades = partitionIntoTrades(screenshotBasket);
    expect(trades).toHaveLength(7);
    expect(trades.slice(0, 6).every((t) => t.slots === 6)).toBe(true);
    expect(trades[6].slots).toBe(1);
    expect(trades[6].partial).toBe(true);
    // Trade 1: all of Trumna + the first 2 parts of Cedo
    expect(trades[0].items.map((l) => [l.item_name, l.parts, l.partsBefore])).toEqual([
      ["Trumna Prime Set", 4, 0],
      ["Cedo Prime Set", 2, 0],
    ]);
    // Cedo is paid in trade 2, where its last parts arrive
    expect(trades[0].platTotal).toBe(20);
    expect(trades[1].items[0]).toMatchObject({ item_name: "Cedo Prime Set", parts: 2, partsBefore: 2 });
    expect(trades[1].platTotal).toBe(13);
    // every part and every plat is accounted for exactly once
    expect(trades.reduce((s, t) => s + t.slots, 0)).toBe(37);
    expect(trades.reduce((s, t) => s + t.platTotal, 0)).toBe(68);
    expect(Math.round(trades.reduce((s, t) => s + t.ducatTotal, 0))).toBe(1160);
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

  it("multi-trade: the opener, then the trades starting a new message at T1", () => {
    const items = Array.from({ length: 8 }, (_, i) => item(`Part ${i}`, 45, 3));
    const msgs = buildWhispers("Seller", items, 24);
    expect(msgs).toEqual([
      "/w Seller Hi! WTB 8 items for 24p total (warframe.market): Part 0 3p, Part 1 3p, Part 2 3p, " +
        "Part 3 3p, Part 4 3p, Part 5 3p, Part 6 3p, Part 7 3p. 8 parts, 6 per trade = 2 trades:",
      "/w Seller T1: Part 0 + Part 1 + Part 2 + Part 3 + Part 4 + Part 5 (18p) | T2: Part 6 + Part 7 (6p)",
    ]);
  });

  it("split sets: lists the sets first, then counts parts per set in each trade", () => {
    const msgs = buildWhispers("SomeSeller", screenshotBasket, 68);
    expect(msgs).toEqual([
      "/w SomeSeller Hi! WTB 9 Prime sets for 68p total (warframe.market): Trumna 20p, Cedo 13p, Paris 5p, " +
        "2x Braton 5p ea, 4x Burston 5p ea. 37 parts, 6 per trade = 7 trades " +
        "(a set is paid in the trade that completes it):",
      "/w SomeSeller T1: Trumna set + 2 Cedo parts (20p) | T2: 2 Cedo parts + 4 Paris parts (13p) | " +
        "T3: 1 Paris part + 5 Braton parts (10p) | T4: 3 Braton parts + 3 Burston parts (5p) | " +
        "T5: 6 Burston parts (10p) | T6: 6 Burston parts (5p) | T7: 1 Burston part (5p)",
    ]);
  });

  it("mixed sets and loose parts", () => {
    const msgs = buildWhispers(
      "Ada",
      [
        item("Rhino Prime Set", 220, 40, 1, 4),
        item("Bronco Prime Barrel", 45, 3, 3),
        item("Fang Prime Handle", 25, 2, 2),
      ],
      53,
    );
    expect(msgs).toEqual([
      "/w Ada Hi! WTB 1 set + 5 parts for 53p total (warframe.market): Rhino set 40p, " +
        "3x Bronco Prime Barrel 3p ea, 2x Fang Prime Handle 2p ea. 9 parts, 6 per trade = 2 trades:",
      "/w Ada T1: Rhino set + 2x Bronco Prime Barrel (46p) | T2: Bronco Prime Barrel + 2x Fang Prime Handle (7p)",
    ]);
  });

  it("long plans continue in a new message without passing the cap", () => {
    const longName = "A_Seller_With_A_Long_Name";
    const msgs = buildWhispers(longName, [...screenshotBasket, ...screenshotBasket], 136);
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) {
      expect(m.length).toBeLessThanOrEqual(WF_SAFE_LEN);
      expect(m.startsWith(`/w ${longName} `)).toBe(true);
    }
    // opener first, then every trade message opens on a trade label
    expect(msgs[1].startsWith(`/w ${longName} T1: `)).toBe(true);
    expect(msgs.slice(1).every((m) => m.startsWith(`/w ${longName} T`))).toBe(true);
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

describe("selectFullTrades", () => {
  it("fills the most full trades, highest ducats first, and keeps the rest as extras", () => {
    // 4-part and 5-part sets: the largest multiple of 6 reachable is 24 parts
    // (six 4-part sets) -> the six most valuable 4-part sets, 4 full trades.
    const { full, extras } = selectFullTrades(screenshotBasket);
    const trades = partitionIntoTrades(full);
    expect(trades).toHaveLength(4);
    expect(trades.every((t) => t.slots === 6)).toBe(true);
    expect(full.reduce((s, i) => s + i.ducats * i.quantity, 0)).toBe(865);
    expect(extras.map((i) => [i.item_name, i.quantity])).toEqual([
      ["Paris Prime Set", 1],
      ["Burston Prime Set", 2],
    ]);
  });

  it("drops only the cheapest loose parts when they're what overflows", () => {
    const items = [
      item("Rhino Prime Set", 220, 40, 1, 4),
      item("Rich Part", 100, 9, 2),
      item("Cheap Part", 15, 2, 1),
    ];
    const { full, extras } = selectFullTrades(items);
    expect(full.reduce((s, i) => s + (i.slots ?? 1) * i.quantity, 0)).toBe(6);
    expect(extras).toEqual([expect.objectContaining({ item_name: "Cheap Part" })]);
  });

  it("everything is an extra when no full trade is possible", () => {
    const { full, extras } = selectFullTrades([item("A", 45, 3), item("B", 45, 3)]);
    expect(full).toEqual([]);
    expect(extras).toHaveLength(2);
  });
});

describe("buildExtrasWhisper", () => {
  it("is a separate optional message with its plat and trade cost", () => {
    const { extras } = selectFullTrades(screenshotBasket);
    const msgs = buildExtrasWhisper("Ada", extras);
    expect(msgs).toEqual([
      "/w Ada Optional extra: Paris Prime Set (5 parts) 5p, Burston Prime Set (4 parts) x2 5p = 15p (+3 trades)",
    ]);
  });

  it("nothing to send when there are no extras", () => {
    expect(buildExtrasWhisper("Ada", [])).toEqual([]);
  });
});
