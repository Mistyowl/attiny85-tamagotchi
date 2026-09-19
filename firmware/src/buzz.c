#include "buzz.h"
#include "pins.h"

#include <avr/io.h>
#include <avr/interrupt.h>
#include <avr/pgmspace.h>
#include <util/delay_basic.h>

/*
 * Passive piezo: PIN_BUZZER → ~150Ω → piezo → GND.
 * Shares PB1 with Left button (restored to INPUT_PULLUP after beep).
 *
 * Each SFX is PROGMEM uint16 pairs, terminated by {0,0}:
 *   half!=0 → square wave: `cycles` toggles, half-period = half µs
 *   half==0, ms!=0 → silence for `ms` milliseconds
 *
 * half = 500000/freq (trunc), cycles = (ms*1000)/(half*2) — same as old tone_ms.
 */

/** Busy-wait µs @ 8 MHz (approx). */
static void wait_us(uint16_t us) {
  while (us >= 500) {
    _delay_loop_2(1000); /* ~500 µs */
    us = (uint16_t)(us - 500);
  }
  if (us) _delay_loop_2((uint16_t)(us * 2));
}

static void play_tone(uint16_t half, uint16_t cycles) {
  if (half < 40) half = 40;
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

/* {half_us, cycles} or {0, silence_ms}; end {0,0} */
static const uint16_t sfx_click[] PROGMEM = {277, 32, 0, 0};
static const uint16_t sfx_feed[] PROGMEM = {555, 45, 0, 20, 357, 98, 0, 0};
static const uint16_t sfx_play[] PROGMEM = {416, 48, 312, 64, 250, 120, 0, 0};
static const uint16_t sfx_sleep[] PROGMEM = {625, 64, 833, 60, 1250, 48, 0, 0};
static const uint16_t sfx_medicine[] PROGMEM = {333, 60, 0, 30, 333, 60, 0, 30, 263, 152, 0, 0};
static const uint16_t sfx_hatch[] PROGMEM = {500, 60, 384, 78, 294, 102, 227, 220, 0, 0};
static const uint16_t sfx_evolve[] PROGMEM = {454, 55, 357, 70, 277, 90, 227, 110, 277, 144, 0, 0};
static const uint16_t sfx_chirp[] PROGMEM = {208, 84, 0, 40, 178, 126, 0, 0};
static const uint16_t sfx_sad[] PROGMEM = {555, 81, 714, 77, 0, 0};
static const uint16_t sfx_die[] PROGMEM = {833, 60, 1111, 54, 1666, 48, 0, 0};
static const uint16_t sfx_wake[] PROGMEM = {357, 56, 277, 90, 0, 0};
/* SFX_HIT / SFX_FART: emulator-only — not linked on device */

static const uint16_t *const sfx_table[] PROGMEM = {
    0,
    sfx_click, sfx_feed, sfx_play, sfx_sleep, sfx_medicine,
    sfx_hatch, sfx_evolve, sfx_chirp, sfx_sad, sfx_die,
    sfx_wake};

void buzz_play(uint8_t sfx_id) {
  if (sfx_id == SFX_NONE || sfx_id > SFX_WAKE) return;

  const uint16_t *seq = (const uint16_t *)pgm_read_ptr(&sfx_table[sfx_id]);
  if (!seq) return;

  uint8_t sreg = SREG;
  cli();

  for (;;) {
    uint16_t a = pgm_read_word(&seq[0]);
    uint16_t b = pgm_read_word(&seq[1]);
    if (a == 0 && b == 0) break;
    if (a == 0)
      wait_us((uint16_t)(b * 1000u));
    else
      play_tone(a, b);
    seq += 2;
  }

  restore_btn_pin();
  SREG = sreg;
}
