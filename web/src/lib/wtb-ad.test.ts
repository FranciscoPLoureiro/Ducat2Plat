import { describe, it, expect } from "vitest";
import { buildWtbAd, DEFAULT_AD_TIERS, resolveAdTiers } from "./wtb-ad";

describe("buildWtbAd", () => {
  it("defaults to 100/65/45 at 6/4/3p and refuses 15d/25d", () => {
    expect(buildWtbAd(DEFAULT_AD_TIERS)).toBe(
      "WTB PRIME JUNK 6x | 100 :ducats: = 6 :platinum: | 65 :ducats: = 4 :platinum: | " +
        "45 :ducats: = 3 :platinum: | NO 15d/25d | PM ME",
    );
  });

  it("an enabled tier shows its price; a disabled one moves to NO", () => {
    const tiers = resolveAdTiers([
      { ducats: 25, plat: 2, on: true },
      { ducats: 45, plat: 3, on: false },
      { ducats: 100, plat: 7, on: true },
    ]);
    expect(buildWtbAd(tiers)).toBe(
      "WTB PRIME JUNK 6x | 100 :ducats: = 7 :platinum: | 65 :ducats: = 4 :platinum: | " +
        "25 :ducats: = 2 :platinum: | NO 15d/45d | PM ME",
    );
  });

  it("drops the NO part when every tier is wanted", () => {
    const all = DEFAULT_AD_TIERS.map((t) => ({ ...t, on: true }));
    expect(buildWtbAd(all)).not.toContain("NO ");
    expect(buildWtbAd(all)).toContain("15 :ducats: = 1 :platinum: | PM ME");
  });
});

describe("resolveAdTiers", () => {
  it("falls back to defaults for missing or malformed saved tiers", () => {
    const tiers = resolveAdTiers([
      { ducats: 65, plat: Number.NaN, on: true },
    ] as never);
    expect(tiers).toEqual(DEFAULT_AD_TIERS);
    expect(resolveAdTiers(null)).toEqual(DEFAULT_AD_TIERS);
  });
});
