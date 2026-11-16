import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Ephemeris } from './ephemeris';
import type { AppData } from './load';
import { DAY_MS, STEP_MS, windowMetrics } from './metrics';
import { makeSite } from './site';
import { skyAt } from './sky';
import { obstructionExplanation, visibilityCause, visibilityPeriods, visibilitySamples } from './timeline';
import { EXAMPLE_MISSION } from '../state/mission';
import { useStore } from '../state/store';
import { findBetterWindow, jumpToBest } from '../ui/actions';
import { decodeLink, encodeLink } from '../ui/share';
import { startLocationSync } from '../state/location';

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
  textures: json('textures.json'), validation: json('validation.json'), psrs: json('psrs.json'),
};
const site = data.sites.find(s => s.id === EXAMPLE_MISSION.siteId)!;
const launch = () => { useStore.getState().init(data, {}); useStore.getState().startMission(); };

describe('shared-link navigation', () => {
  const a = { windowStartMs: Date.UTC(2026, 10, 15), windowDays: 30, targetMs: Date.UTC(2026, 10, 30, 12), siteId: site.id, audience: 'planner' as const };
  const b = { windowStartMs: Date.UTC(2027, 0, 1), windowDays: 7, targetMs: Date.UTC(2027, 0, 3, 12, 30), siteId: 'malapert-massif', audience: 'educator' as const };
  const setup = () => {
    useStore.getState().init(data, a);
    const events = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: false }) });
    const address = { hash: encodeLink(a) };
    const replaceState = vi.fn((_state: unknown, _title: string, hash: string) => { address.hash = hash; });
    vi.stubGlobal('window', events);
    vi.stubGlobal('location', address);
    vi.stubGlobal('history', { replaceState });
    return { events, address, replaceState, stop: startLocationSync() };
  };

  it('restores all fields together on hash/history events, stops motion, and cleans up', () => {
    const { events, address, stop } = setup();
    try {
      useStore.setState({ moving: true, playing: true });
      address.hash = encodeLink(b);
      events.dispatchEvent(new Event('popstate'));
      const s = useStore.getState();
      for (const key of ['windowStartMs', 'windowDays', 'targetMs', 'siteId', 'audience'] as const) expect(s[key]).toBe(b[key]);
      expect(s.displayMs).toBe(b.targetMs);
      expect(s.moving || s.playing).toBe(false);
      expect(s.comparison).toBeNull();
      let changes = 0;
      const unsubscribe = useStore.subscribe(() => changes++);
      events.dispatchEvent(new Event('hashchange'));
      expect(changes).toBe(0);
      unsubscribe();
      stop();
      address.hash = encodeLink(a);
      events.dispatchEvent(new Event('hashchange'));
      expect(useStore.getState().siteId).toBe(b.siteId);
    } finally { stop(); vi.unstubAllGlobals(); }
  });

  it('does not overwrite an incoming URL before its navigation event arrives', () => {
    const { events, address, stop } = setup();
    try {
      const incoming = encodeLink(b);
      address.hash = incoming;
      useStore.getState().setNotice('An intervening UI update');
      expect(address.hash).toBe(incoming);
      events.dispatchEvent(new Event('hashchange'));
      expect(useStore.getState().windowDays).toBe(7);
      expect(useStore.getState().siteId).toBe(b.siteId);
    } finally { stop(); vi.unstubAllGlobals(); }
  });

  it('bounds out-of-range dates and ignores invalid or unrelated fragments', () => {
    const { events, address, stop } = setup();
    try {
      address.hash = '#date=2099-01-01&days=7&site=missing';
      events.dispatchEvent(new Event('hashchange'));
      const s = useStore.getState();
      expect(s.targetMs).toBeGreaterThanOrEqual(s.windowStartMs);
      expect(s.targetMs).toBeLessThan(s.windowStartMs + 7 * DAY_MS);
      expect(s.siteId).toBe(site.id);
      expect(s.notice).toContain('nearest date');
      const previous = s.windowStartMs;
      address.hash = '#unrelated-section';
      events.dispatchEvent(new Event('hashchange'));
      expect(useStore.getState().windowStartMs).toBe(previous);
      expect(address.hash).toBe(encodeLink(useStore.getState()));
      expect(decodeLink('#date=2027-02-30&days=9&at=2027-01-01T24%3A00Z&view=invalid')).toEqual({});
    } finally { stop(); vi.unstubAllGlobals(); }
  });

  it('cancels a pending search even when a restored link has equivalent values', async () => {
    const { events, address, stop } = setup();
    let resume: FrameRequestCallback = () => {};
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { resume = cb; return 1; });
    try {
      const pending = findBetterWindow(data);
      const version = useStore.getState().navigationVersion;
      address.hash = encodeLink(a).replace('T12%3A00Z', 'T12%3A00%3A00Z');
      events.dispatchEvent(new Event('hashchange'));
      expect(useStore.getState().navigationVersion).toBe(version + 1);
      resume(0);
      await pending;
      expect(useStore.getState().windowStartMs).toBe(a.windowStartMs);
      expect(useStore.getState().comparison).toBeNull();
      expect(useStore.getState().searching).toBe(false);
    } finally { stop(); vi.unstubAllGlobals(); }
  });
});

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
