import { randomUUID } from "crypto";
import { desc, eq, lte, and } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { executedSlots, reviewPackages, taskQueue } from "@/lib/db/schema";
import { reviewPackageSchema, type ReviewPackage } from "@/lib/schemas";

export interface QueueTask {
  id: string;
  type: string;
  projectId: string;
  reviewId: string | null;
  phase: string;
  status: string;
  payload: Record<string, unknown>;
  scheduledAt: string;
}

export async function isSlotExecuted(slotKey: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.select().from(executedSlots).where(eq(executedSlots.slotKey, slotKey)).limit(1);
  return rows.length > 0;
}

export async function markSlotExecuted(slotKey: string, slotId: string): Promise<void> {
  const db = getDb();
  await db
    .insert(executedSlots)
    .values({
      id: randomUUID(),
      slotKey,
      slotId,
      executedAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
}

export async function enqueueTask(task: Omit<QueueTask, "id" | "status"> & { status?: string }): Promise<string> {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(taskQueue).values({
    id,
    type: task.type,
    projectId: task.projectId,
    reviewId: task.reviewId,
    phase: task.phase,
    status: task.status ?? "pending",
    payload: JSON.stringify(task.payload),
    scheduledAt: task.scheduledAt,
    createdAt: now,
  });

  return id;
}

export async function getPendingTasks(limit = 5): Promise<QueueTask[]> {
  const db = getDb();
  const now = new Date().toISOString();

  const rows = await db
    .select()
    .from(taskQueue)
    .where(and(eq(taskQueue.status, "pending"), lte(taskQueue.scheduledAt, now)))
    .orderBy(taskQueue.scheduledAt)
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    projectId: row.projectId,
    reviewId: row.reviewId,
    phase: row.phase,
    status: row.status,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    scheduledAt: row.scheduledAt,
  }));
}

export async function markTaskRunning(taskId: string): Promise<void> {
  const db = getDb();
  await db
    .update(taskQueue)
    .set({ status: "running", startedAt: new Date().toISOString() })
    .where(eq(taskQueue.id, taskId));
}

export async function markTaskCompleted(taskId: string): Promise<void> {
  const db = getDb();
  await db
    .update(taskQueue)
    .set({ status: "completed", completedAt: new Date().toISOString() })
    .where(eq(taskQueue.id, taskId));
}

export async function markTaskFailed(taskId: string, error: string): Promise<void> {
  const db = getDb();
  await db
    .update(taskQueue)
    .set({ status: "failed", error, completedAt: new Date().toISOString() })
    .where(eq(taskQueue.id, taskId));
}

export async function saveReviewToDb(review: ReviewPackage, clientAvatarPath?: string | null): Promise<void> {
  reviewPackageSchema.parse(review);
  const db = getDb();

  await db
    .insert(reviewPackages)
    .values({
      id: review.id,
      projectId: review.projectId,
      scenarioId: review.scenarioId,
      amountPackId: review.amountPackId,
      clientName: review.clientName,
      clientAvatarPath: clientAvatarPath ?? null,
      phase: review.phase,
      reviewType: review.reviewType ?? "big",
      pinVideoNote: review.pinVideoNote ? 1 : 0,
      screenshots: JSON.stringify(review.screenshots),
      media: JSON.stringify(review.media),
      publishedAt: review.publishedAt,
      createdAt: review.createdAt,
    })
    .onConflictDoUpdate({
      target: reviewPackages.id,
      set: {
        phase: review.phase,
        reviewType: review.reviewType ?? "big",
        pinVideoNote: review.pinVideoNote ? 1 : 0,
        screenshots: JSON.stringify(review.screenshots),
        media: JSON.stringify(review.media),
        publishedAt: review.publishedAt,
      },
    });
}

function mapReviewRow(row: {
  id: string;
  projectId: string;
  scenarioId: string;
  amountPackId: string;
  clientName: string;
  createdAt: string;
  phase: string;
  reviewType?: string | null;
  pinVideoNote?: number | null;
  screenshots: string;
  media: string;
  publishedAt: string | null;
}): ReviewPackage {
  return reviewPackageSchema.parse({
    id: row.id,
    projectId: row.projectId,
    scenarioId: row.scenarioId,
    amountPackId: row.amountPackId,
    clientName: row.clientName,
    createdAt: row.createdAt,
    phase: row.phase,
    reviewType: row.reviewType ?? "big",
    pinVideoNote: Boolean(row.pinVideoNote),
    screenshots: JSON.parse(row.screenshots),
    media: JSON.parse(row.media),
    publishedAt: row.publishedAt,
  });
}

export async function getReviewFromDb(reviewId: string): Promise<ReviewPackage | null> {
  const db = getDb();
  const rows = await db.select().from(reviewPackages).where(eq(reviewPackages.id, reviewId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return mapReviewRow(row);
}

export async function getRecentReviewsByProject(projectId: string, limit = 5): Promise<ReviewPackage[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(reviewPackages)
    .where(eq(reviewPackages.projectId, projectId))
    .orderBy(desc(reviewPackages.createdAt))
    .limit(limit);

  return rows.map(mapReviewRow);
}

export async function getRecentReviews(limit = 10): Promise<ReviewPackage[]> {
  const db = getDb();
  const rows = await db.select().from(reviewPackages).orderBy(desc(reviewPackages.createdAt)).limit(limit);

  return rows.map(mapReviewRow);
}
