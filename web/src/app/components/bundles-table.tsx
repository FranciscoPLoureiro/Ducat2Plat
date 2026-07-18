"use client";

import { useMemo, useState } from "react";
import type { BundleSeller } from "@/lib/data";
import { useSettings } from "@/lib/settings";

function buildWhisper(bundle: BundleSeller): string {
  const itemList = bundle.items
    .map((i) => (i.quantity > 1 ? `${i.item_name} x${i.quantity}` : i.item_name))
    .join(", ");
  return `/w ${bundle.seller_name} Hi! WTB: ${itemList} for ${bundle.total_plat}p (warframe.market)`;
}

export default function BundlesTable({ bundles }: { bundles: BundleSeller[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [minDucats, setMinDucats] = useState(135);
  const [copied, setCopied] = useState<string | null>(null);
  const settings = useSettings();

  function toggle(seller: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(seller)) next.delete(seller);
      else next.add(seller);
      return next;
    });
  }

  async function copyWhisper(bundle: BundleSeller) {
    try {
      await navigator.clipboard.writeText(buildWhisper(bundle));
      setCopied(bundle.seller_name);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  const filtered = useMemo(() => {
    let result = bundles.filter((b) => b.total_ducats >= minDucats);
    if (!showAll) result = result.slice(0, 50);
    return result;
  }, [bundles, minDucats, showAll]);

  const fullCount = useMemo(
    () => bundles.filter((b) => b.total_ducats >= minDucats).length,
    [bundles, minDucats],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <label className="flex items-center gap-1.5 text-zinc-400">
          Min ducats
          <input
            type="number"
            value={minDucats}
            onChange={(e) => setMinDucats(Number(e.target.value) || 0)}
            min={0}
            step={45}
            className="w-20 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500"
          />
        </label>
        {fullCount > 50 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            {showAll ? "Top 50" : `Show all (${fullCount})`}
          </button>
        )}
        {settings.masteryRank !== null && (
          <span className="text-zinc-500 text-xs">
            Each seller ≈ 1 trade of your ~{settings.masteryRank}/day cap
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-zinc-700 text-zinc-400 text-left">
              <th className="py-2 px-3 font-medium">#</th>
              <th className="py-2 px-3 font-medium" title="warframe.market seller (in-game at sweep time). Click the name to open their profile.">Seller</th>
              <th className="py-2 px-3 font-medium text-right" title="Distinct candidate items this seller offers — one trade holds up to 6">Items</th>
              <th className="py-2 px-3 font-medium text-right" title="Ducat value of buying the whole basket">Total Ducats</th>
              <th className="py-2 px-3 font-medium text-right" title="Plat cost of the whole basket at listed prices">Total Plat</th>
              <th className="py-2 px-3 font-medium text-right" title="Ducats per plat for the whole basket — higher is better">Combined PpD</th>
              <th className="py-2 px-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((b, i) => (
              <SellerRow
                key={b.seller_name}
                bundle={b}
                rank={i + 1}
                isExpanded={expanded.has(b.seller_name)}
                onToggle={() => toggle(b.seller_name)}
                onCopy={() => copyWhisper(b)}
                copied={copied === b.seller_name}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-zinc-500">
                  {bundles.length === 0
                    ? "No bundles available. Need order snapshots from a completed sweep."
                    : "No bundles match the minimum ducats filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SellerRow({
  bundle,
  rank,
  isExpanded,
  onToggle,
  onCopy,
  copied,
}: {
  bundle: BundleSeller;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
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
          <a
            href={`https://warframe.market/profile/${encodeURIComponent(bundle.seller_name)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="hover:text-emerald-400 transition-colors"
          >
            {bundle.seller_name}
          </a>
        </td>
        <td className="py-2 px-3 text-right">{bundle.items.length}</td>
        <td className="py-2 px-3 text-right text-amber-400">
          {bundle.total_ducats}
        </td>
        <td className="py-2 px-3 text-right">{bundle.total_plat}p</td>
        <td className="py-2 px-3 text-right font-bold text-emerald-400">
          {bundle.combined_ppd.toFixed(1)}
        </td>
        <td className="py-2 px-3 text-right">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className="px-2 py-1 rounded text-xs border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            {copied ? "Copied!" : "Copy /w"}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-zinc-900/50">
          <td colSpan={7} className="px-6 py-3">
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
