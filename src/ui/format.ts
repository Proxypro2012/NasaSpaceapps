import type { Verdict } from '../engine/types';

const utc = { timeZone: 'UTC' } as const;
export const fmtDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...utc });
export const fmtDayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', ...utc });
export const fmtWeekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', ...utc });
export const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, ...utc });

export const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const isoMinute = (ms: number): string => new Date(ms).toISOString().slice(0, 16) + 'Z';

export const pct = (v: number): string => `${Math.round(v)}%`;

/** A duration the way a person would say it: hours up to two days, then days. */
export function duration(hours: number): string {
  if (hours < 0.25) return 'none';
  if (hours < 48) return `${hours % 1 === 0 ? hours : hours.toFixed(1)} h`;
  const days = hours / 24;
  return `${days >= 10 ? Math.round(days) : days.toFixed(1)} days`;
}

export const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (az: number): string => COMPASS[Math.round((((az % 360) + 360) % 360) / 45) % 8];

export const VERDICT_GLYPH: Record<Verdict, string> = { Good: '✓', Risky: '!', Poor: '✕' };

export const VERDICT_MEANING: Record<Verdict, string> = {
  Good: 'Enough sunlight, and no long stretch of darkness.',
  Risky: 'Workable, but the sunlight or the dark stretch is marginal.',
  Poor: 'Too little sunlight, or a dark stretch too long to ride out.',
};
