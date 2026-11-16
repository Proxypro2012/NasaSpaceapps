import { afterEach, describe, expect, it, vi } from 'vitest';
import { testData as data } from '../test/data';
import golden from './__fixtures__/golden.json';
import { STEP_MS } from './metrics';
import * as sky from './sky';
import { windowSummary } from './summary';

afterEach(() => vi.restoreAllMocks());
const sites = new Map(data.sites.map((s) => [s.id, s]));

describe('window summary against the SPICE reference', () => {
  it.each(golden.windows.map((w) => [`${w.site} ${w.start_utc.slice(0, 10)} ${w.days}d`, w] as const))('%s', (_label, w) => {
    const s = windowSummary(data.eph, sites.get(w.site)!, Date.parse(w.start_utc), w.days);
    expect(s.totalDays).toBe(w.total_days);
    // A share right at the half-day line can tip by one sample between the two implementations.
    expect(Math.abs(s.operableDays - w.operable_days)).toBeLessThanOrEqual(1);
    if (w.first_long_dark_utc === null) expect(s.firstLongDarkStartMs).toBeNull();
    else expect(Math.abs(s.firstLongDarkStartMs! - Date.parse(w.first_long_dark_utc))).toBeLessThanOrEqual(STEP_MS);
  });

  it('agrees exactly on most windows', () => {
    const exact = golden.windows.filter((w) => {
      const s = windowSummary(data.eph, sites.get(w.site)!, Date.parse(w.start_utc), w.days);
      const first = w.first_long_dark_utc === null ? null : Date.parse(w.first_long_dark_utc);
      return s.operableDays === w.operable_days && s.firstLongDarkStartMs === first;
    });
    expect(exact.length).toBe(golden.windows.length);
  });
});

/** Replace the sky with a scripted one: sample i has the Sun and Earth shares given. */
function scripted(sun: (i: number) => number, earth: (i: number) => number = () => 1) {
  vi.spyOn(sky, 'skyAt').mockImplementation((_eph, _site, ms, out = sky.emptySky()) => {
    const i = Math.round(ms / STEP_MS);
    out.sun.frac = sun(i);
    out.earth.frac = earth(i);
    return out;
  });
}
const site = data.sites[0];

describe('window summary rules', () => {
  it('counts a day as operable at exactly half the day with both in view', () => {
    scripted(() => 1, (i) => (i % 48 < 24 ? 1 : 0));
    expect(windowSummary(data.eph, site, 0, 2).operableDays).toBe(2);
    scripted(() => 1, (i) => (i % 48 < 23 ? 1 : 0));
    expect(windowSummary(data.eph, site, 0, 2).operableDays).toBe(0);
  });

  it('counts the last half day of a lunar-day window as half a day', () => {
    scripted(() => 1);
    expect(windowSummary(data.eph, site, 0, 29.5)).toMatchObject({ operableDays: 29.5, totalDays: 29.5 });
    scripted((i) => (i >= 29 * 48 ? 0 : 1));
    expect(windowSummary(data.eph, site, 0, 29.5).operableDays).toBe(29);
  });

  it('reports the first dark run of 48 h or more, not a shorter one', () => {
    // Dark for 47.5 h from sample 10, then light, then dark for 48 h from sample 200.
    scripted((i) => ((i >= 10 && i < 105) || (i >= 200 && i < 296) ? 0 : 1));
    const s = windowSummary(data.eph, site, 0, 7);
    expect(s.firstLongDarkStartMs).toBe(200 * STEP_MS);
    expect(s.longDarkAtStart).toBe(false);
  });

  it('flags a long dark run already under way at the window start', () => {
    scripted((i) => (i < 100 ? 0 : 1));
    expect(windowSummary(data.eph, site, 0, 7)).toMatchObject({ firstLongDarkStartMs: 0, longDarkAtStart: true });
  });

  it('ignores a long run cut short by the window end', () => {
    scripted((i) => (i >= 7 * 48 - 50 ? 0 : 1));
    expect(windowSummary(data.eph, site, 0, 7).firstLongDarkStartMs).toBeNull();
  });
});
