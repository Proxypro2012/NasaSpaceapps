import { create } from 'zustand';
import type { AppData } from '../engine/load';
import { DAY_MS, STEP_MS, startOfUtcDay, windowDateLimits } from '../engine/metrics';
import { EXAMPLE_MISSION, type WindowComparison } from './mission';

export type Audience = 'planner' | 'educator' | 'public';
export type Panel = 'none' | 'trust' | 'dive' | 'calendar' | 'submission';

/** Window lengths in days. 29.5 is one lunar day (sunrise to sunrise); 365 is one year. */
export const WINDOW_OPTIONS = [7, 14, 29.5, 30, 365] as const;
export const AUDIENCES: Audience[] = ['planner', 'educator', 'public'];
export const DATE_TWEEN_MS = 1200;
export const MONTH_TOUR_MS = 20_000;
export interface MonthTour { status: 'playing' | 'paused' | 'complete'; elapsedMs: number }
const pausedTour = (tour: MonthTour | null): MonthTour | null => tour?.status === 'playing' ? { ...tour, status: 'paused' } : tour;

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
  /** Explicit pin/row camera requests, including reselecting the same site. */
  siteFocusVersion: number;
  cameraFocus: 'site' | 'moon';
  audience: Audience;
  panel: Panel;
  playing: boolean;
  monthTour: MonthTour | null;
  notice: string | null;
  briefing: boolean;
  missionActive: boolean;
  comparison: WindowComparison | null;
  searching: boolean;
  /** Increments when a saved view is restored, even if its values are equal. */
  navigationVersion: number;

  init(data: AppData, initial: Partial<Pick<State, 'windowStartMs' | 'windowDays' | 'targetMs' | 'siteId' | 'audience'>>): void;
  setLoadError(message: string): void;
  /** Move the window to start on another day. The moment keeps its time of day. */
  setDate(dayMs: number, glide?: boolean, durationMs?: number): void;
  stepDays(days: number): void;
  /** Move the moment within the current window. */
  setMoment(ms: number, glide?: boolean): void;
  setDisplay(ms: number, moving: boolean): void;
  setWindowDays(days: number): void;
  setSite(id: string, focus?: boolean): void;
  setAudience(a: Audience): void;
  setPanel(p: Panel): void;
  setPlaying(p: boolean): void;
  playMonth(): void;
  pauseMonth(): void;
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
  siteFocusVersion: 0,
  cameraFocus: 'moon',
  audience: 'planner',
  panel: 'none',
  playing: false,
  monthTour: null,
  notice: null,
  briefing: true,
  missionActive: false,
  comparison: null,
  searching: false,
  navigationVersion: 0,

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
      searching: false,
      navigationVersion: get().navigationVersion + 1,
      moving: false,
      playing: false,
      monthTour: null,
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
    if (glide && !prefersReducedMotion()) set({ windowStartMs: start, targetMs: moment, moving: moment !== get().displayMs, motionDurationMs: durationMs, notice, playing: false, monthTour: null, comparison: null });
    else set({ windowStartMs: start, targetMs: moment, displayMs: moment, moving: false, motionDurationMs: durationMs, notice, playing: false, monthTour: null, comparison: null });
  },
  stepDays: (days) => get().setDate(get().windowStartMs + days * DAY_MS),

  setMoment: (ms, glide = false) => {
    if (!Number.isFinite(ms)) return;
    const { windowStartMs, windowDays } = get();
    const end = windowStartMs + windowDays * DAY_MS - STEP_MS;
    const moment = Math.min(end, Math.max(windowStartMs, ms));
    if (glide && !prefersReducedMotion()) set({ targetMs: moment, moving: moment !== get().displayMs, motionDurationMs: DATE_TWEEN_MS, playing: false, monthTour: null });
    else set({ targetMs: moment, displayMs: moment, moving: false, motionDurationMs: DATE_TWEEN_MS, playing: false, monthTour: null });
  },
  setDisplay: (displayMs, moving) => set({ displayMs, moving }),
  setWindowDays: (windowDays) => {
    set({ windowDays });
    get().setDate(get().windowStartMs, false);
    get().setMoment(get().targetMs);
  },
  setSite: (siteId, focus = false) => set(s => ({ siteId, siteFocusVersion: s.siteFocusVersion + (focus ? 1 : 0), cameraFocus: focus ? 'site' : s.cameraFocus, comparison: siteId === s.siteId ? s.comparison : null, motionDurationMs: s.moving ? s.motionDurationMs : DATE_TWEEN_MS })),
  setAudience: (audience) => set(s => ({ audience, playing: false, monthTour: pausedTour(s.monthTour) })),
  // Opening a panel clears an earlier notice, which would otherwise sit on top of the panel.
  setPanel: (panel) => set(s => panel === 'none' ? { panel } : { panel, notice: null, monthTour: pausedTour(s.monthTour) }),
  setPlaying: (playing) => set(s => ({ playing, monthTour: playing ? null : pausedTour(s.monthTour) })),
  playMonth: () => {
    const s = get();
    if (!s.data) return;
    if (s.monthTour?.status === 'paused' && !prefersReducedMotion()) {
      set({ monthTour: { ...s.monthTour, status: 'playing' }, playing: false });
      return;
    }
    const { first, last } = dateLimits(s.data, 30);
    const start = Math.min(last, Math.max(first, s.windowStartMs));
    const reduced = prefersReducedMotion();
    const moment = reduced ? start + 30 * DAY_MS - STEP_MS : start;
    set({ windowStartMs: start, windowDays: 30, displayMs: moment, targetMs: moment,
      moving: false, motionDurationMs: 0, playing: false, briefing: false, comparison: null,
      monthTour: { status: reduced ? 'complete' : 'playing', elapsedMs: reduced ? MONTH_TOUR_MS : 0 },
      cameraFocus: 'moon', siteFocusVersion: s.siteFocusVersion + 1,
      notice: reduced ? 'Reduced motion is on. Showing the end of the 30-day window; use the scene controls to inspect each day.'
        : start !== s.windowStartMs ? 'The 30-day tour uses the nearest start within the available data.' : null });
  },
  pauseMonth: () => set(s => ({ monthTour: pausedTour(s.monthTour) })),
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
      monthTour: null,
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
