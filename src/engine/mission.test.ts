import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ephemeris } from './ephemeris';
import type { AppData } from './load';
import { DAY_MS, STEP_MS, windowMetrics } from './metrics';
import { makeSite } from './site';
import { skyAt } from './sky';
import { obstructionExplanation, visibilityCause, visibilityPeriods, visibilitySamples } from './timeline';
import { EXAMPLE_MISSION } from '../state/mission';
import { useStore } from '../state/store';
import { jumpToBest } from '../ui/actions';

const root = resolve(__dirname, '../../public/data');
const json = (name: string) => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const floats = (name: string) => {
  const b = readFileSync(resolve(root, name));
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const sitesFile = json('sites.json');
const data: AppData = {
  eph: new Ephemeris(json('ephemeris.json'), floats('ephemeris.bin')), sitesFile,
  sites: sitesFile.sites.map((s: AppData['sitesFile']['sites'][number]) => makeSite(s, floats(s.horizon_file), sitesFile, floats(s.comparison_horizon_file))),
  textures: json('textures.json'), validation: json('validation.json'),
};
const site = data.sites.find(s => s.id === EXAMPLE_MISSION.siteId)!;
const launch = () => { useStore.getState().init(data, {}); useStore.getState().startMission(); };

describe('guided mission and linked science', () => {
  it('starts a reproducible mission and keeps deep links out of onboarding', () => {
    useStore.getState().init(data, { siteId: site.id, windowStartMs: EXAMPLE_MISSION.startMs });
    expect(useStore.getState().briefing).toBe(false);
    launch();
    const s = useStore.getState();
    expect([s.siteId, s.windowStartMs, s.windowDays, s.targetMs, s.displayMs]).toEqual([site.id, EXAMPLE_MISSION.startMs, 7, EXAMPLE_MISSION.startMs, EXAMPLE_MISSION.startMs]);
    expect(s.missionActive).toBe(true);
    expect(s.comparison).toBe(null);
  });

  it('keeps the original alongside the exact better window, including repeated clicks', () => {
    launch();
    jumpToBest(data);
    const first = useStore.getState().comparison!;
    expect(first.original.metrics.sunlightPct).toBe(100);
    expect(first.original.metrics.earthLinkPct).toBe(0);
    expect(first.recommended.startMs).toBe(Date.UTC(2027, 0, 10));
    expect(first.recommended.metrics.combinedPct).toBe(100);
    expect(useStore.getState().windowStartMs).toBe(first.recommended.startMs);
    jumpToBest(data);
    expect(useStore.getState().comparison).toEqual(first);
    useStore.getState().setMoment(useStore.getState().windowStartMs + DAY_MS);
    expect(useStore.getState().comparison).toEqual(first);
    useStore.getState().setAudience('educator');
    expect(useStore.getState().comparison).toEqual(first);
  });

  it('clears stale comparisons when the date, site or window changes', () => {
    for (const edit of [() => useStore.getState().stepDays(1), () => useStore.getState().setWindowDays(14), () => useStore.getState().setSite('malapert-massif')]) {
      launch(); jumpToBest(data); expect(useStore.getState().comparison).not.toBeNull();
      edit(); expect(useStore.getState().comparison).toBeNull();
    }
  });

  it.each([7, 14, 30])('uses identical visibility samples for the %i-day timeline and figures', days => {
    const start = Date.UTC(2026, 2, 3);
    const target = data.sites.find(s => s.id === 'malapert-massif')!;
    const samples = visibilitySamples(data.eph, target, start, days);
    const metrics = windowMetrics(data.eph, target, start, days);
    expect(samples.length).toBe(days * 48);
    expect(100 * samples.filter(s => s.sun === 'visible').length / samples.length).toBe(metrics.sunlightPct);
    expect(100 * samples.filter(s => s.earth === 'visible').length / samples.length).toBe(metrics.earthLinkPct);
    expect(100 * samples.filter(s => s.sun === 'visible' && s.earth === 'visible').length / samples.length).toBe(metrics.combinedPct);
    for (const body of ['sun', 'earth'] as const) {
      const periods = visibilityPeriods(samples, body);
      expect(periods[0].startMs).toBe(start);
      expect(periods.at(-1)!.endMs).toBe(start + days * DAY_MS);
      expect(periods.reduce((sum, p) => sum + p.endMs - p.startMs, 0)).toBe(days * DAY_MS);
      for (let i = 1; i < periods.length; i++) expect(periods[i].startMs).toBe(periods[i - 1].endMs);
      for (const period of periods) {
        const mid = period.startMs + Math.floor((period.endMs - period.startMs) / STEP_MS / 2) * STEP_MS;
        expect(mid).toBeGreaterThanOrEqual(period.startMs);
        expect(mid).toBeLessThan(period.endMs);
      }
    }
  });

  it('distinguishes terrain from a known total eclipse and overlapping obstruction', () => {
    const earth = skyAt(data.eph, site, EXAMPLE_MISSION.startMs).earth;
    expect(visibilityCause(earth)).toBe('terrain');
    const malapert = data.sites.find(s => s.id === 'malapert-massif')!;
    const sky = skyAt(data.eph, malapert, Date.UTC(2026, 2, 3, 11, 30));
    expect(visibilityCause(sky.sun)).toBe('eclipse');
    expect(obstructionExplanation(sky)).toContain('lunar eclipse');
    expect(visibilityCause({ ...sky.sun, terrainFrac: 0.4, frac: 0.1 })).toBe('terrain-eclipse');
    expect(visibilityCause({ ...earth, frac: 0.5, terrainFrac: 0.5 })).toBe('visible');
  });
});
