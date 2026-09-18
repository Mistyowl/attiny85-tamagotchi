/** Portable game types — keep C-friendly (uint8 / uint32 semantics). */

export const SCREEN_W = 128;
export const SCREEN_H = 64;

export const STAT_MAX = 100;

export enum Stage {
  Egg = 0,
  Baby = 1,
  Child = 2,
  Adult = 3,
  AdultA = 4, // phase-2
  AdultB = 5, // phase-2
}

export enum Screen {
  Boot = 0,
  Home = 1,
  Sleeping = 2,
  Dead = 3,
  Minigame = 4, // phase-2 stub
}

export enum MenuAction {
  Feed = 0,
  Play = 1,
  Sleep = 2,
  Medicine = 3,
}

export enum Button {
  Left = 0,
  Select = 1,
  Right = 2,
}

export const FLAG_SICK = 1 << 0;
export const FLAG_DIRTY = 1 << 1;
export const FLAG_SLEEPING = 1 << 2;

export interface PetState {
  stage: Stage;
  hunger: number;
  happiness: number;
  energy: number;
  health: number;
  flags: number;
  ageTicks: number;
  careScore: number;
  screen: Screen;
  menuIndex: number;
  animFrame: number;
  bootTicks: number;
  idleDisplayTicks: number;
  displayOn: boolean;
  holdSelectTicks: number;
  /** Visual flash counter after an action. */
  feedbackTicks: number;
  /** Minigame runtime (Play). */
  minigameActive: boolean;
  minigameScore: number;
  minigameKind: number;
  minigamePhase: number;
  minigameTimer: number;
  minigamePos: number;
  minigameTarget: number;
  minigameRound: number;
  minigameHits: number;
  minigameMisses: number;
  minigameFlash: number;
  /** LCG seed for lane/wait RNG (advances each roll). */
  minigameSeed: number;
  /** Shared physics / extras for ball games & runner. */
  mgBallX: number;
  mgBallY: number;
  mgBallDx: number;
  mgBallDy: number;
  /** Arkanoid: 8 bricks as bits in one byte. */
  mgBricks: number;
  /** Live button mask (1<<Button), not saved — for held paddle steer. */
  btnHeld: number;
}

/** Render command list — HAL draws these (Canvas or Tiny4kOLED). */
export type RenderCmd =
  | { op: "clear" }
  | { op: "fill"; x: number; y: number; w: number; h: number; color: 0 | 1 }
  | { op: "sprite"; id: number; x: number; y: number; frame: number }
  | { op: "icon"; id: number; x: number; y: number }
  /** Arbitrary mono bitmap (MSB-left, row stride = ceil(w/8)). */
  | { op: "bitmap"; id: number; x: number; y: number }
  | { op: "hbar"; x: number; y: number; w: number; fill: number; max: number }
  | { op: "text8"; x: number; y: number; text: string }
  | { op: "invertRegion"; x: number; y: number; w: number; h: number };

export const WDT_SECONDS = 8;

/** Pet blink / idle while OLED is on (independent of life WDT). */
export const ANIM_PERIOD_MS = 500;
/** Open-eye ticks before a blink (period × this ≈ time between blinks). */
export const BLINK_OPEN_TICKS = 8;
/** Closed-eye ticks per blink (keep short). */
export const BLINK_CLOSED_TICKS = 1;
export const BLINK_CYCLE_TICKS = BLINK_OPEN_TICKS + BLINK_CLOSED_TICKS;

/** Sleep: +12 energy / WDT tick, wake at ≥85 → typically 1–6 ticks (≈8–48s real). */
export const SLEEP_ENERGY_PER_TICK = 12;
export const SLEEP_WAKE_ENERGY = 85;
/** Home: show one Z when energy ≤ this (a bit sleepy). */
export const SLEEPY_ENERGY = 30;
/** Home: show two Z when energy ≤ this (very sleepy). */
export const VERY_SLEEPY_ENERGY = 15;

/** Life balance: ticks until stage advance (WDT ~8s → hours of real time). */
export const STAGE_AGE = {
  [Stage.Egg]: 30, // ~4 min real → hatch (emulator time-scale adjustable)
  [Stage.Baby]: 180,
  [Stage.Child]: 360,
  [Stage.Adult]: 0,
  [Stage.AdultA]: 0,
  [Stage.AdultB]: 0,
} as const;

export const DISPLAY_IDLE_OFF_TICKS = 2; // ~16s of WDT while UI open; wall clock handled in HAL
export const HOLD_RESTART_TICKS = 3;
