"use client";

import { useState, useMemo, useCallback } from "react";
import type { RankedItem } from "@/lib/data";
import { useSettings, updateSettings } from "@/lib/settings";
import { buildWhisper } from "@/lib/whisper";

const LS_KEY_HAVE = "d2p_ducats_have";
const LS_KEY_NEED = "d2p_ducats_need";

interface PlannedPurchase {
  item_name: string;
  url_name: string;
  ducats: number;
  price: number;
  quantity: number;
  seller_name: string;
}

interface SellerGroup {
  seller_name: string;
  purchases: PlannedPurchase[];
  total_plat: number;
  total_ducats: number;
}

function planPurchases(
  items: RankedItem[],
  shortfall: number,
): PlannedPurchase[] {
  if (shortfall <= 0) return [];

  // Build a flat list of individual unit offers sorted by PpD (best first)
  const offers: {
    item_name: string;
    url_name: string;
    ducats: number;
    price: number;
    seller_name: string;
    ppd: number;
  }[] = [];

  for (const item of items) {
    if (!item.ducats || item.ducats <= 0) continue;
    for (const order of item.orders) {
      const ppd = item.ducats / order.price;
      for (let q = 0; q < order.quantity; q++) {
        offers.push({
          item_name: item.item_name,
          url_name: item.url_name,
          ducats: item.ducats,
          price: order.price,
          seller_name: order.seller_name,
          ppd,
        });
      }
    }
  }

  // Sort by PpD descending (best deals first)
  offers.sort((a, b) => b.ppd - a.ppd);

  // Greedily pick until shortfall covered
  const picked: PlannedPurchase[] = [];
  let remaining = shortfall;

  for (const offer of offers) {
    if (remaining <= 0) break;
    picked.push({
      item_name: offer.item_name,
      url_name: offer.url_name,
      ducats: offer.ducats,
      price: offer.price,
      quantity: 1,
      seller_name: offer.seller_name,
    });
    remaining -= offer.ducats;
  }

  // Consolidate same seller + same item + same price
  const consolidated = new Map<string, PlannedPurchase>();
  for (const p of picked) {
    const key = `${p.seller_name}|${p.url_name}|${p.price}`;
    const existing = consolidated.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.ducats += p.ducats;
    } else {
      consolidated.set(key, { ...p });
    }
  }

  return [...consolidated.values()];
}

function groupBySeller(purchases: PlannedPurchase[]): SellerGroup[] {
  const map = new Map<string, PlannedPurchase[]>();
  for (const p of purchases) {
    if (!map.has(p.seller_name)) map.set(p.seller_name, []);
    map.get(p.seller_name)!.push(p);
  }

  const groups: SellerGroup[] = [];
  for (const [seller_name, pList] of map) {
    groups.push({
      seller_name,
      purchases: pList,
      total_plat: pList.reduce((s, p) => s + p.price * p.quantity, 0),
      total_ducats: pList.reduce((s, p) => s + p.ducats, 0),
    });
  }

  groups.sort((a, b) => b.total_ducats - a.total_ducats);
  return groups;
}

// Safe to read in a useState initializer: the panel renders closed, so these
// values never appear in server-rendered HTML and cannot cause a hydration
// mismatch.
function readStoredNumber(key: string): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

export default function DucatPlanner({ items }: { items: RankedItem[] }) {
  const [open, setOpen] = useState(false);
  const [ducatsHave, setDucatsHave] = useState(() => readStoredNumber(LS_KEY_HAVE));
  const [ducatsNeed, setDucatsNeed] = useState(() => readStoredNumber(LS_KEY_NEED));
  const [copied, setCopied] = useState<string | null>(null);
  const settings = useSettings();

  const updateHave = useCallback((v: number) => {
    setDucatsHave(v);
    try { localStorage.setItem(LS_KEY_HAVE, String(v)); } catch {}
  }, []);

  const updateNeed = useCallback((v: number) => {
    setDucatsNeed(v);
    try { localStorage.setItem(LS_KEY_NEED, String(v)); } catch {}
  }, []);

  const shortfall = Math.max(0, ducatsNeed - ducatsHave);

  const { purchases, sellerGroups, totalPlat, totalDucats } = useMemo(() => {
    if (shortfall <= 0) return { purchases: [], sellerGroups: [], totalPlat: 0, totalDucats: 0 };
    const p = planPurchases(items, shortfall);
    const sg = groupBySeller(p);
    return {
      purchases: p,
      sellerGroups: sg,
      totalPlat: sg.reduce((s, g) => s + g.total_plat, 0),
      totalDucats: sg.reduce((s, g) => s + g.total_ducats, 0),
    };
  }, [items, shortfall]);

  async function copyWhisper(group: SellerGroup) {
    const text = buildWhisper(group.seller_name, group.purchases, group.total_plat);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(group.seller_name);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  return (
    <div className="border border-zinc-800 rounded mb-6">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-900 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-semibold">
          Ducat Shopping List
          <span className="ml-2 text-zinc-500 font-normal">planner</span>
        </span>
        <span className="text-xs text-zinc-500">{open ? "▼" : "▶"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <label className="text-sm text-zinc-400">
              <span className="block mb-1">Ducats I have</span>
              <input
                type="number"
                value={ducatsHave || ""}
                onChange={(e) => updateHave(Number(e.target.value) || 0)}
                min={0}
                className="w-28 px-3 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                placeholder="0"
              />
            </label>
            <label className="text-sm text-zinc-400">
              <span className="block mb-1">Ducats I need</span>
              <input
                type="number"
                value={ducatsNeed || ""}
                onChange={(e) => updateNeed(Number(e.target.value) || 0)}
                min={0}
                className="w-28 px-3 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                placeholder="0"
              />
            </label>
            <label className="text-sm text-zinc-400">
              <span className="block mb-1" title="Your daily trade count equals your Mastery Rank">Mastery Rank</span>
              <input
                type="number"
                value={settings.masteryRank ?? ""}
                onChange={(e) =>
                  updateSettings({ masteryRank: Number(e.target.value) || null })
                }
                min={0}
                max={40}
                className="w-20 px-3 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                placeholder="MR"
              />
            </label>
            <div className="text-sm">
              {shortfall > 0 ? (
                <span className="text-amber-400">Shortfall: {shortfall} ducats</span>
              ) : ducatsNeed > 0 ? (
                <span className="text-emerald-400">You have enough ducats!</span>
              ) : (
                <span className="text-zinc-500">Enter your ducat target</span>
              )}
            </div>
          </div>

          {shortfall > 0 && sellerGroups.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-4 mb-3 text-sm">
                <span className="text-zinc-400">
                  Cheapest path: <span className="text-emerald-400 font-semibold">{totalPlat}p</span> for{" "}
                  <span className="text-amber-400 font-semibold">{totalDucats} ducats</span>
                </span>
                <span className="text-zinc-500">
                  ({purchases.length} purchase{purchases.length !== 1 ? "s" : ""} from{" "}
                  {sellerGroups.length} seller{sellerGroups.length !== 1 ? "s" : ""})
                </span>
                {settings.masteryRank !== null && (
                  <span className="text-zinc-500">
                    ≈ {sellerGroups.length} of your ~{settings.masteryRank} daily trades
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {sellerGroups.map((group) => (
                  <div
                    key={group.seller_name}
                    className="border border-zinc-800 rounded overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/50">
                      <div className="text-sm">
                        <span className="font-medium text-zinc-200">{group.seller_name}</span>
                        <span className="ml-3 text-zinc-500">
                          {group.total_plat}p · {group.total_ducats} ducats
                        </span>
                      </div>
                      <button
                        onClick={() => copyWhisper(group)}
                        className="px-2.5 py-1 rounded text-xs bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition-colors text-zinc-300 whitespace-nowrap"
                      >
                        {copied === group.seller_name ? "Copied!" : "Copy /w"}
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-zinc-500 border-b border-zinc-800">
                            <th className="py-1 px-3 text-left font-medium">Item</th>
                            <th className="py-1 px-3 text-right font-medium">Ducats</th>
                            <th className="py-1 px-3 text-right font-medium">Price</th>
                            <th className="py-1 px-3 text-right font-medium">Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.purchases.map((p, i) => (
                            <tr key={i} className="border-b border-zinc-800/50">
                              <td className="py-1 px-3 text-zinc-300">{p.item_name}</td>
                              <td className="py-1 px-3 text-right text-amber-400">
                                {p.ducats}
                              </td>
                              <td className="py-1 px-3 text-right">{p.price}p</td>
                              <td className="py-1 px-3 text-right">{p.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {shortfall > 0 && sellerGroups.length === 0 && (
            <p className="text-sm text-zinc-500">
              No in-game sell orders available. Need a completed sweep with order snapshots.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
