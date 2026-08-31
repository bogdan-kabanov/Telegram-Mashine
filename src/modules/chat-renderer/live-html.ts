import { and, eq } from "drizzle-orm";

import { pickAvailableClientPhoto } from "@/lib/client-photos";
import { computeMessageTimes, formatStatusBarTime, injectTemplate } from "@/lib/format";
import { DialogClock } from "@/lib/dialog/timing";
import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { chatUiForLocale } from "@/lib/i18n/chat-ui";
import { localeClockConfig } from "@/lib/i18n/locale-profile";
import { averageWallpaperColor } from "@/lib/media/blur-wallpaper";
import {
  fileToDataUri,
  mediaPathToServeUrl,
  pickRandomClientAvatar,
  resolveImageForRender,
  resolveWallpaperForProject,
} from "@/lib/media/resolve";
import type { ProjectConfig } from "@/lib/schemas/projects";
import type { GeneratedDialog } from "@/modules/dialog-generator";

import { dialogToRenderMessages, type DialogMediaAssets } from "./messages";
import { buildChatHtml, type RenderMessage } from "./template";

export type LiveHtmlOverrides = {
  managerName?: string;
  managerHandle?: string;
  incomingBubble?: string;
  outgoingBubble?: string;
  accentColor?: string;
  depositMessageTemplate?: string;
  completionMessageTemplate?: string;
  payoutMessageTemplate?: string;
  wallpaperPath?: string | null;
  clientAvatarPath?: string | null;
};

export type LiveComposeResult = {
  html: string;
  timeZone: string;
  locale: string;
  statusBarTime: string;
  clientName: string;
  mode: "sample" | "review";
};

const SAMPLE_VARS: Record<string, string | number> = {
  bankName: "Spin",
  clabe: "012345678901234567",
  deposit: "4,500",
  profit1: "1,200",
  profit2: "3,400",
  profitFinal: "12,800",
  commission: "1,280",
  clientShare: "11,520",
};

function applyOverrides(project: ProjectConfig, overrides?: LiveHtmlOverrides): ProjectConfig {
  if (!overrides) return project;
  return {
    ...project,
    managerName: overrides.managerName?.trim() || project.managerName,
    managerHandle: overrides.managerHandle?.trim() || project.managerHandle,
    depositMessageTemplate: overrides.depositMessageTemplate?.trim() || project.depositMessageTemplate,
    completionMessageTemplate:
      overrides.completionMessageTemplate?.trim() || project.completionMessageTemplate,
    payoutMessageTemplate: overrides.payoutMessageTemplate?.trim() || project.payoutMessageTemplate,
    wallpaperPath: overrides.wallpaperPath || project.wallpaperPath,
    clientAvatarPath: overrides.clientAvatarPath || project.clientAvatarPath,
    theme: {
      ...project.theme,
      incomingBubble: overrides.incomingBubble || project.theme.incomingBubble,
      outgoingBubble: overrides.outgoingBubble || project.theme.outgoingBubble,
      accentColor: overrides.accentColor || project.theme.accentColor,
    },
  };
}

async function peekProjectPaths(type: string, projectId: string, limit: number): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ path: mediaAssets.path })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.type, type), eq(mediaAssets.projectId, projectId)))
    .limit(limit);
  return rows.map((r) => r.path);
}

async function sampleMediaPaths(
  project: ProjectConfig,
  extra?: DialogMediaAssets,
): Promise<DialogMediaAssets> {
  const [bets, sticker, photo] = await Promise.all([
    peekProjectPaths("bet", project.id, 3),
    peekProjectPaths("sticker", project.id, 1),
    pickAvailableClientPhoto({ preferUnused: true }),
  ]);
  return {
    conditions: extra?.conditions ?? project.conditionsImagePath ?? null,
    bet1: extra?.bet1 ?? bets[0] ?? null,
    bet2: extra?.bet2 ?? bets[1] ?? null,
    bet3: extra?.bet3 ?? bets[2] ?? null,
    sticker: extra?.sticker ?? sticker[0] ?? null,
    storyPhoto: extra?.storyPhoto ?? photo?.path ?? null,
    receipt: extra?.receipt ?? null,
    captura: extra?.captura ?? null,
  };
}

function snippet(template: string, max = 220): string {
  const filled = injectTemplate(template, SAMPLE_VARS).trim();
  if (filled.length <= max) return filled;
  return `${filled.slice(0, max).trim()}…`;
}

function enrichSampleMessages(
  project: ProjectConfig,
  now: Date,
  media: {
    storyPhoto?: string | null;
    conditions?: string | null;
    bet1?: string | null;
    receipt?: string | null;
    captura?: string | null;
  },
): RenderMessage[] {
  const ui = chatUiForLocale(project.locale);
  const clientLine =
    ui.sampleMessages.find((m) => m.role === "client")?.content ?? "Necesito tu ayuda";
  /** Deterministic mid-range delays for stable previews. */
  const clock = new DialogClock(() => 0.45);
  const t = (role: "client" | "manager", kind?: "captura" | "bet_reply") =>
    clock.next(role, kind);

  const extra: RenderMessage[] = [
    {
      id: "sample-in-1",
      role: "client",
      type: "text",
      content: clientLine,
      time: "12:00",
      delayMinutes: clock.atStart("client"),
    },
  ];
  if (media.storyPhoto) {
    extra.push({
      id: "sample-photo",
      role: "client",
      type: "image",
      content: "__image__",
      time: "12:00",
      delayMinutes: clock.clientBurst(),
      imageUrl: media.storyPhoto,
      mediaKind: "story",
      mediaSlot: "storyPhoto",
    });
  }
  clock.setStage("deposit");
  extra.push({
    id: "sample-deposit",
    role: "manager",
    type: "text",
    content: snippet(project.depositMessageTemplate),
    time: "12:00",
    delayMinutes: t("manager"),
    read: true,
  });
  if (media.conditions) {
    extra.push({
      id: "sample-conditions",
      role: "manager",
      type: "image",
      content: "__image__",
      time: "12:00",
      delayMinutes: clock.managerBurst(),
      read: true,
      imageUrl: media.conditions,
      mediaKind: "conditions",
      mediaSlot: "conditions",
    });
  }
  clock.setStage("completion");
  extra.push({
    id: "sample-completion",
    role: "manager",
    type: "text",
    content: snippet(project.completionMessageTemplate, 160),
    time: "12:00",
    delayMinutes: t("manager"),
    read: true,
  });
  clock.setStage("payout");
  extra.push({
    id: "sample-payout",
    role: "manager",
    type: "text",
    content: snippet(project.payoutMessageTemplate, 140),
    time: "12:00",
    delayMinutes: clock.managerBurst(),
    read: true,
  });
  if (media.captura) {
    extra.push({
      id: "sample-captura",
      role: "client",
      type: "image",
      content: "__image__",
      time: "12:00",
      delayMinutes: t("client", "captura"),
      imageUrl: media.captura,
      mediaKind: "captura",
      mediaSlot: "captura",
    });
  }
  if (media.bet1) {
    clock.setStage("bet_1");
    extra.push({
      id: "sample-bet",
      role: "client",
      type: "image",
      content: "__image__",
      time: "12:00",
      delayMinutes: t("client", "bet_reply"),
      imageUrl: media.bet1,
      mediaKind: "bet",
      mediaSlot: "bet1",
    });
  }
  if (media.receipt) {
    extra.push({
      id: "sample-receipt",
      role: "manager",
      type: "image",
      content: "__image__",
      time: "12:00",
      delayMinutes: clock.next("manager"),
      read: true,
      imageUrl: media.receipt,
      mediaKind: "receipt",
      mediaSlot: "receipt",
    });
  }
  const clockCfg = localeClockConfig(project.locale);
  const times = computeMessageTimes(
    extra.map((m) => ({ delayMinutes: m.delayMinutes ?? 0 })),
    {
      now,
      timeZone: clockCfg.timeZone,
      locale: clockCfg.locale,
    },
  );
  return extra.map((m, i) => ({ ...m, time: times[i] ?? times.at(-1) ?? m.time }));
}

async function resolveMediaServeUrls(paths: DialogMediaAssets): Promise<DialogMediaAssets> {
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

async function resolveLiveWallpaper(
  projectId: string,
  wallpaperPath?: string | null,
  lightweight = false,
): Promise<string | null> {
  if (lightweight) {
    if (wallpaperPath) {
      const url = mediaPathToServeUrl(wallpaperPath);
      if (url) return url;
    }
    const embedded = await resolveWallpaperForProject(projectId, wallpaperPath ?? undefined);
    if (embedded?.startsWith("data:")) return embedded;
    return mediaPathToServeUrl(wallpaperPath);
  }

  if (wallpaperPath) {
    const direct = fileToDataUri(wallpaperPath);
    if (direct) return direct;
    const resolved = await resolveImageForRender(wallpaperPath);
    if (resolved) return resolved;
  }
  return resolveWallpaperForProject(projectId, wallpaperPath ?? undefined);
}

async function resolveLiveAvatarUrl(
  projectId: string,
  preferredPath?: string | null,
): Promise<string | null> {
  if (preferredPath) {
    const url = mediaPathToServeUrl(preferredPath);
    if (url) return url;
  }
  const picked = await pickRandomClientAvatar(projectId, preferredPath);
  return mediaPathToServeUrl(picked.filePath) ?? picked.dataUri;
}

export async function composeLiveChatHtml(params: {
  project: ProjectConfig;
  dialog?: GeneratedDialog | null;
  mediaPaths?: DialogMediaAssets;
  now: Date;
  overrides?: LiveHtmlOverrides;
}): Promise<LiveComposeResult> {
  const project = applyOverrides(params.project, params.overrides);
  const clockCfg = localeClockConfig(project.locale);
  const now = params.now;

  const rawPaths = params.dialog
    ? {
        sticker: params.mediaPaths?.sticker ?? null,
        storyPhoto: params.mediaPaths?.storyPhoto ?? null,
        conditions: params.mediaPaths?.conditions ?? project.conditionsImagePath ?? null,
        bet1: params.mediaPaths?.bet1 ?? null,
        bet2: params.mediaPaths?.bet2 ?? null,
        bet3: params.mediaPaths?.bet3 ?? null,
        receipt: params.mediaPaths?.receipt ?? null,
        captura: params.mediaPaths?.captura ?? null,
      }
    : await sampleMediaPaths(project, params.mediaPaths);

  const [wallpaperUrl, avatarUrl, uris] = await Promise.all([
    resolveLiveWallpaper(project.id, project.wallpaperPath, true),
    resolveLiveAvatarUrl(project.id, project.clientAvatarPath),
    resolveMediaServeUrls(rawPaths),
  ]);

  const wallpaperForColor = project.wallpaperPath ? fileToDataUri(project.wallpaperPath) : null;

  const frostWallpaperUrl = wallpaperUrl;
  const [wallpaperCutoutUrl, wallpaperCutoutColor] = wallpaperForColor
    ? [null, await averageWallpaperColor(wallpaperForColor)]
    : [null, null];

  let messages: RenderMessage[];
  let clientName: string;
  let mode: "sample" | "review";

  if (params.dialog) {
    messages = dialogToRenderMessages(params.dialog.messages, uris, {
      now,
      timeZone: clockCfg.timeZone,
      locale: clockCfg.locale,
    });
    clientName = params.dialog.clientName;
    mode = "review";
  } else {
    messages = enrichSampleMessages(project, now, uris);
    clientName = project.managerName;
    mode = "sample";
  }

  const statusBarTime =
    messages.at(-1)?.time ?? formatStatusBarTime(now, clockCfg.timeZone);

  const html = buildChatHtml({
    project,
    clientName,
    messages,
    wallpaperUrl,
    frostWallpaperUrl,
    wallpaperCutoutUrl,
    wallpaperCutoutColor,
    clientAvatarUrl: avatarUrl,
    statusBarTime,
    clockTimeZone: clockCfg.timeZone,
    livePreview: true,
  });

  return {
    html,
    timeZone: clockCfg.timeZone,
    locale: clockCfg.locale,
    statusBarTime,
    clientName,
    mode,
  };
}
