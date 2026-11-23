// Model: graphics quality. 'auto' starts on high and measures the first seconds of play; a machine that cannot
// hold a smooth frame rate is switched to 'low' (fewer effects, shorter view). Pure: no Babylon, no DOM.

export const QUALITY_SETTINGS = ['auto', 'high', 'low'] as const;
export type QualitySetting = (typeof QUALITY_SETTINGS)[number];
export type QualityLevel = 'high' | 'low';

export const isQualitySetting = (v: unknown): v is QualitySetting => (QUALITY_SETTINGS as readonly unknown[]).includes(v);

/** What is drawn for a setting before 'auto' has decided: high. */
export const levelOf = (setting: QualitySetting): QualityLevel => (setting === 'low' ? 'low' : 'high');

export const FPS_PROBE = {
  /** Seconds of normal play (no dialogs, no hiccups) to average over. */
  seconds: 5,
  /** Below this average the machine is switched to low. */
  minFps: 45,
  /** Frames longer than this are not counted (a hidden or throttled tab, a loading hitch). */
  maxFrame: 0.5,
} as const;

/** Averages the frame rate over a few seconds of real play and says which level fits this machine. */
export class FpsProbe {
  private time = 0;
  private frames = 0;

  /** One frame of play (seconds). @returns the decided level once enough play was seen, else null. */
  add(dt: number): QualityLevel | null {
    if (!(dt > 0) || dt > FPS_PROBE.maxFrame) return null;
    this.time += dt;
    this.frames++;
    if (this.time < FPS_PROBE.seconds) return null;
    return this.frames / this.time < FPS_PROBE.minFps ? 'low' : 'high';
  }
}
