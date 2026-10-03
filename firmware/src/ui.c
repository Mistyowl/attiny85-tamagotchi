/*
 * Page-based UI: one 128-byte page buffer in SRAM (not full framebuffer).
 * Layout matches shared/pet.ts (Home / Sleep / Dead). Minigame titles deferred.
 */
#include "ui.h"
#include "oled.h"
#include "sprites.h"
#include "pet.h"
#include "ui_assets.h"
#include <avr/pgmspace.h>
#include <string.h>

#define PADDLE_W_UI 24
#define PET_X 48
#define DEATH_WING_SIDE 10
#define SLEEPY_ENERGY 30
#define VERY_SLEEPY_ENERGY 15

static uint8_t page[128];

static void page_clear(void) { memset(page, 0, sizeof(page)); }

static void page_fill(uint8_t x, uint8_t y, uint8_t w, uint8_t h) {
  for (uint8_t yy = y; yy < y + h && yy < 8; yy++) {
    uint8_t bit = (uint8_t)(1u << yy);
    for (uint8_t xx = x; xx < x + w && xx < 128; xx++) page[xx] |= bit;
  }
}

/** MSB-left row bitmap from PROGMEM → absolute screen coords. */
static void page_rows(uint8_t pg, int16_t x, int16_t y, uint8_t w, uint8_t h,
                      const uint8_t *data) {
  uint8_t stride = (uint8_t)((w + 7) >> 3);
  for (uint8_t row = 0; row < h; row++) {
    int16_t yy = (int16_t)(y + row);
    if (yy < 0 || yy >= 64) continue;
    if ((uint8_t)(yy >> 3) != pg) continue;
    uint8_t bit = (uint8_t)(1u << (yy & 7));
    for (uint8_t col = 0; col < stride; col++) {
      uint8_t b = pgm_read_byte(&data[(uint16_t)row * stride + col]);
      if (!b) continue;
      for (uint8_t bx = 0; bx < 8; bx++) {
        uint8_t sx = (uint8_t)((col << 3) + bx);
        if (sx >= w) break;
        if (!(b & (uint8_t)(0x80u >> bx))) continue;
        int16_t px = (int16_t)(x + sx);
        if ((uint16_t)px < 128) page[(uint8_t)px] |= bit;
      }
    }
  }
}

/** Compact bar: 1px frame + fill (approx w*fill/100). */
static void page_hbar(uint8_t pg, uint8_t x, uint8_t y, uint8_t w, uint8_t fill) {
  uint16_t num = (uint16_t)w * fill + 50;
  uint8_t filled = 0;
  while (num >= 100) {
    num = (uint16_t)(num - 100);
    filled++;
  }
  for (uint8_t dy = 0; dy < 5; dy++) {
    int16_t yy = (int16_t)(y + dy);
    if (yy < 0 || yy >= 64 || (uint8_t)(yy >> 3) != pg) continue;
    uint8_t bit = (uint8_t)(1u << (yy & 7));
    uint8_t edge = (uint8_t)(dy == 0 || dy == 4);
    for (uint8_t i = 0; i < w; i++) {
      uint8_t xx = (uint8_t)(x + i);
      if (edge || i == 0 || i == (uint8_t)(w - 1) || (i && i < filled && i + 1 < w))
        page[xx] |= bit;
    }
  }
}

static void page_glyph_id(uint8_t pg, int16_t x, int16_t y, uint8_t gid) {
  for (uint8_t col = 0; col < UI_GLYPH_W; col++) {
    uint8_t bits = pgm_read_byte(&ui_font[gid][col]);
    for (uint8_t row = 0; row < UI_GLYPH_H; row++) {
      if (!(bits & (uint8_t)(1 << row))) continue;
      int16_t yy = (int16_t)(y + row);
      int16_t xx = (int16_t)(x + col);
      if (yy < 0 || yy >= 64 || (uint16_t)xx >= 128) continue;
      if ((uint8_t)(yy >> 3) != pg) continue;
      page[(uint8_t)xx] |= (uint8_t)(1u << (yy & 7));
    }
  }
}

static void page_text(uint8_t pg, int16_t x, int16_t y, const uint8_t *s) {
  for (;;) {
    uint8_t gid = pgm_read_byte(s++);
    if (gid == UI_STR_END) break;
    page_glyph_id(pg, x, y, gid);
    x = (int16_t)(x + UI_CHAR_ADV);
  }
}

static void page_num(uint8_t pg, int16_t x, int16_t y, uint8_t v) {
  uint8_t h = 0, t = 0;
  if (v >= 100) {
    h = 1;
    v = (uint8_t)(v - 100);
  }
  while (v >= 10) {
    v = (uint8_t)(v - 10);
    t++;
  }
  page_glyph_id(pg, x, y, (uint8_t)(UI_GLYPH_DIGIT0 + h));
  page_glyph_id(pg, (int16_t)(x + UI_CHAR_ADV), y, (uint8_t)(UI_GLYPH_DIGIT0 + t));
  page_glyph_id(pg, (int16_t)(x + 2 * UI_CHAR_ADV), y, (uint8_t)(UI_GLYPH_DIGIT0 + v));
}

static void page_bm(uint8_t pg, int16_t x, int16_t y, const SpriteDesc *s) {
  page_rows(pg, (int16_t)(x + s->x0), (int16_t)(y + s->y0), s->w, s->h, s->bits);
}

static const uint8_t *menu_label(uint8_t menu) {
  if (menu == 1) return UI_STR_IGRA;
  if (menu == 2) return UI_STR_SON;
  if (menu == 3) return UI_STR_LEK;
  return UI_STR_EDA;
}

void ui_draw(const Pet *p) {
  if (!p->display_on && p->screen != SCR_DEAD && p->screen != SCR_BOOT) {
    oled_off();
    return;
  }
  oled_on();

  for (uint8_t pg = 0; pg < 8; pg++) {
    page_clear();

    if (p->screen == SCR_BOOT) {
      if (pg == 3) page_fill(34, 2, 60, 4);
    } else if (p->screen == SCR_DEAD) {
      int16_t y = (int16_t)(8 - (int16_t)p->anim * 2);
      if (y > -32) {
        uint8_t baby = (p->stage == ST_BABY);
        int16_t wing_base = (int16_t)(y + (baby ? 16 : 8));
        int16_t ly = (int16_t)(wing_base - ((p->anim & 1) ? 2 : 0));
        int16_t ry = (int16_t)(wing_base - ((p->anim & 1) ? 0 : 2));
        SpriteDesc body, wl, wr;
        if (baby) sprite_dead(&body);
        else sprite_stage(p->stage, 0, &body);
        sprite_wing_l(&wl);
        sprite_wing_r(&wr);
        page_bm(pg, PET_X - DEATH_WING_SIDE, ly, &wl);
        page_bm(pg, PET_X + DEATH_WING_SIDE, ry, &wr);
        page_bm(pg, PET_X, y, &body);
      }
      if (y <= -24) {
        page_text(pg, ui_center_x(3), 40, UI_STR_UVY);
        page_text(pg, ui_center_x(3), 52, UI_STR_ZHMI);
      }
    } else if (p->screen == SCR_GAME) {
      page_num(pg, 110, 1, p->mg_hits);
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
        if (p->ball_y >= 0 && pg == (uint8_t)((uint16_t)p->ball_y >> 3))
          page_fill((uint8_t)p->ball_x, (uint8_t)(p->ball_y & 7), 3, 3);
      }
    } else if (p->screen == SCR_SLEEP) {
      SpriteDesc spr;
      sprite_stage(p->stage, (p->stage == ST_EGG) ? 0 : 1, &spr);
      page_bm(pg, PET_X, 10, &spr);
      page_rows(pg, 71, 13, 8, 8, ui_icons[UI_ICON_ZZZ]);
      page_rows(pg, 82, 6, 8, 8, ui_icons[UI_ICON_ZZZ]);
      page_text(pg, ui_center_x(3), 42, UI_STR_SON);
      page_hbar(pg, 8, 56, 112, p->energy);
    } else if (p->screen == SCR_HOME) {
      int16_t pet_y = p->feedback ? 6 : 8;
      SpriteDesc spr;
      if ((p->flags & FLAG_DIRTY) && p->feedback)
        sprite_poop_back(p->stage, &spr);
      else
        sprite_stage(p->stage, p->anim & 1, &spr);
      page_bm(pg, PET_X, pet_y, &spr);

      if (p->stage != ST_EGG && p->energy <= SLEEPY_ENERGY) {
        page_rows(pg, 71, (int16_t)(pet_y + 5), 8, 8, ui_icons[UI_ICON_ZZZ]);
        if (p->energy <= VERY_SLEEPY_ENERGY)
          page_rows(pg, 82, pet_y, 8, 8, ui_icons[UI_ICON_ZZZ]);
      }

      {
        uint8_t vals[4] = {(uint8_t)(100 - p->hunger), p->happiness, p->energy, p->health};
        for (uint8_t i = 0; i < 4; i++) {
          uint8_t iy = (uint8_t)(i * 9);
          page_rows(pg, 0, iy, 8, 8, ui_icons[i]);
          page_hbar(pg, 10, (uint8_t)(iy + 1), 24, vals[i]);
        }
      }

      if (p->flags & FLAG_SICK) page_text(pg, 110, 0, UI_STR_BOL);

      if (p->flags & FLAG_DIRTY) {
        page_rows(pg, UI_POOP_X, UI_POOP_Y, UI_POOP_W, UI_POOP_H, ui_poop);
        if (p->feedback) page_text(pg, ui_center_x(9), 42, UI_STR_NADUDONIL);
      }

      {
        const uint8_t *label = menu_label(p->menu);
        uint8_t n = (p->menu == 1) ? 4 : 3;
        uint8_t lx = ui_center_x(n);
        page_text(pg, lx, 52, label);
        /* invert highlight — same as site invertRegion after text */
        for (uint8_t yy = 50; yy < 61; yy++) {
          if ((uint8_t)(yy >> 3) != pg) continue;
          uint8_t bit = (uint8_t)(1u << (yy & 7));
          uint8_t x1 = (uint8_t)(lx + n * 6 + 2);
          for (uint8_t xx = (uint8_t)(lx > 2 ? lx - 2 : 0); xx < x1 && xx < 128; xx++)
            page[xx] ^= bit;
        }
      }
    }

    oled_show_page(pg, page);
  }
}
