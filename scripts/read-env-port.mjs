import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function readPort(defaultPort = 3000) {
  if (process.env.PORT) {
    return String(process.env.PORT);
  }

  const envFile = path.join(ROOT, ".env");
  if (!existsSync(envFile)) {
    return String(defaultPort);
  }

  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("PORT=")) {
      return trimmed.slice(5).trim();
    }
  }

  return String(defaultPort);
}

export function getProjectRoot() {
  return ROOT;
}
