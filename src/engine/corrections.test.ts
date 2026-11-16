import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ephemeris } from './ephemeris';
import { bestWindow, windowMetrics } from './metrics';
import { makeSite } from './site';
import { eclipseTransmission, skyAt, sunlightFraction } from './sky';
import type { AppData } from './load';
import { dateLimits, useStore } from '../state/store';
import { dateEase, jumpDuration, startDateMotion } from '../state/motion';
import { vi } from 'vitest';
import { windowCsv } from '../ui/share';
import { jumpToBest } from '../ui/actions';

const root = resolve(__dirname, '../../public/data');
const json = (name: string) => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const floats = (name: string) => {
  const b = readFileSync(resolve(root, name));
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const sitesFile = json('sites.json');
const data: AppData = {
  eph: new Ephemeris(json('ephemeris.json'), floats('ephemeris.bin')),
  sitesFile,
  sites: sitesFile.sites.map((s: AppData['sitesFile']['sites'][number]) => makeSite(s, floats(s.horizon_file), sitesFile, floats(s.comparison_horizon_file))),
  textures: json('textures.json'),
  validation: json('validation.json'),
  psrs: json('psrs.json'),
};

describe('audit regressions', () => {
  it('blocks direct sunlight during the NASA March 3, 2026 total eclipse', () => {
    const site = data.sites.find(s => s.id === 'malapert-massif')!;
    // NASA: entire Moon in the umbra from 11:04 to 12:03 UTC.
    expect(skyAt(data.eph, site, Date.parse('2026-03-03T11:30Z')).sun.frac).toBe(0);
    expect(windowMetrics(data.eph, site, Date.parse('2026-03-03T00:00Z'), 7).longestDarkHours).toBeGreaterThan(0);
  });

  it.each([7, 14, 30])('uses the same %i-day limits for search and selection', (days) => {
    const site = data.sites.find(s => s.id === 'nobile-rim-1')!;
    const {last} = dateLimits(data, days);
    const best = bestWindow(data.eph, site, last, 365, days)!;
    expect(best.startMs).toBeLessThanOrEqual(last);
  });

  it('selects the exact date announced by the best-window action', () => {
    const site = data.sites.find(s => s.id === 'nobile-rim-1')!;
    const start = Date.parse('2030-12-23T00:00Z');
    const best = bestWindow(data.eph, site, start, 365, 7)!;
    useStore.getState().init(data, {siteId: site.id, windowStartMs: start, windowDays: 7, targetMs: start});
    jumpToBest(data);
    expect(useStore.getState().windowStartMs).toBe(best.startMs);
  });

  it('builds speed from rest and slows down at the end', () => {
    expect(dateEase(0)).toBe(0);
    expect(dateEase(1)).toBe(1);
    const start = dateEase(0.1);
    const next = dateEase(0.2) - dateEase(0.1);
    const finish = 1 - dateEase(0.9);
    expect(start).toBeLessThan(next);
    expect(start).toBeLessThan(0.02);
    expect(finish).toBeLessThan(0.02);
  });

  it('agrees with analytic partial-disc overlap, including the terrain intersection', () => {
    const site = {...data.sites[0], mask: new Float32Array(720).fill(-90)};
    const sun = {az: 0, el: 0, radius: 1, frac: 1, terrainFrac: 1};
    const earth = {...sun, az: 1};
    const visible = 1 - (2 * Math.acos(0.5) - Math.sqrt(3) / 2) / Math.PI;
    expect(sunlightFraction(site, sun, earth)).toBeCloseTo(visible, 3);
    site.mask.fill(0);
    expect(sunlightFraction(site, {...sun, frac: 0.5, terrainFrac: 0.5}, earth)).toBeCloseTo(visible / 2, 3);
    expect(sunlightFraction(site, sun, {...earth, az: 180})).toBe(1);
    expect(sunlightFraction(site, sun, {...earth, az: 0, radius: 2})).toBe(0);
    expect(eclipseTransmission({...sun, frac: 0, terrainFrac: 0}, {...earth, az: 0, radius: 2})).toBe(0);
    expect(eclipseTransmission(sun, earth)).toBeCloseTo(visible, 6);
  });

  it('uses 40m terrain and exposes the known Malapert resolution disagreement', () => {
    expect(data.sitesFile.terrain_resolution_m).toBe(40);
    const site = data.sites.find(s => s.id === 'malapert-massif')!;
    const m = windowMetrics(data.eph, site, Date.parse('2027-01-01T00:00Z'), 7);
    expect(m.verdict).toBe('Risky');
    expect(m.sunlightPct).toBeCloseTo(69.345, 2);
    expect(m.resolution?.verdict).toBe('Good');
    expect(m.resolution?.sensitive).toBe(true);
  });

  it('exports eclipse-corrected rows and resolution metadata', () => {
    const site = data.sites.find(s => s.id === 'malapert-massif')!;
    const t = Date.parse('2026-03-03T00:00Z');
    const csv = windowCsv(data, site, t, 7, windowMetrics(data.eph, site, t, 7));
    const row = csv.split('\n').find(r => r.startsWith('2026-03-03T11:30Z,'))!;
    expect(Number(row.split(',')[3])).toBe(0);
    expect(csv).toContain('# Comparison terrain,LDEM_80S_80MPP_ADJ.TIF');
  });

  it('travels from rest, retargets from the displayed moment and stops exactly', () => {
    let next: FrameRequestCallback = () => {};
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const tick = (time: number) => { clock = time; next(time); };
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { next = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    try {
      const start = Date.parse('2027-01-01T00:00Z');
      useStore.getState().init(data, {windowStartMs: start, targetMs: start, windowDays: 7});
      useStore.setState({moving: false, playing: false});
      const stop = startDateMotion();
      tick(0);
      const end = start + 100 * 86400000;
      useStore.getState().setDate(end, true, 2000);
      tick(10); tick(210);
      const early = useStore.getState().displayMs;
      tick(410);
      expect(early - start).toBeLessThan(useStore.getState().displayMs - early);
      const current = useStore.getState().displayMs;
      useStore.getState().setDate(start, true, 2000);
      tick(420);
      expect(useStore.getState().displayMs).toBe(current);
      tick(2420);
      expect(useStore.getState().displayMs).toBe(start);
      expect(useStore.getState().moving).toBe(false);
      useStore.getState().setSite('nobile-rim-1');
      expect(useStore.getState().motionDurationMs).toBe(1200);
      useStore.getState().setDate(end, true, 3600);
      useStore.getState().setDate(start, false);
      expect(useStore.getState().motionDurationMs).toBe(1200);
      stop();
      expect(cancelAnimationFrame).toHaveBeenCalled();
      expect(jumpDuration(365 * 86400000)).toBeGreaterThan(jumpDuration(86400000));
    } finally { vi.unstubAllGlobals(); vi.restoreAllMocks(); }
  });

  it('keeps a repeated best-window click continuous when its duration changes', () => {
    let next: FrameRequestCallback = () => {};
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const tick = (time: number) => { clock = time; next(time); };
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { next = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    try {
      const start = Date.parse('2027-01-01T00:00Z');
      useStore.getState().init(data, {siteId: 'malapert-massif', windowStartMs: start, targetMs: start, windowDays: 7});
      useStore.setState({moving: false, playing: false});
      const stop = startDateMotion();
      tick(0);
      jumpToBest(data);
      tick(10); tick(1010);
      const before = useStore.getState().displayMs;
      jumpToBest(data);
      tick(1020);
      expect(useStore.getState().displayMs).toBe(before);
      tick(1020 + useStore.getState().motionDurationMs);
      expect(useStore.getState().displayMs).toBe(useStore.getState().targetMs);
      expect(useStore.getState().moving).toBe(false);
      stop();
    } finally { vi.unstubAllGlobals(); vi.restoreAllMocks(); }
  });
});
