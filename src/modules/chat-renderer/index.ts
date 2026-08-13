import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";

import type { Page } from "playwright";
import sharp from "sharp";

import { formatStatusBarTime } from "@/lib/format";
import { chatUiForLocale } from "@/lib/i18n/chat-ui";
import {
  pickRandomClientAvatar,
  resolveImageForRender,
  resolveWallpaperForProject,
} from "@/lib/media/resolve";
import { blurWallpaperDataUri, averageWallpaperColor, wallpaperCutoutDataUri } from "@/lib/media/blur-wallpaper";
import { createLogger } from "@/lib/runtime/manager";
import type { GeneratedDialog } from "@/modules/dialog-generator";
import {
  dialogToRenderMessages,
  TARGET_SCREENSHOTS,
  type DialogMediaAssets,
} from "./messages";
import { planScrollPositions } from "./scroll";
import { buildChatHtml, getSampleMessages, type RenderChatParams, type RenderMessage } from "./template";

export { planScrollPositions } from "./scroll";

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
/** iPhone logical 390×844 @3x → 1170×2532 PNG (sharper than Telegram-compressed chat photos). */
const DEVICE_SCALE_FACTOR = 3;
/** Keep this much previous content when scrolling to the next frame. */
const SCROLL_OVERLAP_PX = 160;

/**
 * Bake blurred underlays for input glass pills.
 * CSS backdrop-filter often fails in headless Chromium; this samples the real
 * chat (green bubbles etc.) so glass looks translucent in screenshots.
 */
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

  const png = await page.screenshot({ type: "png" });
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

/** Load written HTML via file:// so @font-face file:// SF Pro URLs resolve. */
async function screenshotHtmlFile(htmlPath: string, outputPath: string): Promise<void> {
  const { launchChromium } = await import("@/lib/playwright");

  const browser = await launchChromium();
  try {
    const page = await browser.newPage({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });

    await page.goto(pathToFileURL(path.resolve(htmlPath)).href, { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    // Wait for wallpaper + Apple emoji PNGs so screenshots aren't blank/Segoe
    await page
      .waitForFunction(() => {
        const imgs = [
          ...document.querySelectorAll(
            "img.wallpaper-img, img.frost-img, img.glass-frost-img, img.apple-emoji",
          ),
        ] as HTMLImageElement[];
        return imgs.length === 0 || imgs.every((img) => img.complete && img.naturalWidth > 0);
      }, { timeout: 15000 })
      .catch(() => undefined);
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
    await page.screenshot({
      path: outputPath,
      type: "png",
      fullPage: false,
    });
  } finally {
    await browser.close();
  }
}

/**
 * One full chat HTML → several PNGs by scrolling down (like reading Telegram).
 * Overlap keeps the previous bubble(s) visible so nothing “vanishes” between frames.
 */
// planScrollPositions lives in ./scroll (imported above)

async function screenshotChatByScrolling(params: {
  htmlPath: string;
  reviewId: string;
  publicDir: string;
}): Promise<string[]> {
  const { launchChromium } = await import("@/lib/playwright");
  const browser = await launchChromium();
  const screenshots: string[] = [];

  try {
    const page = await browser.newPage({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });

    await page.goto(pathToFileURL(path.resolve(params.htmlPath)).href, { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      const imgs = [...document.querySelectorAll("img")];
      await Promise.all(
        imgs.map(
          (img) =>
            img.complete ||
            new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }),
        ),
      );
    });
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
          // Clear previous glass bake so the next frame resamples underlays.
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
      await page.waitForTimeout(80);
      await bakeInputGlass(page, DEVICE_SCALE_FACTOR);
      await page.waitForTimeout(40);

      const pngPath = path.join(params.publicDir, `${params.reviewId}_screen_${i + 1}.png`);
      await page.screenshot({
        path: pngPath,
        type: "png",
        fullPage: false,
      });
      screenshots.push(pngPath);
    }
  } finally {
    await browser.close();
  }

  return screenshots;
}

export class ChatRenderer {
  private async renderToFile(
    params: RenderChatParams,
    id: string,
  ): Promise<RenderResult> {
    const dataDir = process.env.DATA_DIR ?? "./data";
    const publicDir = path.resolve(process.cwd(), "public/renders");
    mkdirSync(publicDir, { recursive: true });
    mkdirSync(path.resolve(dataDir, "renders"), { recursive: true });

    const htmlPath = path.join(path.resolve(dataDir, "renders"), `${id}.html`);
    const pngPath = path.join(publicDir, `${id}.png`);

    const html = buildChatHtml(params);
    writeFileSync(htmlPath, html, "utf-8");
    await screenshotHtmlFile(htmlPath, pngPath);

    return { pngPath, htmlPath, width: VIEWPORT.width * DEVICE_SCALE_FACTOR, height: VIEWPORT.height * DEVICE_SCALE_FACTOR };
  }

  async render(params: RenderChatParams): Promise<RenderResult> {
    const id = `render_${Date.now()}`;
    const result = await this.renderToFile(params, id);
    await logger.info("Chat rendered", { pngPath: result.pngPath, projectId: params.project.id });
    return result;
  }

  async renderPreview(projectId: string, project: RenderChatParams["project"]): Promise<RenderResult> {
    const ui = chatUiForLocale(project.locale);
    const [wallpaperUrl, avatar] = await Promise.all([
      resolveWallpaperForProject(projectId, project.wallpaperPath),
      pickRandomClientAvatar(projectId, project.clientAvatarPath),
    ]);
    const frostWallpaperUrl = wallpaperUrl ? await blurWallpaperDataUri(wallpaperUrl) : null;
    const [wallpaperCutoutUrl, wallpaperCutoutColor] = wallpaperUrl
      ? await Promise.all([wallpaperCutoutDataUri(wallpaperUrl), averageWallpaperColor(wallpaperUrl)])
      : [null, null];

    return this.render({
      project,
      clientName: ui.sampleClientName,
      messages: getSampleMessages(project.locale),
      statusText: ui.statusRecently,
      wallpaperUrl,
      frostWallpaperUrl,
      wallpaperCutoutUrl,
      wallpaperCutoutColor,
      clientAvatarUrl: avatar.dataUri,
      statusBarTime: formatStatusBarTime(),
    });
  }

  async renderDialog(params: {
    dialog: GeneratedDialog;
    project: RenderChatParams["project"];
    mediaAssets: DialogMediaAssets;
    reviewId: string;
  }): Promise<RenderDialogResult> {
    const { dialog, project, mediaAssets, reviewId } = params;
    const ui = chatUiForLocale(project.locale);

    const [wallpaperUrl, avatar, stickerUri, storyPhotoUri, conditionsUri, bet1Uri, bet2Uri, bet3Uri, receiptUri, capturaUri] =
      await Promise.all([
        resolveWallpaperForProject(dialog.projectId, project.wallpaperPath),
        pickRandomClientAvatar(dialog.projectId, project.clientAvatarPath),
        resolveImageForRender(mediaAssets.sticker ?? null, { removeWhiteBackground: true }),
        resolveImageForRender(mediaAssets.storyPhoto ?? null),
        resolveImageForRender(mediaAssets.conditions ?? project.conditionsImagePath ?? null),
        resolveImageForRender(mediaAssets.bet1 ?? null),
        resolveImageForRender(mediaAssets.bet2 ?? null),
        resolveImageForRender(mediaAssets.bet3 ?? null),
        resolveImageForRender(mediaAssets.receipt ?? null),
        resolveImageForRender(mediaAssets.captura ?? null),
      ]);
    const frostWallpaperUrl = wallpaperUrl ? await blurWallpaperDataUri(wallpaperUrl) : null;
    const [wallpaperCutoutUrl, wallpaperCutoutColor] = wallpaperUrl
      ? await Promise.all([wallpaperCutoutDataUri(wallpaperUrl), averageWallpaperColor(wallpaperUrl)])
      : [null, null];

    const enrichedMedia: DialogMediaAssets = {
      sticker: stickerUri,
      storyPhoto: storyPhotoUri,
      conditions: conditionsUri,
      bet1: bet1Uri,
      bet2: bet2Uri,
      bet3: bet3Uri,
      receipt: receiptUri,
      captura: capturaUri,
    };

    const renderMessages = dialogToRenderMessages(dialog.messages, enrichedMedia);
    const lastTime = renderMessages[renderMessages.length - 1]?.time ?? formatStatusBarTime();

    const dataDir = process.env.DATA_DIR ?? "./data";
    const publicDir = path.resolve(process.cwd(), "public/renders");
    mkdirSync(publicDir, { recursive: true });
    mkdirSync(path.resolve(dataDir, "renders"), { recursive: true });

    const htmlPath = path.join(path.resolve(dataDir, "renders"), `${reviewId}.html`);
    const html = buildChatHtml({
      project,
      clientName: dialog.clientName,
      messages: renderMessages,
      statusText: ui.statusRecently,
      wallpaperUrl,
      frostWallpaperUrl,
      wallpaperCutoutUrl,
      wallpaperCutoutColor,
      clientAvatarUrl: avatar.dataUri,
      statusBarTime: lastTime,
      // Vlad: Stories ring on peer avatar (Telegram iOS). Always on for review screenshots.
      hasStories: true,
    });
    writeFileSync(htmlPath, html, "utf-8");

    const screenshots = await screenshotChatByScrolling({
      htmlPath,
      reviewId,
      publicDir,
    });

    await logger.info("Dialog rendered", {
      reviewId,
      screens: screenshots.length,
      messages: dialog.messages.length,
      mode: "scroll",
    });

    return { screenshots, clientAvatarPath: avatar.filePath };
  }
}

let instance: ChatRenderer | null = null;

export function getChatRenderer(): ChatRenderer {
  if (!instance) instance = new ChatRenderer();
  return instance;
}
