"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { ItemDetail, VaultEvent } from "@/lib/data";

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

export default function ItemDetailChart({
  stats,
  vault_events,
  baro_visit_dates,
  max_mod_rank,
}: {
  stats: ItemDetail["stats"];
  vault_events: VaultEvent[];
  baro_visit_dates: string[];
  max_mod_rank: number | null;
}) {
  const modRanks = useMemo(() => {
    const ranks = [...new Set(stats.map((s) => s.mod_rank))].sort(
      (a, b) => a - b,
    );
    return ranks;
  }, [stats]);

  const isMod = modRanks.length > 1 || (modRanks.length === 1 && modRanks[0] !== -1);
  const [selectedRank, setSelectedRank] = useState<number>(
    isMod ? (modRanks.includes(0) ? 0 : modRanks[0]) : -1,
  );

  const filtered = useMemo(
    () => stats.filter((s) => s.mod_rank === selectedRank),
    [stats, selectedRank],
  );

  const dateRange = useMemo(() => {
    if (!filtered.length) return { min: "", max: "" };
    return { min: filtered[0].stat_date, max: filtered[filtered.length - 1].stat_date };
  }, [filtered]);

  const baroLines = useMemo(
    () =>
      baro_visit_dates
        .map((d) => d.slice(0, 10))
        .filter((d) => dateRange.min && dateRange.max && d >= dateRange.min && d <= dateRange.max),
    [baro_visit_dates, dateRange],
  );

  const vaultLines = useMemo(
    () =>
      vault_events.filter(
        (e) =>
          dateRange.min &&
          dateRange.max &&
          e.effective_date >= dateRange.min &&
          e.effective_date <= dateRange.max,
      ),
    [vault_events, dateRange],
  );

  if (!stats.length) {
    return <p className="text-sm text-zinc-500">No trade statistics available.</p>;
  }

  return (
    <div className="space-y-6">
      {isMod && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-400">Mod rank:</span>
          {modRanks.map((r) => (
            <button
              key={r}
              onClick={() => setSelectedRank(r)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                selectedRank === r
                  ? "bg-zinc-700 text-zinc-100"
                  : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {r === -1 ? "Unranked" : `R${r}`}
            </button>
          ))}
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-2">
          Median Price (plat)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={filtered}>
            <XAxis
              dataKey="stat_date"
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={(v: string) => v.slice(5)}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 11 }}
              width={55}
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
            {baroLines.map((d, i) => (
              <ReferenceLine
                key={`baro-${i}`}
                x={d}
                stroke="#f59e0b"
                strokeDasharray="4 3"
                strokeOpacity={0.5}
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
      </div>

      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-2">
          Daily Volume
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={filtered}>
            <XAxis
              dataKey="stat_date"
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={(v: string) => v.slice(5)}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 11 }}
              width={45}
            />
            <Tooltip
              contentStyle={{
                background: "#18181b",
                border: "1px solid #3f3f46",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: "#a1a1aa" }}
              formatter={(value) => [value, "Volume"]}
            />
            {baroLines.map((d, i) => (
              <ReferenceLine
                key={`baro-v-${i}`}
                x={d}
                stroke="#f59e0b"
                strokeDasharray="4 3"
                strokeOpacity={0.5}
              />
            ))}
            {vaultLines.map((e, i) => (
              <ReferenceLine
                key={`vault-v-${i}`}
                x={e.effective_date}
                stroke={VAULT_COLORS[e.event]}
                strokeWidth={2}
                strokeDasharray="6 3"
              />
            ))}
            <Bar dataKey="volume" fill="#3b82f6" opacity={0.7} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500 pt-2 border-t border-zinc-800">
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-4 h-0 border-t-2 border-dashed border-amber-500" />
        Baro visit
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-4 h-0 border-t-2 border-dashed border-red-500" />
        Vaulted
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-4 h-0 border-t-2 border-dashed border-green-500" />
        Unvaulted
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-4 h-0 border-t-2 border-dashed border-purple-500" />
        Resurgence
      </span>
    </div>
  );
}
