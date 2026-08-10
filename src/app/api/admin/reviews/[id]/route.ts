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

    const body = (await request.json()) as { action?: string; targetLocale?: string };
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

