"use client";

import { useState } from "react";
import type { ForecastEntry, ForecastLikelihood } from "@/lib/metrics";

const INITIAL = 12;

const BADGE: Record<ForecastLikelihood, { label: string; cls: string }> = {
  OVERDUE: { label: "Overdue", cls: "bg-emerald-900/50 border-emerald-700 text-emerald-300" },
  DUE: { label: "Due", cls: "bg-amber-900/40 border-amber-700 text-amber-300" },
  POSSIBLE: { label: "Possible", cls: "bg-zinc-800 border-zinc-600 text-zinc-300" },
  UNLIKELY: { label: "Unlikely", cls: "bg-zinc-900 border-zinc-800 text-zinc-500" },
};

export default function NextVisitForecast({ forecast }: { forecast: ForecastEntry[] }) {
  const [showAll, setShowAll] = useState(false);
  if (forecast.length === 0) return null;

  const likely = forecast.filter(
    (f) => f.likelihood === "OVERDUE" || f.likelihood === "DUE",
  );
  const ducatBudget = likely.reduce((s, f) => s + (f.ducat_cost ?? 0), 0);
  const shown = showAll ? forecast : forecast.slice(0, INITIAL);

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3 text-amber-400">Next Visit Forecast</h2>
      <div className="border border-zinc-800 rounded px-4 py-3 text-sm">
        <p className="text-zinc-500 mb-3">
          Each item&apos;s restock cadence vs. how long it&apos;s been gone — <span className="text-emerald-300">Overdue</span>/<span className="text-amber-300">Due</span> items
          are the likeliest next-visit stock. If everything due showed up, it would cost{" "}
          <span className="text-amber-400 font-semibold">{ducatBudget.toLocaleString()} ducats</span> — a
          stockpile target, not a promise. Cadence is a pattern, not a schedule.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400 text-left">
                <th className="py-1.5 px-2 font-medium">Item</th>
                <th className="py-1.5 px-2 font-medium">Likelihood</th>
                <th className="py-1.5 px-2 font-medium text-right" title="Visits since it last appeared (counting the upcoming one) vs its typical gap between appearances">Wait / typical</th>
                <th className="py-1.5 px-2 font-medium text-right hidden sm:table-cell" title="Times seen across recorded normal visits">Seen</th>
                <th className="py-1.5 px-2 font-medium text-right">Ducats</th>
                <th className="py-1.5 px-2 font-medium text-right hidden sm:table-cell">Credits</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => (
                <tr key={f.item_name} className="border-b border-zinc-800/60">
                  <td className="py-1.5 px-2">{f.item_name}</td>
                  <td className="py-1.5 px-2">
                    <span className={`inline-block px-2 py-0.5 rounded border text-xs ${BADGE[f.likelihood].cls}`}>
                      {BADGE[f.likelihood].label}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-right text-zinc-400 whitespace-nowrap">
                    {f.lastSeenVisitsAgo + 1}v / {f.medianGap}v
                  </td>
                  <td className="py-1.5 px-2 text-right text-zinc-500 hidden sm:table-cell">{f.appearances}×</td>
                  <td className="py-1.5 px-2 text-right text-amber-400">
                    {f.ducat_cost !== null ? f.ducat_cost.toLocaleString() : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right text-zinc-400 hidden sm:table-cell">
                    {f.credit_cost !== null ? f.credit_cost.toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {forecast.length > INITIAL && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="mt-3 px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            {showAll ? "Show fewer" : `Show all (${forecast.length})`}
          </button>
        )}
      </div>
    </section>
  );
}
