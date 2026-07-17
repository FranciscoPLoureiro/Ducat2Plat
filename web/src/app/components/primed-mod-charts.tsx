"use client";

import { useState, lazy, Suspense } from "react";
import type { PrimedModStats } from "@/lib/data";

const ModChart = lazy(() => import("@/app/components/mod-chart"));

export default function PrimedModCharts({
  mods,
  baroVisitDates,
}: {
  mods: PrimedModStats[];
  baroVisitDates: string[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {mods.map((mod) => {
        const isOpen = expanded.has(mod.item_id);
        return (
          <div
            key={mod.item_id}
            className="border border-zinc-800 rounded overflow-hidden"
          >
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-900 transition-colors"
              onClick={() => toggle(mod.item_id)}
            >
              <span className="text-sm font-medium">{mod.item_name}</span>
              <span className="text-xs text-zinc-500">
                {isOpen ? "▼" : "▶"} {mod.stats.length} data points
              </span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4">
                <Suspense
                  fallback={
                    <div className="h-[250px] flex items-center justify-center text-sm text-zinc-500">
                      Loading chart...
                    </div>
                  }
                >
                  <ModChart
                    stats={mod.stats}
                    baroVisitDates={baroVisitDates}
                    vaultEvents={mod.vault_events}
                  />
                </Suspense>
              </div>
            )}
          </div>
        );
      })}
      {mods.length === 0 && (
        <p className="text-sm text-zinc-500">
          No Primed mod price data available.
        </p>
      )}
    </div>
  );
}
