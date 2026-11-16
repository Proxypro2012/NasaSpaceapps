import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY_MS, STEP_MS } from '../engine/metrics';
import { testData as data } from '../test/data';
import { dateEase, startDateMotion } from './motion';
import { MONTH_TOUR_MS, dateLimits, useStore } from './store';

const start = Date.UTC(2027, 0, 1);
beforeEach(() => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  useStore.getState().init(data, { windowStartMs: start, targetMs: start, windowDays: 7 });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function driver() {
  let next: FrameRequestCallback = () => {};
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { next = cb; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const stop = startDateMotion();
  const tick = (ms = 100) => { now += ms; next(now); };
  return { tick, stop };
}

describe('guided lunar month', () => {
  it('eases through a fixed 30-day window, pauses without drift, resumes and stops exactly', () => {
    const { tick, stop } = driver();
    try {
      useStore.getState().playMonth();
      expect(useStore.getState().windowDays).toBe(30);
      expect(useStore.getState().cameraFocus).toBe('moon');
      tick();
      for (let i = 0; i < 20; i++) tick();
      const end = start + 30 * DAY_MS - STEP_MS;
      expect(useStore.getState().displayMs).toBeCloseTo(start + (end - start) * dateEase(0.1), 2);
      useStore.getState().pauseMonth();
      const paused = useStore.getState().displayMs;
      tick(5000);
      expect(useStore.getState().displayMs).toBe(paused);
      useStore.getState().playMonth();
      tick();
      expect(useStore.getState().displayMs).toBe(paused);
      for (let i = 20; i < MONTH_TOUR_MS / 100; i++) tick();
      expect(useStore.getState().displayMs).toBe(end);
      expect(useStore.getState().targetMs).toBe(end);
      expect(useStore.getState().monthTour?.status).toBe('complete');
      expect(useStore.getState().windowStartMs).toBe(start);
      tick();
      expect(useStore.getState().displayMs).toBe(end);
      useStore.getState().playMonth();
      expect(useStore.getState().displayMs).toBe(start);
      expect(useStore.getState().monthTour?.elapsedMs).toBe(0);
    } finally { stop(); }
  });

  it('pauses on sheets and cancels on moment/date edits or saved-view restoration', () => {
    useStore.getState().playMonth();
    useStore.getState().setPanel('calendar');
    expect(useStore.getState().monthTour?.status).toBe('paused');
    useStore.getState().setPanel('none');
    expect(useStore.getState().monthTour?.status).toBe('paused');
    useStore.getState().setMoment(start + DAY_MS);
    expect(useStore.getState().monthTour).toBeNull();
    useStore.getState().playMonth();
    useStore.getState().setDate(start + DAY_MS, false);
    expect(useStore.getState().monthTour).toBeNull();
    useStore.getState().playMonth();
    useStore.getState().init(data, { windowStartMs: start });
    expect(useStore.getState().monthTour).toBeNull();
  });

  it('bounds the complete month to the ephemeris and respects reduced motion', () => {
    const { last } = dateLimits(data, 7);
    useStore.getState().setDate(last, false);
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    useStore.getState().playMonth();
    const s = useStore.getState();
    expect(s.windowStartMs).toBe(dateLimits(data, 30).last);
    expect(s.displayMs).toBe(s.windowStartMs + 30 * DAY_MS - STEP_MS);
    expect(s.monthTour?.status).toBe('complete');
    expect(s.notice).toContain('Reduced motion');
    expect(s.moving || s.playing).toBe(false);
  });
});
