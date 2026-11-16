import { useRef } from 'react';
import { DAY_MS, STEP_MS, startOfUtcDay } from '../engine/metrics';
import { useStore } from '../state/store';
import { fmtDate, fmtTime, isoMinute } from './format';

const DRAG_PX_PER_DAY = 14;

/** These controls inspect a moment. Window controls live with the window totals. */
export function SceneClock() {
  const startMs = useStore(s => s.windowStartMs);
  const days = useStore(s => s.windowDays);
  const targetMs = useStore(s => s.targetMs);
  const displayMs = useStore(s => s.displayMs);
  const moving = useStore(s => s.moving);
  const endMs = startMs + days * DAY_MS - STEP_MS;
  const input = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; ms: number; moved: boolean } | null>(null);
  const step = (days: number) => useStore.getState().setMoment(targetMs + days * DAY_MS, true);

  return (
    <div className="datebar" role="group" aria-label="Scene time (UTC)">
      <button type="button" className="round" aria-label="Previous scene day" disabled={startOfUtcDay(targetMs) <= startMs} onClick={() => step(-1)}>‹</button>
      <div className="date-scrub scene-clock" title="Inspect the scene moment in UTC. Drag sideways to move through this window."
        onPointerDown={e => {
          if (moving) return;
          useStore.getState().setPlaying(false);
          drag.current = { x: e.clientX, ms: targetMs, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          const d = drag.current;
          if (!d) return;
          const delta = Math.round((e.clientX - d.x) / DRAG_PX_PER_DAY);
          if (delta !== 0) d.moved = true;
          if (d.moved) useStore.getState().setMoment(d.ms + delta * DAY_MS);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) input.current?.showPicker?.();
        }}
        onPointerCancel={() => { drag.current = null; }}>
        <span className="scene-clock-label">Scene time · UTC{moving ? ' · travelling' : ''}</span>
        <span className="date-value">{fmtDate.format(displayMs)} <span className="scene-clock-time">{fmtTime.format(displayMs)}</span></span>
        <input ref={input} type="datetime-local" aria-label="Scene moment (UTC)" step={1800} disabled={moving} onFocus={() => useStore.getState().setPlaying(false)}
          min={isoMinute(startMs).slice(0, 16)} max={isoMinute(endMs).slice(0, 16)} value={isoMinute(targetMs).slice(0, 16)}
          onChange={e => {
            const value = Date.parse(`${e.target.value}Z`);
            if (Number.isFinite(value)) useStore.getState().setMoment(Math.floor(value / STEP_MS) * STEP_MS);
          }} />
      </div>
      <button type="button" className="round" aria-label="Next scene day" disabled={startOfUtcDay(targetMs) >= startOfUtcDay(endMs)} onClick={() => step(1)}>›</button>
    </div>
  );
}
