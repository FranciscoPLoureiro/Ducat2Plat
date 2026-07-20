// An in-game trade holds at most 6 items. A Prime *set* is one market listing
// but trades as its individual parts, so it occupies (part count) slots, not 1
// — a warframe set eats 4 of the 6 slots, a bow set 5. We pack the basket into
// trades accounting for that, highest ducat value first, so the last trade
// holds the least-valuable leftovers. Each whisper message names one trade so
// the seller knows exactly what it should contain — and sets are shown as
// "(N parts)" so it's clear you want the whole set.
export const TRADE_SIZE = 6;
// Warframe caps a chat message near ~180 chars; a trade that would exceed it is
// split into continuation messages.
export const WF_SAFE_LEN = 180;

export interface WhisperItem {
  item_name: string;
  ducats: number;
  price: number;
  quantity: number;
  slots?: number; // trade slots one unit occupies (set = part count; else 1)
}

export interface Trade {
  items: WhisperItem[]; // aggregated; quantity = units of that item in THIS trade
  slots: number; // total trade slots used (1..TRADE_SIZE)
  ducatTotal: number;
  platTotal: number;
  partial: boolean; // last trade using fewer than TRADE_SIZE slots (and >1 trade)
}

function slotsOf(i: WhisperItem): number {
  return i.slots && i.slots > 0 ? i.slots : 1;
}

export function partitionIntoTrades(items: WhisperItem[]): Trade[] {
  // Expand listings into individual units (a qty-3 listing = 3 units), each
  // carrying its slot cost.
  const units: { item_name: string; ducats: number; price: number; slots: number }[] = [];
  for (const it of items) {
    const s = slotsOf(it);
    for (let i = 0; i < it.quantity; i++) {
      units.push({ item_name: it.item_name, ducats: it.ducats, price: it.price, slots: s });
    }
  }
  // Highest ducat value first; cheaper plat and name break ties for stability.
  units.sort(
    (a, b) =>
      b.ducats - a.ducats ||
      a.price - b.price ||
      a.item_name.localeCompare(b.item_name),
  );

  // First-fit-decreasing bin packing into trades of TRADE_SIZE slots — minimises
  // the number of trades (the scarce resource) while keeping high-value items in
  // the earliest trades and the skippable leftovers in the last.
  const bins: { units: typeof units; slots: number }[] = [];
  for (const u of units) {
    let placed = false;
    for (const b of bins) {
      if (b.slots + u.slots <= TRADE_SIZE) {
        b.units.push(u);
        b.slots += u.slots;
        placed = true;
        break;
      }
    }
    if (!placed) bins.push({ units: [u], slots: u.slots });
  }

  const trades: Trade[] = bins.map((b) => {
    const agg = new Map<string, WhisperItem>();
    for (const u of b.units) {
      const key = `${u.item_name}|${u.price}`;
      const existing = agg.get(key);
      if (existing) existing.quantity++;
      else
        agg.set(key, {
          item_name: u.item_name,
          ducats: u.ducats,
          price: u.price,
          quantity: 1,
          slots: u.slots,
        });
    }
    const items = [...agg.values()].sort(
      (a, b) => b.ducats - a.ducats || a.item_name.localeCompare(b.item_name),
    );
    return {
      items,
      slots: b.slots,
      ducatTotal: b.units.reduce((s, u) => s + u.ducats, 0),
      platTotal: b.units.reduce((s, u) => s + u.price, 0),
      partial: false,
    };
  });

  if (trades.length > 1 && trades[trades.length - 1].slots < TRADE_SIZE) {
    trades[trades.length - 1].partial = true;
  }
  return trades;
}

function tokenFor(i: WhisperItem): string {
  const s = slotsOf(i);
  const setNote = s > 1 ? ` (${s} parts)` : "";
  const qty = i.quantity > 1 ? ` x${i.quantity}` : "";
  return `${i.item_name}${setNote}${qty} ${i.price}p`;
}

export function buildWhispers(
  sellerName: string,
  items: WhisperItem[],
  totalPlat: number,
): string[] {
  const trades = partitionIntoTrades(items);
  const n = trades.length;
  const messages: string[] = [];

  trades.forEach((trade, ti) => {
    const isLast = ti === n - 1;
    const head =
      `/w ${sellerName} ` +
      (ti === 0 ? "Hi! " : "") +
      (n > 1
        ? `WTB trade ${ti + 1}/${n}${trade.partial ? " (partial)" : ""}: `
        : "WTB: ");
    const cont = `/w ${sellerName} + `;
    const suffix =
      n === 1
        ? ` for ${totalPlat}p total (warframe.market)`
        : ` = ${trade.platTotal}p${isLast ? ` (total ${totalPlat}p, warframe.market)` : ""}`;

    let current = head;
    let count = 0;
    for (const token of trade.items.map(tokenFor)) {
      const sep = count === 0 ? "" : ", ";
      if (count > 0 && current.length + sep.length + token.length > WF_SAFE_LEN) {
        messages.push(current);
        current = cont + token;
        count = 1;
      } else {
        current += sep + token;
        count++;
      }
    }
    if (current.length + suffix.length <= WF_SAFE_LEN) {
      messages.push(current + suffix);
    } else {
      messages.push(current);
      messages.push(`/w ${sellerName}${suffix}`);
    }
  });

  return messages;
}
