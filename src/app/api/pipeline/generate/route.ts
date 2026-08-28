import { NextRequest, NextResponse } from "next/server";

import { splitProfitProgression, type CustomAmounts } from "@/lib/amounts/split-profit";
import { bootstrapApp } from "@/lib/bootstrap";
import { getProjectById } from "@/lib/config/loader";
import { toPublicScreenshotUrl } from "@/lib/media/screenshot-url";
import { getReviewPipeline, type PipelineProgressEvent } from "@/lib/pipeline";
import { getRuntimeManager } from "@/lib/runtime/manager";
import { getScheduler } from "@/modules/scheduler";

export const dynamic = "force-dynamic";
/** AI receipts + Playwright can exceed default serverless limits. */
export const maxDuration = 300;

function sseLine(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function resolveCustomAmounts(body: {
  customAmounts?: CustomAmounts;
  profitFinal?: number;
  deposit?: number;
}): CustomAmounts | undefined {
  if (body.customAmounts?.profitFinal && body.customAmounts.profitFinal > 0) {
    return body.customAmounts;
  }
  const profitFinal = Number(body.profitFinal);
  if (!Number.isFinite(profitFinal) || profitFinal <= 0) return undefined;
  const deposit = Number(body.deposit);
  return splitProfitProgression({
    profitFinal,
    ...(deposit > 0 ? { deposit } : {}),
  });
}

export async function POST(request: NextRequest) {
  try {
    await bootstrapApp();
    const body = (await request.json()) as {
      projectId?: string;
      reviewType?: "small" | "big" | "unique_circle";
      queue?: boolean;
      autoPublish?: boolean;
      stream?: boolean;
      slideTimes?: string[];
      now?: string;
      amountPackId?: string;
      customAmounts?: CustomAmounts;
      profitFinal?: number;
      deposit?: number;
    };

    if (!body.projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    await getProjectById(body.projectId);
    const runtime = getRuntimeManager();
    const state = await runtime.getState();

    if (body.queue) {
      const taskId = await getScheduler().triggerNow(body.projectId, body.reviewType ?? "big");
      return NextResponse.json({ ok: true, queued: true, taskId });
    }

    const autoPublish = body.autoPublish ?? false;

    if (autoPublish && state.status !== "running") {
      return NextResponse.json(
        { error: "Бот не запущен. Нажмите «Запустить» на Dashboard или генерируйте без публикации." },
        { status: 400 },
      );
    }

    const customAmounts = resolveCustomAmounts(body);

    const extra = {
      ...(body.slideTimes?.length ? { slideTimes: body.slideTimes } : {}),
      ...(body.now ? { now: new Date(body.now) } : {}),
      ...(customAmounts
        ? { customAmounts }
        : body.amountPackId?.trim()
          ? { amountPackId: body.amountPackId.trim() }
          : {}),
    };

    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (payload: unknown) => {
            controller.enqueue(encoder.encode(sseLine(payload)));
          };

          try {
            const result = await getReviewPipeline().generateReview({
              projectId: body.projectId!,
              reviewType: body.reviewType ?? "big",
              autoPublish,
              ...extra,
              onProgress: async (event: PipelineProgressEvent) => {
                send({ type: "progress", ...event });
              },
            });

            send({
              type: "done",
              ok: true,
              reviewId: result.reviewId,
              screenshots: result.screenshots.map(toPublicScreenshotUrl),
              phase: result.phase,
              published: autoPublish,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            send({ type: "error", error: message });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const result = await getReviewPipeline().generateReview({
      projectId: body.projectId,
      reviewType: body.reviewType ?? "big",
      autoPublish,
      ...extra,
    });

    return NextResponse.json({
      ok: true,
      reviewId: result.reviewId,
      screenshots: result.screenshots.map(toPublicScreenshotUrl),
      phase: result.phase,
      published: autoPublish,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
