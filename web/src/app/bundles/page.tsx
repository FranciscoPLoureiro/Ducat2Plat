import { getBundles } from "@/lib/data";
import BundlesTable from "../components/bundles-table";
import StalenessBanner from "../components/staleness-banner";

export const revalidate = 3600;

export default async function BundlesPage() {
  const bundles = await getBundles();

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <StalenessBanner />

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
