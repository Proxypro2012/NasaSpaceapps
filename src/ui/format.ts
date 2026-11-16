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
  // Number() drops a trailing ".0", so a whole week reads "7 days", not "7.0 days".
  return `${days >= 10 ? Math.round(days) : Number(days.toFixed(1))} days`;
}

/** A window length as a preset name: "7 days", "1 lunar day", "1 year". */
export function windowLabel(days: number): string {
  if (days === 29.5) return '1 lunar day';
  if (days === 365) return '1 year';
  return `${days} days`;
}

/** A window length before a noun: "7-day", "lunar-day", "1-year". */
export function windowAdjective(days: number): string {
  if (days === 29.5) return 'lunar-day';
  if (days === 365) return '1-year';
  return `${days}-day`;
}

/** Distance in km: one decimal under 100 km. */
export const km = (v: number): string => `${v < 100 ? v.toFixed(1) : Math.round(v)} km`;

export const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (az: number): string => COMPASS[Math.round((((az % 360) + 360) % 360) / 45) % 8];

export const VERDICT_GLYPH: Record<Verdict, string> = { Good: '✓', Risky: '!', Poor: '✕' };

export const VERDICT_MEANING: Record<Verdict, string> = {
  Good: 'Enough sunlight, and no long stretch of darkness.',
  Risky: 'Workable, but the sunlight or the dark stretch is marginal.',
  Poor: 'Too little sunlight, or a dark stretch too long to ride out.',
};
