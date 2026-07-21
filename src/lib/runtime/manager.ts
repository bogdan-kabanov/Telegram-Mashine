import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { logs, runtimeState, taskQueue } from "@/lib/db/schema";
import { logEntrySchema, runtimeStateSchema, type LogEntry, type RuntimeState } from "@/lib/schemas";

const DEFAULT_STATE: RuntimeState = {
  status: "stopped",
  lastStartedAt: null,
  lastPausedAt: null,
  lastError: null,
  totalReviewsGenerated: 0,
  totalReviewsPublished: 0,
  currentPhase: "idle",
  updatedAt: new Date().toISOString(),
};

export class Logger {
  private readonly module: string;

  constructor(module: string) {
    this.module = module;
  }

  private async write(level: LogEntry["level"], message: string, metadata?: Record<string, unknown>): Promise<void> {
    const entry: LogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      module: this.module,
      message,
      ...(metadata ? { metadata } : {}),
    };

    logEntrySchema.parse(entry);
    const db = getDb();

    await db.insert(logs).values({
      id: entry.id,
      timestamp: entry.timestamp,
      level: entry.level,
      module: entry.module,
      message: entry.message,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });

    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${this.module}]`;
    if (level === "error") {
      console.error(prefix, message, metadata ?? "");
    } else {
      console.log(prefix, message, metadata ?? "");
    }
  }

  info(message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.write("info", message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.write("warn", message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.write("error", message, metadata);
  }

  debug(message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.write("debug", message, metadata);
  }
}

export function createLogger(module: string): Logger {
  return new Logger(module);
}

export class RuntimeManager {
  private readonly logger = createLogger("runtime");

  private async fetchStateRow() {
    const db = getDb();
    const rows = await db.select().from(runtimeState).limit(1);
    return rows[0];
  }

  async getState(): Promise<RuntimeState> {
    const row = await this.fetchStateRow();
    if (!row) return DEFAULT_STATE;

    return runtimeStateSchema.parse({
      status: row.status,
      lastStartedAt: row.lastStartedAt,
      lastPausedAt: row.lastPausedAt,
      lastError: row.lastError,
      totalReviewsGenerated: row.totalReviewsGenerated,
      totalReviewsPublished: row.totalReviewsPublished,
      currentPhase: row.currentPhase,
      updatedAt: row.updatedAt,
    });
  }

  async updateState(partial: Partial<RuntimeState>): Promise<RuntimeState> {
    const current = await this.getState();
    const next: RuntimeState = runtimeStateSchema.parse({
      ...current,
      ...partial,
      updatedAt: new Date().toISOString(),
    });

    const db = getDb();
    const row = await this.fetchStateRow();
    if (row) {
      await db
        .update(runtimeState)
        .set({
          status: next.status,
          currentPhase: next.currentPhase,
          lastStartedAt: next.lastStartedAt,
          lastPausedAt: next.lastPausedAt,
          lastError: next.lastError,
          totalReviewsGenerated: next.totalReviewsGenerated,
          totalReviewsPublished: next.totalReviewsPublished,
          updatedAt: next.updatedAt,
        })
        .where(eq(runtimeState.id, row.id));
    }

    await this.logger.info("Runtime state updated", { status: next.status, phase: next.currentPhase });
    return next;
  }

  async start(): Promise<RuntimeState> {
    return this.updateState({
      status: "running",
      lastStartedAt: new Date().toISOString(),
      lastError: null,
      currentPhase: "idle",
    });
  }

  async pause(): Promise<RuntimeState> {
    return this.updateState({
      status: "paused",
      lastPausedAt: new Date().toISOString(),
    });
  }

  async resume(): Promise<RuntimeState> {
    return this.updateState({
      status: "running",
      lastPausedAt: null,
    });
  }

  async stop(): Promise<RuntimeState> {
    return this.updateState({
      status: "stopped",
      currentPhase: "idle",
    });
  }

  async setError(error: string): Promise<RuntimeState> {
    return this.updateState({
      status: "error",
      lastError: error,
    });
  }

  async incrementGenerated(): Promise<RuntimeState> {
    const state = await this.getState();
    return this.updateState({
      totalReviewsGenerated: state.totalReviewsGenerated + 1,
    });
  }

  async incrementPublished(): Promise<RuntimeState> {
    const state = await this.getState();
    return this.updateState({
      totalReviewsPublished: state.totalReviewsPublished + 1,
    });
  }

  async getRecentLogs(limit = 20): Promise<LogEntry[]> {
    const db = getDb();
    const rows = await db.select().from(logs).orderBy(desc(logs.timestamp)).limit(limit);

    return rows.map((row) =>
      logEntrySchema.parse({
        id: row.id,
        timestamp: row.timestamp,
        level: row.level,
        module: row.module,
        message: row.message,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      }),
    );
  }

  async getQueue(limit = 10) {
    const db = getDb();
    return db.select().from(taskQueue).orderBy(desc(taskQueue.scheduledAt)).limit(limit);
  }
}

let runtimeInstance: RuntimeManager | null = null;

export function getRuntimeManager(): RuntimeManager {
  if (!runtimeInstance) {
    runtimeInstance = new RuntimeManager();
  }
  return runtimeInstance;
}
