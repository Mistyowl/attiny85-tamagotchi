import fs from "fs";

const src = fs.readFileSync("shared/sprites.ts", "utf8");

function extract(name) {
  const re = new RegExp(`const ${name} = ink0\\(\\[([\\s\\S]*?)\\]\\)`);
  const m = src.match(re);
  if (!m) throw new Error("missing " + name);
  return m[1].match(/0x[0-9a-fA-F]+/g).map((s) => parseInt(s, 16) ^ 0xff);
}

/** Drop empty rows + empty byte-columns (8px). */
function cropXY(data) {
  let y0 = 0;
  let y1 = 31;
  const rowEmpty = (y) =>
    data[y * 4] === 0 && data[y * 4 + 1] === 0 && data[y * 4 + 2] === 0 && data[y * 4 + 3] === 0;
  while (y0 < 32 && rowEmpty(y0)) y0++;
  while (y1 >= y0 && rowEmpty(y1)) y1--;
  if (y1 < y0) {
    return { x0: 0, y0: 0, w: 8, h: 1, bytes: [0] };
  }

  let c0 = 0;
  let c1 = 3;
  const colEmpty = (c) => {
    for (let y = y0; y <= y1; y++) if (data[y * 4 + c] !== 0) return false;
    return true;
  };
  while (c0 <= c1 && colEmpty(c0)) c0++;
  while (c1 >= c0 && colEmpty(c1)) c1--;

  const h = y1 - y0 + 1;
  const bytes = [];
  for (let y = y0; y <= y1; y++) {
    for (let c = c0; c <= c1; c++) bytes.push(data[y * 4 + c]);
  }
  return { x0: c0 * 8, y0, w: (c1 - c0 + 1) * 8, h, bytes };
}

function cArr(data) {
  const lines = [];
  for (let i = 0; i < data.length; i += 16) {
    const chunk = data
      .slice(i, i + 16)
      .map((b) => "0x" + b.toString(16).padStart(2, "0"))
      .join(", ");
    lines.push("  " + chunk + (i + 16 < data.length ? "," : ""));
  }
  return lines.join("\n");
}

const pairs = [
  ["EGG", "spr_egg"],
  ["BABY_OPEN", "spr_baby0"],
  ["BABY_BLINK", "spr_baby1"],
  ["CHILD_OPEN", "spr_child0"],
  ["CHILD_BLINK", "spr_child1"],
  ["ADULT_OPEN", "spr_adult0"],
  ["ADULT_BLINK", "spr_adult1"],
  ["DEAD_HAMSTER", "spr_dead"],
  ["WING_LEFT", "spr_wing_l"],
  ["WING_RIGHT", "spr_wing_r"],
];

const cropped = {};
let dataBytes = 0;

let out = `/* Auto-exported from shared/sprites.ts — run: node scripts/export-sprites.mjs */
#include "sprites.h"

`;

for (const [tsName, cName] of pairs) {
  const full = extract(tsName);
  if (full.length !== 128) throw new Error(tsName + " len " + full.length);
  const c = cropXY(full);
  cropped[cName] = c;
  dataBytes += c.bytes.length;
  out += `static const uint8_t ${cName}[] PROGMEM = {\n${cArr(c.bytes)}\n};\n\n`;
}

out += `static void fill_desc(SpriteDesc *d, uint8_t x0, uint8_t y0, uint8_t w, uint8_t h, const uint8_t *bits) {
  d->x0 = x0;
  d->y0 = y0;
  d->w = w;
  d->h = h;
  d->bits = bits;
}

void sprite_stage(uint8_t stage, uint8_t frame, SpriteDesc *out) {
  frame &= 1;
  switch (stage) {
    case 1:
      if (frame) fill_desc(out, ${cropped.spr_baby1.x0}, ${cropped.spr_baby1.y0}, ${cropped.spr_baby1.w}, ${cropped.spr_baby1.h}, spr_baby1);
      else fill_desc(out, ${cropped.spr_baby0.x0}, ${cropped.spr_baby0.y0}, ${cropped.spr_baby0.w}, ${cropped.spr_baby0.h}, spr_baby0);
      break;
    case 2:
      if (frame) fill_desc(out, ${cropped.spr_child1.x0}, ${cropped.spr_child1.y0}, ${cropped.spr_child1.w}, ${cropped.spr_child1.h}, spr_child1);
      else fill_desc(out, ${cropped.spr_child0.x0}, ${cropped.spr_child0.y0}, ${cropped.spr_child0.w}, ${cropped.spr_child0.h}, spr_child0);
      break;
    case 3:
    case 4: /* AdultA — same art until unique */
    case 5: /* AdultB */
      if (frame) fill_desc(out, ${cropped.spr_adult1.x0}, ${cropped.spr_adult1.y0}, ${cropped.spr_adult1.w}, ${cropped.spr_adult1.h}, spr_adult1);
      else fill_desc(out, ${cropped.spr_adult0.x0}, ${cropped.spr_adult0.y0}, ${cropped.spr_adult0.w}, ${cropped.spr_adult0.h}, spr_adult0);
      break;
    default:
      fill_desc(out, ${cropped.spr_egg.x0}, ${cropped.spr_egg.y0}, ${cropped.spr_egg.w}, ${cropped.spr_egg.h}, spr_egg);
      break;
  }
}

void sprite_dead(SpriteDesc *out) {
  fill_desc(out, ${cropped.spr_dead.x0}, ${cropped.spr_dead.y0}, ${cropped.spr_dead.w}, ${cropped.spr_dead.h}, spr_dead);
}

void sprite_wing_l(SpriteDesc *out) {
  fill_desc(out, ${cropped.spr_wing_l.x0}, ${cropped.spr_wing_l.y0}, ${cropped.spr_wing_l.w}, ${cropped.spr_wing_l.h}, spr_wing_l);
}

void sprite_wing_r(SpriteDesc *out) {
  fill_desc(out, ${cropped.spr_wing_r.x0}, ${cropped.spr_wing_r.y0}, ${cropped.spr_wing_r.w}, ${cropped.spr_wing_r.h}, spr_wing_r);
}
`;

fs.writeFileSync("firmware/src/sprites.c", out);

console.log("wrote firmware/src/sprites.c — packed", dataBytes, "B data (XY-crop)");
for (const [, cName] of pairs) {
  const c = cropped[cName];
  console.log(`  ${cName}: x0=${c.x0} y0=${c.y0} w=${c.w} h=${c.h} store=${c.bytes.length}B`);
}
