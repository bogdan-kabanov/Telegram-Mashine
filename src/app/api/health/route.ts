import { NextResponse } from "next/server";

import { bootstrapApp, getBootstrapInfo } from "@/lib/bootstrap";
import { loadAppConfig } from "@/lib/config/loader";
import { getRuntimeManager } from "@/lib/runtime/manager";
import { getScheduler } from "@/modules/scheduler";

export async function GET() {
  try {
    await bootstrapApp();

    const [state, config, upcoming] = await Promise.all([
      getRuntimeManager().getState(),
      loadAppConfig(),
      getScheduler().getUpcomingTasks(3),
    ]);

    return NextResponse.json({
      status: "ok",
      ...getBootstrapInfo(),
      bot: state,
      config: {
        locale: config.geo.defaultLocale,
        currency: config.currencies.default,
        packsCount: config.amounts.packs.length,
        postsPerDay: config.schedule.postsPerDay,
        projects: config.projects.projects.map((p) => p.id),
      },
      scheduler: { upcoming },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}
