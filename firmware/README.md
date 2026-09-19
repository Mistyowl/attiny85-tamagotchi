# Жорик — прошивка ATtiny85

Собирается **без заливки** на чип, чтобы увидеть `avr-size`.

## Сборка

Нужен [AVR-GCC](https://github.com/ZakKemble/avr-gcc-build) (уже ставится через `winget install ZakKemble.avr-gcc`).

```bash
cd firmware
make
```

Только размер:

```bash
make size
```

Артефакты: `build/zhorik.elf` (и `make hex` → `zhorik.hex` для avrdude позже).

## Замер (текущий)

После `make size` (Os + `-mcall-prologues` + `-Wl,--relax`, без Arduino core, 2026-09-20):

| | Байты | Из 8192 / 512 |
|--|------:|---------------|
| **Flash (text)** | **6518** | ~80% |
| **RAM (bss)** | **171** | ~33% |

Свободно ~**1674 B** Flash. Спрайты 32×32 из `shared/sprites.ts` в `sprites.c` (XY-crop пустых строк и столбцов).

Перегенерация арта после правок в TS:

```bash
node scripts/export-sprites.mjs
make -C firmware size
```

## Состав

| Файл | Назначение |
|------|------------|
| `src/main.c` | цикл, WDT sleep, кнопки |
| `src/pet.c` | жизнь / меню |
| `src/game.c` | ПОНГ / БЛОК / ПРЫГ |
| `src/oled.c` | SoftI2C + SSD1306 page mode |
| `src/ui.c` | отрисовка по страницам (128 Б буфер) |
| `src/sprites.c` | PROGMEM 32×32 из `shared/sprites.ts` |
| `src/save.c` | EEPROM 17 Б + CRC |

## Заливка

**Без Micronucleus** — только ISP, иначе Flash не хватит под текущий бинарник (~6518 B).

```bash
cd firmware
make hex
```

Примеры `avrdude` (подставьте свой программатор / COM):

```text
# USBasp
avrdude -c usbasp -p t85 -U flash:w:build/zhorik.hex:i

# USBTiny
avrdude -c usbtiny -p t85 -U flash:w:build/zhorik.hex:i

# Arduino Uno as ISP (сначала залить скетч ArduinoISP на Uno; COM — ваш порт)
avrdude -c arduino -P COM3 -b 19200 -p t85 -U flash:w:build/zhorik.hex:i
```

Плата «ATTINY Programming Board» с Micro-USB — сокет/обвязка; прошивка через её USB (Digispark) не используется.

PCINT для пробуждения по кнопке ещё не включён — для size-сборки не нужен.
