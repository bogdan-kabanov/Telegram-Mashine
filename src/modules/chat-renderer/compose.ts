import { pickAvailableClientPhoto } from "@/lib/client-photos";
import { formatStatusBarTime } from "@/lib/format";
import { chatUiForLocale } from "@/lib/i18n/chat-ui";
import { localeClockConfig } from "@/lib/i18n/locale-profile";
import {
  averageWallpaperColor,
  blurWallpaperDataUri,
  wallpaperCutoutDataUri,
} from "@/lib/media/blur-wallpaper";
import {
  mediaPathToServeUrl,
  pickRandomClientAvatar,
  resolveImageForRender,
  resolveWallpaperForProject,
} from "@/lib/media/resolve";
import { createLogger } from "@/lib/runtime/manager";
import type { ProjectConfig } from "@/lib/schemas/projects";
import type { GeneratedDialog } from "@/modules/dialog-generator";

import { dialogToRenderMessages, type DialogMediaAssets } from "./messages";
import { buildChatHtml, type RenderChatParams, type RenderMessage } from "./template";

const logger = createLogger("chat-compose");

export type ComposeMediaMode = "embed" | "serve";

export type ComposeChatParams = {
  project: ProjectConfig;
  clientName: string;
  messages: RenderMessage[];
  mediaPaths: DialogMediaAssets;
  now: Date;
  /** embed = data-URIs for Playwright; serve = HTTP URLs for live iframe. */
  mediaMode: ComposeMediaMode;
  /** Interactive constructor hooks only — must not change chrome pixels. */
  interactive?: boolean;
  preferredAvatarPath?: string | null;
};

export type ComposeChatResult = {
  params: RenderChatParams;
  html: string;
  timeZone: string;
  locale: string;
  statusBarTime: string;
  clientAvatarPath: string | null;
};

async function resolveMediaUris(
  paths: DialogMediaAssets,
  mode: ComposeMediaMode,
): Promise<DialogMediaAssets> {
  if (mode === "serve") {
    const sticker = paths.sticker
      ? await resolveImageForRender(paths.sticker, { removeWhiteBackground: true })
      : null;
    return {
      sticker,
      storyPhoto: mediaPathToServeUrl(paths.storyPhoto),
      conditions: mediaPathToServeUrl(paths.conditions),
      bet1: mediaPathToServeUrl(paths.bet1),
      bet2: mediaPathToServeUrl(paths.bet2),
      bet3: mediaPathToServeUrl(paths.bet3),
      receipt: mediaPathToServeUrl(paths.receipt),
      captura: mediaPathToServeUrl(paths.captura),
    };
  }

  const [sticker, storyPhoto, conditions, bet1, bet2, bet3, receipt, captura] = await Promise.all([
    resolveImageForRender(paths.sticker ?? null, { removeWhiteBackground: true }),
    resolveImageForRender(paths.storyPhoto ?? null),
    resolveImageForRender(paths.conditions ?? null),
    resolveImageForRender(paths.bet1 ?? null),
    resolveImageForRender(paths.bet2 ?? null),
    resolveImageForRender(paths.bet3 ?? null),
    resolveImageForRender(paths.receipt ?? null),
    resolveImageForRender(paths.captura ?? null),
  ]);
  return { sticker, storyPhoto, conditions, bet1, bet2, bet3, receipt, captura };
}

/**
 * Shared wallpaper / frost / cutout / avatar resolution for live + Playwright.
 */
export async function resolveChatChrome(params: {
  projectId: string;
  wallpaperPath?: string | null;
  clientAvatarPath?: string | null;
  mediaMode: ComposeMediaMode;
}): Promise<{
  wallpaperUrl: string | null;
  frostWallpaperUrl: string | null;
  wallpaperCutoutUrl: string | null;
  wallpaperCutoutColor: string | null;
  clientAvatarUrl: string | null;
  clientAvatarPath: string | null;
}> {
  const wallpaperUrl = await resolveWallpaperForProject(
    params.projectId,
    params.wallpaperPath ?? undefined,
  );

  let clientAvatarUrl: string | null = null;
  let clientAvatarPath: string | null = null;
  const avatar = await pickRandomClientAvatar(params.projectId, params.clientAvatarPath);
  clientAvatarPath = avatar.filePath;
  if (params.mediaMode === "serve") {
    clientAvatarUrl = mediaPathToServeUrl(avatar.filePath) ?? avatar.dataUri;
  } else {
    clientAvatarUrl = avatar.dataUri;
  }

  const frostWallpaperUrl = wallpaperUrl ? await blurWallpaperDataUri(wallpaperUrl) : null;
  const [wallpaperCutoutUrl, wallpaperCutoutColor] = wallpaperUrl
    ? await Promise.all([wallpaperCutoutDataUri(wallpaperUrl), averageWallpaperColor(wallpaperUrl)])
    : [null, null];

  // For serve mode, prefer HTTP wallpaper when available (lighter iframe).
  let wallpaperForHtml = wallpaperUrl;
  if (params.mediaMode === "serve" && params.wallpaperPath) {
    wallpaperForHtml = mediaPathToServeUrl(params.wallpaperPath) ?? wallpaperUrl;
  }

  return {
    wallpaperUrl: wallpaperForHtml,
    frostWallpaperUrl,
    wallpaperCutoutUrl,
    wallpaperCutoutColor,
    clientAvatarUrl,
    clientAvatarPath,
  };
}

/**
 * One compose path for live preview and Playwright trial screenshots.
 */
export async function composeChatRenderParams(
  params: ComposeChatParams,
): Promise<ComposeChatResult> {
  const clockCfg = localeClockConfig(params.project.locale);
  const now = params.now;

  let mediaPaths = { ...params.mediaPaths };
  const needsStory =
    params.messages.some((m) => m.mediaKind === "story" || m.mediaSlot === "storyPhoto") ||
    params.messages.some((m) => m.type === "image" && !m.mediaSlot);
  if (needsStory && !mediaPaths.storyPhoto) {
    const fallback = await pickAvailableClientPhoto({
      excludePaths: [],
      projectId: params.project.id,
    });
    if (fallback) {
      mediaPaths = { ...mediaPaths, storyPhoto: fallback.path };
      await logger.info("Story photo missing — used pool image", { used: fallback.path });
    }
  }

  const [chrome, uris] = await Promise.all([
    resolveChatChrome({
      projectId: params.project.id,
      wallpaperPath: params.project.wallpaperPath ?? null,
      clientAvatarPath:
        params.preferredAvatarPath ?? params.project.clientAvatarPath ?? null,
      mediaMode: params.mediaMode,
    }),
    resolveMediaUris(mediaPaths, params.mediaMode),
  ]);

  // Re-bind image URLs onto messages that already carry slot metadata
  const messagesWithMedia = params.messages.map((m) => {
    if (!m.mediaSlot) return m;
    const url = uris[m.mediaSlot as keyof DialogMediaAssets];
    if (typeof url === "string" && url) {
      return { ...m, imageUrl: url };
    }
    return m;
  });

  const statusBarTime =
    messagesWithMedia.at(-1)?.time ?? formatStatusBarTime(now, clockCfg.timeZone);

  const renderParams: RenderChatParams = {
    project: params.project,
    clientName: params.clientName,
    messages: messagesWithMedia,
    wallpaperUrl: chrome.wallpaperUrl,
    frostWallpaperUrl: chrome.frostWallpaperUrl,
    wallpaperCutoutUrl: chrome.wallpaperCutoutUrl,
    wallpaperCutoutColor: chrome.wallpaperCutoutColor,
    clientAvatarUrl: chrome.clientAvatarUrl,
    statusBarTime,
    clockTimeZone: clockCfg.timeZone,
    livePreview: Boolean(params.interactive),
  };

  return {
    params: renderParams,
    html: buildChatHtml(renderParams),
    timeZone: clockCfg.timeZone,
    locale: clockCfg.locale,
    statusBarTime,
    clientAvatarPath: chrome.clientAvatarPath,
  };
}

export async function composeDialogChat(params: {
  project: ProjectConfig;
  dialog: GeneratedDialog;
  mediaPaths: DialogMediaAssets;
  now: Date;
  mediaMode: ComposeMediaMode;
  interactive?: boolean;
}): Promise<ComposeChatResult> {
  const clockCfg = localeClockConfig(params.project.locale);
  // Resolve media first so dialogToRenderMessages gets real URLs
  const uris = await resolveMediaUris(
    {
      sticker: params.mediaPaths.sticker ?? null,
      storyPhoto: params.mediaPaths.storyPhoto ?? null,
      conditions:
        params.mediaPaths.conditions ?? params.project.conditionsImagePath ?? null,
      bet1: params.mediaPaths.bet1 ?? null,
      bet2: params.mediaPaths.bet2 ?? null,
      bet3: params.mediaPaths.bet3 ?? null,
      receipt: params.mediaPaths.receipt ?? null,
      captura: params.mediaPaths.captura ?? null,
    },
    params.mediaMode,
  );

  let storyPhotoUri = uris.storyPhoto;
  const needsStoryPhoto = params.dialog.messages.some((m) => m.type === "image");
  if (needsStoryPhoto && !storyPhotoUri) {
    const fallback = await pickAvailableClientPhoto({
      excludePaths: params.mediaPaths.storyPhoto ? [params.mediaPaths.storyPhoto] : [],
    });
    if (fallback) {
      storyPhotoUri =
        params.mediaMode === "serve"
          ? mediaPathToServeUrl(fallback.path)
          : await resolveImageForRender(fallback.path);
      await logger.info("Story photo missing — used another pool image", {
        broken: params.mediaPaths.storyPhoto ?? null,
        used: fallback.path,
      });
    }
  }

  const enriched: DialogMediaAssets = {
    ...uris,
    storyPhoto: storyPhotoUri ?? null,
  };
  const messages = dialogToRenderMessages(params.dialog.messages, enriched, {
    now: params.now,
    timeZone: clockCfg.timeZone,
    locale: clockCfg.locale,
  });

  const chrome = await resolveChatChrome({
    projectId: params.project.id,
    wallpaperPath: params.project.wallpaperPath ?? null,
    clientAvatarPath: params.project.clientAvatarPath ?? null,
    mediaMode: params.mediaMode,
  });

  const statusBarTime =
    messages.at(-1)?.time ?? formatStatusBarTime(params.now, clockCfg.timeZone);

  const renderParams: RenderChatParams = {
    project: params.project,
    clientName: params.dialog.clientName,
    messages,
    wallpaperUrl: chrome.wallpaperUrl,
    frostWallpaperUrl: chrome.frostWallpaperUrl,
    wallpaperCutoutUrl: chrome.wallpaperCutoutUrl,
    wallpaperCutoutColor: chrome.wallpaperCutoutColor,
    clientAvatarUrl: chrome.clientAvatarUrl,
    statusBarTime,
    clockTimeZone: clockCfg.timeZone,
    livePreview: Boolean(params.interactive),
  };

  return {
    params: renderParams,
    html: buildChatHtml(renderParams),
    timeZone: clockCfg.timeZone,
    locale: clockCfg.locale,
    statusBarTime,
    clientAvatarPath: chrome.clientAvatarPath,
  };
}

export function sampleClientNameForProject(project: ProjectConfig): string {
  return chatUiForLocale(project.locale).sampleClientName;
}
