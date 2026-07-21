import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { usedCombinations } from "@/lib/db/schema";

export interface CombinationPick {
  legendId: string;
  amountPackId: string;
  clientName: string;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export async function isCombinationUsed(
  projectId: string,
  pick: CombinationPick,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select()
    .from(usedCombinations)
    .where(
      and(
        eq(usedCombinations.projectId, projectId),
        eq(usedCombinations.legendId, pick.legendId),
        eq(usedCombinations.amountPackId, pick.amountPackId),
        eq(usedCombinations.clientName, pick.clientName),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

export async function markCombinationUsed(
  projectId: string,
  pick: CombinationPick,
): Promise<void> {
  const db = getDb();
  await db.insert(usedCombinations).values({
    id: randomUUID(),
    projectId,
    legendId: pick.legendId,
    amountPackId: pick.amountPackId,
    clientName: pick.clientName,
    usedAt: new Date().toISOString(),
  });
}

export async function pickUnusedCombination(params: {
  projectId: string;
  legendIds: string[];
  amountPackIds: string[];
  clientNames: string[];
}): Promise<CombinationPick> {
  const legends = shuffle(params.legendIds);
  const packs = shuffle(params.amountPackIds);
  const names = shuffle(params.clientNames);

  for (const legendId of legends) {
    for (const amountPackId of packs) {
      for (const clientName of names) {
        const pick = { legendId, amountPackId, clientName };
        if (!(await isCombinationUsed(params.projectId, pick))) {
          return pick;
        }
      }
    }
  }

  throw new Error(
    `All combinations exhausted for project ${params.projectId}. Reset used_combinations or add more legends/names/packs.`,
  );
}
