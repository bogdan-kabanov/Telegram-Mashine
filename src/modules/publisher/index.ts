import { randomUUID } from "crypto";
import { existsSync, statSync } from "fs";
import path from "path";

import { enqueueTask, saveReviewToDb } from "@/lib/db/reviews";
import { getEnv } from "@/lib/schemas/env";
import { createLogger, getRuntimeManager } from "@/lib/runtime/manager";
import { getTelegramClient } from "@/lib/telegram/client";
import { getFileStore } from "@/lib/storage/file-store";
import { getMexicoWeekKey } from "@/lib/timezone";
import { markWeeklyCirclePinned, markWeeklyCircleUsed } from "@/lib/weekly-circle";
import { hasLiveMedia, usesTwoPhaseReview } from "@/lib/publisher/rules";
import { reviewPackageSchema, type ReviewPackage } from "@/lib/schemas";
import type { ProjectConfig } from "@/lib/schemas/projects";

export { hasLiveMedia, usesTwoPhaseReview } from "@/lib/publisher/rules";

const logger = createLogger("publisher");

export class Publisher {
  private readonly store = getFileStore();
  private readonly client = getTelegramClient();

  private resolveFile(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  }

  private isValidMediaFile(filePath: string, minBytes = 512): boolean {
    const resolved = this.resolveFile(filePath);
    if (!existsSync(resolved)) return false;
    if (resolved.includes(".gitkeep")) return false;
    try {
      return statSync(resolved).size >= minBytes;
    } catch {
      return false;
    }
  }

  private filterValidFiles(filePaths: string[]): string[] {
    return filePaths.filter((p) => this.isValidMediaFile(p));
  }

  private async sendVideoNoteIfValid(
    chatId: string,
    filePath: string,
    reviewId: string,
    options?: { pin?: boolean; projectId?: string },
  ): Promise<number | null> {
    if (!this.isValidMediaFile(filePath, 1024)) {
      await logger.warn("Skipping invalid video note file", { reviewId, filePath });
      return null;
    }
    try {
      const message = await this.client.sendVideoNoteFile({
        chatId,
        filePath: this.resolveFile(filePath),
      });

      if (options?.pin && message.message_id) {
        try {
          await this.client.pinChatMessage({
            chatId,
            messageId: message.message_id,
            disableNotification: true,
          });
          await markWeeklyCircleUsed({
            mediaPath: filePath,
            projectId: options.projectId ?? "unknown",
            weekKey: getMexicoWeekKey(),
            messageId: message.message_id,
          });
          await markWeeklyCirclePinned(filePath, message.message_id);
          await logger.info("Weekly circle pinned", {
            reviewId,
            messageId: message.message_id,
            filePath,
          });
        } catch (pinError) {
          await logger.warn("Pin video note failed", {
            reviewId,
            error: pinError instanceof Error ? pinError.message : "unknown",
          });
          await markWeeklyCircleUsed({
            mediaPath: filePath,
            projectId: options.projectId ?? "unknown",
            weekKey: getMexicoWeekKey(),
            messageId: message.message_id,
          });
        }
      }

      return message.message_id;
    } catch (error) {
      await logger.warn("Video note publish failed, skipping", {
        reviewId,
        error: error instanceof Error ? error.message : "unknown",
      });
      return null;
    }
  }

  async publishPhase1(review: ReviewPackage, project: ProjectConfig): Promise<void> {
    const runtime = getRuntimeManager();
    const state = await runtime.getState();

    if (state.status !== "running") {
      throw new Error("Bot is not running");
    }

    const env = getEnv();
    const screenshots = this.filterValidFiles(review.screenshots.slice(0, 4).map((p) => this.resolveFile(p)));

    if (screenshots.length === 0) {
      throw new Error("No valid screenshots to publish");
    }

    await logger.info("Publishing phase 1", {
      reviewId: review.id,
      screenshotsCount: screenshots.length,
      channelId: env.TELEGRAM_PUBLISH_CHANNEL_ID,
    });

    await runtime.updateState({ currentPhase: "phase_1" });

    const caption = `${project.managerHandle} · ${review.clientName}`;
    await this.client.sendMediaGroupFiles({
      chatId: env.TELEGRAM_PUBLISH_CHANNEL_ID,
      filePaths: screenshots,
      caption,
    });

    await logger.info("Phase 1 published", { reviewId: review.id });
  }

  async publishPhase2(review: ReviewPackage, project: ProjectConfig): Promise<void> {
    const runtime = getRuntimeManager();
    const env = getEnv();

    await logger.info("Publishing phase 2", {
      reviewId: review.id,
      totalScreenshots: review.screenshots.length,
      mediaCount: review.media.length,
    });

    await runtime.updateState({ currentPhase: "phase_2" });

    // TZ §3.1 — full review: all screens (incl. first 4) + media
    const allScreens = this.filterValidFiles(review.screenshots.map((p) => this.resolveFile(p)));
    if (allScreens.length > 0) {
      // Telegram media groups max 10
      for (let i = 0; i < allScreens.length; i += 10) {
        const chunk = allScreens.slice(i, i + 10);
        await this.client.sendMediaGroupFiles({
          chatId: env.TELEGRAM_PUBLISH_CHANNEL_ID,
          filePaths: chunk,
          ...(i === 0 ? { caption: `${project.managerHandle} · reseña completa` } : {}),
        });
      }
    }

    if (!hasLiveMedia(review)) {
      await logger.warn("Full review missing live media (photo/circle/video)", {
        reviewId: review.id,
      });
    }

    const videoNote = review.media.find((m) => m.type === "video_note");
    if (videoNote) {
      await this.sendVideoNoteIfValid(env.TELEGRAM_PUBLISH_CHANNEL_ID, videoNote.path, review.id, {
        pin: review.pinVideoNote === true,
        projectId: review.projectId,
      });
    }

    const updated: ReviewPackage = {
      ...review,
      phase: "complete",
      publishedAt: new Date().toISOString(),
    };

    await this.saveReviewPackage(updated);
    await saveReviewToDb(updated);
    await runtime.incrementPublished();
    await runtime.updateState({ currentPhase: "idle" });

    await logger.info("Phase 2 published", { reviewId: review.id });
  }

  async publishReview(review: ReviewPackage, project: ProjectConfig): Promise<void> {
    if (!usesTwoPhaseReview(project)) {
      const env = getEnv();
      const screenshots = this.filterValidFiles(review.screenshots.map((p) => this.resolveFile(p)));
      if (screenshots.length === 0) {
        throw new Error("No valid screenshots to publish");
      }

      for (let i = 0; i < screenshots.length; i += 10) {
        const chunk = screenshots.slice(i, i + 10);
        await this.client.sendMediaGroupFiles({
          chatId: env.TELEGRAM_PUBLISH_CHANNEL_ID,
          filePaths: chunk,
          ...(i === 0 ? { caption: `${project.managerHandle} · ${review.clientName}` } : {}),
        });
      }

      if (review.reviewType !== "small" && !hasLiveMedia(review)) {
        await logger.warn("Full review missing live media (photo/circle/video)", {
          reviewId: review.id,
        });
      }

      const videoNote = review.media.find((m) => m.type === "video_note");
      if (videoNote) {
        await this.sendVideoNoteIfValid(env.TELEGRAM_PUBLISH_CHANNEL_ID, videoNote.path, review.id, {
          pin: review.pinVideoNote === true,
          projectId: review.projectId,
        });
      }

      const updated: ReviewPackage = {
        ...review,
        phase: "complete",
        publishedAt: new Date().toISOString(),
      };
      await this.saveReviewPackage(updated);
      await saveReviewToDb(updated);
      await getRuntimeManager().incrementPublished();
      return;
    }

    await this.publishPhase1(review, project);

    const delayMinutes = project.phaseDelayMinutes ?? 90;
    const scheduledAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();

    await enqueueTask({
      type: "publish_phase_2",
      projectId: review.projectId,
      reviewId: review.id,
      phase: "phase_2",
      payload: { reviewId: review.id },
      scheduledAt,
    });

    await logger.info("Phase 2 scheduled", {
      reviewId: review.id,
      scheduledAt,
      delayMinutes,
    });
  }

  async saveReviewPackage(review: ReviewPackage): Promise<void> {
    reviewPackageSchema.parse(review);
    await this.store.writeJson(`reviews/${review.id}.json`, review);
    await logger.info("Review package saved", { reviewId: review.id, phase: review.phase });
  }

  createEmptyPackage(params: {
    projectId: string;
    scenarioId: string;
    amountPackId: string;
    clientName: string;
    reviewType?: ReviewPackage["reviewType"];
    pinVideoNote?: boolean;
  }): ReviewPackage {
    return reviewPackageSchema.parse({
      id: randomUUID(),
      projectId: params.projectId,
      scenarioId: params.scenarioId,
      amountPackId: params.amountPackId,
      clientName: params.clientName,
      createdAt: new Date().toISOString(),
      phase: "partial",
      reviewType: params.reviewType ?? "big",
      pinVideoNote: params.pinVideoNote ?? false,
      screenshots: [],
      media: [],
      publishedAt: null,
    });
  }
}

let instance: Publisher | null = null;

export function getPublisher(): Publisher {
  if (!instance) instance = new Publisher();
  return instance;
}
