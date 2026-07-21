import { NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { getEnv } from "@/lib/schemas/env";
import { getTelegramClient } from "@/lib/telegram/client";

export async function POST() {
  try {
    const env = getEnv();
    const client = getTelegramClient();
    const webhookUrl = `${env.APP_URL}/api/telegram/webhook`;

    await client.setWebhook(webhookUrl, env.TELEGRAM_WEBHOOK_SECRET);
    await client.setMyCommands([
      { command: "help", description: "Справка" },
      { command: "status", description: "Статус бота" },
      { command: "start_bot", description: "Запустить автопубликацию" },
      { command: "pause", description: "Пауза" },
      { command: "resume", description: "Продолжить" },
      { command: "stop", description: "Стоп" },
      { command: "projects", description: "Список проектов" },
      { command: "generate", description: "Сгенерировать отзыв: /generate nancy" },
      { command: "publish", description: "Сгенерировать и опубликовать" },
      { command: "queue", description: "В очередь планировщика" },
      { command: "config", description: "Конфиг" },
      { command: "logs", description: "Логи" },
    ]);
    const info = await client.getWebhookInfo();

    return NextResponse.json({
      ok: true,
      webhookUrl,
      info,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const client = getTelegramClient();
    await client.deleteWebhook();
    return NextResponse.json({ ok: true, message: "Webhook deleted" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    await bootstrapApp();
    const client = getTelegramClient();
    const [me, info] = await Promise.all([client.getMe(), client.getWebhookInfo()]);

    return NextResponse.json({
      bot: me,
      webhook: info,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
