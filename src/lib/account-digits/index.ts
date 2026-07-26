import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { usedAccountDigits } from "@/lib/db/schema";

function shuffleRange(min: number, max: number): number[] {
  const values: number[] = [];
  for (let v = min; v <= max; v++) values.push(v);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  return values;
}

export async function isAccountDigitsUsed(digits: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select()
    .from(usedAccountDigits)
    .where(eq(usedAccountDigits.digits, digits))
    .limit(1);
  return rows.length > 0;
}

export async function markAccountDigitsUsed(params: {
  digits: string;
  projectId: string;
  reviewId?: string | null;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(usedAccountDigits)
    .values({
      digits: params.digits,
      projectId: params.projectId,
      reviewId: params.reviewId ?? null,
      usedAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
}

/**
 * Pick unused last-4 account digits in [min, max] (inclusive).
 * Digits are globally unique across projects (TZ §4.3).
 */
export async function pickUniqueAccountDigits(params: {
  min: number;
  max: number;
  projectId: string;
  reviewId?: string | null;
}): Promise<string> {
  const candidates = shuffleRange(params.min, params.max);

  for (const value of candidates) {
    const digits = String(value);
    if (await isAccountDigitsUsed(digits)) continue;
    await markAccountDigitsUsed({
      digits,
      projectId: params.projectId,
      ...(params.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
    });
    return digits;
  }

  throw new Error(
    `All account last-4 digits exhausted in range ${params.min}-${params.max}. Reset used_account_digits.`,
  );
}
