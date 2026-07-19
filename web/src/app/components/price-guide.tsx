import type { RankedItem } from "@/lib/data";

const TIERS = [15, 25, 45, 65, 100];
const MIN_VELOCITY = 5; // only liquid parts define a "typical" price

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

// Per-ducat-tier typical prices from liquid parts. This is the reference the
// ranking exists to provide — and it powers the most trade-slot-efficient play
// of all: posting "WTB any <tier>-ducat junk, <offer>p each" so a seller brings
// their whole folder in one trade.
export default function PriceGuide({ items }: { items: RankedItem[] }) {
  const rows = TIERS.map((tier) => {
    const medians = items
      .filter((i) => i.ducats === tier && i.velocity >= MIN_VELOCITY && i.median > 0)
      .map((i) => i.median)
      .sort((a, b) => a - b);
    if (medians.length < 3) return { tier, ok: false as const };
    const low = percentile(medians, 0.25);
    const high = percentile(medians, 0.75);
    const offer = Math.max(1, Math.floor(low));
    return { tier, ok: true as const, low, high, offer, n: medians.length };
  });

  const usable = rows.filter((r) => r.ok);
  if (usable.length === 0) return null;

  return (
    <div className="mb-6 border border-zinc-800 rounded px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
        <span className="text-zinc-400 font-medium">Typical junk prices (liquid parts):</span>
        {usable.map((r) => (
          <span key={r.tier} className="text-zinc-300">
            <span className="text-amber-400">{r.tier}d</span>{" "}
            {fmt(r.low)}–{fmt(r.high)}p{" "}
            <span className="text-zinc-500">→ offer {r.offer}p</span>
          </span>
        ))}
      </div>
      <p className="text-xs text-zinc-500 mt-2">
        Most trade-slot-efficient buy: post{" "}
        <span className="text-zinc-300">
          &ldquo;WTB any 45-ducat junk, {usable.find((r) => r.tier === 45)?.offer ?? 3}p each&rdquo;
        </span>{" "}
        in trade chat — a seller brings their whole junk folder in a single trade, no cherry-picking.
      </p>
    </div>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
