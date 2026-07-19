// Warframe's in-game chat caps a single message near ~100 characters, so a
// fully itemized whisper truncates the moment a bundle has more than a couple
// of parts. Build the itemized message only when it fits with margin; otherwise
// fall back to a count summary that always fits — the seller recognizes
// "(warframe.market)" as "buying your listings", and the exact items are
// visible on-screen and settled in the trade window.
export const WF_SAFE_LEN = 90;

export interface WhisperItem {
  item_name: string;
  quantity: number;
}

export function buildWhisper(
  sellerName: string,
  items: WhisperItem[],
  totalPlat: number,
): string {
  const itemList = items
    .map((i) => (i.quantity > 1 ? `${i.item_name} x${i.quantity}` : i.item_name))
    .join(", ");
  const full = `/w ${sellerName} Hi! WTB: ${itemList} for ${totalPlat}p (warframe.market)`;
  if (full.length <= WF_SAFE_LEN) return full;
  return `/w ${sellerName} Hi! WTB ${items.length} prime parts, ${totalPlat}p (warframe.market)`;
}
