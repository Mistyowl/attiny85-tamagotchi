/*
 * Page-based UI: one 128-byte page buffer in SRAM (not full framebuffer).
 */
#include "ui.h"
#include "oled.h"
#include <avr/pgmspace.h>
#include <string.h>

#define PADDLE_W_UI 24

static uint8_t page[128];

static const uint8_t font5x7[][5] PROGMEM = {
    {0x3e, 0x51, 0x49, 0x45, 0x3e},
    {0x00, 0x42, 0x7f, 0x40, 0x00},
    {0x42, 0x61, 0x51, 0x49, 0x46},
    {0x21, 0x41, 0x45, 0x4b, 0x31},
    {0x18, 0x14, 0x12, 0x7f, 0x10},
    {0x27, 0x45, 0x45, 0x45, 0x39},
    {0x3c, 0x4a, 0x49, 0x49, 0x30},
    {0x01, 0x71, 0x09, 0x05, 0x03},
    {0x36, 0x49, 0x49, 0x49, 0x36},
    {0x06, 0x49, 0x49, 0x29, 0x1e},
};

static void page_clear(void) { memset(page, 0, sizeof(page)); }

static void page_pixel(uint8_t x, uint8_t y_in_page, uint8_t on) {
  if (x >= 128 || y_in_page >= 8) return;
  if (on) page[x] |= (uint8_t)(1 << y_in_page);
  else page[x] &= (uint8_t)~(1 << y_in_page);
}

static void page_fill(uint8_t x, uint8_t y, uint8_t w, uint8_t h) {
  for (uint8_t yy = y; yy < y + h && yy < 8; yy++)
    for (uint8_t xx = x; xx < x + w && xx < 128; xx++) page_pixel(xx, yy, 1);
}

static void page_glyph(uint8_t x, char ch) {
  if (ch < '0' || ch > '9') return;
  const uint8_t *g = font5x7[ch - '0'];
  for (uint8_t col = 0; col < 5; col++) {
    uint8_t bits = pgm_read_byte(&g[col]);
    for (uint8_t row = 0; row < 7; row++)
      if (bits & (1 << row)) page_pixel((uint8_t)(x + col), row, 1);
  }
}

static void page_num(uint8_t x, uint8_t v) {
  page_glyph(x, (char)('0' + (v / 100) % 10));
  page_glyph((uint8_t)(x + 6), (char)('0' + (v / 10) % 10));
  page_glyph((uint8_t)(x + 12), (char)('0' + v % 10));
}

static const uint8_t pet16[2][32] PROGMEM = {
    {0x00, 0x00, 0x03, 0x0F, 0x1F, 0x3F, 0x3F, 0x7F, 0x7F, 0x7F, 0x3F, 0x3F, 0x1F,
     0x0F, 0x03, 0x00, 0x00, 0x00, 0xC0, 0xF0, 0xF8, 0xFC, 0xFC, 0xFE, 0xFE, 0xFE,
     0xFC, 0xFC, 0xF8, 0xF0, 0xC0, 0x00},
    {0x00, 0x00, 0x07, 0x1F, 0x3F, 0x3F, 0x7F, 0x7F, 0x7F, 0x7F, 0x3F, 0x3F, 0x1F,
     0x07, 0x00, 0x00, 0x00, 0x00, 0xE0, 0xF8, 0xFC, 0xFC, 0xFE, 0xFE, 0xFE, 0xFE,
     0xFC, 0xFC, 0xF8, 0xE0, 0x00, 0x00}};

void ui_draw(const Pet *p) {
  if (!p->display_on && p->screen != SCR_DEAD && p->screen != SCR_BOOT) {
    oled_off();
    return;
  }
  oled_on();

  for (uint8_t pg = 0; pg < 8; pg++) {
    page_clear();

    if (p->screen == SCR_BOOT && pg == 3) {
      page_fill(34, 2, 60, 4);
    } else if (p->screen == SCR_DEAD && pg == 5) {
      page_num(50, 0);
    } else if (p->screen == SCR_GAME) {
      if (pg == 0) page_num(100, p->mg_hits);
      if (p->mg_kind == 2) {
        if (pg == 6) page_fill(0, 2, 128, 2);
        if (pg == 5) {
          uint8_t ox = (uint8_t)(p->ball_x < 0 ? 0 : (p->ball_x > 120 ? 120 : p->ball_x));
          page_fill(ox, 0, 6, 8);
          uint8_t py = (uint8_t)(p->ball_y > 7 ? 0 : 7 - (uint8_t)p->ball_y);
          page_fill(18, py, 12, 6);
        }
      } else {
        if (pg == 1 && p->mg_kind == 1) {
          for (uint8_t i = 0; i < 8; i++)
            if (p->bricks & (1 << i)) page_fill((uint8_t)(i * 16 + 1), 2, 14, 4);
        }
        if (pg == 1 && p->mg_kind == 0) page_fill(p->ai_pad, 4, PADDLE_W_UI, 3);
        if (pg == 7) page_fill(p->paddle, 0, PADDLE_W_UI, 3);
        if (pg == (uint8_t)(p->ball_y / 8))
          page_fill((uint8_t)p->ball_x, (uint8_t)(p->ball_y & 7), 3, 3);
      }
    } else if (p->screen == SCR_HOME || p->screen == SCR_SLEEP) {
      if (pg == 0) {
        page_num(10, (uint8_t)(100 - p->hunger));
        page_num(70, p->happiness);
      }
      if (pg == 1) {
        page_num(10, p->energy);
        page_num(70, p->health);
      }
      if (pg == 2 || pg == 3) {
        uint8_t fr = p->anim & 1;
        for (uint8_t i = 0; i < 16; i++) {
          uint8_t b = pgm_read_byte(&pet16[fr][i + (pg == 3 ? 16 : 0)]);
          page[48 + i] = b;
        }
      }
      if (pg == 7) {
        for (uint8_t i = 0; i < 4; i++) {
          uint8_t x = (uint8_t)(20 + i * 28);
          page_fill(x, 2, 8, 4);
          if (i == p->menu) page_fill((uint8_t)(x - 2), 0, 12, 1);
        }
      }
    }

    oled_show_page(pg, page);
  }
}
