#ifndef SAVE_H
#define SAVE_H

#include <stdint.h>
#include "pet.h"

#define SAVE_MAGIC   0x54
#define SAVE_VERSION 1
#define SAVE_SIZE    17

uint8_t save_crc8(const uint8_t *data, uint8_t len);
void save_write(const Pet *p);
uint8_t save_read(Pet *p); /* 1 = ok */

#endif
