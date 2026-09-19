#include "game.h"

#define PADDLE_W 24
#define BALL 3
#define TOP 12
#define PADDLE_Y 56
#define AI_Y 12
#define PHASE_READY 0
#define PHASE_PLAY  1
#define PHASE_PAUSE 2

uint16_t game_rnd(Pet *p) {
  uint16_t s = p->mg_seed ? p->mg_seed : 1;
  s = (uint16_t)(s * 1103515245u + 12345u);
  p->mg_seed = s;
  return s;
}

static void finish(Pet *p) {
  uint8_t happy = 6;
  if (p->mg_kind == 0) happy = (uint8_t)(4 + p->mg_hits / 5);
  else happy = (uint8_t)(6 + (p->mg_hits > 10 ? 10 : p->mg_hits));
  p->happiness = pet_clamp((int16_t)p->happiness + happy);
  p->energy = pet_clamp((int16_t)p->energy - 6 - p->mg_miss * 2);
  p->care += 1 + (p->mg_hits >> 1);
  p->screen = SCR_HOME;
  p->feedback = 4;
}

static void serve_pong(Pet *p) {
  p->ball_x = p->paddle + PADDLE_W / 2;
  p->ball_y = PADDLE_Y - 8;
  p->ball_dx = (game_rnd(p) & 1) ? 1 : -1;
  p->ball_dy = -1;
  p->mg_phase = PHASE_PLAY;
}

void game_start(Pet *p, uint8_t kind) {
  p->screen = SCR_GAME;
  p->mg_kind = kind > 2 ? 0 : kind;
  p->mg_hits = 0;
  p->mg_miss = 0;
  p->mg_flash = 0;
  p->mg_seed ^= (uint16_t)(p->age_ticks ^ (p->care << 3) ^ 0xBEEF);
  p->paddle = 52;
  p->ai_pad = 52;
  p->bricks = 0xFF;
  p->display_on = 1;
  if (p->mg_kind == 2) {
    p->ball_x = 110;
    p->ball_y = 0;
    p->ball_dy = 0;
    p->mg_phase = PHASE_PLAY;
  } else {
    /* Pong + Arkanoid share auto-serve */
    serve_pong(p);
  }
}

static void move_ball(Pet *p) {
  p->ball_x += p->ball_dx;
  p->ball_y += p->ball_dy;
  if (p->ball_x < 2) {
    p->ball_x = 2;
    p->ball_dx = 1;
  }
  if (p->ball_x > 128 - BALL - 2) {
    p->ball_x = 128 - BALL - 2;
    p->ball_dx = -1;
  }
}

static void move_ball_ark(Pet *p) {
  move_ball(p);
  if (p->ball_y < TOP) {
    p->ball_y = TOP;
    p->ball_dy = 1;
  }
}

static uint8_t paddle_hit(const Pet *p) {
  return p->ball_y + BALL >= PADDLE_Y && p->ball_y <= PADDLE_Y + 4 &&
         p->ball_x + BALL >= p->paddle && p->ball_x <= p->paddle + PADDLE_W;
}

static uint8_t ai_hit(const Pet *p) {
  return p->ball_y <= AI_Y + 4 && p->ball_y + BALL >= AI_Y &&
         p->ball_x + BALL >= p->ai_pad && p->ball_x <= p->ai_pad + PADDLE_W;
}

static void steer_ai(Pet *p) {
  int16_t center = (int16_t)(p->ai_pad + PADDLE_W / 2);
  int16_t ball = p->ball_x + BALL / 2;
  if (ball + 1 < center && p->ai_pad > 2) p->ai_pad = (uint8_t)(p->ai_pad - 2);
  else if (ball > center + 1 && p->ai_pad < 128 - PADDLE_W - 2)
    p->ai_pad = (uint8_t)(p->ai_pad + 2);
}

static void tick_pong(Pet *p) {
  if (p->mg_phase != PHASE_PLAY) return;
  steer_ai(p);
  move_ball(p);
  if (ai_hit(p) && p->ball_dy < 0) {
    p->ball_y = AI_Y + 4;
    p->ball_dy = 1;
  }
  if (paddle_hit(p) && p->ball_dy > 0) {
    p->ball_y = PADDLE_Y - BALL - 1;
    p->ball_dy = -1;
    p->mg_hits++;
    if (p->mg_hits >= 20) finish(p);
  }
  if (p->ball_y < 4) {
    p->mg_hits++;
    if (p->mg_hits >= 20) finish(p);
    else serve_pong(p);
  }
  if (p->ball_y > 64) {
    p->mg_miss++;
    if (p->mg_miss >= 3) finish(p);
    else serve_pong(p);
  }
}

static void tick_ark(Pet *p) {
  if (p->mg_phase != PHASE_PLAY) return;
  move_ball_ark(p);
  if (p->ball_y >= 14 && p->ball_y <= 22 && p->bricks) {
    uint8_t idx = (uint8_t)((uint16_t)p->ball_x >> 4);
    if (idx > 7) idx = 7;
    uint8_t bit = (uint8_t)(1 << idx);
    if (p->bricks & bit) {
      p->bricks = (uint8_t)(p->bricks & ~bit);
      p->ball_dy = (int8_t)-p->ball_dy;
      if (!p->ball_dy) p->ball_dy = 1;
      p->mg_hits++;
      if (!p->bricks) finish(p);
    }
  }
  if (paddle_hit(p) && p->ball_dy > 0) {
    p->ball_y = PADDLE_Y - BALL - 1;
    p->ball_dy = -1;
  }
  if (p->ball_y > 64) {
    p->mg_miss++;
    if (p->mg_miss >= 3) finish(p);
    else serve_pong(p);
  }
}

static void tick_runner(Pet *p) {
  uint8_t spd = (uint8_t)(2 + (p->mg_hits >> 1));
  if (spd > 5) spd = 5;
  p->ball_x -= (int16_t)spd;

  /* ai_pad reused as hover frames at apex */
  if (p->ai_pad) {
    p->ai_pad--;
    p->ball_dy = 0;
  } else if (p->ball_dy || p->ball_y > 0) {
    uint8_t rising = p->ball_dy > 0;
    p->ball_y += p->ball_dy;
    if (rising)
      p->ball_dy -= 1;
    else if ((p->ball_x & 1) == 0)
      p->ball_dy -= 1; /* slower fall */
    if (rising && p->ball_dy <= 0 && p->ball_y >= 9) {
      p->ball_dy = 0;
      p->ai_pad = 12; /* hover */
    }
    if (p->ball_y > 26) {
      p->ball_y = 26;
      if (p->ball_dy > 0) p->ball_dy = 0;
    }
    if (p->ball_y <= 0) {
      p->ball_y = 0;
      p->ball_dy = 0;
      p->ai_pad = 0;
    }
  }

  if (!p->mg_flash) {
    uint8_t oh = (uint8_t)(9 + p->mg_hits / 3);
    if (oh > 16) oh = 16;
    uint8_t need = (uint8_t)(oh > 5 ? oh - 5 : 5);
    if (p->ball_x < 30 && p->ball_x + 6 > 18 && p->ball_y < need) {
      p->mg_miss++;
      p->mg_flash = 14;
      p->ball_x = (int16_t)(105 + (game_rnd(p) & 31));
      if (p->mg_miss >= 3) finish(p);
      return;
    }
  }
  if (p->ball_x < -10) {
    p->mg_hits++;
    p->mg_flash = 3;
    p->ball_x = (int16_t)(105 + (game_rnd(p) & 31));
    if (p->mg_hits >= 12) finish(p);
  }
}

void game_tick(Pet *p, uint8_t dt_ms) {
  (void)dt_ms;
  if (p->mg_flash) p->mg_flash--;
  /* Held ◀/▶: ~4px / 20ms ≈ 200 px/s, ahead of ball */
  if (p->mg_kind != 2) {
    if ((p->btn_held & 1) && p->paddle > 4) {
      p->paddle = (uint8_t)(p->paddle - 4);
      if (p->mg_phase == PHASE_READY) p->ball_x = p->paddle + PADDLE_W / 2;
    }
    if ((p->btn_held & 4) && p->paddle < 128 - PADDLE_W - 2) {
      uint8_t next = (uint8_t)(p->paddle + 4);
      if (next > 128 - PADDLE_W - 2) next = (uint8_t)(128 - PADDLE_W - 2);
      p->paddle = next;
      if (p->mg_phase == PHASE_READY) p->ball_x = p->paddle + PADDLE_W / 2;
    }
  }
  if (p->mg_kind == 0) tick_pong(p);
  else if (p->mg_kind == 1) tick_ark(p);
  else tick_runner(p);
}

void game_input(Pet *p, uint8_t btn) {
  if (p->mg_kind == 2) {
    if (p->ball_y <= 0 && !p->ai_pad) {
      p->ball_dy = 5;
      p->ai_pad = 0;
    }
    return;
  }
  if (btn == BTN_SEL && p->mg_kind == 1 && p->mg_phase != PHASE_READY) {
    p->mg_phase = (p->mg_phase == PHASE_PLAY) ? PHASE_PAUSE : PHASE_PLAY;
  }
}
