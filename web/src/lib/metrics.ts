export const VELOCITY_DAYS = 14;
export const VELOCITY_LIQUID = 15;
export const PPD_N = 6;
export const JUNK_RATE_FALLBACK = 0.10;

export interface OrderForPpd {
  price: number;
  quantity: number;
}

export function computePpdAtN(
  orders: OrderForPpd[],
  ducats: number,
  n: number,
): { ppdAtN: number | null; shallow: boolean } {
  if (orders.length === 0) return { ppdAtN: null, shallow: false };

  let cumQty = 0;
  let cumCost = 0;
  for (const o of orders) {
    const take = Math.min(o.quantity, n - cumQty);
    cumCost += o.price * take;
    cumQty += take;
    if (cumQty >= n) break;
  }

  if (cumQty >= n) {
    return { ppdAtN: (ducats * n) / cumCost, shallow: false };
  }

  return {
    ppdAtN: cumQty > 0 ? (ducats * cumQty) / cumCost : null,
    shallow: true,
  };
}

export function computeVelocity(volumes: number[], windowDays: number): number {
  return volumes.reduce((a, b) => a + b, 0) / windowDays;
}

export function computeJunkRateFromRanked(
  items: { ppd_at_n: number | null; shallow: boolean }[],
  fallback: number = JUNK_RATE_FALLBACK,
): number {
  const withDepth = items.filter((i) => i.ppd_at_n !== null && !i.shallow);
  const top = withDepth.slice(0, 20);
  if (top.length === 0) return fallback;
  const values = top.map((i) => i.ppd_at_n!).sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 0
      ? (values[mid - 1] + values[mid]) / 2
      : values[mid];
  return 1 / median;
}

export function computeBaroRoi(
  resaleMedian: number,
  ducatCost: number,
  junkRate: number,
): number {
  return resaleMedian - ducatCost * junkRate;
}

export function isSpecialVisit(
  relay: string | null,
  itemCount: number,
): boolean {
  return (relay != null && /tennocon/i.test(relay)) || itemCount >= 150;
}
