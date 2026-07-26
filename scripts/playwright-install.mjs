/**
 * Install Chromium for Playwright unless skipped (Docker images already ship browsers).
 * Prefer a stable PLAYWRIGHT_BROWSERS_PATH (see .env.example) so Cursor temp sandbox
 * caches do not break screenshot generation.
 */
import { spawnSync } from "child_process";
import path from "path";
import os from "os";

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === "1") {
  process.exit(0);
}

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
    "ms-playwright",
  );
}

const result = spawnSync("npx", ["playwright", "install", "chromium"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
