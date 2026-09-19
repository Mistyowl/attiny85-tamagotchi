/* Passive piezo on PIN_BUZZER — square-wave bit-bang. */
#ifndef BUZZ_H
#define BUZZ_H

#include <stdint.h>

/** SFX ids — keep in sync with shared/sound.ts `Sfx`. */
enum {
  SFX_NONE = 0,
  SFX_CLICK = 1,
  SFX_FEED = 2,
  SFX_PLAY = 3,
  SFX_SLEEP = 4,
  SFX_MEDICINE = 5,
  SFX_HATCH = 6,
  SFX_EVOLVE = 7,
  SFX_CHIRP = 8,
  SFX_SAD = 9,
  SFX_DIE = 10,
  SFX_WAKE = 11,
  SFX_HIT = 12,  /* emulator only */
  SFX_FART = 13  /* emulator only */
};

void buzz_init(void);
/** Blocking play; restores pin to input+pullup afterward (shared with Left). */
void buzz_play(uint8_t sfx_id);

#endif
