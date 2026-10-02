import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

import { and, eq } from "drizzle-orm";

import {
  buildAmountDisplayVars,
  buildAmountSnapshot,
  type AmountSnapshot,
} from "@/lib/amounts/sync-dialog";
import { pickAvailableClientPhoto } from "@/lib/client-photos";
import { loadAppConfig } from "@/lib/config/loader";
import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { buildMessageClock, formatAmount, generateClabe, injectTemplate, computeMessageTimes } from "@/lib/format";
import { DialogClock } from "@/lib/dialog/timing";
import { chatUiForLocale } from "@/lib/i18n/chat-ui";
import { localeClockConfig } from "@/lib/i18n/locale-profile";
import { resolveLocaleProfileFromConfig } from "@/lib/i18n/locale-profile";
import { selectAmountPacksForProject } from "@/lib/schemas/amounts";
import type { ProjectConfig } from "@/lib/schemas/projects";
import { createLogger } from "@/lib/runtime/manager";
import { getMediaHandler } from "@/modules/media-handler";
import { stampProjectBetPack } from "@/lib/media/stamp-bets";

import type { DialogMediaAssets } from "./messages";
import type { RenderMessage } from "./template";

const logger = createLogger("preview-media");

type PreviewCacheMeta = {
  key: string;
  projectId: string;
  packId: string;
  dateBucket: string;
  snapshot: AmountSnapshot;
  media: DialogMediaAssets;
  createdAt: string;
};

function dataDir(): string {
  return process.env.DATA_DIR ?? "./data";
}

function cacheRoot(projectId: string): string {
  return path.resolve(dataDir(), "media/preview-cache", projectId);
}

function dateBucket(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
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

export async function resolvePreviewAmountSnapshot(
  project: ProjectConfig,
): Promise<{ snapshot: AmountSnapshot; packId: string; bankName: string; clabe: string }> {
  const config = await loadAppConfig();
  const packs = selectAmountPacksForProject(
    config.amounts.packs,
    project.id,
    project.currency,
  );
  const pack = packs[0] ?? config.amounts.packs[0];
  if (!pack) {
    throw new Error("Нет amount pack для превью");
  }

  const localeProfile = resolveLocaleProfileFromConfig(config.geo, project.locale);
  const depositBanks = config.banks.depositBanks.filter(
    (b) => b.country === localeProfile.bankCountry,
  );
  const bank = depositBanks[0] ?? config.banks.depositBanks[0];
  const bankName = bank?.shortName ?? bank?.name ?? "Spin";
  const lastDigits = "4821";
  const clabe = generateClabe(bank?.clabePrefix, lastDigits);
  const commissionRate = project.id === "francesca" ? 0.1 : 0;
  const snapshot = buildAmountSnapshot({
    deposit: pack.deposit,
    profit1: pack.profit1,
    profit2: pack.profit2,
    profitFinal: pack.profitFinal,
    currency: project.currency,
    commissionRate,
    clabe,
    bankName,
  });

  return { snapshot, packId: pack.id, bankName, clabe };
}

/**
 * Build or reuse stamped captura/receipt/bets for sample live preview.
 */
export async function ensureSamplePreviewMedia(params: {
  project: ProjectConfig;
  now: Date;
  overrides?: Partial<DialogMediaAssets>;
}): Promise<{
  media: DialogMediaAssets;
  snapshot: AmountSnapshot;
  packId: string;
  displayVars: Record<string, string | number>;
}> {
  const { project, now } = params;
  const clockCfg = localeClockConfig(project.locale);
  const bucket = dateBucket(now, clockCfg.timeZone);
  const { snapshot, packId, bankName, clabe } = await resolvePreviewAmountSnapshot(project);
  const displayVars = buildAmountDisplayVars(snapshot);

  const key = createHash("sha1")
    .update(
      JSON.stringify({
        projectId: project.id,
        packId,
        bucket,
        deposit: snapshot.deposit,
        payout: snapshot.payoutAmount,
        p1: snapshot.profit1,
        p2: snapshot.profit2,
        p3: snapshot.profit3,
      }),
    )
    .digest("hex")
    .slice(0, 16);

  const root = cacheRoot(project.id);
  const metaPath = path.join(root, `${key}.json`);

  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as PreviewCacheMeta;
      const media: DialogMediaAssets = {
        ...meta.media,
        ...(params.overrides ?? {}),
      };
      return { media, snapshot, packId, displayVars };
    } catch {
      /* regenerate */
    }
  }

  mkdirSync(root, { recursive: true });

  const [stickerRows, photo, conditions] = await Promise.all([
    peekProjectPaths("sticker", project.id, 1),
    pickAvailableClientPhoto({ preferUnused: true, projectId: project.id }),
    Promise.resolve(project.conditionsImagePath ?? null),
  ]);

  const mediaHandler = getMediaHandler();
  const clock = buildMessageClock(
    [
      { delayMinutes: 0 },
      { delayMinutes: 12 },
      { delayMinutes: 45 },
      { delayMinutes: 90 },
      { delayMinutes: 110 },
    ],
    { now, timeZone: clockCfg.timeZone, locale: clockCfg.locale },
  );
  const capturaStamp = clock.stampAt(2);
  const receiptStamp = clock.stampAt(4);

  const config = await loadAppConfig();
  const localeProfile = resolveLocaleProfileFromConfig(config.geo, project.locale);
  const depositBank =
    config.banks.depositBanks.find((b) => b.country === localeProfile.bankCountry) ??
    config.banks.depositBanks[0];
  const payoutBank =
    config.banks.payoutBanks.find((b) => b.country === localeProfile.bankCountry) ??
    config.banks.payoutBanks[0];

  const sampleClient = chatUiForLocale(project.locale).sampleClientName;

  let capturaPath: string | null = params.overrides?.captura ?? null;
  let receiptPath: string | null = params.overrides?.receipt ?? null;
  let bet1: string | null = params.overrides?.bet1 ?? null;
  let bet2: string | null = params.overrides?.bet2 ?? null;
  let bet3: string | null = params.overrides?.bet3 ?? null;

  try {
    if (!capturaPath) {
      const captura = await mediaHandler.generateCaptura({
        amount: snapshot.deposit,
        currency: project.currency,
        senderName: sampleClient,
        recipientLabel: project.managerName,
        clabe,
        bankId: depositBank?.id ?? "spin",
        bankName,
        date: capturaStamp.date,
        time: capturaStamp.time,
        accountLastDigits: clabe.slice(-4),
        project,
        ...(project.capturaStyle ? { style: project.capturaStyle } : {}),
      });
      capturaPath = captura.path;
    }
    if (!receiptPath) {
      const receipt = await mediaHandler.generateReceipt({
        amount: snapshot.payoutAmount,
        currency: project.currency,
        senderName: project.managerName,
        recipientName: sampleClient,
        bankId: payoutBank?.id ?? "spin",
        bankName: payoutBank?.shortName ?? payoutBank?.name ?? bankName,
        accountLastDigits: clabe.slice(-4),
        date: receiptStamp.date,
        time: receiptStamp.time,
        project,
        ...(project.receiptStyle ? { style: project.receiptStyle } : {}),
      });
      receiptPath = receipt.path;
    }
    if (!bet1 || !bet2 || !bet3) {
      const stamped = await stampProjectBetPack({
        projectId: project.id,
        deposit: snapshot.deposit,
        profit1: snapshot.profit1,
        profit2: snapshot.profit2,
        profit3: snapshot.profit3,
        currency: project.currency,
        name: sampleClient,
      });
      bet1 = bet1 ?? stamped.find((b) => b.slot === 1)?.path ?? null;
      bet2 = bet2 ?? stamped.find((b) => b.slot === 2)?.path ?? null;
      bet3 = bet3 ?? stamped.find((b) => b.slot === 3)?.path ?? null;
    }
  } catch (error) {
    await logger.warn("Preview stamp failed — using available overrides only", {
      projectId: project.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const media: DialogMediaAssets = {
    conditions: params.overrides?.conditions ?? conditions,
    bet1,
    bet2,
    bet3,
    sticker: params.overrides?.sticker ?? stickerRows[0] ?? null,
    storyPhoto: params.overrides?.storyPhoto ?? photo?.path ?? null,
    receipt: receiptPath,
    captura: capturaPath,
  };

  const meta: PreviewCacheMeta = {
    key,
    projectId: project.id,
    packId,
    dateBucket: bucket,
    snapshot,
    media,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");

  return { media, snapshot, packId, displayVars };
}

function snippet(template: string, vars: Record<string, string | number>, max = 220): string {
  const filled = injectTemplate(template, vars).trim();
  if (filled.length <= max) return filled;
  return `${filled.slice(0, max).trim()}…`;
}

/** Sample dialog skeleton with pack-aligned amounts (same slots as trial). */
export function enrichSampleMessages(
  project: ProjectConfig,
  now: Date,
  media: DialogMediaAssets,
  displayVars: Record<string, string | number>,
): RenderMessage[] {
  const ui = chatUiForLocale(project.locale);
  const clientLine =
    ui.sampleMessages.find((m) => m.role === "client")?.content ?? "Necesito tu ayuda";
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
    content: snippet(project.depositMessageTemplate, displayVars),
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
  const bets: Array<{
    id: string;
    slot: "bet1" | "bet2" | "bet3";
    url: string;
    stage: "bet_1" | "bet_2" | "bet_3";
  }> = [];
  if (media.bet1) bets.push({ id: "sample-bet1", slot: "bet1", url: media.bet1, stage: "bet_1" });
  if (media.bet2) bets.push({ id: "sample-bet2", slot: "bet2", url: media.bet2, stage: "bet_2" });
  if (media.bet3) bets.push({ id: "sample-bet3", slot: "bet3", url: media.bet3, stage: "bet_3" });
  for (const bet of bets) {
    clock.setStage(bet.stage);
    extra.push({
      id: bet.id,
      role: "client",
      type: "image",
      content: "__image__",
      time: "12:00",
      delayMinutes: t("client", "bet_reply"),
      imageUrl: bet.url,
      mediaKind: "bet",
      mediaSlot: bet.slot,
    });
  }
  clock.setStage("completion");
  extra.push({
    id: "sample-completion",
    role: "manager",
    type: "text",
    content: snippet(project.completionMessageTemplate, displayVars, 160),
    time: "12:00",
    delayMinutes: t("manager"),
    read: true,
  });
  clock.setStage("payout");
  extra.push({
    id: "sample-payout",
    role: "manager",
    type: "text",
    content: snippet(project.payoutMessageTemplate, displayVars, 140),
    time: "12:00",
    delayMinutes: clock.managerBurst(),
    read: true,
  });
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

/** @deprecated kept for type imports — use formatAmount via display vars */
export function formatPreviewDeposit(deposit: number, currency: string): string {
  return formatAmount(deposit, currency);
}
