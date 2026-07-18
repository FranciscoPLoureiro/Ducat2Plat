import type { Metadata } from "next";
import { getPositions } from "@/lib/data";
import PositionsTable from "../components/positions-table";
import StalenessBanner from "../components/staleness-banner";
import WriteTokenControl from "../components/write-token-control";

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
