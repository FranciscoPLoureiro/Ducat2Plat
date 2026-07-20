// Warframe's in-game chat caps a single message near ~100 characters. Instead
// of truncating or collapsing to a bare count, split the itemized whisper into
// a sequence of messages, each under the cap: the first opens with the
// greeting, continuations are prefixed "+", and the total closes the last one.
// The UI renders one copy button per part.
export const WF_SAFE_LEN = 90;

export interface WhisperItem {
  item_name: string;
  quantity: number;
}

export function buildWhispers(
  sellerName: string,
  items: WhisperItem[],
  totalPlat: number,
): string[] {
  const tokens = items.map((i) =>
    i.quantity > 1 ? `${i.item_name} x${i.quantity}` : i.item_name,
  );
  const firstPrefix = `/w ${sellerName} Hi! WTB: `;
  const contPrefix = `/w ${sellerName} + `;
  const suffix = ` for ${totalPlat}p (warframe.market)`;

  const messages: string[] = [];
  let current = firstPrefix;
  let count = 0;

  for (const token of tokens) {
    const sep = count === 0 ? "" : ", ";
    // Start a new message when this token would overflow — unless the message
    // is empty (an unsplittable long name is allowed to overflow alone).
    if (count > 0 && current.length + sep.length + token.length > WF_SAFE_LEN) {
      messages.push(current);
      current = contPrefix + token;
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
    messages.push(`/w ${sellerName} = ${totalPlat}p total (warframe.market)`);
  }

  return messages;
}
