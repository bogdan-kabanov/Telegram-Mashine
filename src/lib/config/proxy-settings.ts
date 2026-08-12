import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

import {
  maskProxyUrl,
  proxySettingsSchema,
  type ProxySettings,
  type ProxySettingsPublic,
} from "./proxy-settings-shared";

export type { ProxySettings, ProxySettingsPublic };
export { proxySettingsSchema, maskProxyUrl, proxyUrlSchema } from "./proxy-settings-shared";

function settingsPath(): string {
  const configDir = process.env.CONFIG_DIR ?? "./config";
  return path.resolve(configDir, "proxy-settings.json");
}

function readRawFile(): Record<string, unknown> | null {
  const file = settingsPath();
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function loadProxySettings(): ProxySettings {
  const raw = readRawFile();
  if (!raw) return proxySettingsSchema.parse({});
  try {
    return proxySettingsSchema.parse(raw);
  } catch {
    return proxySettingsSchema.parse({});
  }
}

/**
 * Effective outbound proxy URL.
 * Admin settings override HTTPS_PROXY / HTTP_PROXY / PROXY_URL env.
 */
export function getProxyUrl(): string {
  const fromSettings = loadProxySettings().PROXY_URL?.trim() ?? "";
  if (fromSettings) return fromSettings;

  const fromEnv =
    process.env.PROXY_URL?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    "";
  return fromEnv;
}

/**
 * Save proxy. PROXY_URL:
 * - omit / undefined → keep previously stored value
 * - "" → clear stored proxy (fall back to env)
 * - non-empty → replace
 */
export function saveProxySettings(patch: Record<string, unknown>): ProxySettings {
  const current = loadProxySettings();
  const hasKey = Object.prototype.hasOwnProperty.call(patch, "PROXY_URL");
  const next = proxySettingsSchema.parse({
    PROXY_URL: hasKey ? String(patch.PROXY_URL ?? "").trim() : current.PROXY_URL ?? "",
  });

  const file = settingsPath();
  mkdirSync(path.dirname(file), { recursive: true });

  const toWrite: Record<string, unknown> = {};
  if (next.PROXY_URL) toWrite.PROXY_URL = next.PROXY_URL;

  writeFileSync(file, `${JSON.stringify(toWrite, null, 2)}\n`, "utf-8");
  return next;
}

export function effectiveProxySettings(): ProxySettingsPublic {
  const stored = loadProxySettings().PROXY_URL?.trim() ?? "";
  const envValue =
    process.env.PROXY_URL?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    "";
  const effective = getProxyUrl();

  let source: ProxySettingsPublic["source"] = "none";
  if (stored) source = "settings";
  else if (envValue) source = "env";

  return {
    configured: Boolean(effective),
    source,
    hint: maskProxyUrl(effective),
  };
}
