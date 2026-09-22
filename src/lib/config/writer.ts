import { promises as fs } from "fs";
import path from "path";

import { resetConfigCache, loadAppConfig } from "@/lib/config/loader";
import { resolveLocaleProfileFromConfig } from "@/lib/i18n/locale-profile";
import {
  clientLegendSchema,
  projectConfigSchema,
  scheduleConfigSchema,
  amountPackSchema,
  amountsConfigSchema,
  type ClientLegend,
  type ProjectConfig,
  type ScheduleConfig,
  type AmountPack,
  type AmountsConfig,
} from "@/lib/schemas";
import { getEnv } from "@/lib/schemas/env";


function dataPath(...parts: string[]): string {
  const env = getEnv();
  return path.resolve(env.DATA_DIR ?? "./data", ...parts);
}

function configPath(...parts: string[]): string {
  const env = getEnv();
  return path.resolve(env.CONFIG_DIR ?? "./config", ...parts);
}

export async function saveLegends(legends: ClientLegend[]): Promise<void> {
  const parsed = legends.map((l) => clientLegendSchema.parse(l));
  await fs.writeFile(dataPath("scripts/legends.json"), `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
  await syncScenarioLegendIds(parsed.map((l) => l.id));
}

/** Keep every project scenario able to pick any current legend. */
async function syncScenarioLegendIds(legendIds: string[]): Promise<void> {
  if (legendIds.length === 0) return;
  const file = dataPath("scenarios/index.json");
  const raw = JSON.parse(await fs.readFile(file, "utf-8")) as {
    scenarios: Array<{ legendIds: string[]; [key: string]: unknown }>;
  };
  raw.scenarios = raw.scenarios.map((s) => ({ ...s, legendIds: [...legendIds] }));
  await fs.writeFile(file, `${JSON.stringify(raw, null, 2)}\n`, "utf-8");
}

export async function loadLegendsFromDisk(): Promise<ClientLegend[]> {
  const raw = await fs.readFile(dataPath("scripts/legends.json"), "utf-8");
  return clientLegendSchema.array().parse(JSON.parse(raw));
}

export async function updateProject(projectId: string, patch: Partial<ProjectConfig>): Promise<ProjectConfig> {
  const config = await loadAppConfig();
  const current = config.projects.projects.find((p) => p.id === projectId);
  if (!current) throw new Error(`Project not found: ${projectId}`);

  const nextLocale = typeof patch.locale === "string" ? patch.locale : current.locale;
  const localeProfile = resolveLocaleProfileFromConfig(config.geo, nextLocale);

  const projects = config.projects.projects.map((p) =>
    p.id === projectId
      ? projectConfigSchema.parse({
          ...p,
          ...patch,
          id: projectId,
          locale: localeProfile.code,
          // Currency always follows locale from geo.json
          currency: localeProfile.currency,
        })
      : p,
  );
  await fs.writeFile(
    configPath("projects.json"),
    `${JSON.stringify({ projects }, null, 2)}\n`,
    "utf-8",
  );
  resetConfigCache();
  const updated = projects.find((p) => p.id === projectId);
  if (!updated) throw new Error(`Project not found: ${projectId}`);
  return updated;
}

export async function updateSchedule(patch: Partial<ScheduleConfig>): Promise<ScheduleConfig> {
  const config = await loadAppConfig();
  const next = scheduleConfigSchema.parse({ ...config.schedule, ...patch });
  await fs.writeFile(configPath("schedule.json"), `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  resetConfigCache();
  return next;
}

export async function upsertAmountPack(pack: AmountPack): Promise<AmountsConfig> {
  const config = await loadAppConfig();
  const parsed = amountPackSchema.parse(pack);
  const packs = [...config.amounts.packs];
  const idx = packs.findIndex((p) => p.id === parsed.id);
  if (idx >= 0) packs[idx] = parsed;
  else packs.push(parsed);
  const next = amountsConfigSchema.parse({
    ...config.amounts,
    packs,
  });
  await fs.writeFile(configPath("amounts.json"), `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  resetConfigCache();
  return next;
}

export async function deleteAmountPack(packId: string): Promise<AmountsConfig> {
  const config = await loadAppConfig();
  const packs = config.amounts.packs.filter((p) => p.id !== packId);
  if (packs.length === 0) {
    throw new Error("Нельзя удалить последний пак сумм");
  }
  if (packs.length === config.amounts.packs.length) {
    throw new Error(`Пак не найден: ${packId}`);
  }
  const next = amountsConfigSchema.parse({
    ...config.amounts,
    packs,
  });
  await fs.writeFile(configPath("amounts.json"), `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  resetConfigCache();
  return next;
}
