import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  WfmItemsResponseSchema,
  WfmStatisticsResponseSchema,
  WfmOrdersResponseSchema,
  VoidTraderResponseSchema,
} from "./wfm-schemas";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

// ── Items ──

describe("WfmItemsResponseSchema", () => {
  it("parses valid items fixture", () => {
    const data = loadFixture("wfm-items.json");
    const result = WfmItemsResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data).toHaveLength(3);
      expect(result.data.data[0].slug).toBe("ember_prime_neuroptics");
      expect(result.data.data[0].ducats).toBe(15);
      expect(result.data.data[1].maxRank).toBe(10);
    }
  });

  it("defaults tags to empty array when missing", () => {
    const result = WfmItemsResponseSchema.safeParse({
      data: [{ id: "a", slug: "test_item" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data[0].tags).toEqual([]);
    }
  });

  it("rejects response missing data array", () => {
    expect(WfmItemsResponseSchema.safeParse({}).success).toBe(false);
  });

  it("rejects item missing required slug", () => {
    const result = WfmItemsResponseSchema.safeParse({
      data: [{ id: "abc" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects item missing required id", () => {
    const result = WfmItemsResponseSchema.safeParse({
      data: [{ slug: "test" }],
    });
    expect(result.success).toBe(false);
  });
});

// ── Statistics ──

describe("WfmStatisticsResponseSchema", () => {
  it("parses valid statistics fixture", () => {
    const data = loadFixture("wfm-statistics.json");
    const result = WfmStatisticsResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      const days = result.data.payload.statistics_closed["90days"];
      expect(days).toHaveLength(2);
      expect(days[0].median).toBe(3.0);
      expect(days[1].mod_rank).toBe(0);
    }
  });

  it("defaults 90days to empty array when missing", () => {
    const result = WfmStatisticsResponseSchema.safeParse({
      payload: { statistics_closed: {} },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.statistics_closed["90days"]).toEqual([]);
    }
  });

  it("rejects response missing payload", () => {
    expect(WfmStatisticsResponseSchema.safeParse({}).success).toBe(false);
  });

  it("rejects stat row missing median", () => {
    const result = WfmStatisticsResponseSchema.safeParse({
      payload: {
        statistics_closed: {
          "90days": [
            {
              datetime: "2025-07-15T00:00:00Z",
              volume: 10,
              avg_price: 3,
              min_price: 1,
              max_price: 5,
            },
          ],
        },
      },
    });
    expect(result.success).toBe(false);
  });
});

// ── Orders ──

describe("WfmOrdersResponseSchema", () => {
  it("parses valid orders fixture", () => {
    const data = loadFixture("wfm-orders.json");
    const result = WfmOrdersResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data).toHaveLength(3);
      expect(result.data.data[0].user.ingameName).toBe("TestPlayer1");
      expect(result.data.data[0].quantity).toBe(2);
    }
  });

  it("defaults quantity to 1 when missing", () => {
    const result = WfmOrdersResponseSchema.safeParse({
      data: [
        {
          type: "sell",
          user: { status: "ingame", ingameName: "X" },
          platinum: 5,
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data[0].quantity).toBe(1);
    }
  });

  it("rejects order missing user", () => {
    const result = WfmOrdersResponseSchema.safeParse({
      data: [{ type: "sell", platinum: 5 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects order missing user.ingameName", () => {
    const result = WfmOrdersResponseSchema.safeParse({
      data: [
        {
          type: "sell",
          user: { status: "ingame" },
          platinum: 5,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

// ── Void Trader ──

describe("VoidTraderResponseSchema", () => {
  it("parses valid void trader fixture", () => {
    const data = loadFixture("void-trader.json");
    const result = VoidTraderResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inventory).toHaveLength(2);
      expect(result.data.location).toBe("Larunda Relay (Mercury)");
      expect(result.data.active).toBe(true);
    }
  });

  it("parses inactive trader without inventory", () => {
    const result = VoidTraderResponseSchema.safeParse({
      activation: "2025-07-25T18:00:00Z",
      expiry: "2025-07-27T18:00:00Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inventory).toEqual([]);
      expect(result.data.active).toBeUndefined();
      expect(result.data.location).toBeUndefined();
    }
  });

  it("rejects response missing activation", () => {
    const result = VoidTraderResponseSchema.safeParse({
      expiry: "2025-07-27T18:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects response missing expiry", () => {
    const result = VoidTraderResponseSchema.safeParse({
      activation: "2025-07-25T18:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects inventory item missing ducats", () => {
    const result = VoidTraderResponseSchema.safeParse({
      activation: "2025-07-25T18:00:00Z",
      expiry: "2025-07-27T18:00:00Z",
      inventory: [{ item: "Test", credits: 100 }],
    });
    expect(result.success).toBe(false);
  });
});
