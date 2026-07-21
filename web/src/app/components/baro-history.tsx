"use client";

import { useState, useMemo } from "react";
import type { BaroItemHistory } from "@/lib/data";

const PAGE_SIZE = 100;

export default function BaroHistory({ items }: { items: BaroItemHistory[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [hideCosmetics, setHideCosmetics] = useState(true);

  const filtered = useMemo(() => {
    let result = hideCosmetics ? items.filter((i) => i.matched) : items;
    if (search) {
      result = result.filter((i) =>
        i.item_name.toLowerCase().includes(search.toLowerCase()),
      );
    }
    return result;
  }, [items, search, hideCosmetics]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Filter items..."
          className="w-full max-w-xs px-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
        />
        <label
          className="flex items-center gap-1.5 text-sm text-zinc-400 cursor-pointer"
          title="Cosmetics, glyphs and other items not tradeable on warframe.market"
        >
          <input
            type="checkbox"
            checked={hideCosmetics}
            onChange={(e) => {
              setHideCosmetics(e.target.checked);
              setPage(0);
            }}
            className="accent-emerald-500"
          />
          Hide cosmetics
        </label>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 disabled:opacity-40 hover:bg-zinc-700 transition-colors"
            >
              Prev
            </button>
            <span>
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 disabled:opacity-40 hover:bg-zinc-700 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-zinc-700 text-zinc-400 text-left">
              <th className="py-2 px-3 font-medium">Item</th>
              <th
                className="py-2 px-3 font-medium text-right"
                title="Date when carried in the most recent recorded visit; otherwise, number of visits since last carried (hover for the date)"
              >
                Last Seen
              </th>
              <th
                className="py-2 px-3 font-medium text-right hidden sm:table-cell"
                title="Total recorded visits carrying this item (regular visits only — TennoCon excluded)"
              >
                Times Carried
              </th>
              <th className="py-2 px-3 font-medium text-right" title="Baro's ducat price at the most recent carry">
                Ducats
              </th>
              <th className="py-2 px-3 font-medium text-right hidden sm:table-cell" title="Baro's credit price at the most recent carry">
                Credits
              </th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item) => (
              <tr
                key={item.item_name}
                className="border-b border-zinc-800 hover:bg-zinc-900 transition-colors"
              >
                <td className="py-2 px-3">{item.item_name}</td>
                <td className="py-2 px-3 text-right">
                  {item.visits[0].visits_ago === 0 ? (
                    <span className="text-emerald-400 font-semibold">
                      {new Date(item.visits[0].arrival).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  ) : (
                    <span
                      className="text-zinc-300"
                      title={new Date(item.visits[0].arrival).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    >
                      {item.visits[0].visits_ago}
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 text-right text-zinc-400 hidden sm:table-cell">
                  {item.visits.length}
                </td>
                <td className="py-2 px-3 text-right text-amber-400">
                  {item.ducat_cost ?? "—"}
                </td>
                <td className="py-2 px-3 text-right text-zinc-400 hidden sm:table-cell">
                  {item.credit_cost !== null ? item.credit_cost.toLocaleString("en-US") : "—"}
                </td>
              </tr>
            ))}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-zinc-500">
                  {items.length === 0
                    ? "No regular Baro visits recorded yet — special visits (e.g. TennoCon) are excluded from recurrence stats."
                    : "No items match your filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
