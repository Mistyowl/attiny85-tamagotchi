#ifndef PET_H
#define PET_H

#include <stdint.h>

#define STAT_MAX 100
#define FLAG_SICK     1
#define FLAG_DIRTY    2
#define FLAG_SLEEPING 4

enum {
  ST_EGG = 0,
  ST_BABY,
  ST_CHILD,
  ST_ADULT,
  ST_ADULT_A,
  ST_ADULT_B
};

enum {
  SCR_BOOT = 0,
  SCR_HOME,
  SCR_SLEEP,
  SCR_DEAD,
  SCR_GAME
};

enum { BTN_LEFT = 0, BTN_SEL = 1, BTN_RIGHT = 2 };

typedef struct {
  uint8_t stage;
  uint8_t hunger;
  uint8_t happiness;
  uint8_t energy;
  uint8_t health;
  uint8_t flags;
  uint32_t age_ticks;
  uint32_t care;
  uint8_t screen;
  uint8_t menu;
  uint8_t anim;
  uint8_t boot_ticks;
  uint8_t display_on;
  uint8_t hold_sel;
  uint8_t feedback;
  /* minigame */
  uint8_t mg_kind; /* 0 pong 1 arkanoid 2 runner */
  uint8_t mg_phase;
  uint8_t mg_hits;
  uint8_t mg_miss;
  uint8_t mg_flash;
  uint16_t mg_seed;
  uint8_t paddle;
  int16_t ball_x, ball_y;
  int8_t ball_dx, ball_dy;
  uint8_t bricks;
  uint8_t btn_held;
  uint8_t ai_pad; /* pong opponent paddle x */
} Pet;

void pet_reset(Pet *p);
void pet_tick_life(Pet *p);
void pet_input(Pet *p, uint8_t btn, uint8_t pressed);
void pet_tick_game(Pet *p, uint8_t dt_ms);
void pet_tick_anim(Pet *p);
uint8_t pet_clamp(int16_t v);

#endif
