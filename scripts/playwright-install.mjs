/**
 * Install Chromium for Playwright unless skipped (Docker images already ship browsers).
 */
import { spawnSync } from "child_process";

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === "1") {
  process.exit(0);
}

const result = spawnSync("npx", ["playwright", "install", "chromium"], {
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
