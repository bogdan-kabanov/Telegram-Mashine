import { betDepositForSlot, betProfitForSlot } from "@/lib/amounts/split-profit";
import { loadAppConfig, getProjectById } from "@/lib/config/loader";
import { buildMessageClock } from "@/lib/format";
import { localeClockConfig } from "@/lib/i18n/locale-profile";
import { resolveTemplateFilenameForRegen } from "@/lib/media/slip-source";
import type { ReviewPackage } from "@/lib/schemas";
import { getMediaHandler } from "@/modules/media-handler";

export const PATCHABLE_MEDIA_SLOTS = [
  "storyPhoto",
  "conditions",
  "bet1",
  "bet2",
  "bet3",
  "receipt",
  "captura",
  "sticker",
] as const;

export type PatchableMediaSlot = (typeof PATCHABLE_MEDIA_SLOTS)[number];

export function isPatchableMediaSlot(slot: string): slot is PatchableMediaSlot {
  return (PATCHABLE_MEDIA_SLOTS as readonly string[]).includes(slot);
}

export type SlotPatchResult = {
  path: string;
  source?: "overlay" | "ai" | "template" | "html";
  dialog?: ReviewPackage["dialog"];
};

/**
 * Regenerate one media slot for an existing review (no full pipeline).
 */
export async function regenerateReviewMediaSlot(params: {
  review: ReviewPackage;
  slot: PatchableMediaSlot;
  /** Absolute/relative path from media library pick. */
  path?: string;
  generate?: boolean;
  now?: string;
  amount?: number;
}): Promise<SlotPatchResult> {
  const { review, slot } = params;
  let nextPath = params.path?.trim() || "";
  let slipSource: SlotPatchResult["source"];
  let dialog = review.dialog;

  if (!params.generate) {
    if (!nextPath) throw new Error("Укажите файл или включите generate");
    return { path: nextPath };
  }

  const project = await getProjectById(review.projectId);

  if (slot === "storyPhoto") {
    const { generateClientPhoto } = await import("@/lib/openai/images");
    const hint =
      review.dialog?.messages
        .filter((m) => m.role === "client" && m.type === "text")
        .slice(0, 4)
        .map((m) => m.content)
        .join(" ")
        .slice(0, 400) || undefined;
    const generated = await generateClientPhoto({
      projectId: project.id,
      clientName: review.clientName,
      locale: project.locale,
      ...(hint ? { hint } : {}),
      saveToPool: true,
    });
    if (!generated) throw new Error("Не удалось сгенерировать фото");
    return { path: generated.path };
  }

  if (slot === "receipt" || slot === "captura") {
    if (!dialog) throw new Error("Нет диалога для пересборки чека");
    const config = await loadAppConfig();
    const clockCfg = localeClockConfig(project.locale);
    const now = params.now ? new Date(params.now) : new Date();
    const clock = buildMessageClock(dialog.messages, {
      now,
      timeZone: clockCfg.timeZone,
      locale: clockCfg.locale,
    });
    const depositBank = config.banks.depositBanks.find((b) => b.id === dialog!.depositBankId);
    const payoutBank = config.banks.payoutBanks.find((b) => b.id === dialog!.payoutBankId);
    const mediaHandler = getMediaHandler();
    const overrideAmount = params.amount;

    if (slot === "captura") {
      const stamp = clock.stampForType(dialog.messages, "captura") ?? clock.stampAtDelay(40);
      const capturaAmount = overrideAmount ?? dialog.deposit;
      const templateFilename = resolveTemplateFilenameForRegen({
        mediaPath: params.path ?? review.renderMedia?.captura,
      });
      const captura = await mediaHandler.generateCaptura({
        amount: capturaAmount,
        currency: project.currency,
        senderName: dialog.clientName,
        recipientLabel: project.managerName,
        clabe: dialog.clabe,
        bankId: dialog.depositBankId,
        bankName: depositBank?.shortName ?? depositBank?.name ?? "Banco",
        date: stamp.date,
        time: stamp.time,
        accountLastDigits: dialog.accountLastDigits,
        project,
        ...(project.capturaStyle ? { style: project.capturaStyle } : {}),
        ...(templateFilename ? { templateFilename } : {}),
      });
      nextPath = captura.path;
      slipSource = captura.source;
      if (overrideAmount) dialog = { ...dialog, deposit: overrideAmount };
    } else {
      const stamp =
        clock.stampForType(dialog.messages, "receipt") ?? clock.stampAt(dialog.messages.length - 1);
      const receiptAmount = overrideAmount ?? dialog.payoutAmount;
      const templateFilename = resolveTemplateFilenameForRegen({
        mediaPath: params.path ?? review.renderMedia?.receipt,
      });
      const receipt = await mediaHandler.generateReceipt({
        amount: receiptAmount,
        currency: project.currency,
        senderName: project.managerName,
        recipientName: dialog.clientName,
        bankId: dialog.payoutBankId,
        bankName: payoutBank?.shortName ?? payoutBank?.name ?? "Banco",
        accountLastDigits: dialog.accountLastDigits,
        date: stamp.date,
        time: stamp.time,
        project,
        ...(project.receiptStyle ? { style: project.receiptStyle } : {}),
        ...(templateFilename ? { templateFilename } : {}),
      });
      nextPath = receipt.path;
      slipSource = receipt.source;
      if (overrideAmount) dialog = { ...dialog, payoutAmount: overrideAmount };
    }
    return { path: nextPath, source: slipSource, dialog };
  }

  if (slot.startsWith("bet")) {
    if (!dialog) throw new Error("Нет диалога для сумм на ставке");
    const { stampExistingBet, stampProjectBetSlot } = await import("@/lib/media/stamp-bets");
    const slotNum = slot === "bet2" ? 2 : slot === "bet3" ? 3 : 1;
    const overrideAmount = params.amount;
    const profit =
      overrideAmount ??
      betProfitForSlot(
        {
          profit1: dialog.profit1,
          profit2: dialog.profit2,
          profit3: dialog.profit3 ?? 0,
          profitFinal: dialog.profitFinal,
        },
        slotNum,
      );
    const slotDeposit = betDepositForSlot(
      {
        deposit: dialog.deposit,
        profit1: dialog.profit1,
        profit2: dialog.profit2,
      },
      slotNum,
    );
    const source = (review.renderMedia?.[slot as "bet1" | "bet2" | "bet3"] ?? "").trim();
    if (source) {
      const stamped = await stampExistingBet({
        sourcePath: source,
        projectId: project.id,
        deposit: slotDeposit,
        profit,
        currency: project.currency,
        name: dialog.clientName,
      });
      nextPath = stamped.path;
    } else {
      const stamped = await stampProjectBetSlot({
        projectId: project.id,
        slot: slotNum,
        deposit: slotDeposit,
        profit,
        currency: project.currency,
        name: dialog.clientName,
      });
      nextPath = stamped.path;
    }
    if (overrideAmount) {
      if (slot === "bet1") dialog = { ...dialog, profit1: overrideAmount };
      else if (slot === "bet2") dialog = { ...dialog, profit2: overrideAmount };
      else dialog = { ...dialog, profit3: overrideAmount };
    }
    return { path: nextPath, source: "overlay", dialog };
  }

  const { generateSceneMedia } = await import("@/lib/openai/scene-media");
  const kind = slot === "conditions" ? "conditions" : "sticker";
  const generated = await generateSceneMedia({
    kind,
    projectId: kind === "sticker" ? null : project.id,
    projectName: project.name,
    locale: project.locale,
    currency: project.currency,
    clientName: review.clientName,
    reviewId: review.id,
    force: true,
  });
  if (!generated) throw new Error("Не удалось сгенерировать медиа");
  return { path: generated.path };
}

export function applySlotToRenderMedia(
  renderMedia: ReviewPackage["renderMedia"] | null | undefined,
  slot: PatchableMediaSlot,
  path: string,
): NonNullable<ReviewPackage["renderMedia"]> {
  return {
    sticker: renderMedia?.sticker ?? null,
    storyPhoto: renderMedia?.storyPhoto ?? null,
    conditions: renderMedia?.conditions ?? null,
    bet1: renderMedia?.bet1 ?? null,
    bet2: renderMedia?.bet2 ?? null,
    bet3: renderMedia?.bet3 ?? null,
    receipt: renderMedia?.receipt ?? null,
    captura: renderMedia?.captura ?? null,
    [slot]: path,
  };
}
