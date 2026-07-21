import { loadAppConfig } from "@/lib/config/loader";
import { toPublicScreenshotUrl } from "@/lib/media/screenshot-url";
import { createLogger, getRuntimeManager } from "@/lib/runtime/manager";
import { getReviewPipeline } from "@/lib/pipeline";
import { getEnv } from "@/lib/schemas/env";
import { getTelegramClient, isAdmin, type TelegramMessage } from "@/lib/telegram/client";
import { getScheduler } from "@/modules/scheduler";

const logger = createLogger("commands");

type CommandHandler = (message: TelegramMessage, args: string[]) => Promise<string>;

const STATUS_LABEL: Record<string, string> = {
  running: "работает",
  paused: "пауза",
  stopped: "остановлен",
  error: "ошибка",
};

function helpText(): string {
  return [
    "<b>Управление</b>",
    "",
    "/status — статус",
    "/start_bot — запустить автопубликацию",
    "/pause — пауза",
    "/resume — продолжить",
    "/stop — стоп",
    "",
    "<b>Генерация</b>",
    "/projects — список проектов",
    "/generate nancy — создать отзыв (без публикации)",
    "/publish nancy — создать и опубликовать в канал",
    "/queue nancy — поставить в очередь",
    "",
    "/config — конфиг",
    "/logs — логи",
    "/help — справка",
  ].join("\n");
}

async function handleStart(): Promise<string> {
  return helpText();
}

async function handleStatus(): Promise<string> {
  const runtime = getRuntimeManager();
  const state = await runtime.getState();
  const label = STATUS_LABEL[state.status] ?? state.status;

  return [
    `<b>Статус:</b> ${label} (${state.status})`,
    `<b>Фаза:</b> ${state.currentPhase}`,
    `<b>Сгенерировано:</b> ${state.totalReviewsGenerated}`,
    `<b>Опубликовано:</b> ${state.totalReviewsPublished}`,
    `<b>Запущен:</b> ${state.lastStartedAt ?? "—"}`,
    `<b>Пауза:</b> ${state.lastPausedAt ?? "—"}`,
    state.lastError ? `<b>Ошибка:</b> ${state.lastError}` : "",
    `<b>Обновлено:</b> ${state.updatedAt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function handleStartBot(): Promise<string> {
  const runtime = getRuntimeManager();
  const scheduler = getScheduler();
  const state = await runtime.start();
  scheduler.startWorker(30_000);
  await logger.info("Bot started by admin command");
  return `Бот запущен. Статус: ${state.status}`;
}

async function handlePause(): Promise<string> {
  const runtime = getRuntimeManager();
  const state = await runtime.pause();
  await logger.info("Bot paused by admin command");
  return `Пауза. Статус: ${state.status}`;
}

async function handleResume(): Promise<string> {
  const runtime = getRuntimeManager();
  const scheduler = getScheduler();
  const state = await runtime.resume();
  scheduler.startWorker(30_000);
  await logger.info("Bot resumed by admin command");
  return `Продолжил работу. Статус: ${state.status}`;
}

async function handleStop(): Promise<string> {
  const runtime = getRuntimeManager();
  getScheduler().stopWorker();
  const state = await runtime.stop();
  await logger.info("Bot stopped by admin command");
  return `Остановлен. Статус: ${state.status}`;
}

async function handleConfig(): Promise<string> {
  const config = await loadAppConfig();
  const env = getEnv();

  return [
    "<b>Конфиг</b>",
    "",
    `Локаль: ${config.geo.defaultLocale}`,
    `Валюта: ${config.currencies.default}`,
    `Паков: ${config.amounts.packs.length}`,
    `Банков: ${config.banks.payoutBanks.length}`,
    `Постов/день: ${config.schedule.postsPerDay}`,
    `Задержка фаз: ${config.schedule.phaseDelayMinutes} мин`,
    `Канал: ${env.TELEGRAM_PUBLISH_CHANNEL_ID}`,
    `Проекты: ${config.projects.projects.map((p) => p.id).join(", ")}`,
  ].join("\n");
}

async function handleLogs(): Promise<string> {
  const runtime = getRuntimeManager();
  const logs = await runtime.getRecentLogs(10);

  if (logs.length === 0) {
    return "Логов пока нет.";
  }

  const lines = logs.map(
    (log) => `[${log.timestamp.slice(11, 19)}] [${log.level}] ${log.module}: ${log.message}`,
  );

  return ["<b>Логи:</b>", "", ...lines].join("\n");
}

async function handleProjects(): Promise<string> {
  const config = await loadAppConfig();
  const lines = config.projects.projects.map(
    (p) => `• <b>${p.id}</b> — ${p.name} (${p.managerHandle})${p.twoPhaseReview ? " · 2 фазы" : ""}`,
  );
  return ["<b>Проекты</b>", "", ...lines, "", "Пример: /generate nancy"].join("\n");
}

async function resolveProjectId(args: string[]): Promise<string> {
  const config = await loadAppConfig();
  const id = (args[0] ?? "").toLowerCase().trim();
  if (!id) {
    throw new Error(`Укажите проект. Доступно: ${config.projects.projects.map((p) => p.id).join(", ")}`);
  }
  const project = config.projects.projects.find((p) => p.id === id || p.name.toLowerCase() === id);
  if (!project) {
    throw new Error(`Проект не найден: ${id}. Доступно: ${config.projects.projects.map((p) => p.id).join(", ")}`);
  }
  return project.id;
}

function publicScreenshotUrls(paths: string[]): string[] {
  const base = getEnv().APP_URL.replace(/\/$/, "");
  return paths.map((p) => `${base}${toPublicScreenshotUrl(p)}`);
}

async function handleGenerate(_message: TelegramMessage, args: string[]): Promise<string> {
  const projectId = await resolveProjectId(args);
  const result = await getReviewPipeline().generateReview({
    projectId,
    reviewType: "big",
    autoPublish: false,
  });

  const urls = publicScreenshotUrls(result.screenshots).slice(0, 3);
  return [
    `<b>Готово</b> · ${projectId}`,
    `ID: <code>${result.reviewId}</code>`,
    `Скринов: ${result.screenshots.length}`,
    "",
    urls.length > 0 ? "Превью:" : "",
    ...urls,
  ]
    .filter(Boolean)
    .join("\n");
}

async function handlePublish(_message: TelegramMessage, args: string[]): Promise<string> {
  const projectId = await resolveProjectId(args);
  const runtime = getRuntimeManager();
  const state = await runtime.getState();

  if (state.status !== "running") {
    await runtime.start();
    getScheduler().startWorker(30_000);
  }

  const result = await getReviewPipeline().generateReview({
    projectId,
    reviewType: "big",
    autoPublish: true,
  });

  return [
    `<b>Опубликовано</b> · ${projectId}`,
    `ID: <code>${result.reviewId}</code>`,
    `Скринов: ${result.screenshots.length}`,
    `Фаза: ${result.phase}`,
    `Канал: ${getEnv().TELEGRAM_PUBLISH_CHANNEL_ID}`,
  ].join("\n");
}

async function handleQueue(_message: TelegramMessage, args: string[]): Promise<string> {
  const projectId = await resolveProjectId(args);
  const taskId = await getScheduler().triggerNow(projectId, "big");
  getScheduler().startWorker(30_000);

  const runtime = getRuntimeManager();
  const state = await runtime.getState();
  if (state.status !== "running") {
    await runtime.start();
  }

  return [
    `<b>В очереди</b> · ${projectId}`,
    `Task: <code>${taskId}</code>`,
    "Будет сгенерирован и опубликован при следующем тике планировщика (~30 сек).",
  ].join("\n");
}

const COMMANDS: Record<string, CommandHandler> = {
  "/start": async () => handleStart(),
  "/help": async () => handleStart(),
  "/status": async () => handleStatus(),
  "/start_bot": async () => handleStartBot(),
  "/pause": async () => handlePause(),
  "/resume": async () => handleResume(),
  "/stop": async () => handleStop(),
  "/config": async () => handleConfig(),
  "/logs": async () => handleLogs(),
  "/projects": async () => handleProjects(),
  "/generate": handleGenerate,
  "/publish": handlePublish,
  "/queue": handleQueue,
};

export async function handleTelegramMessage(message: TelegramMessage): Promise<void> {
  const client = getTelegramClient();
  const text = message.text?.trim();

  if (!text) return;

  const userId = message.from?.id;
  if (!userId || !isAdmin(userId)) {
    await client.sendMessage({
      chatId: message.chat.id,
      text: "Нет доступа.",
    });
    await logger.warn("Unauthorized access attempt", { userId });
    return;
  }

  const [command, ...args] = text.split(/\s+/);
  const normalizedCommand = (command?.toLowerCase() ?? "").split("@")[0] ?? "";

  const handler = COMMANDS[normalizedCommand];

  try {
    if (handler && (normalizedCommand === "/generate" || normalizedCommand === "/publish")) {
      await client.sendMessage({
        chatId: message.chat.id,
        text: "Генерация… это займёт 15–30 сек.",
      });
    }

    const response = handler
      ? await handler(message, args)
      : `Неизвестная команда: ${normalizedCommand}\n/help — список команд.`;

    await client.sendMessage({
      chatId: message.chat.id,
      text: response,
      parseMode: "HTML",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await logger.error("Command handler failed", { command: normalizedCommand, error: errorMessage });

    await client.sendMessage({
      chatId: message.chat.id,
      text: `Ошибка: ${errorMessage}`,
    });
  }
}
