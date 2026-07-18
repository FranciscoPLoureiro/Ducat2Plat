import type { Metadata } from "next";
import { getBaroCountdown, getRankedItems } from "@/lib/data";
import RankingTable from "./components/ranking-table";
import DucatPlanner from "./components/ducat-planner";
import StalenessBanner from "./components/staleness-banner";
import HelpBox from "./components/help-box";

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

      <HelpBox>
        <p>
          Ranks Prime junk by how efficiently plat converts to ducats.{" "}
          <strong className="text-zinc-300">PpD</strong> = ducats ÷ median price;{" "}
          <strong className="text-zinc-300">PpD@6</strong> is the honest version — the rate you actually
          get buying 6 units from real in-game listings (buying walks up the order book).
        </p>
        <p>
          <strong className="text-zinc-300">Velocity</strong> is real sales per day (liquidity), and{" "}
          <strong className="text-zinc-300">Score</strong> down-weights illiquid items. Expand a row for the
          actual listings; ⚠ marks prices from unusually cheap listings — verify in-game. Listings are from
          the last daily sweep and can be up to a day old.
        </p>
      </HelpBox>

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
    const arrDate = baro.arrival
      ? new Date(baro.arrival).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      : null;
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm">
        <span>Baro:</span>
        {arrDate && <span className="font-bold text-amber-400">{arrDate}</span>}
        <span className="text-zinc-500">({baro.daysUntil}d)</span>
      </div>
    );
  }

  return (
    <div className="text-sm text-zinc-500">Baro: no data</div>
  );
}
