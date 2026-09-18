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

После `make size` (Os, без Arduino core, 2026-09-17):

| | Байты | Из 8192 / 512 |
|--|------:|---------------|
| **Flash (text)** | **4846** | ~59% |
| **RAM (bss)** | **168** | ~33% |

Свободно ~**3.3 КБ** Flash. Сюда спокойно влезают полноценные спрайты 32×32 (~1.5 КБ) и ещё запас на полировку.

Сейчас в `ui.c` — заглушка `pet16` (крошечный пет), не `shared/sprites.ts`.

## Состав

| Файл | Назначение |
|------|------------|
| `src/main.c` | цикл, WDT sleep, кнопки |
| `src/pet.c` | жизнь / меню |
| `src/game.c` | ПОНГ / БЛОК / ПРЫГ |
| `src/oled.c` | SoftI2C + SSD1306 page mode |
| `src/ui.c` | отрисовка по страницам (128 Б буфер) |
| `src/save.c` | EEPROM 17 Б + CRC |

## Заливка (позже)

```text
avrdude -c usbtiny -p t85 -U flash:w:build/zhorik.hex:i
```

(программатор USBTiny / USBasp / Arduino as ISP — под ваш кабель.)

PCINT для пробуждения по кнопке ещё не включён — для size-сборки не нужен.
