#ifndef SPRITES_H
#define SPRITES_H

#include <stdint.h>
#include <avr/pgmspace.h>

#define SPRITE_W 32
#define SPRITE_H 32

/** XY-cropped row-major PROGMEM bitmap (empty rows/cols omitted). */
typedef struct {
  uint8_t x0; /* pixel offset within original 32 */
  uint8_t y0; /* row offset within full 32×32 */
  uint8_t w;  /* width in pixels (8..32, multiple of 8) */
  uint8_t h;  /* stored height in rows */
  const uint8_t *bits; /* PROGMEM, h*(w/8) bytes */
} SpriteDesc;

void sprite_stage(uint8_t stage, uint8_t frame, SpriteDesc *out);
void sprite_dead(SpriteDesc *out);
void sprite_wing_l(SpriteDesc *out);
void sprite_wing_r(SpriteDesc *out);

#endif
