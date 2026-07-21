import { promises as fs } from "fs";
import path from "path";

import { getEnv } from "@/lib/schemas/env";
import {
  amountsConfigSchema,
  banksConfigSchema,
  currenciesConfigSchema,
  geoConfigSchema,
  projectsConfigSchema,
  scheduleConfigSchema,
  type AmountsConfig,
  type BanksConfig,
  type CurrenciesConfig,
  type GeoConfig,
  type ProjectsConfig,
  type ScheduleConfig,
} from "@/lib/schemas";

export interface AppConfig {
  geo: GeoConfig;
  banks: BanksConfig;
  currencies: CurrenciesConfig;
  amounts: AmountsConfig;
  schedule: ScheduleConfig;
  projects: ProjectsConfig;
}

let cachedConfig: AppConfig | null = null;

async function readConfigFile<T>(filename: string, schema: { parse: (data: unknown) => T }): Promise<T> {
  const env = getEnv();
  const filePath = path.resolve(env.CONFIG_DIR, filename);
  const raw = await fs.readFile(filePath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  return schema.parse(parsed);
}

export async function loadAppConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig;

  const [geo, banks, currencies, amounts, schedule, projects] = await Promise.all([
    readConfigFile("geo.json", geoConfigSchema),
    readConfigFile("banks.json", banksConfigSchema),
    readConfigFile("currencies.json", currenciesConfigSchema),
    readConfigFile("amounts.json", amountsConfigSchema),
    readConfigFile("schedule.json", scheduleConfigSchema),
    readConfigFile("projects.json", projectsConfigSchema),
  ]);

  cachedConfig = { geo, banks, currencies, amounts, schedule, projects };
  return cachedConfig;
}

export function resetConfigCache(): void {
  cachedConfig = null;
}

export async function getProjectById(projectId: string) {
  const config = await loadAppConfig();
  const project = config.projects.projects.find((p) => p.id === projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  return project;
}

export async function getAmountPackById(packId: string) {
  const config = await loadAppConfig();
  const pack = config.amounts.packs.find((p) => p.id === packId);
  if (!pack) {
    throw new Error(`Amount pack not found: ${packId}`);
  }
  return pack;
}
