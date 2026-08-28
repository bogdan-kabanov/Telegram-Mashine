import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { getProjectById } from "@/lib/config/loader";
import { getReviewFromDb } from "@/lib/db/reviews";
import { dateFromZonedLocal } from "@/lib/timezone";
import { localeClockConfig } from "@/lib/i18n/locale-profile";
import { composeLiveChatHtml } from "@/modules/chat-renderer/live-html";
import type { GeneratedDialog } from "@/modules/dialog-generator";
import type { DialogMediaAssets } from "@/modules/chat-renderer/messages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type LiveBody = {
  projectId?: string;
  reviewId?: string;
  now?: string;
  overrides?: {
    managerName?: string;
    managerHandle?: string;
    incomingBubble?: string;
    outgoingBubble?: string;
    accentColor?: string;
    depositMessageTemplate?: string;
    completionMessageTemplate?: string;
    payoutMessageTemplate?: string;
    wallpaperPath?: string | null;
    clientAvatarPath?: string | null;
  };
  mediaPaths?: DialogMediaAssets;
};

export async function POST(request: NextRequest) {
  try {
    await bootstrapApp();
    const body = (await request.json()) as LiveBody;
    if (!body.projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const project = await getProjectById(body.projectId);
    const clockCfg = localeClockConfig(project.locale);

    let review = body.reviewId ? await getReviewFromDb(body.reviewId) : null;
    if (review && review.projectId !== project.id) {
      review = null;
    }

    const now = body.now
      ? body.now.includes("T") && !body.now.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(body.now)
        ? dateFromZonedLocal(body.now, clockCfg.timeZone)
        : new Date(body.now)
      : review?.slideTimes?.filter(Boolean).at(-1)
        ? new Date(review.slideTimes.filter(Boolean).at(-1)!)
        : new Date();

    const mediaPaths: DialogMediaAssets = {
      sticker: body.mediaPaths?.sticker ?? review?.renderMedia?.sticker ?? null,
      storyPhoto: body.mediaPaths?.storyPhoto ?? review?.renderMedia?.storyPhoto ?? null,
      conditions: body.mediaPaths?.conditions ?? review?.renderMedia?.conditions ?? null,
      bet1: body.mediaPaths?.bet1 ?? review?.renderMedia?.bet1 ?? null,
      bet2: body.mediaPaths?.bet2 ?? review?.renderMedia?.bet2 ?? null,
      bet3: body.mediaPaths?.bet3 ?? review?.renderMedia?.bet3 ?? null,
      receipt: body.mediaPaths?.receipt ?? review?.renderMedia?.receipt ?? null,
      captura: body.mediaPaths?.captura ?? review?.renderMedia?.captura ?? null,
    };

    const result = await composeLiveChatHtml({
      project,
      dialog: (review?.dialog as GeneratedDialog | undefined) ?? null,
      mediaPaths,
      now: Number.isNaN(now.getTime()) ? new Date() : now,
      ...(body.overrides ? { overrides: body.overrides } : {}),
    });

    return NextResponse.json({
      ok: true,
      html: result.html,
      timeZone: result.timeZone,
      locale: result.locale,
      statusBarTime: result.statusBarTime,
      clientName: result.clientName,
      mode: result.mode,
      reviewId: review?.id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
