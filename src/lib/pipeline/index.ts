import { randomUUID } from "crypto";

import { loadAppConfig } from "@/lib/config/loader";
import { getReviewFromDb, saveReviewToDb } from "@/lib/db/reviews";
import { formatMexicoDateTime } from "@/lib/timezone";
import { createLogger, getRuntimeManager } from "@/lib/runtime/manager";
import type { ReviewPackage } from "@/lib/schemas";
import { getChatRenderer } from "@/modules/chat-renderer";
import { getDialogGenerator } from "@/modules/dialog-generator";
import { getMediaHandler } from "@/modules/media-handler";
import { getPublisher } from "@/modules/publisher";

const logger = createLogger("pipeline");

export interface GenerateReviewParams {
  projectId: string;
  reviewType?: "small" | "big" | "unique_circle";
  slotId?: string;
  autoPublish?: boolean;
}

export interface GenerateReviewResult {
  reviewId: string;
  screenshots: string[];
  phase: ReviewPackage["phase"];
}

export class ReviewPipeline {
  async generateReview(params: GenerateReviewParams): Promise<GenerateReviewResult> {
    const runtime = getRuntimeManager();
    await runtime.updateState({ currentPhase: "generating" });

    try {
      const config = await loadAppConfig();
      const project = config.projects.projects.find((p) => p.id === params.projectId);
      if (!project) throw new Error(`Project not found: ${params.projectId}`);

      const dialog = await getDialogGenerator().generate({
        projectId: params.projectId,
        reviewType: params.reviewType ?? "big",
      });

      const mediaHandler = getMediaHandler();
      const depositBank = config.banks.depositBanks.find((b) => b.id === dialog.depositBankId);
      const payoutBank = config.banks.payoutBanks.find((b) => b.id === dialog.payoutBankId);
      const mxNow = formatMexicoDateTime();

      const [conditions, bet1, bet2, bet3, videoNote, sticker, storyPhoto] = await Promise.all([
        mediaHandler.pickRandomFromDb("conditions", params.projectId),
        mediaHandler.pickRandomFromDb("bet", params.projectId),
        mediaHandler.pickRandomFromDb("bet", params.projectId),
        mediaHandler.pickRandomFromDb("bet", params.projectId),
        mediaHandler.pickRandomFromDb("video_note", params.projectId),
        mediaHandler.pickSticker(params.projectId),
        mediaHandler.pickStoryPhoto(dialog.legendId),
      ]);

      const [captura, receipt] = await Promise.all([
        mediaHandler.generateCaptura({
          amount: dialog.deposit,
          currency: project.currency,
          senderName: dialog.clientName,
          recipientLabel: project.managerName,
          clabe: dialog.clabe,
          bankId: dialog.depositBankId,
          bankName: depositBank?.shortName ?? depositBank?.name ?? "Banco",
          date: mxNow.date,
          time: mxNow.time,
        }),
        mediaHandler.generateReceipt({
          amount: dialog.profitFinal,
          currency: project.currency,
          senderName: project.managerName,
          recipientName: dialog.clientName,
          bankId: dialog.payoutBankId,
          bankName: payoutBank?.shortName ?? payoutBank?.name ?? "Banco",
          accountLastDigits: dialog.accountLastDigits,
          date: mxNow.date,
          time: mxNow.time,
        }),
      ]);

      const reviewId = randomUUID();
      const publisher = getPublisher();
      let review = publisher.createEmptyPackage({
        projectId: params.projectId,
        scenarioId: dialog.scenarioId,
        amountPackId: dialog.amountPackId,
        clientName: dialog.clientName,
      });
      review = { ...review, id: reviewId };

      const renderResult = await getChatRenderer().renderDialog({
        dialog,
        project,
        reviewId,
        mediaAssets: {
          sticker: sticker?.path ?? null,
          storyPhoto: storyPhoto?.path ?? null,
          conditions: conditions?.path ?? project.conditionsImagePath ?? null,
          bet1: bet1?.path ?? null,
          bet2: bet2?.path ?? null,
          bet3: bet3?.path ?? null,
          receipt: receipt.path,
          captura: captura.path,
        },
      });

      const media: ReviewPackage["media"] = [];
      if (captura.path) media.push({ type: "receipt", path: captura.path });
      if (receipt.path) media.push({ type: "receipt", path: receipt.path });
      if (bet1?.path) media.push({ type: "bet", path: bet1.path });
      if (conditions?.path) media.push({ type: "conditions", path: conditions.path });
      if (videoNote?.path && mediaHandler.isValidFile(videoNote.path)) {
        media.push({ type: "video_note", path: videoNote.path });
      }

      review = {
        ...review,
        screenshots: renderResult.screenshots,
        media,
        phase: "partial",
      };

      await publisher.saveReviewPackage(review);
      await saveReviewToDb(review, renderResult.clientAvatarPath);
      await runtime.incrementGenerated();

      if (params.autoPublish !== false) {
        try {
          await getPublisher().publishReview(review, project);
        } catch (publishError) {
          const message = publishError instanceof Error ? publishError.message : "Publish failed";
          await logger.warn("Publish failed — review saved locally", {
            reviewId,
            error: message,
          });
        }
      }

      await runtime.updateState({ currentPhase: "idle", lastError: null, status: "running" });
      await logger.info("Review generated", {
        reviewId,
        projectId: params.projectId,
        screenshots: review.screenshots.length,
        reviewType: params.reviewType ?? "big",
        slotId: params.slotId,
      });

      return {
        reviewId,
        screenshots: review.screenshots,
        phase: review.phase,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown pipeline error";
      await runtime.setError(message);
      await runtime.updateState({ currentPhase: "idle" });
      throw error;
    }
  }

  async publishPhase2(reviewId: string): Promise<void> {
    const runtime = getRuntimeManager();
    try {
      const review = await getReviewFromDb(reviewId);
      if (!review) throw new Error(`Review not found: ${reviewId}`);

      const config = await loadAppConfig();
      const project = config.projects.projects.find((p) => p.id === review.projectId);
      if (!project) throw new Error(`Project not found: ${review.projectId}`);

      await getPublisher().publishPhase2(review, project);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Phase 2 publish failed";
      await logger.warn("Phase 2 publish failed", { reviewId, error: message });
      await runtime.updateState({ currentPhase: "idle", lastError: null, status: "running" });
    }
  }

  async executeTask(task: {
    id: string;
    type: string;
    projectId: string;
    reviewId: string | null;
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (task.type === "generate_review") {
      const slotId = task.payload.slotId as string | undefined;
      await this.generateReview({
        projectId: task.projectId,
        reviewType: (task.payload.reviewType as GenerateReviewParams["reviewType"]) ?? "big",
        ...(slotId ? { slotId } : {}),
      });
      return;
    }

    if (task.type === "publish_phase_2" && task.reviewId) {
      await this.publishPhase2(task.reviewId);
      return;
    }

    throw new Error(`Unknown task type: ${task.type}`);
  }
}

let instance: ReviewPipeline | null = null;

export function getReviewPipeline(): ReviewPipeline {
  if (!instance) instance = new ReviewPipeline();
  return instance;
}
