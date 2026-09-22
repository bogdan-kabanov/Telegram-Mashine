import { betDepositsForPack } from "@/lib/amounts/split-profit";
import { randomUUID } from "crypto";
import { renameSync, unlinkSync } from "fs";
import path from "path";

import { listCompleteBetPacks, pickNextBetPack } from "@/lib/bet-cycle";
import { overlayBetScreenshot, resolveStoredMediaPath } from "@/lib/media/overlay-receipt";
import { generateAiBetEdit, isAiBetEditEnabled } from "@/lib/openai/bets";
import { createLogger } from "@/lib/runtime/manager";

const logger = createLogger("stamp-bets");

export type StampedBet = {
  path: string;
  filename: string;
  slot: 1 | 2 | 3;
  fields: string[];
  source: "ai" | "overlay";
};

function stampedAbs(projectId: string, dataDir: string): { abs: string; rel: string; filename: string } {
  const filename = `${randomUUID()}.png`;
  const abs = path.resolve(dataDir, "media/stamped/bets", projectId, filename);
  return { abs, rel: `data/media/stamped/bets/${projectId}/${filename}`, filename };
}

async function stampOne(params: {
  sourcePath: string;
  projectId: string;
  deposit: number;
  profit: number;
  currency: string;
  name?: string;
  locale?: string;
  dataDir: string;
  slot: 1 | 2 | 3;
}): Promise<StampedBet> {
  const out = stampedAbs(params.projectId, params.dataDir);
  const absSource = resolveStoredMediaPath(params.sourcePath, params.dataDir);

  if (isAiBetEditEnabled()) {
    const ai = await generateAiBetEdit({
      imagePath: absSource,
      outputPath: out.abs,
      deposit: params.deposit,
      profit: params.profit,
      currency: params.currency,
      ...(params.name ? { name: params.name } : {}),
      ...(params.locale ? { locale: params.locale } : {}),
    });
    if (ai) {
      // gpt-image often keeps MXN even when asked — OCR-stamp amounts+currency on the AI result.
      const refinePath = `${out.abs}.currency.png`;
      try {
        const refined = await overlayBetScreenshot({
          imagePath: out.abs,
          outputPath: refinePath,
          deposit: params.deposit,
          profit: params.profit,
          currency: params.currency,
          ...(params.name ? { name: params.name } : {}),
          dataDir: params.dataDir,
        });
        if (refined) {
          try {
            unlinkSync(out.abs);
          } catch {
            /* ignore */
          }
          renameSync(refinePath, out.abs);
          await logger.info("Bet AI result refined with OCR currency stamp", {
            slot: params.slot,
            currency: params.currency,
            fields: refined.fields,
          });
        }
      } catch (err) {
        await logger.warn("Bet currency refine skipped", {
          slot: params.slot,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      await logger.info("Bet stamped via AI image edit", {
        slot: params.slot,
        source: absSource,
        out: out.rel,
        currency: params.currency,
      });
      return {
        path: out.rel,
        filename: out.filename,
        slot: params.slot,
        fields: ["deposit", "profit"],
        source: "ai",
      };
    }
    await logger.warn("AI bet edit unavailable — falling back to OCR overlay", {
      slot: params.slot,
      source: absSource,
    });
  }

  const overlay = await overlayBetScreenshot({
    imagePath: absSource,
    outputPath: out.abs,
    deposit: params.deposit,
    profit: params.profit,
    currency: params.currency,
    ...(params.name ? { name: params.name } : {}),
    dataDir: params.dataDir,
  });
  if (!overlay) {
    throw new Error("Не удалось прочитать суммы на этом скрине ставки — новая фотка не рисуется.");
  }
  return {
    path: out.rel,
    filename: out.filename,
    slot: params.slot,
    fields: overlay.fields,
    source: "overlay",
  };
}

export async function stampExistingBet(params: {
  sourcePath: string;
  projectId: string;
  deposit: number;
  profit: number;
  currency: string;
  name?: string;
  locale?: string;
  dataDir?: string;
}): Promise<StampedBet> {
  const dataDir = params.dataDir ?? process.env.DATA_DIR ?? "./data";
  return stampOne({
    sourcePath: params.sourcePath,
    projectId: params.projectId,
    deposit: params.deposit,
    profit: params.profit,
    currency: params.currency,
    ...(params.name ? { name: params.name } : {}),
    ...(params.locale ? { locale: params.locale } : {}),
    dataDir,
    slot: 1,
  });
}

export async function stampProjectBetSlot(params: {
  projectId: string;
  slot: 1 | 2 | 3;
  deposit: number;
  profit: number;
  currency: string;
  packNumber?: number;
  randomPack?: boolean;
  name?: string;
  locale?: string;
  dataDir?: string;
}): Promise<StampedBet> {
  const packs = await listCompleteBetPacks(params.projectId);
  if (packs.length === 0) {
    throw new Error("В медиатеке нет готового пака ставок (packNN_1/2/3). Загрузите скрины, ИИ их не рисует с нуля.");
  }
  let pack =
    (params.packNumber ? packs.find((p) => p.packNumber === params.packNumber) : null) ?? null;
  if (!pack && params.randomPack) {
    const next = await pickNextBetPack({ projectId: params.projectId });
    pack = next;
  }
  if (!pack) pack = packs[0]!;
  const source = pack.assets[params.slot - 1];
  if (!source) {
    throw new Error(`Нет скрина ставки ${params.slot} в паке ${pack.packNumber}.`);
  }
  const stamped = await stampExistingBet({
    sourcePath: source.path,
    projectId: params.projectId,
    deposit: params.deposit,
    profit: params.profit,
    currency: params.currency,
    ...(params.name ? { name: params.name } : {}),
    ...(params.locale ? { locale: params.locale } : {}),
    ...(params.dataDir ? { dataDir: params.dataDir } : {}),
  });
  return { ...stamped, slot: params.slot };
}

export async function stampProjectBetPack(params: {
  projectId: string;
  deposit: number;
  profit1: number;
  profit2: number;
  profit3: number;
  currency: string;
  deposit1?: number;
  deposit2?: number;
  deposit3?: number;
  packNumber?: number;
  randomPack?: boolean;
  name?: string;
  locale?: string;
  sourcePaths?: Array<string | null | undefined>;
  dataDir?: string;
}): Promise<StampedBet[]> {
  const dataDir = params.dataDir ?? process.env.DATA_DIR ?? "./data";
  const profits = [params.profit1, params.profit2, params.profit3] as const;
  const deposits = betDepositsForPack({
    deposit: params.deposit,
    profit1: params.profit1,
    profit2: params.profit2,
    ...(params.deposit1 != null ? { deposit1: params.deposit1 } : {}),
    ...(params.deposit2 != null ? { deposit2: params.deposit2 } : {}),
    ...(params.deposit3 != null ? { deposit3: params.deposit3 } : {}),
  });
  const sources: string[] = [];

  const explicit = (params.sourcePaths ?? []).filter((p): p is string => Boolean(p?.trim()));
  if (explicit.length >= 3) {
    sources.push(explicit[0]!, explicit[1]!, explicit[2]!);
  } else {
    const packs = await listCompleteBetPacks(params.projectId);
    if (packs.length === 0) {
      throw new Error("В медиатеке нет готового пака ставок (packNN_1/2/3). Загрузите скрины, ИИ их не рисует с нуля.");
    }
    let pack =
      (params.packNumber ? packs.find((p) => p.packNumber === params.packNumber) : null) ?? null;
    if (!pack && params.randomPack) {
      const next = await pickNextBetPack({ projectId: params.projectId });
      pack = next;
    }
    if (!pack) pack = packs[0]!;
    sources.push(pack.assets[0]!.path, pack.assets[1]!.path, pack.assets[2]!.path);
  }

  const stamped: StampedBet[] = [];
  for (let i = 0; i < 3; i++) {
    const source = sources[i]!;
    stamped.push(
      await stampOne({
        sourcePath: source,
        projectId: params.projectId,
        deposit: deposits[i]!,
        profit: profits[i]!,
        currency: params.currency,
        ...(params.name ? { name: params.name } : {}),
        ...(params.locale ? { locale: params.locale } : {}),
        dataDir,
        slot: (i + 1) as 1 | 2 | 3,
      }),
    );
  }
  return stamped;
}
