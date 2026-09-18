#include "save.h"
#include <avr/eeprom.h>

uint8_t save_crc8(const uint8_t *data, uint8_t len) {
  uint8_t crc = 0;
  for (uint8_t i = 0; i < len; i++) {
    crc ^= data[i];
    for (uint8_t b = 0; b < 8; b++) {
      crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x07) : (uint8_t)(crc << 1);
    }
  }
  return crc;
}

void save_write(const Pet *p) {
  uint8_t buf[SAVE_SIZE];
  buf[0] = SAVE_MAGIC;
  buf[1] = SAVE_VERSION;
  buf[2] = p->stage;
  buf[3] = p->hunger;
  buf[4] = p->happiness;
  buf[5] = p->energy;
  buf[6] = p->health;
  buf[7] = p->flags;
  buf[8] = (uint8_t)(p->age_ticks);
  buf[9] = (uint8_t)(p->age_ticks >> 8);
  buf[10] = (uint8_t)(p->age_ticks >> 16);
  buf[11] = (uint8_t)(p->age_ticks >> 24);
  buf[12] = (uint8_t)(p->care);
  buf[13] = (uint8_t)(p->care >> 8);
  buf[14] = (uint8_t)(p->care >> 16);
  buf[15] = (uint8_t)(p->care >> 24);
  buf[16] = save_crc8(buf, 16);
  eeprom_update_block(buf, (void *)0, SAVE_SIZE);
}

uint8_t save_read(Pet *p) {
  uint8_t buf[SAVE_SIZE];
  eeprom_read_block(buf, (const void *)0, SAVE_SIZE);
  if (buf[0] != SAVE_MAGIC || buf[1] != SAVE_VERSION) return 0;
  if (save_crc8(buf, 16) != buf[16]) return 0;
  pet_reset(p);
  p->stage = buf[2];
  p->hunger = buf[3];
  p->happiness = buf[4];
  p->energy = buf[5];
  p->health = buf[6];
  p->flags = buf[7];
  p->age_ticks = (uint32_t)buf[8] | ((uint32_t)buf[9] << 8) |
                 ((uint32_t)buf[10] << 16) | ((uint32_t)buf[11] << 24);
  p->care = (uint32_t)buf[12] | ((uint32_t)buf[13] << 8) |
            ((uint32_t)buf[14] << 16) | ((uint32_t)buf[15] << 24);
  p->screen = (p->health == 0) ? SCR_DEAD : SCR_HOME;
  return 1;
}
