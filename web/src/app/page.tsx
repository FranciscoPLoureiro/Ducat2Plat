import type { Metadata } from "next";
import { getBaroCountdown, getRankedItems } from "@/lib/data";
import RankingTable from "./components/ranking-table";
import DucatPlanner from "./components/ducat-planner";
import StalenessBanner from "./components/staleness-banner";

export const metadata: Metadata = { title: "Junk Ranking" };
export const revalidate = 3600;

export default async function Home() {
  const [baro, items] = await Promise.all([
    getBaroCountdown(),
    getRankedItems(),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <StalenessBanner />

      <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-bold tracking-tight">Junk Ranking</h1>
        <BaroWidget baro={baro} />
      </header>

      <DucatPlanner items={items} />
      <RankingTable items={items} />
    </div>
  );
}

function BaroWidget({
  baro,
}: {
  baro: Awaited<ReturnType<typeof getBaroCountdown>>;
}) {
  if (baro.active) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-emerald-900/40 border border-emerald-700 text-emerald-300 text-sm">
        <span className="font-semibold">Baro is HERE</span>
        {baro.relay && <span className="text-emerald-500">@ {baro.relay}</span>}
      </div>
    );
  }

  if (baro.daysUntil !== null) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm">
        <span>Baro in</span>
        <span className="font-bold text-amber-400">
          {baro.daysUntil}d
        </span>
      </div>
    );
  }

  return (
    <div className="text-sm text-zinc-500">Baro: no data</div>
  );
}
