import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { toFile } from "openai";
import sharp from "sharp";

import { createLogger } from "@/lib/runtime/manager";
import { getEnv } from "@/lib/schemas/env";
import { getOpenAIClient, isOpenAIConfigured } from "./client";
import { getAiReceiptsMode, prepareReceiptEditCanvas, RECEIPT_EDIT_SIZE } from "./receipts";

const logger = createLogger("openai-bets");

/** Same gate as receipts: AI edit when receipts mode is not off + key present. */
export function isAiBetEditEnabled(): boolean {
  return getAiReceiptsMode() !== "off" && isOpenAIConfigured();
}

function formatBetAmount(amount: number, currency: string, locale = "es-MX"): string {
  try {
    const n = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(Math.round(amount));
    return `${n} ${currency}`.trim();
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

export function buildBetEditPrompt(params: {
  deposit: number;
  profit: number;
  currency: string;
  name?: string;
  locale?: string;
  sourceName?: string;
}): string {
  const locale = params.locale ?? "es-MX";
  const depositStr = formatBetAmount(params.deposit, params.currency, locale);
  const profitStr = formatBetAmount(params.profit, params.currency, locale);
  const profitPlus = profitStr.startsWith("+") ? profitStr : `+${profitStr}`;

  return [
    "Edit THIS input image with surgical text replacement only. Do not redesign it.",
    params.sourceName ? `Source file: ${params.sourceName}` : "",
    "This is a trading / investment / OKX-style bet card screenshot (or similar).",
    "MEDIUM LOCK: keep the EXACT same card, background, logo, pair title, layout, colors, and chrome.",
    "FORBIDDEN: redrawing the card, changing the crypto pair, inventing a new UI, adding Telegram chrome, watermarks, or caption boxes.",
    "CRITICAL — seamless in-painting of glyphs only, NOT stickers and NOT opaque plaques:",
    "Rewrite characters IN PLACE matching the EXACT typeface, weight, size, letter-spacing, and anti-aliasing of the original numbers.",
    "If the card is dark: new digits must stay light on dark (no white/gray rectangles behind text).",
    "If the card is light: new digits must stay dark on light (no dark boxes).",
    "FORBIDDEN: gray/white bars, frosted pills, soft blur blobs, Courier/monospace overlays that do not match the card font.",
    "SHARPNESS LOCK: digits must stay crisp and fully legible — same micro-contrast as the input.",
    `REPLACE the Depósito / Deposit / stake amount (digits AND currency) with EXACTLY: ${depositStr}`,
    `REPLACE the Ganancia / Profit / payout amount (digits AND currency) with EXACTLY: ${profitPlus}`,
    `CURRENCY LOCK: every money line must use ${params.currency} only.`,
    `If the template shows MXN, ARS, VES, USD, or any other code — REPLACE it with ${params.currency}.`,
    `FAILURE if any old currency code remains visible (e.g. MXN when target is ${params.currency}).`,
    "If a leading + is used on profit in the original, keep the +; otherwise match the original sign style.",
    params.name?.trim()
      ? `If a person name is shown on the card, REPLACE it with EXACTLY: ${params.name.trim()}`
      : "Do not invent a new person name if none is visible.",
    "Do not change any other labels, icons, charts, or decorative elements (except the money/currency text above).",
    "Same framing and crop as the input (no new margins, no letterboxing).",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Edit a pristine bet screenshot via gpt-image images.edit.
 * Never writes back to the library source — only to outputPath.
 */
export async function generateAiBetEdit(params: {
  imagePath: string;
  outputPath: string;
  deposit: number;
  profit: number;
  currency: string;
  name?: string;
  locale?: string;
}): Promise<{ path: string; model: string } | null> {
  if (!isAiBetEditEnabled()) return null;

  const client = getOpenAIClient();
  if (!client) return null;

  const abs = path.isAbsolute(params.imagePath)
    ? params.imagePath
    : path.resolve(params.imagePath);
  if (!existsSync(abs)) {
    await logger.warn("AI bet source missing", { imagePath: params.imagePath });
    return null;
  }

  const env = getEnv();
  const model = env.OPENAI_RECEIPT_IMAGE_MODEL;
  const prompt = buildBetEditPrompt({
    deposit: params.deposit,
    profit: params.profit,
    currency: params.currency,
    ...(params.name ? { name: params.name } : {}),
    ...(params.locale ? { locale: params.locale } : {}),
    sourceName: path.basename(abs),
  });

  try {
    // Reuse receipt portrait canvas — phone bet cards are the same aspect family.
    const prepared = await prepareReceiptEditCanvas(abs);
    const image = await toFile(prepared.buffer, "bet-edit.png", { type: "image/png" });

    const response = await client.images.edit({
      model,
      image,
      prompt,
      n: 1,
      size: `${RECEIPT_EDIT_SIZE.width}x${RECEIPT_EDIT_SIZE.height}`,
      // Low fidelity when swapping currency (MXN→RUB) — high often freezes old MXN glyphs.
      input_fidelity: params.currency.toUpperCase() === "MXN" ? "high" : "low",
      quality: "high",
      output_format: "png",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      await logger.warn("AI bet response missing b64_json", { model, source: path.basename(abs) });
      return null;
    }

    mkdirSync(path.dirname(params.outputPath), { recursive: true });
    writeFileSync(params.outputPath, Buffer.from(b64, "base64"));

    // Restore original aspect if the API returned the edit canvas size.
    try {
      const meta = await sharp(abs).rotate().metadata();
      const ow = meta.width ?? 0;
      const oh = meta.height ?? 0;
      if (ow > 0 && oh > 0) {
        const tmp = `${params.outputPath}.fit.png`;
        await sharp(params.outputPath)
          .resize(ow, oh, { fit: "fill", kernel: sharp.kernel.lanczos3 })
          .png()
          .toFile(tmp);
        try {
          unlinkSync(params.outputPath);
        } catch {
          /* ignore */
        }
        renameSync(tmp, params.outputPath);
      }
    } catch {
      /* keep API canvas size */
    }

    await logger.info("AI bet edited from pristine screenshot", {
      path: params.outputPath,
      model,
      source: abs,
      deposit: params.deposit,
      profit: params.profit,
    });

    return { path: params.outputPath, model };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown bet image error";
    await logger.warn("AI bet edit failed", {
      error: message,
      model,
      source: abs,
    });
    return null;
  }
}
