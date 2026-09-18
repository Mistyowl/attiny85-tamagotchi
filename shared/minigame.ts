/** Lab minigames: Pong, Arkanoid, Runner only. */

import { Button, PetState, RenderCmd, SCREEN_H, SCREEN_W, Screen, STAT_MAX } from "./types";
import { centerTextX } from "./font";
import { queueSfx, Sfx } from "./sound";
export enum MinigameKind {
  Pong = 0,
  Arkanoid = 1,
  Runner = 2,
}

export const MINIGAME_COUNT = 3;
export const MINIGAME_NAMES = ["Pong", "Arkanoid", "Runner"] as const;
export const MINIGAME_TITLES = ["ПОНГ", "БЛОК", "ПРЫГ"] as const;

/** Clamp any kind to the live suite (guards stale lab/HMR / bad saves). */
export function clampMinigameKind(kind: number): MinigameKind {
  const k = kind | 0;
  if (k >= MinigameKind.Pong && k < MINIGAME_COUNT) return k as MinigameKind;
  return MinigameKind.Pong;
}

const PADDLE_W = 24;
const BALL = 3;
const TOP = 12;
const PADDLE_Y = 56;
const AI_PADDLE_Y = 12;
/** px per 16ms while held — faster than ball (~66 px/s) so you can catch up. */
const PADDLE_SPEED = 3.5;
/** AI paddle — a bit slower than the player. */
const AI_SPEED = 2.4;

const BRICK_COLS = 8;
const BRICK_Y = 14;
const BRICK_H = 6;

/**
 * Handcrafted Arkanoid layouts.
 * top = 2-hit row (minigameRound), bottom = 1-hit (mgBricks). Bits 0..7 left→right.
 */
const ARKANOID_LAYOUTS: readonly { top: number; bottom: number }[] = [
  { top: 0xff, bottom: 0xff }, // full wall
  { top: 0x7e, bottom: 0x81 }, // soft center, hard edges
  { top: 0x99, bottom: 0x66 }, // checker
  { top: 0xe7, bottom: 0x3c }, // smile / U
  { top: 0x18, bottom: 0xff }, // tough core + soft floor
  { top: 0xff, bottom: 0xa5 }, // full top, gaps below
  { top: 0x5a, bottom: 0xa5 }, // zebra
  { top: 0xc3, bottom: 0x3c }, // corners vs middle
];

function pickArkanoidLayout(pet: PetState): { top: number; bottom: number } {
  return ARKANOID_LAYOUTS[randInt(pet, ARKANOID_LAYOUTS.length)]!;
}

const PHASE_READY = 0;
const PHASE_PLAY = 1;
const PHASE_PAUSE = 2;

/** Falling pixels after brick hits (runtime only, not saved). */
type BrickDebris = { x: number; y: number; vx: number; vy: number; life: number };
const MAX_DEBRIS = 12;
const brickDebris: BrickDebris[] = [];

function clearBrickDebris(): void {
  brickDebris.length = 0;
}

export function clampStat(v: number): number {
  if (v < 0) return 0;
  if (v > STAT_MAX) return STAT_MAX;
  return v | 0;
}

function nextRand(pet: PetState): number {
  let s = pet.minigameSeed >>> 0;
  if (s === 0) s = 1;
  s = (Math.imul(s, 1103515245) + 12345) >>> 0;
  pet.minigameSeed = s;
  return s;
}

function randInt(pet: PetState, max: number): number {
  if (max <= 1) return 0;
  return nextRand(pet) % max;
}

function seedRng(pet: PetState): void {
  pet.minigameSeed =
    ((pet.minigameSeed || 1) ^
      (pet.ageTicks * 2654435761) ^
      (pet.careScore << 7) ^
      (pet.energy << 3) ^
      ((typeof Date !== "undefined" ? Date.now() : 0) & 0xffff) ^
      0x9e3779b9) >>>
    0;
  if (!pet.minigameSeed) pet.minigameSeed = 1;
}

export function initMinigame(pet: PetState, kind: MinigameKind): void {
  kind = clampMinigameKind(kind);
  pet.screen = Screen.Minigame;
  pet.minigameActive = true;
  pet.minigameKind = kind;
  pet.minigameScore = 0;
  pet.minigameRound = 0;
  pet.minigameHits = 0;
  pet.minigameMisses = 0;
  pet.minigameFlash = 0;
  pet.minigameTimer = 0;
  pet.displayOn = true;
  seedRng(pet);

  pet.minigamePos = Math.floor((SCREEN_W - PADDLE_W) / 2);
  pet.mgBallX = SCREEN_W / 2;
  pet.mgBallY = 40;
  pet.mgBallDx = 0;
  pet.mgBallDy = 0;
  pet.mgBricks = 0xff;
  pet.minigamePhase = PHASE_READY;
  pet.minigameTarget = 0;
  clearBrickDebris();

  if (kind === MinigameKind.Runner) {
    pet.minigamePos = 20;
    pet.mgBallX = 110;
    pet.mgBallY = 0;
    pet.mgBallDy = 0;
    pet.minigameTarget = 0;
    pet.minigamePhase = PHASE_PLAY;
  } else if (kind === MinigameKind.Pong) {
    pet.minigameTarget = Math.floor((SCREEN_W - PADDLE_W) / 2);
    servePong(pet);
  } else {
    // Arkanoid: random handcrafted layout
    const layout = pickArkanoidLayout(pet);
    pet.minigameRound = layout.top & 0xff;
    pet.minigameTimer = 0;
    pet.mgBricks = layout.bottom & 0xff;
    pet.mgBallX = pet.minigamePos + PADDLE_W / 2;
    pet.mgBallY = PADDLE_Y - 8;
    pet.mgBallDx = (randInt(pet, 2) ? 1 : -1) * (0.75 + randInt(pet, 3) * 0.25);
    pet.mgBallDy = -1;
    pet.minigamePhase = PHASE_PLAY;
  }
}

function resetBallOnPaddle(pet: PetState): void {
  pet.mgBallX = pet.minigamePos + PADDLE_W / 2;
  pet.mgBallY = PADDLE_Y - 6;
  pet.mgBallDx = 0;
  pet.mgBallDy = 0;
  pet.minigamePhase = PHASE_READY;
}

function servePong(pet: PetState): void {
  pet.mgBallX = pet.minigamePos + PADDLE_W / 2;
  pet.mgBallY = PADDLE_Y - 8;
  pet.mgBallDx = (randInt(pet, 2) ? 1 : -1) * (0.75 + randInt(pet, 3) * 0.25);
  pet.mgBallDy = -1;
  pet.minigamePhase = PHASE_PLAY;
}

function finishMinigame(pet: PetState): void {
  clearBrickDebris();
  const hits = pet.minigameHits;
  let happy = 6 + Math.min(20, hits * 2);
  if (pet.minigameKind === MinigameKind.Pong) {
    happy = 4 + Math.floor(hits / 5);
  }
  pet.happiness = clampStat(pet.happiness + happy);
  pet.energy = clampStat(pet.energy - 6 - pet.minigameMisses * 2);
  pet.careScore += 1 + Math.floor(hits / 2);
  pet.minigameActive = false;
  pet.minigameScore = hits;
  pet.screen = Screen.Home;
  pet.feedbackTicks = 4;
  pet.minigamePhase = 0;
  queueSfx(Sfx.Play);
}

function steerPaddle(pet: PetState, dt: number): void {
  let dir = 0;
  if (pet.btnHeld & (1 << Button.Left)) dir -= 1;
  if (pet.btnHeld & (1 << Button.Right)) dir += 1;
  if (!dir) return;
  const next = pet.minigamePos + dir * PADDLE_SPEED * (dt / 16);
  pet.minigamePos = Math.max(2, Math.min(SCREEN_W - PADDLE_W - 2, next));
  if (pet.minigamePhase === PHASE_READY) {
    pet.mgBallX = pet.minigamePos + PADDLE_W / 2;
  }
}

export function tickMinigame(pet: PetState, dtMs: number): void {
  if (!pet.minigameActive || pet.screen !== Screen.Minigame) return;
  if (pet.minigameFlash > 0) pet.minigameFlash--;
  const dt = Math.min(40, Math.max(0, dtMs));

  if (pet.minigameKind === MinigameKind.Pong || pet.minigameKind === MinigameKind.Arkanoid) {
    steerPaddle(pet, dt);
  }

  switch (pet.minigameKind) {
    case MinigameKind.Pong:
      tickPong(pet, dt);
      break;
    case MinigameKind.Arkanoid:
      tickArkanoid(pet, dt);
      break;
    case MinigameKind.Runner:
      tickRunner(pet, dt);
      break;
  }
}

function moveBall(pet: PetState, dt: number, speed: number): void {
  pet.mgBallX += pet.mgBallDx * speed * (dt / 16);
  pet.mgBallY += pet.mgBallDy * speed * (dt / 16);
}

function bounceSideWalls(pet: PetState): void {
  if (pet.mgBallX <= 2) {
    pet.mgBallX = 2;
    pet.mgBallDx = Math.abs(pet.mgBallDx) || 1;
  }
  if (pet.mgBallX >= SCREEN_W - BALL - 2) {
    pet.mgBallX = SCREEN_W - BALL - 2;
    pet.mgBallDx = -Math.abs(pet.mgBallDx) || -1;
  }
}

function bounceWalls(pet: PetState): void {
  bounceSideWalls(pet);
  if (pet.mgBallY <= TOP) {
    pet.mgBallY = TOP;
    pet.mgBallDy = Math.abs(pet.mgBallDy) || 1;
  }
}

function paddleHit(pet: PetState): boolean {
  const px = pet.minigamePos;
  return (
    pet.mgBallY + BALL >= PADDLE_Y &&
    pet.mgBallY <= PADDLE_Y + 4 &&
    pet.mgBallX + BALL >= px &&
    pet.mgBallX <= px + PADDLE_W
  );
}

function aiPaddleHit(pet: PetState): boolean {
  const ax = pet.minigameTarget;
  return (
    pet.mgBallY <= AI_PADDLE_Y + 4 &&
    pet.mgBallY + BALL >= AI_PADDLE_Y &&
    pet.mgBallX + BALL >= ax &&
    pet.mgBallX <= ax + PADDLE_W
  );
}

function steerAi(pet: PetState, dt: number): void {
  const center = pet.minigameTarget + PADDLE_W / 2;
  const ball = pet.mgBallX + BALL / 2;
  let dir = 0;
  if (ball < center - 1) dir = -1;
  else if (ball > center + 1) dir = 1;
  if (!dir) return;
  const next = pet.minigameTarget + dir * AI_SPEED * (dt / 16);
  pet.minigameTarget = Math.max(2, Math.min(SCREEN_W - PADDLE_W - 2, next));
}

function bounceFromPaddle(pet: PetState, paddleX: number, goUp: boolean): void {
  const rel = (pet.mgBallX + BALL / 2 - paddleX) / PADDLE_W;
  let dx = (rel - 0.5) * 2.6;
  if (Math.abs(dx) < 0.4) dx = dx <= 0 ? -0.4 : 0.4;
  pet.mgBallDx = dx;
  const mag = Math.abs(pet.mgBallDy) || 1;
  pet.mgBallDy = goUp ? -mag : mag;
}

function tickPong(pet: PetState, dt: number): void {
  if (pet.minigamePhase !== PHASE_PLAY) return;
  steerAi(pet, dt);
  moveBall(pet, dt, 1.35);
  bounceSideWalls(pet);

  if (aiPaddleHit(pet) && pet.mgBallDy < 0) {
    pet.mgBallY = AI_PADDLE_Y + 4;
    bounceFromPaddle(pet, pet.minigameTarget, false);
  }

  if (paddleHit(pet) && pet.mgBallDy > 0) {
    pet.mgBallY = PADDLE_Y - BALL - 1;
    bounceFromPaddle(pet, pet.minigamePos, true);
    pet.minigameHits++;
    pet.minigameScore = pet.minigameHits;
    pet.minigameFlash = 3;
    queueSfx(Sfx.Hit);
    if (pet.minigameHits >= 20) finishMinigame(pet);
  }

  // Past AI → player point, re-serve
  if (pet.mgBallY < 4) {
    pet.minigameHits++;
    pet.minigameScore = pet.minigameHits;
    pet.minigameFlash = 4;
    if (pet.minigameHits >= 20) finishMinigame(pet);
    else servePong(pet);
  }

  if (pet.mgBallY > SCREEN_H) {
    pet.minigameMisses++;
    if (pet.minigameMisses >= 3) finishMinigame(pet);
    else servePong(pet);
  }
}

/** row 0 = top (tough), row 1 = bottom. */
function brickRect(col: number, row: number): { x: number; y: number; w: number; h: number } {
  return { x: col * 16, y: BRICK_Y + row * (BRICK_H + 2), w: 15, h: BRICK_H };
}

function ballHitsRect(
  pet: PetState,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    pet.mgBallX + BALL > r.x &&
    pet.mgBallX < r.x + r.w &&
    pet.mgBallY + BALL > r.y &&
    pet.mgBallY < r.y + r.h
  );
}

function bounceOffRect(pet: PetState, r: { x: number; y: number; w: number; h: number }): void {
  const overlapL = pet.mgBallX + BALL - r.x;
  const overlapR = r.x + r.w - pet.mgBallX;
  const overlapT = pet.mgBallY + BALL - r.y;
  const overlapB = r.y + r.h - pet.mgBallY;
  const minX = Math.min(overlapL, overlapR);
  const minY = Math.min(overlapT, overlapB);
  if (minX < minY) {
    pet.mgBallDx = -pet.mgBallDx || (overlapL < overlapR ? -1 : 1);
    pet.mgBallX = overlapL < overlapR ? r.x - BALL : r.x + r.w;
  } else {
    pet.mgBallDy = -pet.mgBallDy || 1;
    pet.mgBallY = overlapT < overlapB ? r.y - BALL : r.y + r.h;
  }
}

function arkanoidCleared(pet: PetState): boolean {
  return pet.mgBricks === 0 && (pet.minigameRound & 0xff) === 0;
}

function spawnBrickDebris(pet: PetState, r: { x: number; y: number; w: number; h: number }): void {
  const cx = r.x + (r.w >> 1);
  const cy = r.y + (r.h >> 1);
  for (let n = 0; n < 4 && brickDebris.length < MAX_DEBRIS; n++) {
    brickDebris.push({
      x: cx - 2 + randInt(pet, 5),
      y: cy - 1 + randInt(pet, 3),
      vx: (randInt(pet, 5) - 2) * 0.45,
      vy: 0.2 + randInt(pet, 4) * 0.2,
      life: 16 + randInt(pet, 10),
    });
  }
}

function tickBrickDebris(dt: number): void {
  const step = dt / 16;
  for (let i = brickDebris.length - 1; i >= 0; i--) {
    const p = brickDebris[i]!;
    p.x += p.vx * step;
    p.y += p.vy * step;
    p.vy += 0.15 * step;
    p.life -= step;
    if (p.life <= 0 || p.y > SCREEN_H) brickDebris.splice(i, 1);
  }
}

function drawBrickDebris(cmds: RenderCmd[]): void {
  for (const p of brickDebris) {
    cmds.push({
      op: "fill",
      x: Math.floor(p.x),
      y: Math.floor(p.y),
      w: 2,
      h: 2,
      color: 1,
    });
  }
}

/** Top row (minigameRound): 2 hits. Bottom (mgBricks): 1 hit. Cracks in minigameTimer. */
function collideArkanoidBricks(pet: PetState): void {
  if (arkanoidCleared(pet)) return;

  // Bottom row first (closer to ball path)
  for (let i = 0; i < BRICK_COLS; i++) {
    const bit = 1 << i;
    if (!(pet.mgBricks & bit)) continue;
    const r = brickRect(i, 1);
    if (!ballHitsRect(pet, r)) continue;
    pet.mgBricks &= ~bit;
    pet.minigameHits++;
    pet.minigameScore = pet.minigameHits;
    pet.minigameFlash = 4;
    queueSfx(Sfx.Hit);
    spawnBrickDebris(pet, r);
    bounceOffRect(pet, r);
    if (arkanoidCleared(pet)) finishMinigame(pet);
    return;
  }

  for (let i = 0; i < BRICK_COLS; i++) {
    const bit = 1 << i;
    if (!(pet.minigameRound & bit)) continue;
    const r = brickRect(i, 0);
    if (!ballHitsRect(pet, r)) continue;

    if (!(pet.minigameTimer & bit)) {
      // First hit — crack
      pet.minigameTimer |= bit;
      pet.minigameFlash = 3;
      spawnBrickDebris(pet, { x: r.x + 4, y: r.y + 2, w: 4, h: 2 });
    } else {
      pet.minigameRound &= ~bit;
      pet.minigameTimer &= ~bit;
      pet.minigameHits++;
      pet.minigameScore = pet.minigameHits;
      pet.minigameFlash = 4;
      spawnBrickDebris(pet, r);
    }
    bounceOffRect(pet, r);
    if (arkanoidCleared(pet)) finishMinigame(pet);
    return;
  }
}

function tickArkanoid(pet: PetState, dt: number): void {
  if (pet.minigamePhase !== PHASE_PLAY) return;
  moveBall(pet, dt, 1.15);
  bounceWalls(pet);
  collideArkanoidBricks(pet);
  tickBrickDebris(dt);
  if (pet.screen !== Screen.Minigame) return;

  if (paddleHit(pet) && pet.mgBallDy > 0) {
    pet.mgBallY = PADDLE_Y - BALL - 1;
    bounceFromPaddle(pet, pet.minigamePos, true);
  }
  if (pet.mgBallY > SCREEN_H) {
    pet.minigameMisses++;
    if (pet.minigameMisses >= 3) finishMinigame(pet);
    else {
      pet.mgBallX = pet.minigamePos + PADDLE_W / 2;
      pet.mgBallY = PADDLE_Y - 8;
      pet.mgBallDx = (randInt(pet, 2) ? 1 : -1) * (0.75 + randInt(pet, 3) * 0.25);
      pet.mgBallDy = -1;
      pet.minigamePhase = PHASE_PLAY;
    }
  }
}

function runnerSpeed(pet: PetState): number {
  return Math.min(80, 42 + pet.minigameHits * 3);
}

function runnerObstacleH(pet: PetState): number {
  return Math.min(16, 9 + Math.floor(pet.minigameHits / 3));
}

/** Air height needed to clear the tree (matches drawn obstacle). */
function runnerClearY(pet: PetState): number {
  return Math.max(5, runnerObstacleH(pet) - 5);
}

function spawnRunnerObstacle(pet: PetState): void {
  const gap = Math.max(24, 44 - pet.minigameHits * 2);
  pet.mgBallX = 105 + randInt(pet, gap);
}

function runnerOverlap(pet: PetState): boolean {
  const px = 18;
  const pw = 12;
  const ox = pet.mgBallX;
  const ow = 6;
  return ox < px + pw && ox + ow > px;
}

function tickRunner(pet: PetState, dt: number): void {
  pet.minigameTimer += dt;
  pet.mgBallX -= (dt / 1000) * runnerSpeed(pet);

  // minigameTarget = remaining float/hover frames at apex
  if (pet.minigameTarget > 0) {
    pet.minigameTarget -= dt / 16;
    if (pet.minigameTarget < 0) pet.minigameTarget = 0;
    pet.mgBallDy = 0;
  } else if (pet.mgBallDy !== 0 || pet.mgBallY > 0) {
    const prevDy = pet.mgBallDy;
    pet.mgBallY += pet.mgBallDy * (dt / 16);
    const g = prevDy > 0 ? 0.2 : 0.14;
    pet.mgBallDy -= g * (dt / 16);
    // Apex → hover (also when ceiling clamps the rise)
    if (prevDy > 0 && pet.mgBallDy <= 0 && pet.mgBallY >= 8) {
      pet.mgBallDy = 0;
      pet.minigameTarget = 20;
    }
    if (pet.mgBallY > 26) {
      pet.mgBallY = 26;
      pet.mgBallDy = 0;
      if (pet.minigameTarget <= 0) pet.minigameTarget = 20;
    }
    if (pet.mgBallY <= 0) {
      pet.mgBallY = 0;
      pet.mgBallDy = 0;
      pet.minigameTarget = 0;
    }
  }

  if (pet.minigameFlash === 0 && runnerOverlap(pet) && pet.mgBallY < runnerClearY(pet)) {
    pet.minigameMisses++;
    pet.minigameFlash = 14;
    spawnRunnerObstacle(pet);
    pet.minigameRound++;
    if (pet.minigameMisses >= 3) finishMinigame(pet);
    return;
  }

  if (pet.mgBallX < -10) {
    pet.minigameHits++;
    pet.minigameScore = pet.minigameHits;
    spawnRunnerObstacle(pet);
    pet.minigameRound++;
    pet.minigameFlash = 3;
    queueSfx(Sfx.Hit);
    if (pet.minigameHits >= 12) finishMinigame(pet);
  }
}

export function handleMinigameInput(pet: PetState, button: Button): void {
  const kind = pet.minigameKind;

  if (kind === MinigameKind.Runner) {
    // Any button jumps (Enter often focuses lab controls and never reaches here)
    if (pet.mgBallY <= 0 && pet.minigameTarget <= 0) {
      pet.mgBallDy = 4.4;
      pet.minigameTarget = 0;
    }
    return;
  }

  if (button === Button.Select) {
    if (kind === MinigameKind.Arkanoid && pet.minigamePhase !== PHASE_READY) {
      pet.minigamePhase = pet.minigamePhase === PHASE_PLAY ? PHASE_PAUSE : PHASE_PLAY;
    }
  }
}

export function buildMinigameRender(pet: PetState): RenderCmd[] {
  const cmds: RenderCmd[] = [{ op: "clear" }];
  const title = MINIGAME_TITLES[pet.minigameKind] ?? "ИГРА";
  cmds.push({ op: "text8", x: centerTextX(title), y: 1, text: title });
  cmds.push({ op: "text8", x: 110, y: 1, text: `${pet.minigameHits}` });

  const kind = pet.minigameKind;

  if (kind === MinigameKind.Runner) {
    cmds.push({ op: "fill", x: 0, y: 50, w: SCREEN_W, h: 2, color: 1 });
    for (let x = 0; x < SCREEN_W; x += 16) {
      cmds.push({
        op: "fill",
        x: (x + (Math.floor(pet.mgBallX * 2) % 16) + 16) % SCREEN_W,
        y: 52,
        w: 8,
        h: 1,
        color: 1,
      });
    }
    const py = 42 - Math.floor(pet.mgBallY);
    cmds.push({ op: "fill", x: 18, y: py, w: 12, h: 10, color: 1 });
    const ox = Math.floor(pet.mgBallX);
    const oh = runnerObstacleH(pet);
    cmds.push({ op: "fill", x: ox, y: 52 - oh, w: 6, h: oh, color: 1 });
    cmds.push({ op: "fill", x: ox - 3, y: 52 - Math.floor(oh * 0.35), w: 4, h: 3, color: 1 });
  } else {
    if (kind === MinigameKind.Arkanoid) {
      for (let i = 0; i < BRICK_COLS; i++) {
        const bit = 1 << i;
        if (pet.minigameRound & bit) {
          const r = brickRect(i, 0);
          cmds.push({ op: "fill", x: r.x, y: r.y, w: r.w, h: r.h, color: 1 });
          if (pet.minigameTimer & bit) {
            // Cracked — cut a gap so it looks damaged
            cmds.push({ op: "fill", x: r.x + 3, y: r.y + 2, w: 9, h: 2, color: 0 });
          }
        }
        if (pet.mgBricks & bit) {
          const r = brickRect(i, 1);
          cmds.push({ op: "fill", x: r.x, y: r.y, w: r.w, h: r.h, color: 1 });
        }
      }
      drawBrickDebris(cmds);
    } else {
      cmds.push({
        op: "fill",
        x: Math.floor(pet.minigameTarget),
        y: AI_PADDLE_Y,
        w: PADDLE_W,
        h: 4,
        color: 1,
      });
    }
    cmds.push({
      op: "fill",
      x: Math.floor(pet.minigamePos),
      y: PADDLE_Y,
      w: PADDLE_W,
      h: 4,
      color: 1,
    });
    cmds.push({
      op: "fill",
      x: Math.floor(pet.mgBallX),
      y: Math.floor(pet.mgBallY),
      w: BALL,
      h: BALL,
      color: 1,
    });
    if (pet.minigamePhase === PHASE_PAUSE) {
      cmds.push({ op: "text8", x: centerTextX("ЖДИ"), y: 28, text: "ЖДИ" });
    }
  }

  if (pet.minigameFlash > 0 && (pet.minigameFlash & 1) === 0) {
    cmds.push({ op: "invertRegion", x: 0, y: 0, w: SCREEN_W, h: 10 });
  }

  void SCREEN_H;
  return cmds;
}
