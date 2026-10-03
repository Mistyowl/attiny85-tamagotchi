/**
 * Export shared/font.ts + shared/icons.ts → firmware/src/ui_assets.{c,h}
 * Strings become PROGMEM glyph-index sequences (not UTF-8).
 */
import fs from "fs";

const fontSrc = fs.readFileSync("shared/font.ts", "utf8");
const iconsSrc = fs.readFileSync("shared/icons.ts", "utf8");

function parseFontGlyphs(src) {
  const block = src.match(/export const FONT_GLYPH[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!block) throw new Error("FONT_GLYPH not found");
  const glyphs = [];
  const re = /(?:"([^"]+)"|([А-ЯЁ!0-9]))\s*:\s*\[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(block[1]))) {
    const ch = m[1] ?? m[2];
    const bytes = m[3].match(/0x[0-9a-fA-F]+|\d+/g).map((s) => parseInt(s, 16) || parseInt(s, 10));
    if (bytes.length !== 5) throw new Error("bad glyph " + ch);
    glyphs.push({ ch, bytes });
  }
  if (!glyphs.length) throw new Error("no glyphs parsed");
  return glyphs;
}

function parseArrayLiteral(src, name) {
  const re = new RegExp(
    `export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];`
  );
  const m = src.match(re);
  if (!m) throw new Error(name + " not found");
  return m[1];
}

function parseIcons(src) {
  const body = parseArrayLiteral(src, "ICONS");
  const icons = [];
  const re = /\[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(body))) {
    const bytes = m[1].match(/0x[0-9a-fA-F]+/g).map((s) => parseInt(s, 16));
    if (bytes.length === 8) icons.push(bytes);
  }
  if (icons.length !== 5) throw new Error("expected 5 icons, got " + icons.length);
  return icons;
}

function parsePoop(src) {
  const dataMatch = src.match(/data:\s*\[([\s\S]*?)\]/);
  if (!dataMatch) throw new Error("poop data not found");
  const data = dataMatch[1].match(/0x[0-9a-fA-F]+/g).map((s) => parseInt(s, 16));
  const w = +(src.match(/export const POOP_W = (\d+)/) || [])[1];
  const h = +(src.match(/export const POOP_H = (\d+)/) || [])[1];
  const x = +(src.match(/export const POOP_X = (\d+)/) || [])[1];
  const y = +(src.match(/export const POOP_Y = (\d+)/) || [])[1];
  return { w, h, x, y, data };
}

function cBytes(arr, indent = "  ") {
  const lines = [];
  for (let i = 0; i < arr.length; i += 12) {
    const chunk = arr
      .slice(i, i + 12)
      .map((b) => "0x" + b.toString(16).padStart(2, "0"))
      .join(", ");
    lines.push(indent + chunk + (i + 12 < arr.length ? "," : ""));
  }
  return lines.join("\n");
}

/* Home / Sleep / Dead only — minigame titles deferred for Flash */
const STRINGS = [
  ["UI_STR_EDA", "ЕДА"],
  ["UI_STR_IGRA", "ИГРА"],
  ["UI_STR_SON", "СОН"],
  ["UI_STR_LEK", "ЛЕК"],
  ["UI_STR_BOL", "БОЛ"],
  ["UI_STR_NADUDONIL", "НАДУДОНИЛ"],
  ["UI_STR_UVY", "УВЫ"],
  ["UI_STR_ZHMI", "ЖМИ"],
];

/** Keep digits + glyphs used by STRINGS (drop unused Cyrillic / punct). */
function usedGlyphChars() {
  const set = new Set();
  for (let d = 0; d <= 9; d++) set.add(String(d));
  for (const [, str] of STRINGS) for (const ch of str) set.add(ch);
  return set;
}

const allGlyphs = parseFontGlyphs(fontSrc);
const keep = usedGlyphChars();
const glyphs = allGlyphs.filter((g) => keep.has(g.ch));
const glyphIndex = new Map(glyphs.map((g, i) => [g.ch, i]));

function encodeString(s) {
  const ids = [];
  for (const ch of s) {
    if (!glyphIndex.has(ch)) throw new Error("missing glyph for " + ch);
    ids.push(glyphIndex.get(ch));
  }
  ids.push(0xff); /* terminator */
  return ids;
}

const icons = parseIcons(iconsSrc);
const poop = parsePoop(iconsSrc);

const digit0 = glyphIndex.get("0");
if (digit0 === undefined) throw new Error("digit 0 missing");

let h = `/* Auto-exported — run: node scripts/export-ui-assets.mjs */
#ifndef UI_ASSETS_H
#define UI_ASSETS_H

#include <stdint.h>
#include <avr/pgmspace.h>

#define UI_GLYPH_W 5
#define UI_GLYPH_H 7
#define UI_CHAR_ADV 6
#define UI_ICON_W 8
#define UI_ICON_H 8
#define UI_ICON_COUNT 5
#define UI_ICON_HUNGER 0
#define UI_ICON_HAPPY 1
#define UI_ICON_ENERGY 2
#define UI_ICON_HEALTH 3
#define UI_ICON_ZZZ 4
#define UI_POOP_W ${poop.w}
#define UI_POOP_H ${poop.h}
#define UI_POOP_X ${poop.x}
#define UI_POOP_Y ${poop.y}
#define UI_GLYPH_DIGIT0 ${digit0}
#define UI_STR_END 0xFF

extern const uint8_t ui_font[][5] PROGMEM;
extern const uint8_t ui_icons[UI_ICON_COUNT][8] PROGMEM;
extern const uint8_t ui_poop[] PROGMEM;

`;

for (const [name] of STRINGS) {
  h += `extern const uint8_t ${name}[] PROGMEM;\n`;
}

h += `
static inline uint8_t ui_text_width(uint8_t nchars) {
  return (uint8_t)(nchars * UI_CHAR_ADV);
}

static inline uint8_t ui_center_x(uint8_t nchars) {
  uint8_t w = ui_text_width(nchars);
  return (uint8_t)((128 - w) / 2);
}

#endif
`;

let c = `/* Auto-exported — run: node scripts/export-ui-assets.mjs */
#include "ui_assets.h"

const uint8_t ui_font[][5] PROGMEM = {
`;

for (const g of glyphs) {
  const row = g.bytes.map((b) => "0x" + b.toString(16).padStart(2, "0")).join(", ");
  c += `  {${row}}, /* ${g.ch === " " ? "sp" : g.ch} */\n`;
}
c += `};

const uint8_t ui_icons[UI_ICON_COUNT][8] PROGMEM = {
`;
for (let i = 0; i < icons.length; i++) {
  c += "  {\n" + cBytes(icons[i], "    ") + "\n  }" + (i + 1 < icons.length ? "," : "") + "\n";
}
c += `};

const uint8_t ui_poop[] PROGMEM = {
${cBytes(poop.data)}
};

`;

for (const [name, str] of STRINGS) {
  const ids = encodeString(str);
  c += `const uint8_t ${name}[] PROGMEM = { ${ids.map((b) => "0x" + b.toString(16).padStart(2, "0")).join(", ")} }; /* ${str} */\n`;
}

fs.writeFileSync("firmware/src/ui_assets.h", h);
fs.writeFileSync("firmware/src/ui_assets.c", c);

console.log(
  "wrote ui_assets: glyphs",
  glyphs.length,
  "icons",
  icons.length,
  "poop",
  poop.data.length,
  "B, strings",
  STRINGS.length
);
