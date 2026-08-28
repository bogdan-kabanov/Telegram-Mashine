import path from "path";

import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { withBasePath } from "@/lib/base-path";
import { getProjectById } from "@/lib/config/loader";
import { getChatRenderer } from "@/modules/chat-renderer";

export async function POST(request: NextRequest) {
  try {
    await bootstrapApp();

    const body = (await request.json()) as { projectId?: string };
    if (!body.projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const project = await getProjectById(body.projectId);
    const renderer = getChatRenderer();
    const result = await renderer.renderPreview(body.projectId, project);

    const pngUrl = withBasePath(`/renders/${path.basename(result.pngPath)}`);

    return NextResponse.json({
      ok: true,
      pngUrl,
      htmlPath: result.htmlPath,
      width: result.width,
      height: result.height,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
