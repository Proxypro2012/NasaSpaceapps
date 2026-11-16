import type { Ephemeris } from './ephemeris';
import { DARK_EPSILON, DAY_MS, STEP_MS, THRESHOLDS, VISIBLE_THRESHOLD } from './metrics';
import { emptySky, skyAt } from './sky';
import type { Site } from './types';

const STEPS_PER_DAY = DAY_MS / STEP_MS;
/** Samples in a dark stretch long enough to rule out a Good verdict (48 h). */
const LONG_DARK_STEPS = (THRESHOLDS.goodMaxDarkHours * 60 * 60_000) / STEP_MS;

export interface WindowSummary {
  /** Days, in 24-hour blocks from the window start, with the Sun and Earth both in view at least half the time.
   * A shorter final block counts for its own length, so a 29.5-day window can give 20.5. */
  operableDays: number;
  totalDays: number;
  /** Start of the first run of full darkness lasting 48 h or more, or null if there is none. */
  firstLongDarkStartMs: number | null;
  /** True when that run is already under way at the window start, so it may have begun earlier. */
  longDarkAtStart: boolean;
}

const scratch = emptySky();

/**
 * A plain-language summary of a window. Uses the same 30-minute samples, visibility
 * threshold and darkness test as windowMetrics; it adds numbers, it changes none.
 */
export function windowSummary(eph: Ephemeris, site: Site, startMs: number, days: number): WindowSummary {
  const steps = Math.round(days * STEPS_PER_DAY);
  let operableSteps = 0;
  let blockSteps = 0;
  let blockBoth = 0;
  let run = 0;
  let firstLongDarkStartMs: number | null = null;
  let longDarkAtStart = false;
  const closeBlock = () => {
    if (blockSteps > 0 && blockBoth / blockSteps >= 0.5) operableSteps += blockSteps;
    blockSteps = 0;
    blockBoth = 0;
  };
  for (let i = 0; i < steps; i++) {
    skyAt(eph, site, startMs + i * STEP_MS, scratch);
    if (scratch.sun.frac >= VISIBLE_THRESHOLD && scratch.earth.frac >= VISIBLE_THRESHOLD) blockBoth++;
    blockSteps++;
    if (blockSteps === STEPS_PER_DAY) closeBlock();
    if (scratch.sun.frac <= DARK_EPSILON) {
      run++;
      if (run === LONG_DARK_STEPS && firstLongDarkStartMs === null) {
        const first = i - run + 1;
        firstLongDarkStartMs = startMs + first * STEP_MS;
        longDarkAtStart = first === 0;
      }
    } else run = 0;
  }
  closeBlock();
  return { operableDays: operableSteps / STEPS_PER_DAY, totalDays: steps / STEPS_PER_DAY, firstLongDarkStartMs, longDarkAtStart };
}
