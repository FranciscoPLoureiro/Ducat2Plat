"use client";

import { useState } from "react";
import type { BaroVisitItem } from "@/lib/data";

interface SectionProps {
  title: string;
  items: BaroVisitItem[];
  defaultOpen: boolean;
  showRoi: boolean;
}

function Section({ title, items, defaultOpen, showRoi }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (items.length === 0) return null;

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
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400 text-left">
                <th className="py-2 px-3 font-medium">Item</th>
                <th className="py-2 px-3 font-medium text-right">Ducats</th>
                <th className="py-2 px-3 font-medium text-right">Credits</th>
                {showRoi && (
                  <>
                    <th className="py-2 px-3 font-medium text-right">Resale (R0)</th>
                    <th className="py-2 px-3 font-medium text-right">ROI</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.item_name}
                  className="border-b border-zinc-800 hover:bg-zinc-900 transition-colors"
                >
                  <td className="py-2 px-3 font-medium">{item.item_name}</td>
                  <td className="py-2 px-3 text-right text-amber-400">
                    {item.ducat_cost}
                  </td>
                  <td className="py-2 px-3 text-right text-zinc-400">
                    {item.credit_cost.toLocaleString()}
                  </td>
                  {showRoi && (
                    <>
                      <td className="py-2 px-3 text-right">
                        {item.resale_median !== null
                          ? `${Math.round(item.resale_median)}p`
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
              ))}
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
      />
      <Section
        title="Other Tradeables"
        items={tradeables}

        defaultOpen={false}
        showRoi={false}
      />
      <Section
        title="Cosmetics & Non-Tradeables"
        items={cosmetics}

        defaultOpen={false}
        showRoi={false}
      />
      <p className="text-xs text-zinc-600 mt-2">
        ROI = rank-0 resale median − ducat cost × {junkRate.toFixed(2)} p/ducat (live junk rate).
      </p>
    </div>
  );
}
