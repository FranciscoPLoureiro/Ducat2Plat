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
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

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
            <th className="py-2 px-3 font-medium text-right">Cost (ducats)</th>
            <th className="py-2 px-3 font-medium text-right">Cost (plat est.)</th>
            <th className="py-2 px-3 font-medium text-right">Current</th>
            <th className="py-2 px-3 font-medium text-right">Target</th>
            <th className="py-2 px-3 font-medium text-right">Distance</th>
            <th className="py-2 px-3 font-medium text-right">Days</th>
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
                <td className="py-2 px-3 text-right text-amber-400">{p.cost_ducats}</td>
                <td className="py-2 px-3 text-right font-mono text-zinc-400">
                  {Math.round(costPlat)}p
                </td>
                <td className="py-2 px-3 text-right font-mono">
                  {showClose
                    ? (p.current_median !== null ? `${Math.round(p.current_median)}p` : "—")
                    : (p.closed_price !== null ? `${Math.round(p.closed_price)}p` : "—")}
                </td>
                <td className="py-2 px-3 text-right font-mono">{Math.round(p.target_price)}p</td>
                <td className="py-2 px-3 text-right font-mono">
                  {p.distance_to_target !== null && showClose
                    ? `${p.distance_to_target >= 0 ? "+" : ""}${Math.round(p.distance_to_target)}p`
                    : "—"}
                </td>
                <td className="py-2 px-3 text-right">{p.days_held}d</td>
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
      </table>
    </div>
  );
}
