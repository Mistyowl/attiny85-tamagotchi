import { IconId, BitmapId, POOP_X, POOP_Y } from "./icons";
import { SPRITE_DEAD, SPRITE_H, SPRITE_WING_L, SPRITE_WING_R } from "./sprites";
import {
  FLAG_DIRTY,
  FLAG_SICK,
  FLAG_SLEEPING,
  HOLD_RESTART_TICKS,
  MenuAction,
  PetState,
  SCREEN_H,
  SCREEN_W,
  Screen,
  Stage,
  STAGE_AGE,
  STAT_MAX,
  SLEEP_ENERGY_PER_TICK,
  SLEEP_WAKE_ENERGY,
  SLEEPY_ENERGY,
  VERY_SLEEPY_ENERGY,
  BLINK_CYCLE_TICKS,
  BLINK_OPEN_TICKS,
  Button,
  RenderCmd,
} from "./types";
import { centerTextX, textWidthPx } from "./font";
import {
  pickPlayMinigameKind,
  resolveAdultStage,
  shouldUseMinigame,
  tryPoopAfterFeed,
  tryRareEvent,
} from "./phase2";
import {
  buildMinigameRender,
  handleMinigameInput,
  initMinigame,
  tickMinigame,
} from "./minigame";
import { queueSfx, Sfx } from "./sound";
export { tickMinigame } from "./minigame";

const DEATH_X = 48;
const DEATH_START_Y = 8;
const DEATH_FLY_PX = 2;
const DEATH_ANIM_MAX = 28;
const DEATH_WING_FLAP = 2;
/** Push each wing outward so art sits beside the body, not over it. */
const DEATH_WING_SIDE = 10;

function deathSpriteY(pet: PetState): number {
  return DEATH_START_Y - pet.animFrame * DEATH_FLY_PX;
}

/** Body sprite on death: special soul face for baby, otherwise the stage that died. */
function deathBodyId(pet: PetState): number {
  if (pet.stage === Stage.Baby) return SPRITE_DEAD;
  return pet.stage;
}

/** Wing bitmap is top-aligned; baby soul body sits in the lower 16px. */
function deathWingsYOffset(pet: PetState): number {
  return pet.stage <= Stage.Baby ? 16 : 8;
}

/** Advance blink phase — call from UI clock (~ANIM_PERIOD_MS), not life WDT. */
export function tickAnim(pet: PetState): void {
  if (pet.screen === Screen.Minigame) return;
  if (pet.screen === Screen.Dead) {
    if (pet.animFrame < DEATH_ANIM_MAX) pet.animFrame++;
    if (pet.feedbackTicks > 0) pet.feedbackTicks--;
    return;
  }
  if (pet.screen === Screen.Sleeping || (pet.flags & FLAG_SLEEPING) !== 0) {
    if (pet.feedbackTicks > 0) pet.feedbackTicks--;
    return;
  }
  if (!pet.displayOn && pet.screen !== Screen.Boot) return;
  pet.animFrame = (pet.animFrame + 1) % BLINK_CYCLE_TICKS;
  if (pet.feedbackTicks > 0) pet.feedbackTicks--;
}

/** Sprite blink frame: 0 = eyes open, 1 = closed. */
export function petBlinkFrame(pet: PetState): number {
  return pet.animFrame >= BLINK_OPEN_TICKS ? 1 : 0;
}

function clampStat(v: number): number {
  if (v < 0) return 0;
  if (v > STAT_MAX) return STAT_MAX;
  return v | 0;
}

export function createNewPet(): PetState {
  return {
    stage: Stage.Egg,
    hunger: 20,
    happiness: 80,
    energy: 90,
    health: 100,
    flags: 0,
    ageTicks: 0,
    careScore: 50,
    screen: Screen.Boot,
    menuIndex: 0,
    animFrame: 0,
    bootTicks: 2,
    idleDisplayTicks: 0,
    displayOn: true,
    holdSelectTicks: 0,
    feedbackTicks: 0,
    minigameActive: false,
    minigameScore: 0,
    minigameKind: 0,
    minigamePhase: 0,
    minigameTimer: 0,
    minigamePos: 1,
    minigameTarget: 0,
    minigameRound: 0,
    minigameHits: 0,
    minigameMisses: 0,
    minigameFlash: 0,
    minigameSeed: 1,
    mgBallX: 64,
    mgBallY: 32,
    mgBallDx: 0,
    mgBallDy: 0,
    mgBricks: 0xff,
    btnHeld: 0,
  };
}

export function isAlive(pet: PetState): boolean {
  return pet.health > 0 && pet.screen !== Screen.Dead;
}

function menuActions(pet: PetState): MenuAction[] {
  const actions = [MenuAction.Feed, MenuAction.Play, MenuAction.Sleep];
  if (pet.flags & (FLAG_SICK | FLAG_DIRTY)) {
    actions.push(MenuAction.Medicine);
  }
  return actions;
}

function menuLabel(a: MenuAction): string {
  switch (a) {
    case MenuAction.Feed:
      return "ЕДА";
    case MenuAction.Play:
      return "ИГРА";
    case MenuAction.Sleep:
      return "СОН";
    case MenuAction.Medicine:
      return "ЛЕК";
  }
}

function wakeDisplay(pet: PetState): void {
  pet.displayOn = true;
  pet.idleDisplayTicks = 0;
}

/** Apply one life tick (≈ one WDT period on device). */
export function tickLife(pet: PetState): void {
  if (pet.screen === Screen.Boot) {
    if (pet.bootTicks > 0) {
      pet.bootTicks--;
    } else {
      pet.screen = Screen.Home;
    }
    return;
  }

  if (pet.screen === Screen.Dead) {
    return;
  }

  // Minigame uses frame clock via tickMinigame — pause life decay while playing
  if (pet.screen === Screen.Minigame) {
    return;
  }

  pet.ageTicks++;

  const sleeping = (pet.flags & FLAG_SLEEPING) !== 0 || pet.screen === Screen.Sleeping;

  if (sleeping) {
    pet.energy = clampStat(pet.energy + SLEEP_ENERGY_PER_TICK);
    pet.hunger = clampStat(pet.hunger + 1);
    if (pet.energy >= SLEEP_WAKE_ENERGY) {
      pet.flags &= ~FLAG_SLEEPING;
      pet.screen = Screen.Home;
      pet.feedbackTicks = 2;
    }
  } else {
    pet.hunger = clampStat(pet.hunger + 2);
    pet.happiness = clampStat(pet.happiness - 1);
    pet.energy = clampStat(pet.energy - 1);

    if (pet.hunger >= 85 || pet.happiness <= 15 || pet.energy <= 15) {
      pet.health = clampStat(pet.health - 2);
    }

    if (pet.hunger >= 90 && (pet.ageTicks & 7) === 0) {
      pet.flags |= FLAG_SICK;
    }
    if (pet.happiness <= 20 && (pet.ageTicks & 15) === 0) {
      pet.flags |= FLAG_DIRTY;
    }
    if (pet.flags & FLAG_SICK) {
      pet.health = clampStat(pet.health - 1);
    }

    tryRareEvent(pet, pet.ageTicks);
  }

  if (pet.stage === Stage.Egg && pet.ageTicks >= STAGE_AGE[Stage.Egg]) {
    pet.stage = Stage.Baby;
    pet.feedbackTicks = 4;
    queueSfx(Sfx.Hatch);
  } else if (pet.stage === Stage.Baby && pet.ageTicks >= STAGE_AGE[Stage.Baby]) {
    pet.stage = Stage.Child;
    pet.feedbackTicks = 4;
    queueSfx(Sfx.Evolve);
  } else if (pet.stage === Stage.Child && pet.ageTicks >= STAGE_AGE[Stage.Child]) {
    pet.stage = resolveAdultStage(pet.careScore);
    pet.feedbackTicks = 4;
    queueSfx(Sfx.Evolve);
  }

  if (pet.health <= 0) {
    pet.health = 0;
    if (pet.screen !== Screen.Dead) {
      queueSfx(Sfx.Die);
      pet.animFrame = 0;
    }
    pet.screen = Screen.Dead;
    pet.flags &= ~FLAG_SLEEPING;
    pet.displayOn = true;
  }

  if (pet.displayOn && pet.screen === Screen.Home) {
    pet.idleDisplayTicks++;
    // Occasional happy peep while awake
    if (
      pet.stage !== Stage.Egg &&
      pet.happiness >= 50 &&
      pet.health > 30 &&
      (pet.ageTicks % 28) === 0
    ) {
      queueSfx(Sfx.Chirp);
    } else if (
      pet.stage !== Stage.Egg &&
      (pet.hunger >= 85 || pet.happiness <= 20) &&
      (pet.ageTicks % 36) === 0
    ) {
      queueSfx(Sfx.Sad);
    }
  }
}

export function handleInput(pet: PetState, button: Button, pressed: boolean): void {
  const bit = 1 << button;
  if (pressed) pet.btnHeld |= bit;
  else pet.btnHeld &= ~bit;

  if (!pressed) {
    if (button === Button.Select) pet.holdSelectTicks = 0;
    return;
  }

  const wasOff = !pet.displayOn;
  wakeDisplay(pet);
  // First press after OLED auto-off only wakes — don't fire menu/game actions
  if (wasOff && pet.screen !== Screen.Boot) {
    return;
  }

  if (pet.screen === Screen.Boot) {
    pet.bootTicks = 0;
    pet.screen = Screen.Home;
    return;
  }

  if (pet.screen === Screen.Dead) {
    if (button === Button.Select) {
      pet.holdSelectTicks++;
      if (pet.holdSelectTicks >= HOLD_RESTART_TICKS) {
        Object.assign(pet, createNewPet());
      }
    }
    return;
  }

  if (pet.screen === Screen.Sleeping) {
    if (button === Button.Select) {
      pet.flags &= ~FLAG_SLEEPING;
      pet.screen = Screen.Home;
      pet.feedbackTicks = 2;
      queueSfx(Sfx.Wake);
    }
    return;
  }

  if (pet.screen === Screen.Minigame) {
    handleMinigameInput(pet, button);
    return;
  }

  const actions = menuActions(pet);
  if (pet.menuIndex >= actions.length) pet.menuIndex = 0;

  if (button === Button.Left) {
    pet.menuIndex = (pet.menuIndex + actions.length - 1) % actions.length;
    queueSfx(Sfx.Click);
    return;
  }
  if (button === Button.Right) {
    pet.menuIndex = (pet.menuIndex + 1) % actions.length;
    queueSfx(Sfx.Click);
    return;
  }
  if (button === Button.Select) {
    applyAction(pet, actions[pet.menuIndex]);
  }
}

function applyAction(pet: PetState, action: MenuAction): void {
  if (pet.stage === Stage.Egg) {
    pet.feedbackTicks = 2;
    queueSfx(Sfx.Click);
    return;
  }

  switch (action) {
    case MenuAction.Feed:
      pet.hunger = clampStat(pet.hunger - 25);
      pet.careScore += 1;
      pet.feedbackTicks = 3;
      queueSfx(Sfx.Feed);
      tryPoopAfterFeed(pet);
      break;
    case MenuAction.Play:
      if (shouldUseMinigame()) {
        initMinigame(pet, pickPlayMinigameKind(pet));
        queueSfx(Sfx.Play);
      } else {
        pet.happiness = clampStat(pet.happiness + 20);
        pet.energy = clampStat(pet.energy - 10);
        pet.careScore += 2;
        pet.feedbackTicks = 3;
        queueSfx(Sfx.Play);
      }
      break;
    case MenuAction.Sleep:
      pet.flags |= FLAG_SLEEPING;
      pet.screen = Screen.Sleeping;
      pet.feedbackTicks = 2;
      queueSfx(Sfx.Sleep);
      break;
    case MenuAction.Medicine:
      pet.flags &= ~(FLAG_SICK | FLAG_DIRTY);
      pet.health = clampStat(pet.health + 15);
      pet.careScore += 1;
      pet.feedbackTicks = 3;
      queueSfx(Sfx.Medicine);
      break;
  }
}

export function buildRenderList(pet: PetState): RenderCmd[] {
  const cmds: RenderCmd[] = [{ op: "clear" }];

  if (!pet.displayOn && pet.screen !== Screen.Dead && pet.screen !== Screen.Boot) {
    return cmds;
  }

  if (pet.screen === Screen.Boot) {
    return cmds;
  }

  if (pet.screen === Screen.Dead) {
    const y = deathSpriteY(pet);
    if (y + SPRITE_H > 0) {
      const baseWingsY = y + deathWingsYOffset(pet);
      const leftY = baseWingsY - (pet.animFrame & 1 ? DEATH_WING_FLAP : 0);
      const rightY = baseWingsY - (pet.animFrame & 1 ? 0 : DEATH_WING_FLAP);
      const bodyId = deathBodyId(pet);
      cmds.push({
        op: "sprite",
        id: SPRITE_WING_L,
        x: DEATH_X - DEATH_WING_SIDE,
        y: leftY,
        frame: 0,
      });
      cmds.push({
        op: "sprite",
        id: SPRITE_WING_R,
        x: DEATH_X + DEATH_WING_SIDE,
        y: rightY,
        frame: 0,
      });
      cmds.push({ op: "sprite", id: bodyId, x: DEATH_X, y, frame: 0 });
    }
    if (y + SPRITE_H <= 8) {
      cmds.push({ op: "text8", x: centerTextX("УВЫ"), y: 40, text: "УВЫ" });
      cmds.push({ op: "text8", x: centerTextX("ЖМИ"), y: 52, text: "ЖМИ" });
    }
    return cmds;
  }

  if (pet.screen === Screen.Sleeping) {
    // Frame 1 = closed eyes; no blink while asleep (see tickAnim).
    const sleepFrame = pet.stage === Stage.Egg ? 0 : 1;
    cmds.push({ op: "sprite", id: pet.stage, x: 48, y: 10, frame: sleepFrame });
    cmds.push({ op: "icon", id: IconId.Zzz, x: 71, y: 13 }); // у уха
    cmds.push({ op: "icon", id: IconId.Zzz, x: 82, y: 6 }); // дальняя
    cmds.push({ op: "text8", x: centerTextX("СОН"), y: 42, text: "СОН" });
    cmds.push({ op: "hbar", x: 8, y: 56, w: 112, fill: pet.energy, max: STAT_MAX });
    return cmds;
  }

  if (pet.screen === Screen.Minigame) {
    return buildMinigameRender(pet);
  }

  const spriteY = pet.feedbackTicks > 0 ? 6 : 8;
  cmds.push({
    op: "sprite",
    id: pet.stage,
    x: 48,
    y: spriteY,
    frame: petBlinkFrame(pet),
  });

  // Sleepy: first Z by right ear, then far Z when very tired
  if (pet.stage !== Stage.Egg && pet.energy <= SLEEPY_ENERGY) {
    cmds.push({ op: "icon", id: IconId.Zzz, x: 71, y: spriteY + 5 });
    if (pet.energy <= VERY_SLEEPY_ENERGY) {
      cmds.push({ op: "icon", id: IconId.Zzz, x: 82, y: spriteY });
    }
  }

  // Stats — user 8×8 icons
  cmds.push({ op: "icon", id: IconId.Hunger, x: 0, y: 0 });
  cmds.push({ op: "hbar", x: 10, y: 1, w: 24, fill: STAT_MAX - pet.hunger, max: STAT_MAX });
  cmds.push({ op: "icon", id: IconId.Happy, x: 0, y: 9 });
  cmds.push({ op: "hbar", x: 10, y: 10, w: 24, fill: pet.happiness, max: STAT_MAX });
  cmds.push({ op: "icon", id: IconId.Energy, x: 0, y: 18 });
  cmds.push({ op: "hbar", x: 10, y: 19, w: 24, fill: pet.energy, max: STAT_MAX });
  cmds.push({ op: "icon", id: IconId.Health, x: 0, y: 27 });
  cmds.push({ op: "hbar", x: 10, y: 28, w: 24, fill: pet.health, max: STAT_MAX });

  if (pet.flags & FLAG_SICK) {
    const t = "БОЛ";
    cmds.push({ op: "text8", x: SCREEN_W - textWidthPx(t), y: 0, text: t });
  }
  if (pet.flags & FLAG_DIRTY) {
    cmds.push({ op: "bitmap", id: BitmapId.Poop, x: POOP_X, y: POOP_Y });
    if (pet.feedbackTicks > 0) {
      cmds.push({ op: "text8", x: centerTextX("НАДУДОНИЛ"), y: 42, text: "НАДУДОНИЛ" });
    }
  }

  // Selected action — one label, centered on screen
  const actions = menuActions(pet);
  const label = menuLabel(actions[pet.menuIndex] ?? MenuAction.Feed);
  const lx = centerTextX(label);
  const ly = 52;
  cmds.push({ op: "text8", x: lx, y: ly, text: label });
  cmds.push({
    op: "invertRegion",
    x: Math.max(0, lx - 2),
    y: ly - 2,
    w: textWidthPx(label) + 4,
    h: 11,
  });

  void SCREEN_H;
  return cmds;
}

export function noteDisplayWallClockIdle(pet: PetState, idleMs: number, offAfterMs: number): void {
  if (pet.screen === Screen.Dead || pet.screen === Screen.Boot || pet.screen === Screen.Minigame) {
    return;
  }
  if (idleMs >= offAfterMs) {
    pet.displayOn = false;
  }
}
