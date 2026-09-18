/**
 * Piezo / buzzer SFX — square-wave note lists (Hz + ms).
 * freq 0 = silence/rest. Portable for Web Audio + ATtiny bit-bang.
 */

export enum Sfx {
  None = 0,
  Click = 1,
  Feed = 2,
  Play = 3,
  Sleep = 4,
  Medicine = 5,
  Hatch = 6,
  Evolve = 7,
  Chirp = 8,
  Sad = 9,
  Die = 10,
  Wake = 11,
  Hit = 12,
  Fart = 13,
}

export interface BuzzNote {
  /** Frequency Hz; 0 = rest. */
  freq: number;
  /** Duration ms. */
  ms: number;
}

/** Compact melodies — keep short for CR2032 / blocking firmware buzz. */
export const SFX_MELODIES: readonly (readonly BuzzNote[])[] = [
  /* None */ [],
  /* Click */ [{ freq: 1800, ms: 18 }],
  /* Feed */ [
    { freq: 900, ms: 50 },
    { freq: 0, ms: 20 },
    { freq: 1400, ms: 70 },
  ],
  /* Play */ [
    { freq: 1200, ms: 40 },
    { freq: 1600, ms: 40 },
    { freq: 2000, ms: 60 },
  ],
  /* Sleep */ [
    { freq: 800, ms: 80 },
    { freq: 600, ms: 100 },
    { freq: 400, ms: 120 },
  ],
  /* Medicine */ [
    { freq: 1500, ms: 40 },
    { freq: 0, ms: 30 },
    { freq: 1500, ms: 40 },
    { freq: 0, ms: 30 },
    { freq: 1900, ms: 80 },
  ],
  /* Hatch */ [
    { freq: 1000, ms: 60 },
    { freq: 1300, ms: 60 },
    { freq: 1700, ms: 60 },
    { freq: 2200, ms: 100 },
  ],
  /* Evolve */ [
    { freq: 1100, ms: 50 },
    { freq: 1400, ms: 50 },
    { freq: 1800, ms: 50 },
    { freq: 2200, ms: 50 },
    { freq: 1800, ms: 80 },
  ],
  /* Chirp — tiny hamster peep */
  [
    { freq: 2400, ms: 35 },
    { freq: 0, ms: 40 },
    { freq: 2800, ms: 45 },
  ],
  /* Sad */
  [
    { freq: 900, ms: 90 },
    { freq: 700, ms: 110 },
  ],
  /* Die */
  [
    { freq: 600, ms: 100 },
    { freq: 450, ms: 120 },
    { freq: 300, ms: 160 },
  ],
  /* Wake */
  [
    { freq: 1400, ms: 40 },
    { freq: 1800, ms: 50 },
  ],
  /* Hit (minigame) */
  [{ freq: 2000, ms: 25 }],
  /* Fart — low stuttering raspberry */
  [
    { freq: 220, ms: 28 },
    { freq: 0, ms: 12 },
    { freq: 170, ms: 32 },
    { freq: 0, ms: 12 },
    { freq: 130, ms: 40 },
    { freq: 0, ms: 14 },
    { freq: 95, ms: 55 },
    { freq: 70, ms: 90 },
  ],
];

let pending: Sfx = Sfx.None;

/** Queue one SFX (last write wins — fine for tiny UI). */
export function queueSfx(id: Sfx): void {
  if (id === Sfx.None) return;
  pending = id;
}

/** Take and clear pending SFX for HAL / firmware. */
export function takeSfx(): Sfx {
  const id = pending;
  pending = Sfx.None;
  return id;
}

export function peekSfx(): Sfx {
  return pending;
}

export function getMelody(id: Sfx): readonly BuzzNote[] {
  return SFX_MELODIES[id] ?? [];
}
