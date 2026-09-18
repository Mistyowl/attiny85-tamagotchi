#ifndef GAME_H
#define GAME_H

#include "pet.h"

/* mg_kind: 0=Pong 1=Arkanoid 2=Runner — compile all three for size check */
void game_start(Pet *p, uint8_t kind);
void game_tick(Pet *p, uint8_t dt_ms);
void game_input(Pet *p, uint8_t btn);

#endif
