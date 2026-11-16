import { useState } from 'react';
import type { AppData } from '../engine/load';
import { DAY_MS, startOfUtcDay } from '../engine/metrics';
import type { DayCell, Site, WindowMetrics } from '../engine/types';
import { useStore } from '../state/store';
import { BestWindowButton } from './Mission';
import { duration, fmtDate, fmtDayMonth, pct } from './format';
import { useCalendar, useEscape } from './hooks';

interface Props {
  sites: Site[];
  cells: Record<string, DayCell[]>;
  selectedSite: string;
  momentMs: number;
  metric?: CalendarMetric;
  onPick(siteId: string, dayMs: number): void;
}

type CalendarMetric = 'sunlightPct' | 'earthLinkPct' | 'combinedPct';
const METRIC_LABEL: Record<CalendarMetric, string> = { sunlightPct: 'Sunlight', earthLinkPct: 'Earth visibility', combinedPct: 'Sun and Earth together' };

// One hue family, dark to light, so more light on the screen means more of the day is usable.
const RAMP: [number, number, number][] = [
  [26, 37, 64],
  [84, 66, 86],
  [156, 110, 96],
  [224, 172, 128],
  [255, 232, 190],
];

export function rampColor(share: number): string {
  const t = Math.min(1, Math.max(0, share)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t));
  const f = t - i;
  const c = RAMP[i].map((v, k) => Math.round(v + (RAMP[i + 1][k] - v) * f));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

/** Every site by every day of the window: the share of each day with both the Sun and Earth in view. */
export function Calendar({ sites, cells, selectedSite, momentMs, metric = 'combinedPct', onPick }: Props) {
  const [hover, setHover] = useState<{ site: Site; cell: DayCell } | null>(null);
  const days = cells[sites[0].id];
  const momentDay = startOfUtcDay(momentMs);
  const sparse = days.length > 14;

  return (
    <section className="calendar" aria-label="Calendar of usable days">
      <header className="calendar-head">
        <p className="calendar-readout" aria-live="polite">
          {hover ? (
            <>
              <strong>
                {hover.site.name}, {fmtDate.format(hover.cell.dayMs)}
              </strong>
              : Sun {pct(hover.cell.sunlightPct)} of the day, Earth {pct(hover.cell.earthLinkPct)}, both together{' '}
              {pct(hover.cell.combinedPct)}
            </>
          ) : (
            `Each square is one day. Brighter means more ${METRIC_LABEL[metric].toLowerCase()} during that day.`
          )}
        </p>
        <div className="ramp-key" aria-hidden="true">
          <span>0%</span>
          <i style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(rampColor).join(',')})` }} />
          <span>100%</span>
        </div>
      </header>
      <div className="calendar-grid" style={{ gridTemplateColumns: `minmax(118px, auto) repeat(${days.length}, minmax(0, 1fr))` }}>
        <span />
        {days.map((d, i) => {
          const date = new Date(d.dayMs);
          const first = i === 0 || date.getUTCDate() === 1;
          const sinceFirst = date.getUTCDate() === 1 || i === 0 ? 0 : Math.min(i, date.getUTCDate() - 1);
          const show = first || (sinceFirst >= 3 && (!sparse || date.getUTCDate() % 5 === 0));
          return (
            <span key={d.dayMs} className="calendar-day" data-first={first}>
              {show ? (first ? fmtDayMonth.format(d.dayMs) : date.getUTCDate()) : ''}
            </span>
          );
        })}
        {sites.map((site) => (
          <div className="calendar-row" key={site.id} data-selected={site.id === selectedSite}>
            <span className="calendar-site">{site.name}</span>
            {cells[site.id].map((cell) => (
              <button
                key={cell.dayMs}
                type="button"
                className="calendar-cell"
                style={{ background: rampColor(cell[metric] / 100) }}
                data-current={site.id === selectedSite && cell.dayMs === momentDay}
                aria-label={`${site.name}, ${fmtDate.format(cell.dayMs)}: ${METRIC_LABEL[metric]} ${pct(cell[metric])} of the day`}
                onPointerEnter={() => setHover({ site, cell })}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover({ site, cell })}
                onBlur={() => setHover(null)}
                onClick={() => onPick(site.id, cell.dayMs + (((momentMs % DAY_MS) + DAY_MS) % DAY_MS))}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/** The calendar on its own screen. Picking a day sets the site and the moment, then returns to the Moon. */
export function CalendarSheet({ data, metrics }: { data: AppData; metrics: Record<string, WindowMetrics> }) {
  const windowStartMs = useStore(s => s.windowStartMs);
  const windowDays = useStore(s => s.windowDays);
  const siteId = useStore(s => s.siteId);
  const targetMs = useStore(s => s.targetMs);
  const [metric, setMetric] = useState<CalendarMetric>('combinedPct');
  const cells = useCalendar(data, windowStartMs, windowDays);
  const close = () => useStore.getState().setPanel('none');
  useEscape(close);

  return (
    <div className="sheet-backdrop" onClick={close}>
      <section
        className="sheet sheet-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-comparison-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-head">
          <h1 id="site-comparison-title">Compare sites and days</h1>
          <button type="button" className="round round-x" aria-label="Close" onClick={close} autoFocus>
            ✕
          </button>
        </header>
        <div className="sheet-body">
          <p className="comparison-window"><strong>{windowDays}-day assessment window</strong> · {fmtDate.format(windowStartMs)} → {fmtDate.format(windowStartMs + windowDays * DAY_MS)} UTC</p>
          <div className="site-comparison-scroll" role="region" aria-label="Side-by-side site metrics; scroll horizontally on small screens" tabIndex={0}>
            <table className="site-comparison-table">
              <caption className="sr-only">All sites assessed for the same {windowDays}-day window</caption>
              <thead><tr><td /><>{data.sites.map(site => <th scope="col" key={site.id} data-selected={site.id === siteId}>
                <button type="button" className="link" aria-pressed={site.id === siteId} onClick={() => { useStore.getState().setSite(site.id, true); close(); }}>{site.name}</button>
              </th>)}</></tr></thead>
              <tbody>{([
                ['Sunlight verdict', (m: WindowMetrics) => m.verdict],
                ['Sunlight', (m: WindowMetrics) => pct(m.sunlightPct)],
                ['Longest dark', (m: WindowMetrics) => duration(m.longestDarkHours)],
                ['Earth in view', (m: WindowMetrics) => pct(m.earthLinkPct)],
                ['Longest Earth gap', (m: WindowMetrics) => duration(m.longestEarthGapHours)],
                ['Both together', (m: WindowMetrics) => pct(m.combinedPct)],
              ] as const).map(([label, format]) => <tr key={label}><th scope="row">{label}</th>{data.sites.map(site => <td key={site.id} data-site={site.id} data-selected={site.id === siteId}>{format(metrics[site.id])}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="comparison-definitions">Verdicts describe sunlight. Earth gaps are consecutive samples with less than half of Earth above terrain, clipped to this window; they do not predict radio service. Durations use 30-minute samples. Select a site heading to inspect it.</p>
          <div className="segmented calendar-layers" role="radiogroup" aria-label="Daily visibility layer">
            {(['sunlightPct', 'earthLinkPct', 'combinedPct'] as const).map(key => <button type="button" role="radio" key={key} aria-checked={metric === key} onClick={() => setMetric(key)}>{key === 'sunlightPct' ? 'Sunlight' : key === 'earthLinkPct' ? 'Earth' : 'Both'}</button>)}
          </div>
          <p className="muted">Inspect a day within the current assessment window. Selecting a square changes the scene time; the window totals keep the same date range.</p>
          <Calendar
            sites={data.sites}
            cells={cells}
            selectedSite={siteId}
            momentMs={targetMs}
            metric={metric}
            onPick={(id, ms) => {
              useStore.getState().setSite(id, true);
              useStore.getState().setMoment(ms, true);
              close();
            }}
          />
          <BestWindowButton data={data} />
        </div>
      </section>
    </div>
  );
}
