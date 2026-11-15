import { create } from 'zustand';
import type { AppData } from '../engine/load';
import { DAY_MS, STEP_MS, startOfUtcDay, windowDateLimits } from '../engine/metrics';
import { EXAMPLE_MISSION, type WindowComparison } from './mission';

export type Audience = 'planner' | 'educator' | 'public';
export type Panel = 'none' | 'trust' | 'dive' | 'calendar' | 'submission';

export const WINDOW_OPTIONS = [7, 14, 30] as const;
export const AUDIENCES: Audience[] = ['planner', 'educator', 'public'];
export const DATE_TWEEN_MS = 1200;

interface State {
  data: AppData | null;
  loadError: string | null;
  /** Midnight UTC of the first day of the window the verdicts cover. */
  windowStartMs: number;
  windowDays: number;
  /** The moment inside the window that the Moon, sky and skyline show. */
  targetMs: number;
  /** The moment currently drawn; it glides toward targetMs. */
  displayMs: number;
  /** True while displayMs is still moving. */
  moving: boolean;
  motionDurationMs: number;
  siteId: string;
  audience: Audience;
  panel: Panel;
  playing: boolean;
  notice: string | null;
  briefing: boolean;
  missionActive: boolean;
  comparison: WindowComparison | null;
  searching: boolean;

  init(data: AppData, initial: Partial<Pick<State, 'windowStartMs' | 'windowDays' | 'targetMs' | 'siteId' | 'audience'>>): void;
  setLoadError(message: string): void;
  /** Move the window to start on another day. The moment keeps its time of day. */
  setDate(dayMs: number, glide?: boolean, durationMs?: number): void;
  stepDays(days: number): void;
  /** Move the moment within the current window. */
  setMoment(ms: number, glide?: boolean): void;
  setDisplay(ms: number, moving: boolean): void;
  setWindowDays(days: number): void;
  setSite(id: string): void;
  setAudience(a: Audience): void;
  setPanel(p: Panel): void;
  setPlaying(p: boolean): void;
  setNotice(n: string | null): void;
  startMission(): void;
  dismissBriefing(): void;
  setComparison(c: WindowComparison | null): void;
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const rangeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** First and last days a window of this length can start on. */
export function dateLimits(data: AppData, windowDays: number): { first: number; last: number } {
  return windowDateLimits(data.eph, windowDays);
}

export const useStore = create<State>((set, get) => ({
  data: null,
  loadError: null,
  windowStartMs: 0,
  windowDays: 30,
  targetMs: 0,
  displayMs: 0,
  moving: false,
  motionDurationMs: DATE_TWEEN_MS,
  siteId: '',
  audience: 'planner',
  panel: 'none',
  playing: false,
  notice: null,
  briefing: true,
  missionActive: false,
  comparison: null,
  searching: false,

  init: (data, initial) => {
    const windowDays = initial.windowDays ?? 30;
    const { first, last } = dateLimits(data, windowDays);
    const wanted = startOfUtcDay(initial.windowStartMs ?? Date.now());
    const windowStartMs = Math.min(last, Math.max(first, wanted));
    const half = Math.floor((initial.targetMs ?? Date.now()) / STEP_MS) * STEP_MS;
    const targetMs =
      half >= windowStartMs && half < windowStartMs + windowDays * DAY_MS
        ? half
        : windowStartMs + (((half % DAY_MS) + DAY_MS) % DAY_MS);
    set({
      data,
      windowDays,
      windowStartMs,
      targetMs,
      displayMs: targetMs,
      siteId: data.sites.some((s) => s.id === initial.siteId) ? initial.siteId! : data.sites[0].id,
      audience: initial.audience ?? 'planner',
      briefing: Object.keys(initial).length === 0,
      missionActive: false,
      comparison: null,
      moving: false,
      playing: false,
      motionDurationMs: DATE_TWEEN_MS,
      panel: 'none',
      notice:
        wanted !== windowStartMs
          ? `This tool covers ${rangeFmt.format(first)} to ${rangeFmt.format(last + windowDays * DAY_MS)}. Showing the nearest date it can calculate.`
          : null,
    });
  },
  setLoadError: (loadError) => set({ loadError }),

  setDate: (dayMs, glide = true, durationMs = DATE_TWEEN_MS) => {
    const { data, windowDays, targetMs, windowStartMs } = get();
    if (!data) return;
    const { first, last } = dateLimits(data, windowDays);
    const wanted = startOfUtcDay(dayMs);
    const start = Math.min(last, Math.max(first, wanted));
    const notice =
      wanted !== start
        ? `This tool covers ${rangeFmt.format(first)} to ${rangeFmt.format(last + windowDays * DAY_MS)}. Showing the nearest date it can calculate.`
        : null;
    const next = start + (targetMs - windowStartMs);
    const moment = next < start + windowDays * DAY_MS ? next : start + ((targetMs - windowStartMs) % DAY_MS);
    if (glide && !prefersReducedMotion()) set({ windowStartMs: start, targetMs: moment, moving: moment !== get().displayMs, motionDurationMs: durationMs, notice, playing: false, comparison: null });
    else set({ windowStartMs: start, targetMs: moment, displayMs: moment, moving: false, motionDurationMs: durationMs, notice, playing: false, comparison: null });
  },
  stepDays: (days) => get().setDate(get().windowStartMs + days * DAY_MS),

  setMoment: (ms, glide = false) => {
    const { windowStartMs, windowDays } = get();
    const end = windowStartMs + windowDays * DAY_MS - STEP_MS;
    const moment = Math.min(end, Math.max(windowStartMs, ms));
    if (glide && !prefersReducedMotion()) set({ targetMs: moment, moving: moment !== get().displayMs, motionDurationMs: DATE_TWEEN_MS });
    else set({ targetMs: moment, displayMs: moment, moving: false, motionDurationMs: DATE_TWEEN_MS });
  },
  setDisplay: (displayMs, moving) => set({ displayMs, moving }),
  setWindowDays: (windowDays) => {
    set({ windowDays });
    get().setDate(get().windowStartMs, false);
    get().setMoment(get().targetMs);
  },
  setSite: (siteId) => set(s => ({ siteId, comparison: siteId === s.siteId ? s.comparison : null, motionDurationMs: s.moving ? s.motionDurationMs : DATE_TWEEN_MS })),
  setAudience: (audience) => set({ audience, playing: false }),
  // Opening a panel clears an earlier notice, which would otherwise sit on top of the panel.
  setPanel: (panel) => set(panel === 'none' ? { panel } : { panel, notice: null }),
  setPlaying: (playing) => set({ playing }),
  setNotice: (notice) => set({ notice }),
  startMission: () => {
    const { data } = get();
    if (!data) return;
    set({
      siteId: EXAMPLE_MISSION.siteId,
      windowDays: EXAMPLE_MISSION.days,
      windowStartMs: EXAMPLE_MISSION.startMs,
      targetMs: EXAMPLE_MISSION.startMs,
      displayMs: EXAMPLE_MISSION.startMs,
      moving: false,
      playing: false,
      motionDurationMs: 0,
      audience: 'planner',
      panel: 'none',
      briefing: false,
      missionActive: true,
      comparison: null,
      notice: null,
    });
  },
  dismissBriefing: () => set({ briefing: false }),
  setComparison: (comparison) => set({ comparison }),
}));
