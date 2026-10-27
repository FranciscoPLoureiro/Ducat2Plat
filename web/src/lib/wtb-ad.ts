// The trade-chat ad for buying Prime junk by ducat value. Each ducat tier is
// either advertised at a plat price or listed as unwanted ("NO 15d/25d").
// `:ducats:` and `:platinum:` are Warframe chat icon codes.

export interface AdTier {
  ducats: number;
  plat: number;
  on: boolean;
}

export const DEFAULT_AD_TIERS: AdTier[] = [
  { ducats: 100, plat: 6, on: true },
  { ducats: 65, plat: 4, on: true },
  { ducats: 45, plat: 3, on: true },
  { ducats: 25, plat: 2, on: false },
  { ducats: 15, plat: 1, on: false },
];

// Saved tiers merged onto the defaults, so a missing or malformed entry falls
// back instead of dropping a tier.
export function resolveAdTiers(saved: AdTier[] | null | undefined): AdTier[] {
  return DEFAULT_AD_TIERS.map((d) => {
    const s = saved?.find((t) => t.ducats === d.ducats);
    return s && Number.isFinite(s.plat) && typeof s.on === "boolean" ? { ...d, ...s } : d;
  });
}

export function buildWtbAd(tiers: AdTier[]): string {
  const on = tiers.filter((t) => t.on).sort((a, b) => b.ducats - a.ducats);
  const off = tiers.filter((t) => !t.on).sort((a, b) => a.ducats - b.ducats);
  const parts = [
    "WTB PRIME JUNK 6x",
    ...on.map((t) => `${t.ducats} :ducats: = ${t.plat} :platinum:`),
  ];
  if (off.length) parts.push(`NO ${off.map((t) => `${t.ducats}d`).join("/")}`);
  parts.push("PM ME");
  return parts.join(" | ");
}
