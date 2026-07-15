"use client";

import { useState } from "react";
import type { BundleSeller } from "@/lib/data";

export default function BundlesTable({ bundles }: { bundles: BundleSeller[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(seller: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(seller)) next.delete(seller);
      else next.add(seller);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-zinc-700 text-zinc-400 text-left">
            <th className="py-2 px-3 font-medium">#</th>
            <th className="py-2 px-3 font-medium">Seller</th>
            <th className="py-2 px-3 font-medium text-right">Items</th>
            <th className="py-2 px-3 font-medium text-right">Total Ducats</th>
            <th className="py-2 px-3 font-medium text-right">Total Plat</th>
            <th className="py-2 px-3 font-medium text-right">Combined PpD</th>
          </tr>
        </thead>
        <tbody>
          {bundles.map((b, i) => (
            <SellerRow
              key={b.seller_name}
              bundle={b}
              rank={i + 1}
              isExpanded={expanded.has(b.seller_name)}
              onToggle={() => toggle(b.seller_name)}
            />
          ))}
          {bundles.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-zinc-500">
                No bundles available. Need order snapshots from a completed sweep.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SellerRow({
  bundle,
  rank,
  isExpanded,
  onToggle,
}: {
  bundle: BundleSeller;
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
          {bundle.seller_name}
        </td>
        <td className="py-2 px-3 text-right">{bundle.items.length}</td>
        <td className="py-2 px-3 text-right text-amber-400">
          {bundle.total_ducats}
        </td>
        <td className="py-2 px-3 text-right">{bundle.total_plat}p</td>
        <td className="py-2 px-3 text-right font-bold text-emerald-400">
          {bundle.combined_ppd.toFixed(3)}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-zinc-900/50">
          <td colSpan={6} className="px-6 py-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="py-1 px-2 text-left font-medium">Item</th>
                  <th className="py-1 px-2 text-right font-medium">Ducats</th>
                  <th className="py-1 px-2 text-right font-medium">Price</th>
                  <th className="py-1 px-2 text-right font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {bundle.items.map((item) => (
                  <tr
                    key={item.url_name}
                    className="border-b border-zinc-800/50"
                  >
                    <td className="py-1 px-2 text-zinc-300">
                      {item.item_name}
                    </td>
                    <td className="py-1 px-2 text-right text-amber-400">
                      {item.ducats}
                    </td>
                    <td className="py-1 px-2 text-right">{item.price}p</td>
                    <td className="py-1 px-2 text-right">{item.quantity}</td>
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
