import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import golden from './__fixtures__/golden.json';
import { Ephemeris } from './ephemeris';
import { bestWindow, dailyCells, startOfUtcDay, verdictOf, windowMetrics } from './metrics';
import { makeSite } from './site';
import { skyAt } from './sky';
import type { EphemerisMeta, Site, SitesFile } from './types';

const dataDir = resolve(__dirname, '../../public/data');

function floats(name: string): Float32Array {
  const buf = readFileSync(resolve(dataDir, name));
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

const meta = JSON.parse(readFileSync(resolve(dataDir, 'ephemeris.json'), 'utf8')) as EphemerisMeta;
const eph = new Ephemeris(meta, floats('ephemeris.bin'));
const sitesFile = JSON.parse(readFileSync(resolve(dataDir, 'sites.json'), 'utf8')) as SitesFile;
const sites = new Map<string, Site>(
  sitesFile.sites.map((s) => [s.id, makeSite(s, floats(s.horizon_file), sitesFile)]),
);

function angleDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

describe('engine against the SPICE reference', () => {
  it('reproduces Sun and Earth directions within 0.01 degrees', () => {
    let worst = 0;
    for (const g of golden.samples) {
      const sky = skyAt(eph, sites.get(g.site)!, Date.parse(g.utc));
      worst = Math.max(
        worst,
        // Azimuth differences shrink with cos(elevation); both bodies stay near the horizon here.
        angleDiff(sky.sun.az, g.sun_az),
        Math.abs(sky.sun.el - g.sun_el),
        angleDiff(sky.earth.az, g.earth_az),
        Math.abs(sky.earth.el - g.earth_el),
      );
      expect(sky.sun.radius).toBeCloseTo(g.sun_radius_deg, 5);
      expect(sky.earth.radius).toBeCloseTo(g.earth_radius_deg, 5);
    }
    expect(golden.samples.length).toBe(180);
    expect(worst).toBeLessThan(0.01);
  });

  it('reproduces disc visible fractions', () => {
    for (const g of golden.samples) {
      const sky = skyAt(eph, sites.get(g.site)!, Date.parse(g.utc));
      expect(sky.sun.frac).toBeCloseTo(g.sun_frac, 3);
      expect(sky.earth.frac).toBeCloseTo(g.earth_frac, 3);
    }
  });

  it('reproduces window metrics and verdicts', () => {
    for (const w of golden.windows) {
      const m = windowMetrics(eph, sites.get(w.site)!, Date.parse(w.start_utc), w.days);
      // One 30-minute step in a window is the most a rounding difference can move a share.
      const oneStep = 100 / (w.days * 48);
      expect(Math.abs(m.sunlightPct - w.sunlight_pct)).toBeLessThanOrEqual(oneStep + 1e-9);
      expect(Math.abs(m.earthLinkPct - w.earth_link_pct)).toBeLessThanOrEqual(oneStep + 1e-9);
      expect(Math.abs(m.combinedPct - w.combined_pct)).toBeLessThanOrEqual(oneStep + 1e-9);
      expect(Math.abs(m.longestDarkHours - w.longest_dark_hours)).toBeLessThanOrEqual(0.5);
      expect(m.verdict).toBe(w.verdict);
    }
  });
});

describe('verdict rules', () => {
  it('applies the thresholds at their edges', () => {
    expect(verdictOf(70, 47.5)).toBe('Good');
    expect(verdictOf(70, 48)).toBe('Risky');
    expect(verdictOf(69.9, 0)).toBe('Risky');
    expect(verdictOf(40, 120)).toBe('Risky');
    expect(verdictOf(39.9, 0)).toBe('Poor');
    expect(verdictOf(90, 120.5)).toBe('Poor');
  });
});

describe('calendar and best window', () => {
  const site = sites.get('connecting-ridge')!;
  const start = startOfUtcDay(Date.parse('2027-06-01T00:00:00Z'));

  it('daily cells average to the window totals', () => {
    const cells = dailyCells(eph, site, start, 30);
    const m = windowMetrics(eph, site, start, 30);
    const mean = (k: 'sunlightPct' | 'earthLinkPct' | 'combinedPct') =>
      cells.reduce((sum, c) => sum + c[k], 0) / cells.length;
    expect(mean('sunlightPct')).toBeCloseTo(m.sunlightPct, 9);
    expect(mean('earthLinkPct')).toBeCloseTo(m.earthLinkPct, 9);
    expect(mean('combinedPct')).toBeCloseTo(m.combinedPct, 9);
  });

  it('the best window is at least as good as every other start it searched', () => {
    const best = bestWindow(eph, site, start, 60, 14)!;
    for (let d = 0; d < 60; d++) {
      const m = windowMetrics(eph, site, start + d * 86_400_000, 14);
      expect(best.metrics.combinedPct).toBeGreaterThanOrEqual(m.combinedPct - 1e-9);
    }
  });

  it('refuses dates outside the ephemeris', () => {
    expect(eph.inRange(Date.parse('2025-12-31T00:00:00Z'))).toBe(false);
    expect(eph.inRange(Date.parse('2031-01-02T00:00:00Z'))).toBe(false);
    expect(bestWindow(eph, site, Date.parse('2031-02-01T00:00:00Z'), 10, 14)).toBeNull();
  });
});
