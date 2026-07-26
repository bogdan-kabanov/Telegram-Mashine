import { existsSync, readdirSync } from "fs";
import os from "os";
import path from "path";

import type { Browser, LaunchOptions } from "playwright";

/**
 * Cursor / sandbox often injects PLAYWRIGHT_BROWSERS_PATH into a temp cache
 * that does not contain Chromium. Prefer a stable user-local install and
 * always override broken sandbox paths before launch.
 */
export function ensurePlaywrightBrowsersPath(): string {
  const stable =
    process.env.PLAYWRIGHT_BROWSERS_PATH_STABLE?.trim() ||
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "ms-playwright");

  const current = (process.env.PLAYWRIGHT_BROWSERS_PATH ?? "").trim();
  const looksBroken =
    !current ||
    current.toLowerCase().includes("cursor-sandbox-cache") ||
    /[\\/]temp[\\/]/i.test(current);

  if (looksBroken || !existsSync(current)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = stable;
  }

  return process.env.PLAYWRIGHT_BROWSERS_PATH!;
}

/** Resolve chrome-headless-shell.exe under the browsers path (bypasses Playwright cache). */
export function resolveChromiumExecutable(): string | null {
  const root = ensurePlaywrightBrowsersPath();
  if (!existsSync(root)) return null;

  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("chromium_headless_shell-"))
    .map((d) => d.name)
    .sort()
    .reverse();

  for (const dir of dirs) {
    const exe = path.join(
      root,
      dir,
      process.platform === "win32" ? "chrome-headless-shell-win64" : "chrome-headless-shell-linux64",
      process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell",
    );
    if (existsSync(exe)) return exe;
  }

  // Full Chromium build fallback
  const fullDirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^chromium-\d+$/.test(d.name))
    .map((d) => d.name)
    .sort()
    .reverse();

  for (const dir of fullDirs) {
    const exe =
      process.platform === "win32"
        ? path.join(root, dir, "chrome-win64", "chrome.exe")
        : path.join(root, dir, "chrome-linux64", "chrome");
    if (existsSync(exe)) return exe;
  }

  return null;
}

/** Safe Chromium flags for Docker / Windows / low-/dev/shm environments. */
export function getChromiumLaunchOptions(): LaunchOptions {
  ensurePlaywrightBrowsersPath();

  const inDocker =
    process.env.DOCKER === "1" ||
    process.env.PLAYWRIGHT_NO_SANDBOX === "1" ||
    Boolean(process.env.PLAYWRIGHT_BROWSERS_PATH);

  const executablePath = resolveChromiumExecutable() ?? undefined;
  // GPU must stay ON — otherwise backdrop-filter (Telegram glass) is flat/opaque in screenshots.
  const disableGpu = process.env.PLAYWRIGHT_DISABLE_GPU === "1";

  return {
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: [
      ...(inDocker ? ["--no-sandbox", "--disable-setuid-sandbox"] : []),
      "--disable-dev-shm-usage",
      ...(disableGpu ? ["--disable-gpu"] : ["--use-angle=swiftshader"]),
    ],
  };
}

/** Launch Chromium after fixing browsers path (call this instead of chromium.launch). */
export async function launchChromium(): Promise<Browser> {
  ensurePlaywrightBrowsersPath();
  const { chromium } = await import("playwright");
  const options = getChromiumLaunchOptions();
  if (!options.executablePath) {
    throw new Error(
      `Playwright Chromium not found in ${process.env.PLAYWRIGHT_BROWSERS_PATH}. Run: npx playwright install chromium`,
    );
  }
  return chromium.launch(options);
}
