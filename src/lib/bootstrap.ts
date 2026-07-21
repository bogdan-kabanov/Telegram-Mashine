import { loadAppConfig } from "@/lib/config/loader";
import { getDb } from "@/lib/db";
import { createLogger, getRuntimeManager } from "@/lib/runtime/manager";
import { isOpenAIConfigured } from "@/lib/openai/client";
import { getScheduler } from "@/modules/scheduler";

const logger = createLogger("bootstrap");

let bootstrapped = false;

export async function bootstrapApp(): Promise<void> {
  if (bootstrapped) return;

  try {
    getDb();
    await loadAppConfig();
    const runtime = getRuntimeManager();
    const state = await runtime.getState();
    const scheduler = getScheduler();

    await scheduler.initialize();
    scheduler.startWorker(30_000);

    if (state.status === "running") {
      await logger.info("Bot was running — scheduler worker resumed");
    }

    await logger.info("Application bootstrapped (stages 2-5 active)");
    bootstrapped = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown bootstrap error";
    await logger.error("Bootstrap failed", { error: message });
    throw error;
  }
}

export function isBootstrapped(): boolean {
  return bootstrapped;
}

export function getBootstrapInfo() {
  return {
    db: true,
    openai: isOpenAIConfigured(),
    stage: 5,
  };
}
