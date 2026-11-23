// View (sound): plays a Tune with the browser's own synthesizer (Web Audio) — no audio files, so nothing
// to embed or license and it works on file://. Two voices: a music box (finale) and a soft hum (Arthur).
// Browsers only allow sound after a user gesture, so play() should be called from a click/key handler.
import { midiToHz, scheduleTune, type Tune } from './melody';

export type Voice = 'musicbox' | 'hum';

/** Overall loudness at volume 1 (synth notes add up; keep headroom). */
const MASTER_GAIN = 0.35;

interface Playback {
  out: GainNode;
  sources: OscillatorNode[];
  /** Stop time per source (same order). */
  ends: number[];
}

export class MusicPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume: number;
  private current: Playback | null = null;
  /** No Web Audio in this browser (or it failed once): stay silent, never throw. */
  private unavailable = false;

  constructor(volume: number) {
    this.volume = clamp01(volume);
  }

  setVolume(volume: number): void {
    this.volume = clamp01(volume);
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.volume * MASTER_GAIN, this.ctx.currentTime, 0.05);
    if (this.volume === 0) this.stop(0.1);
  }

  get isPlaying(): boolean {
    return this.current !== null;
  }

  /**
   * Play `tune` (replacing whatever is playing). Silent when the volume is 0.
   * @param bars only the first `bars` bars.
   */
  play(tune: Tune, voice: Voice, bars = Infinity): void {
    if (this.volume === 0) return;
    const ctx = this.context();
    if (!ctx || !this.master) return;
    this.stop(0.2);
    void ctx.resume().catch(() => undefined);

    const out = ctx.createGain();
    out.gain.value = voice === 'hum' ? 0.55 : 1;
    out.connect(this.master);
    const playback: Playback = { out, sources: [], ends: [] };
    const start = ctx.currentTime + 0.08;
    for (const n of scheduleTune(tune, bars)) {
      const t = start + n.time;
      if (voice === 'musicbox') {
        // Plucked tine: bright attack, long decay, plus a quiet octave for the "box" shimmer.
        const ring = Math.max(n.duration * 1.6, 0.6);
        const level = n.part === 'bass' ? 0.22 : 0.3;
        this.note(ctx, playback, 'triangle', midiToHz(n.midi), t, ring, level, 0.005);
        if (n.part === 'melody') this.note(ctx, playback, 'sine', midiToHz(n.midi + 12), t, ring * 0.6, 0.08, 0.005);
      } else {
        // Humming: melody only, an octave lower, soft attack, held for the note's length.
        if (n.part === 'bass') continue;
        const len = n.duration * 0.95;
        this.note(ctx, playback, 'sine', midiToHz(n.midi - 12), t, len, 0.35, 0.08);
      }
    }
    this.current = playback;
    // When the last-ending note finishes, the playback is over.
    const last = playback.sources.reduce<{ osc: OscillatorNode; end: number } | null>((best, osc, i) => {
      const e = playback.ends[i] ?? 0;
      return !best || e > best.end ? { osc, end: e } : best;
    }, null);
    if (last) {
      last.osc.onended = () => {
        if (this.current === playback) this.current = null;
        out.disconnect();
      };
    }
  }

  /** Fade out and stop whatever is playing. */
  stop(fadeSeconds = 0.4): void {
    const p = this.current;
    this.current = null;
    if (!p || !this.ctx) return;
    const now = this.ctx.currentTime;
    p.out.gain.cancelScheduledValues(now);
    p.out.gain.setValueAtTime(p.out.gain.value, now);
    p.out.gain.linearRampToValueAtTime(0, now + fadeSeconds);
    for (const s of p.sources) {
      try {
        s.stop(now + fadeSeconds + 0.02);
      } catch {
        // already stopped
      }
    }
    window.setTimeout(() => p.out.disconnect(), (fadeSeconds + 0.1) * 1000);
  }

  private note(ctx: AudioContext, p: Playback, type: OscillatorType, hz: number, t: number, len: number, level: number, attack: number): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(env).connect(p.out);
    osc.start(t);
    osc.stop(t + len + 0.05);
    p.sources.push(osc);
    p.ends.push(t + len + 0.05);
  }

  private context(): AudioContext | null {
    if (this.ctx || this.unavailable) return this.ctx;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('Web Audio not supported');
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * MASTER_GAIN;
      this.master.connect(this.ctx.destination);
    } catch (err) {
      console.warn('Music is off: Web Audio is not available.', err);
      this.unavailable = true;
      this.ctx = null;
    }
    return this.ctx;
  }
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}
