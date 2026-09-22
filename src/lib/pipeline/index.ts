import { randomUUID } from "crypto";

import { loadAppConfig } from "@/lib/config/loader";
import { resolveClientPhoto } from "@/lib/client-photos";
import { getReviewFromDb, saveReviewToDb } from "@/lib/db/reviews";
import { buildMessageClock } from "@/lib/format";
import { localeClockConfig } from "@/lib/i18n/locale-profile";
import { isStandaloneLegend, legendIdFromCircleTag } from "@/lib/legends/standalone";
import { createLogger, getRuntimeManager } from "@/lib/runtime/manager";
import type { ReviewPackage } from "@/lib/schemas";
import { resolveBetPackNumber } from "@/lib/schemas/amounts";
import { pickUniqueWeeklyCircle } from "@/lib/weekly-circle";
import type { CustomAmounts } from "@/lib/amounts/split-profit";
import { pickNextBetPack, pickBetPackByNumber } from "@/lib/bet-cycle";
import { stampProjectBetPack } from "@/lib/media/stamp-bets";
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
  /** Conversation clock (`now` = last bubble). */
  now?: Date;
  /** Per-screenshot timestamps (ISO). Applied when Playwright captures each slide. */
  slideTimes?: string[];
  /** Operator-selected amount pack (constructor). Aligns dialog + receipts + bet pack. */
  amountPackId?: string;
  /** Operator-defined profit split — random bet pack + OCR stamp. */
  customAmounts?: CustomAmounts;
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
      const mediaHandler = getMediaHandler();
      const reviewId = randomUUID();
      const amountPack =
        params.amountPackId != null
          ? config.amounts.packs.find((p) => p.id === params.amountPackId)
          : undefined;
      if (params.amountPackId && !amountPack) {
        throw new Error(`Пак сумм не найден: ${params.amountPackId}`);
      }
      if (amountPack?.projectId && amountPack.projectId !== params.projectId) {
        throw new Error("Этот пак сумм принадлежит другому проекту");
      }

      const requestedBetPack = amountPack ? resolveBetPackNumber(amountPack) : null;
      const useCustomAmounts = params.customAmounts != null;

      let betPackPick =
        useCustomAmounts
          ? await pickNextBetPack({
              projectId: params.projectId,
              reviewId,
              reuseDays: config.schedule.betReuseDays,
            })
          : requestedBetPack && requestedBetPack > 0
            ? await pickBetPackByNumber({
                projectId: params.projectId,
                packNumber: requestedBetPack,
                reviewId,
              })
            : await pickNextBetPack({
                projectId: params.projectId,
                reviewId,
                reuseDays: config.schedule.betReuseDays,
              });

      if (!betPackPick && requestedBetPack) {
        betPackPick = await pickNextBetPack({
          projectId: params.projectId,
          reviewId,
          reuseDays: config.schedule.betReuseDays,
        });
      }

      // Weekly unique_circle: pick circle first → dialog uses the same legend (or neutral standalone).
      let preselectedVideoNote: Awaited<ReturnType<typeof pickUniqueWeeklyCircle>> = null;
      let forcedLegendId: string | undefined;
      if (reviewType === "unique_circle") {
        await report(progress, 1, "media", "Подбор кружка", "Недельный уникальный кружок…");
        preselectedVideoNote = await pickUniqueWeeklyCircle(params.projectId);
        forcedLegendId = legendIdFromCircleTag(preselectedVideoNote?.legendId, project.locale);
        await report(
          progress,
          2,
          "dialog",
          "Генерация диалога",
          preselectedVideoNote?.legendId && preselectedVideoNote.legendId !== "standalone"
            ? `История «${preselectedVideoNote.legendId}» под кружок`
            : "Общая благодарность (standalone)",
        );
      } else {
        await report(progress, 1, "dialog", "Генерация диалога", "OpenAI пишет переписку клиент ↔ менеджер…");
      }

      const dialog = await getDialogGenerator().generate({
        projectId: params.projectId,
        reviewType,
        ...(params.amountPackId
          ? { amountPackId: params.amountPackId }
          : useCustomAmounts && params.customAmounts
            ? { customAmounts: params.customAmounts }
            : betPackPick
              ? { betPack: betPackPick.packNumber }
              : {}),
        ...(forcedLegendId ? { forcedLegendId } : {}),
      });

      const depositBank = config.banks.depositBanks.find((b) => b.id === dialog.depositBankId);
      const payoutBank = config.banks.payoutBanks.find((b) => b.id === dialog.payoutBankId);
      const clockCfg = localeClockConfig(project.locale);
      const lastSlide = params.slideTimes?.filter(Boolean).at(-1);
      const clockNow =
        params.now ??
        (lastSlide ? new Date(lastSlide) : null) ??
        (dialog.createdAt ? new Date(dialog.createdAt) : new Date());
      const messageClock = buildMessageClock(dialog.messages, {
        now: clockNow,
        timeZone: clockCfg.timeZone,
        locale: clockCfg.locale,
        dateFormat: clockCfg.dateFormat,
      });
      const capturaStamp =
        messageClock.stampForType(dialog.messages, "captura") ?? messageClock.stampAtDelay(40);
      const receiptStamp =
        messageClock.stampForType(dialog.messages, "receipt") ??
        messageClock.stampAt(dialog.messages.length - 1);

      await report(
        progress,
        reviewType === "unique_circle" ? 3 : 2,
        "media",
        "Подбор медиа",
        "Библиотека или ИИ (ставки / условия / стикер)…",
      );
      const legendIdForMedia = dialog.legendId;

      let videoNote = preselectedVideoNote;
      if (!videoNote) {
        videoNote = await mediaHandler.pickVideoNote(params.projectId, legendIdForMedia);
      }
      const [conditions, sticker] = await Promise.all([
        mediaHandler.resolveProjectImage("conditions", {
          projectId: params.projectId,
          projectName: project.name,
          locale: project.locale,
          currency: project.currency,
        }),
        mediaHandler.resolveProjectImage("sticker", {
          projectId: params.projectId,
          projectName: project.name,
        }),
      ]);

      const sequentialBets = betPackPick?.assets ?? [];
      // Use one complete pack only — never fill slots from random other packs
      // (that produced mixed/out-of-order bets in QA).
      let bet1 = sequentialBets[0] ?? null;
      let bet2 = sequentialBets[1] ?? null;
      let bet3 = sequentialBets[2] ?? null;
      if (!bet1?.path || !bet2?.path || !bet3?.path) {
        await logger.warn("Incomplete bet pack — slots left empty rather than mixing packs", {
          projectId: params.projectId,
          reviewId,
          pack: betPackPick?.packNumber ?? null,
          have: sequentialBets.map((a) => a.filename),
        });
      } else {
        try {
          await report(
            progress,
            reviewType === "unique_circle" ? 3 : 2,
            "bets",
            "Печать сумм на ставках",
            "ИИ правит копию исходного скрина (суммы Depósito/Ganancia)…",
          );
          const stamped = await stampProjectBetPack({
            projectId: params.projectId,
            deposit: dialog.deposit,
            profit1: dialog.profit1,
            profit2: dialog.profit2,
            profit3: dialog.profit3 ?? dialog.profitFinal - dialog.profit1 - dialog.profit2,
            currency: project.currency,
            locale: project.locale,
            sourcePaths: [bet1.path, bet2.path, bet3.path],
            name: dialog.clientName,
          });
          if (stamped[0]) bet1 = { ...bet1, path: stamped[0].path, filename: stamped[0].filename };
          if (stamped[1]) bet2 = { ...bet2, path: stamped[1].path, filename: stamped[1].filename };
          if (stamped[2]) bet3 = { ...bet3, path: stamped[2].path, filename: stamped[2].filename };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (useCustomAmounts) {
            throw new Error(
              `Не удалось проставить суммы на всех 3 ставках (ИИ/OCR): ${message}. Перегенерируйте отзыв или загрузите другой пак скринов.`,
            );
          }
          await logger.warn("Bet stamp failed — using raw bet screenshots", {
            projectId: params.projectId,
            reviewId,
            error: message,
          });
        }
      }

      await report(progress, 3, "photo", "Фото клиента", "Пул медиатеки или генерация ИИ…");
      // Bias AI photo by early client problem texts (hospital / illness proof).
      const storyHint = dialog.messages
        .filter((m) => m.role === "client" && m.type === "text")
        .slice(0, 5)
        .map((m) => m.content)
        .join(" ")
        .slice(0, 400);
      const imageMsg = dialog.messages.find((m) => m.type === "image");
      const legendIdForPhoto =
        (typeof imageMsg?.metadata?.legendId === "string" && imageMsg.metadata.legendId) ||
        (typeof dialog.legendId === "string" ? dialog.legendId : null);

      let uniquePhoto: { path: string; filename: string; source: "pool" | "ai" | "legend" } | null =
        null;

      // Prefer legend-tagged story photos when the dialog asks for one (skip for standalone gratitude).
      if (
        legendIdForPhoto &&
        !legendIdForPhoto.startsWith("ai_") &&
        !isStandaloneLegend(legendIdForPhoto)
      ) {
        const legendPick = await mediaHandler.pickStoryPhoto(legendIdForPhoto);
        if (legendPick?.path && mediaHandler.isValidFile(legendPick.path)) {
          const { markClientPhotoUsed } = await import("@/lib/client-photos");
          await markClientPhotoUsed({
            mediaPath: legendPick.path,
            projectId: params.projectId,
            reviewId,
          });
          uniquePhoto = {
            path: legendPick.path,
            filename: legendPick.filename,
            source: "legend",
          };
        }
      }

      if (!uniquePhoto) {
        uniquePhoto = await resolveClientPhoto({
          projectId: params.projectId,
          reviewId,
          clientName: dialog.clientName,
          ...(storyHint ? { hint: storyHint } : {}),
          locale: project.locale,
        });
      }

      if (uniquePhoto && !mediaHandler.isValidFile(uniquePhoto.path)) {
        await logger.warn("Assigned client photo missing — picking another", {
          projectId: params.projectId,
          path: uniquePhoto.path,
        });
        const { pickAvailableClientPhoto } = await import("@/lib/client-photos");
        uniquePhoto = await pickAvailableClientPhoto({
          excludePaths: [uniquePhoto.path],
        });
      }

      if (!uniquePhoto) {
        await logger.warn(
          "No client photo — upload story_photo assets or set AI_CLIENT_PHOTOS=fallback/always with OPENAI_API_KEY",
          { projectId: params.projectId, legendId: legendIdForPhoto },
        );
      } else if (uniquePhoto.source === "ai") {
        await logger.info("Using AI-generated client photo", {
          projectId: params.projectId,
          reviewId,
          path: uniquePhoto.path,
        });
      } else if (uniquePhoto.source === "legend") {
        await logger.info("Using legend story photo", {
          projectId: params.projectId,
          reviewId,
          legendId: legendIdForPhoto,
          path: uniquePhoto.path,
        });
      }

      const dialogHasVoice = dialog.messages.some((m) => m.type === "voice");
      let voiceAsset: Awaited<ReturnType<typeof mediaHandler.pickVoice>> = null;
      if (dialogHasVoice) {
        voiceAsset = await mediaHandler.pickVoice();
        if (!voiceAsset) {
          await logger.warn("Dialog includes voice but no voice files in media/voices", {
            projectId: params.projectId,
            reviewId,
          });
        }
      }

      await report(
        progress,
        4,
        "slips",
        "Правка чеков",
        "ИИ переписывает сумму, имена и дату прямо в скрине банка…",
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
          date: capturaStamp.date,
          time: capturaStamp.time,
          accountLastDigits: dialog.accountLastDigits,
          project,
          ...(project.capturaStyle ? { style: project.capturaStyle } : {}),
        }),
        mediaHandler.generateReceipt({
          amount: dialog.payoutAmount,
          currency: project.currency,
          senderName: project.managerName,
          recipientName: dialog.clientName,
          bankId: dialog.payoutBankId,
          bankName: payoutBank?.shortName ?? payoutBank?.name ?? "Banco",
          accountLastDigits: dialog.accountLastDigits,
          date: receiptStamp.date,
          time: receiptStamp.time,
          project,
          ...(project.receiptStyle ? { style: project.receiptStyle } : {}),
        }),
      ]);

      if (captura.source === "overlay" || receipt.source === "overlay") {
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
      const renderMedia = {
        sticker: sticker?.path ?? null,
        storyPhoto: uniquePhoto?.path ?? null,
        conditions: conditions?.path ?? project.conditionsImagePath ?? null,
        bet1: bet1?.path ?? null,
        bet2: bet2?.path ?? null,
        bet3: bet3?.path ?? null,
        receipt: receipt.path,
        captura: captura.path,
        voice: voiceAsset?.path ?? null,
      };

      const renderResult = await getChatRenderer().renderDialog({
        dialog,
        project,
        reviewId,
        mediaAssets: renderMedia,
        now: clockNow,
        ...(params.slideTimes?.length ? { slideTimes: params.slideTimes } : {}),
      });

      const media: ReviewPackage["media"] = [];
      if (captura.path) media.push({ type: "receipt", path: captura.path });
      if (receipt.path) media.push({ type: "receipt", path: receipt.path });
      if (bet1?.path) media.push({ type: "bet", path: bet1.path });
      if (bet2?.path) media.push({ type: "bet", path: bet2.path });
      if (bet3?.path) media.push({ type: "bet", path: bet3.path });
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
      if (voiceAsset?.path && mediaHandler.isValidFile(voiceAsset.path)) {
        media.push({ type: "voice", path: voiceAsset.path });
      }

      review = {
        ...review,
        screenshots: renderResult.screenshots,
        media,
        dialog,
        renderMedia,
        ...(params.slideTimes?.length ? { slideTimes: params.slideTimes } : {}),
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
