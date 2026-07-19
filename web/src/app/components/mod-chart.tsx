"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { PrimedModStats } from "@/lib/data";
import type { VaultEvent } from "@/lib/data";
import ChartWindowToggle, { type ChartWindow, windowCutoff } from "./chart-window";

const VAULT_COLORS: Record<string, string> = {
  vaulted: "#ef4444",
  unvaulted: "#22c55e",
  resurgence: "#a855f7",
};

const VAULT_LABELS: Record<string, string> = {
  vaulted: "V",
  unvaulted: "U",
  resurgence: "R",
};

export default function ModChart({
  stats: allStats,
  baroVisitDates,
  specialVisitDates,
  vaultEvents,
}: {
  stats: PrimedModStats["stats"];
  baroVisitDates: string[];
  specialVisitDates?: string[];
  vaultEvents?: VaultEvent[];
}) {
  const [chartWindow, setChartWindow] = useState<ChartWindow>(null);

  const stats = useMemo(() => {
    const cutoff = windowCutoff(chartWindow);
    return cutoff ? allStats.filter((s) => s.stat_date >= cutoff) : allStats;
  }, [allStats, chartWindow]);

  const dateRange = useMemo(() => {
    if (!stats.length) return { min: "", max: "" };
    return { min: stats[0].stat_date, max: stats[stats.length - 1].stat_date };
  }, [stats]);

  const specialLines = useMemo(
    () =>
      (specialVisitDates ?? [])
        .map((d) => d.slice(0, 10))
        .filter((d) => dateRange.min && dateRange.max && d >= dateRange.min && d <= dateRange.max),
    [specialVisitDates, dateRange],
  );

  const visitLines = useMemo(
    () =>
      baroVisitDates
        .map((d) => d.slice(0, 10))
        .filter((d) => dateRange.min && dateRange.max && d >= dateRange.min && d <= dateRange.max),
    [baroVisitDates, dateRange],
  );

  const vaultLines = useMemo(
    () =>
      (vaultEvents ?? []).filter(
        (e) =>
          dateRange.min &&
          dateRange.max &&
          e.effective_date >= dateRange.min &&
          e.effective_date <= dateRange.max,
      ),
    [vaultEvents, dateRange],
  );

  return (
    <div>
      <div className="flex justify-end mb-1">
        <ChartWindowToggle value={chartWindow} onChange={setChartWindow} />
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={stats}>
          <XAxis
            dataKey="stat_date"
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 11 }}
            width={50}
            tickFormatter={(v: number) => `${v}p`}
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: "#a1a1aa" }}
            formatter={(value) => [`${value}p`, "Median"]}
          />
          {visitLines.map((d, i) => (
            <ReferenceLine
              key={`baro-${i}`}
              x={d}
              stroke="#f59e0b"
              strokeDasharray="4 3"
              strokeOpacity={0.5}
            />
          ))}
          {specialLines.map((d, i) => (
            <ReferenceLine
              key={`special-${i}`}
              x={d}
              stroke="#a855f7"
              strokeWidth={2}
              strokeDasharray="4 3"
              strokeOpacity={0.7}
              label={{
                value: "TC",
                position: "top",
                fill: "#a855f7",
                fontSize: 10,
                fontWeight: 600,
              }}
            />
          ))}
          {vaultLines.map((e, i) => (
            <ReferenceLine
              key={`vault-${i}`}
              x={e.effective_date}
              stroke={VAULT_COLORS[e.event]}
              strokeWidth={2}
              strokeDasharray="6 3"
              label={{
                value: VAULT_LABELS[e.event],
                position: "top",
                fill: VAULT_COLORS[e.event],
                fontSize: 11,
                fontWeight: 600,
              }}
            />
          ))}
          <Line
            type="monotone"
            dataKey="median"
            stroke="#34d399"
            dot={false}
            strokeWidth={1.5}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-500 mt-1 px-1">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0 border-t border-dashed border-amber-500" />
          Baro
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0 border-t-2 border-dashed border-purple-500" />
          TennoCon (full catalog)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0 border-t-2 border-dashed border-red-500" />
          Vaulted
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0 border-t-2 border-dashed border-green-500" />
          Unvaulted
        </span>
      </div>
    </div>
  );
}
