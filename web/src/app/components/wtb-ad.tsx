"use client";

import { useState } from "react";
import { useSettings, updateSettings } from "@/lib/settings";
import { buildWtbAd, resolveAdTiers, type AdTier } from "@/lib/wtb-ad";

// Copy-ready trade-chat ad. The prices live in local settings, so edits stick
// on this device; "Edit prices" exposes a checkbox and plat field per tier.
export default function WtbAd() {
  const settings = useSettings();
  const tiers = resolveAdTiers(settings.wtbAdTiers);
  const ad = buildWtbAd(tiers);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  function setTier(ducats: number, patch: Partial<AdTier>) {
    updateSettings({
      wtbAdTiers: tiers.map((t) => (t.ducats === ducats ? { ...t, ...patch } : t)),
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(ad);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="mb-4 text-sm border border-zinc-800 rounded">
      <div className="flex items-start gap-2 px-3 py-2">
        <button
          onClick={copy}
          className="shrink-0 w-24 px-2 py-1 rounded text-xs border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          {copied ? "✓ Copied" : "Copy ad"}
        </button>
        <code className="min-w-0 flex-1 pt-1 text-xs text-zinc-300 whitespace-normal break-words">
          {ad}
        </code>
        <button
          onClick={() => setEditing(!editing)}
          className={`shrink-0 px-2 py-1 rounded text-xs border transition-colors ${
            editing
              ? "border-emerald-700 text-emerald-300 bg-emerald-950/40"
              : "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
          }`}
        >
          Edit prices {editing ? "▲" : "▾"}
        </button>
      </div>
      {editing && (
        <div className="flex flex-wrap gap-x-5 gap-y-2 px-3 pb-3 pt-1 border-t border-zinc-800 text-zinc-400">
          {tiers.map((t) => (
            <label key={t.ducats} className="flex items-center gap-1.5 select-none">
              <input
                type="checkbox"
                checked={t.on}
                onChange={(e) => setTier(t.ducats, { on: e.target.checked })}
                className="accent-zinc-500"
              />
              <span className={`w-10 text-right ${t.on ? "text-amber-400" : "text-zinc-600"}`}>
                {t.ducats}d
              </span>
              =
              <input
                type="number"
                value={t.plat}
                min={0}
                step={1}
                disabled={!t.on}
                onChange={(e) => setTier(t.ducats, { plat: Math.max(0, Number(e.target.value) || 0) })}
                className="w-14 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500 disabled:opacity-40"
              />
              p
            </label>
          ))}
          <span className="text-xs text-zinc-600 self-center">
            Unticked tiers go in the &quot;NO&quot; list.
          </span>
        </div>
      )}
    </div>
  );
}
