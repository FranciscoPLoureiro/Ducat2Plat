"use client";

import { useState } from "react";
import Link from "next/link";
import type { RankedItem } from "@/lib/data";

export default function RankingTable({ items }: { items: RankedItem[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-zinc-700 text-zinc-400 text-left">
            <th className="py-2 px-3 font-medium">#</th>
            <th className="py-2 px-3 font-medium">Item</th>
            <th className="py-2 px-3 font-medium text-right">Ducats</th>
            <th className="py-2 px-3 font-medium text-right">Median</th>
            <th className="py-2 px-3 font-medium text-right">PpD</th>
            <th className="py-2 px-3 font-medium text-right">PpD@6</th>
            <th className="py-2 px-3 font-medium text-right">Velocity</th>
            <th className="py-2 px-3 font-medium text-right">Score</th>
            <th className="py-2 px-3 font-medium text-center">Depth</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <ItemRow
              key={item.id}
              item={item}
              rank={i + 1}
              isExpanded={expanded.has(item.id)}
              onToggle={() => toggle(item.id)}
            />
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={9} className="py-8 text-center text-zinc-500">
                No data available. Run a sweep first.
              </td>
            </tr>
          )}
        </tbody>
      </table>
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
  return (
    <>
      <tr
        className="border-b border-zinc-800 hover:bg-zinc-900 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="py-2 px-3 text-zinc-500">{rank}</td>
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
        <td className="py-2 px-3 text-right">{item.median}p</td>
        <td className="py-2 px-3 text-right">{item.ppd.toFixed(3)}</td>
        <td className="py-2 px-3 text-right font-semibold text-emerald-400">
          {item.ppd_at_n !== null ? item.ppd_at_n.toFixed(3) : "—"}
        </td>
        <td className="py-2 px-3 text-right">{item.velocity.toFixed(1)}/d</td>
        <td className="py-2 px-3 text-right font-bold text-cyan-400">
          {item.score.toFixed(3)}
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
