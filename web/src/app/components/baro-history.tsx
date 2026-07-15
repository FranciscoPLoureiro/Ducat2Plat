"use client";

import { useState } from "react";
import type { BaroItemHistory } from "@/lib/data";

export default function BaroHistory({ items }: { items: BaroItemHistory[] }) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? items.filter((i) =>
        i.item_name.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter items..."
        className="mb-3 w-full max-w-xs px-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-zinc-700 text-zinc-400 text-left">
              <th className="py-2 px-3 font-medium">Item</th>
              <th className="py-2 px-3 font-medium text-right">
                Last Seen (visits ago)
              </th>
              <th className="py-2 px-3 font-medium text-right">
                Times Carried
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr
                key={item.item_name}
                className="border-b border-zinc-800 hover:bg-zinc-900 transition-colors"
              >
                <td className="py-2 px-3">{item.item_name}</td>
                <td className="py-2 px-3 text-right">
                  {item.visits[0].visits_ago === 0 ? (
                    <span className="text-emerald-400 font-semibold">Now</span>
                  ) : (
                    <span className="text-zinc-300">
                      {item.visits[0].visits_ago}
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 text-right text-zinc-400">
                  {item.visits.length}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="py-8 text-center text-zinc-500">
                  {items.length === 0
                    ? "No Baro visit data available."
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
