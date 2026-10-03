/* Auto-exported — run: node scripts/export-ui-assets.mjs */
#ifndef UI_ASSETS_H
#define UI_ASSETS_H

#include <stdint.h>
#include <avr/pgmspace.h>

#define UI_GLYPH_W 5
#define UI_GLYPH_H 7
#define UI_CHAR_ADV 6
#define UI_ICON_W 8
#define UI_ICON_H 8
#define UI_ICON_COUNT 5
#define UI_ICON_HUNGER 0
#define UI_ICON_HAPPY 1
#define UI_ICON_ENERGY 2
#define UI_ICON_HEALTH 3
#define UI_ICON_ZZZ 4
#define UI_POOP_W 14
#define UI_POOP_H 10
#define UI_POOP_X 82
#define UI_POOP_Y 26
#define UI_GLYPH_DIGIT0 0
#define UI_STR_END 0xFF

extern const uint8_t ui_font[][5] PROGMEM;
extern const uint8_t ui_icons[UI_ICON_COUNT][8] PROGMEM;
extern const uint8_t ui_poop[] PROGMEM;

extern const uint8_t UI_STR_EDA[] PROGMEM;
extern const uint8_t UI_STR_IGRA[] PROGMEM;
extern const uint8_t UI_STR_SON[] PROGMEM;
extern const uint8_t UI_STR_LEK[] PROGMEM;
extern const uint8_t UI_STR_BOL[] PROGMEM;
extern const uint8_t UI_STR_NADUDONIL[] PROGMEM;
extern const uint8_t UI_STR_UVY[] PROGMEM;
extern const uint8_t UI_STR_ZHMI[] PROGMEM;

static inline uint8_t ui_text_width(uint8_t nchars) {
  return (uint8_t)(nchars * UI_CHAR_ADV);
}

static inline uint8_t ui_center_x(uint8_t nchars) {
  uint8_t w = ui_text_width(nchars);
  return (uint8_t)((128 - w) / 2);
}

#endif
