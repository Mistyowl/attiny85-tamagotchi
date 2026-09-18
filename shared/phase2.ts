import type { PetState } from "./types";
import { FLAG_DIRTY, Screen, Stage } from "./types";
import { queueSfx, Sfx } from "./sound";
import { MinigameKind, MINIGAME_COUNT, clampMinigameKind } from "./minigame";

/** Lab force: -1 = random on each Play (device default). */
export const MG_RANDOM = -1;

export const PHASE2 = {
  minigame: true,
  adultBranch: true,
  /** Toilet / "Надудонил" rare event + after-feed chance. */
  rareEvents: true,
  /** -1 random, or MinigameKind 0..2 */
  activeKind: MG_RANDOM as number,
};

export function shouldUseMinigame(): boolean {
  return PHASE2.minigame;
}

export function setActiveMinigameKind(kind: number): void {
  if (kind === MG_RANDOM) {
    PHASE2.activeKind = MG_RANDOM;
    return;
  }
  PHASE2.activeKind = clampMinigameKind(kind);
}

export function getActiveMinigameKind(): number {
  return PHASE2.activeKind;
}

/** Kind launched by Play — only Pong / Arkanoid / Runner. */
export function pickPlayMinigameKind(pet: PetState): MinigameKind {
  if (PHASE2.activeKind >= MinigameKind.Pong && PHASE2.activeKind < MINIGAME_COUNT) {
    return PHASE2.activeKind as MinigameKind;
  }
  let s = (pet.minigameSeed || 1) >>> 0;
  s = (Math.imul(s, 1103515245) + 12345) >>> 0;
  s ^= (pet.ageTicks * 2654435761) >>> 0;
  s ^= (Date.now() & 0xffff) >>> 0;
  pet.minigameSeed = s || 1;
  return ((s >>> 0) % MINIGAME_COUNT) as MinigameKind;
}

export function resolveAdultStage(careScore: number): Stage {
  if (!PHASE2.adultBranch) return Stage.Adult;
  if (careScore >= 80) return Stage.AdultA;
  if (careScore <= 30) return Stage.AdultB;
  return Stage.Adult;
}

/** Shared LCG for care/rare rolls (reuses minigameSeed — not persisted meaning). */
export function nextCareRand(pet: PetState): number {
  let s = (pet.minigameSeed || 1) >>> 0;
  s = (Math.imul(s, 1103515245) + 12345) >>> 0;
  pet.minigameSeed = s || 1;
  return s >>> 0;
}

function canStartToiletEvent(pet: PetState): boolean {
  if (!PHASE2.rareEvents) return false;
  if (pet.flags & FLAG_DIRTY) return false;
  if (pet.stage === Stage.Egg) return false;
  if (pet.screen !== Screen.Home) return false;
  return true;
}

/** After Feed: ~1/4 chance to "Надудонил". */
export function tryPoopAfterFeed(pet: PetState): boolean {
  if (!canStartToiletEvent(pet)) return false;
  if (nextCareRand(pet) % 4 !== 0) return false;
  pet.flags |= FLAG_DIRTY;
  pet.feedbackTicks = 10;
  queueSfx(Sfx.Fart);
  return true;
}

/**
 * Rare life-tick toilet event: every 32 WDT ticks (~4 min), ~1/8 chance.
 * Returns true when FLAG_DIRTY was set.
 */
export function tryRareEvent(pet: PetState, ageTicks: number): boolean {
  if (!canStartToiletEvent(pet)) return false;
  if ((ageTicks & 31) !== 0) return false;
  if (nextCareRand(pet) % 8 !== 0) return false;
  pet.flags |= FLAG_DIRTY;
  pet.feedbackTicks = 10;
  queueSfx(Sfx.Fart);
  return true;
}
