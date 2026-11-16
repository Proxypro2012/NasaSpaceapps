import { useStore } from '../state/store';

export function MonthTourControl() {
  const status = useStore(s => s.monthTour?.status);
  const label = status === 'playing' ? 'Pause lunar month' : status === 'paused' ? 'Resume lunar month' : status === 'complete' ? 'Replay lunar month' : 'Play a lunar month';
  return (
    <div className="month-tour-control">
      <button type="button" className="pill pill-glass" onClick={() => {
        const s = useStore.getState();
        if (status === 'playing') s.pauseMonth(); else s.playMonth();
      }}>{label}</button>
      {status && <span className="month-tour-status" role="status">{status === 'complete' ? '30-day tour complete' : status === 'paused' ? 'Tour paused · totals fixed' : '30-day tour · totals fixed'}</span>}
    </div>
  );
}
