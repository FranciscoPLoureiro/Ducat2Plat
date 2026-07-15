import {
  getStaleness,
  getBaroCountdown,
  getBaroVisits,
  getBaroItemHistory,
  getPrimedModStats,
} from "@/lib/data";
import BaroInventory from "../components/baro-inventory";
import BaroHistory from "../components/baro-history";
import PrimedModCharts from "../components/primed-mod-charts";

export const dynamic = "force-dynamic";

export default async function BaroPage() {
  const [staleness, countdown, visits, itemHistory, primedMods] =
    await Promise.all([
      getStaleness(),
      getBaroCountdown(),
      getBaroVisits(),
      getBaroItemHistory(),
      getPrimedModStats(),
    ]);

  const activeVisit = visits.find((v) => {
    const now = Date.now();
    const arr = new Date(v.arrival).getTime();
    const dep = new Date(v.departure).getTime();
    return now >= arr && now < dep;
  });

  const baroVisitDates = visits.map((v) => v.arrival);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {staleness.stale && (
        <div className="mb-4 px-4 py-3 rounded bg-yellow-900/60 border border-yellow-700 text-yellow-200 text-sm">
          Data is {staleness.hoursAgo ?? "??"} hours old — pipeline may be down.
        </div>
      )}

      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold tracking-tight">Baro Ki&apos;Teer</h1>
        <BaroCountdownWidget countdown={countdown} />
      </header>

      {activeVisit && activeVisit.items.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-emerald-400">
            Current Inventory
            {activeVisit.relay && (
              <span className="text-sm font-normal text-zinc-400 ml-2">
                @ {activeVisit.relay}
              </span>
            )}
          </h2>
          <BaroInventory items={activeVisit.items} />
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Visit History</h2>
        <p className="text-sm text-zinc-500 mb-3">
          How many visits ago each item was last seen.
        </p>
        <BaroHistory items={itemHistory} />
      </section>

      {primedMods.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Primed Mod Prices</h2>
          <p className="text-sm text-zinc-500 mb-3">
            Rank-0 median price history. Vertical lines mark Baro visits.
          </p>
          <PrimedModCharts mods={primedMods} baroVisitDates={baroVisitDates} />
        </section>
      )}
    </div>
  );
}

function BaroCountdownWidget({
  countdown,
}: {
  countdown: Awaited<ReturnType<typeof getBaroCountdown>>;
}) {
  if (countdown.active) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-emerald-900/40 border border-emerald-700 text-emerald-300 text-sm">
        <span className="font-semibold">Baro is HERE</span>
        {countdown.relay && (
          <span className="text-emerald-500">@ {countdown.relay}</span>
        )}
      </div>
    );
  }

  if (countdown.daysUntil !== null) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm">
        <span>Baro in</span>
        <span className="font-bold text-amber-400">{countdown.daysUntil}d</span>
      </div>
    );
  }

  return <div className="text-sm text-zinc-500">Baro: no data</div>;
}
