"use client";

import { useState } from "react";
import type { Position } from "@/lib/data";
import { useWriteToken } from "@/lib/write-token";

export default function PositionsTable({
  positions,
  showClose,
}: {
  positions: Position[];
  showClose: boolean;
}) {
  const writeToken = useWriteToken();
  const [closingId, setClosingId] = useState<number | null>(null);
  const [closePrice, setClosePrice] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleTargetSave(id: number) {
    if (!writeToken || !editTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/positions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-revalidate-token": writeToken,
        },
        body: JSON.stringify({ target_price: parseFloat(editTarget) }),
      });
      if (res.ok) window.location.reload();
      else setResult("Error updating target");
    } catch {
      setResult("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClose(id: number) {
    if (!writeToken || !closePrice) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(`/api/positions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-revalidate-token": writeToken,
        },
        body: JSON.stringify({ action: "close", closed_price: parseFloat(closePrice) }),
      });
      if (res.ok) {
        setResult("Closed!");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const err = await res.json();
        setResult(`Error: ${err.error}`);
      }
    } catch {
      setResult("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (positions.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-4">
        No positions. Buy mods from the{" "}
        <a href="/baro" className="text-emerald-400 hover:underline">Hold Advisor</a>{" "}
        to start tracking.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-zinc-700 text-zinc-400 text-left">
            <th className="py-2 px-3 font-medium">Mod</th>
            <th className="py-2 px-3 font-medium text-right">Qty</th>
            <th className="py-2 px-3 font-medium text-right" title="Ducats paid at Baro, per unit">Cost (ducats)</th>
            <th className="py-2 px-3 font-medium text-right hidden sm:table-cell" title="Ducats × the junk rate at purchase time — what those ducats effectively cost in plat">Cost (plat est.)</th>
            <th className="py-2 px-3 font-medium text-right" title="Latest daily rank-0 median (open) or your recorded sale price (closed)">Current</th>
            <th className="py-2 px-3 font-medium text-right" title="Sell alert fires when the median reaches this — click to edit">Target</th>
            <th className="py-2 px-3 font-medium text-right hidden sm:table-cell" title="Current median minus target — positive means the target is reached">Distance</th>
            <th className="py-2 px-3 font-medium text-right hidden sm:table-cell" title="Days since purchase">Days</th>
            <th className="py-2 px-3 font-medium text-right">
              {showClose ? "P/L (est.)" : "Realized P/L"}
            </th>
            {showClose && writeToken && <th className="py-2 px-3 font-medium" />}
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const costPlat = p.cost_ducats * p.junk_rate_at_buy;
            const pnl = showClose ? p.unrealized_pnl : p.realized_pnl;
            return (
              <tr key={p.id} className="border-b border-zinc-800 hover:bg-zinc-900 transition-colors">
                <td className="py-2 px-3 font-medium">
                  <a href={`/item/${p.url_name}`} className="hover:underline">
                    {p.item_name}
                  </a>
                </td>
                <td className="py-2 px-3 text-right">{p.qty}</td>
                <td className="py-2 px-3 text-right text-amber-400">{p.cost_ducats * p.qty}</td>
                <td className="py-2 px-3 text-right font-mono text-zinc-400 hidden sm:table-cell">
                  {Math.round(costPlat * p.qty)}p
                </td>
                <td className="py-2 px-3 text-right font-mono">
                  {showClose
                    ? (p.current_median !== null ? `${Math.round(p.current_median)}p` : "—")
                    : (p.closed_price !== null ? `${Math.round(p.closed_price)}p` : "—")}
                </td>
                <td className="py-2 px-3 text-right font-mono">
                  {showClose && writeToken && editingId === p.id ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        value={editTarget}
                        onChange={(e) => setEditTarget(e.target.value)}
                        className="w-16 px-1 py-0.5 text-xs rounded bg-zinc-900 border border-zinc-700 text-zinc-200"
                      />
                      <button
                        className="px-1.5 py-0.5 text-xs rounded bg-emerald-800 hover:bg-emerald-700 text-emerald-200 disabled:opacity-50"
                        onClick={() => handleTargetSave(p.id)}
                        disabled={submitting || !editTarget}
                      >
                        ✓
                      </button>
                      <button
                        className="px-1.5 py-0.5 text-xs rounded bg-zinc-700 text-zinc-300"
                        onClick={() => setEditingId(null)}
                      >
                        ✕
                      </button>
                    </span>
                  ) : (
                    <span
                      className={showClose && writeToken ? "cursor-pointer hover:text-emerald-400" : ""}
                      title={showClose && writeToken ? "Click to edit target" : undefined}
                      onClick={() => {
                        if (showClose && writeToken) {
                          setEditingId(p.id);
                          setEditTarget(String(p.target_price));
                        }
                      }}
                    >
                      {Math.round(p.target_price)}p
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 text-right font-mono hidden sm:table-cell">
                  {p.distance_to_target !== null && showClose
                    ? `${p.distance_to_target >= 0 ? "+" : ""}${Math.round(p.distance_to_target)}p`
                    : "—"}
                </td>
                <td className="py-2 px-3 text-right hidden sm:table-cell">{p.days_held}d</td>
                <td className={`py-2 px-3 text-right font-mono ${
                  pnl !== null ? (pnl >= 0 ? "text-emerald-400" : "text-red-400") : ""
                }`}>
                  {pnl !== null
                    ? `${pnl >= 0 ? "+" : ""}${Math.round(pnl)}p`
                    : "—"}
                </td>
                {showClose && writeToken && (
                  <td className="py-2 px-3">
                    {closingId === p.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          placeholder="Sale price"
                          value={closePrice}
                          onChange={(e) => setClosePrice(e.target.value)}
                          className="w-20 px-1 py-0.5 text-xs rounded bg-zinc-900 border border-zinc-700 text-zinc-200"
                        />
                        <button
                          className="px-2 py-0.5 text-xs rounded bg-red-800 hover:bg-red-700 text-red-200 disabled:opacity-50"
                          onClick={() => handleClose(p.id)}
                          disabled={submitting || !closePrice}
                        >
                          {submitting ? "..." : "Sell"}
                        </button>
                        <button
                          className="px-2 py-0.5 text-xs rounded bg-zinc-700 text-zinc-300"
                          onClick={() => { setClosingId(null); setResult(null); }}
                        >
                          X
                        </button>
                        {result && closingId === p.id && (
                          <span className={`text-xs ${result.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
                            {result}
                          </span>
                        )}
                      </div>
                    ) : (
                      <button
                        className="px-2 py-0.5 text-xs rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                        onClick={() => { setClosingId(p.id); setClosePrice(""); setResult(null); }}
                      >
                        Close
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        {positions.length > 1 && (
          <tfoot>
            <tr className="border-t border-zinc-700 text-zinc-300 font-semibold">
              <td className="py-2 px-3">Total ({positions.length})</td>
              <td className="py-2 px-3 text-right">
                {positions.reduce((s, p) => s + p.qty, 0)}
              </td>
              <td className="py-2 px-3 text-right text-amber-400">
                {positions.reduce((s, p) => s + p.cost_ducats * p.qty, 0)}
              </td>
              <td className="py-2 px-3 text-right font-mono text-zinc-400 hidden sm:table-cell">
                {Math.round(
                  positions.reduce((s, p) => s + p.cost_ducats * p.junk_rate_at_buy * p.qty, 0),
                )}p
              </td>
              <td className="py-2 px-3 text-right font-mono">
                {showClose
                  ? `${Math.round(
                      positions.reduce((s, p) => s + (p.current_median ?? 0) * p.qty, 0),
                    )}p`
                  : "—"}
              </td>
              {/* Target, then Distance + Days (the latter two hidden on mobile
                  like their columns, so footer cells stay aligned) */}
              <td />
              <td className="hidden sm:table-cell" />
              <td className="hidden sm:table-cell" />
              <td className="py-2 px-3 text-right font-mono">
                {(() => {
                  const total = positions.reduce(
                    (s, p) => s + ((showClose ? p.unrealized_pnl : p.realized_pnl) ?? 0),
                    0,
                  );
                  return (
                    <span className={total >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {total >= 0 ? "+" : ""}
                      {Math.round(total)}p
                    </span>
                  );
                })()}
              </td>
              {showClose && writeToken && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
