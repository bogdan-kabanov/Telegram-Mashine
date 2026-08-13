/** Legend ids for weekly / generic gratitude circles (no hardship story in chat). */
export const STANDALONE_LEGEND_ID = "standalone_gratitude";
export const STANDALONE_LEGEND_ID_RU = "standalone_gratitude_ru";

export function isStandaloneLegend(id: string | null | undefined): boolean {
  if (!id) return false;
  return id === STANDALONE_LEGEND_ID || id === STANDALONE_LEGEND_ID_RU || id === "standalone";
}

export function resolveStandaloneLegendId(locale: string): string {
  return locale.toLowerCase().startsWith("ru") ? STANDALONE_LEGEND_ID_RU : STANDALONE_LEGEND_ID;
}

/** Circle folder tag → dialog legend id (standalone folder uses neutral legend). */
export function legendIdFromCircleTag(
  circleLegendId: string | null | undefined,
  projectLocale: string,
): string {
  if (!circleLegendId || circleLegendId === "standalone") {
    return resolveStandaloneLegendId(projectLocale);
  }
  return circleLegendId;
}
