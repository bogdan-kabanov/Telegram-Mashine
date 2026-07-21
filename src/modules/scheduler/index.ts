import { randomUUID } from "crypto";

import { loadAppConfig } from "@/lib/config/loader";
import {
  enqueueTask,
  getPendingTasks,
  isSlotExecuted,
  markSlotExecuted,
  markTaskCompleted,
  markTaskFailed,
  markTaskRunning,
} from "@/lib/db/reviews";
import { getReviewPipeline } from "@/lib/pipeline";
import { createLogger, getRuntimeManager } from "@/lib/runtime/manager";
import type { ScheduleSlot } from "@/lib/schemas";
import {
  getMexicoCityParts,
  getMexicoDateKey,
  getMexicoWeekKey,
  getNextMexicoSlotDate,
  isMexicoSlotDue,
} from "@/lib/timezone";

const logger = createLogger("scheduler");

export interface ScheduledTask {
  id: string;
  slot: ScheduleSlot;
  nextRunAt: string;
  status: "pending" | "running" | "completed" | "failed";
}

function computeNextRunMexico(slot: ScheduleSlot, from = new Date()): Date {
  return getNextMexicoSlotDate(slot.hour, slot.minute, from);
}

const globalWorkerKey = Symbol.for("bot-ai.schedulerWorker");

export class Scheduler {
  private tasks: ScheduledTask[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;

  async initialize(): Promise<void> {
    const config = await loadAppConfig();
    const now = new Date();

    this.tasks = config.schedule.slots.map((slot) => {
      const next = computeNextRunMexico(slot, now);
      return {
        id: slot.id,
        slot,
        nextRunAt: next.toISOString(),
        status: "pending" as const,
      };
    });

    await logger.info("Scheduler initialized", {
      tasksCount: this.tasks.length,
      timezone: config.schedule.timezone,
      postsPerDay: config.schedule.postsPerDay,
    });
  }

  startWorker(intervalMs = 30_000): void {
    if (this.intervalId) return;

    const global = globalThis as typeof globalThis & { [globalWorkerKey]?: ReturnType<typeof setInterval> };
    if (global[globalWorkerKey]) {
      this.intervalId = global[globalWorkerKey];
      return;
    }

    this.intervalId = setInterval(() => {
      void this.tick().catch(async (error) => {
        const message = error instanceof Error ? error.message : "Scheduler tick failed";
        await logger.error("Scheduler tick error", { error: message });
      });
    }, intervalMs);

    global[globalWorkerKey] = this.intervalId;
    void logger.info("Scheduler worker started", { intervalMs });
  }

  stopWorker(): void {
    const global = globalThis as typeof globalThis & { [globalWorkerKey]?: ReturnType<typeof setInterval> | null };
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (global[globalWorkerKey]) {
      clearInterval(global[globalWorkerKey]!);
      global[globalWorkerKey] = null;
    }
  }

  async getUpcomingTasks(limit = 5): Promise<ScheduledTask[]> {
    const config = await loadAppConfig();
    const now = new Date();

    const tasks = config.schedule.slots.map((slot) => ({
      id: slot.id,
      slot,
      nextRunAt: computeNextRunMexico(slot, now).toISOString(),
      status: "pending" as const,
    }));

    return [...tasks]
      .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime())
      .slice(0, limit);
  }

  private async triggerSlot(
    slot: ScheduleSlot,
    reviewType: ScheduleSlot["reviewType"],
    key: string,
  ): Promise<void> {
    if (await isSlotExecuted(key)) return;

    await markSlotExecuted(key, slot.id);
    await enqueueTask({
      type: "generate_review",
      projectId: slot.projectId,
      reviewId: null,
      phase: "generating",
      payload: { slotId: slot.id, reviewType },
      scheduledAt: new Date().toISOString(),
    });

    await logger.info("Schedule slot triggered", {
      slotId: slot.id,
      projectId: slot.projectId,
      reviewType,
      slotKey: key,
    });
  }

  private async checkScheduleSlots(): Promise<void> {
    const config = await loadAppConfig();
    const runtime = getRuntimeManager();
    const state = await runtime.getState();
    if (state.status !== "running") return;

    const dateKey = getMexicoDateKey();

    for (const slot of config.schedule.slots) {
      if (!isMexicoSlotDue(slot.hour, slot.minute)) continue;
      const key = `daily:${slot.id}:${dateKey}`;
      await this.triggerSlot(slot, slot.reviewType, key);
    }

    const weekly = config.schedule.weeklyUniqueCircle;
    const parts = getMexicoCityParts();
    if (
      parts.dayOfWeek === weekly.dayOfWeek &&
      isMexicoSlotDue(weekly.hour, weekly.minute)
    ) {
      const weekKey = getMexicoWeekKey();
      const uniqueKey = `weekly:unique_circle:${weekKey}`;
      if (!(await isSlotExecuted(uniqueKey))) {
        const projects = config.projects.projects.map((p) => p.id);
        const projectId = projects[parts.day % projects.length] ?? projects[0]!;
        await markSlotExecuted(uniqueKey, "unique_circle");
        await enqueueTask({
          type: "generate_review",
          projectId,
          reviewId: null,
          phase: "generating",
          payload: { reviewType: "unique_circle", weekly: true },
          scheduledAt: new Date().toISOString(),
        });
        await logger.info("Weekly unique_circle triggered", { projectId, weekKey });
      }
    }
  }

  private async processQueue(): Promise<void> {
    const runtime = getRuntimeManager();
    const state = await runtime.getState();
    if (state.status !== "running") return;

    const pending = await getPendingTasks(3);
    const pipeline = getReviewPipeline();

    for (const task of pending) {
      try {
        await markTaskRunning(task.id);
        await pipeline.executeTask(task);
        await markTaskCompleted(task.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Task failed";
        await markTaskFailed(task.id, message);
        await logger.error("Task execution failed", { taskId: task.id, error: message });
      }
    }
  }

  async tick(): Promise<void> {
    const runtime = getRuntimeManager();
    const state = await runtime.getState();
    if (state.status !== "running") return;

    await this.checkScheduleSlots();
    await this.processQueue();
  }

  async triggerNow(projectId: string, reviewType: "small" | "big" | "unique_circle" = "big"): Promise<string> {
    return enqueueTask({
      type: "generate_review",
      projectId,
      reviewId: null,
      phase: "generating",
      payload: { reviewType, manual: true },
      scheduledAt: new Date().toISOString(),
    });
  }

  getStatus(): { initialized: boolean; tasksCount: number; workerRunning: boolean } {
    return {
      initialized: this.tasks.length > 0,
      tasksCount: this.tasks.length,
      workerRunning: this.intervalId !== null,
    };
  }
}

let instance: Scheduler | null = null;

export function getScheduler(): Scheduler {
  if (!instance) instance = new Scheduler();
  return instance;
}
