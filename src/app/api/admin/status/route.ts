import { NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { loadAppConfig } from "@/lib/config/loader";
import { getRuntimeManager } from "@/lib/runtime/manager";
import { getActiveCycleWeekInfo } from "@/lib/schedule/cycle";
import { getScheduler } from "@/modules/scheduler";

export async function GET() {
  try {
    await bootstrapApp();

    const runtime = getRuntimeManager();
    const [state, logs, config, upcoming, queue] = await Promise.all([
      runtime.getState(),
      runtime.getRecentLogs(15),
      loadAppConfig(),
      getScheduler().getUpcomingTasks(5),
      runtime.getQueue(8),
    ]);

    const cycle = getActiveCycleWeekInfo(config.schedule);

    return NextResponse.json({
      state,
      logs,
      config: {
        projects: config.projects.projects,
        schedule: {
          postsPerDay: config.schedule.postsPerDay,
          phaseDelayMinutes: config.schedule.phaseDelayMinutes,
          timezone: config.schedule.timezone,
          cycleWeeks: config.schedule.cycleWeeks ?? 3,
          cycleWeekIndex: cycle.weekIndex,
          cycleLabel: cycle.label,
          isoWeek: cycle.isoWeek,
        },
        amounts: {
          packsCount: config.amounts.packs.length,
        },
        banks: {
          payout: config.banks.payoutBanks.map((b) => b.name),
          deposit: config.banks.depositBanks.map((b) => b.name),
        },
      },
      upcoming,
      queue,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
