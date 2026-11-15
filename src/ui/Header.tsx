import { useEffect, useRef, useState } from 'react';
import type { AppData } from '../engine/load';
import { DAY_MS } from '../engine/metrics';
import { AUDIENCES, WINDOW_OPTIONS, dateLimits, useStore } from '../state/store';
import { jumpToBest } from './actions';
import { fmtDate, fmtWeekday, isoDay } from './format';
import { useEscape } from './hooks';

const AUDIENCE_LABEL = { planner: 'Planner', educator: 'Educator', public: 'Public' } as const;

/** Pixels of horizontal drag that move the date by one day. */
const DRAG_PX_PER_DAY = 14;

export function Header({ data }: { data: AppData }) {
  const { windowStartMs, windowDays, audience } = useStore();
  const { setDate, stepDays, setWindowDays, setAudience, setPanel } = useStore.getState();
  const limits = dateLimits(data, windowDays);
  const drag = useRef<{ x: number; startMs: number; moved: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEscape(() => setMenuOpen(false), menuOpen);
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [menuOpen]);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="wordmark">Southlight</span>
      </div>

      <div className="datebar" role="group" aria-label="Date">
        <button type="button" className="round" aria-label="Previous day" onClick={() => stepDays(-1)}>
          ‹
        </button>
        <div
          className="date-scrub"
          title="Drag sideways to scrub through days"
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, startMs: windowStartMs, moved: false };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const days = Math.round((e.clientX - d.x) / DRAG_PX_PER_DAY);
            if (days !== 0) d.moved = true;
            // While scrubbing, the date cuts straight to each day so it tracks the pointer.
            if (d.moved) setDate(d.startMs + days * DAY_MS, false);
          }}
          onPointerUp={() => {
            const d = drag.current;
            drag.current = null;
            if (d && !d.moved) input.current?.showPicker?.();
          }}
          onPointerCancel={() => (drag.current = null)}
        >
          <span className="date-weekday">{fmtWeekday.format(windowStartMs)}</span>
          <span className="date-value">{fmtDate.format(windowStartMs)}</span>
          <input
            ref={input}
            type="date"
            aria-label="Start date of the window (UTC)"
            value={isoDay(windowStartMs)}
            min={isoDay(limits.first)}
            max={isoDay(limits.last)}
            onChange={(e) => {
              const ms = Date.parse(`${e.target.value}T00:00:00Z`);
              if (Number.isFinite(ms)) setDate(ms);
            }}
          />
        </div>
        <button type="button" className="round" aria-label="Next day" onClick={() => stepDays(1)}>
          ›
        </button>
      </div>

      <div className="topbar-right">
        <button type="button" className="pill" onClick={() => jumpToBest(data)}>
          Jump to best window
        </button>
        <button type="button" className="pill pill-glass" onClick={() => setPanel('trust')}>
          How we know
        </button>
        <div className="menu-wrap" ref={menu}>
          <button
            type="button"
            className="round"
            aria-label="More options"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="menu" role="group" aria-label="More options">
              <div className="menu-row">
                <span className="menu-label">Window</span>
                <div className="segmented" role="radiogroup" aria-label="Window length">
                  {WINDOW_OPTIONS.map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={d === windowDays} onClick={() => setWindowDays(d)}>
                      {d} days
                    </button>
                  ))}
                </div>
              </div>
              <div className="menu-row">
                <span className="menu-label">View</span>
                <div className="segmented" role="radiogroup" aria-label="Who is this for">
                  {AUDIENCES.map((a) => (
                    <button key={a} type="button" role="radio" aria-checked={a === audience} onClick={() => setAudience(a)}>
                      {AUDIENCE_LABEL[a]}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setPanel('calendar');
                }}
              >
                Calendar of best days
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
