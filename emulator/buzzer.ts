/**
 * Web Audio square-wave buzzer — matches piezo character on device.
 * Must call unlock() from a user gesture (button press).
 */

import { getMelody, Sfx, takeSfx, type BuzzNote } from "../shared/sound";

export class BuzzerHal {
  private ctx: AudioContext | null = null;
  private muted = false;
  private playing = false;

  setMuted(m: boolean): void {
    this.muted = m;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Resume AudioContext after a click/key (browser autoplay policy). */
  unlock(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** Drain pending SFX from shared queue and play. */
  pump(): void {
    const id = takeSfx();
    if (id === Sfx.None || this.muted) return;
    this.playMelody(getMelody(id));
  }

  playMelody(notes: readonly BuzzNote[]): void {
    if (!notes.length || this.muted) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;

    // Drop overlapping chirps if still playing a long jingle
    if (this.playing && notes.length <= 2) return;

    const t0 = ctx.currentTime + 0.01;
    let t = t0;
    let end = t0;

    for (const n of notes) {
      const dur = Math.max(0.01, n.ms / 1000);
      if (n.freq > 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = n.freq;
        // Soft envelope — less harsh than raw square, still “buzzer”
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.08, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.01);
      }
      t += dur;
      end = t;
    }

    this.playing = true;
    const ms = Math.ceil((end - ctx.currentTime) * 1000) + 20;
    window.setTimeout(() => {
      this.playing = false;
    }, ms);
  }
}
