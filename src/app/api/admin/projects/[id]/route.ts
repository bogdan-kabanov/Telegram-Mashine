import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { getProjectById } from "@/lib/config/loader";
import { updateProject } from "@/lib/config/writer";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await bootstrapApp();
    const { id } = await context.params;
    const project = await getProjectById(id);
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await bootstrapApp();
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const project = await updateProject(id, body);
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
