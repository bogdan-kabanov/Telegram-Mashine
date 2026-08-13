/** Screenshot scroll planning — kept separate so unit tests don't load Playwright/HTML. */

export function planScrollPositions(
  maxScroll: number,
  clientHeight: number,
  options?: {
    targetScreens?: number;
    overlapPx?: number;
    /** Soft target for frame count (default matches TARGET_SCREENSHOTS). */
    defaultTargetScreens?: number;
    /** Min overlap when deriving from client height. */
    minOverlapPx?: number;
  },
): number[] {
  const targetScreens = Math.max(1, options?.targetScreens ?? options?.defaultTargetScreens ?? 10);
  const minOverlap = options?.minOverlapPx ?? 160;
  const overlapPx = options?.overlapPx ?? Math.max(minOverlap, Math.round(clientHeight * 0.55));

  if (maxScroll <= 8) return [0];

  // Prefer evenly spaced frames covering [0, maxScroll], hard-capped at targetScreens
  // (Telegram album limit = 10 photos — never emit an 11th screen).
  if (targetScreens === 1) return [0];

  const stepFromOverlap = Math.max(90, clientHeight - overlapPx);
  const stepFromTarget = Math.max(90, Math.floor(maxScroll / Math.max(1, targetScreens - 1)));
  const step = Math.min(stepFromTarget, stepFromOverlap);

  const positions: number[] = [];
  for (let y = 0; y < maxScroll; y += step) {
    positions.push(Math.min(y, maxScroll));
  }
  const last = positions[positions.length - 1] ?? 0;
  if (last !== maxScroll) positions.push(maxScroll);

  if (positions.length <= targetScreens) return positions;

  // Subsample evenly: always keep first + last, fill the middle.
  const out: number[] = [positions[0]!];
  const keepInner = targetScreens - 2;
  if (keepInner <= 0) {
    if (maxScroll > 0) out.push(maxScroll);
    return out;
  }
  for (let i = 0; i < keepInner; i++) {
    const t = (i + 1) / (keepInner + 1);
    const y = Math.round(t * maxScroll);
    if (out[out.length - 1] !== y) out.push(y);
  }
  if (out[out.length - 1] !== maxScroll) out.push(maxScroll);
  return out.slice(0, targetScreens);
}
