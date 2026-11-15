import { DAY_MS, startOfUtcDay } from '../engine/metrics';
import { DATE_TWEEN_MS, dateLimits, useStore } from './store';

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

/** The date glide: a quick start and a long, soft settle. */
export const dateEase = cubicBezier(0.22, 1, 0.36, 1);

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
  let lastPlay = 0;

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const s = useStore.getState();
    if (!s.data) return;

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
        useStore.setState({ windowStartMs: startOfUtcDay(next), targetMs: next, displayMs: next, moving: false });
      }
      return;
    }
    lastPlay = 0;

    if (!s.moving) {
      toMs = s.targetMs;
      return;
    }
    if (s.targetMs !== toMs) {
      fromMs = s.displayMs;
      toMs = s.targetMs;
      startedAt = now;
    }
    const p = Math.min(1, (now - startedAt) / DATE_TWEEN_MS);
    if (p >= 1) s.setDisplay(toMs, false);
    else s.setDisplay(fromMs + (toMs - fromMs) * dateEase(p), true);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
