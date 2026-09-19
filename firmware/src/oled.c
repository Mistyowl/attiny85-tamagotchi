/*
 * Minimal SoftI2C + SSD1306 driver for ATtiny85 (page mode, no full FB).
 * SDA=PB0 SCL=PB2 — matches constraints.md
 */
#include "oled.h"
#include "pins.h"
#include <util/delay.h>
#include <avr/pgmspace.h>
#include <string.h>

#define OLED_ADDR 0x3C

static void i2c_delay(void) { _delay_us(2); }

static inline void sda_high(void) { DDRB &= ~(1 << PIN_SDA); }
static inline void sda_low(void) {
  DDRB |= (1 << PIN_SDA);
  PORTB &= ~(1 << PIN_SDA);
}
static inline void scl_high(void) { DDRB &= ~(1 << PIN_SCL); }
static inline void scl_low(void) {
  DDRB |= (1 << PIN_SCL);
  PORTB &= ~(1 << PIN_SCL);
}

static void i2c_start(void) {
  sda_high();
  scl_high();
  i2c_delay();
  sda_low();
  i2c_delay();
  scl_low();
}

static void i2c_stop(void) {
  sda_low();
  i2c_delay();
  scl_high();
  i2c_delay();
  sda_high();
  i2c_delay();
}

static void i2c_write(uint8_t b) {
  for (uint8_t i = 0; i < 8; i++) {
    if (b & 0x80) sda_high();
    else sda_low();
    i2c_delay();
    scl_high();
    i2c_delay();
    scl_low();
    b <<= 1;
  }
  sda_high(); /* ACK bit from slave — ignore */
  i2c_delay();
  scl_high();
  i2c_delay();
  scl_low();
}

static void oled_cmd(uint8_t c) {
  i2c_start();
  i2c_write((uint8_t)(OLED_ADDR << 1));
  i2c_write(0x00);
  i2c_write(c);
  i2c_stop();
}

/** Send a block of SSD1306 commands in one I2C transaction. */
static void oled_cmds(const uint8_t *cmds, uint8_t n) {
  i2c_start();
  i2c_write((uint8_t)(OLED_ADDR << 1));
  i2c_write(0x00);
  for (uint8_t i = 0; i < n; i++) i2c_write(pgm_read_byte(&cmds[i]));
  i2c_stop();
}

void oled_init(void) {
  PORTB |= (1 << PIN_SDA) | (1 << PIN_SCL); /* pull-ups when input */
  _delay_ms(50);
  static const uint8_t init[] PROGMEM = {
      0xAE, 0xD5, 0x80, 0xA8, 0x3F, 0xD3, 0x00, 0x40, 0x8D, 0x14,
      0x20, 0x00, 0xA1, 0xC8, 0xDA, 0x12, 0x81, 0xCF, 0xD9, 0xF1,
      0xDB, 0x40, 0xA4, 0xA6, 0xAF};
  oled_cmds(init, sizeof(init));
  oled_clear();
}

void oled_off(void) { oled_cmd(0xAE); }
void oled_on(void) { oled_cmd(0xAF); }

void oled_set_cursor(uint8_t page, uint8_t col) {
  uint8_t cmds[3];
  cmds[0] = (uint8_t)(0xB0 | (page & 7));
  cmds[1] = (uint8_t)(0x00 | (col & 0x0F));
  cmds[2] = (uint8_t)(0x10 | (col >> 4));
  i2c_start();
  i2c_write((uint8_t)(OLED_ADDR << 1));
  i2c_write(0x00);
  i2c_write(cmds[0]);
  i2c_write(cmds[1]);
  i2c_write(cmds[2]);
  i2c_stop();
}

void oled_write_data(const uint8_t *data, uint8_t len) {
  i2c_start();
  i2c_write((uint8_t)(OLED_ADDR << 1));
  i2c_write(0x40);
  for (uint8_t i = 0; i < len; i++) i2c_write(data[i]);
  i2c_stop();
}

void oled_show_page(uint8_t page, const uint8_t *buf128) {
  oled_set_cursor(page, 0);
  oled_write_data(buf128, 128);
}

void oled_clear(void) {
  uint8_t z[16];
  memset(z, 0, sizeof(z));
  for (uint8_t page = 0; page < 8; page++) {
    oled_set_cursor(page, 0);
    for (uint8_t n = 0; n < 8; n++) oled_write_data(z, 16);
  }
}
