/*
 * Жорик — ATtiny85 firmware
 * Build only (no upload): make -C firmware size
 */
#include "pins.h"
#include "pet.h"
#include "save.h"
#include "oled.h"
#include "ui.h"
#include "buzz.h"

#include <avr/interrupt.h>
#include <avr/sleep.h>
#include <avr/wdt.h>
#include <avr/power.h>
#include <util/delay.h>

#define DISPLAY_OFF_MS 8000
#define UI_FRAME_MS 650

static Pet pet;
static volatile uint8_t wdt_fired;
static uint8_t prev_btns;
static uint16_t idle_ms;

ISR(WDT_vect) { wdt_fired = 1; }

/** Empty — wakes CPU from POWER_DOWN; reason checked via PINB / wdt_fired. */
ISR(PCINT0_vect) {}

static void wdt_setup_8s(void) {
  cli();
  wdt_reset();
  MCUSR &= ~(1 << WDRF);
  WDTCR |= (1 << WDCE) | (1 << WDE);
  WDTCR = (1 << WDIE) | (1 << WDP3) | (1 << WDP0); /* 8s interrupt */
  sei();
}

static void pcint_btns_on(void) {
  GIFR |= (1 << PCIF);
  PCMSK |= BTN_MASK;
  GIMSK |= (1 << PCIE);
}

static void pcint_btns_off(void) {
  GIMSK &= (uint8_t)~(1 << PCIE);
  PCMSK &= (uint8_t)~BTN_MASK;
}

static void sleep_until_wdt_or_btn(void) {
  set_sleep_mode(SLEEP_MODE_PWR_DOWN);
  sleep_enable();
  sleep_bod_disable();
  sei();
  sleep_cpu();
  sleep_disable();
}

static uint8_t read_btns(void) {
  uint8_t v = 0;
  if (btn_left()) v |= 1;
  if (btn_sel()) v |= 2;
  if (btn_right()) v |= 4;
  return v;
}

static void life_tick_and_save(void) {
  uint32_t age_before = pet.age_ticks;
  pet_tick_life(&pet);
  /* every 50 life ticks — avoid age_ticks % 50 (__udivmodsi4) */
  if (pet.age_ticks != age_before) {
    static uint8_t save_cd;
    if (++save_cd >= 50) {
      save_cd = 0;
      save_write(&pet);
    }
  }
}

/** Poll buttons for ~ms; return 1 if edge / WDT / game. Resets idle on edge. */
static uint8_t poll_ms(uint16_t ms) {
  while (ms) {
    _delay_ms(20);
    ms = ms > 20 ? (uint16_t)(ms - 20) : 0;

    uint8_t b = read_btns();
    uint8_t edge = (uint8_t)(b & ~prev_btns);
    prev_btns = b;
    pet.btn_held = b;
    if (edge) {
      idle_ms = 0;
      if (edge & 1) pet_input(&pet, BTN_LEFT, 1);
      if (edge & 2) pet_input(&pet, BTN_SEL, 1);
      if (edge & 4) pet_input(&pet, BTN_RIGHT, 1);
      return 1;
    }
    if (pet.screen == SCR_GAME || wdt_fired) return 1;
  }
  return 0;
}

int main(void) {
  clock_prescale_set(clock_div_1);
  pins_init();
  buzz_init();
  oled_init();

  if (!save_read(&pet)) pet_reset(&pet);
  pet.mg_kind = 0;
  idle_ms = 0;

  wdt_setup_8s();
  ui_draw(&pet);
  prev_btns = read_btns();

  for (;;) {
    uint8_t b = read_btns();
    uint8_t edge = (uint8_t)(b & ~prev_btns);
    prev_btns = b;
    pet.btn_held = b;

    if (pet.screen == SCR_GAME) {
      idle_ms = 0;
      if (pet.mg_kind == 2) {
        if (edge & 7) pet_input(&pet, BTN_SEL, 1);
      } else if (edge & 2) {
        pet_input(&pet, BTN_SEL, 1);
      }
      pet_tick_game(&pet, 20);
      ui_draw(&pet);
      _delay_ms(20);
      continue;
    }

    if (edge) {
      idle_ms = 0;
      if (edge & 1) pet_input(&pet, BTN_LEFT, 1);
      if (edge & 2) pet_input(&pet, BTN_SEL, 1);
      if (edge & 4) pet_input(&pet, BTN_RIGHT, 1);
    }

    if (wdt_fired) {
      wdt_fired = 0;
      life_tick_and_save();
    }

    /* OLED on: Boot/Dead always; else while display_on */
    if (pet.display_on || pet.screen == SCR_BOOT || pet.screen == SCR_DEAD) {
      pet_tick_anim(&pet);
      ui_draw(&pet);
      if (poll_ms(UI_FRAME_MS)) continue;

      /* Full frame with no input — advance idle on Home/Sleep */
      if (pet.display_on &&
          (pet.screen == SCR_HOME || pet.screen == SCR_SLEEP)) {
        idle_ms = (uint16_t)(idle_ms + UI_FRAME_MS);
        if (idle_ms >= DISPLAY_OFF_MS) pet.display_on = 0;
      }
      if (pet.display_on || pet.screen == SCR_BOOT || pet.screen == SCR_DEAD)
        continue;
    }

    /* Display off: deep sleep; WDT = life only; button = wake UI */
    oled_off();
    pcint_btns_on();
    sleep_until_wdt_or_btn();
    pcint_btns_off();

    b = read_btns();
    edge = (uint8_t)(b & ~prev_btns);
    prev_btns = b;
    pet.btn_held = b;

    if (edge) {
      /* pet_input wakes display_on and swallows first press */
      if (edge & 1) pet_input(&pet, BTN_LEFT, 1);
      if (edge & 2) pet_input(&pet, BTN_SEL, 1);
      if (edge & 4) pet_input(&pet, BTN_RIGHT, 1);
      idle_ms = 0;
      oled_on();
    } else if (wdt_fired) {
      wdt_fired = 0;
      life_tick_and_save();
      /* stay display_on == 0 */
    }
  }
  return 0;
}
