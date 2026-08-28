import { betDepositForSlot, betProfitForSlot } from "@/lib/amounts/split-profit";
import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { getProjectById } from "@/lib/config/loader";
import { getReviewFromDb, saveReviewToDb } from "@/lib/db/reviews";
import { toPublicScreenshotUrl } from "@/lib/media/screenshot-url";
import { translateDialogMessages } from "@/lib/openai/translate-dialog";
import { getRuntimeManager } from "@/lib/runtime/manager";
import {
  dialogMessageSchema,
  generatedDialogSchema,
  reviewPackageSchema,
  type DialogMessage,
} from "@/lib/schemas";
import type { GeneratedDialog } from "@/modules/dialog-generator";
import { getChatRenderer } from "@/modules/chat-renderer";
import { getPublisher } from "@/modules/publisher";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

async function loadReviewOr404(id: string) {
  const review = await getReviewFromDb(id);
  if (!review) return null;
  return review;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await bootstrapApp();
    const { id } = await context.params;
    const review = await loadReviewOr404(id);
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

    return NextResponse.json({
      ok: true,
      review: {
        ...review,
        screenshots: review.screenshots.map(toPublicScreenshotUrl),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const patchBodySchema = z.object({
  messages: z.array(dialogMessageSchema).optional(),
  dialog: generatedDialogSchema.optional(),
  dialogTranslations: z.record(z.string()).optional(),
  slideTimes: z.array(z.string()).optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await bootstrapApp();
    const { id } = await context.params;
    const review = await loadReviewOr404(id);
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });
    if (!review.dialog) {
      return NextResponse.json(
        { error: "У этого отзыва нет сохранённого диалога (старый пакет). Сгенерируйте новый." },
        { status: 400 },
      );
    }

    const body = patchBodySchema.parse(await request.json());
    let dialog = review.dialog;

    if (body.dialog) {
      dialog = body.dialog;
    } else if (body.messages) {
      dialog = { ...dialog, messages: body.messages as DialogMessage[] };
    }

    const updated = reviewPackageSchema.parse({
      ...review,
      dialog,
      ...(body.dialogTranslations ? { dialogTranslations: body.dialogTranslations } : {}),
      ...(body.slideTimes ? { slideTimes: body.slideTimes } : {}),
    });

    const publisher = getPublisher();
    await publisher.saveReviewPackage(updated);
    await saveReviewToDb(updated);

    return NextResponse.json({
      ok: true,
      review: {
        ...updated,
        screenshots: updated.screenshots.map(toPublicScreenshotUrl),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    await bootstrapApp();
    const { id } = await context.params;
    const review = await loadReviewOr404(id);
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

    const body = (await request.json()) as {
      action?: string;
      targetLocale?: string;
      slot?: string;
      path?: string;
      generate?: boolean;
      now?: string;
      amount?: number | string;
    };
    const action = body.action ?? "";

    if (action === "translate") {
      if (!review.dialog) {
        return NextResponse.json(
          { error: "Нет диалога для перевода. Сгенерируйте новый отзыв." },
          { status: 400 },
        );
      }
      const project = await getProjectById(review.projectId);
      const translations = await translateDialogMessages({
        messages: review.dialog.messages,
        targetLocale: body.targetLocale ?? "ru-RU",
        sourceLocale: project.locale,
      });
      const updated = reviewPackageSchema.parse({
        ...review,
        dialogTranslations: translations,
      });
      await getPublisher().saveReviewPackage(updated);
      await saveReviewToDb(updated);
      return NextResponse.json({
        ok: true,
        dialogTranslations: translations,
        review: {
          ...updated,
          screenshots: updated.screenshots.map(toPublicScreenshotUrl),
        },
      });
    }

    if (action === "rerender") {
      if (!review.dialog || !review.renderMedia) {
        return NextResponse.json(
          {
            error:
              "Нет данных для перерисовки (dialog/renderMedia). Сгенерируйте новый пробный отзыв.",
          },
          { status: 400 },
        );
      }
      const project = await getProjectById(review.projectId);
      const renderResult = await getChatRenderer().renderDialog({
        dialog: review.dialog as GeneratedDialog,
        project,
        reviewId: review.id,
        mediaAssets: {
          sticker: review.renderMedia.sticker ?? null,
          storyPhoto: review.renderMedia.storyPhoto ?? null,
          conditions: review.renderMedia.conditions ?? null,
          bet1: review.renderMedia.bet1 ?? null,
          bet2: review.renderMedia.bet2 ?? null,
          bet3: review.renderMedia.bet3 ?? null,
          receipt: review.renderMedia.receipt ?? null,
          captura: review.renderMedia.captura ?? null,
        },
        ...(review.slideTimes?.length ? { slideTimes: review.slideTimes } : {}),
      });
      const updated = reviewPackageSchema.parse({
        ...review,
        screenshots: renderResult.screenshots,
      });
      await getPublisher().saveReviewPackage(updated);
      await saveReviewToDb(updated, renderResult.clientAvatarPath);
      return NextResponse.json({
        ok: true,
        screenshots: updated.screenshots.map(toPublicScreenshotUrl),
        review: {
          ...updated,
          screenshots: updated.screenshots.map(toPublicScreenshotUrl),
        },
      });
    }

    if (action === "replaceMedia") {
      const slot = (body as { slot?: string }).slot;
      const path = (body as { path?: string }).path;
      const generate = (body as { generate?: boolean }).generate === true;
      const nowRaw = (body as { now?: string }).now;
      const amountRaw = (body as { amount?: number | string }).amount;
      const parsedAmount =
        typeof amountRaw === "number"
          ? amountRaw
          : Number(String(amountRaw ?? "").replace(",", "."));
      const overrideAmount =
        Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : undefined;
      const allowed = new Set([
        "storyPhoto",
        "conditions",
        "bet1",
        "bet2",
        "bet3",
        "receipt",
        "captura",
        "sticker",
      ]);
      if (!slot || !allowed.has(slot)) {
        return NextResponse.json({ error: "Неизвестный слот медиа" }, { status: 400 });
      }
      if (!review.renderMedia && !review.dialog) {
        return NextResponse.json(
          { error: "Сначала соберите полный отзыв — тогда чеки и ставки можно менять точечно." },
          { status: 400 },
        );
      }

      let nextPath = path?.trim() || "";
      const project = await getProjectById(review.projectId);
      let slipSource: "overlay" | "ai" | "template" | "html" | undefined;

      if (generate) {
        if (slot === "storyPhoto") {
          const { generateClientPhoto } = await import("@/lib/openai/images");
          const hint =
            review.dialog?.messages
              .filter((m) => m.role === "client" && m.type === "text")
              .slice(0, 4)
              .map((m) => m.content)
              .join(" ")
              .slice(0, 400) || undefined;
          const generated = await generateClientPhoto({
            projectId: project.id,
            clientName: review.clientName,
            locale: project.locale,
            ...(hint ? { hint } : {}),
            saveToPool: true,
          });
          if (!generated) throw new Error("Не удалось сгенерировать фото");
          nextPath = generated.path;
        } else if (slot === "receipt" || slot === "captura") {
          if (!review.dialog) {
            return NextResponse.json({ error: "Нет диалога для пересборки чека" }, { status: 400 });
          }
          const { loadAppConfig } = await import("@/lib/config/loader");
          const { localeClockConfig } = await import("@/lib/i18n/locale-profile");
          const { buildMessageClock } = await import("@/lib/format");
          const { getMediaHandler } = await import("@/modules/media-handler");
          const config = await loadAppConfig();
          const clockCfg = localeClockConfig(project.locale);
          const now = nowRaw ? new Date(nowRaw) : new Date();
          const clock = buildMessageClock(review.dialog.messages, {
            now,
            timeZone: clockCfg.timeZone,
            locale: clockCfg.locale,
          });
          const depositBank = config.banks.depositBanks.find((b) => b.id === review.dialog!.depositBankId);
          const payoutBank = config.banks.payoutBanks.find((b) => b.id === review.dialog!.payoutBankId);
          const mediaHandler = getMediaHandler();
          if (slot === "captura") {
            const stamp =
              clock.stampForType(review.dialog.messages, "captura") ?? clock.stampAtDelay(40);
            const capturaAmount = overrideAmount ?? review.dialog.deposit;
            const captura = await mediaHandler.generateCaptura({
              amount: capturaAmount,
              currency: project.currency,
              senderName: review.dialog.clientName,
              recipientLabel: project.managerName,
              clabe: review.dialog.clabe,
              bankId: review.dialog.depositBankId,
              bankName: depositBank?.shortName ?? depositBank?.name ?? "Banco",
              date: stamp.date,
              time: stamp.time,
              accountLastDigits: review.dialog.accountLastDigits,
              project,
              ...(project.capturaStyle ? { style: project.capturaStyle } : {}),
            });
            nextPath = captura.path;
            slipSource = captura.source;
            if (overrideAmount) {
              review.dialog.deposit = overrideAmount;
            }
          } else {
            const stamp =
              clock.stampForType(review.dialog.messages, "receipt") ??
              clock.stampAt(review.dialog.messages.length - 1);
            const receiptAmount = overrideAmount ?? review.dialog.payoutAmount;
            const receipt = await mediaHandler.generateReceipt({
              amount: receiptAmount,
              currency: project.currency,
              senderName: project.managerName,
              recipientName: review.dialog.clientName,
              bankId: review.dialog.payoutBankId,
              bankName: payoutBank?.shortName ?? payoutBank?.name ?? "Banco",
              accountLastDigits: review.dialog.accountLastDigits,
              date: stamp.date,
              time: stamp.time,
              project,
              ...(project.receiptStyle ? { style: project.receiptStyle } : {}),
            });
            nextPath = receipt.path;
            slipSource = receipt.source;
            if (overrideAmount) {
              review.dialog.payoutAmount = overrideAmount;
            }
          }
        } else if (slot.startsWith("bet")) {
          if (!review.dialog) {
            return NextResponse.json({ error: "Нет диалога для сумм на ставке" }, { status: 400 });
          }
          const { stampExistingBet, stampProjectBetSlot } = await import("@/lib/media/stamp-bets");
          const slotNum = slot === "bet2" ? 2 : slot === "bet3" ? 3 : 1;
          const profit =
            overrideAmount ??
            betProfitForSlot(
              {
                profit1: review.dialog.profit1,
                profit2: review.dialog.profit2,
                profit3: review.dialog.profit3 ?? 0,
                profitFinal: review.dialog.profitFinal,
              },
              slotNum,
            );
          const slotDeposit = betDepositForSlot(
            {
              deposit: review.dialog.deposit,
              profit1: review.dialog.profit1,
              profit2: review.dialog.profit2,
            },
            slotNum,
          );
          const source = (review.renderMedia?.[slot as "bet1" | "bet2" | "bet3"] ?? "").trim();
          try {
            if (source) {
              const stamped = await stampExistingBet({
                sourcePath: source,
                projectId: project.id,
                deposit: slotDeposit,
                profit,
                currency: project.currency,
                name: review.dialog.clientName,
              });
              nextPath = stamped.path;
            } else {
              const stamped = await stampProjectBetSlot({
                projectId: project.id,
                slot: slotNum,
                deposit: slotDeposit,
                profit,
                currency: project.currency,
                name: review.dialog.clientName,
              });
              nextPath = stamped.path;
            }
            slipSource = "overlay";
            if (overrideAmount) {
              if (slot === "bet1") review.dialog.profit1 = overrideAmount;
              else if (slot === "bet2") review.dialog.profit2 = overrideAmount;
              else review.dialog.profit3 = overrideAmount;
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : "Не удалось проставить суммы на ставке";
            return NextResponse.json({ error: message }, { status: 502 });
          }
        } else {
          const { generateSceneMedia } = await import("@/lib/openai/scene-media");
          const kind = slot === "conditions" ? "conditions" : "sticker";
          const generated = await generateSceneMedia({
            kind,
            projectId: kind === "sticker" ? null : project.id,
            projectName: project.name,
            locale: project.locale,
            currency: project.currency,
            clientName: review.clientName,
            reviewId: review.id,
            force: true,
          });
          if (!generated) throw new Error("Не удалось сгенерировать медиа");
          nextPath = generated.path;
        }
      }

      if (!nextPath) {
        return NextResponse.json({ error: "Укажите файл или включите generate" }, { status: 400 });
      }

      const renderMedia = {
        sticker: review.renderMedia?.sticker ?? null,
        storyPhoto: review.renderMedia?.storyPhoto ?? null,
        conditions: review.renderMedia?.conditions ?? null,
        bet1: review.renderMedia?.bet1 ?? null,
        bet2: review.renderMedia?.bet2 ?? null,
        bet3: review.renderMedia?.bet3 ?? null,
        receipt: review.renderMedia?.receipt ?? null,
        captura: review.renderMedia?.captura ?? null,
        [slot]: nextPath,
      };
      const updated = reviewPackageSchema.parse({ ...review, renderMedia });
      await getPublisher().saveReviewPackage(updated);
      await saveReviewToDb(updated);
      return NextResponse.json({
        ok: true,
        slot,
        path: nextPath,
        ...(slipSource ? { source: slipSource } : {}),
        review: {
          ...updated,
          screenshots: updated.screenshots.map(toPublicScreenshotUrl),
        },
      });
    }

    if (action === "publish") {
      const runtime = getRuntimeManager();
      const state = await runtime.getState();
      if (state.status !== "running") {
        return NextResponse.json(
          {
            error:
              "Бот не запущен. Нажмите «Запустить» на Dashboard, затем опубликуйте отзыв.",
          },
          { status: 400 },
        );
      }
      const project = await getProjectById(review.projectId);
      await getPublisher().publishReview(review, project);
      const fresh = await getReviewFromDb(review.id);
      return NextResponse.json({
        ok: true,
        published: true,
        review: fresh
          ? { ...fresh, screenshots: fresh.screenshots.map(toPublicScreenshotUrl) }
          : null,
      });
    }

    return NextResponse.json(
      { error: "Unknown action. Use translate | rerender | publish" },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

