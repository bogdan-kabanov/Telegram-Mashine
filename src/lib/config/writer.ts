import { promises as fs } from "fs";
import path from "path";

import { resetConfigCache, loadAppConfig } from "@/lib/config/loader";
import {
  clientLegendSchema,
  projectConfigSchema,
  type ClientLegend,
  type ProjectConfig,
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
  const projects = config.projects.projects.map((p) =>
    p.id === projectId ? projectConfigSchema.parse({ ...p, ...patch, id: projectId }) : p,
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
