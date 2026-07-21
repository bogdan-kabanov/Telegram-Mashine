import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const runtimeState = sqliteTable("runtime_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status").notNull().default("stopped"),
  currentPhase: text("current_phase").notNull().default("idle"),
  lastStartedAt: text("last_started_at"),
  lastPausedAt: text("last_paused_at"),
  lastError: text("last_error"),
  totalReviewsGenerated: integer("total_reviews_generated").notNull().default(0),
  totalReviewsPublished: integer("total_reviews_published").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const logs = sqliteTable("logs", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  level: text("level").notNull(),
  module: text("module").notNull(),
  message: text("message").notNull(),
  metadata: text("metadata"),
});

export const taskQueue = sqliteTable("task_queue", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  projectId: text("project_id").notNull(),
  reviewId: text("review_id"),
  phase: text("phase").notNull(),
  status: text("status").notNull().default("pending"),
  payload: text("payload").notNull(),
  scheduledAt: text("scheduled_at").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
});

export const reviewPackages = sqliteTable("review_packages", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  scenarioId: text("scenario_id").notNull(),
  amountPackId: text("amount_pack_id").notNull(),
  clientName: text("client_name").notNull(),
  clientAvatarPath: text("client_avatar_path"),
  phase: text("phase").notNull(),
  screenshots: text("screenshots").notNull(),
  media: text("media").notNull(),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull(),
});

export const mediaAssets = sqliteTable("media_assets", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  type: text("type").notNull(),
  filename: text("filename").notNull(),
  path: text("path").notNull(),
  mimeType: text("mime_type"),
  createdAt: text("created_at").notNull(),
});

export const usedCombinations = sqliteTable("used_combinations", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  legendId: text("legend_id").notNull(),
  amountPackId: text("amount_pack_id").notNull(),
  clientName: text("client_name").notNull(),
  usedAt: text("used_at").notNull(),
});

export const configUploads = sqliteTable("config_uploads", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  filename: text("filename").notNull(),
  path: text("path").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
});

export const executedSlots = sqliteTable("executed_slots", {
  id: text("id").primaryKey(),
  slotKey: text("slot_key").notNull().unique(),
  slotId: text("slot_id").notNull(),
  executedAt: text("executed_at").notNull(),
});
