"use client";

// Shared time-window control for price charts. Value is a day count or null
// for the full archive.
export type ChartWindow = 30 | 90 | 180 | null;

const OPTIONS: { label: string; value: ChartWindow }[] = [
  { label: "1M", value: 30 },
  { label: "3M", value: 90 },
  { label: "6M", value: 180 },
  { label: "All", value: null },
];

export function windowCutoff(window: ChartWindow): string | null {
  if (window === null) return null;
  return new Date(Date.now() - window * 86_400_000).toISOString().slice(0, 10);
}

export default function ChartWindowToggle({
  value,
  onChange,
}: {
  value: ChartWindow;
  onChange: (w: ChartWindow) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {OPTIONS.map((o) => (
        <button
          key={o.label}
          onClick={() => onChange(o.value)}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            value === o.value
              ? "bg-zinc-700 text-zinc-100"
              : "bg-zinc-900 text-zinc-500 hover:bg-zinc-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
