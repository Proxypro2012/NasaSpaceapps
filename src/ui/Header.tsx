import { useEffect, useRef, useState } from 'react';
import type { AppData } from '../engine/load';
import { AUDIENCES, WINDOW_OPTIONS, useStore } from '../state/store';
import { BestWindowButton } from './Mission';
import { launchMission } from './actions';
import { SceneClock } from './SceneClock';
import { MonthTourControl } from './MonthTour';
import { windowLabel } from './format';
import { useEscape } from './hooks';

const AUDIENCE_LABEL = { planner: 'Planner', educator: 'Educator', public: 'Public' } as const;

export function Header({ data }: { data: AppData }) {
  const windowDays = useStore(s => s.windowDays);
  const audience = useStore(s => s.audience);
  const { setWindowDays, setAudience, setPanel } = useStore.getState();

  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEscape(() => setMenuOpen(false), menuOpen);
  useEffect(() => {
    if (!menuOpen) return;
    const position = () => {
      const wrap = menu.current;
      if (wrap) wrap.style.setProperty('--menu-top', `${wrap.getBoundingClientRect().bottom + 8}px`);
    };
    position();
    window.addEventListener('resize', position);
    const away = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('pointerdown', away);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('resize', position);
    };
  }, [menuOpen]);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="wordmark">Southlight</span>
      </div>

      <SceneClock />

      <div className="topbar-right">
        <MonthTourControl />
        <BestWindowButton data={data} />
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
                <div className="segmented window-presets" role="radiogroup" aria-label="Window length">
                  {WINDOW_OPTIONS.map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={d === windowDays} onClick={() => setWindowDays(d)}>
                      {windowLabel(d)}
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
              <button type="button" className="menu-item" onClick={() => { setMenuOpen(false); launchMission(); }}>Restart example mission</button>
              <button type="button" className="menu-item" onClick={() => { setMenuOpen(false); setPanel('submission'); }}>Project guide &amp; walkthrough</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
