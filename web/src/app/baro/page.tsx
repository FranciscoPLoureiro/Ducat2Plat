import type { Metadata } from "next";
import {
  getBaroCountdown,
  getBaroVisits,
  getBaroItemHistory,
  getPrimedModStats,
  getBaroAdvisorData,
  getPositions,
} from "@/lib/data";
import BaroInventory from "../components/baro-inventory";
import BaroHistory from "../components/baro-history";
import PrimedModCharts from "../components/primed-mod-charts";
import BaroAdvisor from "../components/baro-advisor";
import StalenessBanner from "../components/staleness-banner";
import HelpBox from "../components/help-box";
import NextVisitPrep, { type WatchlistEntry } from "../components/next-visit-prep";
import { computeBaseline, computeVisitVerdict } from "@/lib/metrics";

export const metadata: Metadata = { title: "Baro Ki'Teer" };
export const revalidate = 3600;

export default async function BaroPage() {
  const [countdown, baroResult, itemHistory, primedMods, advisorData, openPositions] =
    await Promise.all([
      getBaroCountdown(),
      getBaroVisits(),
      getBaroItemHistory(),
      getPrimedModStats(),
      getBaroAdvisorData(),
      getPositions("open"),
    ]);

  const { visits, junkRate, activeVisit } = baroResult;

  const baroVisitDates = visits.filter((v) => !v.is_special).map((v) => v.arrival);
  const specialVisitDates = visits.filter((v) => v.is_special).map((v) => v.arrival);

  // Between visits: how far each Primed mod has recovered from the last
  // supply flood. current/baseline < 1 means still crash-priced. Full list
  // (uncapped) — the component paginates; mods you hold are marked so the
  // panel doubles as sell-timing for your open positions.
  const lastVisitArrival = visits[0]?.arrival ?? null;
  const lastVisitWasSpecial = visits[0]?.is_special ?? false;
  const heldByItem = new Map<string, { qty: number; target: number }>();
  for (const p of openPositions) {
    const prev = heldByItem.get(p.item_id);
    heldByItem.set(p.item_id, {
      qty: (prev?.qty ?? 0) + p.qty,
      target: prev?.target ?? p.target_price,
    });
  }

  let droppedCount = 0;
  const watchlist: WatchlistEntry[] =
    !activeVisit && lastVisitArrival
      ? primedMods
          .map((mod): WatchlistEntry | null => {
            const prices = mod.stats.map((s) => ({ date: s.stat_date, median: s.median }));
            const baseline = computeBaseline(prices, lastVisitArrival);
            const current = prices.length ? prices[prices.length - 1].median : null;
            if (!baseline || baseline <= 0 || current === null) {
              droppedCount++;
              return null;
            }
            const held = heldByItem.get(mod.item_id);
            return {
              name: mod.item_name,
              url_name: mod.url_name,
              baseline,
              current,
              pct: current / baseline,
              heldQty: held?.qty ?? null,
              targetPrice: held?.target ?? null,
            };
          })
          .filter((w): w is WatchlistEntry => w !== null)
          .sort((a, b) => a.pct - b.pct)
      : [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <StalenessBanner />

      <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-bold tracking-tight">Baro Ki&apos;Teer</h1>
        <BaroCountdownWidget countdown={countdown} />
      </header>

      {!activeVisit && (
        <NextVisitPrep
          arrivalLabel={
            countdown.arrival
              ? new Date(countdown.arrival).toLocaleDateString("en-US", {
                  weekday: "long", month: "short", day: "numeric", hour: "numeric",
                })
              : null
          }
          daysUntil={countdown.daysUntil}
          watchlist={watchlist}
          droppedCount={droppedCount}
          lastVisitWasSpecial={lastVisitWasSpecial}
        />
      )}

      {advisorData && advisorData.mods.length > 0 && (
        <section className="mb-8">
          <VisitVerdictBanner
            verdict={computeVisitVerdict(advisorData.mods)}
            isSpecial={activeVisit?.is_special ?? false}
          />
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

function VisitVerdictBanner({
  verdict,
  isSpecial,
}: {
  verdict: ReturnType<typeof computeVisitVerdict>;
  isSpecial: boolean;
}) {
  const styles = {
    STRONG: "bg-emerald-900/40 border-emerald-700 text-emerald-200",
    SELECTIVE: "bg-amber-900/30 border-amber-800 text-amber-200",
    SKIP: "bg-zinc-800/60 border-zinc-700 text-zinc-300",
  }[verdict.tier];
  const text = {
    STRONG: `Strong visit — ${verdict.buyCount} profitable buys worth ~${Math.round(verdict.totalProfit)}p combined. Spend your ducats.`,
    SELECTIVE: `Selective visit — ${verdict.buyCount} mod${verdict.buyCount === 1 ? "" : "s"} clear${verdict.buyCount === 1 ? "s" : ""} profit (~${Math.round(verdict.totalProfit)}p combined). Buy the top picks, bank the rest.`,
    SKIP: "Weak visit — nothing clears profit at current prices. Hold your ducats for next time.",
  }[verdict.tier];

  return (
    <div className={`mb-4 px-4 py-3 rounded border text-sm font-medium ${styles}`}>
      {text}
      {isSpecial && (
        <span className="block mt-1 font-normal text-xs opacity-75">
          Special (full-catalog) visit: resale prices are flood-depressed, so
          verdicts skew pessimistic — holds recover slower than usual.
        </span>
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
