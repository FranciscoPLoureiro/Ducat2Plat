"use client";

import { useState, useEffect } from "react";
import type { BundleSeller } from "@/lib/data";
import BundlesTable from "./bundles-table";

const COOLDOWN_MS = 5 * 60_000; // 5 min
const LS_KEY = "d2p_bundles_refreshed_at";

export default function BundlesLive({ initial }: { initial: BundleSeller[] }) {
  const [bundles, setBundles] = useState(initial);
  const [live, setLive] = useState<{
    at: string;
    checked: number;
    failed: number;
    sellersCompleted: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  // Tick down the client-side cooldown (survives reloads via localStorage).
  useEffect(() => {
    const tick = () => {
      let last = 0;
      try {
        last = Number(localStorage.getItem(LS_KEY)) || 0;
      } catch {}
      setCooldownLeft(Math.max(0, last + COOLDOWN_MS - Date.now()));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/live-bundles", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(
          res.status === 429
            ? "Cooling down — try again in a moment."
            : `Refresh failed: ${data.error ?? res.status}`,
        );
        return;
      }
      setBundles(data.bundles as BundleSeller[]);
      setLive({
        at: data.fetchedAt,
        checked: data.checked,
        failed: data.failed,
        sellersCompleted: data.sellersCompleted ?? 0,
      });
      try {
        localStorage.setItem(LS_KEY, String(Date.now()));
      } catch {}
    } catch {
      setError("Network error while refreshing.");
    } finally {
      setLoading(false);
    }
  }

  const onCooldown = cooldownLeft > 0 && !loading;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <button
          onClick={refresh}
          disabled={loading || onCooldown}
          className="px-3 py-1.5 rounded bg-emerald-800 border border-emerald-700 text-emerald-100 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Fetching live listings…" : "↻ Refresh listings"}
        </button>

        {live ? (
          <span className="text-emerald-400">
            Live as of{" "}
            {new Date(live.at).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            })}
            <span className="text-zinc-500">
              {" "}
              · {live.checked} items checked
              {live.sellersCompleted > 0 &&
                `, ${live.sellersCompleted} sellers' full inventories scanned`}
              {live.failed ? `, ${live.failed} failed` : ""}
            </span>
          </span>
        ) : (
          <span className="text-zinc-500">
            Showing the daily sweep — click Refresh for live in-game listings.
          </span>
        )}

        {onCooldown && (
          <span className="text-zinc-600 text-xs">
            next refresh in {Math.ceil(cooldownLeft / 1000)}s
          </span>
        )}
        {error && <span className="text-red-400 text-xs">{error}</span>}
      </div>

      <BundlesTable bundles={bundles} />
    </div>
  );
}
