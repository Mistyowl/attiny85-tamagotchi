#ifndef OLED_H
#define OLED_H

#include <stdint.h>

void oled_init(void);
void oled_off(void);
void oled_on(void);
void oled_clear(void);
void oled_set_cursor(uint8_t page, uint8_t col);
void oled_write_data(const uint8_t *data, uint8_t len);
/* Draw one 128-wide page (8 px tall) from buffer */
void oled_show_page(uint8_t page, const uint8_t *buf128);

#endif
