# Hardware & software constraints

Target: ATtiny85-20PU + SSD1306 OLED 128×64 I2C + 3 buttons + CR2032.

## Pinout

| Pin | Role |
|-----|------|
| PB0 | SoftI2C SDA → OLED |
| PB2 | SoftI2C SCL → OLED |
| PB1 | Button Left + **passive piezo** (via ~150Ω to piezo→GND; active LOW button) |
| PB3 | Button Select |
| PB4 | Button Right |
| PB5 | RESET (keep as reset) |

Buzzer shares Left (`PIN_BUZZER`): while beeping the pin is driven as OUTPUT square-wave, then restored to `INPUT_PULLUP`. Series resistor protects the pin if Left is held during a beep.

## Memory budget

| Resource | Limit | Notes |
|----------|-------|-------|
| Flash | **8192 B** | Prefer Tiny4kOLED / page draw; no Adafruit GFX |
| SRAM | **512 B** | State ~40 B + OLED page 128 B + stack — no full 1 KB framebuffer |
| EEPROM | **512 B** | Save blob **17 B** + CRC; ~495 B free for scores/settings |

ISP without bootloader = full 8 KB.

**Decision: no Micronucleus / Digispark USB bootloader.** It costs ~1.5–2 KB Flash; current firmware (~8150 B) would not fit. Flash only via ISP (USBasp, USBtiny, or Arduino as ISP) for the full 8192 B.


### Measured firmware size (2026-10-03)

`make -C firmware size` (`-Os -mcall-prologues -Wl,--relax`, no bootloader):

| | Bytes | Limit | Used | Free |
|--|------:|------:|-----:|-----:|
| Flash (`text`) | **8150** | 8192 | **~99%** | **~42 B** |
| SRAM (`bss`) | **173** | 512 | **~34%** | **~339 B** (+ stack) |

Full 32×32 sprites + Home UI + OLED auto-off/PCINT + SFX Hit/Fart. Rebuild: `make -C firmware size`. Details: [`memory-optimization.md`](memory-optimization.md), [`firmware/README.md`](../firmware/README.md).

### Assets (TS estimates vs linked)

| Block | Notes | Approx |
|-------|-------|-------:|
| Pet sprites (XY-cropped PROGMEM) | unique frames in `sprites.c` | **~756 B** data |
| Icons / font / strings | `ui_assets.c` from `shared/icons.ts` + `shared/font.ts` | **~250 B** data |
| Games + OLED + buzz + UI draw + sleep | rest of `.text` | — |

Free Flash **~42 B**. Almost full — shrink before any new feature.

### What still fits in ~42 B free

| Feature | Est. Flash | Fits? |
|---------|------------|------:|
| Minigame titles (`ПОНГ`/`БЛОК`/`ПРЫГ`/`ЖДИ`) | ~80–150 | **No** without cuts |
| Rare events / extra art / 4th minigame | 100+ B | **No** |
| Micronucleus USB bootloader | 1.5–2 KB | **No — do not use** |

RAM: after 128 B OLED page, ~300+ B left — OK for current games, not a second framebuffer.
EEPROM: 17 B save used, ~495 B free.


## Power model (CR2032 ~200 mAh)

- Default: `POWER_DOWN` + WDT wake ~8 s (life tick) + pin-change wake on buttons
- OLED on only while UI active; auto-off after **~8 s** idle (Home/Sleep); wake on button (PCINT); WDT life-ticks while panel off
- EEPROM writes rare (stage change, sleep, critical thresholds, power-off)

Rough currents used by the web battery estimator:

- Sleep (MCU + OLED off): 10 µA
- OLED on (typical 0.96" SSD1306 @ 3 V): ~8 mA (pixels matter; white fills draw more)

CR2032 ≈ 200 mAh — rough lifetime:

| OLED use | Avg current | Estimate |
|----------|-------------|----------|
| Always on | ~8 mA | ~1 day |
| ~1 h/day | ~0.34 mA | ~3–4 weeks |
| ~20–30 min/day (auto-off) | ~0.15–0.2 mA | ~1.5–2 months |
| Rare checks, mostly sleep | ~0.05–0.1 mA | ~2–4 months |

Goal “a couple of months” needs auto-off and not leaving the panel lit. Voltage sag on CR2032 under OLED load can brown-out the display — keep sessions short.

## Pet stats (uint8, 0–100)

- `hunger` — rises over time (bad when high)
- `happiness` — falls over time
- `energy` — falls while awake; recovers in sleep
- `health` — falls when other stats are critical; death at 0

## Life stages

`Egg` → `Baby` → `Child` → `Adult` (phase-2 hook: `AdultA` / `AdultB`)

## Screens / UI FSM

1. `Boot` — brief splash
2. `Home` — sprite + status bars + action menu
3. `Sleeping` — energy recovers, dim UI
4. `Dead` — hold Select to restart
5. `Minigame` — phase-2 stub (not required for v1 playable loop)

Menu actions (cursor Left/Right, Select confirm): Feed, Play, Sleep, Medicine (when sick/dirty).

## EEPROM layout (v1)

| Offset | Size | Field |
|--------|------|-------|
| 0 | 1 | magic `0x54` ('T') |
| 1 | 1 | version `1` |
| 2 | 1 | stage |
| 3 | 1 | hunger |
| 4 | 1 | happiness |
| 5 | 1 | energy |
| 6 | 1 | health |
| 7 | 1 | flags (bit0 sick, bit1 dirty, bit2 sleeping) |
| 8–11 | 4 | ageTicks (uint32 LE) |
| 12–15 | 4 | careScore (uint32 LE, phase-2 evolution) |
| 16 | 1 | CRC8 over bytes 0–15 |

## Phase-2 hooks (optional)

- One reaction minigame instead of instant Play
- Adult A/B from `careScore`
- Rare timed events
- Extra animation frames

## Feature budget checklist

| Feature | Phase | Est. Flash impact |
|---------|-------|-------------------|
| Core + OLED + 3 games + buzz | 0–1 | in measured **6518 B** total |
| Sprites (XY-cropped PROGMEM) | 1 | **~756 B** data (linked) |
| Digits font on device | 1 | ~50 B |
| Icons / Cyrillic | emulator-heavy | not fully on device yet |
| Evolution AdultA/B art | 2 | same Adult pointers until unique |
| Rare events | 2 | 100–300 B |
| Extra sprite frames | 2 | ~48–128 B / frame (cropped) |

## UI language

On-device text uses a tiny Cyrillic subset (glyphs actually referenced by exported strings) + digits. Source: [`shared/font.ts`](../shared/font.ts) → `node scripts/export-ui-assets.mjs`.

Strings on device: `ЕДА`, `ИГРА`, `СОН`, `ЛЕК`, `БОЛ`, `НАДУДОНИЛ`, `УВЫ`, `ЖМИ`.

Menu: **selected** action as centered text with invert highlight (◀/▶ cycle). Stats: **8×8 icons** + hbar (same layout as emulator). Deferred for Flash: minigame titles `ПОНГ`/`БЛОК`/`ПРЫГ`, `ЖДИ`.

