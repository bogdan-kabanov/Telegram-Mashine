import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { formatStatusBarTime } from "@/lib/format";
import {
  pickRandomClientAvatar,
  resolveImageForRender,
  resolveWallpaperForProject,
} from "@/lib/media/resolve";
import { createLogger } from "@/lib/runtime/manager";
import type { GeneratedDialog } from "@/modules/dialog-generator";
import { dialogToRenderMessages, paginateMessages, type DialogMediaAssets } from "./messages";
import { buildChatHtml, getSampleMessages, type RenderChatParams } from "./template";

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

async function screenshotHtml(html: string, outputPath: string): Promise<void> {
  const { chromium } = await import("playwright");
  const { getChromiumLaunchOptions } = await import("@/lib/playwright");

  const browser = await chromium.launch(getChromiumLaunchOptions());
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    });

    await page.setContent(html, { waitUntil: "load" });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const chat = document.querySelector(".chat-bg");
      if (chat instanceof HTMLElement) {
        chat.scrollTop = chat.scrollHeight;
      }
    });
    await page.waitForTimeout(150);
    await page.screenshot({
      path: outputPath,
      type: "png",
      fullPage: false,
    });
  } finally {
    await browser.close();
  }
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
    await screenshotHtml(html, pngPath);

    return { pngPath, htmlPath, width: 390, height: 844 };
  }

  async render(params: RenderChatParams): Promise<RenderResult> {
    const id = `render_${Date.now()}`;
    const result = await this.renderToFile(params, id);
    await logger.info("Chat rendered", { pngPath: result.pngPath, projectId: params.project.id });
    return result;
  }

  async renderPreview(projectId: string, project: RenderChatParams["project"]): Promise<RenderResult> {
    const [wallpaperUrl, avatar] = await Promise.all([
      resolveWallpaperForProject(projectId, project.wallpaperPath),
      pickRandomClientAvatar(projectId),
    ]);

    return this.render({
      project,
      clientName: "Manuel",
      messages: getSampleMessages(),
      statusText: "últ. vez recientemente",
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

    const [wallpaperUrl, avatar, stickerUri, storyPhotoUri, conditionsUri, bet1Uri, bet2Uri, bet3Uri, receiptUri, capturaUri] =
      await Promise.all([
        resolveWallpaperForProject(dialog.projectId, project.wallpaperPath),
        pickRandomClientAvatar(dialog.projectId),
        resolveImageForRender(mediaAssets.sticker ?? null),
        resolveImageForRender(mediaAssets.storyPhoto ?? null),
        resolveImageForRender(mediaAssets.conditions ?? project.conditionsImagePath ?? null),
        resolveImageForRender(mediaAssets.bet1 ?? null),
        resolveImageForRender(mediaAssets.bet2 ?? null),
        resolveImageForRender(mediaAssets.bet3 ?? null),
        resolveImageForRender(mediaAssets.receipt ?? null),
        resolveImageForRender(mediaAssets.captura ?? null),
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
    const pages = paginateMessages(renderMessages);
    const screenshots: string[] = [];

    for (let i = 0; i < pages.length; i++) {
      const pageMessages = pages[i]!;
      const lastTime = pageMessages[pageMessages.length - 1]?.time ?? "18:55";
      const id = `${reviewId}_screen_${i + 1}`;

      const result = await this.renderToFile(
        {
          project,
          clientName: dialog.clientName,
          messages: pageMessages,
          statusText: "últ. vez recientemente",
          wallpaperUrl,
          clientAvatarUrl: avatar.dataUri,
          statusBarTime: lastTime,
        },
        id,
      );

      screenshots.push(result.pngPath);
    }

    await logger.info("Dialog rendered", {
      reviewId,
      screens: screenshots.length,
      messages: dialog.messages.length,
    });

    return { screenshots, clientAvatarPath: avatar.filePath };
  }
}

let instance: ChatRenderer | null = null;

export function getChatRenderer(): ChatRenderer {
  if (!instance) instance = new ChatRenderer();
  return instance;
}
