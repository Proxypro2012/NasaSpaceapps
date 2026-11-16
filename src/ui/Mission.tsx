import type { AppData } from '../engine/load';
import { DAY_MS } from '../engine/metrics';
import type { WindowMetrics } from '../engine/types';
import { useStore } from '../state/store';
import { findBetterWindow, launchMission } from './actions';
import { duration, fmtDate, pct } from './format';

export function BestWindowButton({ data }: { data: AppData }) {
  const searching = useStore(s => s.searching);
  return <button type="button" className="pill" disabled={searching} aria-busy={searching} onClick={() => void findBetterWindow(data)}>
    {searching ? 'Comparing windows…' : 'Find a better window'}
  </button>;
}

export function MissionBriefing({ hidden = false }: { hidden?: boolean }) {
  const visible = useStore(s => s.briefing);
  const ready = useStore(s => s.data !== null);
  if (!visible || hidden) return null;
  return (
    <section className="mission-briefing" aria-labelledby="mission-title">
      <p className="eyebrow">A mission to the lunar south pole</p>
      <h1 id="mission-title">Find seven days with sunlight and Earth in view.</h1>
      <p>A bright landing site can still lose sight of home. Discover how a different date changes the same place.</p>
      <div className="mission-actions">
        <button type="button" className="pill" disabled={!ready} onClick={launchMission}>Try a mission <span aria-hidden="true">→</span></button>
        <button type="button" className="link" disabled={!ready} onClick={() => useStore.getState().dismissBriefing()}>Explore freely</button>
      </div>
      <p className="mission-footnote">Real NASA geometry · Three sites · No sign-in</p>
    </section>
  );
}

export function MissionPrompt({ data, metrics }: { data: AppData; metrics: WindowMetrics }) {
  const active = useStore(s => s.missionActive);
  const comparison = useStore(s => s.comparison);
  const days = useStore(s => s.windowDays);
  if (comparison) return null;
  return (
    <section className="mission-prompt" aria-label="Mission objective">
      <p className="eyebrow">{active ? 'Your mission' : 'Window objective'}</p>
      <p>{active ? `Can you find ${days} days with the Sun and Earth in view together?` : 'Find the most time with sunlight and Earth in view together.'}</p>
      <p className="together-readout"><strong>{pct(metrics.combinedPct)}</strong> together in this window</p>
      <BestWindowButton data={data} />
      {active && metrics.sunlightPct > 99 && metrics.earthLinkPct < 1 && <p className="mission-hint">Sunlight alone looks ideal. But the terrain hides Earth for this entire window. Try a different date.</p>}
    </section>
  );
}

export function MissionComparison() {
  const comparison = useStore(s => s.comparison);
  const moving = useStore(s => s.moving);
  if (!comparison) return null;
  const { original, recommended, comparisonMapStartMs } = comparison;
  const before = original.metrics;
  const after = recommended.metrics;
  const shift = Math.round((recommended.startMs - original.startMs) / DAY_MS);
  const extraHours = (after.combinedPct - before.combinedPct) * original.days * 24 / 100;
  const improvement = extraHours > 0.01;
  const rows = [
    ['Sunlight', pct(before.sunlightPct), pct(after.sunlightPct)],
    ['Earth in view', pct(before.earthLinkPct), pct(after.earthLinkPct)],
    ['Both together', pct(before.combinedPct), pct(after.combinedPct)],
    ['Longest dark', duration(before.longestDarkHours), duration(after.longestDarkHours)],
    ['Longest Earth gap', duration(before.longestEarthGapHours), duration(after.longestEarthGapHours)],
  ];
  return (
    <section className="mission-comparison" aria-labelledby="comparison-title">
      <p className="eyebrow">Same place. A different date.</p>
      <h2 id="comparison-title">{improvement ? `${Number(extraHours.toFixed(1))} more hours together` : shift ? 'A stronger window' : 'Already a best window'}</h2>
      <p className="comparison-state" role="status">{moving ? 'Travelling to the recommendation… Destination results are shown below.' : `Comparing two ${original.days}-day windows, using the same site and model.`}</p>
      <table className="comparison-table">
        <caption className="sr-only">Original and recommended {original.days}-day windows</caption>
        <thead><tr><td /><th scope="col">Original<br /><span>{fmtDate.format(original.startMs)}</span></th><th scope="col">Recommended<br /><span>{fmtDate.format(recommended.startMs)}</span></th></tr></thead>
        <tbody>{rows.map(([label, a, b]) => <tr key={label}><th scope="row">{label}</th><td>{a}</td><td>{b}</td></tr>)}</tbody>
      </table>
      <p className="comparison-explanation">
        {shift ? `Moving the start ${shift} ${shift === 1 ? 'day' : 'days'} later ` : 'Keeping this start date '}
        {improvement ? `raises time with sunlight and Earth together from ${pct(before.combinedPct)} to ${pct(after.combinedPct)}.` : 'maximizes the sampled time with both in view in this search.'}
        {' '}{Math.abs(after.sunlightPct - before.sunlightPct) < 0.01
          ? (improvement ? 'Sunlight stays the same; Earth visibility makes the difference.' : 'Sunlight stays the same. Ties prefer shorter darkness, then the earliest start.')
          : `Sunlight changes from ${pct(before.sunlightPct)} to ${pct(after.sunlightPct)}.`}
      </p>
      {comparisonMapStartMs !== undefined && comparisonMapStartMs !== recommended.startMs && <p className="terrain-warning">The best date depends on terrain detail: the 80 m comparison favors {fmtDate.format(comparisonMapStartMs)}. This recommendation uses the 40 m map.</p>}
      <details className="search-method"><summary>How this date was chosen</summary><p>Daily UTC starts from {fmtDate.format(original.startMs)} to {fmtDate.format(comparison.searchEndMs)}. Maximize both-in-view time, then sunlight, then shorter darkness; exact ties use the earliest date. This is a sampled visibility optimum, not a flight recommendation.</p></details>
      <button type="button" className="link" onClick={() => useStore.getState().setDate(original.startMs)}>Return to original window</button>
    </section>
  );
}

export function EvidenceSummary({ data, metrics }: { data: AppData; metrics: WindowMetrics }) {
  const validated = data.validation.horizons.pass;
  return (
    <section className="evidence-summary" aria-label="Evidence and limits">
      <p><span className="evidence-dot" aria-hidden="true" />{validated ? 'Directions checked against NASA/JPL Horizons' : 'Direction validation needs attention'}</p>
      <p>40 m terrain · 80 m comparison · 30-minute samples</p>
      <p>{metrics.resolution?.sensitive ? 'The terrain maps disagree on the sunlight verdict.' : 'Terrain agreement is a sensitivity check, not a guarantee.'} Visibility estimates do not establish energy yield, a radio link, or landing safety.</p>
      <div className="evidence-links"><a href="https://naif.jpl.nasa.gov/pub/naif/generic_kernels/" target="_blank" rel="noreferrer">NASA positions</a><a href="https://pgda.gsfc.nasa.gov/products/78" target="_blank" rel="noreferrer">LOLA terrain</a><button type="button" className="link" onClick={() => useStore.getState().setPanel('trust')}>Checks &amp; limits</button></div>
    </section>
  );
}
