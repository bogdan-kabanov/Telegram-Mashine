import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { getRuntimeManager } from "@/lib/runtime/manager";
import { getScheduler } from "@/modules/scheduler";

export async function POST(request: NextRequest) {
  try {
    await bootstrapApp();
    const body = (await request.json()) as { action?: string };
    const runtime = getRuntimeManager();
    const scheduler = getScheduler();

    switch (body.action) {
      case "start": {
        const state = await runtime.start();
        scheduler.startWorker(30_000);
        return NextResponse.json({ message: "Бот запущен", state });
      }
      case "pause": {
        const state = await runtime.pause();
        return NextResponse.json({ message: "Бот приостановлен", state });
      }
      case "resume": {
        const state = await runtime.resume();
        scheduler.startWorker(30_000);
        return NextResponse.json({ message: "Бот возобновлён", state });
      }
      case "stop": {
        scheduler.stopWorker();
        const state = await runtime.stop();
        return NextResponse.json({ message: "Бот остановлен", state });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
