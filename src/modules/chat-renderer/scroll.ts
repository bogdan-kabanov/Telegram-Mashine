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
  const targetScreens = options?.targetScreens ?? options?.defaultTargetScreens ?? 11;
  const minOverlap = options?.minOverlapPx ?? 160;
  const overlapPx = options?.overlapPx ?? Math.max(minOverlap, Math.round(clientHeight * 0.55));

  if (maxScroll <= 8) return [0];

  const minFrames = Math.max(targetScreens, 9);
  const stepFromTarget = Math.max(90, Math.floor(maxScroll / Math.max(1, minFrames - 1)));
  const stepFromOverlap = Math.max(90, clientHeight - overlapPx);
  const step = Math.min(stepFromTarget, stepFromOverlap);

  const positions: number[] = [];
  for (let y = 0; y < maxScroll; y += step) {
    positions.push(Math.min(y, maxScroll));
  }
  const last = positions[positions.length - 1] ?? 0;
  if (maxScroll - last > 24) positions.push(maxScroll);

  const hardCap = targetScreens + 6;
  if (positions.length > hardCap) {
    const out = [positions[0]!];
    const inner = positions.slice(1, -1);
    const keep = Math.max(1, hardCap - 2);
    for (let i = 0; i < keep; i++) {
      const idx = Math.round((i / Math.max(1, keep - 1)) * (inner.length - 1));
      const v = inner[idx]!;
      if (out[out.length - 1] !== v) out.push(v);
    }
    if (out[out.length - 1] !== maxScroll) out.push(maxScroll);
    return out;
  }

  return positions;
}
