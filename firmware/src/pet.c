#include "pet.h"
#include "game.h"
#include "buzz.h"

#define STAGE_EGG   30
#define STAGE_BABY  180
#define STAGE_CHILD 360
#define SLEEP_GAIN  12
#define SLEEP_WAKE  85

uint8_t pet_clamp(int16_t v) {
  if (v < 0) return 0;
  if (v > STAT_MAX) return STAT_MAX;
  return (uint8_t)v;
}

void pet_reset(Pet *p) {
  p->stage = ST_EGG;
  p->hunger = 20;
  p->happiness = 80;
  p->energy = 90;
  p->health = 100;
  p->flags = 0;
  p->age_ticks = 0;
  p->care = 50;
  p->screen = SCR_BOOT;
  p->menu = 0;
  p->anim = 0;
  p->boot_ticks = 2;
  p->display_on = 1;
  p->hold_sel = 0;
  p->feedback = 0;
  p->mg_kind = 0;
  p->mg_phase = 0;
  p->mg_hits = 0;
  p->mg_miss = 0;
  p->mg_flash = 0;
  p->mg_seed = 1;
  p->paddle = 52;
  p->ball_x = 64;
  p->ball_y = 40;
  p->ball_dx = 0;
  p->ball_dy = 0;
  p->bricks = 0xFF;
  p->btn_held = 0;
  p->ai_pad = 52;
}

static uint8_t menu_count(const Pet *p) {
  return (p->flags & (FLAG_SICK | FLAG_DIRTY)) ? 4 : 3;
}

static void apply_action(Pet *p) {
  if (p->stage == ST_EGG) {
    p->feedback = 2;
    buzz_play(SFX_CLICK);
    return;
  }
  switch (p->menu) {
    case 0: /* feed */
      p->hunger = pet_clamp((int16_t)p->hunger - 25);
      p->care++;
      p->feedback = 3;
      buzz_play(SFX_FEED);
      break;
    case 1: /* play → random minigame (0 pong / 1 ark / 2 runner) */ {
      uint16_t s = p->mg_seed ? p->mg_seed : 1;
      s = (uint16_t)(s * 1103515245u + 12345u);
      s ^= (uint16_t)(p->age_ticks ^ (p->care << 2));
      p->mg_seed = s ? s : 1;
      game_start(p, (uint8_t)(s % 3));
      buzz_play(SFX_PLAY);
      break;
    }
    case 2: /* sleep */
      p->flags |= FLAG_SLEEPING;
      p->screen = SCR_SLEEP;
      p->feedback = 2;
      buzz_play(SFX_SLEEP);
      break;
    case 3: /* med */
      p->flags &= (uint8_t)~(FLAG_SICK | FLAG_DIRTY);
      p->health = pet_clamp((int16_t)p->health + 15);
      p->care++;
      p->feedback = 3;
      buzz_play(SFX_MEDICINE);
      break;
  }
}

void pet_tick_life(Pet *p) {
  if (p->screen == SCR_BOOT) {
    if (p->boot_ticks) p->boot_ticks--;
    else p->screen = SCR_HOME;
    return;
  }
  if (p->screen == SCR_DEAD || p->screen == SCR_GAME) return;

  p->age_ticks++;

  if ((p->flags & FLAG_SLEEPING) || p->screen == SCR_SLEEP) {
    p->energy = pet_clamp((int16_t)p->energy + SLEEP_GAIN);
    p->hunger = pet_clamp((int16_t)p->hunger + 1);
    if (p->energy >= SLEEP_WAKE) {
      p->flags &= (uint8_t)~FLAG_SLEEPING;
      p->screen = SCR_HOME;
    }
  } else {
    p->hunger = pet_clamp((int16_t)p->hunger + 2);
    p->happiness = pet_clamp((int16_t)p->happiness - 1);
    p->energy = pet_clamp((int16_t)p->energy - 1);
    if (p->hunger >= 85 || p->happiness <= 15 || p->energy <= 15)
      p->health = pet_clamp((int16_t)p->health - 2);
    if (p->hunger >= 90 && (p->age_ticks & 7) == 0) p->flags |= FLAG_SICK;
    if (p->happiness <= 20 && (p->age_ticks & 15) == 0) p->flags |= FLAG_DIRTY;
    if (p->flags & FLAG_SICK) p->health = pet_clamp((int16_t)p->health - 1);
  }

  if (p->stage == ST_EGG && p->age_ticks >= STAGE_EGG) {
    p->stage = ST_BABY;
    buzz_play(SFX_HATCH);
  } else if (p->stage == ST_BABY && p->age_ticks >= STAGE_BABY) {
    p->stage = ST_CHILD;
    buzz_play(SFX_EVOLVE);
  } else if (p->stage == ST_CHILD && p->age_ticks >= STAGE_CHILD) {
    if (p->care >= 80) p->stage = ST_ADULT_A;
    else if (p->care <= 30) p->stage = ST_ADULT_B;
    else p->stage = ST_ADULT;
    buzz_play(SFX_EVOLVE);
  }

  if (p->health == 0) {
    if (p->screen != SCR_DEAD) {
      buzz_play(SFX_DIE);
      p->anim = 0;
    }
    p->screen = SCR_DEAD;
    p->flags &= (uint8_t)~FLAG_SLEEPING;
    p->display_on = 1;
  } else if (p->display_on && p->screen == SCR_HOME && p->stage != ST_EGG) {
    if (p->happiness >= 50 && p->health > 30 && (p->age_ticks % 28) == 0)
      buzz_play(SFX_CHIRP);
    else if ((p->hunger >= 85 || p->happiness <= 20) && (p->age_ticks % 36) == 0)
      buzz_play(SFX_SAD);
  }
}

void pet_input(Pet *p, uint8_t btn, uint8_t pressed) {
  if (!pressed) {
    if (btn == BTN_SEL) p->hold_sel = 0;
    return;
  }
  {
    uint8_t was_off = !p->display_on;
    p->display_on = 1;
    if (was_off && p->screen != SCR_BOOT) return;
  }

  if (p->screen == SCR_BOOT) {
    p->boot_ticks = 0;
    p->screen = SCR_HOME;
    return;
  }
  if (p->screen == SCR_DEAD) {
    if (btn == BTN_SEL) {
      p->hold_sel++;
      if (p->hold_sel >= 3) pet_reset(p);
    }
    return;
  }
  if (p->screen == SCR_SLEEP) {
    if (btn == BTN_SEL) {
      p->flags &= (uint8_t)~FLAG_SLEEPING;
      p->screen = SCR_HOME;
      buzz_play(SFX_WAKE);
    }
    return;
  }
  if (p->screen == SCR_GAME) {
    game_input(p, btn);
    return;
  }

  {
    uint8_t n = menu_count(p);
    if (p->menu >= n) p->menu = 0;
    if (btn == BTN_LEFT) {
      p->menu = (uint8_t)((p->menu + n - 1) % n);
      buzz_play(SFX_CLICK);
    } else if (btn == BTN_RIGHT) {
      p->menu = (uint8_t)((p->menu + 1) % n);
      buzz_play(SFX_CLICK);
    } else if (btn == BTN_SEL) apply_action(p);
  }
}

void pet_tick_game(Pet *p, uint8_t dt_ms) {
  if (p->screen == SCR_GAME) game_tick(p, dt_ms);
}

void pet_tick_anim(Pet *p) {
  if (p->screen == SCR_GAME) return;
  if (p->screen == SCR_DEAD) {
    if (p->anim < 28) p->anim++;
    if (p->feedback) p->feedback--;
    return;
  }
  if (!p->display_on && p->screen != SCR_BOOT) return;
  p->anim ^= 1;
  if (p->feedback) p->feedback--;
}
