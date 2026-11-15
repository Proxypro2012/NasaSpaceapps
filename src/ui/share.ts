import type { AppData } from '../engine/load';
import { DAY_MS, STEP_MS } from '../engine/metrics';
import { emptySky, skyAt } from '../engine/sky';
import type { Site, WindowMetrics } from '../engine/types';
import { AUDIENCES, WINDOW_OPTIONS, type Audience } from '../state/store';
import { isoDay, isoMinute } from './format';

export interface LinkState {
  windowStartMs: number;
  windowDays: number;
  targetMs: number;
  siteId: string;
  audience: Audience;
}

/** The link carries the date, window, moment, site and view, so it reopens exactly what was on screen. */
export function encodeLink(s: LinkState): string {
  const p = new URLSearchParams({
    date: isoDay(s.windowStartMs),
    days: String(s.windowDays),
    at: isoMinute(s.targetMs),
    site: s.siteId,
    view: s.audience,
  });
  return `#${p.toString()}`;
}

export function decodeLink(hash: string): Partial<LinkState> {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const out: Partial<LinkState> = {};
  const date = Date.parse(`${p.get('date')}T00:00:00Z`);
  if (Number.isFinite(date)) out.windowStartMs = date;
  const days = Number(p.get('days'));
  if ((WINDOW_OPTIONS as readonly number[]).includes(days)) out.windowDays = days;
  const at = Date.parse(p.get('at') ?? '');
  if (Number.isFinite(at)) out.targetMs = at;
  else if (out.windowStartMs !== undefined) out.targetMs = out.windowStartMs + (Date.now() % DAY_MS);
  const site = p.get('site');
  if (site) out.siteId = site;
  const view = p.get('view') as Audience | null;
  if (view && AUDIENCES.includes(view)) out.audience = view;
  return out;
}

/** Every 30-minute step of the window for one site, as the engine computed it. */
export function windowCsv(data: AppData, site: Site, startMs: number, days: number, m: WindowMetrics): string {
  const lines = [
    `# Site,${site.name}`,
    `# Latitude (deg),${site.lat_deg}`,
    `# East longitude (deg),${site.lon_deg}`,
    `# Height above 1737.4 km sphere (m),${site.height_m}`,
    `# Window start (UTC),${isoMinute(startMs)}`,
    `# Window length (days),${days}`,
    `# Sunlight (% of steps with at least half the Sun's disc in view),${m.sunlightPct.toFixed(2)}`,
    `# Longest dark stretch (hours without direct sunlight including eclipses),${m.longestDarkHours}`,
    `# Earth line of sight (% of steps with at least half of Earth's disc in view),${m.earthLinkPct.toFixed(2)}`,
    `# Sun and Earth together (%),${m.combinedPct.toFixed(2)}`,
    `# Verdict (this project's own thresholds),${m.verdict}`,
    `# Terrain,${data.sitesFile.terrain_file}`,
    `# Comparison terrain,${data.sitesFile.comparison_terrain_file}`,
    `# Comparison sunlight (%),${m.resolution?.sunlightPct.toFixed(2) ?? 'not evaluated'}`,
    `# Comparison verdict,${m.resolution?.verdict ?? 'not evaluated'}`,
    `# Terrain-sensitive verdict,${m.resolution?.sensitive ?? false}`,
    '# Solar visibility includes terrain obstruction and geometric eclipses by Earth',
    `# Ephemeris,${data.eph.meta.kernels.join(' ')}`,
    'time_utc,sun_azimuth_deg,sun_elevation_deg,sun_visible_fraction,earth_azimuth_deg,earth_elevation_deg,earth_visible_fraction',
  ];
  const s = emptySky();
  const steps = (days * DAY_MS) / STEP_MS;
  for (let i = 0; i < steps; i++) {
    const t = startMs + i * STEP_MS;
    skyAt(data.eph, site, t, s);
    lines.push(
      [
        isoMinute(t),
        s.sun.az.toFixed(3),
        s.sun.el.toFixed(3),
        s.sun.frac.toFixed(3),
        s.earth.az.toFixed(3),
        s.earth.el.toFixed(3),
        s.earth.frac.toFixed(3),
      ].join(','),
    );
  }
  return lines.join('\n') + '\n';
}

export function download(name: string, text: string, type = 'text/csv'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
