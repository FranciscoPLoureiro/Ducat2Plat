import type { Metadata } from "next";
import { getPositions } from "@/lib/data";
import PositionsTable from "../components/positions-table";
import StalenessBanner from "../components/staleness-banner";
import WriteTokenControl from "../components/write-token-control";
import HelpBox from "../components/help-box";

export const metadata: Metadata = { title: "Positions" };
export const revalidate = 3600;

export default async function PositionsPage() {
  const [openPositions, closedPositions] = await Promise.all([
    getPositions("open"),
    getPositions("closed"),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <StalenessBanner />

      <header className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Positions</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Track your Primed mod purchases and mark-to-market P/L.
          Estimated values use the daily median — actual fills may differ.
        </p>
        <div className="mt-3">
          <WriteTokenControl />
        </div>
      </header>

      <HelpBox>
        <p>
          Positions record what you bought from Baro and at what effective plat cost
          (ducats × the junk rate at purchase time — snapshotted, so it never drifts).
          The daily sweep checks each open position and posts a Discord alert when the
          target is hit, the typical recovery window has elapsed, or Baro restocks the mod.
        </p>
        <p>
          Click a <strong className="text-zinc-300">Target</strong> value to edit it.{" "}
          <strong className="text-zinc-300">Close</strong> records your actual sale price
          into realized P/L. Estimates use daily medians — your fills will differ.
        </p>
      </HelpBox>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 text-emerald-400">
          Open Positions ({openPositions.length})
        </h2>
        <PositionsTable positions={openPositions} showClose />
      </section>

      {closedPositions.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-zinc-400">
            Closed Positions ({closedPositions.length})
          </h2>
          <PositionsTable positions={closedPositions} showClose={false} />
        </section>
      )}
    </div>
  );
}
