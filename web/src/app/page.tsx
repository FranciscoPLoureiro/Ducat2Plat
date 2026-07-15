import { getStaleness, getBaroCountdown, getRankedItems } from "@/lib/data";
import RankingTable from "./components/ranking-table";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [staleness, baro, items] = await Promise.all([
    getStaleness(),
    getBaroCountdown(),
    getRankedItems(),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {staleness.stale && (
        <div className="mb-4 px-4 py-3 rounded bg-yellow-900/60 border border-yellow-700 text-yellow-200 text-sm">
          Data is {staleness.hoursAgo ?? "??"} hours old — pipeline may be down.
        </div>
      )}

      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Ducat2Plat</h1>
        <BaroWidget baro={baro} />
      </header>

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
