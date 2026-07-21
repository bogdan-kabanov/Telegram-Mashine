import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { getRecentReviewsByProject } from "@/lib/db/reviews";
import { toPublicScreenshotUrl } from "@/lib/media/screenshot-url";

export async function GET(request: NextRequest) {
  try {
    await bootstrapApp();
    const projectId = request.nextUrl.searchParams.get("projectId");
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "5");

    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    const reviews = await getRecentReviewsByProject(projectId, limit);
    const items = reviews.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      clientName: r.clientName,
      phase: r.phase,
      createdAt: r.createdAt,
      screenshots: r.screenshots.map(toPublicScreenshotUrl),
    }));

    return NextResponse.json({ ok: true, reviews: items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
