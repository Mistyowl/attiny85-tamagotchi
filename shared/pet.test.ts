import { describe, expect, it } from "vitest";
import { createNewPet, handleInput, tickLife, tickAnim, isAlive, buildRenderList } from "./pet";
import {
  Button,
  Screen,
  Stage,
  FLAG_SICK,
  FLAG_DIRTY,
  FLAG_SLEEPING,
  STAGE_AGE,
  MenuAction,
} from "./types";
import {
  SPRITE_BABY_BACK,
  SPRITE_CHILD_BACK,
  SPRITE_DEAD,
  SPRITE_WING_L,
  SPRITE_WING_R,
} from "./sprites";
import { deserialize, serialize, SAVE_SIZE } from "./save";
import { resolveAdultStage, tryRareEvent } from "./phase2";
import { BitmapId } from "./icons";

describe("pet life", () => {
  it("boots then goes home", () => {
    const pet = createNewPet();
    expect(pet.screen).toBe(Screen.Boot);
    tickLife(pet);
    tickLife(pet);
    tickLife(pet);
    expect(pet.screen).toBe(Screen.Home);
  });

  it("hatches from egg with age", () => {
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.bootTicks = 0;
    for (let i = 0; i < STAGE_AGE[Stage.Egg]; i++) tickLife(pet);
    expect(pet.stage).toBe(Stage.Baby);
  });

  it("evolves Baby → Child and Child → Adult at stage ages", () => {
    const baby = createNewPet();
    baby.screen = Screen.Home;
    baby.bootTicks = 0;
    baby.stage = Stage.Baby;
    baby.ageTicks = STAGE_AGE[Stage.Baby] - 1;
    tickLife(baby);
    expect(baby.stage).toBe(Stage.Child);

    const child = createNewPet();
    child.screen = Screen.Home;
    child.bootTicks = 0;
    child.stage = Stage.Child;
    child.careScore = 50;
    child.ageTicks = STAGE_AGE[Stage.Child] - 1;
    tickLife(child);
    expect(child.stage).toBe(Stage.Adult);
  });

  it("dies when health hits zero", () => {
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.bootTicks = 0;
    pet.stage = Stage.Baby;
    pet.health = 1;
    pet.hunger = 99;
    pet.happiness = 5;
    pet.energy = 5;
    for (let i = 0; i < 20; i++) tickLife(pet);
    expect(pet.screen).toBe(Screen.Dead);
    expect(isAlive(pet)).toBe(false);
  });

  it("survives overnight sleep without health loss", () => {
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.bootTicks = 0;
    pet.stage = Stage.Baby;
    pet.hunger = 20;
    pet.happiness = 80;
    pet.energy = 90;
    pet.health = 100;
    pet.menuIndex = MenuAction.Sleep;
    handleInput(pet, Button.Select, true);
    expect(pet.screen).toBe(Screen.Sleeping);
    expect(pet.energy).toBe(30);

    const healthBefore = pet.health;
    for (let i = 0; i < 3600; i++) tickLife(pet);

    expect(isAlive(pet)).toBe(true);
    expect(pet.health).toBe(healthBefore);
    expect(pet.flags & FLAG_SLEEPING).toBe(0);
    expect(pet.screen).toBe(Screen.Home);
    // Auto-woke during the night; a few awake ticks may dip energy slightly after.
    expect(pet.energy).toBeGreaterThanOrEqual(80);
  });

  it("dies from awake neglect over ~one night", () => {
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.bootTicks = 0;
    pet.stage = Stage.Baby;
    pet.hunger = 20;
    pet.happiness = 80;
    pet.energy = 90;
    pet.health = 100;
    for (let i = 0; i < 4000; i++) tickLife(pet);
    expect(pet.screen).toBe(Screen.Dead);
    expect(isAlive(pet)).toBe(false);
  });

  it("feed lowers hunger", () => {
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.bootTicks = 0;
    pet.stage = Stage.Baby;
    pet.hunger = 60;
    pet.menuIndex = 0; // Feed
    handleInput(pet, Button.Select, true);
    expect(pet.hunger).toBeLessThan(60);
  });

  it("medicine clears sick", () => {
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.bootTicks = 0;
    pet.stage = Stage.Child;
    pet.flags |= FLAG_SICK;
    // Feed, Play, Sleep, Medicine → index 3
    pet.menuIndex = 3;
    handleInput(pet, Button.Select, true);
    expect(pet.flags & FLAG_SICK).toBe(0);
  });

  it("feed can trigger toilet event", () => {
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.bootTicks = 0;
    pet.stage = Stage.Baby;
    pet.hunger = 60;
    pet.menuIndex = 0;
    // Force LCG so nextCareRand(pet) % 4 === 0
    pet.minigameSeed = 3;
    handleInput(pet, Button.Select, true);
    expect(pet.flags & FLAG_DIRTY).toBe(FLAG_DIRTY);
  });

  it("medicine clears dirty (Надудонил)", () => {
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.bootTicks = 0;
    pet.stage = Stage.Child;
    pet.flags |= FLAG_DIRTY;
    pet.menuIndex = 3;
    handleInput(pet, Button.Select, true);
    expect(pet.flags & FLAG_DIRTY).toBe(0);
  });

  it("home render shows poop bitmap when dirty", () => {
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.stage = Stage.Baby;
    pet.flags |= FLAG_DIRTY;
    const cmds = buildRenderList(pet);
    expect(cmds.some((c) => c.op === "bitmap" && c.id === BitmapId.Poop)).toBe(true);
  });

  it("poop feedback shows back sprite then front again", () => {
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.stage = Stage.Child;
    pet.flags |= FLAG_DIRTY;
    pet.feedbackTicks = 10;
    const during = buildRenderList(pet);
    expect(during.some((c) => c.op === "sprite" && c.id === SPRITE_CHILD_BACK)).toBe(true);
    expect(during.some((c) => c.op === "text8" && c.text === "НАДУДОНИЛ")).toBe(true);

    pet.feedbackTicks = 0;
    const after = buildRenderList(pet);
    expect(after.some((c) => c.op === "sprite" && c.id === Stage.Child)).toBe(true);
    expect(after.some((c) => c.op === "sprite" && c.id === SPRITE_CHILD_BACK)).toBe(false);
  });

  it("baby poop feedback uses baby back sprite", () => {
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.stage = Stage.Baby;
    pet.flags |= FLAG_DIRTY;
    pet.feedbackTicks = 5;
    const cmds = buildRenderList(pet);
    expect(cmds.some((c) => c.op === "sprite" && c.id === SPRITE_BABY_BACK)).toBe(true);
  });

  it("dead render shows wings beside hamster and flies up", () => {
    const pet = createNewPet();
    pet.screen = Screen.Dead;
    pet.stage = Stage.Baby;
    pet.health = 0;
    pet.animFrame = 0;
    const start = buildRenderList(pet);
    const startPet = start.find((c) => c.op === "sprite" && c.id === SPRITE_DEAD);
    const startL = start.find((c) => c.op === "sprite" && c.id === SPRITE_WING_L);
    const startR = start.find((c) => c.op === "sprite" && c.id === SPRITE_WING_R);
    expect(startPet).toMatchObject({ op: "sprite", x: 48, y: 8 });
    expect(startL).toMatchObject({ op: "sprite", x: 38, y: 24 });
    expect(startR).toMatchObject({ op: "sprite", x: 58, y: 22 });
    expect(start.some((c) => c.op === "text8")).toBe(false);

    tickAnim(pet);
    const next = buildRenderList(pet);
    const nextPet = next.find((c) => c.op === "sprite" && c.id === SPRITE_DEAD);
    expect(nextPet && nextPet.op === "sprite" ? nextPet.y : 0).toBe(6);
    expect(next.some((c) => c.op === "sprite" && c.id === SPRITE_WING_L)).toBe(true);
    expect(next.some((c) => c.op === "sprite" && c.id === SPRITE_WING_R)).toBe(true);

    for (let i = 0; i < 40; i++) tickAnim(pet);
    const gone = buildRenderList(pet);
    expect(gone.some((c) => c.op === "sprite")).toBe(false);
    expect(gone.some((c) => c.op === "text8" && c.text === "УВЫ")).toBe(true);
  });

  it("dead child keeps medium stage sprite", () => {
    const pet = createNewPet();
    pet.screen = Screen.Dead;
    pet.stage = Stage.Child;
    pet.health = 0;
    pet.animFrame = 0;
    const cmds = buildRenderList(pet);
    expect(cmds.some((c) => c.op === "sprite" && c.id === Stage.Child)).toBe(true);
    expect(cmds.some((c) => c.op === "sprite" && c.id === SPRITE_DEAD)).toBe(false);
    expect(cmds.some((c) => c.op === "sprite" && c.id === SPRITE_WING_L && c.x === 38)).toBe(
      true,
    );
    expect(cmds.some((c) => c.op === "sprite" && c.id === SPRITE_WING_R && c.x === 58)).toBe(
      true,
    );
  });

  it("hold select restarts after death", () => {
    const pet = createNewPet();
    pet.screen = Screen.Dead;
    pet.health = 0;
    handleInput(pet, Button.Select, true);
    handleInput(pet, Button.Select, true);
    handleInput(pet, Button.Select, true);
    expect(pet.screen).toBe(Screen.Boot);
    expect(pet.health).toBe(100);
  });

  it("three Select clicks with release still restart after death", () => {
    const pet = createNewPet();
    pet.screen = Screen.Dead;
    pet.health = 0;
    for (let i = 0; i < 3; i++) {
      handleInput(pet, Button.Select, true);
      handleInput(pet, Button.Select, false);
    }
    expect(pet.screen).toBe(Screen.Boot);
    expect(pet.health).toBe(100);
  });

  it("first press after display off only wakes", () => {
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.bootTicks = 0;
    pet.stage = Stage.Baby;
    pet.menuIndex = 1; // Play
    pet.displayOn = false;
    pet.hunger = 50;
    handleInput(pet, Button.Select, true);
    expect(pet.displayOn).toBe(true);
    expect(pet.screen).toBe(Screen.Home);
    handleInput(pet, Button.Select, true);
    expect(pet.screen).toBe(Screen.Minigame);
  });
});

describe("save", () => {
  it("round-trips", () => {
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.stage = Stage.Child;
    pet.hunger = 33;
    pet.careScore = 77;
    pet.ageTicks = 12345;
    const blob = serialize(pet);
    expect(blob.length).toBe(SAVE_SIZE);
    const loaded = deserialize(blob);
    expect(loaded).not.toBeNull();
    expect(loaded!.stage).toBe(Stage.Child);
    expect(loaded!.hunger).toBe(33);
    expect(loaded!.careScore).toBe(77);
    expect(loaded!.ageTicks).toBe(12345);
  });

  it("rejects bad crc", () => {
    const pet = createNewPet();
    const blob = serialize(pet);
    blob[3] ^= 0xff;
    expect(deserialize(blob)).toBeNull();
  });
});

describe("phase2", () => {
  it("branches adult by careScore", () => {
    expect(resolveAdultStage(90)).toBe(Stage.AdultA);
    expect(resolveAdultStage(10)).toBe(Stage.AdultB);
    expect(resolveAdultStage(50)).toBe(Stage.Adult);
  });

  it("rare toilet event on aligned tick", () => {
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.stage = Stage.Baby;
    pet.minigameSeed = 7; // next % 8 === 0 after one step? find seed
    // Brute a seed that rolls % 8 === 0
    for (let s = 1; s < 200; s++) {
      const p = createNewPet();
      p.screen = Screen.Home;
      p.stage = Stage.Baby;
      p.minigameSeed = s;
      if (tryRareEvent(p, 32)) {
        expect(p.flags & FLAG_DIRTY).toBe(FLAG_DIRTY);
        return;
      }
    }
    throw new Error("no seed triggered rare event");
  });

  it("rare toilet skips when already dirty", () => {
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.stage = Stage.Baby;
    pet.flags |= FLAG_DIRTY;
    pet.minigameSeed = 1;
    expect(tryRareEvent(pet, 32)).toBe(false);
  });
});
