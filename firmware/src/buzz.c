#include "buzz.h"
#include "pins.h"

#include <avr/io.h>
#include <avr/interrupt.h>
#include <util/delay_basic.h>

/*
 * Passive piezo: PIN_BUZZER → ~150Ω → piezo → GND.
 * Shares PB1 with Left button (restored to INPUT_PULLUP after beep).
 */

/** Busy-wait µs @ 8 MHz (approx). */
static void wait_us(uint16_t us) {
  while (us >= 500) {
    _delay_loop_2(1000); /* ~500 µs */
    us = (uint16_t)(us - 500);
  }
  if (us) _delay_loop_2((uint16_t)(us * 2));
}

static void tone_ms(uint16_t freq, uint8_t ms) {
  if (freq == 0) {
    wait_us((uint16_t)ms * 1000);
    return;
  }
  uint16_t half = (uint16_t)(500000UL / freq);
  if (half < 40) half = 40;
  uint16_t cycles = (uint16_t)(((uint32_t)ms * 1000UL) / ((uint32_t)half * 2UL));
  if (cycles == 0) cycles = 1;

  DDRB |= (1 << PIN_BUZZER);
  while (cycles--) {
    PORTB |= (1 << PIN_BUZZER);
    wait_us(half);
    PORTB &= ~(1 << PIN_BUZZER);
    wait_us(half);
  }
}

static void restore_btn_pin(void) {
  DDRB &= ~(1 << PIN_BUZZER);
  PORTB |= (1 << PIN_BUZZER);
}

void buzz_init(void) {
  restore_btn_pin();
}

void buzz_play(uint8_t sfx_id) {
  if (sfx_id == SFX_NONE) return;

  uint8_t sreg = SREG;
  cli();

  switch (sfx_id) {
    case SFX_CLICK:
      tone_ms(1800, 18);
      break;
    case SFX_FEED:
      tone_ms(900, 50);
      tone_ms(0, 20);
      tone_ms(1400, 70);
      break;
    case SFX_PLAY:
      tone_ms(1200, 40);
      tone_ms(1600, 40);
      tone_ms(2000, 60);
      break;
    case SFX_SLEEP:
      tone_ms(800, 80);
      tone_ms(600, 100);
      tone_ms(400, 120);
      break;
    case SFX_MEDICINE:
      tone_ms(1500, 40);
      tone_ms(0, 30);
      tone_ms(1500, 40);
      tone_ms(0, 30);
      tone_ms(1900, 80);
      break;
    case SFX_HATCH:
      tone_ms(1000, 60);
      tone_ms(1300, 60);
      tone_ms(1700, 60);
      tone_ms(2200, 100);
      break;
    case SFX_EVOLVE:
      tone_ms(1100, 50);
      tone_ms(1400, 50);
      tone_ms(1800, 50);
      tone_ms(2200, 50);
      tone_ms(1800, 80);
      break;
    case SFX_CHIRP:
      tone_ms(2400, 35);
      tone_ms(0, 40);
      tone_ms(2800, 45);
      break;
    case SFX_SAD:
      tone_ms(900, 90);
      tone_ms(700, 110);
      break;
    case SFX_DIE:
      tone_ms(600, 100);
      tone_ms(450, 120);
      tone_ms(300, 160);
      break;
    case SFX_WAKE:
      tone_ms(1400, 40);
      tone_ms(1800, 50);
      break;
    case SFX_HIT:
      tone_ms(2000, 25);
      break;
    case SFX_FART:
      tone_ms(220, 28);
      tone_ms(0, 12);
      tone_ms(170, 32);
      tone_ms(0, 12);
      tone_ms(130, 40);
      tone_ms(0, 14);
      tone_ms(95, 55);
      tone_ms(70, 90);
      break;
    default:
      break;
  }

  restore_btn_pin();
  SREG = sreg;
}
