"use client";

import { useState, useMemo } from "react";
import type { AdvisorData, AdvisorModResult } from "@/lib/data";
import { greedyBasketOptimize } from "@/lib/metrics";
import { useWriteToken } from "@/lib/write-token";

type SortKey =
  | "profitPerDucat"
  | "profitPerDay"
  | "holdDays"
  | "sellNowProfit"
  | "holdProfit"
  | "ducatCost";

interface BuyFormState {
  modIdx: number;
  qty: string;
  costDucats: string;
  costCredits: string;
  targetPrice: string;
}

export default function BaroAdvisor({ data, junkRate }: { data: AdvisorData; junkRate: number }) {
  const writeToken = useWriteToken();
  const [sortKey, setSortKey] = useState<SortKey>("profitPerDucat");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [ducatWallet, setDucatWallet] = useState<string>("");
  const [buyForm, setBuyForm] = useState<BuyFormState | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyResult, setBuyResult] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const arr = [...data.mods];
    arr.sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return arr;
  }, [data.mods, sortKey, sortAsc]);

  const basket = useMemo(() => {
    const wallet = parseInt(ducatWallet, 10);
    if (!wallet || wallet <= 0) return null;
    const candidates = data.mods.map((m, i) => ({
      index: i,
      ducatCost: m.ducatCost,
      profitPerDucat: m.profitPerDucat,
    }));
    const selectedIndices = greedyBasketOptimize(candidates, wallet);
    const selected = selectedIndices.map((i) => data.mods[i]);
    const totalDucats = selected.reduce((s, m) => s + m.ducatCost, 0);
    const totalCredits = selected.reduce((s, m) => s + m.creditCost, 0);
    const totalFlipProfit = selected.reduce((s, m) => s + m.sellNowProfit, 0);
    const totalHoldProfit = selected.reduce(
      (s, m) => s + (m.holdProfit ?? m.sellNowProfit),
      0,
    );
    return { selected, totalDucats, totalCredits, totalFlipProfit, totalHoldProfit };
  }, [data.mods, ducatWallet]);

  function openBuyForm(mod: AdvisorModResult, idx: number) {
    const defaultTarget = mod.baseline !== null
      ? Math.round(mod.baseline * 0.95 * 100) / 100
      : 0;
    setBuyForm({
      modIdx: idx,
      qty: "1",
      costDucats: String(mod.ducatCost),
      costCredits: String(mod.creditCost),
      targetPrice: String(defaultTarget),
    });
    setBuyResult(null);
  }

  async function submitBuy(mod: AdvisorModResult) {
    if (!buyForm || !mod.itemId) return;
    setBuying(true);
    setBuyResult(null);
    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-revalidate-token": writeToken ?? "",
        },
        body: JSON.stringify({
          item_id: mod.itemId,
          qty: parseInt(buyForm.qty, 10),
          cost_ducats: parseInt(buyForm.costDucats, 10),
          cost_credits: parseInt(buyForm.costCredits, 10),
          junk_rate_at_buy: junkRate,
          baseline_at_buy: mod.baseline ?? 0,
          target_price: parseFloat(buyForm.targetPrice),
        }),
      });
      if (res.ok) {
        setBuyResult("Position recorded!");
        setTimeout(() => { setBuyForm(null); setBuyResult(null); }, 1500);
      } else {
        const err = await res.json();
        setBuyResult(`Error: ${err.error}`);
      }
    } catch {
      setBuyResult("Network error");
    } finally {
      setBuying(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return "";
    return sortAsc ? " ▲" : " ▼";
  }

  return (
    <div>
      {data.isSpecialVisit && (
        <div className="mb-3 px-4 py-2 rounded bg-purple-900/40 border border-purple-700 text-purple-200 text-sm">
          <strong>TennoCon / Special visit:</strong> Everything is restocked
          simultaneously — baselines are from before this visit, recovery will
          likely be slower than normal. Numbers may be regime-distorted.
        </div>
      )}

      {data.isTennoConWindow && !data.isSpecialVisit && (
        <div className="mb-3 px-4 py-2 rounded bg-amber-900/40 border border-amber-700 text-amber-200 text-sm">
          <strong>TennoCon approaching:</strong> Hoard values historically dip
          into the annual full-catalog event. Hold recommendations may be
          optimistic.
        </div>
      )}

      {/* Basket optimizer */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-zinc-400">
          Ducat wallet
          <input
            type="number"
            min="0"
            step="50"
            value={ducatWallet}
            onChange={(e) => setDucatWallet(e.target.value)}
            placeholder="e.g. 3000"
            className="ml-2 w-28 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
        </label>
        {basket && basket.selected.length > 0 && (
          <div className="text-sm text-zinc-300">
            Suggested basket: {basket.selected.length} mods,{" "}
            <span className="text-amber-400">{basket.totalDucats} ducats</span>,{" "}
            <span className="text-zinc-400">
              {basket.totalCredits.toLocaleString()} cr
            </span>
            {" → flip "}
            <span className={basket.totalFlipProfit >= 0 ? "text-emerald-400" : "text-red-400"}>
              {basket.totalFlipProfit >= 0 ? "+" : ""}{Math.round(basket.totalFlipProfit)}p
            </span>
            {" / hold "}
            <span className={basket.totalHoldProfit >= 0 ? "text-emerald-400" : "text-red-400"}>
              {basket.totalHoldProfit >= 0 ? "+" : ""}{Math.round(basket.totalHoldProfit)}p
            </span>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-zinc-700 text-zinc-400 text-left">
              <th className="py-2 px-3 font-medium">Mod</th>
              <th className="py-2 px-3 font-medium">Verdict</th>
              <th
                className="py-2 px-3 font-medium text-right cursor-pointer hover:text-zinc-200 whitespace-nowrap"
                onClick={() => toggleSort("profitPerDucat")}
              >
                p/ducat{sortIcon("profitPerDucat")}
              </th>
              <th
                className="py-2 px-3 font-medium text-right cursor-pointer hover:text-zinc-200 whitespace-nowrap hidden sm:table-cell"
                onClick={() => toggleSort("profitPerDay")}
              >
                p/day{sortIcon("profitPerDay")}
              </th>
              <th
                className="py-2 px-3 font-medium text-right cursor-pointer hover:text-zinc-200 whitespace-nowrap"
                onClick={() => toggleSort("ducatCost")}
              >
                Ducats{sortIcon("ducatCost")}
              </th>
              <th className="py-2 px-3 font-medium text-center">Stage</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((mod, i) => {
              const isInBasket = basket?.selected.includes(mod);
              const isBuyRow = mod.verdict === "BUY & HOLD" || mod.verdict === "BUY & FLIP";
              return (
                <ModRow
                  key={mod.itemName}
                  mod={mod}
                  expanded={expandedIdx === i}
                  onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
                  highlighted={isInBasket === true}
                  showBuyButton={isBuyRow && !!writeToken && !!mod.itemId}
                  buyFormOpen={buyForm?.modIdx === i}
                  buyForm={buyForm?.modIdx === i ? buyForm : null}
                  onBuyClick={() => openBuyForm(mod, i)}
                  onBuyFormChange={(f) => setBuyForm(f)}
                  onBuySubmit={() => submitBuy(mod)}
                  onBuyCancel={() => { setBuyForm(null); setBuyResult(null); }}
                  buying={buying && buyForm?.modIdx === i}
                  buyResult={buyForm?.modIdx === i ? buyResult : null}
                />
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-500">
                  No primed mods with pricing data in this visit.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-600 mt-2">
        Baselines from the 30 days before this visit&apos;s arrival.
        Hold target = 95% of baseline. No extrapolation beyond day 42.
        {data.archiveMonths < 12 && (
          <> Stage C features (baseline drift, TennoCon seasonality) activate at 12 months of data ({data.archiveMonths} months so far).</>
        )}
      </p>
    </div>
  );
}

function ModRow({
  mod,
  expanded,
  onToggle,
  highlighted,
  showBuyButton,
  buyFormOpen,
  buyForm,
  onBuyClick,
  onBuyFormChange,
  onBuySubmit,
  onBuyCancel,
  buying,
  buyResult,
}: {
  mod: AdvisorModResult;
  expanded: boolean;
  onToggle: () => void;
  highlighted: boolean;
  showBuyButton: boolean;
  buyFormOpen: boolean;
  buyForm: BuyFormState | null;
  onBuyClick: () => void;
  onBuyFormChange: (f: BuyFormState) => void;
  onBuySubmit: () => void;
  onBuyCancel: () => void;
  buying: boolean;
  buyResult: string | null;
}) {
  const verdictColor =
    mod.verdict === "BUY & HOLD"
      ? "text-emerald-400"
      : mod.verdict === "BUY & FLIP"
        ? "text-sky-400"
        : "text-zinc-500";

  // Recovery-speed badge: fast rebounds free capital quickly; at/above the
  // 42-day cap means the estimate is a bound, not an observation.
  const holdBadge =
    mod.verdict === "BUY & HOLD" && mod.holdDays !== null ? (
      <span
        className={
          mod.holdDays < 21
            ? "text-emerald-300"
            : mod.holdDays < 42
              ? "text-amber-300"
              : "text-red-300"
        }
        title={
          mod.holdDays < 21
            ? "Fast recovery — capital freed quickly"
            : mod.holdDays < 42
              ? "Moderate recovery"
              : "Slow/unknown recovery — conservative bound, capital may sit for weeks"
        }
      >
        {" "}~{mod.holdDays}d
      </span>
    ) : null;

  return (
    <>
      <tr
        className={`border-b border-zinc-800 hover:bg-zinc-900 transition-colors cursor-pointer ${highlighted ? "bg-emerald-950/30" : ""}`}
        onClick={onToggle}
      >
        <td className="py-2 px-3 font-medium">
          <span className="text-xs text-zinc-600 mr-1">{expanded ? "▼" : "▶"}</span>
          {mod.urlName ? (
            <a
              href={`/item/${mod.urlName}`}
              className="hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {mod.itemName}
            </a>
          ) : (
            mod.itemName
          )}
          {mod.restockRisk && (
            <span
              className="ml-1 text-xs text-amber-500"
              title="Median restock interval is shorter than recovery time — price may drop again before recovery"
            >
              ⚠ restock
            </span>
          )}
        </td>
        <td className={`py-2 px-3 font-semibold whitespace-nowrap ${verdictColor}`}>
          {mod.verdict}{holdBadge}
          {showBuyButton && !buyFormOpen && (
            <button
              className="ml-2 px-2 py-0.5 text-xs rounded bg-emerald-800 hover:bg-emerald-700 text-emerald-200 font-normal"
              onClick={(e) => { e.stopPropagation(); onBuyClick(); }}
            >
              I bought this
            </button>
          )}
        </td>
        <td className="py-2 px-3 text-right font-mono">
          {mod.profitPerDucat > 0 ? mod.profitPerDucat.toFixed(2) : "—"}
        </td>
        <td className="py-2 px-3 text-right font-mono hidden sm:table-cell">
          {mod.profitPerDay !== null ? mod.profitPerDay.toFixed(1) : "—"}
        </td>
        <td className="py-2 px-3 text-right text-amber-400">
          {mod.ducatCost}
        </td>
        <td className="py-2 px-3 text-center">
          <span
            className="text-xs text-zinc-500 cursor-help border-b border-dotted border-zinc-600"
            title={mod.stageLabel}
          >
            {mod.n < 3 ? `n=${mod.n}` : `n=${mod.n}`}
          </span>
        </td>
      </tr>
      {buyFormOpen && buyForm && (
        <tr className="border-b border-zinc-800 bg-emerald-950/20">
          <td colSpan={6} className="px-6 py-3">
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label className="text-zinc-400">
                Qty
                <input
                  type="number" min="1" value={buyForm.qty}
                  onChange={(e) => onBuyFormChange({ ...buyForm, qty: e.target.value })}
                  className="ml-1 w-16 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-200"
                  onClick={(e) => e.stopPropagation()}
                />
              </label>
              <label className="text-zinc-400">
                Ducat cost
                <input
                  type="number" min="0" value={buyForm.costDucats}
                  onChange={(e) => onBuyFormChange({ ...buyForm, costDucats: e.target.value })}
                  className="ml-1 w-20 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-200"
                  onClick={(e) => e.stopPropagation()}
                />
              </label>
              <label className="text-zinc-400">
                Credits
                <input
                  type="number" min="0" value={buyForm.costCredits}
                  onChange={(e) => onBuyFormChange({ ...buyForm, costCredits: e.target.value })}
                  className="ml-1 w-24 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-200"
                  onClick={(e) => e.stopPropagation()}
                />
              </label>
              <label className="text-zinc-400">
                Target price
                <input
                  type="number" min="0" step="0.01" value={buyForm.targetPrice}
                  onChange={(e) => onBuyFormChange({ ...buyForm, targetPrice: e.target.value })}
                  className="ml-1 w-24 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-200"
                  onClick={(e) => e.stopPropagation()}
                />
              </label>
              <button
                className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-emerald-100 text-sm disabled:opacity-50"
                onClick={(e) => { e.stopPropagation(); onBuySubmit(); }}
                disabled={buying}
              >
                {buying ? "Saving..." : "Record"}
              </button>
              <button
                className="px-3 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm"
                onClick={(e) => { e.stopPropagation(); onBuyCancel(); }}
              >
                Cancel
              </button>
              {buyResult && (
                <span className={`text-sm ${buyResult.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
                  {buyResult}
                </span>
              )}
            </div>
          </td>
        </tr>
      )}
      {expanded && <ExpandedDetails mod={mod} />}
    </>
  );
}

function ExpandedDetails({ mod }: { mod: AdvisorModResult }) {
  return (
    <tr className="border-b border-zinc-800 bg-zinc-900/50">
      <td colSpan={6} className="px-6 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Detail label="Sell-now profit" value={fmt(mod.sellNowProfit)} />
          <Detail
            label="Hold profit"
            value={mod.holdProfit !== null ? fmt(mod.holdProfit) : "—"}
          />
          <Detail
            label="Baseline"
            value={mod.baseline !== null ? `${Math.round(mod.baseline)}p` : "—"}
          />
          <Detail
            label="Recovery days"
            value={mod.holdDays !== null ? `${mod.holdDays}d` : "—"}
          />
          <Detail
            label="Restock interval"
            value={
              mod.restockIntervalDays !== null
                ? `~${mod.restockIntervalDays}d`
                : "—"
            }
          />
          <Detail
            label="Current resale (R0)"
            value={
              mod.resaleMedian !== null
                ? `${Math.round(mod.resaleMedian)}p`
                : "—"
            }
          />
          <Detail label="Credits" value={mod.creditCost.toLocaleString()} />
          <Detail
            label="Sample size"
            value={
              mod.n < 3
                ? `n=${mod.n} — insufficient history`
                : `n=${mod.n}`
            }
          />
          <Detail
            label="Stage"
            value={`${mod.stage} — ${mod.stageLabel}`}
          />
          {mod.baselineDrift !== null && (
            <Detail
              label="Baseline drift"
              value={`${mod.baselineDrift.drift >= 0 ? "+" : ""}${(mod.baselineDrift.drift * 100).toFixed(0)}% (90d: ${Math.round(mod.baselineDrift.shortBaseline)}p vs 365d: ${Math.round(mod.baselineDrift.longBaseline)}p)`}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-zinc-500">{label}: </span>
      <span className="text-zinc-200">{value}</span>
    </div>
  );
}

function fmt(v: number): string {
  const r = Math.round(v);
  return `${r >= 0 ? "+" : ""}${r}p`;
}
