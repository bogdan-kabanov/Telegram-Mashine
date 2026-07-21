import type { LaunchOptions } from "playwright";

/** Safe Chromium flags for Docker / low-/dev/shm environments. */
export function getChromiumLaunchOptions(): LaunchOptions {
  const inDocker =
    process.env.DOCKER === "1" ||
    process.env.PLAYWRIGHT_NO_SANDBOX === "1" ||
    Boolean(process.env.PLAYWRIGHT_BROWSERS_PATH);

  return {
    headless: true,
    args: [
      ...(inDocker ? ["--no-sandbox", "--disable-setuid-sandbox"] : []),
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  };
}
