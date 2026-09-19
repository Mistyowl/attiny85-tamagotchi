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

**Decision: no Micronucleus / Digispark USB bootloader.** It costs ~1.5–2 KB Flash; current firmware (~6518 B) would not fit. Flash only via ISP (USBasp, USBtiny, or Arduino as ISP) for the full 8192 B.


### Measured firmware size (2026-09-20)

`make -C firmware size` (`-Os -mcall-prologues -Wl,--relax`, no bootloader):

| | Bytes | Limit | Used | Free |
|--|------:|------:|-----:|-----:|
| Flash (`text`) | **6518** | 8192 | **~80%** | **~1674 B (~1.6 KB)** |
| SRAM (`bss`) | **171** | 512 | **~33%** | **~341 B** (+ stack) |

Full 32×32 sprites are in firmware (`sprites.c`, XY-cropped empty rows/cols). Rebuild: `make -C firmware size`. Details: [`memory-optimization.md`](memory-optimization.md), [`firmware/README.md`](../firmware/README.md).

### Assets (TS estimates vs linked)

| Block | Notes | Approx |
|-------|-------|-------:|
| Pet sprites (XY-cropped PROGMEM) | unique frames in `sprites.c` | **~756 B** data |
| Icons / font | mostly emulator UI; firmware digits-only font ~50 B | small on device |
| Games + OLED + buzz + logic | rest of `.text` | — |

Target: keep **≥1 KB** free Flash for polish / rare events — **currently ~1.6 KB**.

### What still fits in ~1.6 KB free

| Feature | Est. Flash | Fits? |
|---------|------------|------:|
| Rare events (guest / storm) | 100–300 B | Yes |
| +1 animation frame | ~48–128 B / frame (after crop) | Sparingly |
| Extra adult branch art | 256–512 B | Yes if careful |
| Cyrillic UI / icons | ~150–250 | Maybe |
| 4th minigame | 400–800 B | Risky |
| Sound / inventory / long dialogue | 1+ KB | Tight |
| Micronucleus USB bootloader | 1.5–2 KB | **No — do not use** |

RAM: after 128 B OLED page, ~300+ B left — OK for current games, not a second framebuffer.
EEPROM: 17 B save used, ~495 B free.


## Power model (CR2032 ~200 mAh)

- Default: `POWER_DOWN` + WDT wake ~8 s (life tick) + pin-change wake on buttons
- OLED on only while UI active; auto-off after ~5–10 s idle
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

On-device text uses a tiny Cyrillic subset: **А Б В Г Д Е Ж З И К Л М Н О П Р С У Х Ы Я** + digits.

Strings: `УВЫ`, `ЖМИ`, `ЖДИ`, `ПОНГ`, `БЛОК`, `ПРЫГ`, `ЕДА`, `ИГРА`, `СОН`, `ЛЕК`, `РАД`, `СИЛ`, `ЖИЗ`, `БОЛ`, `ГРЯ`.

Menu shows the **selected** action as centered text (◀/▶ cycle). No UI icons.

