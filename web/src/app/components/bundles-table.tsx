"use client";

import { useMemo, useState } from "react";
import type { BundleSeller } from "@/lib/data";
import { useSettings, updateSettings } from "@/lib/settings";
import {
  buildExtrasWhisper,
  buildWhispers,
  completesIn,
  isSplit,
  lineLabel,
  partitionIntoTrades,
  selectFullTrades,
  slotsOf,
  TRADE_SIZE,
  type TradeLine,
  type WhisperItem,
} from "@/lib/whisper";

// What we'd actually buy from a seller: `items` go into the trades, `extras`
// are what "Full trades only" left out (still shown, buyable on request).
interface PlannedBundle {
  seller_name: string;
  items: WhisperItem[];
  extras: WhisperItem[];
  total_ducats: number;
  total_plat: number;
  combined_ppd: number;
}

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

const extraKey = (seller: string, i: WhisperItem) => `${seller}|${i.item_name}|${i.price}`;

function planBundle(b: BundleSeller, fullOnly: boolean, added: Set<string>): PlannedBundle {
  let items: WhisperItem[] = b.items;
  let extras: WhisperItem[] = [];
  if (fullOnly) {
    const sel = selectFullTrades(b.items);
    const isAdded = (i: WhisperItem) => added.has(extraKey(b.seller_name, i));
    items = [...sel.full, ...sel.extras.filter(isAdded)];
    extras = sel.extras;
  }
  const total_ducats = items.reduce((s, i) => s + i.ducats * i.quantity, 0);
  const total_plat = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const combined_ppd = total_plat > 0 ? total_ducats / total_plat : 0;
  return { seller_name: b.seller_name, items, extras, total_ducats, total_plat, combined_ppd };
}

const SEGMENT_COLORS = [
  "bg-sky-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-fuchsia-500",
  "bg-rose-500",
  "bg-lime-500",
  "bg-indigo-400",
  "bg-orange-400",
];
const TEXT_COLORS = [
  "text-sky-400",
  "text-amber-400",
  "text-emerald-400",
  "text-fuchsia-400",
  "text-rose-400",
  "text-lime-400",
  "text-indigo-300",
  "text-orange-300",
];

export default function BundlesTable({ bundles }: { bundles: BundleSeller[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [minDucats, setMinDucats] = useState(135);
  const [copied, setCopied] = useState<string | null>(null);
  const [whisperOpen, setWhisperOpen] = useState<Set<string>>(new Set());
  const [addedExtras, setAddedExtras] = useState<Set<string>>(new Set());
  const settings = useSettings();

  function toggleIn(setter: typeof setExpanded, key: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  const hide15 = settings.hide15Ducats ?? false;
  const minItemPpd = settings.minItemPpd ?? 0;
  const fullOnly = settings.fullTradesOnly ?? false;

  const processed = useMemo(() => {
    // Pruning a sub-threshold item shrinks the basket (and its whispers/trades)
    // but never removes the seller — a bundle only drops out when the ducats
    // filter rejects its remaining total, or nothing at all survives. The
    // ducats filter judges the whole basket, so "Full trades only" never hides
    // a seller; it only changes what we plan to buy from them.
    const result = bundles
      .map((b) => applyItemFilters(b, hide15, minItemPpd))
      .filter((b) => b.items.length >= 1 && b.total_ducats >= minDucats)
      .map((b) => planBundle(b, fullOnly, addedExtras));
    result.sort((a, b) => b.combined_ppd - a.combined_ppd);
    return result;
  }, [bundles, hide15, minItemPpd, minDucats, fullOnly, addedExtras]);

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
        <label
          className="flex items-center gap-1.5 text-zinc-400 cursor-pointer select-none"
          title="Plan only trades that carry all 6 parts — the most full trades, highest ducat value first. What doesn't fit is listed separately and can be added back."
        >
          <input
            type="checkbox"
            checked={fullOnly}
            onChange={(e) => updateSettings({ fullTradesOnly: e.target.checked })}
            className="accent-zinc-500"
          />
          Full trades only
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
              <th className="py-2 px-3 font-medium hidden sm:table-cell">#</th>
              <th className="py-2 px-3 font-medium" title="warframe.market seller (in-game at sweep time). Click the name to open their profile.">Seller</th>
              <th className="py-2 px-3 font-medium text-right" title="Trade slots this basket needs — one trade holds 6 parts, and a set costs one slot per part (sets can be split across trades). Expand for the per-trade breakdown.">Slots</th>
              <th className="py-2 px-3 font-medium text-right" title="Ducat value of the planned purchase">Total Ducats</th>
              <th className="py-2 px-3 font-medium text-right hidden sm:table-cell" title="Plat cost of the planned purchase at listed prices">Total Plat</th>
              <th className="py-2 px-3 font-medium text-right" title="Ducats per plat for the planned purchase — higher is better">Combined PpD</th>
              <th className="py-2 px-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((b, i) => (
              <SellerRow
                key={b.seller_name}
                bundle={b}
                rank={i + 1}
                fullOnly={fullOnly}
                isExpanded={expanded.has(b.seller_name)}
                onToggle={() => toggleIn(setExpanded, b.seller_name)}
                onCopy={(part, text) => copyText(`${b.seller_name}#${part}`, text)}
                copiedPart={
                  copied?.startsWith(`${b.seller_name}#`)
                    ? Number(copied.split("#")[1])
                    : null
                }
                whisperOpen={whisperOpen.has(b.seller_name)}
                onToggleWhisper={() => toggleIn(setWhisperOpen, b.seller_name)}
                isAdded={(i) => addedExtras.has(extraKey(b.seller_name, i))}
                onToggleExtra={(i) => toggleIn(setAddedExtras, extraKey(b.seller_name, i))}
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

// Six-segment bar for one trade, a colour per item so a set split across two
// trades shows up in the same colour in both.
function SlotBar({ lines, colorOf }: { lines: TradeLine[]; colorOf: (l: TradeLine) => number }) {
  const segments: number[] = [];
  for (const l of lines) {
    for (let q = 0; q < l.quantity; q++) {
      for (let p = 0; p < l.parts; p++) segments.push(colorOf(l));
    }
  }
  return (
    <span className="inline-flex gap-0.5 align-middle">
      {Array.from({ length: TRADE_SIZE }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-3 rounded-sm ${
            i < segments.length ? SEGMENT_COLORS[segments[i] % SEGMENT_COLORS.length] : "bg-zinc-800"
          }`}
        />
      ))}
    </span>
  );
}

function SellerRow({
  bundle,
  rank,
  fullOnly,
  isExpanded,
  onToggle,
  onCopy,
  copiedPart,
  whisperOpen,
  onToggleWhisper,
  isAdded,
  onToggleExtra,
}: {
  bundle: PlannedBundle;
  rank: number;
  fullOnly: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onCopy: (part: number, text: string) => void;
  copiedPart: number | null;
  whisperOpen: boolean;
  onToggleWhisper: () => void;
  isAdded: (i: WhisperItem) => boolean;
  onToggleExtra: (i: WhisperItem) => void;
}) {
  const trades = partitionIntoTrades(bundle.items);
  const parts = buildWhispers(bundle.seller_name, bundle.items, bundle.total_plat);
  const leftOut = bundle.extras.filter((i) => !isAdded(i));
  const extraMsgs = buildExtrasWhisper(bundle.seller_name, leftOut);
  const allMsgs = [...parts, ...extraMsgs];
  const leftOutSlots = leftOut.reduce((s, i) => s + slotsOf(i) * i.quantity, 0);
  const leftOutTrades = partitionIntoTrades(leftOut).length;

  // Stable colour per item (each copy of a repeated set its own), in order of
  // first appearance.
  const colorIndex = new Map<string, number>();
  for (const t of trades)
    for (const l of t.items)
      if (!colorIndex.has(lineLabel(l))) colorIndex.set(lineLabel(l), colorIndex.size);
  const colorOf = (l: TradeLine) => colorIndex.get(lineLabel(l)) ?? 0;

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
          {leftOutSlots > 0 && (
            <span className="text-zinc-600" title="Left out by Full trades only — expand to add back">
              {" "}
              +{leftOutSlots} extra
            </span>
          )}
        </td>
        <td className="py-2 px-3 text-right text-amber-400">
          {bundle.total_ducats}
        </td>
        <td className="py-2 px-3 text-right hidden sm:table-cell">{bundle.total_plat}p</td>
        <td className="py-2 px-3 text-right font-bold text-emerald-400">
          {bundle.combined_ppd.toFixed(1)}
        </td>
        <td className="py-2 px-3 text-right whitespace-nowrap">
          {allMsgs.length === 1 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopy(0, allMsgs[0]);
              }}
              className="px-2 py-1 rounded text-xs border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              {copiedPart === 0 ? "Copied!" : "Copy /w"}
            </button>
          ) : allMsgs.length > 1 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleWhisper();
              }}
              title={`${allMsgs.length} messages (Warframe chat length cap) — click to open`}
              className={`px-2 py-1 rounded text-xs border transition-colors ${
                whisperOpen
                  ? "border-emerald-700 text-emerald-300 bg-emerald-950/40"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              }`}
            >
              Copy /w ({allMsgs.length}) {whisperOpen ? "▲" : "▾"}
            </button>
          ) : null}
        </td>
      </tr>
      {whisperOpen && allMsgs.length > 1 && (
        <tr className="bg-zinc-900/60">
          <td colSpan={7} className="px-6 py-3">
            {parts.length > 0 && (
              <p className="text-xs text-zinc-500 mb-2">
                {parts.length > 1 ? "Send these in order:" : "Send this:"}
              </p>
            )}
            <div className="space-y-1.5">
              {allMsgs.map((msg, part) => (
                <div key={part}>
                  {part === parts.length && (
                    <p className="text-xs text-zinc-500 mt-3 mb-1.5">
                      Optional — separate message for the items left out of the full trades:
                    </p>
                  )}
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => onCopy(part, msg)}
                      className="shrink-0 w-24 px-2 py-1 rounded text-xs border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                    >
                      {copiedPart === part ? "✓ Copied" : `Copy ${part + 1}/${allMsgs.length}`}
                    </button>
                    <code className="min-w-0 pt-1 text-[11px] text-zinc-500 whitespace-normal break-words">
                      {msg}
                    </code>
                  </div>
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
                {trades.length} in-game trades of 6 parts (a set uses one slot per part and
                may be split across two trades — paid in the trade it completes), highest
                ducat value first.
              </p>
            )}
            {trades.length === 0 && (
              <p className="text-xs text-zinc-500 mb-2">
                No combination of these items fills a whole trade.
              </p>
            )}
            <div className="space-y-3">
              {trades.map((trade, ti) => (
                <div key={ti}>
                  {trades.length > 1 && (
                    <div
                      className={`flex items-center justify-between gap-3 text-xs font-medium px-1 mb-1 ${
                        trade.partial ? "text-amber-400" : "text-zinc-400"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>
                          Trade {ti + 1}/{trades.length}
                        </span>
                        <SlotBar lines={trade.items} colorOf={colorOf} />
                        {trade.partial && (
                          <span className="font-normal">
                            only {trade.slots} slot{trade.slots === 1 ? "" : "s"}, worth{" "}
                            {Math.round(trade.ducatTotal)}d —{" "}
                            {fullOnly
                              ? "from items you added back."
                              : "consider Full trades only."}
                          </span>
                        )}
                      </span>
                      <span className="text-zinc-500 whitespace-nowrap">
                        {trade.slots}/6 slots · {Math.round(trade.ducatTotal)}d · {trade.platTotal}p
                      </span>
                    </div>
                  )}
                  <table className="w-full text-xs">
                    <tbody>
                      {trade.items.map((item, ii) => {
                        const s = slotsOf(item);
                        const split = isSplit(item);
                        const done = completesIn(item);
                        return (
                          <tr key={`${ti}-${ii}`} className="border-b border-zinc-800/50">
                            <td className="py-1 px-2 text-zinc-300">
                              <span className={`mr-1.5 ${TEXT_COLORS[colorOf(item) % TEXT_COLORS.length]}`}>
                                ■
                              </span>
                              {lineLabel(item)}
                              {s > 1 && !split && (
                                <span className="ml-1 text-sky-400">(set · {s} parts)</span>
                              )}
                              {split && (
                                <span className="ml-1 text-sky-400">
                                  (set · {item.parts === 1 ? "part" : "parts"}{" "}
                                  {item.partsBefore + 1}
                                  {item.parts > 1 ? `–${item.partsBefore + item.parts}` : ""} of {s}
                                  {done ? ", completes here" : `, continues in trade ${ti + 2}`})
                                </span>
                              )}
                            </td>
                            <td className="py-1 px-2 text-right text-amber-400 w-16">
                              {split ? Math.round((item.ducats * item.parts) / s) : item.ducats}d
                            </td>
                            <td className="py-1 px-2 text-right w-12">
                              {done ? `${item.price}p` : <span className="text-zinc-600">—</span>}
                            </td>
                            <td className="py-1 px-2 text-right w-10 text-zinc-500">
                              {item.quantity > 1 ? `x${item.quantity}` : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            {bundle.extras.length > 0 && (
              <div className="mt-4 pt-3 border-t border-zinc-800">
                <p className="text-xs text-zinc-500 mb-1.5">
                  Not in the full trades
                  {leftOutSlots > 0 &&
                    ` — ${leftOutSlots} part${leftOutSlots === 1 ? "" : "s"}, ${leftOutTrades} more trade${leftOutTrades === 1 ? "" : "s"} on their own`}
                  . Tick one to add it to the trades above.
                </p>
                <table className="w-full text-xs">
                  <tbody>
                    {bundle.extras.map((item) => {
                      const s = slotsOf(item);
                      const on = isAdded(item);
                      return (
                        <tr key={`${item.item_name}|${item.price}`} className="border-b border-zinc-800/50">
                          <td className="py-1 px-2">
                            <label className={`flex items-center gap-2 cursor-pointer select-none ${on ? "text-zinc-300" : "text-zinc-500"}`}>
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => onToggleExtra(item)}
                                className="accent-zinc-500"
                              />
                              {item.item_name}
                              {s > 1 && <span className="text-sky-400/70">(set · {s} parts)</span>}
                            </label>
                          </td>
                          <td className="py-1 px-2 text-right text-amber-400/70 w-16">{item.ducats}d</td>
                          <td className="py-1 px-2 text-right w-12">{item.price}p</td>
                          <td className="py-1 px-2 text-right w-10 text-zinc-500">
                            {item.quantity > 1 ? `x${item.quantity}` : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
