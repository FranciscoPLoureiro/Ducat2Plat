import Link from "next/link";
import { getStaleness, getItemDetail } from "@/lib/data";
import ItemDetailChart from "../../components/item-detail-chart";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ url_name: string }>;
}) {
  const { url_name } = await params;
  const [staleness, item] = await Promise.all([
    getStaleness(),
    getItemDetail(url_name),
  ]);

  if (!item) notFound();

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {staleness.stale && (
        <div className="mb-4 px-4 py-3 rounded bg-yellow-900/60 border border-yellow-700 text-yellow-200 text-sm">
          Data is {staleness.hoursAgo ?? "??"} hours old — pipeline may be down.
        </div>
      )}

      <header className="mb-6">
        <div className="text-sm text-zinc-500 mb-1">
          <Link href="/" className="hover:text-zinc-300 transition-colors">
            Ranking
          </Link>
          {" / "}
          <span className="text-zinc-300">{item.item_name}</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">{item.item_name}</h1>
          {item.ducats !== null && (
            <span className="text-sm text-amber-400 font-medium">
              {item.ducats} ducats
            </span>
          )}
          {item.is_primed_mod && (
            <span className="text-xs text-purple-400 font-medium px-2 py-0.5 rounded bg-purple-900/30 border border-purple-800">
              PRIMED MOD
            </span>
          )}
          {item.vaulted && (
            <span className="text-xs text-red-400 font-medium px-2 py-0.5 rounded bg-red-900/30 border border-red-800">
              VAULTED
            </span>
          )}
        </div>
      </header>

      <ItemDetailChart
        stats={item.stats}
        vault_events={item.vault_events}
        baro_visit_dates={item.baro_visit_dates}
      />

      {item.vault_events.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-400 mb-2">Vault History</h2>
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="border-b border-zinc-700 text-zinc-500 text-left">
                  <th className="py-1.5 px-3 font-medium">Date</th>
                  <th className="py-1.5 px-3 font-medium">Event</th>
                </tr>
              </thead>
              <tbody>
                {item.vault_events.map((e, i) => (
                  <tr key={i} className="border-b border-zinc-800">
                    <td className="py-1.5 px-3 text-zinc-300">{e.effective_date}</td>
                    <td className="py-1.5 px-3">
                      <span
                        className={
                          e.event === "vaulted"
                            ? "text-red-400"
                            : e.event === "unvaulted"
                              ? "text-green-400"
                              : "text-purple-400"
                        }
                      >
                        {e.event}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
