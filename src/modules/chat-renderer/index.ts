import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";

import type { Page } from "playwright";
import sharp from "sharp";

import {
  configureScreenshotPage,
  screenshotOptions,
  waitForPageRenderReady,
} from "@/lib/playwright";
import { createLogger } from "@/lib/runtime/manager";
import type { GeneratedDialog } from "@/modules/dialog-generator";
import { composeDialogChat, composeChatRenderParams, sampleClientNameForProject } from "./compose";
import { TARGET_SCREENSHOTS, type DialogMediaAssets } from "./messages";
import { enrichSampleMessages, ensureSamplePreviewMedia } from "./preview-media";
import { planScrollPositions } from "./scroll";
import { buildChatHtml, type RenderChatParams } from "./template";

export { planScrollPositions } from "./scroll";
export { composeDialogChat, composeChatRenderParams } from "./compose";

const logger = createLogger("chat-renderer");

export interface RenderResult {
  pngPath: string;
  htmlPath: string;
  width: number;
  height: number;
}

export interface RenderDialogResult {
  screenshots: string[];
  clientAvatarPath: string | null;
}

const VIEWPORT = { width: 390, height: 844 } as const;
const DEVICE_SCALE_FACTOR = 3;
const SCROLL_OVERLAP_PX = 160;

async function bakeInputGlass(page: Page, scale: number): Promise<void> {
  const targets = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll(".glass-circle, .input-pill, .scroll-down, .input-frost")];
    return nodes.map((node, id) => {
      const el = node as HTMLElement;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const visible =
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number.parseFloat(style.opacity || "1") > 0.05 &&
        r.width > 1 &&
        r.height > 1;
      el.setAttribute("data-glass-bake-id", String(id));
      return { id, x: r.x, y: r.y, w: r.width, h: r.height, visible };
    });
  });

  await page.evaluate(() => {
    document.querySelectorAll(".input-bar, .scroll-down, .input-frost").forEach((node) => {
      const el = node as HTMLElement;
      el.dataset.prevVisibility = el.style.visibility;
      el.style.visibility = "hidden";
    });
  });

  const png = await page.screenshot(screenshotOptions({ type: "png" }));
  const meta = await sharp(png).metadata();
  const imgW = meta.width ?? VIEWPORT.width * scale;
  const imgH = meta.height ?? VIEWPORT.height * scale;

  const baked: Array<{ id: number; dataUri: string; isStrip: boolean }> = [];
  for (const t of targets) {
    if (!t.visible) continue;
    const left = Math.max(0, Math.round(t.x * scale));
    const top = Math.max(0, Math.round(t.y * scale));
    const width = Math.max(1, Math.round(t.w * scale));
    const height = Math.max(1, Math.round(t.h * scale));
    const pad = Math.round(28 * scale);
    const cLeft = Math.max(0, left - pad);
    const cTop = Math.max(0, top - pad);
    const cWidth = Math.min(imgW - cLeft, width + pad * 2);
    const cHeight = Math.min(imgH - cTop, height + pad * 2);
    if (cWidth < 2 || cHeight < 2) continue;

    const blurredPad = await sharp(png)
      .extract({ left: cLeft, top: cTop, width: cWidth, height: cHeight })
      .blur(Math.max(3, Math.round(12 * (scale / 2))))
      .png()
      .toBuffer();

    const ox = left - cLeft;
    const oy = top - cTop;
    const pillBlur = await sharp(blurredPad)
      .extract({
        left: Math.min(ox, Math.max(0, cWidth - 1)),
        top: Math.min(oy, Math.max(0, cHeight - 1)),
        width: Math.min(width, Math.max(1, cWidth - ox)),
        height: Math.min(height, Math.max(1, cHeight - oy)),
      })
      .png()
      .toBuffer();

    baked.push({
      id: t.id,
      dataUri: `data:image/png;base64,${pillBlur.toString("base64")}`,
      isStrip: false,
    });
  }

  await page.evaluate((items) => {
    document.querySelectorAll(".input-bar, .scroll-down, .input-frost").forEach((node) => {
      const el = node as HTMLElement;
      el.style.visibility = el.dataset.prevVisibility ?? "";
    });
    for (const item of items) {
      const el = document.querySelector(`[data-glass-bake-id="${item.id}"]`) as HTMLElement | null;
      if (!el) continue;
      el.style.backgroundImage = `url("${item.dataUri}")`;
      el.style.backgroundSize = "100% 100%";
      el.style.backgroundRepeat = "no-repeat";
      el.style.backgroundColor = "transparent";
      el.style.backdropFilter = "none";
      (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter =
        "none";
      if (el.classList.contains("input-frost")) {
        el.style.opacity = "0.92";
      }
      const tint = el.querySelector(".glass-tint");
      if (tint instanceof HTMLElement) {
        tint.style.background = "rgba(255,255,255,0.20)";
      }
    }
  }, baked);
}

async function screenshotHtmlFile(htmlPath: string, outputPath: string): Promise<void> {
  const { launchChromium } = await import("@/lib/playwright");

  const browser = await launchChromium();
  try {
    const page = await browser.newPage({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });
    configureScreenshotPage(page);

    await page.goto(pathToFileURL(path.resolve(htmlPath)).href, { waitUntil: "load" });
    await waitForPageRenderReady(page);
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const chat = document.querySelector(".chat-bg");
      const input = document.querySelector(".input-bar");
      const last = document.querySelector(".message:last-child");
      if (!(chat instanceof HTMLElement)) return;

      chat.scrollTop = chat.scrollHeight;

      if (!(input instanceof HTMLElement) || !(last instanceof HTMLElement)) return;

      const gap = 8;
      const inputTop = input.getBoundingClientRect().top;
      const lastBottom = last.getBoundingClientRect().bottom;
      const overflow = lastBottom - (inputTop - gap);
      if (overflow > 0) {
        chat.scrollTop = Math.max(0, chat.scrollTop - overflow);
      }
      window.dispatchEvent(new Event("resize"));
      const w = window as unknown as {
        syncGlassFrost?: () => void;
        alignTailCutouts?: () => void;
      };
      w.syncGlassFrost?.();
      w.alignTailCutouts?.();
    });
    await page.waitForTimeout(100);
    await bakeInputGlass(page, DEVICE_SCALE_FACTOR);
    await page.waitForTimeout(40);
    await page.screenshot(
      screenshotOptions({
        path: outputPath,
        type: "png",
        fullPage: false,
      }),
    );
  } finally {
    await browser.close();
  }
}

async function screenshotChatByScrolling(params: {
  htmlPath: string;
  reviewId: string;
  publicDir: string;
  slideTimes?: Array<Date | null | undefined>;
}): Promise<string[]> {
  const { launchChromium } = await import("@/lib/playwright");
  const browser = await launchChromium();
  const screenshots: string[] = [];

  try {
    const page = await browser.newPage({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });
    configureScreenshotPage(page);

    await page.goto(pathToFileURL(path.resolve(params.htmlPath)).href, { waitUntil: "load" });
    await waitForPageRenderReady(page);
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(50);

    const metrics = await page.evaluate(() => {
      const chat = document.querySelector(".chat-bg");
      if (!(chat instanceof HTMLElement)) {
        return { maxScroll: 0, clientHeight: 844 };
      }
      return {
        maxScroll: Math.max(0, chat.scrollHeight - chat.clientHeight),
        clientHeight: chat.clientHeight,
      };
    });

    const positions = planScrollPositions(metrics.maxScroll, metrics.clientHeight, {
      targetScreens: TARGET_SCREENSHOTS,
      minOverlapPx: SCROLL_OVERLAP_PX,
    }).slice(0, TARGET_SCREENSHOTS);

    for (let i = 0; i < positions.length; i++) {
      const scrollTop = positions[i]!;
      await page.evaluate(
        ({ top, maxScroll }) => {
          document.querySelectorAll("[data-glass-bake-id]").forEach((node) => {
            const el = node as HTMLElement;
            el.style.backgroundImage = "";
            el.style.backgroundColor = "";
            el.style.backdropFilter = "";
            (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter =
              "";
            const tint = el.querySelector(".glass-tint");
            if (tint instanceof HTMLElement) tint.style.background = "";
          });
          const chat = document.querySelector(".chat-bg");
          const scrollDown = document.querySelector(".scroll-down");
          if (chat instanceof HTMLElement) chat.scrollTop = top;
          if (scrollDown instanceof HTMLElement) {
            const nearBottom = top >= maxScroll - 12;
            scrollDown.classList.toggle("is-visible", maxScroll > 24 && !nearBottom);
          }
          window.dispatchEvent(new Event("resize"));
          const w = window as unknown as {
            syncGlassFrost?: () => void;
            alignTailCutouts?: () => void;
          };
          w.syncGlassFrost?.();
          w.alignTailCutouts?.();
        },
        { top: scrollTop, maxScroll: metrics.maxScroll },
      );
      const slideNow = params.slideTimes?.[i];
      if (slideNow) {
        await page.evaluate((iso) => {
          const w = window as unknown as { applyChatClock?: (nowIso: string) => void };
          w.applyChatClock?.(iso);
        }, slideNow.toISOString());
      }
      await page.waitForTimeout(80);
      await bakeInputGlass(page, DEVICE_SCALE_FACTOR);
      await page.waitForTimeout(40);

      const pngPath = path.join(params.publicDir, `${params.reviewId}_screen_${i + 1}.png`);
      await page.screenshot(
        screenshotOptions({
          path: pngPath,
          type: "png",
          fullPage: false,
        }),
      );
      screenshots.push(pngPath);
    }
  } finally {
    await browser.close();
  }

  return screenshots;
}

export class ChatRenderer {
  private async renderToFile(params: RenderChatParams, id: string): Promise<RenderResult> {
    const dataDir = process.env.DATA_DIR ?? "./data";
    const publicDir = path.resolve(process.cwd(), "public/renders");
    mkdirSync(publicDir, { recursive: true });
    mkdirSync(path.resolve(dataDir, "renders"), { recursive: true });

    const htmlPath = path.join(path.resolve(dataDir, "renders"), `${id}.html`);
    const pngPath = path.join(publicDir, `${id}.png`);

    const html = buildChatHtml(params);
    writeFileSync(htmlPath, html, "utf-8");
    await screenshotHtmlFile(htmlPath, pngPath);

    return {
      pngPath,
      htmlPath,
      width: VIEWPORT.width * DEVICE_SCALE_FACTOR,
      height: VIEWPORT.height * DEVICE_SCALE_FACTOR,
    };
  }

  async render(params: RenderChatParams): Promise<RenderResult> {
    const id = `render_${Date.now()}`;
    const result = await this.renderToFile(params, id);
    await logger.info("Chat rendered", { pngPath: result.pngPath, projectId: params.project.id });
    return result;
  }

  /**
   * PNG preview — same stamped sample compose as live iframe,
   * captured via Playwright + bakeInputGlass (trial path).
   */
  async renderPreview(_projectId: string, project: RenderChatParams["project"]): Promise<RenderResult> {
    const now = new Date();
    const stamped = await ensureSamplePreviewMedia({ project, now });
    const messages = enrichSampleMessages(project, now, stamped.media, stamped.displayVars);
    const composed = await composeChatRenderParams({
      project,
      clientName: sampleClientNameForProject(project),
      messages,
      mediaPaths: stamped.media,
      now,
      mediaMode: "embed",
      interactive: false,
    });
    return this.render(composed.params);
  }

  async renderDialog(params: {
    dialog: GeneratedDialog;
    project: RenderChatParams["project"];
    mediaAssets: DialogMediaAssets;
    reviewId: string;
    now?: Date;
    slideTimes?: Array<Date | string | null | undefined>;
  }): Promise<RenderDialogResult> {
    const { dialog, project, mediaAssets, reviewId } = params;
    const now = params.now ?? (dialog.createdAt ? new Date(dialog.createdAt) : new Date());

    const composed = await composeDialogChat({
      project,
      dialog,
      mediaPaths: mediaAssets,
      now,
      mediaMode: "embed",
      interactive: false,
    });

    const dataDir = process.env.DATA_DIR ?? "./data";
    const publicDir = path.resolve(process.cwd(), "public/renders");
    mkdirSync(publicDir, { recursive: true });
    mkdirSync(path.resolve(dataDir, "renders"), { recursive: true });

    const htmlPath = path.join(path.resolve(dataDir, "renders"), `${reviewId}.html`);
    writeFileSync(htmlPath, composed.html, "utf-8");

    const slideTimes = (params.slideTimes ?? []).map((t) => {
      if (!t) return null;
      const d = t instanceof Date ? t : new Date(t);
      return Number.isNaN(d.getTime()) ? null : d;
    });

    const screenshots = await screenshotChatByScrolling({
      htmlPath,
      reviewId,
      publicDir,
      ...(slideTimes.some(Boolean) ? { slideTimes } : {}),
    });

    await logger.info("Dialog rendered", {
      reviewId,
      screens: screenshots.length,
      messages: dialog.messages.length,
      mode: "scroll",
    });

    return { screenshots, clientAvatarPath: composed.clientAvatarPath };
  }
}

let instance: ChatRenderer | null = null;

export function getChatRenderer(): ChatRenderer {
  if (!instance) instance = new ChatRenderer();
  return instance;
}
