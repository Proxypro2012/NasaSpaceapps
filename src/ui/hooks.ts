import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppData } from '../engine/load';
import { dailyCells, windowMetrics } from '../engine/metrics';
import type { DayCell, WindowMetrics } from '../engine/types';
import { dateEase } from '../state/motion';
import { prefersReducedMotion, useStore } from '../state/store';

/** Window verdicts for every site. Recomputed by the engine whenever the window changes. */
export function useWindowMetrics(data: AppData | null, startMs: number, days: number): Record<string, WindowMetrics> {
  return useMemo(() => {
    const out: Record<string, WindowMetrics> = {};
    if (!data) return out;
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
  const durationMs = useStore((s) => s.motionDurationMs);
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const current = useRef(value);
  useEffect(() => {
    if (durationMs === 0 || prefersReducedMotion() || Math.abs(value - current.current) < 1e-9) {
      current.current = value;
      setShown(value);
      return;
    }
    from.current = current.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      current.current = from.current + (value - from.current) * dateEase(p);
      setShown(current.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);
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

/** Capture the trigger before React mounts an auto-focused dialog. */
export function useModalFocus(): void {
  useEffect(() => {
    let trigger: HTMLElement | null = null;
    const unsubscribe = useStore.subscribe((state, previous) => {
      if (previous.panel === 'none' && state.panel !== 'none') trigger = document.activeElement as HTMLElement | null;
      if (previous.panel !== 'none' && state.panel === 'none') requestAnimationFrame(() => {
        if (useStore.getState().panel === 'none' && trigger?.isConnected) trigger.focus();
      });
    });
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || useStore.getState().panel === 'none') return;
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), summary, video[controls], [tabindex="0"]')).filter(el => el.getClientRects().length > 0 && !el.closest('[inert]'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first) return;
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        e.preventDefault(); last?.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
    };
    window.addEventListener('keydown', trap);
    return () => { unsubscribe(); window.removeEventListener('keydown', trap); };
  }, []);
}
