"use client";

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

export default function ModChart({
  stats,
  baroVisitDates,
}: {
  stats: PrimedModStats["stats"];
  baroVisitDates: string[];
}) {
  const visitLines = baroVisitDates
    .map((d) => d.slice(0, 10))
    .filter((d) => {
      const min = stats[0]?.stat_date;
      const max = stats[stats.length - 1]?.stat_date;
      return min && max && d >= min && d <= max;
    });

  return (
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
            label=""
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
  );
}
