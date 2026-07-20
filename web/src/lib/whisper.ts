// An in-game trade holds at most 6 items (each unit of a stacked listing counts
// as one), so a large basket spans several trades. We partition the basket into
// trades — highest ducat value first, so the *last* trade holds the least-
// valuable leftovers — and the whisper emits one labeled message per trade so
// the seller (and you) know exactly what each trade should contain. A partial
// last trade (< 6 items) is flagged so you can decide whether it's worth a slot.
export const TRADE_SIZE = 6;
// Warframe caps a chat message near ~180 chars; a trade that would exceed it is
// split into continuation messages.
export const WF_SAFE_LEN = 180;

export interface WhisperItem {
  item_name: string;
  ducats: number;
  price: number;
  quantity: number;
}

export interface Trade {
  items: WhisperItem[]; // aggregated; quantity = units of that item IN THIS trade
  units: number; // total item slots this trade uses (1..TRADE_SIZE)
  ducatTotal: number;
  platTotal: number;
  partial: boolean; // last trade with fewer than TRADE_SIZE units (and >1 trade)
}

export function partitionIntoTrades(items: WhisperItem[]): Trade[] {
  // Expand each listing into individual units (a qty-3 listing = 3 slots).
  const units: { item_name: string; ducats: number; price: number }[] = [];
  for (const it of items) {
    for (let i = 0; i < it.quantity; i++) {
      units.push({ item_name: it.item_name, ducats: it.ducats, price: it.price });
    }
  }
  // Highest ducat value first; cheaper plat breaks ties, then name for stability.
  units.sort(
    (a, b) =>
      b.ducats - a.ducats ||
      a.price - b.price ||
      a.item_name.localeCompare(b.item_name),
  );

  const trades: Trade[] = [];
  for (let i = 0; i < units.length; i += TRADE_SIZE) {
    const chunk = units.slice(i, i + TRADE_SIZE);
    const agg = new Map<string, WhisperItem>();
    for (const u of chunk) {
      const key = `${u.item_name}|${u.price}`;
      const existing = agg.get(key);
      if (existing) existing.quantity++;
      else agg.set(key, { item_name: u.item_name, ducats: u.ducats, price: u.price, quantity: 1 });
    }
    trades.push({
      items: [...agg.values()],
      units: chunk.length,
      ducatTotal: chunk.reduce((s, u) => s + u.ducats, 0),
      platTotal: chunk.reduce((s, u) => s + u.price, 0),
      partial: false,
    });
  }
  if (trades.length > 1 && trades[trades.length - 1].units < TRADE_SIZE) {
    trades[trades.length - 1].partial = true;
  }
  return trades;
}

function tokenFor(i: WhisperItem): string {
  const qty = i.quantity > 1 ? ` x${i.quantity}` : "";
  return `${i.item_name}${qty} ${i.price}p`;
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
