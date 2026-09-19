# Pocket Critter

Tamagotchi-style pet for **ATtiny85 + SSD1306 OLED**, with a **web emulator** that runs the same shared TypeScript game core.

## Firmware (ATtiny85)

```bash
cd firmware
make          # compile + avr-size (no upload)
```

Current size: **Flash 6926 / 8192** (~1266 B free), **RAM 168 / 512**. See [`firmware/README.md`](firmware/README.md).

Open the URL Vite prints (default http://localhost:5173).

```bash
npm test    # shared core unit tests
npm run build
```

## Layout

- `shared/` — portable game logic (stats, tick, input, save, sprites, phase-2 hooks)
- `emulator/` — Canvas OLED + 3 buttons + time scale + battery estimate
- `docs/constraints.md` — pinout, EEPROM, power budget
- `firmware/` — ATtiny85 skeleton for the later C port

## Controls

| Key | Action |
|-----|--------|
| ← / Left | Previous menu action |
| → / Right | Next menu action |
| Enter / Select | Confirm |

Menu (centered text): ЕДА · ИГРА · СОН · ЛЕК (when sick/dirty).

On-screen Russian (minimal font): УВЫ, ЖМИ, ЕДА, ИГРА, СОН, ЛЕК, ПОНГ, БЛОК, ПРЫГ — see `shared/font.ts`.
