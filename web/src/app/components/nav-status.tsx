"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

interface Status {
  sweepId: number | null;
  hoursAgo: number | null;
  baroActive: boolean;
  baroDate: string | null; // formatted arrival (inactive) or departure (active)
  baroDays: number | null;
}

// Client-fetched so the label is live even on ISR-cached pages.
export default function NavStatus() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    createClient(url, key)
      .from("heartbeat")
      .select("updated_at, last_sweep_id, baro_activation, baro_expiry")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const now = Date.now();
        const hoursAgo = Math.round(
          (now - new Date(data.updated_at).getTime()) / 3_600_000,
        );
        let baroActive = false;
        let baroDate: string | null = null;
        let baroDays: number | null = null;
        if (data.baro_activation && data.baro_expiry) {
          const arr = new Date(data.baro_activation).getTime();
          const dep = new Date(data.baro_expiry).getTime();
          const fmt = (t: number) =>
            new Date(t).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
          if (arr <= now && now < dep) {
            baroActive = true;
            baroDate = fmt(dep);
          } else if (arr > now) {
            baroDate = fmt(arr);
            baroDays = Math.max(0, Math.ceil((arr - now) / 86_400_000));
          }
        }
        setStatus({
          sweepId: data.last_sweep_id,
          hoursAgo,
          baroActive,
          baroDate,
          baroDays,
        });
      });
  }, []);

  if (!status) return null;

  return (
    <div
      className="ml-auto flex items-center gap-3 text-xs text-zinc-500"
      title={`Last sweep #${status.sweepId ?? "?"} — listings can be up to a day old`}
    >
      <span>
        Data:{" "}
        <span className={status.hoursAgo !== null && status.hoursAgo > 36 ? "text-yellow-400" : "text-zinc-400"}>
          {status.hoursAgo !== null ? `${status.hoursAgo}h ago` : "?"}
        </span>
      </span>
      {status.baroActive && status.baroDate && (
        <span className="text-emerald-400">Baro HERE until {status.baroDate}</span>
      )}
      {!status.baroActive && status.baroDate && (
        <span>
          Baro: <span className="text-amber-400">{status.baroDate}</span>
          {status.baroDays !== null && ` (${status.baroDays}d)`}
        </span>
      )}
    </div>
  );
}
