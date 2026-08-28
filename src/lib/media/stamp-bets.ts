import { betDepositsForPack } from "@/lib/amounts/split-profit";
import { randomUUID } from "crypto";
import path from "path";

import { listCompleteBetPacks, pickNextBetPack } from "@/lib/bet-cycle";
import { overlayBetScreenshot, resolveStoredMediaPath } from "@/lib/media/overlay-receipt";

export type StampedBet = {
  path: string;
  filename: string;
  slot: 1 | 2 | 3;
  fields: string[];
};

function stampedAbs(projectId: string, dataDir: string): { abs: string; rel: string; filename: string } {
  const filename = `${randomUUID()}.png`;
  const abs = path.resolve(dataDir, "media/stamped/bets", projectId, filename);
  return { abs, rel: `data/media/stamped/bets/${projectId}/${filename}`, filename };
}

export async function stampExistingBet(params: {
  sourcePath: string;
  projectId: string;
  deposit: number;
  profit: number;
  currency: string;
  name?: string;
  dataDir?: string;
}): Promise<StampedBet> {
  const dataDir = params.dataDir ?? process.env.DATA_DIR ?? "./data";
  const out = stampedAbs(params.projectId, dataDir);
  const overlay = await overlayBetScreenshot({
    imagePath: params.sourcePath,
    outputPath: out.abs,
    deposit: params.deposit,
    profit: params.profit,
    currency: params.currency,
    ...(params.name ? { name: params.name } : {}),
    dataDir,
  });
  if (!overlay) {
    throw new Error("Не удалось прочитать суммы на этом скрине ставки — новая фотка не рисуется.");
  }
  return {
    path: out.rel,
    filename: out.filename,
    slot: 1,
    fields: overlay.fields,
  };
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
  dataDir?: string;
}): Promise<StampedBet> {
  const packs = await listCompleteBetPacks(params.projectId);
  if (packs.length === 0) {
    throw new Error("В медиатеке нет готового пака ставок (packNN_1/2/3). Загрузите скрины, ИИ их не рисует.");
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
      throw new Error("В медиатеке нет готового пака ставок (packNN_1/2/3). Загрузите скрины, ИИ их не рисует.");
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
    const absSource = resolveStoredMediaPath(source, dataDir);
    const out = stampedAbs(params.projectId, dataDir);
    const overlay = await overlayBetScreenshot({
      imagePath: absSource,
      outputPath: out.abs,
      deposit: deposits[i]!,
      profit: profits[i]!,
      currency: params.currency,
      ...(params.name ? { name: params.name } : {}),
      dataDir,
    });
    if (!overlay) {
      throw new Error(
        `Не удалось проставить суммы на ставке ${i + 1}. Исходный скрин не перерисовываем.`,
      );
    }
    stamped.push({
      path: out.rel,
      filename: out.filename,
      slot: (i + 1) as 1 | 2 | 3,
      fields: overlay.fields,
    });
  }
  return stamped;
}
