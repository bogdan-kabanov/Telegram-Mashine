import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { createLogger } from "@/lib/runtime/manager";
import { getEnv } from "@/lib/schemas/env";
import { handleTelegramMessage } from "@/lib/telegram/commands";
import type { TelegramUpdate } from "@/lib/telegram/client";

const logger = createLogger("webhook");

export async function POST(request: NextRequest) {
  try {
    const env = getEnv();
    const secret = request.headers.get("x-telegram-bot-api-secret-token");

    if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      await logger.warn("Webhook rejected — invalid secret token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await bootstrapApp();

    const update = (await request.json()) as TelegramUpdate;

    if (update.message) {
      await handleTelegramMessage(update.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await logger.error("Webhook processing failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "webhook_endpoint_ready",
    method: "POST",
    note: "Telegram sends updates via POST with X-Telegram-Bot-Api-Secret-Token header",
  });
}
