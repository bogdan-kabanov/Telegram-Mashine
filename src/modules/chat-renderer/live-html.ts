import { and, eq } from "drizzle-orm";

import { computeMessageTimes, formatStatusBarTime, injectTemplate } from "@/lib/format";
import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { localeClockConfig } from "@/lib/i18n/locale-profile";
import type { ProjectConfig } from "@/lib/schemas/projects";
import type { GeneratedDialog } from "@/modules/dialog-generator";

import { composeChatRenderParams, composeDialogChat, sampleClientNameForProject } from "./compose";
import type { DialogMediaAssets } from "./messages";
import {
  enrichSampleMessages,
  ensureSamplePreviewMedia,
} from "./preview-media";

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

/**
 * Live admin preview — same compose + stamped media as trial (sample mode),
 * or saved review dialog (review mode).
 */
export async function composeLiveChatHtml(params: {
  project: ProjectConfig;
  dialog?: GeneratedDialog | null;
  mediaPaths?: DialogMediaAssets;
  now: Date;
  overrides?: LiveHtmlOverrides;
}): Promise<LiveComposeResult> {
  const project = applyOverrides(params.project, params.overrides);
  const now = params.now;

  if (params.dialog) {
    const mediaPaths: DialogMediaAssets = {
      sticker: params.mediaPaths?.sticker ?? null,
      storyPhoto: params.mediaPaths?.storyPhoto ?? null,
      conditions:
        params.mediaPaths?.conditions ?? project.conditionsImagePath ?? null,
      bet1: params.mediaPaths?.bet1 ?? null,
      bet2: params.mediaPaths?.bet2 ?? null,
      bet3: params.mediaPaths?.bet3 ?? null,
      receipt: params.mediaPaths?.receipt ?? null,
      captura: params.mediaPaths?.captura ?? null,
    };

    const composed = await composeDialogChat({
      project,
      dialog: params.dialog,
      mediaPaths,
      now,
      mediaMode: "serve",
      interactive: true,
    });

    return {
      html: composed.html,
      timeZone: composed.timeZone,
      locale: composed.locale,
      statusBarTime: composed.statusBarTime,
      clientName: params.dialog.clientName,
      mode: "review",
    };
  }

  const stamped = await ensureSamplePreviewMedia({
    project,
    now,
    ...(params.mediaPaths ? { overrides: params.mediaPaths } : {}),
  });

  // If constructor passed explicit media paths, prefer them over cache.
  const media: DialogMediaAssets = {
    ...stamped.media,
    ...(params.mediaPaths?.conditions ? { conditions: params.mediaPaths.conditions } : {}),
    ...(params.mediaPaths?.storyPhoto ? { storyPhoto: params.mediaPaths.storyPhoto } : {}),
    ...(params.mediaPaths?.sticker ? { sticker: params.mediaPaths.sticker } : {}),
    ...(params.mediaPaths?.bet1 ? { bet1: params.mediaPaths.bet1 } : {}),
    ...(params.mediaPaths?.bet2 ? { bet2: params.mediaPaths.bet2 } : {}),
    ...(params.mediaPaths?.bet3 ? { bet3: params.mediaPaths.bet3 } : {}),
    ...(params.mediaPaths?.captura ? { captura: params.mediaPaths.captura } : {}),
    ...(params.mediaPaths?.receipt ? { receipt: params.mediaPaths.receipt } : {}),
  };

  // Fill missing non-slip slots from pool without blocking on stamps.
  if (!media.sticker) {
    const stickers = await peekProjectPaths("sticker", project.id, 1);
    media.sticker = stickers[0] ?? null;
  }

  const messages = enrichSampleMessages(project, now, media, stamped.displayVars);
  const clientName = sampleClientNameForProject(project);

  const composed = await composeChatRenderParams({
    project,
    clientName,
    messages,
    mediaPaths: media,
    now,
    mediaMode: "serve",
    interactive: true,
    preferredAvatarPath: project.clientAvatarPath ?? null,
  });

  return {
    html: composed.html,
    timeZone: composed.timeZone,
    locale: composed.locale,
    statusBarTime: composed.statusBarTime,
    clientName,
    mode: "sample",
  };
}

/** @deprecated — tests / legacy; prefer composeLiveChatHtml */
export function injectSampleTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return injectTemplate(template, vars);
}

export { computeMessageTimes, formatStatusBarTime, localeClockConfig };
