/** 8×8 UI icons, 1 byte per row (MSB = left). Compact for PROGMEM. */

export const ICON_W = 8;
export const ICON_H = 8;

export enum IconId {
  Feed = 0,
  Play = 1,
  Sleep = 2,
  Medicine = 3,
  Hunger = 4,
  Happy = 5,
  Energy = 6,
  Health = 7,
  Sick = 8,
  Dirty = 9,
  Zzz = 10,
  Hold = 11,
}

/** Row-major 8 bytes each. */
export const ICONS: readonly (readonly number[])[] = [
  // Feed — food (user art)
  [0x0e, 0x19, 0x1d, 0x1f, 0x1e, 0x20, 0xc0, 0x40],
  // Play — games (user art)
  [0x1c, 0x38, 0x3d, 0x2f, 0x17, 0x2e, 0x40, 0x80],
  // Sleep — crescent
  [0x0e, 0x1c, 0x38, 0x30, 0x30, 0x38, 0x1c, 0x0e],
  // Medicine — cross
  [0x18, 0x18, 0x7e, 0x7e, 0x18, 0x18, 0x00, 0x00],
  // Hunger — food (user art)
  [0x0e, 0x19, 0x1d, 0x1f, 0x1e, 0x20, 0xc0, 0x40],
  // Happy — games (user art)
  [0x1c, 0x38, 0x3d, 0x2f, 0x17, 0x2e, 0x40, 0x80],
  // Energy — bolt (user art)
  [0x0f, 0x1e, 0x38, 0x7e, 0x1c, 0x38, 0x60, 0x40],
  // Health — heart (user art)
  [0x6c, 0xfe, 0xfe, 0xfe, 0x7c, 0x38, 0x10, 0x00],
  // Sick — alert
  [0x18, 0x18, 0x18, 0x18, 0x18, 0x00, 0x18, 0x18],
  // Dirty — scribble
  [0x00, 0x44, 0x28, 0x10, 0x28, 0x44, 0x00, 0x00],
  // Z — user art «сон (1)» (LCD ink=0 → inverted)
  [0x00, 0x00, 0xf0, 0x10, 0x20, 0x40, 0x80, 0xf0],
  // Hold — button circle
  [0x3c, 0x42, 0x99, 0xa5, 0xa5, 0x99, 0x42, 0x3c],
];

export function iconPixel(id: number, x: number, y: number): boolean {
  const rows = ICONS[id];
  if (!rows || x < 0 || y < 0 || x >= ICON_W || y >= ICON_H) return false;
  return (rows[y] & (0x80 >> x)) !== 0;
}

export function estimateIconFlashBytes(): number {
  return ICONS.length * ICON_H + BITMAPS.reduce((n, b) => n + b.data.length, 0);
}

/** Wider than 8×8 — e.g. toilet event art. */
export enum BitmapId {
  Poop = 0,
}

export const POOP_W = 14;
export const POOP_H = 10;

/** Home placement: right of pet, above menu. */
export const POOP_X = 82;
export const POOP_Y = 26;

/**
 * Bitmaps: row-major, `bytesPerRow = ceil(w/8)`, MSB = left.
 * Poop 14×10 — user art ("Надудонил").
 */
export const BITMAPS: readonly { w: number; h: number; data: readonly number[] }[] = [
  {
    w: POOP_W,
    h: POOP_H,
    data: [
      0x21, 0xe0, 0x46, 0x20, 0x08, 0x40, 0x1c, 0x48, 0x23, 0xe4, 0x20, 0x10, 0x7f, 0xf8, 0x80, 0x04, 0x80,
      0x04, 0x7f, 0xf8,
    ],
  },
];

export function bitmapPixel(id: number, x: number, y: number): boolean {
  const bm = BITMAPS[id];
  if (!bm || x < 0 || y < 0 || x >= bm.w || y >= bm.h) return false;
  const stride = (bm.w + 7) >> 3;
  const byte = bm.data[y * stride + (x >> 3)];
  if (byte === undefined) return false;
  return (byte & (0x80 >> (x & 7))) !== 0;
}
