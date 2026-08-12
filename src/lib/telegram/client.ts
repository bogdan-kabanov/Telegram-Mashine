import { readFileSync } from "fs";
import path from "path";

import { getOutboundFetch } from "@/lib/http/outbound-fetch";
import { getEnv } from "@/lib/schemas/env";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramApiError extends Error {
  readonly code: number | undefined;

  constructor(message: string, code?: number) {
    super(message);
    this.name = "TelegramApiError";
    this.code = code;
  }
}

export class TelegramClient {
  private readonly token: string;

  constructor(token?: string) {
    this.token = token ?? getEnv().TELEGRAM_BOT_TOKEN;
  }

  private async parseResponse<T>(response: Response, method: string): Promise<T> {
    const data = (await response.json()) as TelegramApiResponse<T>;
    if (!data.ok || data.result === undefined) {
      throw new TelegramApiError(data.description ?? `Telegram API error: ${method}`, data.error_code);
    }
    return data.result;
  }

  private async request<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const url = `${TELEGRAM_API_BASE}/bot${this.token}/${method}`;

    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    };
    if (body) {
      init.body = JSON.stringify(body);
    }

    const response = await getOutboundFetch()(url, init);
    return this.parseResponse<T>(response, method);
  }

  private async requestMultipart<T>(
    method: string,
    fields: Record<string, string>,
    files: Record<string, string>,
  ): Promise<T> {
    const url = `${TELEGRAM_API_BASE}/bot${this.token}/${method}`;
    const form = new FormData();

    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }

    for (const [key, filePath] of Object.entries(files)) {
      const buffer = readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime =
        ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".mp4" ? "video/mp4" : "image/jpeg";
      form.append(key, new Blob([buffer], { type: mime }), path.basename(filePath));
    }

    const response = await getOutboundFetch()(url, { method: "POST", body: form });
    return this.parseResponse<T>(response, method);
  }

  async getMe(): Promise<TelegramUser> {
    return this.request<TelegramUser>("getMe");
  }

  async sendMessage(params: {
    chatId: number | string;
    text: string;
    parseMode?: "HTML" | "MarkdownV2";
    replyMarkup?: Record<string, unknown>;
  }): Promise<TelegramMessage> {
    const body: Record<string, unknown> = {
      chat_id: params.chatId,
      text: params.text,
    };
    if (params.parseMode) body.parse_mode = params.parseMode;
    if (params.replyMarkup) body.reply_markup = params.replyMarkup;

    return this.request<TelegramMessage>("sendMessage", body);
  }

  async sendPhoto(params: {
    chatId: number | string;
    photo: string;
    caption?: string;
  }): Promise<TelegramMessage> {
    const body: Record<string, unknown> = {
      chat_id: params.chatId,
      photo: params.photo,
    };
    if (params.caption) body.caption = params.caption;

    return this.request<TelegramMessage>("sendPhoto", body);
  }

  async sendPhotoFile(params: {
    chatId: number | string;
    filePath: string;
    caption?: string;
  }): Promise<TelegramMessage> {
    const fields: Record<string, string> = {
      chat_id: String(params.chatId),
    };
    if (params.caption) fields.caption = params.caption;

    return this.requestMultipart<TelegramMessage>("sendPhoto", fields, { photo: params.filePath });
  }

  async sendMediaGroup(params: {
    chatId: number | string;
    media: Array<{ type: "photo"; media: string; caption?: string }>;
  }): Promise<TelegramMessage[]> {
    return this.request<TelegramMessage[]>("sendMediaGroup", {
      chat_id: params.chatId,
      media: params.media,
    });
  }

  async sendMediaGroupFiles(params: {
    chatId: number | string;
    filePaths: string[];
    caption?: string;
  }): Promise<TelegramMessage[]> {
    const media = params.filePaths.map((_, index) => ({
      type: "photo" as const,
      media: `attach://photo${index}`,
      ...(index === 0 && params.caption ? { caption: params.caption } : {}),
    }));

    const files: Record<string, string> = {};
    params.filePaths.forEach((filePath, index) => {
      files[`photo${index}`] = filePath;
    });

    return this.requestMultipart<TelegramMessage[]>("sendMediaGroup", {
      chat_id: String(params.chatId),
      media: JSON.stringify(media),
    }, files);
  }

  async sendVideoNoteFile(params: {
    chatId: number | string;
    filePath: string;
  }): Promise<TelegramMessage> {
    return this.requestMultipart<TelegramMessage>(
      "sendVideoNote",
      { chat_id: String(params.chatId) },
      { video_note: params.filePath },
    );
  }

  async pinChatMessage(params: {
    chatId: number | string;
    messageId: number;
    disableNotification?: boolean;
  }): Promise<boolean> {
    return this.request<boolean>("pinChatMessage", {
      chat_id: params.chatId,
      message_id: params.messageId,
      disable_notification: params.disableNotification ?? true,
    });
  }

  async setWebhook(url: string, secretToken: string): Promise<boolean> {
    return this.request<boolean>("setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    });
  }

  async deleteWebhook(): Promise<boolean> {
    return this.request<boolean>("deleteWebhook", { drop_pending_updates: true });
  }

  async getWebhookInfo(): Promise<{
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  }> {
    return this.request("getWebhookInfo");
  }

  async setMyCommands(
    commands: Array<{ command: string; description: string }>,
  ): Promise<boolean> {
    return this.request<boolean>("setMyCommands", { commands });
  }
}

let clientInstance: TelegramClient | null = null;

export function getTelegramClient(): TelegramClient {
  if (!clientInstance) {
    clientInstance = new TelegramClient();
  }
  return clientInstance;
}

export function isAdmin(userId: number): boolean {
  const env = getEnv();
  return env.TELEGRAM_ADMIN_IDS.includes(userId);
}
