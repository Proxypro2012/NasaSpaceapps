import { describe, expect, it } from 'vitest';
import { testData as data } from '../test/data';
import { DAY_MS, bestWindow, windowDateLimits, windowMetrics, type BestWindow } from './metrics';
import type { Ephemeris } from './ephemeris';
import type { Site } from './types';

/** The search as it was written before the single-pass version: one full windowMetrics per candidate. */
function referenceBestWindow(eph: Ephemeris, site: Site, searchStartDayMs: number, searchDays: number, windowDays: number): BestWindow | null {
  let best: BestWindow | null = null;
  const { first, last } = windowDateLimits(eph, windowDays);
  const primary = site.comparison ? { ...site, comparison: undefined } : site;
  for (let d = 0; d < searchDays; d++) {
    const startMs = searchStartDayMs + d * DAY_MS;
    if (startMs < first || startMs > last) continue;
    const m = windowMetrics(eph, primary, startMs, windowDays);
    if (
      !best ||
      m.combinedPct > best.metrics.combinedPct + 1e-9 ||
      (Math.abs(m.combinedPct - best.metrics.combinedPct) <= 1e-9 &&
        (m.sunlightPct > best.metrics.sunlightPct + 1e-9 ||
          (Math.abs(m.sunlightPct - best.metrics.sunlightPct) <= 1e-9 && m.longestDarkHours < best.metrics.longestDarkHours)))
    ) {
      best = { startMs, metrics: m };
    }
  }
  if (best && site.comparison) best.metrics = windowMetrics(eph, site, best.startMs, windowDays);
  return best;
}

const jan2027 = Date.UTC(2027, 0, 1);
const expectSame = (site: Site, start: number, searchDays: number, windowDays: number) =>
  expect(bestWindow(data.eph, site, start, searchDays, windowDays)).toEqual(referenceBestWindow(data.eph, site, start, searchDays, windowDays));

// The reference loop is the slow search being replaced, so these checks take seconds;
// spans are about four lunar cycles, enough to cross every kind of sunlight period.
describe('bestWindow gives the same answer as one windowMetrics per candidate', { timeout: 60_000 }, () => {
  it.each(data.sites.map((s) => [s.id, s] as const))('%s, 7 and 14 days over 120 starts', (_id, site) => {
    expectSame(site, jan2027, 120, 7);
    expectSame(site, Date.UTC(2026, 5, 1), 120, 14);
  });

  it.each([29.5, 30])('%s-day windows', (days) => {
    expectSame(data.sites[0], jan2027, 120, days);
    expectSame(data.sites[2], Date.UTC(2028, 2, 10), 60, days);
  });

  it('one-year windows', () => {
    expectSame(data.sites[1], jan2027, 20, 365);
    expectSame(data.sites[2], Date.UTC(2029, 0, 1), 12, 365);
  });

  it('a site without a secondary map', () => {
    expectSame({ ...data.sites[0], comparison: undefined }, jan2027, 120, 30);
  });

  it('skips starts outside the data and returns null when none fit', () => {
    const { first, last } = windowDateLimits(data.eph, 30);
    expectSame(data.sites[0], first - 10 * DAY_MS, 40, 30);
    expectSame(data.sites[0], last - 20 * DAY_MS, 120, 30);
    expect(bestWindow(data.eph, data.sites[0], last + DAY_MS, 365, 30)).toBeNull();
    const yearLast = windowDateLimits(data.eph, 365).last;
    expect(bestWindow(data.eph, data.sites[0], yearLast + DAY_MS, 365, 365)).toBeNull();
  });
});
