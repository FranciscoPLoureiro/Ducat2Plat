import {
  getBaroCountdown,
  getBaroVisits,
  getBaroItemHistory,
  getPrimedModStats,
} from "@/lib/data";
import BaroInventory from "../components/baro-inventory";
import BaroHistory from "../components/baro-history";
import PrimedModCharts from "../components/primed-mod-charts";
import StalenessBanner from "../components/staleness-banner";

export const revalidate = 3600;

export default async function BaroPage() {
  const [countdown, baroResult, itemHistory, primedMods] =
    await Promise.all([
      getBaroCountdown(),
      getBaroVisits(),
      getBaroItemHistory(),
      getPrimedModStats(),
    ]);

  const { visits, junkRate, activeVisit } = baroResult;

  const baroVisitDates = visits.map((v) => v.arrival);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <StalenessBanner />

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
          {activeVisit.is_special && (
            <div className="mb-3 px-4 py-2 rounded bg-purple-900/40 border border-purple-700 text-purple-200 text-sm">
              Special visit ({activeVisit.items.length} items) — excluded from recurrence stats.
            </div>
          )}
          <BaroInventory items={activeVisit.items} junkRate={junkRate} />
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
    const depDate = countdown.departure
      ? new Date(countdown.departure).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : null;
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-emerald-900/40 border border-emerald-700 text-emerald-300 text-sm">
        <span className="font-semibold">Baro is HERE</span>
        {countdown.relay && (
          <span className="text-emerald-500">@ {countdown.relay}</span>
        )}
        {depDate && (
          <span className="text-emerald-500/70">until {depDate}</span>
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
