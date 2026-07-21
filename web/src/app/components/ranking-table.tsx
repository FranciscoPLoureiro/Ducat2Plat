"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { RankedItem } from "@/lib/data";
import { useSettings, updateSettings } from "@/lib/settings";

export default function RankingTable({ items }: { items: RankedItem[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [hideSets, setHideSets] = useState(true);
  const settings = useSettings();
  // Local edits win over the stored default; edits also persist as the new
  // default. Server render always uses 5 (settings are client-only).
  const [minVelOverride, setMinVelOverride] = useState<number | null>(null);
  const minVelocity = minVelOverride ?? settings.minVelocity ?? 5;

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = useMemo(() => {
    let result = items;
    if (hideSets) {
      result = result.filter((i) => !i.url_name.endsWith("_set"));
    }
    if (minVelocity > 0) {
      result = result.filter((i) => i.velocity >= minVelocity);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.item_name.toLowerCase().includes(q));
    }
    if (!showAll && !search) {
      result = result.slice(0, 50);
    }
    return result;
  }, [items, hideSets, minVelocity, search, showAll]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
          className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-56"
        />
        <label className="flex items-center gap-1.5 text-sm text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={hideSets}
            onChange={(e) => setHideSets(e.target.checked)}
            className="accent-emerald-500"
          />
          Hide sets
        </label>
        <label className="flex items-center gap-1.5 text-sm text-zinc-400">
          Min vel.
          <input
            type="number"
            value={minVelocity}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              setMinVelOverride(v);
              updateSettings({ minVelocity: v });
            }}
            min={0}
            className="w-16 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          />
          /d
        </label>
        {!search && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            {showAll ? "Top 50" : `Show all (${items.filter((i) => (!hideSets || !i.url_name.endsWith("_set")) && i.velocity >= minVelocity).length})`}
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-zinc-700 text-zinc-400 text-left">
              <th className="py-2 px-3 font-medium hidden sm:table-cell">#</th>
              <th className="py-2 px-3 font-medium">Item</th>
              <th className="py-2 px-3 font-medium text-right" title="Ducat value when sold to Baro's kiosk — a fixed game constant">Ducats</th>
              <th className="py-2 px-3 font-medium text-right hidden sm:table-cell" title="Median closed-trade price (yesterday) — what it actually sells for, not what's listed">Median</th>
              <th className="py-2 px-3 font-medium text-right hidden sm:table-cell" title="Ducats per plat at the median price — the naive rate">PpD</th>
              <th className="py-2 px-3 font-medium text-right" title="Ducats per plat when actually buying 6 units from live in-game listings — the honest rate">PpD@6</th>
              <th className="py-2 px-3 font-medium text-right hidden sm:table-cell" title="Real units sold per day over the last 14 days — liquidity">Velocity</th>
              <th className="py-2 px-3 font-medium text-right" title="PpD@6 down-weighted for illiquidity — the ranking metric">Score</th>
              <th className="py-2 px-3 font-medium text-center" title="OK: 6+ units available from in-game sellers. SHALLOW: fewer — the rate is based on less depth">Depth</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => (
              <ItemRow
                key={item.id}
                item={item}
                rank={i + 1}
                isExpanded={expanded.has(item.id)}
                onToggle={() => toggle(item.id)}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-zinc-500">
                  {items.length === 0
                    ? "No data available. Run a sweep first."
                    : "No items match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  rank,
  isExpanded,
  onToggle,
}: {
  item: RankedItem;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isOutlier =
    item.ppd_at_n !== null && item.ppd > 0 && item.ppd_at_n > item.ppd * 3;

  return (
    <>
      <tr
        className="border-b border-zinc-800 hover:bg-zinc-900 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="py-2 px-3 text-zinc-500 hidden sm:table-cell">{rank}</td>
        <td className="py-2 px-3 font-medium">
          <span className="mr-2 text-zinc-500 text-xs">
            {isExpanded ? "▼" : "▶"}
          </span>
          <Link
            href={`/item/${item.url_name}`}
            className="hover:text-emerald-400 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {item.item_name}
          </Link>
        </td>
        <td className="py-2 px-3 text-right text-amber-400">{item.ducats}</td>
        <td className="py-2 px-3 text-right hidden sm:table-cell">{item.median}p</td>
        <td className="py-2 px-3 text-right hidden sm:table-cell">{item.ppd.toFixed(1)}</td>
        <td className="py-2 px-3 text-right font-semibold text-emerald-400">
          {item.ppd_at_n !== null ? item.ppd_at_n.toFixed(1) : "—"}
          {isOutlier && (
            <span
              className="ml-1 text-yellow-500 cursor-help"
              title="price from unusually cheap listings — verify in-game"
            >
              ⚠
            </span>
          )}
        </td>
        <td className="py-2 px-3 text-right hidden sm:table-cell">
          {Math.round(item.velocity)}/d
        </td>
        <td className="py-2 px-3 text-right font-bold text-cyan-400">
          {item.score.toFixed(1)}
        </td>
        <td className="py-2 px-3 text-center">
          {item.shallow ? (
            <span className="text-yellow-500 text-xs font-medium">SHALLOW</span>
          ) : item.orders.length > 0 ? (
            <span className="text-emerald-600 text-xs">OK</span>
          ) : (
            <span className="text-zinc-600 text-xs">—</span>
          )}
        </td>
      </tr>
      {isExpanded && item.orders.length > 0 && (
        <tr className="bg-zinc-900/50">
          <td colSpan={9} className="px-6 py-3">
            <div className="text-xs text-zinc-400 mb-2 font-medium">
              In-game sell orders (cheapest first)
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="py-1 px-2 text-left font-medium">Seller</th>
                  <th className="py-1 px-2 text-right font-medium">Price</th>
                  <th className="py-1 px-2 text-right font-medium">Qty</th>
                  {item.orders.some((o) => o.mod_rank !== null) && (
                    <th className="py-1 px-2 text-right font-medium">Rank</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {item.orders.map((o, i) => (
                  <tr key={i} className="border-b border-zinc-800/50">
                    <td className="py-1 px-2 text-zinc-300">{o.seller_name}</td>
                    <td className="py-1 px-2 text-right">{o.price}p</td>
                    <td className="py-1 px-2 text-right">{o.quantity}</td>
                    {item.orders.some((o) => o.mod_rank !== null) && (
                      <td className="py-1 px-2 text-right">
                        {o.mod_rank ?? "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
