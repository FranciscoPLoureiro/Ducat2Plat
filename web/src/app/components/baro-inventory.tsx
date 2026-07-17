"use client";

import { useState } from "react";
import type { BaroVisitItem } from "@/lib/data";

interface SectionProps {
  title: string;
  items: BaroVisitItem[];
  defaultOpen: boolean;
  showRoi: boolean;
  showMaxRank: boolean;
  onToggleRank?: () => void;
}

function Section({ title, items, defaultOpen, showRoi, showMaxRank, onToggleRank }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (items.length === 0) return null;

  const hasMaxRankData = items.some((i) => i.resale_median_max_rank !== null);

  return (
    <div className="border border-zinc-800 rounded overflow-hidden mb-3">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-900 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-semibold">
          {title}
          <span className="ml-2 text-zinc-500 font-normal">({items.length})</span>
        </span>
        <span className="text-xs text-zinc-500">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div className="overflow-x-auto">
          {showRoi && hasMaxRankData && onToggleRank && (
            <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showMaxRank}
                  onChange={onToggleRank}
                  className="accent-emerald-500"
                />
                Show max-rank resale
              </label>
            </div>
          )}
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400 text-left">
                <th className="py-2 px-3 font-medium">Item</th>
                <th className="py-2 px-3 font-medium text-right">Ducats</th>
                <th className="py-2 px-3 font-medium text-right">Credits</th>
                {showRoi && (
                  <>
                    <th className="py-2 px-3 font-medium text-right whitespace-nowrap">
                      Resale ({showMaxRank ? "Max" : "R0"})
                    </th>
                    <th className="py-2 px-3 font-medium text-right">
                      <span
                        className="cursor-help border-b border-dotted border-zinc-500"
                        title="ROI always uses rank-0 resale: rank-10 prices embed Endo/credit investment and are a different market (SPEC §6.5)"
                      >
                        ROI
                      </span>
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const displayMedian = showMaxRank
                  ? (item.resale_median_max_rank ?? item.resale_median)
                  : item.resale_median;
                return (
                  <tr
                    key={item.item_name}
                    className="border-b border-zinc-800 hover:bg-zinc-900 transition-colors"
                  >
                    <td className="py-2 px-3 font-medium">
                      {item.item_name}
                      {showMaxRank && item.max_mod_rank !== null && (
                        <span className="ml-1 text-xs text-zinc-500">
                          R{item.max_mod_rank}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-amber-400">
                      {item.ducat_cost}
                    </td>
                    <td className="py-2 px-3 text-right text-zinc-400">
                      {item.credit_cost.toLocaleString()}
                    </td>
                    {showRoi && (
                      <>
                        <td className="py-2 px-3 text-right">
                          {displayMedian !== null
                            ? `${Math.round(displayMedian)}p`
                            : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold">
                          {item.roi !== null ? (
                            <span
                              className={
                                item.roi >= 0 ? "text-emerald-400" : "text-red-400"
                              }
                            >
                              {item.roi >= 0 ? "+" : ""}
                              {Math.round(item.roi)}p
                            </span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function BaroInventory({
  items,
  junkRate,
}: {
  items: BaroVisitItem[];
  junkRate: number;
}) {
  const [showMaxRank, setShowMaxRank] = useState(false);

  const primed = items.filter((i) => i.is_primed_mod);
  const tradeables = items.filter((i) => !i.is_primed_mod && i.item_id !== null);
  const cosmetics = items.filter((i) => !i.is_primed_mod && i.item_id === null);

  return (
    <div>
      <Section
        title="Primed Mods"
        items={primed}
        defaultOpen={true}
        showRoi={true}
        showMaxRank={showMaxRank}
        onToggleRank={() => setShowMaxRank(!showMaxRank)}
      />
      <Section
        title="Other Tradeables"
        items={tradeables}
        defaultOpen={false}
        showRoi={false}
        showMaxRank={false}
      />
      <Section
        title="Cosmetics & Non-Tradeables"
        items={cosmetics}
        defaultOpen={false}
        showRoi={false}
        showMaxRank={false}
      />
      <p className="text-xs text-zinc-600 mt-2">
        ROI = rank-0 resale median − ducat cost × {junkRate.toFixed(2)} p/ducat (live junk rate).
        {" "}ROI always uses rank-0 because max-rank prices embed Endo/credit investment.
      </p>
    </div>
  );
}
