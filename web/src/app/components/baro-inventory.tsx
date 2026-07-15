import type { BaroVisitItem } from "@/lib/data";

export default function BaroInventory({ items }: { items: BaroVisitItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-zinc-700 text-zinc-400 text-left">
            <th className="py-2 px-3 font-medium">Item</th>
            <th className="py-2 px-3 font-medium text-right">Ducats</th>
            <th className="py-2 px-3 font-medium text-right">Credits</th>
            <th className="py-2 px-3 font-medium text-right">Resale (R0)</th>
            <th className="py-2 px-3 font-medium text-right">ROI</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.item_name}
              className="border-b border-zinc-800 hover:bg-zinc-900 transition-colors"
            >
              <td className="py-2 px-3 font-medium">
                {item.item_name}
                {item.is_primed_mod && (
                  <span className="ml-2 text-xs text-purple-400 font-normal">
                    PRIMED
                  </span>
                )}
              </td>
              <td className="py-2 px-3 text-right text-amber-400">
                {item.ducat_cost}
              </td>
              <td className="py-2 px-3 text-right text-zinc-400">
                {item.credit_cost.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right">
                {item.resale_median !== null
                  ? `${Math.round(item.resale_median)}p`
                  : "—"}
              </td>
              <td className="py-2 px-3 text-right font-semibold">
                {item.roi !== null ? (
                  <span
                    className={
                      item.roi >= 0 ? "text-emerald-400" : "text-red-400"
                    }
                  >
                    {item.roi >= 0 ? "+" : ""}
                    {Math.round(item.roi)}p
                  </span>
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-zinc-600 mt-2">
        ROI = rank-0 resale median − ducat cost at 0.35 plat/ducat junk rate.
      </p>
    </div>
  );
}
