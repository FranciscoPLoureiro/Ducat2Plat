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
