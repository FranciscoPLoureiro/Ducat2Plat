"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

export default function StalenessBanner() {
  const [stale, setStale] = useState(false);
  const [hoursAgo, setHoursAgo] = useState<number | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const db = createClient(url, key);
    db.from("heartbeat")
      .select("updated_at")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (!data) {
          setStale(true);
          return;
        }
        const hours = (Date.now() - new Date(data.updated_at).getTime()) / (1000 * 60 * 60);
        setHoursAgo(Math.round(hours));
        setStale(hours > 36);
      });
  }, []);

  if (!stale) return null;

  return (
    <div className="mb-4 px-4 py-3 rounded bg-yellow-900/60 border border-yellow-700 text-yellow-200 text-sm">
      Data is {hoursAgo ?? "??"} hours old — pipeline may be down.
    </div>
  );
}
