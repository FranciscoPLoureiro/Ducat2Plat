"use client";

import { useState } from "react";
import Link from "next/link";

export interface WatchlistEntry {
  name: string;
  url_name: string;
  baseline: number;
  current: number;
  pct: number;
  heldQty: number | null; // qty of open positions in this mod, else null
  targetPrice: number | null; // sell target from the open position, if any
}

const INITIAL = 15;

export default function NextVisitPrep({
  arrivalLabel,
  daysUntil,
  watchlist,
  droppedCount,
  lastVisitWasSpecial,
}: {
  arrivalLabel: string | null;
  daysUntil: number | null;
  watchlist: WatchlistEntry[];
  droppedCount: number;
  lastVisitWasSpecial: boolean;
}) {
  const [showAll, setShowAll] = useState(false);

  // Positions you hold float to the top — their sell-timing is the whole point.
  const sorted = [...watchlist].sort((a, b) => {
    if ((b.heldQty ?? 0) > 0 !== ((a.heldQty ?? 0) > 0)) {
      return (b.heldQty ?? 0) > 0 ? 1 : -1;
    }
    return a.pct - b.pct;
  });
  const held = sorted.filter((w) => (w.heldQty ?? 0) > 0);
  const shown = showAll ? sorted : sorted.slice(0, INITIAL);

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3 text-amber-400">Next Visit Prep</h2>
      <div className="border border-zinc-800 rounded px-4 py-3 space-y-3 text-sm">
        <p className="text-zinc-300">
          {arrivalLabel && daysUntil !== null ? (
            <>
              Baro arrives{" "}
              <span className="text-amber-400 font-semibold">{arrivalLabel}</span> (
              {daysUntil}d). Stock ducats now —{" "}
              <Link href="/" className="text-emerald-400 hover:underline">
                junk is cheapest between visits
              </Link>
              .
            </>
          ) : (
            <>Next arrival unknown — waiting for the next sweep.</>
          )}
        </p>

        {watchlist.length > 0 && (
          <div>
            <p className="text-zinc-500 mb-2">
              Primed mod recovery since the last visit&apos;s supply flood — mods below
              100% are still crash-priced (bad time to sell, decent time to buy from
              players). Mods you hold are marked and sorted first.
            </p>

            {lastVisitWasSpecial && (
              <p className="text-purple-300/80 text-xs mb-2">
                Recovery is measured from a TennoCon full-catalog flood — a deeper
                crash than a normal visit, so rebounds run slower. Read these as
                &ldquo;how far from pre-TennoCon&rdquo;, not a typical post-visit dip.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {shown.map((w) => {
                const isHeld = (w.heldQty ?? 0) > 0;
                const cls = isHeld
                  ? "border-sky-700 text-sky-300 bg-sky-950/30"
                  : w.pct < 0.85
                    ? "border-red-900 text-red-300"
                    : w.pct < 1
                      ? "border-amber-900 text-amber-300"
                      : "border-emerald-900 text-emerald-300";
                return (
                  <Link
                    key={w.url_name}
                    href={`/item/${w.url_name}`}
                    title={
                      isHeld
                        ? `You hold ${w.heldQty}. Target ${w.targetPrice}p, now ${w.current}p (baseline ${w.baseline}p)`
                        : `baseline ${w.baseline}p → now ${w.current}p`
                    }
                    className={`px-2 py-1 rounded border text-xs transition-colors hover:border-zinc-500 ${cls}`}
                  >
                    {isHeld && <span className="mr-1">★</span>}
                    {w.name}{" "}
                    <span className="opacity-70">
                      {Math.round(w.current)}p/{Math.round(w.baseline)}p
                    </span>{" "}
                    {(w.pct * 100).toFixed(0)}%
                  </Link>
                );
              })}
            </div>

            <div className="mt-2 flex items-center gap-3 text-xs text-zinc-600">
              {watchlist.length > INITIAL && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {showAll ? "Show fewer" : `Show all ${watchlist.length}`}
                </button>
              )}
              {held.length > 0 && (
                <span className="text-sky-400/70">
                  ★ {held.length} mod{held.length === 1 ? "" : "s"} you hold
                </span>
              )}
              {droppedCount > 0 && (
                <span title="Too little price history before the last visit to compute a baseline">
                  {droppedCount} mod{droppedCount === 1 ? "" : "s"} lack enough history
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
