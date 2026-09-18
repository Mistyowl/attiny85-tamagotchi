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

static Pet pet;
static volatile uint8_t wdt_fired;
static uint8_t prev_btns;

ISR(WDT_vect) { wdt_fired = 1; }

static void wdt_setup_8s(void) {
  cli();
  wdt_reset();
  MCUSR &= ~(1 << WDRF);
  WDTCR |= (1 << WDCE) | (1 << WDE);
  WDTCR = (1 << WDIE) | (1 << WDP3) | (1 << WDP0); /* 8s interrupt */
  sei();
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

/** Poll buttons for ~ms; return 1 if edge seen. */
static uint8_t poll_ms(uint16_t ms) {
  while (ms) {
    uint8_t step = ms > 20 ? 20 : (uint8_t)ms;
    _delay_ms(20);
    ms = ms > 20 ? (uint16_t)(ms - 20) : 0;
    (void)step;

    uint8_t b = read_btns();
    uint8_t edge = (uint8_t)(b & ~prev_btns);
    prev_btns = b;
    pet.btn_held = b;
    if (edge & 1) pet_input(&pet, BTN_LEFT, 1);
    if (edge & 2) pet_input(&pet, BTN_SEL, 1);
    if (edge & 4) pet_input(&pet, BTN_RIGHT, 1);
    if (edge || pet.screen == SCR_GAME || wdt_fired) return 1;
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

  wdt_setup_8s();
  ui_draw(&pet);
  prev_btns = read_btns();

  for (;;) {
    uint8_t b = read_btns();
    uint8_t edge = (uint8_t)(b & ~prev_btns);
    prev_btns = b;
    pet.btn_held = b;

    if (pet.screen == SCR_GAME) {
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

    if (edge & 1) pet_input(&pet, BTN_LEFT, 1);
    if (edge & 2) pet_input(&pet, BTN_SEL, 1);
    if (edge & 4) pet_input(&pet, BTN_RIGHT, 1);

    if (wdt_fired) {
      wdt_fired = 0;
      pet_tick_life(&pet);
      if ((pet.age_ticks % 50) == 0 && pet.age_ticks) save_write(&pet);
    }

    /* OLED on: blink ~650ms, stay awake for UI */
    if (pet.display_on || pet.screen == SCR_BOOT || pet.screen == SCR_DEAD) {
      pet_tick_anim(&pet);
      ui_draw(&pet);
      if (poll_ms(650)) continue;
      continue;
    }

    oled_off();
    sleep_until_wdt_or_btn();
    pet.display_on = 1;
    oled_on();
    wdt_fired = 1;
  }
  return 0;
}
