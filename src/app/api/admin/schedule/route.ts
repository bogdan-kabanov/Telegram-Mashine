import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { loadAppConfig } from "@/lib/config/loader";
import { updateSchedule } from "@/lib/config/writer";

export async function GET() {
  try {
    await bootstrapApp();
    const config = await loadAppConfig();
    return NextResponse.json({ ok: true, schedule: config.schedule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await bootstrapApp();
    const body = (await request.json()) as Record<string, unknown>;
    const patch: { betReuseDays?: number; phaseDelayMinutes?: number } = {};

    if (body.betReuseDays !== undefined) {
      const n = Number(body.betReuseDays);
      if (!Number.isFinite(n) || n < 0 || n > 90) {
        return NextResponse.json(
          { error: "betReuseDays must be an integer 0–90 (0 = no cooldown)" },
          { status: 400 },
        );
      }
      patch.betReuseDays = Math.floor(n);
    }

    if (body.phaseDelayMinutes !== undefined) {
      const n = Number(body.phaseDelayMinutes);
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json({ error: "phaseDelayMinutes must be ≥ 1" }, { status: 400 });
      }
      patch.phaseDelayMinutes = Math.floor(n);
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const schedule = await updateSchedule(patch);
    return NextResponse.json({ ok: true, schedule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
