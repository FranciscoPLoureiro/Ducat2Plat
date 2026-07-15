import { getStaleness, getBundles } from "@/lib/data";
import BundlesTable from "../components/bundles-table";

export const dynamic = "force-dynamic";

export default async function BundlesPage() {
  const [staleness, bundles] = await Promise.all([
    getStaleness(),
    getBundles(),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {staleness.stale && (
        <div className="mb-4 px-4 py-3 rounded bg-yellow-900/60 border border-yellow-700 text-yellow-200 text-sm">
          Data is {staleness.hoursAgo ?? "??"} hours old — pipeline may be down.
        </div>
      )}

      <header className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Seller Bundles</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Sellers offering 2+ candidate items — buy their whole basket for better trade-slot efficiency.
        </p>
      </header>

      <BundlesTable bundles={bundles} />
    </div>
  );
}
