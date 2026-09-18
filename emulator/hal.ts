import type { RenderCmd } from "../shared/types";
import { SCREEN_H, SCREEN_W } from "../shared/types";
import { getSpriteFrame, spritePixel, SPRITE_H, SPRITE_W } from "../shared/sprites";
import { FONT_GLYPH } from "../shared/font";
import { iconPixel, ICON_H, ICON_W, bitmapPixel, BITMAPS } from "../shared/icons";

export class CanvasHal {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pixels: Uint8Array;
  private onColor = "#f2f2f2";
  private offColor = "#000000";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context missing");
    this.ctx = ctx;
    this.pixels = new Uint8Array(SCREEN_W * SCREEN_H);
  }

  clear(): void {
    this.pixels.fill(0);
  }

  setPixel(x: number, y: number, color: 0 | 1): void {
    if (x < 0 || y < 0 || x >= SCREEN_W || y >= SCREEN_H) return;
    this.pixels[y * SCREEN_W + x] = color;
  }

  getPixel(x: number, y: number): 0 | 1 {
    if (x < 0 || y < 0 || x >= SCREEN_W || y >= SCREEN_H) return 0;
    return this.pixels[y * SCREEN_W + x] ? 1 : 0;
  }

  execute(cmds: RenderCmd[]): void {
    for (const cmd of cmds) {
      switch (cmd.op) {
        case "clear":
          this.clear();
          break;
        case "fill":
          for (let yy = cmd.y; yy < cmd.y + cmd.h; yy++) {
            for (let xx = cmd.x; xx < cmd.x + cmd.w; xx++) {
              this.setPixel(xx, yy, cmd.color);
            }
          }
          break;
        case "sprite": {
          const data = getSpriteFrame(cmd.id, cmd.frame);
          for (let sy = 0; sy < SPRITE_H; sy++) {
            for (let sx = 0; sx < SPRITE_W; sx++) {
              if (spritePixel(data, sx, sy)) {
                this.setPixel(cmd.x + sx, cmd.y + sy, 1);
              }
            }
          }
          break;
        }
        case "icon":
          for (let sy = 0; sy < ICON_H; sy++) {
            for (let sx = 0; sx < ICON_W; sx++) {
              if (iconPixel(cmd.id, sx, sy)) {
                this.setPixel(cmd.x + sx, cmd.y + sy, 1);
              }
            }
          }
          break;
        case "bitmap": {
          const bm = BITMAPS[cmd.id];
          if (!bm) break;
          for (let sy = 0; sy < bm.h; sy++) {
            for (let sx = 0; sx < bm.w; sx++) {
              if (bitmapPixel(cmd.id, sx, sy)) {
                this.setPixel(cmd.x + sx, cmd.y + sy, 1);
              }
            }
          }
          break;
        }
        case "hbar": {
          const filled = Math.round((cmd.w * cmd.fill) / cmd.max);
          for (let xx = cmd.x; xx < cmd.x + cmd.w; xx++) {
            this.setPixel(xx, cmd.y, 1);
            this.setPixel(xx, cmd.y + 4, 1);
          }
          for (let yy = cmd.y; yy <= cmd.y + 4; yy++) {
            this.setPixel(cmd.x, yy, 1);
            this.setPixel(cmd.x + cmd.w - 1, yy, 1);
          }
          for (let xx = cmd.x + 1; xx < cmd.x + 1 + filled && xx < cmd.x + cmd.w - 1; xx++) {
            for (let yy = cmd.y + 1; yy <= cmd.y + 3; yy++) {
              this.setPixel(xx, yy, 1);
            }
          }
          break;
        }
        case "text8":
          this.drawText(cmd.x, cmd.y, cmd.text);
          break;
        case "invertRegion":
          for (let yy = cmd.y; yy < cmd.y + cmd.h; yy++) {
            for (let xx = cmd.x; xx < cmd.x + cmd.w; xx++) {
              const p = this.getPixel(xx, yy);
              this.setPixel(xx, yy, p ? 0 : 1);
            }
          }
          break;
      }
    }
    this.blit();
  }

  private drawText(x: number, y: number, text: string): void {
    let cx = x;
    for (const raw of text) {
      const glyph = FONT_GLYPH[raw] ?? FONT_GLYPH[" "]!;
      for (let col = 0; col < 5; col++) {
        const bits = glyph[col];
        for (let row = 0; row < 7; row++) {
          if (bits & (1 << row)) this.setPixel(cx + col, y + row, 1);
        }
      }
      cx += 6;
    }
  }

  private blit(): void {
    const img = this.ctx.createImageData(SCREEN_W, SCREEN_H);
    const on = hexToRgb(this.onColor);
    const off = hexToRgb(this.offColor);
    for (let i = 0; i < this.pixels.length; i++) {
      const c = this.pixels[i] ? on : off;
      const o = i * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
    this.ctx.putImageData(img, 0, 0);
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Crude CR2032 model for lab panel. */
export class BatteryModel {
  capacityMah = 200;
  usedMah = 0;
  private lastTs = performance.now();

  tick(displayOn: boolean, powered: boolean): void {
    const now = performance.now();
    const dtH = (now - this.lastTs) / 3600000;
    this.lastTs = now;
    if (!powered) return;
    const ma = displayOn ? 8 : 0.01;
    this.usedMah += ma * dtH;
  }

  estimatedDays(displayDuty = 0.02): number {
    const avgMa = displayDuty * 8 + (1 - displayDuty) * 0.01;
    if (avgMa <= 0) return 999;
    return Math.floor((this.capacityMah - this.usedMah) / avgMa / 24);
  }
}
