import { DAY_MS, STEP_MS, startOfUtcDay } from '../engine/metrics';
import { MONTH_TOUR_MS, dateLimits, useStore } from './store';

/** Solves a CSS-style cubic-bezier easing curve for x in 0..1. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const fx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const dfx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = dfx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (fx(t) - x) / d;
    }
    return ((ay * t + by) * t + cy) * t;
  };
}

/** Starts at rest, builds speed, and brakes smoothly without overshoot. */
export function dateEase(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return t * t * t * (10 + t * (-15 + 6 * t));
}

export function jumpDuration(distanceMs: number): number {
  return Math.min(3600, 1800 + Math.sqrt(Math.abs(distanceMs) / DAY_MS) * 120);
}

/**
 * Drives displayMs toward targetMs. The date value itself is animated, and
 * everything on screen is recomputed from the engine for each in-between
 * date, so the Sun and Earth follow their real paths rather than a straight
 * slide between two positions.
 */
export function startDateMotion(): () => void {
  let raf = 0;
  let fromMs = 0;
  let toMs = 0;
  let startedAt = 0;
  let durationMs = 0;
  let lastPlay = 0;
  let wasMoving = false;
  let lastTour: number | null = null;
  const unsubscribe = useStore.subscribe((s, previous) => {
    if (s.monthTour?.status !== previous.monthTour?.status) lastTour = null;
  });

  const frame = () => {
    // A queued RAF timestamp can predate a synchronous best-window search.
    // Use the actual callback time so that search latency cannot skip the ramp.
    const now = performance.now();
    raf = requestAnimationFrame(frame);
    const s = useStore.getState();
    if (!s.data) return;

    if (s.monthTour?.status === 'playing') {
      const dt = lastTour === null ? 0 : Math.max(0, Math.min(100, now - lastTour));
      lastTour = now;
      lastPlay = 0;
      wasMoving = false;
      const elapsedMs = Math.min(MONTH_TOUR_MS, s.monthTour.elapsedMs + dt);
      const progress = elapsedMs / MONTH_TOUR_MS;
      const end = s.windowStartMs + s.windowDays * DAY_MS - STEP_MS;
      const moment = s.windowStartMs + (end - s.windowStartMs) * dateEase(progress);
      useStore.setState({ displayMs: moment, targetMs: moment,
        monthTour: { status: progress >= 1 ? 'complete' : 'playing', elapsedMs } });
      return;
    }
    lastTour = null;

    // Time-lapse for the Public view: one day of Moon time every second.
    if (s.playing) {
      const dt = lastPlay ? Math.min(100, now - lastPlay) : 0;
      lastPlay = now;
      const next = s.displayMs + (dt / 1000) * DAY_MS;
      const { last } = dateLimits(s.data, s.windowDays);
      if (next >= last + DAY_MS) {
        useStore.setState({ playing: false });
      } else {
        // The window travels with the moment, one day at a time.
        const start = startOfUtcDay(next);
        useStore.setState({ windowStartMs: start, targetMs: next, displayMs: next, moving: false,
          comparison: start === s.windowStartMs ? s.comparison : null });
      }
      return;
    }
    lastPlay = 0;

    if (!s.moving) {
      toMs = s.targetMs;
      wasMoving = false;
      return;
    }
    if (!wasMoving || s.targetMs !== toMs || s.motionDurationMs !== durationMs) {
      fromMs = s.displayMs;
      toMs = s.targetMs;
      startedAt = now;
      durationMs = s.motionDurationMs;
    }
    wasMoving = true;
    const p = Math.min(1, (now - startedAt) / durationMs);
    if (p >= 1) s.setDisplay(toMs, false);
    else s.setDisplay(fromMs + (toMs - fromMs) * dateEase(p), true);
  };
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); unsubscribe(); };
}
