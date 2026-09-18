import { describe, expect, it } from "vitest";
import { createNewPet, handleInput } from "./pet";
import { Button, Screen, Stage } from "./types";
import { setActiveMinigameKind } from "./phase2";
import { MinigameKind, initMinigame, handleMinigameInput, tickMinigame } from "./minigame";

describe("minigames suite", () => {
  it("play starts pong", () => {
    setActiveMinigameKind(MinigameKind.Pong);
    const pet = createNewPet();
    pet.screen = Screen.Home;
    pet.stage = Stage.Baby;
    pet.menuIndex = 1;
    handleInput(pet, Button.Select, true);
    expect(pet.screen).toBe(Screen.Minigame);
    expect(pet.minigameKind).toBe(MinigameKind.Pong);
  });

  it("play random picks 0..2", () => {
    setActiveMinigameKind(-1);
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const pet = createNewPet();
      pet.screen = Screen.Home;
      pet.stage = Stage.Baby;
      pet.menuIndex = 1;
      pet.ageTicks = i * 97;
      pet.minigameSeed = 1000 + i * 13;
      handleInput(pet, Button.Select, true);
      expect(pet.screen).toBe(Screen.Minigame);
      expect(pet.minigameKind).toBeGreaterThanOrEqual(0);
      expect(pet.minigameKind).toBeLessThan(3);
      seen.add(pet.minigameKind);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it("pong launches on select", () => {
    const pet = createNewPet();
    initMinigame(pet, MinigameKind.Pong);
    expect(pet.minigamePhase).toBe(1);
    expect(pet.mgBallDy).toBe(-1);
    expect(pet.minigameTarget).toBeGreaterThanOrEqual(0);
  });

  it("arkanoid picks a known layout", () => {
    const layouts = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const pet = createNewPet();
      pet.minigameSeed = 100 + i * 17;
      pet.ageTicks = i * 3;
      initMinigame(pet, MinigameKind.Arkanoid);
      layouts.add(`${pet.minigameRound & 0xff},${pet.mgBricks & 0xff}`);
      expect((pet.minigameRound | pet.mgBricks) & 0xff).toBeTruthy();
    }
    expect(layouts.size).toBeGreaterThanOrEqual(3);
  });

  it("arkanoid destroys last brick on overlap", () => {
    const pet = createNewPet();
    initMinigame(pet, MinigameKind.Arkanoid);
    pet.minigameRound = 0;
    pet.minigameTimer = 0;
    pet.mgBricks = 1 << 7;
    pet.mgBallX = 120;
    pet.mgBallY = 22;
    pet.mgBallDx = 0.5;
    pet.mgBallDy = -1;
    tickMinigame(pet, 16);
    expect(pet.mgBricks & (1 << 7)).toBe(0);
  });

  it("arkanoid top bricks need two hits", () => {
    const pet = createNewPet();
    initMinigame(pet, MinigameKind.Arkanoid);
    pet.mgBricks = 0;
    pet.minigameRound = 1 << 3;
    pet.minigameTimer = 0;
    pet.mgBallX = 3 * 16 + 6;
    pet.mgBallY = 15;
    pet.mgBallDx = 0.2;
    pet.mgBallDy = -0.5;
    tickMinigame(pet, 16);
    expect(pet.minigameRound & (1 << 3)).toBe(1 << 3);
    expect(pet.minigameTimer & (1 << 3)).toBe(1 << 3);

    pet.mgBallX = 3 * 16 + 6;
    pet.mgBallY = 15;
    pet.mgBallDy = -0.5;
    tickMinigame(pet, 16);
    expect(pet.minigameRound & (1 << 3)).toBe(0);
  });

  it("arkanoid can clear all bottom bricks", () => {
    const pet = createNewPet();
    initMinigame(pet, MinigameKind.Arkanoid);
    pet.minigameRound = 0;
    for (let i = 0; i < 8; i++) {
      pet.mgBricks = 1 << i;
      pet.screen = Screen.Minigame;
      pet.minigameActive = true;
      pet.minigamePhase = 1;
      pet.mgBallX = i * 16 + 6;
      pet.mgBallY = 22;
      pet.mgBallDx = 0.2;
      pet.mgBallDy = -0.5;
      tickMinigame(pet, 16);
      expect(pet.mgBricks & (1 << i)).toBe(0);
    }
  });

  it("pong paddle bounce uses angled dx", () => {
    const pet = createNewPet();
    initMinigame(pet, MinigameKind.Pong);
    pet.mgBallX = pet.minigamePos + 2;
    pet.mgBallY = 54;
    pet.mgBallDx = 1;
    pet.mgBallDy = 1;
    tickMinigame(pet, 16);
    expect(pet.mgBallDy).toBeLessThan(0);
    expect(Math.abs(pet.mgBallDx)).toBeGreaterThan(0.3);
  });

  it("runner jumps higher and speeds up", () => {
    const pet = createNewPet();
    initMinigame(pet, MinigameKind.Runner);
    handleMinigameInput(pet, Button.Select);
    expect(pet.mgBallDy).toBeGreaterThan(0);
    let peak = 0;
    let hovered = false;
    for (let i = 0; i < 60; i++) {
      tickMinigame(pet, 16);
      if (pet.mgBallY > peak) peak = pet.mgBallY;
      if (pet.minigameTarget > 0) hovered = true;
    }
    expect(peak).toBeGreaterThanOrEqual(10);
    expect(hovered).toBe(true);

    pet.minigameHits = 0;
    pet.minigameFlash = 1;
    pet.minigameTarget = 0;
    const x0 = 200;
    pet.mgBallX = x0;
    pet.mgBallY = 0;
    pet.mgBallDy = 0;
    for (let i = 0; i < 25; i++) {
      pet.minigameFlash = 1;
      tickMinigame(pet, 16);
    }
    const slow = x0 - pet.mgBallX;

    pet.minigameHits = 8;
    pet.mgBallX = x0;
    for (let i = 0; i < 25; i++) {
      pet.minigameFlash = 1;
      tickMinigame(pet, 16);
    }
    const fast = x0 - pet.mgBallX;
    expect(fast).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThan(12);
  });

  it("runner jumps on any button", () => {
    const pet = createNewPet();
    initMinigame(pet, MinigameKind.Runner);
    handleMinigameInput(pet, Button.Left);
    expect(pet.mgBallDy).toBeGreaterThan(0);
  });

  it("runner only hits when tree overlaps player", () => {
    const pet = createNewPet();
    initMinigame(pet, MinigameKind.Runner);
    pet.minigameFlash = 0;
    pet.mgBallY = 0;
    pet.mgBallDy = 0;
    pet.mgBallX = 50;
    tickMinigame(pet, 16);
    expect(pet.minigameMisses).toBe(0);

    pet.minigameFlash = 0;
    pet.mgBallX = 20;
    pet.mgBallY = 0;
    tickMinigame(pet, 16);
    expect(pet.minigameMisses).toBe(1);
  });

  it("runner clears tree while high enough", () => {
    const pet = createNewPet();
    initMinigame(pet, MinigameKind.Runner);
    pet.minigameFlash = 0;
    pet.mgBallY = 20;
    pet.mgBallDy = 0;
    pet.mgBallX = 20;
    tickMinigame(pet, 16);
    expect(pet.minigameMisses).toBe(0);
  });

  it("paddle steers while left/right held", () => {
    const pet = createNewPet();
    initMinigame(pet, MinigameKind.Pong);
    const start = pet.minigamePos;
    pet.btnHeld = 1 << Button.Left;
    tickMinigame(pet, 16);
    expect(pet.minigamePos).toBeLessThan(start);
    pet.btnHeld = 1 << Button.Right;
    const mid = pet.minigamePos;
    tickMinigame(pet, 16);
    expect(pet.minigamePos).toBeGreaterThan(mid);
  });

  it("pong ball moves and draws ai paddle", () => {
    const pet = createNewPet();
    initMinigame(pet, MinigameKind.Pong);
    const y0 = pet.mgBallY;
    tickMinigame(pet, 16);
    expect(pet.mgBallY).toBeLessThan(y0);
  });

  it("rejects stale kinds outside 0..2", () => {
    const pet = createNewPet();
    initMinigame(pet, 99 as MinigameKind);
    expect(pet.minigameKind).toBe(MinigameKind.Pong);
  });
});
