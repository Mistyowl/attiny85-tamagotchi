import { PetState, Screen, Stage, FLAG_SLEEPING } from "./types";
import { createNewPet } from "./pet";

export const SAVE_MAGIC = 0x54;
export const SAVE_VERSION = 1;
export const SAVE_SIZE = 17;

function crc8(data: Uint8Array, len: number): number {
  let crc = 0;
  for (let i = 0; i < len; i++) {
    crc ^= data[i];
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc & 0xff;
}

function writeU32LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}

function readU32LE(buf: Uint8Array, offset: number): number {
  return (
    buf[offset] |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    (buf[offset + 3] << 24)
  ) >>> 0;
}

/** Serialize to EEPROM-shaped blob (17 bytes). */
export function serialize(pet: PetState): Uint8Array {
  const buf = new Uint8Array(SAVE_SIZE);
  buf[0] = SAVE_MAGIC;
  buf[1] = SAVE_VERSION;
  buf[2] = pet.stage & 0xff;
  buf[3] = pet.hunger & 0xff;
  buf[4] = pet.happiness & 0xff;
  buf[5] = pet.energy & 0xff;
  buf[6] = pet.health & 0xff;
  buf[7] = pet.flags & 0xff;
  writeU32LE(buf, 8, pet.ageTicks >>> 0);
  writeU32LE(buf, 12, pet.careScore >>> 0);
  buf[16] = crc8(buf, 16);
  return buf;
}

export function deserialize(buf: Uint8Array): PetState | null {
  if (buf.length < SAVE_SIZE) return null;
  if (buf[0] !== SAVE_MAGIC || buf[1] !== SAVE_VERSION) return null;
  if (crc8(buf, 16) !== buf[16]) return null;

  const pet = createNewPet();
  pet.stage = buf[2] as Stage;
  pet.hunger = buf[3];
  pet.happiness = buf[4];
  pet.energy = buf[5];
  pet.health = buf[6];
  pet.flags = buf[7];
  pet.ageTicks = readU32LE(buf, 8);
  pet.careScore = readU32LE(buf, 12);
  pet.bootTicks = 0;
  pet.screen = pet.health <= 0 ? Screen.Dead : pet.flags & FLAG_SLEEPING ? Screen.Sleeping : Screen.Home;
  pet.displayOn = true;
  return pet;
}

export function toBase64(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array | null {
  try {
    const s = atob(b64);
    const buf = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i);
    return buf;
  } catch {
    return null;
  }
}
