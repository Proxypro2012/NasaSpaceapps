import type { Ephemeris } from './ephemeris';
import { emptySky, skyAt } from './sky';
import type { DayCell, Site, Verdict, WindowMetrics } from './types';

export const STEP_MINUTES = 30;
export const STEP_MS = STEP_MINUTES * 60_000;
export const DAY_MS = 86_400_000;
const STEPS_PER_DAY = DAY_MS / STEP_MS;

/** A body counts as visible when at least this share of its disc clears the terrain. */
export const VISIBLE_THRESHOLD = 0.5;
const DARK_EPSILON = 1e-6;

/**
 * Verdict thresholds. These are this project's own definitions, not NASA
 * standards. They were fixed before any comparison with published values.
 */
export const THRESHOLDS = {
  goodMinSunlightPct: 70,
  goodMaxDarkHours: 48,
  poorMaxSunlightPct: 40,
  poorMinDarkHours: 120,
} as const;

export function verdictOf(sunlightPct: number, longestDarkHours: number): Verdict {
  if (sunlightPct < THRESHOLDS.poorMaxSunlightPct || longestDarkHours > THRESHOLDS.poorMinDarkHours) return 'Poor';
  if (sunlightPct >= THRESHOLDS.goodMinSunlightPct && longestDarkHours < THRESHOLDS.goodMaxDarkHours) return 'Good';
  return 'Risky';
}

const scratch = emptySky();

/** Sunlight, darkness and Earth line-of-sight over a window, stepped every 30 minutes. */
export function windowMetrics(eph: Ephemeris, site: Site, startMs: number, days: number): WindowMetrics {
  const steps = Math.round(days * STEPS_PER_DAY);
  let sunUp = 0;
  let earthUp = 0;
  let both = 0;
  let run = 0;
  let longest = 0;
  for (let i = 0; i < steps; i++) {
    skyAt(eph, site, startMs + i * STEP_MS, scratch);
    const s = scratch.sun.frac >= VISIBLE_THRESHOLD;
    const e = scratch.earth.frac >= VISIBLE_THRESHOLD;
    if (s) sunUp++;
    if (e) earthUp++;
    if (s && e) both++;
    if (scratch.sun.frac <= DARK_EPSILON) {
      run++;
      if (run > longest) longest = run;
    } else run = 0;
  }
  const sunlightPct = (100 * sunUp) / steps;
  const longestDarkHours = (longest * STEP_MINUTES) / 60;
  return {
    sunlightPct,
    longestDarkHours,
    earthLinkPct: (100 * earthUp) / steps,
    combinedPct: (100 * both) / steps,
    verdict: verdictOf(sunlightPct, longestDarkHours),
  };
}

/** One cell per UTC day: the share of that day with the Sun, Earth, and both visible. */
export function dailyCells(eph: Ephemeris, site: Site, startDayMs: number, days: number): DayCell[] {
  const cells: DayCell[] = [];
  for (let d = 0; d < days; d++) {
    const dayMs = startDayMs + d * DAY_MS;
    let sunUp = 0;
    let earthUp = 0;
    let both = 0;
    for (let i = 0; i < STEPS_PER_DAY; i++) {
      skyAt(eph, site, dayMs + i * STEP_MS, scratch);
      const s = scratch.sun.frac >= VISIBLE_THRESHOLD;
      const e = scratch.earth.frac >= VISIBLE_THRESHOLD;
      if (s) sunUp++;
      if (e) earthUp++;
      if (s && e) both++;
    }
    cells.push({
      dayMs,
      sunlightPct: (100 * sunUp) / STEPS_PER_DAY,
      earthLinkPct: (100 * earthUp) / STEPS_PER_DAY,
      combinedPct: (100 * both) / STEPS_PER_DAY,
    });
  }
  return cells;
}

export interface BestWindow {
  startMs: number;
  metrics: WindowMetrics;
}

/**
 * Finds the window start, on a UTC day boundary within the search span, with the
 * highest combined Sun-and-Earth share. Ties go to more sunlight, then to the
 * shorter dark stretch, then to the earlier date.
 */
export function bestWindow(
  eph: Ephemeris,
  site: Site,
  searchStartDayMs: number,
  searchDays: number,
  windowDays: number,
): BestWindow | null {
  let best: BestWindow | null = null;
  for (let d = 0; d < searchDays; d++) {
    const startMs = searchStartDayMs + d * DAY_MS;
    if (!eph.inRange(startMs) || !eph.inRange(startMs + windowDays * DAY_MS)) continue;
    const m = windowMetrics(eph, site, startMs, windowDays);
    if (
      !best ||
      m.combinedPct > best.metrics.combinedPct + 1e-9 ||
      (Math.abs(m.combinedPct - best.metrics.combinedPct) <= 1e-9 &&
        (m.sunlightPct > best.metrics.sunlightPct + 1e-9 ||
          (Math.abs(m.sunlightPct - best.metrics.sunlightPct) <= 1e-9 &&
            m.longestDarkHours < best.metrics.longestDarkHours)))
    ) {
      best = { startMs, metrics: m };
    }
  }
  return best;
}

/** Midnight UTC at or before an instant. */
export function startOfUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}
