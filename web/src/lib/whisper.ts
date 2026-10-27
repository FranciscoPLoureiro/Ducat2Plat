// An in-game trade holds at most 6 items. A Prime *set* is one market listing
// but trades as its individual parts, so it occupies (part count) slots, not 1
// — a warframe set eats 4 of the 6 slots, a bow set 5. Because a set is really
// N separate parts, nothing forces it into a single trade: when keeping sets
// whole would waste slots (two 4-part sets = 2 trades with 4 empty slots), we
// split sets across trades so every trade carries 6 parts and the basket needs
// the minimum ceil(parts / 6) trades. Highest ducat value goes first, so the
// last trade holds the least-valuable leftovers. The whisper lays out every
// trade up front so the seller knows exactly what each one should contain; a
// split set is paid in the trade where its last part arrives.
export const TRADE_SIZE = 6;
// Longest chat message we send, "/w seller " included — 300 confirmed to go
// through in-game whispers; anything longer becomes a continuation message.
export const WF_SAFE_LEN = 300;

export interface WhisperItem {
  item_name: string;
  ducats: number;
  price: number;
  quantity: number;
  slots?: number; // trade slots one unit occupies (set = part count; else 1)
}

// One item's share of a trade. A whole line holds `quantity` complete units; a
// split line holds `parts` parts of a single set whose other parts ride in the
// neighbouring trade(s).
export interface TradeLine extends WhisperItem {
  parts: number; // parts of each unit in this trade (= slots when whole)
  partsBefore: number; // parts of this unit already delivered in earlier trades
  copy?: number; // which copy (1-based) when the basket holds several of this set
}

export interface Trade {
  items: TradeLine[];
  slots: number; // total trade slots used (1..TRADE_SIZE)
  ducatTotal: number; // ducats of the parts in this trade (split sets pro rata)
  platTotal: number; // plat paid in this trade (a split set: where it completes)
  partial: boolean; // last trade using fewer than TRADE_SIZE slots (and >1 trade)
}

export function slotsOf(i: WhisperItem): number {
  return i.slots && i.slots > 0 ? i.slots : 1;
}

export function isSplit(l: TradeLine): boolean {
  return l.parts < slotsOf(l);
}

export function completesIn(l: TradeLine): boolean {
  return l.partsBefore + l.parts === slotsOf(l);
}

interface Unit {
  item_name: string;
  ducats: number;
  price: number;
  slots: number;
  copy?: number;
}

// Expand listings into individual units (a qty-3 listing = 3 units), highest
// ducat value first; cheaper plat and name break ties for stability.
function expandUnits(items: WhisperItem[]): Unit[] {
  const units: Unit[] = [];
  for (const it of items) {
    const s = slotsOf(it);
    for (let i = 0; i < it.quantity; i++) {
      units.push({ item_name: it.item_name, ducats: it.ducats, price: it.price, slots: s });
    }
  }
  units.sort(
    (a, b) =>
      b.ducats - a.ducats ||
      a.price - b.price ||
      a.item_name.localeCompare(b.item_name),
  );
  // Number repeated sets (#1, #2…) so a seller can tell "the rest of Burston
  // #1" from "all of Burston #2" when both sit in one trade.
  const total = new Map<string, number>();
  for (const u of units) if (u.slots > 1) total.set(u.item_name, (total.get(u.item_name) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const u of units) {
    if ((total.get(u.item_name) ?? 0) < 2) continue;
    const n = (seen.get(u.item_name) ?? 0) + 1;
    seen.set(u.item_name, n);
    u.copy = n;
  }
  return units;
}

function aggregateUnits(units: Unit[]): WhisperItem[] {
  const agg = new Map<string, WhisperItem>();
  for (const u of units) {
    const key = `${u.item_name}|${u.price}`;
    const existing = agg.get(key);
    if (existing) existing.quantity++;
    else agg.set(key, { item_name: u.item_name, ducats: u.ducats, price: u.price, quantity: 1, slots: u.slots });
  }
  return [...agg.values()];
}

interface Chunk {
  unit: Unit;
  parts: number;
  partsBefore: number;
}

// First-fit-decreasing with whole units — no set is split. Keeps high-value
// items in the earliest trades.
function packWhole(units: Unit[]): Chunk[][] {
  const bins: { chunks: Chunk[]; slots: number }[] = [];
  for (const u of units) {
    const bin = bins.find((b) => b.slots + u.slots <= TRADE_SIZE);
    const chunk = { unit: u, parts: u.slots, partsBefore: 0 };
    if (bin) {
      bin.chunks.push(chunk);
      bin.slots += u.slots;
    } else bins.push({ chunks: [chunk], slots: u.slots });
  }
  return bins.map((b) => b.chunks);
}

// Lay every part out in value order and cut every TRADE_SIZE parts — always
// ceil(parts / 6) trades, splitting a set where a trade boundary falls in it.
function packSplit(units: Unit[]): Chunk[][] {
  const bins: Chunk[][] = [];
  let cur: Chunk[] = [];
  let used = 0;
  for (const u of units) {
    let done = 0;
    while (done < u.slots) {
      const take = Math.min(u.slots - done, TRADE_SIZE - used);
      cur.push({ unit: u, parts: take, partsBefore: done });
      done += take;
      used += take;
      if (used === TRADE_SIZE) {
        bins.push(cur);
        cur = [];
        used = 0;
      }
    }
  }
  if (cur.length) bins.push(cur);
  return bins;
}

export function partitionIntoTrades(items: WhisperItem[]): Trade[] {
  const units = expandUnits(items);
  const totalSlots = units.reduce((s, u) => s + u.slots, 0);
  // Trades are the scarce resource: split sets only when keeping them whole
  // would cost more than the minimum number of trades.
  const whole = packWhole(units);
  const bins = whole.length <= Math.ceil(totalSlots / TRADE_SIZE) ? whole : packSplit(units);

  const trades: Trade[] = bins.map((chunks) => {
    const agg = new Map<string, TradeLine>();
    for (const c of chunks) {
      const key = `${c.unit.item_name}|${c.unit.copy}|${c.unit.price}|${c.parts}|${c.partsBefore}`;
      const existing = agg.get(key);
      if (existing) existing.quantity++;
      else
        agg.set(key, {
          item_name: c.unit.item_name,
          ducats: c.unit.ducats,
          price: c.unit.price,
          quantity: 1,
          slots: c.unit.slots,
          parts: c.parts,
          partsBefore: c.partsBefore,
          copy: c.unit.copy,
        });
    }
    return {
      items: [...agg.values()],
      slots: chunks.reduce((s, c) => s + c.parts, 0),
      ducatTotal: chunks.reduce((s, c) => s + (c.unit.ducats * c.parts) / c.unit.slots, 0),
      platTotal: chunks.reduce(
        (s, c) => s + (c.partsBefore + c.parts === c.unit.slots ? c.unit.price : 0),
        0,
      ),
      partial: false,
    };
  });

  if (trades.length > 1 && trades[trades.length - 1].slots < TRADE_SIZE) {
    trades[trades.length - 1].partial = true;
  }
  return trades;
}

// "Full trades only": the subset of the basket that fills the most complete
// trades (largest part count divisible by 6), highest ducat value among ties.
// Everything else comes back as `extras` — still buyable, just not needed to
// fill those trades.
export function selectFullTrades(items: WhisperItem[]): {
  full: WhisperItem[];
  extras: WhisperItem[];
} {
  const units = expandUnits(items);
  // best[r]: best subset whose part count ≡ r (mod 6). Ordering by (parts,
  // ducats, -plat) is additive, so the 0/1-knapsack recurrence stays exact.
  type Best = { slots: number; ducats: number; plat: number; pick: number[] };
  const better = (a: Best, b: Best | null) =>
    !b ||
    a.slots > b.slots ||
    (a.slots === b.slots && (a.ducats > b.ducats || (a.ducats === b.ducats && a.plat < b.plat)));
  let best: (Best | null)[] = Array(TRADE_SIZE).fill(null);
  best[0] = { slots: 0, ducats: 0, plat: 0, pick: [] };
  units.forEach((u, ui) => {
    const next = [...best];
    best.forEach((b, r) => {
      if (!b) return;
      const cand = {
        slots: b.slots + u.slots,
        ducats: b.ducats + u.ducats,
        plat: b.plat + u.price,
        pick: [...b.pick, ui],
      };
      const nr = (r + u.slots) % TRADE_SIZE;
      if (better(cand, next[nr])) next[nr] = cand;
    });
    best = next;
  });
  const picked = new Set(best[0]!.pick);
  return {
    full: aggregateUnits(units.filter((_, i) => picked.has(i))),
    extras: aggregateUnits(units.filter((_, i) => !picked.has(i))),
  };
}

export function lineLabel(l: WhisperItem | TradeLine): string {
  return "copy" in l && l.copy ? `${l.item_name} #${l.copy}` : l.item_name;
}

// Full-name token for a whole listing: "Rhino Prime Set (4 parts) x2 40p".
function tokenFor(l: WhisperItem): string {
  const s = slotsOf(l);
  const setNote = s > 1 ? ` (${s} parts)` : "";
  const qty = l.quantity > 1 ? ` x${l.quantity}` : "";
  return `${l.item_name}${setNote}${qty} ${l.price}p`;
}

// "Trumna Prime Set" -> "Trumna": the opener already says these are Prime sets.
function setName(name: string): string {
  return name.replace(/ Prime Set$/i, "").replace(/ Set$/i, "");
}

// One trade in a word or two per item: "T1: Trumna set + 2 Cedo parts (20p)".
// Parts of the same set are counted together, so the seller only has to know
// how many pieces of what to put in; the plat is what's paid in that trade.
function tradeSegment(trade: Trade, ti: number): string {
  const groups = new Map<string, { s: number; parts: number; qty: number; whole: boolean }>();
  for (const l of trade.items) {
    const g = groups.get(l.item_name) ?? { s: slotsOf(l), parts: 0, qty: 0, whole: true };
    g.parts += l.parts * l.quantity;
    g.qty += l.quantity;
    if (isSplit(l)) g.whole = false;
    groups.set(l.item_name, g);
  }
  const bits = [...groups].map(([name, g]) => {
    if (g.s === 1) return g.qty > 1 ? `${g.qty}x ${name}` : name;
    const base = setName(name);
    if (g.whole) return g.qty > 1 ? `${g.qty} ${base} sets` : `${base} set`;
    return `${g.parts} ${base} part${g.parts === 1 ? "" : "s"}`;
  });
  return `T${ti + 1}: ${bits.join(" + ")}${trade.platTotal > 0 ? ` (${trade.platTotal}p)` : ""}`;
}

// A token plus the separator that goes before it when it isn't the first
// thing in a message.
type Piece = { text: string; sep: string };

// Join tokens after `head`, opening a continuation (`cont`, by default
// "/w seller + ") whenever a message would pass the chat cap; `suffix` closes
// the last one.
function packMessages(
  sellerName: string,
  head: string,
  tokens: (string | Piece)[],
  suffix: string,
  sep = ", ",
  cont = `/w ${sellerName} + `,
): string[] {
  const messages: string[] = [];
  let current = head;
  let count = 0;
  for (const t of tokens) {
    const token = typeof t === "string" ? t : t.text;
    const s = count === 0 ? "" : typeof t === "string" ? sep : t.sep;
    if (count > 0 && current.length + s.length + token.length > WF_SAFE_LEN) {
      messages.push(current);
      current = cont + token;
      count = 1;
    } else {
      current += s + token;
      count++;
    }
  }
  if (current.length + suffix.length <= WF_SAFE_LEN) {
    messages.push(current + suffix);
  } else {
    messages.push(current);
    if (suffix.trim()) messages.push(`/w ${sellerName}${suffix}`);
  }
  return messages;
}

export function buildWhispers(
  sellerName: string,
  items: WhisperItem[],
  totalPlat: number,
): string[] {
  const trades = partitionIntoTrades(items);
  const n = trades.length;
  if (n === 0) return [];
  if (n === 1) {
    return packMessages(
      sellerName,
      `/w ${sellerName} Hi! WTB: `,
      items.map(tokenFor),
      ` for ${totalPlat}p total (warframe.market)`,
    );
  }

  // Several trades: the opener lists what we're buying (as the seller listed
  // it, with prices) and how it splits into trades of 6 parts; the trades then
  // start a fresh message at T1, one short segment each. Usually 2 messages,
  // sent once up front.
  const units = expandUnits(items);
  const parts = units.reduce((s, u) => s + u.slots, 0);
  const sets = units.filter((u) => u.slots > 1).length;
  const loose = units.length - sets;
  const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? "" : "s"}`;
  const what =
    loose === 0
      ? plural(sets, "Prime set")
      : sets === 0
        ? plural(loose, "item")
        : `${plural(sets, "set")} + ${plural(loose, "part")}`;
  // "Trumna 20p, 2x Braton 5p ea" — the opener already says "Prime sets"
  // when that's all there is; otherwise sets read "Rhino set".
  const listed = aggregateUnits(units).map((i) => {
    const name = slotsOf(i) === 1 ? i.item_name : loose === 0 ? setName(i.item_name) : `${setName(i.item_name)} set`;
    return i.quantity > 1 ? `${i.quantity}x ${name} ${i.price}p ea` : `${name} ${i.price}p`;
  });
  listed[listed.length - 1] += ".";
  const anySplit = trades.some((t) => t.items.some(isSplit));
  const plan =
    `${parts} parts, 6 per trade = ${n} trades` +
    `${anySplit ? " (a set is paid in the trade that completes it)" : ""}:`;
  const opener = packMessages(
    sellerName,
    `/w ${sellerName} Hi! WTB ${what} for ${totalPlat}p total (warframe.market): `,
    [...listed.map((text) => ({ text, sep: ", " })), { text: plan, sep: " " }],
    "",
  );
  // The "T" labels already mark a continuation, so trade messages skip the "+".
  const tradeMsgs = packMessages(
    sellerName,
    `/w ${sellerName} `,
    trades.map(tradeSegment),
    "",
    " | ",
    `/w ${sellerName} `,
  );
  return [...opener, ...tradeMsgs];
}

// Separate, optional offer for the items "Full trades only" left out — sent on
// its own so the main trades stay clean, but the seller still knows about them.
export function buildExtrasWhisper(sellerName: string, extras: WhisperItem[]): string[] {
  if (extras.length === 0) return [];
  const plat = extras.reduce((s, i) => s + i.price * i.quantity, 0);
  const n = partitionIntoTrades(extras).length;
  return packMessages(
    sellerName,
    `/w ${sellerName} Optional extra: `,
    extras.map(tokenFor),
    ` = ${plat}p (+${n} trade${n === 1 ? "" : "s"})`,
  );
}
