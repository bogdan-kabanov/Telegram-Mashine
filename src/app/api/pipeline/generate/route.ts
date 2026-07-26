import { NextRequest, NextResponse } from "next/server";

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

export async function POST(request: NextRequest) {
  try {
    await bootstrapApp();
    const body = (await request.json()) as {
      projectId?: string;
      reviewType?: "small" | "big" | "unique_circle";
      queue?: boolean;
      autoPublish?: boolean;
      stream?: boolean;
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
