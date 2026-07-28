import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { BET_REUSE_DAYS_HARD_MAX, getBetReuseCapacity } from "@/lib/bet-cycle";
import { loadAppConfig } from "@/lib/config/loader";
import { updateSchedule } from "@/lib/config/writer";

export async function GET() {
  try {
    await bootstrapApp();
    const config = await loadAppConfig();
    const capacity = await getBetReuseCapacity();
    return NextResponse.json({
      ok: true,
      schedule: config.schedule,
      betReuseMaxDays: capacity.maxDays,
      betReuseByProject: capacity.byProject,
    });
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
      const capacity = await getBetReuseCapacity();
      const maxDays = Math.min(BET_REUSE_DAYS_HARD_MAX, capacity.maxDays);
      if (!Number.isFinite(n) || n < 0 || n > maxDays) {
        return NextResponse.json(
          {
            error: `betReuseDays must be an integer 0–${maxDays} (уникальных ставок не хватает на больший кулдаун; 0 = без кулдауна)`,
            betReuseMaxDays: maxDays,
            betReuseByProject: capacity.byProject,
          },
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
    const capacity = await getBetReuseCapacity();
    return NextResponse.json({
      ok: true,
      schedule,
      betReuseMaxDays: capacity.maxDays,
      betReuseByProject: capacity.byProject,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
