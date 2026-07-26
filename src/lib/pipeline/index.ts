import { randomUUID } from "crypto";

import { loadAppConfig } from "@/lib/config/loader";
import { resolveClientPhoto } from "@/lib/client-photos";
import { getReviewFromDb, saveReviewToDb } from "@/lib/db/reviews";
import { formatMexicoDateTime } from "@/lib/timezone";
import { createLogger, getRuntimeManager } from "@/lib/runtime/manager";
import type { ReviewPackage } from "@/lib/schemas";
import { pickUniqueWeeklyCircle } from "@/lib/weekly-circle";
import { pickSequentialBets } from "@/lib/bet-cycle";
import { getChatRenderer } from "@/modules/chat-renderer";
import { getDialogGenerator } from "@/modules/dialog-generator";
import { getMediaHandler } from "@/modules/media-handler";
import { getPublisher } from "@/modules/publisher";

const logger = createLogger("pipeline");

export type PipelineProgressEvent = {
  step: number;
  total: number;
  id: string;
  label: string;
  detail?: string;
};

export type PipelineProgressHandler = (event: PipelineProgressEvent) => void | Promise<void>;

export interface GenerateReviewParams {
  projectId: string;
  reviewType?: "small" | "big" | "unique_circle";
  slotId?: string;
  autoPublish?: boolean;
  pinVideoNote?: boolean;
  onProgress?: PipelineProgressHandler;
}

export interface GenerateReviewResult {
  reviewId: string;
  screenshots: string[];
  phase: ReviewPackage["phase"];
}

const PROGRESS_TOTAL = 6;

async function report(
  onProgress: PipelineProgressHandler | undefined,
  step: number,
  id: string,
  label: string,
  detail?: string,
): Promise<void> {
  if (!onProgress) return;
  await onProgress({
    step,
    total: PROGRESS_TOTAL,
    id,
    label,
    ...(detail ? { detail } : {}),
  });
}

export class ReviewPipeline {
  async generateReview(params: GenerateReviewParams): Promise<GenerateReviewResult> {
    const runtime = getRuntimeManager();
    const prevStatus = (await runtime.getState()).status;
    await runtime.updateState({ currentPhase: "generating" });

    try {
      const config = await loadAppConfig();
      const project = config.projects.projects.find((p) => p.id === params.projectId);
      if (!project) throw new Error(`Project not found: ${params.projectId}`);

      const reviewType = params.reviewType ?? "big";
      const pinVideoNote = params.pinVideoNote === true || reviewType === "unique_circle";
      const progress = params.onProgress;

      await report(progress, 1, "dialog", "Генерация диалога", "OpenAI пишет переписку клиент ↔ менеджер…");
      const dialog = await getDialogGenerator().generate({
        projectId: params.projectId,
        reviewType,
      });

      const mediaHandler = getMediaHandler();
      const depositBank = config.banks.depositBanks.find((b) => b.id === dialog.depositBankId);
      const payoutBank = config.banks.payoutBanks.find((b) => b.id === dialog.payoutBankId);
      const mxNow = formatMexicoDateTime();
      const reviewId = randomUUID();

      await report(progress, 2, "media", "Подбор медиа", "Библиотека или ИИ (ставки / условия / стикер)…");
      const videoNotePromise = pinVideoNote
        ? pickUniqueWeeklyCircle(params.projectId)
        : mediaHandler.pickRandomFromDb("video_note", params.projectId);

      const [conditions, sequentialBets, videoNote, sticker] = await Promise.all([
        mediaHandler.resolveProjectImage("conditions", {
          projectId: params.projectId,
          projectName: project.name,
          locale: project.locale,
          currency: project.currency,
        }),
        pickSequentialBets({
          projectId: params.projectId,
          count: 3,
          reviewId,
        }),
        videoNotePromise,
        mediaHandler.resolveProjectImage("sticker", {
          projectId: params.projectId,
          projectName: project.name,
        }),
      ]);

      // Fill missing slots via AI / random when the ordered pool is thin
      const betSlots: Array<{ path?: string } | null> = [
        sequentialBets[0] ?? null,
        sequentialBets[1] ?? null,
        sequentialBets[2] ?? null,
      ];
      for (let i = 0; i < 3; i++) {
        if (betSlots[i]?.path) continue;
        betSlots[i] = await mediaHandler.resolveProjectImage("bet", {
          projectId: params.projectId,
          projectName: project.name,
          locale: project.locale,
          currency: project.currency,
          reviewId,
        });
      }
      const [bet1, bet2, bet3] = betSlots;

      await report(progress, 3, "photo", "Фото клиента", "Пул медиатеки или генерация ИИ…");
      // Bias AI photo by early client problem texts (hospital / illness proof).
      const storyHint = dialog.messages
        .filter((m) => m.role === "client" && m.type === "text")
        .slice(0, 5)
        .map((m) => m.content)
        .join(" ")
        .slice(0, 400);
      const uniquePhoto = await resolveClientPhoto({
        projectId: params.projectId,
        reviewId,
        clientName: dialog.clientName,
        ...(storyHint ? { hint: storyHint } : {}),
        locale: project.locale,
      });

      if (!uniquePhoto) {
        await logger.warn(
          "No client photo — upload story_photo assets or set AI_CLIENT_PHOTOS=fallback/always with OPENAI_API_KEY",
          { projectId: params.projectId },
        );
      } else if (uniquePhoto.source === "ai") {
        await logger.info("Using AI-generated client photo", {
          projectId: params.projectId,
          reviewId,
          path: uniquePhoto.path,
        });
      }

      await report(
        progress,
        4,
        "slips",
        "Генерация чеков",
        "ИИ правит шаблоны банка — обычно 30–90 секунд…",
      );
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
          accountLastDigits: dialog.accountLastDigits,
          project,
          ...(project.capturaStyle ? { style: project.capturaStyle } : {}),
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
          project,
          ...(project.receiptStyle ? { style: project.receiptStyle } : {}),
        }),
      ]);

      if (captura.source === "ai" || receipt.source === "ai") {
        await logger.info("Bank slips generated", {
          reviewId,
          captura: captura.source,
          receipt: receipt.source,
        });
      }

      const publisher = getPublisher();
      let review = publisher.createEmptyPackage({
        projectId: params.projectId,
        scenarioId: dialog.scenarioId,
        amountPackId: dialog.amountPackId,
        clientName: dialog.clientName,
        reviewType,
        pinVideoNote,
      });
      review = { ...review, id: reviewId };

      await report(progress, 5, "render", "Рендер скриншотов", "Playwright снимает экраны чата…");
      const renderResult = await getChatRenderer().renderDialog({
        dialog,
        project,
        reviewId,
        mediaAssets: {
          sticker: sticker?.path ?? null,
          storyPhoto: uniquePhoto?.path ?? null,
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
      if (uniquePhoto?.path && mediaHandler.isValidFile(uniquePhoto.path)) {
        media.push({ type: "photo", path: uniquePhoto.path });
      }
      if (videoNote?.path && mediaHandler.isValidFile(videoNote.path)) {
        media.push({ type: "video_note", path: videoNote.path });
      } else if (reviewType !== "small") {
        await logger.warn("No video note available for full review", {
          reviewId,
          projectId: params.projectId,
          reviewType,
        });
      }

      review = {
        ...review,
        screenshots: renderResult.screenshots,
        media,
        phase: "partial",
      };

      await report(progress, 6, "save", "Сохранение пакета", `${renderResult.screenshots.length} скринов…`);
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

      // Preview must not flip bot into "running"; scheduled publish does.
      const nextStatus =
        params.autoPublish === false
          ? prevStatus === "error"
            ? "stopped"
            : prevStatus
          : "running";
      await runtime.updateState({ currentPhase: "idle", lastError: null, status: nextStatus });
      await logger.info("Review generated", {
        reviewId,
        projectId: params.projectId,
        screenshots: review.screenshots.length,
        reviewType,
        slotId: params.slotId,
        pinVideoNote,
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
        pinVideoNote: task.payload.pinVideoNote === true,
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
