/**
 * Docker entrypoint: ensure writable dirs exist, then exec the app.
 * Optional: AUTO_SETUP_WEBHOOK=1 registers Telegram webhook after boot.
 */
import { spawn } from "child_process";
import { mkdirSync } from "fs";

const dataDir = process.env.DATA_DIR ?? "/app/data";
const dirs = [
  dataDir,
  `${dataDir}/logs`,
  `${dataDir}/runtime`,
  `${dataDir}/reviews`,
  `${dataDir}/renders`,
  `${dataDir}/media`,
  "/app/public/renders",
];

for (const dir of dirs) {
  mkdirSync(dir, { recursive: true });
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("No command provided to docker-entrypoint");
  process.exit(1);
}

const child = spawn(args[0], args.slice(1), {
  stdio: "inherit",
  env: process.env,
});

function appBasePath() {
  const raw = (process.env.NEXT_PUBLIC_BASE_PATH || process.env.BASE_PATH || "").trim();
  if (!raw || raw === "/") return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

async function maybeSetupWebhook() {
  if (process.env.AUTO_SETUP_WEBHOOK !== "1") return;

  const port = process.env.PORT ?? "3000";
  const base = appBasePath();
  const url = `http://127.0.0.1:${port}${base}/api/telegram/setup`;

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(url, { method: "POST" });
      if (res.ok) {
        const body = await res.json();
        console.log("[entrypoint] Telegram webhook registered:", body.webhookUrl ?? "ok");
        return;
      }
    } catch {
      // server not ready yet
    }
  }
  console.warn("[entrypoint] AUTO_SETUP_WEBHOOK=1 but setup did not succeed in time");
}

maybeSetupWebhook().catch((err) => {
  console.warn("[entrypoint] webhook setup error:", err);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
