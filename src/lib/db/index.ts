import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";

import * as schema from "./schema";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqliteInstance: Database.Database | null = null;

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
      review_type TEXT NOT NULL DEFAULT 'big',
      pin_video_note INTEGER NOT NULL DEFAULT 0,
      screenshots TEXT NOT NULL,
      media TEXT NOT NULL,
      dialog TEXT,
      render_media TEXT,
      dialog_translations TEXT,
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

    CREATE TABLE IF NOT EXISTS used_account_digits (
      digits TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      review_id TEXT,
      used_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS used_weekly_circles (
      id TEXT PRIMARY KEY,
      media_path TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      week_key TEXT NOT NULL,
      message_id TEXT,
      pinned_at TEXT,
      used_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS used_client_photos (
      id TEXT PRIMARY KEY,
      media_path TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      review_id TEXT,
      used_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS used_bets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      media_path TEXT NOT NULL,
      review_id TEXT,
      used_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_used_bets_project_used
      ON used_bets (project_id, used_at);
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

  // Migrations for existing DBs
  const reviewCols = sqlite.prepare("PRAGMA table_info(review_packages)").all() as Array<{ name: string }>;
  const reviewColNames = new Set(reviewCols.map((c) => c.name));
  if (!reviewColNames.has("review_type")) {
    sqlite.exec(`ALTER TABLE review_packages ADD COLUMN review_type TEXT NOT NULL DEFAULT 'big'`);
  }
  if (!reviewColNames.has("pin_video_note")) {
    sqlite.exec(`ALTER TABLE review_packages ADD COLUMN pin_video_note INTEGER NOT NULL DEFAULT 0`);
  }
  if (!reviewColNames.has("dialog")) {
    sqlite.exec(`ALTER TABLE review_packages ADD COLUMN dialog TEXT`);
  }
  if (!reviewColNames.has("render_media")) {
    sqlite.exec(`ALTER TABLE review_packages ADD COLUMN render_media TEXT`);
  }
  if (!reviewColNames.has("dialog_translations")) {
    sqlite.exec(`ALTER TABLE review_packages ADD COLUMN dialog_translations TEXT`);
  }
}

export function getDb() {
  if (dbInstance) return dbInstance;

  const dbPath = getDbPath();
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  initTables(sqlite);
  sqliteInstance = sqlite;
  dbInstance = drizzle(sqlite, { schema });
  return dbInstance;
}

/** Test helper — closes DB and clears singleton so DATA_DIR can change. */
export function resetDbForTests(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
  }
  sqliteInstance = null;
  dbInstance = null;
}
