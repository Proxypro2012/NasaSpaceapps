import { useState } from 'react';
import type { AppData } from '../engine/load';
import { DAY_MS, startOfUtcDay } from '../engine/metrics';
import type { DayCell, Site } from '../engine/types';
import { useStore } from '../state/store';
import { BestWindowButton } from './Mission';
import { fmtDate, fmtDayMonth, pct } from './format';
import { useCalendar, useEscape } from './hooks';

interface Props {
  sites: Site[];
  cells: Record<string, DayCell[]>;
  selectedSite: string;
  momentMs: number;
  onPick(siteId: string, dayMs: number): void;
}

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
export function Calendar({ sites, cells, selectedSite, momentMs, onPick }: Props) {
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
            'Each square is one day. Brighter means more of that day has both sunlight and a line of sight to Earth.'
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
                style={{ background: rampColor(cell.combinedPct / 100) }}
                data-current={site.id === selectedSite && cell.dayMs === momentDay}
                aria-label={`${site.name}, ${fmtDate.format(cell.dayMs)}: Sun and Earth together ${pct(cell.combinedPct)} of the day`}
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
export function CalendarSheet({ data }: { data: AppData }) {
  const { windowStartMs, windowDays, siteId, targetMs } = useStore();
  const cells = useCalendar(data, windowStartMs, windowDays);
  const close = () => useStore.getState().setPanel('none');
  useEscape(close);

  return (
    <div className="sheet-backdrop" onClick={close}>
      <section
        className="sheet sheet-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Calendar of best days"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-head">
          <h1>Best days at a glance</h1>
          <button type="button" className="round round-x" aria-label="Close" onClick={close} autoFocus>
            ✕
          </button>
        </header>
        <div className="sheet-body">
          <Calendar
            sites={data.sites}
            cells={cells}
            selectedSite={siteId}
            momentMs={targetMs}
            onPick={(id, ms) => {
              useStore.getState().setSite(id);
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
