"use client";

import { useMemo, useState } from "react";
import type { BundleSeller } from "@/lib/data";
import { useSettings, updateSettings } from "@/lib/settings";
import { buildWhispers, partitionIntoTrades } from "@/lib/whisper";

// Per-item filters run client-side, so a basket's items, totals, PpD and trade
// breakdown must all be recomputed from the surviving items.
function applyItemFilters(
  b: BundleSeller,
  hide15: boolean,
  minPpd: number,
): BundleSeller {
  const items = b.items.filter((i) => {
    if (hide15 && i.ducats === 15) return false;
    if (minPpd > 0 && i.price > 0 && i.ducats / i.price < minPpd) return false;
    return true;
  });
  const total_ducats = items.reduce((s, i) => s + i.ducats * i.quantity, 0);
  const total_plat = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const combined_ppd = total_plat > 0 ? total_ducats / total_plat : 0;
  return { ...b, items, total_ducats, total_plat, combined_ppd };
}

export default function BundlesTable({ bundles }: { bundles: BundleSeller[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [minDucats, setMinDucats] = useState(135);
  const [copied, setCopied] = useState<string | null>(null);
  const [whisperOpen, setWhisperOpen] = useState<Set<string>>(new Set());
  const settings = useSettings();

  function toggleWhisper(seller: string) {
    setWhisperOpen((prev) => {
      const next = new Set(prev);
      if (next.has(seller)) next.delete(seller);
      else next.add(seller);
      return next;
    });
  }

  function toggle(seller: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(seller)) next.delete(seller);
      else next.add(seller);
      return next;
    });
  }

  async function copyWhisper(bundle: BundleSeller, part: number) {
    try {
      const parts = buildWhispers(bundle.seller_name, bundle.items, bundle.total_plat);
      await navigator.clipboard.writeText(parts[part] ?? parts[0]);
      setCopied(`${bundle.seller_name}#${part}`);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  const hide15 = settings.hide15Ducats ?? false;
  const minItemPpd = settings.minItemPpd ?? 0;

  const processed = useMemo(() => {
    const result = bundles
      .map((b) => applyItemFilters(b, hide15, minItemPpd))
      .filter((b) => b.items.length >= 2 && b.total_ducats >= minDucats);
    result.sort((a, b) => b.combined_ppd - a.combined_ppd);
    return result;
  }, [bundles, hide15, minItemPpd, minDucats]);

  const fullCount = processed.length;
  const filtered = useMemo(
    () => (showAll ? processed : processed.slice(0, 50)),
    [processed, showAll],
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
        <label className="flex items-center gap-1.5 text-zinc-400">
          Min item PpD
          <input
            type="number"
            value={settings.minItemPpd ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              updateSettings({ minItemPpd: v === "" ? null : Number(v) || 0 });
            }}
            min={0}
            step={0.5}
            placeholder="0"
            className="w-16 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500"
          />
        </label>
        <label className="flex items-center gap-1.5 text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={settings.hide15Ducats ?? false}
            onChange={(e) => updateSettings({ hide15Ducats: e.target.checked })}
            className="accent-zinc-500"
          />
          Hide 15-ducat items
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
              <th className="py-2 px-3 font-medium text-right" title="Trade slots this basket needs — one trade holds 6, and a set costs one slot per part. Expand for the per-trade breakdown.">Slots</th>
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
                onCopy={(part) => copyWhisper(b, part)}
                copiedPart={
                  copied?.startsWith(`${b.seller_name}#`)
                    ? Number(copied.split("#")[1])
                    : null
                }
                whisperOpen={whisperOpen.has(b.seller_name)}
                onToggleWhisper={() => toggleWhisper(b.seller_name)}
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
  copiedPart,
  whisperOpen,
  onToggleWhisper,
}: {
  bundle: BundleSeller;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
  onCopy: (part: number) => void;
  copiedPart: number | null;
  whisperOpen: boolean;
  onToggleWhisper: () => void;
}) {
  const parts = buildWhispers(bundle.seller_name, bundle.items, bundle.total_plat);
  const trades = partitionIntoTrades(bundle.items);

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
        <td className="py-2 px-3 text-right whitespace-nowrap">
          {trades.reduce((s, t) => s + t.slots, 0)}
          {trades.length > 1 && (
            <span className="text-zinc-500"> · {trades.length} trades</span>
          )}
        </td>
        <td className="py-2 px-3 text-right text-amber-400">
          {bundle.total_ducats}
        </td>
        <td className="py-2 px-3 text-right">{bundle.total_plat}p</td>
        <td className="py-2 px-3 text-right font-bold text-emerald-400">
          {bundle.combined_ppd.toFixed(1)}
        </td>
        <td className="py-2 px-3 text-right whitespace-nowrap">
          {parts.length === 1 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopy(0);
              }}
              className="px-2 py-1 rounded text-xs border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              {copiedPart === 0 ? "Copied!" : "Copy /w"}
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleWhisper();
              }}
              title={`Message split into ${parts.length} parts (Warframe chat length cap) — click to open`}
              className={`px-2 py-1 rounded text-xs border transition-colors ${
                whisperOpen
                  ? "border-emerald-700 text-emerald-300 bg-emerald-950/40"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              }`}
            >
              Copy /w ({parts.length}) {whisperOpen ? "▲" : "▾"}
            </button>
          )}
        </td>
      </tr>
      {whisperOpen && parts.length > 1 && (
        <tr className="bg-zinc-900/60">
          <td colSpan={7} className="px-6 py-3">
            <p className="text-xs text-zinc-500 mb-2">
              Warframe caps message length — send these in order:
            </p>
            <div className="space-y-1.5">
              {parts.map((msg, part) => (
                <div key={part} className="flex items-center gap-2">
                  <button
                    onClick={() => onCopy(part)}
                    className="shrink-0 w-24 px-2 py-1 rounded text-xs border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                  >
                    {copiedPart === part ? "✓ Copied" : `Copy ${part + 1}/${parts.length}`}
                  </button>
                  <code className="text-[11px] text-zinc-500 truncate">{msg}</code>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
      {isExpanded && (
        <tr className="bg-zinc-900/50">
          <td colSpan={7} className="px-6 py-3">
            {trades.length > 1 && (
              <p className="text-xs text-zinc-500 mb-2">
                {trades.length} in-game trades needed (6 slots each; a set uses one
                slot per part), highest ducat value first.
              </p>
            )}
            <div className="space-y-3">
              {trades.map((trade, ti) => (
                <div key={ti}>
                  {trades.length > 1 && (
                    <div
                      className={`flex items-center justify-between text-xs font-medium px-1 mb-1 ${
                        trade.partial ? "text-amber-400" : "text-zinc-400"
                      }`}
                    >
                      <span>
                        Trade {ti + 1}/{trades.length}
                        {trade.partial && (
                          <span className="ml-1 font-normal">
                            — only {trade.slots} slot{trade.slots === 1 ? "" : "s"},
                            worth {trade.ducatTotal}d. A whole trade for little value —
                            consider skipping.
                          </span>
                        )}
                      </span>
                      <span className="text-zinc-500">
                        {trade.slots}/6 slots · {trade.ducatTotal}d · {trade.platTotal}p
                      </span>
                    </div>
                  )}
                  <table className="w-full text-xs">
                    <tbody>
                      {trade.items.map((item, ii) => (
                        <tr key={`${ti}-${ii}`} className="border-b border-zinc-800/50">
                          <td className="py-1 px-2 text-zinc-300">
                            {item.item_name}
                            {item.slots && item.slots > 1 && (
                              <span className="ml-1 text-sky-400">
                                (set · {item.slots} parts)
                              </span>
                            )}
                          </td>
                          <td className="py-1 px-2 text-right text-amber-400 w-16">
                            {item.ducats}d
                          </td>
                          <td className="py-1 px-2 text-right w-12">{item.price}p</td>
                          <td className="py-1 px-2 text-right w-10 text-zinc-500">
                            {item.quantity > 1 ? `x${item.quantity}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
