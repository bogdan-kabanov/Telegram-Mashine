import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { loadLegendsFromDisk, saveLegends } from "@/lib/config/writer";
import { clientLegendSchema } from "@/lib/schemas";

export async function GET() {
  try {
    await bootstrapApp();
    const legends = await loadLegendsFromDisk();
    return NextResponse.json({ ok: true, legends });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await bootstrapApp();
    const body = (await request.json()) as { legends?: unknown[] };
    if (!body.legends || !Array.isArray(body.legends)) {
      return NextResponse.json({ error: "legends array required" }, { status: 400 });
    }
    const legends = body.legends.map((l) => clientLegendSchema.parse(l));
    await saveLegends(legends);
    return NextResponse.json({ ok: true, legends });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
