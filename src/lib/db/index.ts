import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";

import * as schema from "./schema";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getDbPath(): string {
  const dataDir = process.env.DATA_DIR ?? "./data";
  const resolved = path.resolve(dataDir);
  mkdirSync(resolved, { recursive: true });
  return path.join(resolved, "app.db");
}

function initTables(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS runtime_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'stopped',
      current_phase TEXT NOT NULL DEFAULT 'idle',
      last_started_at TEXT,
      last_paused_at TEXT,
      last_error TEXT,
      total_reviews_generated INTEGER NOT NULL DEFAULT 0,
      total_reviews_published INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL,
      module TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS task_queue (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      project_id TEXT NOT NULL,
      review_id TEXT,
      phase TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS review_packages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      amount_pack_id TEXT NOT NULL,
      client_name TEXT NOT NULL,
      client_avatar_path TEXT,
      phase TEXT NOT NULL,
      screenshots TEXT NOT NULL,
      media TEXT NOT NULL,
      published_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      type TEXT NOT NULL,
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      mime_type TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS used_combinations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      legend_id TEXT NOT NULL,
      amount_pack_id TEXT NOT NULL,
      client_name TEXT NOT NULL,
      used_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS config_uploads (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS executed_slots (
      id TEXT PRIMARY KEY,
      slot_key TEXT NOT NULL UNIQUE,
      slot_id TEXT NOT NULL,
      executed_at TEXT NOT NULL
    );
  `);

  const row = sqlite.prepare("SELECT COUNT(*) as count FROM runtime_state").get() as { count: number };
  if (row.count === 0) {
    sqlite
      .prepare(
        `INSERT INTO runtime_state (status, current_phase, total_reviews_generated, total_reviews_published, updated_at)
         VALUES ('stopped', 'idle', 0, 0, ?)`,
      )
      .run(new Date().toISOString());
  }
}

export function getDb() {
  if (dbInstance) return dbInstance;

  const dbPath = getDbPath();
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  initTables(sqlite);
  dbInstance = drizzle(sqlite, { schema });
  return dbInstance;
}
