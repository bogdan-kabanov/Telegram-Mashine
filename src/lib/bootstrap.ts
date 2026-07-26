import { loadAppConfig } from "@/lib/config/loader";
import { getDb } from "@/lib/db";
import { createLogger, getRuntimeManager } from "@/lib/runtime/manager";
import { isOpenAIConfigured } from "@/lib/openai/client";
import { getScheduler } from "@/modules/scheduler";

const logger = createLogger("bootstrap");

let bootstrapped = false;
let bootstrapPromise: Promise<void> | null = null;

export async function bootstrapApp(): Promise<void> {
  if (bootstrapped) return;
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    try {
      const { ensurePlaywrightBrowsersPath } = await import("@/lib/playwright");
      ensurePlaywrightBrowsersPath();

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
      bootstrapPromise = null;
      throw error;
    }
  })();

  return bootstrapPromise;
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
