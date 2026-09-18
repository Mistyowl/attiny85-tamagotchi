import {
  Button,
  Screen,
  Stage,
  FLAG_SLEEPING,
  WDT_SECONDS,
  ANIM_PERIOD_MS,
  buildRenderList,
  createNewPet,
  deserialize,
  estimateSpriteFlashBytes,
  estimateIconFlashBytes,
  estimateFontFlashBytes,
  fromBase64,
  handleInput,
  noteDisplayWallClockIdle,
  serialize,
  setActiveMinigameKind,
  MG_RANDOM,
  MinigameKind,
  MINIGAME_NAMES,
  toBase64,
  tickLife,
  tickAnim,
  tickMinigame,
  type PetState,
} from "../shared";
import { BatteryModel, CanvasHal } from "./hal";
import { BuzzerHal } from "./buzzer";

const SAVE_KEY = "pocket-critter-eeprom-v1";
const DISPLAY_OFF_MS = 8000;
/** SoftI2C full-frame estimate — chunky like ATtiny85 + SSD1306. */
const DEVICE_FRAME_MS = 67;

type FpsMode = "smooth" | "device";

const canvas = document.getElementById("oled") as HTMLCanvasElement;
const hal = new CanvasHal(canvas);
const battery = new BatteryModel();
const buzzer = new BuzzerHal();

let pet: PetState = loadOrNew();
let powered = true;
let timeScale = 1;
let fpsMode: FpsMode = "smooth";
/** Lab: never auto-blank OLED while testing. */
let keepDisplayOn = false;
let lastInputMs = performance.now();
let simAccumMs = 0;
let animAccumMs = 0;
let deviceAccumMs = 0;
let lastFrame = performance.now();
const logLines: string[] = [];

const stageNames = ["Egg", "Baby", "Child", "Adult", "AdultA", "AdultB"];

function drainSfx(): void {
  buzzer.pump();
}
function log(msg: string): void {
  const t = new Date().toLocaleTimeString();
  logLines.unshift(`[${t}] ${msg}`);
  if (logLines.length > 40) logLines.pop();
  const el = document.getElementById("log");
  if (el) el.textContent = logLines.join("\n");
}

function loadOrNew(): PetState {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    const buf = fromBase64(raw);
    if (buf) {
      const p = deserialize(buf);
      if (p) return p;
    }
  }
  return createNewPet();
}

function persist(): void {
  const blob = serialize(pet);
  localStorage.setItem(SAVE_KEY, toBase64(blob));
  log(`EEPROM write (${blob.length} B)`);
}

function wipeSave(): void {
  localStorage.removeItem(SAVE_KEY);
  pet = createNewPet();
  log("EEPROM wiped — new egg");
}

function setPower(on: boolean): void {
  if (!on && powered) {
    persist();
    powered = false;
    log("Power OFF (state saved)");
  } else if (on && !powered) {
    pet = loadOrNew();
    powered = true;
    lastInputMs = performance.now();
    log("Power ON");
  }
  const btn = document.getElementById("power-toggle");
  if (btn) btn.textContent = powered ? "ON" : "OFF";
}

function pullBattery(): void {
  // Simulate removing cell without graceful save — corrupt/clear RAM but keep EEPROM
  persist();
  pet = createNewPet();
  pet = loadOrNew();
  log("CR2032 reseated — loaded EEPROM");
}

function bindButtons(): void {
  const map: Record<string, Button> = {
    ArrowLeft: Button.Left,
    ArrowRight: Button.Right,
    ArrowUp: Button.Select,
    Enter: Button.Select,
    " ": Button.Select,
  };

  const press = (btn: Button, down: boolean, el?: Element | null) => {
    if (!powered) return;
    if (down) {
      lastInputMs = performance.now();
      buzzer.unlock();
    }
    handleInput(pet, btn, down);
    if (down) drainSfx();
    el?.classList.toggle("is-down", down);
    if (down) {
      const names = ["Left", "Select", "Right"];
      log(`BTN ${names[btn]}`);
    }
  };

  document.querySelectorAll<HTMLButtonElement>(".key").forEach((el) => {
    const btn = Number(el.dataset.btn) as Button;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      press(btn, true, el);
    });
    el.addEventListener("pointerup", () => press(btn, false, el));
    el.addEventListener("pointerleave", () => press(btn, false, el));
  });

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const btn = map[e.key];
    if (btn === undefined) return;
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const el = document.querySelector(`.key[data-btn="${btn}"]`);
    press(btn, true, el);
  });
  window.addEventListener("keyup", (e) => {
    const btn = map[e.key];
    if (btn === undefined) return;
    const el = document.querySelector(`.key[data-btn="${btn}"]`);
    press(btn, false, el);
  });
}

function updateDebug(): void {
  const set = (id: string, v: string | number) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };
  set("d-stage", stageNames[pet.stage] ?? pet.stage);
  set("d-hunger", pet.hunger);
  set("d-happy", pet.happiness);
  set("d-energy", pet.energy);
  set("d-health", pet.health);
  set("d-age", pet.ageTicks);
  set("d-care", pet.careScore);
  const sprites = estimateSpriteFlashBytes();
  const icons = estimateIconFlashBytes();
  const font = estimateFontFlashBytes();
  const assets = sprites + icons + font;
  // Phase-1 stack estimate from docs/constraints.md (OLED+game not linked yet)
  const freeLo = Math.max(0, 8192 - assets - Math.floor(3.5 * 1024) - Math.floor(2.5 * 1024));
  const freeHi = Math.max(0, 8192 - assets - Math.floor(2.5 * 1024) - Math.floor(1.5 * 1024));
  set("d-flash-sprites", `${sprites} B`);
  set("d-flash-icons", `${icons} B`);
  set("d-flash-font", `${font} B`);
  set("d-flash-total", `${assets} B`);
  set("d-flash-avr", "not measured");
  set("d-flash-free", `~${freeLo}–${freeHi} B*`);
  set("d-fps", fpsMode === "smooth" ? "60" : "~15");
  set("d-days", battery.estimatedDays());
  set("d-mah", battery.usedMah.toFixed(4));
}

function stepSimulation(dt: number): void {
  if (pet.screen !== Screen.Minigame) {
    simAccumMs += dt * timeScale;
    const periodMs = WDT_SECONDS * 1000;
    while (simAccumMs >= periodMs) {
      simAccumMs -= periodMs;
      tickLife(pet);
      drainSfx();
      if (pet.ageTicks > 0 && pet.ageTicks % 50 === 0) persist();
    }
    animAccumMs += dt;
    while (animAccumMs >= ANIM_PERIOD_MS) {
      animAccumMs -= ANIM_PERIOD_MS;
      tickAnim(pet);
    }
  } else {
    animAccumMs = 0;
    tickMinigame(pet, dt);
    drainSfx();
  }
}

function paint(): void {
  if (!keepDisplayOn) {
    noteDisplayWallClockIdle(pet, performance.now() - lastInputMs, DISPLAY_OFF_MS);
  } else if (!pet.displayOn) {
    pet.displayOn = true;
  }
  battery.tick(pet.displayOn, true);
  const cmds = buildRenderList(pet);
  hal.execute(cmds);
  canvas.classList.toggle("is-on", pet.displayOn);
}

function frame(now: number): void {
  const dt = Math.min(100, now - lastFrame);
  lastFrame = now;

  if (powered) {
    if (fpsMode === "smooth") {
      stepSimulation(dt);
      paint();
    } else {
      // Device: present ~15 FPS; one sim step per present (dt≈frame) so speed ≈ smooth
      deviceAccumMs += dt;
      while (deviceAccumMs >= DEVICE_FRAME_MS) {
        deviceAccumMs -= DEVICE_FRAME_MS;
        stepSimulation(DEVICE_FRAME_MS);
        paint();
      }
    }
  } else {
    battery.tick(false, false);
    hal.clear();
    hal.execute([{ op: "clear" }]);
    canvas.classList.remove("is-on");
  }

  updateDebug();
  requestAnimationFrame(frame);
}

function wireLab(): void {
  const scaleInput = document.getElementById("time-scale") as HTMLInputElement;
  const presetBtns = document.querySelectorAll<HTMLButtonElement>(".scale-btn");

  const applyScale = (value: number, syncPreset: boolean) => {
    const v = Math.max(1, Math.min(86400, Math.floor(value) || 1));
    timeScale = v;
    scaleInput.value = String(v);
    if (syncPreset) {
      presetBtns.forEach((btn) => {
        btn.classList.toggle("is-active", Number(btn.dataset.scale) === v);
      });
    } else {
      presetBtns.forEach((btn) => btn.classList.remove("is-active"));
    }
    log(`Time scale ${v}×`);
  };

  presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      applyScale(Number(btn.dataset.scale), true);
    });
  });

  scaleInput.addEventListener("change", () => {
    applyScale(Number(scaleInput.value), true);
  });

  document.getElementById("power-toggle")?.addEventListener("click", () => {
    setPower(!powered);
  });
  document.getElementById("keep-display")?.addEventListener("click", () => {
    keepDisplayOn = !keepDisplayOn;
    const btn = document.getElementById("keep-display");
    if (btn) {
      btn.textContent = keepDisplayOn ? "OLED stay on" : "OLED auto-off";
      btn.classList.toggle("is-active", keepDisplayOn);
    }
    if (keepDisplayOn) {
      pet.displayOn = true;
      lastInputMs = performance.now();
    }
    log(keepDisplayOn ? "OLED → stay on (test)" : "OLED → auto-off after idle");
  });
  document.getElementById("battery-pull")?.addEventListener("click", pullBattery);
  document.getElementById("save-now")?.addEventListener("click", persist);
  document.getElementById("reset-save")?.addEventListener("click", wipeSave);

  document.getElementById("buzzer-mute")?.addEventListener("click", () => {
    buzzer.setMuted(!buzzer.isMuted());
    const btn = document.getElementById("buzzer-mute");
    if (btn) {
      btn.textContent = buzzer.isMuted() ? "Buzzer OFF" : "Buzzer ON";
      btn.classList.toggle("is-active", !buzzer.isMuted());
    }
    if (!buzzer.isMuted()) buzzer.unlock();
    log(buzzer.isMuted() ? "Buzzer muted" : "Buzzer on (square / piezo)");
  });

  const fpsBtns = document.querySelectorAll<HTMLButtonElement>(".fps-btn");
  fpsBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.fps === "device" ? "device" : "smooth";
      fpsMode = mode;
      deviceAccumMs = 0;
      fpsBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
      log(mode === "smooth" ? "FPS → 60 (smooth debug)" : "FPS → Device (~15, SoftI2C-like)");
    });
  });

  const mgBtns = document.querySelectorAll<HTMLButtonElement>(".mg-btn");
  mgBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = Number(btn.dataset.mg);
      setActiveMinigameKind(kind);
      mgBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
      if (kind === MG_RANDOM) log("Minigame → RANDOM each Play (ПОНГ/БЛОК/ПРЫГ)");
      else log(`Minigame → force ${MINIGAME_NAMES[kind]}`);
    });
  });

  const skipToStage = (stage: Stage, ageTicks: number, label: string) => {
    if (pet.screen === Screen.Minigame) {
      log("Finish minigame first");
      return;
    }
    pet.stage = stage;
    pet.ageTicks = ageTicks;
    pet.bootTicks = 0;
    pet.flags &= ~FLAG_SLEEPING;
    pet.screen = Screen.Home;
    pet.displayOn = true;
    pet.animFrame = 0;
    pet.menuIndex = 1; // Play icon
    log(`Skipped to ${label}`);
  };

  document.getElementById("skip-baby")?.addEventListener("click", () => {
    skipToStage(Stage.Baby, 40, "маленький (Baby)");
  });
  document.getElementById("skip-child")?.addEventListener("click", () => {
    skipToStage(Stage.Child, 200, "средний (Child)");
  });
  document.getElementById("skip-adult")?.addEventListener("click", () => {
    skipToStage(Stage.Adult, 400, "большой (Adult)");
  });
}

bindButtons();
wireLab();
log("Emulator ready — piezo buzzer (Web Audio), 3 buttons, shared core");
log(
  `Flash assets sprites=${estimateSpriteFlashBytes()} icons=${estimateIconFlashBytes()} font=${estimateFontFlashBytes()} (AVR code not measured)`,
);
requestAnimationFrame(frame);
