"use client";

import { useState, useMemo } from "react";
import type { AdvisorData, AdvisorModResult } from "@/lib/data";
import { greedyBasketOptimize } from "@/lib/metrics";

type SortKey =
  | "profitPerDucat"
  | "profitPerDay"
  | "holdDays"
  | "sellNowProfit"
  | "holdProfit"
  | "ducatCost";

export default function BaroAdvisor({ data }: { data: AdvisorData }) {
  const [sortKey, setSortKey] = useState<SortKey>("profitPerDucat");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [ducatWallet, setDucatWallet] = useState<string>("");

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
                className="py-2 px-3 font-medium text-right cursor-pointer hover:text-zinc-200 whitespace-nowrap"
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
              return (
                <ModRow
                  key={mod.itemName}
                  mod={mod}
                  expanded={expandedIdx === i}
                  onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
                  highlighted={isInBasket === true}
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
}: {
  mod: AdvisorModResult;
  expanded: boolean;
  onToggle: () => void;
  highlighted: boolean;
}) {
  const verdictColor =
    mod.verdict === "BUY & HOLD"
      ? "text-emerald-400"
      : mod.verdict === "BUY & FLIP"
        ? "text-sky-400"
        : "text-zinc-500";

  const holdLabel =
    mod.verdict === "BUY & HOLD" && mod.holdDays !== null
      ? ` ~${mod.holdDays}d`
      : "";

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
          {mod.verdict}{holdLabel}
        </td>
        <td className="py-2 px-3 text-right font-mono">
          {mod.profitPerDucat > 0 ? mod.profitPerDucat.toFixed(2) : "—"}
        </td>
        <td className="py-2 px-3 text-right font-mono">
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
