import type { EphemerisMeta, Vec3 } from './types';

/**
 * Sun and Earth positions seen from the Moon's centre, in the Moon-fixed
 * MOON_ME frame, sampled hourly from NASA's DE440 ephemeris by
 * tools/build_ephemeris.py and interpolated here with a Catmull-Rom cubic.
 */
export class Ephemeris {
  readonly startMs: number;
  readonly endMs: number;
  readonly stepMs: number;
  readonly samples: number;

  constructor(
    readonly meta: EphemerisMeta,
    private readonly data: Float32Array,
  ) {
    this.startMs = Date.parse(meta.start_utc);
    this.stepMs = meta.step_seconds * 1000;
    this.samples = meta.samples;
    if (data.length !== this.samples * 6) {
      throw new Error(`ephemeris table has ${data.length} values, expected ${this.samples * 6}`);
    }
    // The cubic needs one sample on each side, so the usable range is one step in from each end.
    this.endMs = this.startMs + (this.samples - 1) * this.stepMs;
  }

  /** First and last instants that can be evaluated. */
  get usableStartMs(): number {
    return this.startMs + this.stepMs;
  }
  get usableEndMs(): number {
    return this.endMs - this.stepMs;
  }

  inRange(ms: number): boolean {
    return ms >= this.usableStartMs && ms <= this.usableEndMs;
  }

  clamp(ms: number): number {
    return Math.min(this.usableEndMs, Math.max(this.usableStartMs, ms));
  }

  /** Writes the Sun and Earth positions (km) at a time into the given vectors. */
  sample(ms: number, sun: Vec3, earth: Vec3): void {
    const u = (ms - this.startMs) / this.stepMs;
    let i = Math.floor(u);
    if (i < 1) i = 1;
    else if (i > this.samples - 3) i = this.samples - 3;
    const t = u - i;
    const t2 = t * t;
    const t3 = t2 * t;
    const w0 = 0.5 * (-t + 2 * t2 - t3);
    const w1 = 0.5 * (2 - 5 * t2 + 3 * t3);
    const w2 = 0.5 * (t + 4 * t2 - 3 * t3);
    const w3 = 0.5 * (-t2 + t3);
    const d = this.data;
    const o = (i - 1) * 6;
    for (let k = 0; k < 3; k++) {
      sun[k] = w0 * d[o + k] + w1 * d[o + 6 + k] + w2 * d[o + 12 + k] + w3 * d[o + 18 + k];
      earth[k] = w0 * d[o + 3 + k] + w1 * d[o + 9 + k] + w2 * d[o + 15 + k] + w3 * d[o + 21 + k];
    }
  }
}
