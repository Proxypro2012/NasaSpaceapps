import { memo, useMemo, useState } from 'react';
import type { AppData } from '../engine/load';
import { DAY_MS, STEP_MS } from '../engine/metrics';
import { skyAt } from '../engine/sky';
import { obstructionExplanation, visibilityPeriods, visibilitySamples, type VisibilityCause } from '../engine/timeline';
import type { Site } from '../engine/types';
import { useStore } from '../state/store';
import { fmtDate, fmtDayMonth, fmtTime } from './format';
import { HorizonChart } from './HorizonChart';

const LABEL: Record<VisibilityCause, string> = {
  visible: 'at least half the disc visible', terrain: 'terrain obstruction',
  eclipse: 'lunar eclipse', 'terrain-eclipse': 'terrain obstruction and lunar eclipse',
};

export const VisibilityTimeline = memo(function VisibilityTimeline({ data, site, startMs, days }: { data: AppData; site: Site; startMs: number; days: number }) {
  const displayMs = useStore(s => s.displayMs);
  const targetMs = useStore(s => s.targetMs);
  const moving = useStore(s => s.moving);
  const [skylineOpen, setSkylineOpen] = useState(false);
  const samples = useMemo(() => visibilitySamples(data.eph, site, startMs, days), [data.eph, site, startMs, days]);
  const periods = useMemo(() => ({ sun: visibilityPeriods(samples, 'sun'), earth: visibilityPeriods(samples, 'earth') }), [samples]);
  const sky = useMemo(() => skyAt(data.eph, site, displayMs), [data.eph, site, displayMs]);
  const span = days * DAY_MS;
  const cursor = Math.max(0, Math.min(100, (displayMs - startMs) / span * 100));
  const pick = (ms: number) => {
    useStore.getState().setPlaying(false);
    useStore.getState().setMoment(ms);
    setSkylineOpen(true);
  };
  return (
    <section className="visibility-timeline" aria-labelledby="timeline-title">
      <div className="timeline-heading"><h2 id="timeline-title">Follow the light. Keep Earth in sight.</h2><span>UTC</span></div>
      <p className="timeline-help" id="timeline-help">Select a strip to inspect that moment. Dark hatching means terrain; crosshatching means eclipse.</p>
      <div className="timeline-strips">
        {(['sun', 'earth'] as const).map(body => <div className={`timeline-row timeline-${body}`} key={body}>
          <span className="timeline-label">{body === 'sun' ? 'Sun' : 'Earth'}</span>
          <button type="button" className="timeline-track" aria-label={`${body === 'sun' ? 'Sunlight' : 'Earth visibility'} timeline. Click a moment, or press Enter to inspect the first interruption.`} aria-describedby="timeline-help"
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const first = periods[body].find(p => p.cause !== 'visible') ?? periods[body][0];
              const ms = e.detail === 0
                ? first.startMs + Math.floor((first.endMs - first.startMs) / STEP_MS / 2) * STEP_MS
                : startMs + Math.max(0, Math.min(samples.length - 1, Math.floor((e.clientX - rect.left) / rect.width * samples.length))) * STEP_MS;
              pick(ms);
            }}>
            {periods[body].map(p => <span key={p.startMs} className="timeline-period" data-cause={p.cause}
              style={{ flexBasis: `${(p.endMs - p.startMs) / span * 100}%` }}
              title={`${fmtDate.format(p.startMs)}, ${fmtTime.format(p.startMs)} to ${fmtDate.format(p.endMs)}, ${fmtTime.format(p.endMs)} UTC: ${LABEL[p.cause]}`}
              aria-hidden="true" />)}
            <span className="timeline-cursor" style={{ transform: `translateX(${cursor}%)` }} aria-hidden="true"><i /></span>
          </button>
        </div>)}
      </div>
      <div className="timeline-dates"><span>{fmtDayMonth.format(startMs)}</span><span>{days} days</span><span>{fmtDayMonth.format(startMs + span)}</span></div>
      <label className="timeline-scrubber"><span className="sr-only">Shared timeline moment</span><input type="range" min={0} max={samples.length - 1} step={1}
        value={Math.max(0, Math.min(samples.length - 1, Math.round((targetMs - startMs) / STEP_MS)))}
        aria-valuetext={`${fmtDate.format(targetMs)}, ${fmtTime.format(targetMs)} UTC`}
        onChange={e => pick(startMs + Number(e.target.value) * STEP_MS)} /></label>
      <p className="moment-readout">{moving ? 'Scene travelling · ' : ''}{fmtDate.format(displayMs)}, {fmtTime.format(displayMs)} UTC</p>
      <p className="moment-explanation">{obstructionExplanation(sky)}</p>
      <details className="timeline-interruptions search-method"><summary>Inspect an interruption</summary><div className="interruption-list">
        {(['sun', 'earth'] as const).flatMap(body => periods[body].filter(p => p.cause !== 'visible').map(p =>
          <button type="button" className="link" key={`${body}-${p.startMs}`} onClick={() => pick(p.startMs + Math.floor((p.endMs - p.startMs) / STEP_MS / 2) * STEP_MS)}>
            {body === 'sun' ? 'Sun' : 'Earth'} · {fmtDayMonth.format(p.startMs)} {fmtTime.format(p.startMs)}–{fmtDayMonth.format(p.endMs)} {fmtTime.format(p.endMs)} · {LABEL[p.cause]}
          </button>))}
        {periods.sun.every(p => p.cause === 'visible') && periods.earth.every(p => p.cause === 'visible') && <p>No below-threshold interruptions in this sampled window.</p>}
      </div></details>
      <details className="timeline-skyline more" open={skylineOpen} onToggle={e => setSkylineOpen(e.currentTarget.open)}>
        <summary>Skyline at this moment</summary>
        {skylineOpen && <><HorizonChart eph={data.eph} site={site} ms={displayMs} windowStartMs={startMs} windowDays={days} />
          <button type="button" className="link" onClick={() => useStore.getState().setPanel('dive')}>See the terrain in 3D</button></>}
      </details>
      <p className="timeline-note">Half-disc visibility, sampled every 30 minutes. Strip boundaries are estimates; partial light can remain in an unavailable sample.</p>
    </section>
  );
});
