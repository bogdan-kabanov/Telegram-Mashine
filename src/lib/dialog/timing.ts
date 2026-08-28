/** Minutes from dialog start when a major stage begins (natural pauses between phases). */
export const STAGE_ANCHOR = {
  greeting: 0,
  trust_building: 12,
  conditions: 22,
  deposit: 32,
  bet_1: 48,
  bet_2: 78,
  bet_3: 110,
  /** After bets the lead is offline — leave room for 15–35 min replies. */
  completion: 150,
  payout: 158,
  gratitude: 165,
} as const satisfies Record<string, number>;

export type DialogStage = keyof typeof STAGE_ANCHOR;
export type DialogRole = "client" | "manager";

type Range = readonly [min: number, max: number];

/** Manager reply after a client message — not instant, but stays in the conversation. */
const MANAGER_AFTER_CLIENT: Partial<Record<DialogStage, Range>> = {
  greeting: [3, 6],
  trust_building: [2, 5],
  conditions: [2, 4],
  deposit: [3, 6],
  completion: [4, 8],
  payout: [2, 4],
};

/** Client reply after a manager message — usually faster than the manager. */
const CLIENT_AFTER_MANAGER: Partial<Record<DialogStage, Range>> = {
  greeting: [1, 3],
  trust_building: [1, 4],
  conditions: [1, 3],
  deposit: [2, 5],
  completion: [2, 4],
  payout: [1, 3],
  gratitude: [1, 2],
};

const SAME_ROLE_BURST: Range = [0, 1];
const MANAGER_BURST: Range = [1, 2];
const CLIENT_CAPTURA: Range = [4, 10];
const AFTER_BET: Range = [15, 35];

function randInt(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Incremental dialog clock: each `next()` advances time from the previous message.
 * Stage anchors create natural gaps between phases; within a phase, turns stay close.
 */
export class DialogClock {
  private current = 0;
  private lastRole: DialogRole | null = null;
  private stage: DialogStage = "greeting";

  constructor(private readonly rng: () => number = Math.random) {}

  get delayMinutes(): number {
    return this.current;
  }

  /** Jump forward to at least the stage anchor (e.g. trust_building → 12 min). */
  setStage(stage: string): void {
    const key = stage as DialogStage;
    this.stage = key in STAGE_ANCHOR ? key : this.stage;
    const anchor = STAGE_ANCHOR[this.stage as DialogStage];
    if (anchor != null && anchor > this.current) {
      this.current = anchor;
    }
  }

  /** First message at t=0. */
  atStart(role: DialogRole): number {
    this.lastRole = role;
    return this.current;
  }

  /** Same minute as the previous message (sticker + text, image with caption). */
  sameTime(): number {
    return this.current;
  }

  /** Client typing several messages in a row. */
  clientBurst(): number {
    return this.advanceSameRole("client", SAME_ROLE_BURST);
  }

  /** Manager sends another bubble without waiting for the client. */
  managerBurst(): number {
    return this.advanceSameRole("manager", MANAGER_BURST);
  }

  /** Standard turn — delay depends on who spoke last and the current stage. */
  next(role: DialogRole, kind?: "bet_reply" | "captura"): number {
    if (this.lastRole === null) {
      return this.atStart(role);
    }
    if (role === this.lastRole) {
      const range = role === "client" ? SAME_ROLE_BURST : MANAGER_BURST;
      return this.advanceSameRole(role, range);
    }
    if (kind === "bet_reply") {
      return this.advanceAfterRole(role, AFTER_BET);
    }
    if (kind === "captura") {
      return this.advanceAfterRole(role, CLIENT_CAPTURA);
    }
    if (role === "manager") {
      const range = MANAGER_AFTER_CLIENT[this.stage] ?? [2, 5];
      return this.advanceAfterRole(role, range);
    }
    const range = CLIENT_AFTER_MANAGER[this.stage] ?? [1, 3];
    return this.advanceAfterRole(role, range);
  }

  /** Explicit forward jump (e.g. scripted captura step with fixed offset). */
  advanceMinutes(min: number, max = min): number {
    this.current += randInt(min, max, this.rng);
    return this.current;
  }

  private advanceSameRole(role: DialogRole, range: Range): number {
    this.current += randInt(range[0], range[1], this.rng);
    this.lastRole = role;
    return this.current;
  }

  private advanceAfterRole(role: DialogRole, range: Range): number {
    this.current += randInt(range[0], range[1], this.rng);
    this.lastRole = role;
    return this.current;
  }
}

/** @deprecated Use STAGE_ANCHOR — kept for callers that only need stage base delay. */
export function stageAnchorDelay(stage: string): number {
  return STAGE_ANCHOR[stage as DialogStage] ?? 10;
}

/** Lead is not glued to chat — reply after a bet takes minutes, not ~1 min. */
export function delayAfterBetMinutes(baseDelay: number, rng: () => number = Math.random): number {
  return baseDelay + randInt(AFTER_BET[0], AFTER_BET[1], rng);
}

/** Build monotonic delayMinutes for a sample/preview message list. */
export function samplePreviewDelays(
  roles: DialogRole[],
  rng: () => number = Math.random,
): number[] {
  const clock = new DialogClock(rng);
  return roles.map((role, index) => {
    if (index === 0) return clock.atStart(role);
    return clock.next(role);
  });
}
