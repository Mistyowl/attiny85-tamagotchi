/* ATtiny85 pin map — docs/constraints.md */
#ifndef PINS_H
#define PINS_H

#include <avr/io.h>

#define PIN_SDA   PB0
#define PIN_SCL   PB2
#define PIN_BTN_L PB1
#define PIN_BTN_S PB3
#define PIN_BTN_R PB4
/** Passive piezo (shared with Left — series ~150Ω to piezo→GND). */
#define PIN_BUZZER PIN_BTN_L

#define BTN_MASK ((1 << PIN_BTN_L) | (1 << PIN_BTN_S) | (1 << PIN_BTN_R))

static inline void pins_init(void) {
  DDRB &= ~(BTN_MASK);
  PORTB |= BTN_MASK; /* pull-ups */
}

static inline uint8_t btn_left(void)  { return !(PINB & (1 << PIN_BTN_L)); }
static inline uint8_t btn_sel(void)   { return !(PINB & (1 << PIN_BTN_S)); }
static inline uint8_t btn_right(void) { return !(PINB & (1 << PIN_BTN_R)); }

#endif
