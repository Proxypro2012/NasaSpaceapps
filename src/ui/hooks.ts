import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppData } from '../engine/load';
import { dailyCells, windowMetrics } from '../engine/metrics';
import type { DayCell, WindowMetrics } from '../engine/types';
import { dateEase } from '../state/motion';
import { DATE_TWEEN_MS, prefersReducedMotion } from '../state/store';

/** Window verdicts for every site. Recomputed by the engine whenever the window changes. */
export function useWindowMetrics(data: AppData, startMs: number, days: number): Record<string, WindowMetrics> {
  return useMemo(() => {
    const out: Record<string, WindowMetrics> = {};
    for (const site of data.sites) out[site.id] = windowMetrics(data.eph, site, startMs, days);
    return out;
  }, [data, startMs, days]);
}

export function useCalendar(data: AppData, startMs: number, days: number): Record<string, DayCell[]> {
  return useMemo(() => {
    const out: Record<string, DayCell[]> = {};
    for (const site of data.sites) out[site.id] = dailyCells(data.eph, site, startMs, days);
    return out;
  }, [data, startMs, days]);
}

/** Counts from the previous value to the new one over the date glide, so the eye follows the change. */
export function useCountUp(value: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const current = useRef(value);
  useEffect(() => {
    if (prefersReducedMotion() || Math.abs(value - current.current) < 1e-9) {
      current.current = value;
      setShown(value);
      return;
    }
    from.current = current.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / DATE_TWEEN_MS);
      current.current = from.current + (value - from.current) * dateEase(p);
      setShown(current.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

export function useEscape(onEscape: () => void, active = true): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape, active]);
}
