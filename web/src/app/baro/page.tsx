import type { Metadata } from "next";
import {
  getBaroCountdown,
  getBaroVisits,
  getBaroItemHistory,
  getPrimedModStats,
  getBaroAdvisorData,
} from "@/lib/data";
import Link from "next/link";
import BaroInventory from "../components/baro-inventory";
import BaroHistory from "../components/baro-history";
import PrimedModCharts from "../components/primed-mod-charts";
import BaroAdvisor from "../components/baro-advisor";
import StalenessBanner from "../components/staleness-banner";
import HelpBox from "../components/help-box";
import { computeBaseline } from "@/lib/metrics";

export const metadata: Metadata = { title: "Baro Ki'Teer" };
export const revalidate = 3600;

export default async function BaroPage() {
  const [countdown, baroResult, itemHistory, primedMods, advisorData] =
    await Promise.all([
      getBaroCountdown(),
      getBaroVisits(),
      getBaroItemHistory(),
      getPrimedModStats(),
      getBaroAdvisorData(),
    ]);

  const { visits, junkRate, activeVisit } = baroResult;

  const baroVisitDates = visits.filter((v) => !v.is_special).map((v) => v.arrival);
  const specialVisitDates = visits.filter((v) => v.is_special).map((v) => v.arrival);

  // Between visits: how far each Primed mod has recovered from the last
  // supply flood. current/baseline < 1 means still crash-priced.
  const lastVisitArrival = visits[0]?.arrival ?? null;
  const watchlist =
    !activeVisit && lastVisitArrival
      ? primedMods
          .map((mod) => {
            const prices = mod.stats.map((s) => ({ date: s.stat_date, median: s.median }));
            const baseline = computeBaseline(prices, lastVisitArrival);
            const current = prices.length ? prices[prices.length - 1].median : null;
            return baseline && baseline > 0 && current !== null
              ? { name: mod.item_name, url_name: mod.url_name, baseline, current, pct: current / baseline }
              : null;
          })
          .filter((w): w is NonNullable<typeof w> => w !== null)
          .sort((a, b) => a.pct - b.pct)
          .slice(0, 15)
      : [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <StalenessBanner />

      <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-bold tracking-tight">Baro Ki&apos;Teer</h1>
        <BaroCountdownWidget countdown={countdown} />
      </header>

      {!activeVisit && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-amber-400">Next Visit Prep</h2>
          <div className="border border-zinc-800 rounded px-4 py-3 space-y-3 text-sm">
            <p className="text-zinc-300">
              {countdown.daysUntil !== null && countdown.arrival ? (
                <>
                  Baro arrives{" "}
                  <span className="text-amber-400 font-semibold">
                    {new Date(countdown.arrival).toLocaleDateString("en-US", {
                      weekday: "long", month: "short", day: "numeric", hour: "numeric",
                    })}
                  </span>{" "}
                  ({countdown.daysUntil}d). Stock ducats now —{" "}
                  <Link href="/" className="text-emerald-400 hover:underline">
                    junk is cheapest between visits
                  </Link>
                  .
                </>
              ) : (
                <>Next arrival unknown — waiting for the next sweep.</>
              )}
            </p>
            {watchlist.length > 0 && (
              <div>
                <p className="text-zinc-500 mb-2">
                  Primed mod recovery since the last visit&apos;s supply flood — mods
                  below 100% are still crash-priced (bad time to sell, decent time to buy from players):
                </p>
                <div className="flex flex-wrap gap-2">
                  {watchlist.map((w) => (
                    <Link
                      key={w.url_name}
                      href={`/item/${w.url_name}`}
                      title={`baseline ${w.baseline}p → now ${w.current}p`}
                      className={`px-2 py-1 rounded border text-xs transition-colors hover:border-zinc-500 ${
                        w.pct < 0.85
                          ? "border-red-900 text-red-300"
                          : w.pct < 1
                            ? "border-amber-900 text-amber-300"
                            : "border-emerald-900 text-emerald-300"
                      }`}
                    >
                      {w.name} {(w.pct * 100).toFixed(0)}%
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {advisorData && advisorData.mods.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-emerald-400">
            Hold Advisor
          </h2>
          <HelpBox>
            <p>
              <strong className="text-zinc-300">BUY &amp; FLIP</strong>: resale minus ducat cost is
              positive right now — sell immediately.{" "}
              <strong className="text-zinc-300">BUY &amp; HOLD (~Nd)</strong>: holding until prices
              recover from the visit&apos;s supply flood is more profitable; N is from that mod&apos;s own
              restock history when it has 3+ observed restocks, otherwise a pooled estimate.{" "}
              <strong className="text-zinc-300">SKIP</strong>: no profitable path at current prices.
            </p>
            <p>
              Default sort is profit per ducat — the ranking that matters when your ducat wallet
              can&apos;t cover everything. Expand a row for the inputs and sample size behind each verdict.
            </p>
          </HelpBox>
          <BaroAdvisor data={advisorData} junkRate={junkRate} />
        </section>
      )}

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
          <PrimedModCharts
            mods={primedMods}
            baroVisitDates={baroVisitDates}
            specialVisitDates={specialVisitDates}
          />
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
    const arrDate = countdown.arrival
      ? new Date(countdown.arrival).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      : null;
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm">
        <span>Baro:</span>
        {arrDate && <span className="font-bold text-amber-400">{arrDate}</span>}
        <span className="text-zinc-500">({countdown.daysUntil}d)</span>
      </div>
    );
  }

  return <div className="text-sm text-zinc-500">Baro: no data</div>;
}
