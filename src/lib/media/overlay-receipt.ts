import { existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import path from "path";
import sharp from "sharp";
import Tesseract from "tesseract.js";

import { createLogger } from "@/lib/runtime/manager";
import { pickReceiptTemplate } from "@/lib/openai/receipts";
import { assertNotReceiptTemplatePath } from "@/lib/media/slip-source";
import type { ProjectConfig } from "@/lib/schemas/projects";
import {
  parseLooseMoney,
  planBetReplacements,
  planReceiptReplacements,
  type BetOverlayValues,
  type OcrWord,
  type OverlayBox,
  type OverlayFieldValues,
} from "./receipt-fields";

const logger = createLogger("overlay-receipt");

export type OverlayReceiptParams = OverlayFieldValues & {
  project: ProjectConfig;
  outputPath: string;
  dataDir?: string;
  /** Force pristine template filename under receipt_templates/{projectId}/ */
  templateFilename?: string;
  preferMedium?: "paper" | "app";
};

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

function pixelAt(
  data: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  channels: number,
): [number, number, number] | null {
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const i = (y * width + x) * channels;
  return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
}

function sampleInk(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  box: OverlayBox,
  bg: [number, number, number],
): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const bgL = (bg[0] + bg[1] + bg[2]) / 3;
  for (let y = Math.floor(box.y0); y <= Math.ceil(box.y1); y++) {
    for (let x = Math.floor(box.x0); x <= Math.ceil(box.x1); x++) {
      const px = pixelAt(data, width, height, x, y, channels);
      if (!px) continue;
      const l = (px[0] + px[1] + px[2]) / 3;
      if (Math.abs(l - bgL) < 28) continue;
      rs.push(px[0]);
      gs.push(px[1]);
      bs.push(px[2]);
    }
  }
  if (rs.length < 8) return bgL > 140 ? [30, 34, 42] : [245, 245, 245];
  return [median(rs), median(gs), median(bs)];
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let workerPromise: Promise<Tesseract.Worker> | null = null;
let warmPromise: Promise<void> | null = null;

/** Cold start can be slow in Docker; models should be baked into the image. */
const OCR_TIMEOUT_MS = 180_000;
const OCR_WARM_TIMEOUT_MS = 120_000;

const TESSERACT_CORE_WASM = [
  "tesseract-core-relaxedsimd-lstm.wasm",
  "tesseract-core-relaxedsimd.wasm",
  "tesseract-core-simd-lstm.wasm",
  "tesseract-core-lstm.wasm",
  "tesseract-core-simd.wasm",
  "tesseract-core.wasm",
] as const;

function tesseractCoreDir(): string {
  return path.join(process.cwd(), "node_modules/tesseract.js-core");
}

function tesseractCachePath(): string {
  const baked = path.join(process.cwd(), "tessdata");
  if (existsSync(path.join(baked, "eng.traineddata")) && existsSync(path.join(baked, "spa.traineddata"))) {
    return baked;
  }
  // Dev / legacy: models at repo root next to package.json
  return process.cwd();
}

function assertTesseractCoreWasm(): void {
  const coreDir = tesseractCoreDir();
  const missing = TESSERACT_CORE_WASM.filter((file) => !existsSync(path.join(coreDir, file)));
  if (missing.length > 0) {
    throw new Error(
      `OCR WASM не найден (${missing.join(", ")}). Проверьте node_modules/tesseract.js-core в Docker-образе.`,
    );
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} (${Math.round(ms / 1000)} с)`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function tesseractWorkerPath(): string {
  const candidate = path.join(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/index.js");
  if (!existsSync(candidate)) {
    throw new Error(`Не найден OCR-воркер: ${candidate}`);
  }
  return candidate;
}

async function resetOcrWorker(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await Promise.race([
      pending,
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 800);
      }),
    ]);
    if (worker) await worker.terminate();
  } catch {
    // hung createWorker — drop it
  }
}

async function getOcrWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      assertTesseractCoreWasm();
      const cachePath = tesseractCachePath();
      const started = Date.now();
      const worker = await Tesseract.createWorker("spa+eng", 1, {
        logger: (m) => {
          if (m.status === "loading tesseract core" || m.status === "initializing tesseract") {
            void logger.info("OCR worker loading", { status: m.status, progress: m.progress });
          }
        },
        workerPath: tesseractWorkerPath(),
        // Prefer pre-baked spa+eng.traineddata (no CDN download at runtime).
        langPath: cachePath,
        cachePath,
        gzip: false,
        errorHandler: (err) => {
          void logger.warn("OCR worker error", { error: String(err) });
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        preserve_interword_spaces: "1",
      });
      await logger.info("OCR worker ready", { ms: Date.now() - started, cachePath });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return withTimeout(workerPromise, OCR_TIMEOUT_MS, "OCR не запустился");
}

/** Pre-load OCR worker at app boot so constructor pipeline does not hit cold-start hangs. */
export async function warmOcrWorker(): Promise<void> {
  if (warmPromise) return warmPromise;
  warmPromise = (async () => {
    try {
      await withTimeout(getOcrWorker(), OCR_WARM_TIMEOUT_MS, "OCR прогрев не удался");
      await logger.info("OCR worker pre-warmed");
    } catch (error) {
      warmPromise = null;
      const message = error instanceof Error ? error.message : String(error);
      await logger.error("OCR worker pre-warm failed", { error: message });
      throw error;
    }
  })();
  return warmPromise;
}

export async function ocrWords(imagePath: string): Promise<OcrWord[]> {
  const worker = await getOcrWorker();
  let result: Tesseract.RecognizeResult;
  try {
    result = await withTimeout(
      worker.recognize(imagePath, {}, { text: true, blocks: true }),
      OCR_TIMEOUT_MS,
      "OCR завис на картинке",
    );
  } catch (err) {
    await resetOcrWorker();
    throw err;
  }
  const words: OcrWord[] = [];
  let lineIdx = 0;
  for (const block of result.data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = (word.text ?? "").trim();
          if (!text) continue;
          words.push({
            text,
            x0: word.bbox.x0,
            y0: word.bbox.y0,
            x1: word.bbox.x1,
            y1: word.bbox.y1,
            line: lineIdx,
            conf: word.confidence,
          });
        }
        lineIdx += 1;
      }
    }
  }
  return words;
}

type PaintSurface = "paper" | "screen" | "auto";

function sampleRingPixels(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  box: OverlayBox,
  pad: number,
): Array<[number, number, number, number]> {
  const samples: Array<[number, number, number, number]> = [];
  const x0 = Math.max(0, Math.floor(box.x0) - pad);
  const y0 = Math.max(0, Math.floor(box.y0) - pad);
  const x1 = Math.min(width - 1, Math.ceil(box.x1) + pad);
  const y1 = Math.min(height - 1, Math.ceil(box.y1) + pad);
  const innerX0 = Math.floor(box.x0);
  const innerY0 = Math.floor(box.y0);
  const innerX1 = Math.ceil(box.x1);
  const innerY1 = Math.ceil(box.y1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x >= innerX0 && x <= innerX1 && y >= innerY0 && y <= innerY1) continue;
      const px = pixelAt(data, width, height, x, y, channels);
      if (!px) continue;
      const lum = (px[0] + px[1] + px[2]) / 3;
      samples.push([px[0], px[1], px[2], lum]);
    }
  }
  return samples;
}

/** Decide cover strategy from pixels around the glyph — works for dark OKX and light cards. */
function detectSurfaceFromRing(
  samples: Array<[number, number, number, number]>,
): "paper" | "screen" {
  if (samples.length === 0) return "paper";
  const lum = median(samples.map((s) => s[3]!));
  // Mid-gray and below → dark UI; bright surrounds → light/paper.
  return lum < 130 ? "screen" : "paper";
}

function samplePaperBgFromRing(
  samples: Array<[number, number, number, number]>,
): [number, number, number] {
  if (samples.length === 0) return [248, 246, 240];
  // Thermal / light UI — brightest quartile, not a gray average of ink+paper.
  const sorted = [...samples].sort((a, b) => b[3]! - a[3]!);
  const top = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.35)));
  let r = median(top.map((s) => s[0]!));
  let g = median(top.map((s) => s[1]!));
  let b = median(top.map((s) => s[2]!));
  const lum = (r + g + b) / 3;
  // Shadowed wrinkles read as gray plaques — pull cover toward paper white.
  if (lum < 230) {
    const t = Math.min(1, (230 - lum) / 80);
    r = Math.round(r * (1 - t) + 252 * t);
    g = Math.round(g * (1 - t) + 250 * t);
    b = Math.round(b * (1 - t) + 245 * t);
  }
  return [r, g, b];
}

function sampleScreenBgFromRing(
  samples: Array<[number, number, number, number]>,
): [number, number, number] {
  if (samples.length === 0) return [12, 14, 18];
  const sorted = [...samples].sort((a, b) => a[3]! - b[3]!);
  const dark = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.4)));
  let r = median(dark.map((s) => s[0]!));
  let g = median(dark.map((s) => s[1]!));
  let b = median(dark.map((s) => s[2]!));
  const lum = (r + g + b) / 3;
  // Anti-aliased white glyphs can lighten the ring — bias back to charcoal.
  if (lum > 45) {
    const t = Math.min(1, (lum - 45) / 90);
    r = Math.round(r * (1 - t) + 14 * t);
    g = Math.round(g * (1 - t) + 16 * t);
    b = Math.round(b * (1 - t) + 20 * t);
  }
  return [r, g, b];
}

async function paintBoxes(
  imagePath: string,
  outputPath: string,
  boxes: OverlayBox[],
  surface: PaintSurface = "paper",
): Promise<void> {
  const { data, info } = await sharp(imagePath).rotate().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  // Bets/UI stamps: proportional sans. Receipts stay monospace unless a box is dark.
  const preferUiFont = surface === "auto" || surface === "screen";

  const rects: string[] = [];
  const texts: string[] = [];
  for (const box of boxes) {
    const pad = Math.max(1, Math.round((box.y1 - box.y0) * 0.04));
    const ring = sampleRingPixels(data, width, height, channels, box, pad + 3);
    const mode: "paper" | "screen" =
      surface === "auto" ? detectSurfaceFromRing(ring) : surface === "screen" ? "screen" : "paper";
    const isScreen = mode === "screen";
    const bg = isScreen ? sampleScreenBgFromRing(ring) : samplePaperBgFromRing(ring);
    const fg = sampleInk(data, width, height, channels, box, bg);
    const useUiFont = preferUiFont || isScreen;
    const fontFamily = useUiFont
      ? "'Segoe UI', Arial, Helvetica, sans-serif"
      : "'Courier New', Courier, 'Consolas', monospace";
    const coverPad = Math.max(0, Math.round(pad * (isScreen ? 0.2 : 0.35)));
    let cx = Math.max(0, box.x0 - coverPad);
    const cy = Math.max(0, box.y0 - coverPad);
    let cw = Math.min(width - cx, box.x1 - box.x0 + coverPad * 2);
    const ch = Math.min(height - cy, box.y1 - box.y0 + coverPad * 2);
    const fontSize = Math.max(10, Math.round(ch * (isScreen ? 0.78 : 0.72)));
    if (box.kind === "amount" || box.kind === "deposit" || box.kind === "profit" || box.kind === "digits") {
      const charW = useUiFont ? 0.52 : 0.62;
      const need = Math.ceil(fontSize * Math.max(box.text.length, 4) * charW);
      if (need > cw) {
        const grow = need - cw;
        if (box.align === "right") {
          cx = Math.max(0, cx - grow);
          cw = Math.min(width - cx, need);
        } else {
          cw = Math.min(width - cx, need);
        }
      }
    }
    const weight =
      box.kind === "amount" || box.kind === "deposit" || box.kind === "profit" ? 700 : 600;
    rects.push(
      `<rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" fill="${rgbToHex(bg[0], bg[1], bg[2])}"/>`,
    );
    let anchor = "start";
    let tx = cx + Math.max(1, coverPad + 1);
    if (box.align === "right") {
      anchor = "end";
      tx = cx + cw - Math.max(1, coverPad + 1);
    } else if (box.align === "center") {
      anchor = "middle";
      tx = cx + cw / 2;
    }
    const ty = cy + ch * (isScreen ? 0.76 : 0.78);
    texts.push(
      `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${weight}" fill="${rgbToHex(fg[0], fg[1], fg[2])}">${escapeXml(box.text)}</text>`,
    );
  }

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects.join("")}${texts.join("")}</svg>`,
  );

  mkdirSync(path.dirname(outputPath), { recursive: true });
  await sharp(imagePath).rotate().composite([{ input: svg, top: 0, left: 0 }]).png().toFile(outputPath);
}

/**
 * Stamp amount/date/digits onto an AI-edited slip using OCR boxes from the
 * pristine template (scaled to the AI canvas). AI often keeps old MONTO figures;
 * template OCR is reliable for those glyph boxes.
 */
export async function stampAiSlipFromTemplatePlan(params: {
  templateAbsPath: string;
  aiImagePath: string;
  amount: number;
  currency: string;
  senderName: string;
  recipientName: string;
  accountLastDigits: string;
  date: string;
  time: string;
  role: "client" | "manager";
}): Promise<{ fields: OverlayBox["kind"][] } | null> {
  try {
    const words = await ocrWords(params.templateAbsPath);
    const tplMeta = await sharp(params.templateAbsPath).rotate().metadata();
    const aiMeta = await sharp(params.aiImagePath).rotate().metadata();
    const tw = tplMeta.width ?? 0;
    const th = tplMeta.height ?? 0;
    const aw = aiMeta.width ?? 0;
    const ah = aiMeta.height ?? 0;
    if (!tw || !th || !aw || !ah || words.length < 4) return null;

    const planned = planReceiptReplacements(
      words,
      {
        amount: params.amount,
        currency: params.currency,
        senderName: params.senderName,
        recipientName: params.recipientName,
        accountLastDigits: params.accountLastDigits,
        date: params.date,
        time: params.time,
        role: params.role,
      },
      tw,
    ).filter((b) => b.kind === "amount" || b.kind === "date" || b.kind === "time" || b.kind === "digits");

    if (planned.length === 0) return null;

    const sx = aw / tw;
    const sy = ah / th;
    const scaled: OverlayBox[] = planned.map((b) => ({
      ...b,
      x0: b.x0 * sx,
      y0: b.y0 * sy,
      x1: b.x1 * sx,
      y1: b.y1 * sy,
    }));

    const tmp = `${params.aiImagePath}.stamp.png`;
    await paintBoxes(params.aiImagePath, tmp, scaled);
    try {
      unlinkSync(params.aiImagePath);
    } catch {
      /* ignore */
    }
    renameSync(tmp, params.aiImagePath);
    await logger.info("Stamped AI slip from template OCR plan", {
      path: params.aiImagePath,
      fields: scaled.map((b) => b.kind),
      scale: { sx, sy },
    });
    return { fields: scaled.map((b) => b.kind) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "stamp failed";
    await logger.warn("AI slip template-stamp failed", {
      error: message,
      path: params.aiImagePath,
    });
    return null;
  }
}

/**
 * After gpt-image edit: OCR the result and stamp amount/date/digits if still wrong.
 * Keeps AI paper texture; guarantees MONTO/PAGO TOTAL match the requested deposit.
 */
export async function refineSlipWithOverlay(params: {
  imagePath: string;
  amount: number;
  currency: string;
  senderName: string;
  recipientName: string;
  accountLastDigits: string;
  date: string;
  time: string;
  role: "client" | "manager";
}): Promise<{ fields: OverlayBox["kind"][] } | null> {
  try {
    const words = await ocrWords(params.imagePath);
    const meta = await sharp(params.imagePath).rotate().metadata();
    const width = meta.width ?? 0;
    if (!width || words.length < 4) return null;

    const boxes = planReceiptReplacements(
      words,
      {
        amount: params.amount,
        currency: params.currency,
        senderName: params.senderName,
        recipientName: params.recipientName,
        accountLastDigits: params.accountLastDigits,
        date: params.date,
        time: params.time,
        role: params.role,
      },
      width,
    ).filter((b) => b.kind === "amount" || b.kind === "date" || b.kind === "time" || b.kind === "digits");

    if (boxes.length === 0) return null;

    const tmp = `${params.imagePath}.refine.png`;
    await paintBoxes(params.imagePath, tmp, boxes);
    try {
      unlinkSync(params.imagePath);
    } catch {
      /* ignore */
    }
    renameSync(tmp, params.imagePath);
    await logger.info("Refined AI slip with OCR stamp", {
      path: params.imagePath,
      fields: boxes.map((b) => b.kind),
    });
    return { fields: boxes.map((b) => b.kind) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "refine failed";
    await logger.warn("AI slip refine failed", { error: message, path: params.imagePath });
    return null;
  }
}

/**
 * After gpt-image edit: confirm the expected deposit/payout amount is visible.
 * Digits must match closely — years (2026) must not count as ~2000.
 */
export async function verifySlipAmountOnImage(
  imagePath: string,
  expectedAmount: number,
): Promise<{ ok: boolean; found: number[]; reason?: string }> {
  try {
    const words = await ocrWords(imagePath);
    if (words.length < 6) {
      return { ok: true, found: [], reason: "ocr-weak-skip" };
    }
    const raw = words.map((w) => w.text).join(" ");
    const compact = raw.replace(/\s+/g, "");
    const moneyHits: number[] = [];
    for (const w of words) {
      // Prefer tokens that look like money ($ / decimals), not affiliation IDs.
      if (!/[.$]|\d+[.,]\d{2}/.test(w.text) && !/\$/.test(w.text)) {
        const n = parseLooseMoney(w.text);
        if (n != null && n >= 2020 && n <= 2035) continue;
        if (n != null && n >= 10000) continue;
      }
      const n = parseLooseMoney(w.text);
      if (n != null && n >= 50 && n < 1_000_000) moneyHits.push(n);
    }
    const uniq = [...new Set(moneyHits.map((n) => Math.round(n * 100) / 100))];
    const tol = Math.max(0.51, expectedAmount * 0.002);
    const hitPrimary = uniq.some((v) => Math.abs(v - expectedAmount) <= tol);
    const hitPago = uniq.some((v) => Math.abs(v - (expectedAmount + 12)) <= tol);

    const digitForms = [
      expectedAmount.toFixed(2),
      expectedAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      expectedAmount.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      String(Math.round(expectedAmount)),
    ];
    const textHit = digitForms.some(
      (f) => compact.includes(f.replace(/\s/g, "")) || raw.includes(f),
    );

    if (hitPrimary || hitPago || textHit) {
      return { ok: true, found: uniq };
    }
    // Reject only when OCR clearly sees other money-sized figures (old template totals).
    const otherMoney = uniq.filter(
      (v) =>
        v >= 80 &&
        v <= 80_000 &&
        Math.abs(v - expectedAmount) > tol &&
        Math.abs(v - (expectedAmount + 12)) > tol &&
        !(v >= 2020 && v <= 2035),
    );
    if (otherMoney.length >= 1) {
      return {
        ok: false,
        found: uniq,
        reason: `expected ~${expectedAmount}, OCR saw ${otherMoney.slice(0, 8).join(", ")}`,
      };
    }
    return { ok: true, found: uniq, reason: "sparse-ocr-skip" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "verify failed";
    await logger.warn("Slip amount verify skipped", { error: message, imagePath });
    return { ok: true, found: [], reason: "verify-error-skip" };
  }
}

/**
 * Stamp new amount / names / date / last-4 onto a COPY of the original bank screenshot.
 * Reads the pristine template; never writes into receipt_templates/.
 */
export async function overlayReceiptTemplate(
  params: OverlayReceiptParams,
): Promise<{ path: string; template: string; fields: OverlayBox["kind"][] } | null> {
  assertNotReceiptTemplatePath(params.outputPath);

  const template = pickReceiptTemplate({
    project: params.project,
    role: params.role,
    ...(params.dataDir ? { dataDir: params.dataDir } : {}),
    ...(params.templateFilename ? { forceFilename: params.templateFilename } : {}),
    ...(params.preferMedium ? { preferMedium: params.preferMedium } : {}),
  });
  if (!template) return null;

  try {
    const words = await ocrWords(template.absPath);
    const meta = await sharp(template.absPath).rotate().metadata();
    const width = meta.width ?? 0;
    if (!width || words.length < 4) {
      await logger.warn("OCR too weak for receipt overlay", {
        template: template.filename,
        words: words.length,
      });
      return null;
    }

    const boxes = planReceiptReplacements(words, params, width);
    if (boxes.length === 0) {
      await logger.warn("No receipt fields to overlay", { template: template.filename });
      return null;
    }

    await paintBoxes(template.absPath, params.outputPath, boxes);
    await logger.info("Receipt overlay stamped on original screenshot", {
      template: template.filename,
      fields: boxes.map((b) => b.kind),
      path: params.outputPath,
    });
    return {
      path: params.outputPath,
      template: template.filename,
      fields: boxes.map((b) => b.kind),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "overlay failed";
    await logger.warn("Receipt overlay failed", {
      error: message,
      template: template.filename,
      projectId: params.project.id,
    });
    if (/OCR/i.test(message)) throw error;
    return null;
  }
}

export function resolveStoredMediaPath(stored: string, dataDir?: string): string {
  if (path.isAbsolute(stored) && existsSync(stored)) return stored;
  const fromCwd = path.resolve(stored);
  if (existsSync(fromCwd)) return fromCwd;
  const root = dataDir ?? process.env.DATA_DIR ?? "./data";
  return path.resolve(root, stored.replace(/^(\.\/)?data[\\/]/, ""));
}

export type OverlayBetParams = BetOverlayValues & {
  imagePath: string;
  outputPath: string;
  dataDir?: string;
};

/**
 * Stamp deposit / profit / name onto an existing bet screenshot.
 * Does not call OpenAI — the photo stays the same frame, only glyphs change.
 */
export async function overlayBetScreenshot(
  params: OverlayBetParams,
): Promise<{ path: string; fields: OverlayBox["kind"][] } | null> {
  const abs = resolveStoredMediaPath(params.imagePath, params.dataDir);
  if (!existsSync(abs)) {
    await logger.warn("Bet overlay source missing", { imagePath: params.imagePath });
    return null;
  }

  try {
    const words = await ocrWords(abs);
    const meta = await sharp(abs).rotate().metadata();
    const width = meta.width ?? 0;
    if (!width || words.length < 3) {
      await logger.warn("OCR too weak for bet overlay", {
        imagePath: params.imagePath,
        words: words.length,
      });
      return null;
    }

    const boxes = planBetReplacements(words, params, width);
    if (boxes.length === 0) {
      await logger.warn("No bet fields to overlay", { imagePath: params.imagePath });
      return null;
    }

    await paintBoxes(abs, params.outputPath, boxes, "auto");
    await logger.info("Bet overlay stamped on original screenshot", {
      source: params.imagePath,
      fields: boxes.map((b) => b.kind),
      path: params.outputPath,
    });
    return {
      path: params.outputPath,
      fields: boxes.map((b) => b.kind),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "overlay failed";
    await logger.warn("Bet overlay failed", { error: message, imagePath: params.imagePath });
    if (/OCR/i.test(message)) throw error;
    return null;
  }
}
