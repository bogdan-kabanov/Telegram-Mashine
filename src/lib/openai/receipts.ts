import { createReadStream, existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { toFile } from "openai";

import { formatAmount } from "@/lib/format";
import { createLogger } from "@/lib/runtime/manager";
import { getEnv } from "@/lib/schemas/env";
import type { ProjectConfig } from "@/lib/schemas/projects";
import { getOpenAIClient, isOpenAIConfigured } from "./client";

const logger = createLogger("openai-receipts");

export type ReceiptRole = "client" | "manager";
export type AiReceiptsMode = "off" | "fallback" | "always";

export function getAiReceiptsMode(): AiReceiptsMode {
  return getEnv().AI_RECEIPTS;
}

export function isAiReceiptsEnabled(): boolean {
  return getAiReceiptsMode() !== "off" && isOpenAIConfigured();
}

export function resolveReceiptTemplatesDir(projectId: string, dataDir?: string): string {
  const root = dataDir ?? getEnv().DATA_DIR;
  return path.resolve(root, "media/receipt_templates", projectId);
}

/**
 * Pick a random reference template allowed for this role (Vlad rules).
 */
export function pickReceiptTemplate(params: {
  project: ProjectConfig;
  role: ReceiptRole;
  /** Override DATA_DIR (tests). */
  dataDir?: string;
}): { filename: string; absPath: string } | null {
  const files = params.project.receiptTemplates?.[params.role];
  if (!files?.length) return null;

  const dir = resolveReceiptTemplatesDir(params.project.id, params.dataDir);
  const existing = files
    .map((filename) => ({ filename, absPath: path.join(dir, filename) }))
    .filter((item) => existsSync(item.absPath));

  if (!existing.length) {
    return null;
  }

  return existing[Math.floor(Math.random() * existing.length)]!;
}

function formatReceiptAmount(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: currency === "VES" || currency === "ARS" ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return formatAmount(amount, currency);
  }
}

function buildReceiptEditPrompt(params: {
  role: ReceiptRole;
  amount: number;
  currency: string;
  locale: string;
  senderName: string;
  recipientName: string;
  accountLastDigits: string;
  date: string;
  time: string;
  bankName?: string;
  clabe?: string;
}): string {
  const amountStr = formatReceiptAmount(params.amount, params.currency, params.locale);
  const digits = params.accountLastDigits.replace(/\D/g, "").slice(-4).padStart(4, "0");
  const roleHint =
    params.role === "client"
      ? "This is a client deposit payment proof (captura) sent by the client."
      : "This is a manager payout transfer receipt sent by the manager to the client.";

  return [
    "Edit this bank transfer receipt screenshot to show a new realistic transaction.",
    "Keep the EXACT same app UI, layout, colors, logos, icons, fonts, spacing, and button styles.",
    "CRITICAL FRAMING: full-bleed mobile screenshot — fill the entire canvas edge-to-edge.",
    "No white margins, no letterboxing, no floating card on a blank background, no extra borders around the phone UI.",
    "Crop tightly like a real phone screenshot of the bank app (portrait). Do not shrink the receipt into the center.",
    "Do not invent a different bank app. Only change the variable transaction fields.",
    roleHint,
    `Amount: ${amountStr} ${params.currency} (use the same amount formatting style as the template: separators, decimals, currency symbol/code placement).`,
    `Sender / origin name: ${params.senderName}`,
    `Recipient / destination name: ${params.recipientName}`,
    params.bankName ? `Bank / institution labels where relevant: ${params.bankName}` : "",
    `Account / CLABE / CBU last 4 digits visible where the template shows digits: ${digits}`,
    params.clabe ? `If a full CLABE/CBU is shown masked, keep masking but end with ${digits}.` : "",
    `Date: ${params.date}`,
    `Time: ${params.time} (24h or am/pm — match the template style exactly)`,
    "Replace any redacted bars with plausible short reference/operation IDs OR keep similar solid redaction bars.",
    "Photorealistic mobile screenshot, sharp text, no captions, no AI watermark, no Telegram chrome.",
  ]
    .filter(Boolean)
    .join("\n");
}

export type GenerateAiReceiptParams = {
  project: ProjectConfig;
  role: ReceiptRole;
  amount: number;
  currency: string;
  senderName: string;
  recipientName: string;
  accountLastDigits: string;
  date: string;
  time: string;
  bankName?: string;
  clabe?: string;
  /** Absolute output path (.png). */
  outputPath: string;
};

/**
 * Generate a bank slip via OpenAI images.edit using a project reference template.
 * Returns null when AI is disabled, unconfigured, or generation fails.
 */
export async function generateAiReceipt(
  params: GenerateAiReceiptParams,
): Promise<{ path: string; template: string; model: string } | null> {
  if (!isAiReceiptsEnabled()) return null;

  const client = getOpenAIClient();
  if (!client) return null;

  const template = pickReceiptTemplate({ project: params.project, role: params.role });
  if (!template) {
    await logger.warn("No receipt template file for AI generation", {
      projectId: params.project.id,
      role: params.role,
    });
    return null;
  }

  const env = getEnv();
  const model = env.OPENAI_RECEIPT_IMAGE_MODEL;
  const prompt = buildReceiptEditPrompt({
    role: params.role,
    amount: params.amount,
    currency: params.currency,
    locale: params.project.locale,
    senderName: params.senderName,
    recipientName: params.recipientName,
    accountLastDigits: params.accountLastDigits,
    date: params.date,
    time: params.time,
    ...(params.bankName ? { bankName: params.bankName } : {}),
    ...(params.clabe ? { clabe: params.clabe } : {}),
  });

  try {
    const image = await toFile(createReadStream(template.absPath), template.filename, {
      type: "image/jpeg",
    });

    const response = await client.images.edit({
      model,
      image,
      prompt,
      n: 1,
      size: "1024x1536",
      // High fidelity keeps bank UI details from the reference.
      input_fidelity: "high",
      quality: "high",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      await logger.warn("AI receipt response missing b64_json", { model, template: template.filename });
      return null;
    }

    mkdirSync(path.dirname(params.outputPath), { recursive: true });
    writeFileSync(params.outputPath, Buffer.from(b64, "base64"));

    try {
      const { trimWhitespaceInPlace } = await import("@/lib/media/trim-image");
      await trimWhitespaceInPlace(params.outputPath, { threshold: 22, padding: 6 });
    } catch {
      // trim is best-effort; keep original if sharp fails
    }

    await logger.info("AI receipt generated", {
      path: params.outputPath,
      model,
      template: template.filename,
      role: params.role,
      projectId: params.project.id,
    });

    return { path: params.outputPath, template: template.filename, model };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown receipt image error";
    await logger.warn("AI receipt generation failed", {
      error: message,
      model,
      template: template.filename,
      projectId: params.project.id,
      role: params.role,
    });
    return null;
  }
}

/** Convenience id for generated files (unused externally). */
export function newReceiptAssetId(): string {
  return randomUUID();
}
