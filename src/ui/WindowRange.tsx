import type { AppData } from '../engine/load';
import { DAY_MS } from '../engine/metrics';
import { dateLimits, useStore } from '../state/store';
import { fmtDate, fmtTime, isoDay, windowAdjective } from './format';

const HELP = 'Totals cover the window. Scene time inspects one moment.';

export function WindowRange({ data }: { data: AppData }) {
  const startMs = useStore(s => s.windowStartMs);
  const days = useStore(s => s.windowDays);
  const { first, last } = dateLimits(data, days);
  const endMs = startMs + days * DAY_MS;
  return (
    <section className="assessment-window" aria-label="Assessment window" aria-describedby="window-help">
      <p className="eyebrow">{windowAdjective(days)} assessment window</p>
      {/* The range and its start picker share one row so the card stays on screen. */}
      <div className="window-row">
        <p className="window-range" title={HELP}>{fmtDate.format(startMs)} → {fmtDate.format(endMs)}{days % 1 ? `, ${fmtTime.format(endMs)}` : ''} UTC</p>
        <label className="window-start-control"><span className="sr-only">Window start</span>
          <input type="date" aria-label="Start date of the window (UTC)" value={isoDay(startMs)} min={isoDay(first)} max={isoDay(last)}
            onChange={e => {
              const value = Date.parse(`${e.target.value}T00:00:00Z`);
              if (Number.isFinite(value)) useStore.getState().setDate(value);
            }} />
        </label>
      </div>
      <p className="sr-only" id="window-help">{HELP}</p>
    </section>
  );
}
