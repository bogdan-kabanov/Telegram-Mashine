import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";

import { formatStatusBarTime } from "@/lib/format";
import { chatUiForLocale } from "@/lib/i18n/chat-ui";
import {
  pickRandomClientAvatar,
  resolveImageForRender,
  resolveWallpaperForProject,
} from "@/lib/media/resolve";
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
      const sync = (window as unknown as { syncGlassFrost?: () => void }).syncGlassFrost;
      sync?.();
    });
    await page.waitForTimeout(100);
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
    });

    for (let i = 0; i < positions.length; i++) {
      const scrollTop = positions[i]!;
      await page.evaluate(
        ({ top, maxScroll }) => {
          const chat = document.querySelector(".chat-bg");
          const scrollDown = document.querySelector(".scroll-down");
          if (chat instanceof HTMLElement) chat.scrollTop = top;
          if (scrollDown instanceof HTMLElement) {
            const nearBottom = top >= maxScroll - 12;
            scrollDown.classList.toggle("is-visible", maxScroll > 24 && !nearBottom);
          }
          window.dispatchEvent(new Event("resize"));
          const sync = (window as unknown as { syncGlassFrost?: () => void }).syncGlassFrost;
          sync?.();
        },
        { top: scrollTop, maxScroll: metrics.maxScroll },
      );
      await page.waitForTimeout(80);

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

    return this.render({
      project,
      clientName: ui.sampleClientName,
      messages: getSampleMessages(project.locale),
      statusText: ui.statusRecently,
      wallpaperUrl,
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
        resolveImageForRender(mediaAssets.receipt ?? null, { trimWhitespace: true }),
        resolveImageForRender(mediaAssets.captura ?? null, { trimWhitespace: true }),
      ]);

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
