import type { AppData } from '../engine/load';
import { DAY_MS } from '../engine/metrics';
import { dateLimits, useStore } from '../state/store';
import { fmtDate, isoDay } from './format';

export function WindowRange({ data }: { data: AppData }) {
  const startMs = useStore(s => s.windowStartMs);
  const days = useStore(s => s.windowDays);
  const { first, last } = dateLimits(data, days);
  return (
    <section className="assessment-window" aria-label="Assessment window">
      <p className="eyebrow">{days}-day assessment window</p>
      <p className="window-range">{fmtDate.format(startMs)} → {fmtDate.format(startMs + days * DAY_MS)} UTC</p>
      <label className="window-start-control">Window start
        <input type="date" aria-label="Start date of the window (UTC)" value={isoDay(startMs)} min={isoDay(first)} max={isoDay(last)}
          onChange={e => {
            const value = Date.parse(`${e.target.value}T00:00:00Z`);
            if (Number.isFinite(value)) useStore.getState().setDate(value);
          }} />
      </label>
      <p className="window-help">Totals cover the window. Scene time inspects one moment.</p>
    </section>
  );
}
