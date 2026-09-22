import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { toFile } from "openai";
import sharp from "sharp";

import { formatAmount } from "@/lib/format";
import { assertNotReceiptTemplatePath } from "@/lib/media/slip-source";
import { createLogger } from "@/lib/runtime/manager";
import { getEnv } from "@/lib/schemas/env";
import type { ProjectConfig } from "@/lib/schemas/projects";
import { getOpenAIClient, isOpenAIConfigured } from "./client";

const logger = createLogger("openai-receipts");

/** Portrait canvas gpt-image-1 uses for paper slips — keep glyphs as large as possible. */
export const RECEIPT_EDIT_SIZE = { width: 1024, height: 1536 } as const;

export type ReceiptRole = "client" | "manager";
export type AiReceiptsMode = "off" | "fallback" | "always";
export type ReceiptMedium = "paper" | "app";

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
 * Paper photos vs clean app screenshots — drives the edit prompt + fidelity.
 * Filenames like 04_spin_detail.jpg are thermal-paper photos, not Spin app UI.
 */
export function inferReceiptMedium(filenameOrPath: string): ReceiptMedium {
  const name = path.basename(filenameOrPath).toLowerCase();
  // Thermal / hand-held paper photos (OXXO caja, Spin ticket, detail crops).
  if (
    /detail|papel|paper|ticket|thermal|caja|foto|photo|hand|scan|impreso|recibo_foto|oxxo/.test(
      name,
    )
  ) {
    return "paper";
  }
  return "app";
}

/**
 * Pick a random reference template allowed for this role (Vlad rules).
 */
export function pickReceiptTemplate(params: {
  project: ProjectConfig;
  role: ReceiptRole;
  /** Override DATA_DIR (tests). */
  dataDir?: string;
  /** Prefer paper or app templates when several exist. */
  preferMedium?: ReceiptMedium;
  /** Force an exact filename from the project's list. */
  forceFilename?: string;
}): { filename: string; absPath: string } | null {
  const files = params.project.receiptTemplates?.[params.role];
  if (!files?.length) return null;

  const dir = resolveReceiptTemplatesDir(params.project.id, params.dataDir);
  let existing = files
    .map((filename) => ({ filename, absPath: path.join(dir, filename) }))
    .filter((item) => existsSync(item.absPath));

  if (!existing.length) {
    return null;
  }

  if (params.forceFilename) {
    const forced = existing.find((e) => e.filename === params.forceFilename);
    if (forced) return forced;
  }

  if (params.preferMedium) {
    const matched = existing.filter(
      (e) => inferReceiptMedium(e.filename) === params.preferMedium,
    );
    if (matched.length) existing = matched;
  }

  return existing[Math.floor(Math.random() * existing.length)]!;
}

/**
 * Use a project receipt template as-is (PNG). Prefer this over HTML stubs when
 * OpenAI image edit is unavailable (e.g. region 403 on the VPS).
 */
export async function materializeReceiptTemplate(params: {
  project: ProjectConfig;
  role: ReceiptRole;
  outputPath: string;
  dataDir?: string;
  templateFilename?: string;
}): Promise<{ path: string; template: string } | null> {
  assertNotReceiptTemplatePath(params.outputPath);

  const template = pickReceiptTemplate({
    project: params.project,
    role: params.role,
    ...(params.dataDir ? { dataDir: params.dataDir } : {}),
    ...(params.templateFilename ? { forceFilename: params.templateFilename } : {}),
  });
  if (!template) return null;

  mkdirSync(path.dirname(params.outputPath), { recursive: true });
  const fileExt = path.extname(template.absPath).toLowerCase();
  if (fileExt === ".png") {
    copyFileSync(template.absPath, params.outputPath);
  } else {
    await sharp(template.absPath).png().toFile(params.outputPath);
  }

  await logger.warn("Using receipt template as-is (AI edit unavailable)", {
    projectId: params.project.id,
    role: params.role,
    template: template.filename,
    path: params.outputPath,
  });

  return { path: params.outputPath, template: template.filename };
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

/**
 * Upscale/downscale template to the edit canvas with Lanczos.
 * Used only for AI images.edit — originals on disk are never modified.
 */
export async function prepareReceiptEditCanvas(absPath: string): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  const { width, height } = RECEIPT_EDIT_SIZE;
  // fill (not contain): letterboxed margins make gpt-image ignore thermal text edits.
  const buffer = await sharp(absPath)
    .rotate()
    .resize(width, height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { buffer, width, height };
}

/**
 * Surgical text edit of one template image — never redesign / swap medium.
 */
export function buildReceiptEditPrompt(params: {
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
  medium?: ReceiptMedium;
  templateName?: string;
}): string {
  const amountStr = formatReceiptAmount(params.amount, params.currency, params.locale);
  const digits = params.accountLastDigits.replace(/\D/g, "").slice(-4).padStart(4, "0");
  const medium = params.medium ?? "app";
  const roleHint =
    params.role === "client"
      ? "This is a client deposit payment proof (captura) sent by the client."
      : "This is a manager payout transfer receipt sent by the manager to the client.";

  const feeTotal = 12;
  const pagoTotal = params.amount + feeTotal;
  const pagoStr = formatReceiptAmount(pagoTotal, params.currency, params.locale);
  const isOxxoPaper =
    medium === "paper" &&
    /oxxo|spin|papel|caja|thermal|ticket/i.test(params.templateName ?? "");

  const mediumRules =
    medium === "paper"
      ? [
          "MEDIUM LOCK — PAPER PHOTO: the input is a photograph of a physical thermal/paper receipt.",
          "The output MUST remain that SAME paper photograph (wrinkles, shadows, camera blur, ink grain).",
          "FORBIDDEN: replacing it with a clean digital banking app UI, Spin-by-OXXO card, Mercado Pago screen, or any redrawn interface.",
          "Only rewrite the printed glyphs on the paper (amount, names, date/time, last-4). Everything else stays pixel-faithful to the input photo.",
        ]
      : [
          "MEDIUM LOCK — APP SCREENSHOT: keep the exact same bank/fintech app UI, layout, colors, logos, and chrome.",
          "FORBIDDEN: turning it into a paper receipt photo, or switching to a different app.",
          "Only rewrite the on-screen text fields listed below.",
        ];

  const oxxoAmountRules = isOxxoPaper
    ? [
        "OXXO / SPIN thermal deposit slip — MANDATORY money lines (do not leave template figures):",
        `MONTO (deposit) MUST become EXACTLY: $ ${amountStr}  (or $ ${amountStr} M.N. if that suffix is already used).`,
        `PAGO TOTAL MUST become EXACTLY: $ ${pagoStr}  (= MONTO + $12.00 commission).`,
        "Keep COMISION DEPOSITO $10.34, IVA $1.66, TOTAL COMISION $12.00 unchanged unless the layout forces redraw — never overwrite them with the deposit amount.",
        "FAILURE if any old MONTO/PAGO TOTAL digits from the template remain readable (e.g. 650.00 / 662.00).",
      ]
    : [
        `REPLACE amount / total / sent value with EXACTLY: ${amountStr} ${params.currency} (same separators/decimals style as nearby amounts on this image).`,
        "If several amounts appear (fee, total, sent), make the PRIMARY/total amount match the value above; do not leave the template's old primary figure prominent.",
      ];

  return [
    "Edit THIS input image with surgical text replacement. Do not redesign it.",
    params.templateName ? `Source template file: ${params.templateName}` : "",
    "The file is a TEMPLATE: names, amounts, dates, times, and account tails printed on it are PLACEHOLDER TEXT and MUST be overwritten.",
    "Do NOT copy, keep, or slightly tweak the original person's name, the original amount, or the original last-4 digits. Those values are wrong.",
    ...mediumRules,
    "CRITICAL — seamless in-painting of glyphs only, NOT a sticker and NOT a new mockup:",
    "Rewrite characters IN PLACE matching the EXACT typeface, weight, letter-spacing, ink density, and anti-aliasing of neighboring text.",
    "If thermal/dot-matrix ink: new text must look equally grainy and uneven — never a sharp UI font floating on top.",
    "SHARPNESS LOCK: every digit and letter must stay crisp and fully legible at 100% zoom — same micro-contrast as the input.",
    "FORBIDDEN: soft focus, soap/blur, denoise that melts thermal print, foggy halos around glyphs, global smoothing.",
    "FORBIDDEN: gray/white bars, opaque rectangles, translucent overlays, soft blur blobs, frosted pills, caption boxes, watermarks, Telegram chrome.",
    "Do not invent a different bank, brand, or layout. Same framing and crop as the input (no new margins, no letterboxing).",
    roleHint,
    ...oxxoAmountRules,
    `REPLACE sender / origin / "De" / "From" name with EXACTLY: ${params.senderName}`,
    `REPLACE recipient / destination / "Para" / "To" / "Beneficiario" / "a …" name with EXACTLY: ${params.recipientName}`,
    params.bankName ? `Bank / institution labels where already present: ${params.bankName}` : "",
    `REPLACE visible account / CLABE / CBU last 4 digits with EXACTLY: ${digits}`,
    params.clabe
      ? `If a full CLABE/CBU is shown masked, keep masking but the visible tail MUST be ${digits}.`
      : "",
    `REPLACE date with: ${params.date}`,
    `REPLACE time with: ${params.time} (this exact clock; 24-hour HH:mm unless the template clearly shows am/pm)`,
    "Fields like AUTORIZACION / FOLIO / REFERENCIA / OPERACION / ATENDIDO POR: keep existing digits OR rewrite with short plausible IDs in the SAME thermal typeface — never leave empty, blurred, or smudged gray patches.",
    "If the template already has a solid black censor bar, you may keep ONE solid black bar of the same size; never invent soft gray smudges.",
    "Result must look like the original image with only those fields changed — not a newly generated receipt.",
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
  /** Prefer paper or app when picking a random template. */
  preferMedium?: ReceiptMedium;
  /** Force a specific template filename under receipt_templates/{projectId}/ */
  templateFilename?: string;
};

/**
 * Generate a bank slip via OpenAI images.edit using a PRISTINE project template.
 * Always reads from receipt_templates/; never writes there — outputPath must be under capturas/receipts.
 */
export async function generateAiReceipt(
  params: GenerateAiReceiptParams,
): Promise<{ path: string; template: string; model: string; medium: ReceiptMedium } | null> {
  if (!isAiReceiptsEnabled()) return null;

  const client = getOpenAIClient();
  if (!client) return null;

  assertNotReceiptTemplatePath(params.outputPath);

  const template = pickReceiptTemplate({
    project: params.project,
    role: params.role,
    ...(params.preferMedium ? { preferMedium: params.preferMedium } : {}),
    ...(params.templateFilename ? { forceFilename: params.templateFilename } : {}),
  });
  if (!template) {
    await logger.warn("No receipt template file for AI generation", {
      projectId: params.project.id,
      role: params.role,
    });
    return null;
  }

  const medium = inferReceiptMedium(template.filename);
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
    medium,
    templateName: template.filename,
    ...(params.bankName ? { bankName: params.bankName } : {}),
    ...(params.clabe ? { clabe: params.clabe } : {}),
  });

  try {
    // Fresh buffer from pristine disk file every time — never from a previous AI PNG.
    const prepared = await prepareReceiptEditCanvas(template.absPath);
    const image = await toFile(prepared.buffer, "receipt-edit.png", {
      type: "image/png",
    });

    const response = await client.images.edit({
      model,
      image,
      prompt,
      n: 1,
      size: `${RECEIPT_EDIT_SIZE.width}x${RECEIPT_EDIT_SIZE.height}`,
      // Paper thermal: high fidelity often freezes old MONTO digits — allow freer glyph rewrite.
      input_fidelity: medium === "paper" ? "low" : "high",
      quality: "high",
      output_format: "png",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      await logger.warn("AI receipt response missing b64_json", {
        model,
        template: template.filename,
      });
      return null;
    }

    mkdirSync(path.dirname(params.outputPath), { recursive: true });
    writeFileSync(params.outputPath, Buffer.from(b64, "base64"));

    await logger.info("AI receipt generated from pristine template", {
      path: params.outputPath,
      model,
      template: template.filename,
      templateAbs: template.absPath,
      medium,
      role: params.role,
      projectId: params.project.id,
      fidelity: "high",
    });

    return { path: params.outputPath, template: template.filename, model, medium };
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
