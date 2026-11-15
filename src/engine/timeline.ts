import type { Ephemeris } from './ephemeris';
import { DAY_MS, STEP_MS, VISIBLE_THRESHOLD } from './metrics';
import { emptySky, skyAt } from './sky';
import type { BodySky, Site, SkyState } from './types';

export type VisibilityCause = 'visible' | 'terrain' | 'eclipse' | 'terrain-eclipse';
export interface VisibilitySample {
  ms: number;
  sun: VisibilityCause;
  earth: VisibilityCause;
}
export interface VisibilityPeriod {
  startMs: number;
  endMs: number;
  cause: VisibilityCause;
}

/** Use the metric's half-disc threshold, including partial terrain/eclipses. */
export function visibilityCause(body: BodySky): VisibilityCause {
  if (body.frac >= VISIBLE_THRESHOLD) return 'visible';
  const terrain = body.terrainFrac < VISIBLE_THRESHOLD;
  const eclipse = body.terrainFrac - body.frac > 1e-6;
  if (terrain && eclipse) return 'terrain-eclipse';
  return eclipse ? 'eclipse' : 'terrain';
}

export function visibilitySamples(eph: Ephemeris, site: Site, startMs: number, days: number): VisibilitySample[] {
  const sky = emptySky();
  return Array.from({ length: Math.round(days * DAY_MS / STEP_MS) }, (_, i) => {
    const ms = startMs + i * STEP_MS;
    skyAt(eph, site, ms, sky);
    return { ms, sun: visibilityCause(sky.sun), earth: visibilityCause(sky.earth) };
  });
}

/** Half-open periods cover every sample exactly once, without invented events. */
export function visibilityPeriods(samples: VisibilitySample[], body: 'sun' | 'earth'): VisibilityPeriod[] {
  const periods: VisibilityPeriod[] = [];
  for (const sample of samples) {
    const last = periods.at(-1);
    if (last && last.cause === sample[body] && last.endMs === sample.ms) last.endMs += STEP_MS;
    else periods.push({ startMs: sample.ms, endMs: sample.ms + STEP_MS, cause: sample[body] });
  }
  return periods;
}

export function obstructionExplanation(sky: SkyState): string {
  const describe = (name: string, body: BodySky) => {
    switch (visibilityCause(body)) {
      case 'terrain': return `${name} is below the half-disc visibility threshold because the terrain skyline blocks it.`;
      case 'eclipse': return `Earth is crossing in front of the Sun: a lunar eclipse reduces direct sunlight below the half-disc threshold.`;
      case 'terrain-eclipse': return `Both the terrain skyline and a lunar eclipse obstruct the Sun at this moment.`;
      default: return name === 'Sun' && body.terrainFrac - body.frac > 1e-6
        ? 'A partial eclipse reduces direct sunlight, but at least half the Sun remains visible.'
        : `At least half of ${name === 'Sun' ? 'the Sun' : 'Earth'} clears the skyline.`;
    }
  };
  return `${describe('Sun', sky.sun)} ${describe('Earth', sky.earth)}`;
}
