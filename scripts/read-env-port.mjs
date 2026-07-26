import { existsSync, readFileSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFile() {
  const envFile = path.join(ROOT, ".env");
  /** @type {Record<string, string>} */
  const out = {};
  if (!existsSync(envFile)) return out;
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function readPort(defaultPort = 3000) {
  if (process.env.PORT) {
    return String(process.env.PORT);
  }
  const fromFile = readEnvFile().PORT;
  return fromFile ? String(fromFile) : String(defaultPort);
}

/** Stable Chromium path — overrides Cursor sandbox temp cache. */
export function resolvePlaywrightBrowsersPath() {
  const fileEnv = readEnvFile();
  const fromFile = fileEnv.PLAYWRIGHT_BROWSERS_PATH?.trim();
  const stableDefault = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
    "ms-playwright",
  );
  const candidate = fromFile || stableDefault;
  const current = (process.env.PLAYWRIGHT_BROWSERS_PATH ?? "").trim();
  const broken =
    !current ||
    current.toLowerCase().includes("cursor-sandbox-cache") ||
    /[\\/]temp[\\/]/i.test(current);
  return broken || !existsSync(current) ? candidate : current;
}

export function getProjectRoot() {
  return ROOT;
}
