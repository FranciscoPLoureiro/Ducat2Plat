import type { Metadata } from "next";
import { getBundles } from "@/lib/data";
import BundlesTable from "../components/bundles-table";
import StalenessBanner from "../components/staleness-banner";
import HelpBox from "../components/help-box";

export const metadata: Metadata = { title: "Seller Bundles" };
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
        <p className="text-xs text-zinc-600 mt-1">
          Listings are from the last daily sweep and can be up to a day old — confirm the seller is still in-game before trading.
        </p>
      </header>

      <HelpBox>
        <p>
          Your daily trade count is capped at your Mastery Rank, and each trade holds up to 6 items —
          so buying several items from one seller beats cherry-picking the single best deal from many.
        </p>
        <p>
          <strong className="text-zinc-300">Combined PpD</strong> is ducats per plat for the whole basket.
          Click a row to see the items, <strong className="text-zinc-300">Copy /w</strong> to get a ready-to-paste
          in-game whisper, or click the seller name to open their warframe.market profile.
        </p>
      </HelpBox>

      <BundlesTable bundles={bundles} />
    </div>
  );
}
