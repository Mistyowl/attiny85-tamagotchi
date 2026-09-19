# firmware — ATtiny85, compile + size without upload
# Usage:  make -C firmware
#         make -C firmware size

MCU      = attiny85
F_CPU    = 8000000UL
CC       = avr-gcc
OBJCOPY  = avr-objcopy
SIZE     = avr-size

CFLAGS   = -mmcu=$(MCU) -DF_CPU=$(F_CPU) -Os -std=gnu11 -Wall -Wextra
CFLAGS  += -ffunction-sections -fdata-sections -mcall-prologues
LDFLAGS  = -mmcu=$(MCU) -Wl,--gc-sections -Wl,--relax

SRC_DIR  = src
BUILD    = build
SRCS     = $(SRC_DIR)/main.c $(SRC_DIR)/pet.c $(SRC_DIR)/save.c $(SRC_DIR)/oled.c $(SRC_DIR)/ui.c $(SRC_DIR)/game.c $(SRC_DIR)/buzz.c $(SRC_DIR)/sprites.c
OBJS     = $(BUILD)/main.o $(BUILD)/pet.o $(BUILD)/save.o $(BUILD)/oled.o $(BUILD)/ui.o $(BUILD)/game.o $(BUILD)/buzz.o $(BUILD)/sprites.o
ELF      = $(BUILD)/zhorik.elf
HEX      = $(BUILD)/zhorik.hex

.PHONY: all size clean hex

all: $(ELF) size

$(BUILD):
	@if not exist $(BUILD) mkdir $(BUILD)

$(BUILD)/main.o: $(SRC_DIR)/main.c | $(BUILD)
	$(CC) $(CFLAGS) -c $< -o $@
$(BUILD)/pet.o: $(SRC_DIR)/pet.c | $(BUILD)
	$(CC) $(CFLAGS) -c $< -o $@
$(BUILD)/save.o: $(SRC_DIR)/save.c | $(BUILD)
	$(CC) $(CFLAGS) -c $< -o $@
$(BUILD)/oled.o: $(SRC_DIR)/oled.c | $(BUILD)
	$(CC) $(CFLAGS) -c $< -o $@
$(BUILD)/ui.o: $(SRC_DIR)/ui.c | $(BUILD)
	$(CC) $(CFLAGS) -c $< -o $@
$(BUILD)/game.o: $(SRC_DIR)/game.c | $(BUILD)
	$(CC) $(CFLAGS) -c $< -o $@
$(BUILD)/buzz.o: $(SRC_DIR)/buzz.c | $(BUILD)
	$(CC) $(CFLAGS) -c $< -o $@
$(BUILD)/sprites.o: $(SRC_DIR)/sprites.c | $(BUILD)
	$(CC) $(CFLAGS) -c $< -o $@

$(ELF): $(OBJS)
	$(CC) $(LDFLAGS) -o $@ $(OBJS)

hex: $(ELF)
	$(OBJCOPY) -O ihex -R .eeprom $(ELF) $(HEX)

size: $(ELF)
	@echo.
	@echo === avr-size (Flash ~ text+data , RAM ~ data+bss) ===
	$(SIZE) $(ELF)
	$(SIZE) -A $(ELF)

clean:
	@if exist $(BUILD) rmdir /s /q $(BUILD)
