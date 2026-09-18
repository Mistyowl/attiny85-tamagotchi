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

ISP without bootloader = full 8 KB. Micronucleus (Digispark USB) costs **~1.5–2 KB** Flash up front.

### Assets now (PROGMEM estimate from TS)

Measured by `estimateSpriteFlashBytes` / `estimateIconFlashBytes` / `estimateFontFlashBytes` in `shared/`.

| Block | Calc | Bytes |
|-------|------|-------|
| Sprites | 6 stages × 2 frames × 128 | **1536** |
| Icons | 12 × 8 | **96** |
| Font | ~25 glyphs × 5 | **~125** |
| **Assets total** | | **~1757 (~1.7 KB)** |

AVR game + OLED code is **measured** (bare `avr-gcc -Os`, see `firmware/`):

| | Bytes | Limit | Used |
|--|------:|------:|-----:|
| Flash (`text`) | **4846** | 8192 | **59%** |
| SRAM (`bss`) | **168** | 512 | **33%** |

Free Flash ≈ **3346 B** (~3.3 KB). Rebuild: `make -C firmware size`.

Note: firmware still draws a **tiny stub pet** (`pet16`, 2×32 B), not the full 32×32 set from `shared/sprites.ts` (that set alone is **1536 B**).

### Free estimate (phase-1 stack, no bootloader)

| Piece | Rough Flash |
|-------|-------------|
| SoftI2C + OLED + draw + games (linked now) | **~4846** (measured) |
| Full 32×32 sprites (6×2×128) if linked | **+~1.5 KB** (replacing stub) |
| **After full sprites** | **~6.3 KB / 8 KB** |
| **Likely free then** | **~1.5–1.9 KB** |

Target: keep **≥1 KB** free after real sprites for polish / rare events.

### What still fits in ~3.3 KB free (now) / ~1.5 KB after sprites

| Feature | Est. Flash | Fits now? | After full sprites? |
|---------|------------|-----------|---------------------|
| Full 32×32 pet sprites (6 stages × 2 frames) | ~1.5 KB | Yes | — |
| Better Cyrillic UI (already mostly in) | small | Yes | Yes |
| Rare events (guest / storm) | 100–300 B | Yes | Yes |
| +1–2 animation frames per stage | 128 B / frame | Yes | Sparingly |
| Extra adult branch art | 256–512 B | Yes | Tight |
| 4th minigame | 400–800 B | Yes | Maybe |
| Sound / inventory / long dialogue | 1+ KB | Risky | No |
| Micronucleus USB bootloader | 1.5–2 KB | Cuts free hard | Avoid if possible |

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
| Core tick + menu | 0 | baseline (in game logic) |
| Sprites 6×2×128 | 1 | **1536 B** (current) |
| Icons + font | 1 | **~221 B** (current) |
| Sick/dirty | 1 | small (flags) |
| One minigame | 2 | 200–600 B |
| Evolution AdultA/B | 2 | already in sprites; logic small |
| Rare events | 2 | 100–300 B |
| Extra sprite frames | 2 | 128 B / frame |

## UI language

On-device text uses a tiny Cyrillic subset: **А Б В Г Д Е Ж З И К Л М Н О П Р С У Х Ы Я** + digits.

Strings: `УВЫ`, `ЖМИ`, `ЖДИ`, `ПОНГ`, `БЛОК`, `ПРЫГ`, `ЕДА`, `ИГРА`, `СОН`, `ЛЕК`, `РАД`, `СИЛ`, `ЖИЗ`, `БОЛ`, `ГРЯ`.

Menu shows the **selected** action as centered text (◀/▶ cycle). No UI icons.

