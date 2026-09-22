import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { getProjectById } from "@/lib/config/loader";
import { getReviewFromDb, saveReviewToDb } from "@/lib/db/reviews";
import { toPublicScreenshotUrl } from "@/lib/media/screenshot-url";
import { applyDialogAiFix } from "@/lib/openai/ai-fix";
import { translateDialogMessages } from "@/lib/openai/translate-dialog";
import {
  applySlotToRenderMedia,
  isPatchableMediaSlot,
  regenerateReviewMediaSlot,
  type PatchableMediaSlot,
} from "@/lib/reviews/patch-media";
import { getRuntimeManager } from "@/lib/runtime/manager";
import {
  dialogMessageSchema,
  generatedDialogSchema,
  reviewPackageSchema,
  type DialogMessage,
  type ReviewPackage,
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

async function rerenderReviewScreens(review: ReviewPackage) {
  if (!review.dialog || !review.renderMedia) {
    throw new Error("Нет данных для перерисовки (dialog/renderMedia).");
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
  return updated;
}

function publicScreens(review: ReviewPackage, cacheBust?: number) {
  const bust = cacheBust ?? Date.now();
  return review.screenshots.map((p) => toPublicScreenshotUrl(p, bust));
}

function parseAmount(raw: unknown): number | undefined {
  const parsedAmount =
    typeof raw === "number" ? raw : Number(String(raw ?? "").replace(",", "."));
  return Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : undefined;
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
      useAi?: boolean;
      instruction?: string;
      target?: string;
      rerender?: boolean;
      messageIndex?: number;
    };
    const action = body.action ?? "";

    if (action === "aiFix") {
      const instruction = (body.instruction ?? "").trim();
      if (!instruction) {
        return NextResponse.json({ error: "Укажите instruction (что не так)" }, { status: 400 });
      }
      if (!review.dialog) {
        return NextResponse.json({ error: "Нет диалога для правки" }, { status: 400 });
      }
      const project = await getProjectById(review.projectId);
      const target = body.target ?? "dialog";

      if (target === "slot" && body.slot && isPatchableMediaSlot(body.slot)) {
        const amt = parseAmount(body.amount);
        const result = await regenerateReviewMediaSlot({
          review,
          slot: body.slot,
          generate: true,
          ...(amt !== undefined ? { amount: amt } : {}),
        });
        let current = reviewPackageSchema.parse({
          ...review,
          renderMedia: applySlotToRenderMedia(review.renderMedia, body.slot, result.path),
          ...(result.dialog ? { dialog: result.dialog } : {}),
        });
        await getPublisher().saveReviewPackage(current);
        await saveReviewToDb(current);
        if (body.rerender !== false) {
          current = await rerenderReviewScreens(current);
        }
        const screenshots = publicScreens(current);
        return NextResponse.json({
          ok: true,
          message: `Слот ${body.slot} пересобран (${result.source ?? "ok"}). Инструкция сохранена в лог.`,
          instruction,
          review: { ...current, screenshots },
          screenshots,
        });
      }

      const messages = await applyDialogAiFix({
        messages: review.dialog.messages,
        instruction,
        locale: project.locale,
      });
      let updated = reviewPackageSchema.parse({
        ...review,
        dialog: { ...review.dialog, messages },
      });
      await getPublisher().saveReviewPackage(updated);
      await saveReviewToDb(updated);
      if (body.rerender) {
        updated = await rerenderReviewScreens(updated);
      }
      const screenshots = publicScreens(updated);
      return NextResponse.json({
        ok: true,
        message: "Диалог поправлен по инструкции ИИ",
        review: { ...updated, screenshots },
        screenshots,
      });
    }

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
      const updated = await rerenderReviewScreens(review);
      const screenshots = publicScreens(updated);
      return NextResponse.json({
        ok: true,
        screenshots,
        review: {
          ...updated,
          screenshots,
        },
      });
    }

    if (action === "replaceMedia" || action === "patchMedia") {
      const wantRerender = (body as { rerender?: boolean }).rerender === true;
      const nowRaw = (body as { now?: string }).now;
      const amounts = (body as { amounts?: Record<string, number | string> }).amounts ?? {};

      const slots: PatchableMediaSlot[] = [];
      if (action === "patchMedia") {
        const rawSlots = (body as { slots?: string[] }).slots ?? [];
        for (const s of rawSlots) {
          if (!isPatchableMediaSlot(s)) {
            return NextResponse.json({ error: `Неизвестный слот: ${s}` }, { status: 400 });
          }
          slots.push(s);
        }
        if (slots.length === 0) {
          return NextResponse.json({ error: "Выберите хотя бы один слот" }, { status: 400 });
        }
      } else {
        const slot = (body as { slot?: string }).slot;
        if (!slot || !isPatchableMediaSlot(slot)) {
          return NextResponse.json({ error: "Неизвестный слот медиа" }, { status: 400 });
        }
        slots.push(slot);
      }

      if (!review.renderMedia && !review.dialog) {
        return NextResponse.json(
          { error: "Сначала соберите полный отзыв — тогда чеки и ставки можно менять точечно." },
          { status: 400 },
        );
      }

      let current: ReviewPackage = review;
      const patched: Array<{ slot: string; path: string; source?: string }> = [];
      const singlePath = (body as { path?: string }).path;
      const singleGenerate = (body as { generate?: boolean }).generate === true;
      const singleAmount = parseAmount((body as { amount?: number | string }).amount);

      for (const slot of slots) {
        const generate = action === "patchMedia" ? true : singleGenerate;
        const path = action === "replaceMedia" && slots.length === 1 ? singlePath : undefined;
        const amount =
          parseAmount(amounts[slot]) ??
          (action === "replaceMedia" && slots[0] === slot ? singleAmount : undefined);

        try {
          const result = await regenerateReviewMediaSlot({
            review: current,
            slot,
            generate,
            ...(path ? { path } : {}),
            ...(nowRaw ? { now: nowRaw } : {}),
            ...(amount !== undefined ? { amount } : {}),
          });
          const renderMedia = applySlotToRenderMedia(current.renderMedia, slot, result.path);
          current = reviewPackageSchema.parse({
            ...current,
            renderMedia,
            ...(result.dialog ? { dialog: result.dialog } : {}),
          });
          patched.push({
            slot,
            path: result.path,
            ...(result.source ? { source: result.source } : {}),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Ошибка слота";
          return NextResponse.json({ error: `${slot}: ${message}` }, { status: 502 });
        }
      }

      await getPublisher().saveReviewPackage(current);
      await saveReviewToDb(current);

      let bust = Date.now();
      if (wantRerender) {
        try {
          current = await rerenderReviewScreens(current);
          bust = Date.now();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Ошибка перерисовки";
          return NextResponse.json(
            {
              error: message,
              ok: false,
              patched,
              review: {
                ...current,
                screenshots: publicScreens(current, bust),
              },
            },
            { status: 502 },
          );
        }
      }

      const screenshots = publicScreens(current, bust);
      const primary = patched[0];
      const usedOverlay = patched.some((p) => p.source === "overlay");
      const usedAi = patched.some((p) => p.source === "ai");
      return NextResponse.json({
        ok: true,
        ...(primary
          ? {
              slot: primary.slot,
              path: primary.path,
              ...(primary.source ? { source: primary.source } : {}),
            }
          : {}),
        patched,
        rerendered: wantRerender,
        screenshots,
        warning: usedOverlay && !usedAi
          ? "Чеки собраны OCR-наклейкой (нет рабочего OpenAI images.edit). Для реалистичного текста нужен ключ gpt-image-1 в .env /admin/ai."
          : undefined,
        review: {
          ...current,
          screenshots,
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
      {
        error:
          "Unknown action. Use translate | rerender | replaceMedia | patchMedia | publish | aiFix",
      },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

