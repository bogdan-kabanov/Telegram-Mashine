import { existsSync, mkdirSync } from "fs";
import path from "path";
import sharp from "sharp";
import Tesseract from "tesseract.js";

import { createLogger } from "@/lib/runtime/manager";
import { pickReceiptTemplate } from "@/lib/openai/receipts";
import type { ProjectConfig } from "@/lib/schemas/projects";
import {
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

function sampleRing(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  box: OverlayBox,
  pad: number,
): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
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
      rs.push(px[0]);
      gs.push(px[1]);
      bs.push(px[2]);
    }
  }
  if (rs.length === 0) return [255, 255, 255];
  return [median(rs), median(gs), median(bs)];
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

const OCR_TIMEOUT_MS = 45_000;

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
      const worker = await Tesseract.createWorker("spa+eng", 1, {
        logger: () => undefined,
        workerPath: tesseractWorkerPath(),
        cachePath: process.cwd(),
        errorHandler: (err) => {
          void logger.warn("OCR worker error", { error: String(err) });
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        preserve_interword_spaces: "1",
      });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return withTimeout(workerPromise, OCR_TIMEOUT_MS, "OCR не запустился");
}

async function ocrWords(imagePath: string): Promise<OcrWord[]> {
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

async function paintBoxes(imagePath: string, outputPath: string, boxes: OverlayBox[]): Promise<void> {
  const { data, info } = await sharp(imagePath).rotate().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  const rects: string[] = [];
  const texts: string[] = [];
  for (const box of boxes) {
    const pad = Math.max(2, Math.round((box.y1 - box.y0) * 0.1));
    const x = Math.max(0, box.x0 - pad);
    const y = Math.max(0, box.y0 - pad);
    const w = Math.min(width - x, box.x1 - box.x0 + pad * 2);
    const h = Math.min(height - y, box.y1 - box.y0 + pad * 2);
    const bg = sampleRing(data, width, height, channels, box, pad + 2);
    const fg = sampleInk(data, width, height, channels, box, bg);
    const fontSize = Math.max(11, Math.round(h * 0.72));
    const weight =
      box.kind === "amount" || box.kind === "deposit" || box.kind === "profit" || box.kind === "name"
        ? 700
        : 500;
    rects.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${rgbToHex(bg[0], bg[1], bg[2])}"/>`,
    );
    let anchor = "start";
    let tx = x + Math.max(1, pad);
    if (box.align === "right") {
      anchor = "end";
      tx = x + w - Math.max(1, pad);
    } else if (box.align === "center") {
      anchor = "middle";
      tx = x + w / 2;
    }
    const ty = y + h * 0.78;
    texts.push(
      `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${rgbToHex(fg[0], fg[1], fg[2])}">${escapeXml(box.text)}</text>`,
    );
  }

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects.join("")}${texts.join("")}</svg>`,
  );

  mkdirSync(path.dirname(outputPath), { recursive: true });
  await sharp(imagePath).rotate().composite([{ input: svg, top: 0, left: 0 }]).png().toFile(outputPath);
}

/**
 * Stamp new amount / names / date / last-4 onto the original bank screenshot.
 * Does not call OpenAI — the photo stays the same file, only glyphs change.
 */
export async function overlayReceiptTemplate(
  params: OverlayReceiptParams,
): Promise<{ path: string; template: string; fields: OverlayBox["kind"][] } | null> {
  const template = pickReceiptTemplate({
    project: params.project,
    role: params.role,
    ...(params.dataDir ? { dataDir: params.dataDir } : {}),
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

    await paintBoxes(abs, params.outputPath, boxes);
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
