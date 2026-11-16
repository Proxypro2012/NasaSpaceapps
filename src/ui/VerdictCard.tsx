import { useState } from 'react';
import type { AppData } from '../engine/load';
import { THRESHOLDS } from '../engine/metrics';
import type { Site, Verdict, WindowMetrics } from '../engine/types';
import { useStore } from '../state/store';
import { EvidenceSummary, MissionComparison, MissionPrompt } from './Mission';
import { VisibilityTimeline } from './VisibilityTimeline';
import { WindowRange } from './WindowRange';
import { AllSites } from './AllSites';
import { VERDICT_GLYPH, duration, fmtDayMonth, isoDay, pct } from './format';
import { useCountUp } from './hooks';
import { download, encodeLink, windowCsv } from './share';

interface Props {
  data: AppData;
  metrics: Record<string, WindowMetrics>;
  verdicts: Record<string, Verdict>;
}

/** The figure large, its unit small, so "3.2 days" fits beside the other numbers. */
function Numeral({ value, format }: { value: number; format(v: number): string }) {
  const [figure, unit] = format(useCountUp(value)).split(' ');
  return (
    <span className="numeral">
      {figure}
      {unit && <small> {unit}</small>}
    </span>
  );
}

export function VerdictBadge({ verdict }: { verdict: WindowMetrics['verdict'] }) {
  return (
    <span className="verdict" data-verdict={verdict} aria-label={`${verdict} sunlight conditions`}>
      <i aria-hidden="true">{VERDICT_GLYPH[verdict]}</i>
      {verdict}
    </span>
  );
}

export function ResolutionNote({ metrics }: { metrics: WindowMetrics }) {
  const other = metrics.resolution;
  if (!other) return null;
  return (
    <details className="resolution-note" data-sensitive={other.sensitive} open={other.sensitive}>
      <summary>{other.sensitive ? 'Terrain-sensitive sunlight verdict' : '40 m terrain estimate'}</summary>
      <p>
        The 40 m map gives {pct(metrics.sunlightPct)} sunlight and {metrics.verdict} conditions.
        The 80 m comparison gives {pct(other.sunlightPct)} and {other.verdict}, with {duration(other.longestDarkHours)} of full darkness.
        {' '}The longest Earth gap is {duration(metrics.longestEarthGapHours)} at 40 m and {duration(other.longestEarthGapHours)} at 80 m, within this window.
        {other.sensitive ? ' Terrain detail changes this verdict; treat it as uncertain.' : ' Both maps give the same verdict for this window.'}
        {' '}This comparison is a sensitivity check, not an error bound.
      </p>
    </details>
  );
}

export function VerdictCard({ data, metrics, verdicts }: Props) {
  const siteId = useStore(s => s.siteId);
  const windowStartMs = useStore(s => s.windowStartMs);
  const windowDays = useStore(s => s.windowDays);
  const audience = useStore(s => s.audience);
  const playing = useStore(s => s.playing);
  const comparison = useStore(s => s.comparison);
  const { setPanel, setPlaying, setNotice } = useStore.getState();
  const site = data.sites.find((s) => s.id === siteId) as Site;
  const m = metrics[siteId];
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const noDark = m.longestDarkHours < 0.25;

  const share = async () => {
    const targetMs = useStore.getState().targetMs;
    const url = `${location.origin}${location.pathname}${encodeLink({ windowStartMs, windowDays, targetMs, siteId, audience })}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice(`Copy this link: ${url}`);
    }
  };

  return (
    <aside className="card" aria-label="Verdict for the selected site">
      <header className="card-head">
        <h1>{site.name}</h1>
        <VerdictBadge verdict={m.verdict} />
      </header>
      <WindowRange data={data} />
      <MissionPrompt data={data} metrics={m} />
      <MissionComparison />

      {audience === 'planner' && !comparison && (
        <dl className="metrics">
          <div>
            <dt>Sunlight</dt>
            <dd>
              <Numeral value={m.sunlightPct} format={pct} />
              <p>of {windowDays} days</p>
            </dd>
          </div>
          <div>
            <dt>Longest dark</dt>
            <dd>
              <Numeral value={m.longestDarkHours} format={duration} />
              <p>{noDark ? 'no full darkness' : 'without sunlight'}</p>
            </dd>
          </div>
          <div>
            <dt>Earth in view</dt>
            <dd>
              <Numeral value={m.earthLinkPct} format={pct} />
              <p>line of sight</p>
            </dd>
          </div>
          <div>
            <dt>Longest Earth gap</dt>
            <dd>
              <Numeral value={m.longestEarthGapHours} format={duration} />
              <p>below half in view</p>
            </dd>
          </div>
        </dl>
      )}

      {audience === 'educator' && (
        <div className="plain">
          <p>
            Over the {windowDays} days from {fmtDayMonth.format(windowStartMs)}, a lander here would see the Sun for{' '}
            <strong>{pct(m.sunlightPct)}</strong> of the time.{' '}
            {noDark ? 'There is no full darkness in this window.' : `Its longest wait without direct sunlight would be ${duration(m.longestDarkHours)}.`}
          </p>
          <p>
            At least half of Earth would clear the skyline for <strong>{pct(m.earthLinkPct)}</strong> of the time.
            {' '}The longest gap below that threshold is <strong>{duration(m.longestEarthGapHours)}</strong> within this window.
            A working radio link also depends on the antenna and radio system.
          </p>
        </div>
      )}

      {audience === 'public' && (
        <div className="plain">
          <p className="headline">
            {m.verdict === 'Good'
              ? 'Favourable sunlight conditions.'
              : m.verdict === 'Risky'
                ? 'Mixed sunlight and darkness.'
                : 'Limited sunlight or long darkness.'}
          </p>
          <p className="muted">The verdict describes sunlight. Earth visibility is shown separately; landing safety is not assessed.</p>
          <p>
            Sunlight {pct(m.sunlightPct)} of the time, and Earth in view {pct(m.earthLinkPct)} of the time, over the next {windowDays}{' '}
            days.
            {' '}The longest Earth visibility gap in this window is {duration(m.longestEarthGapHours)}.
          </p>
          <button type="button" className="pill" onClick={() => setPlaying(!playing)}>
            {playing ? 'Pause' : 'Play the time-lapse'}
          </button>
        </div>
      )}

      <AllSites data={data} metrics={metrics} verdicts={verdicts} />
      <details className="more site-details" data-sensitive={m.resolution?.sensitive} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>Skyline and details{m.resolution?.sensitive && <span className="details-warning"> · Terrain-sensitive verdict</span>}</summary>
        {open && (
          <div className="more-body">
            <ResolutionNote metrics={m} />
            <EvidenceSummary data={data} metrics={m} />
            <VisibilityTimeline data={data} site={site} startMs={windowStartMs} days={windowDays} />
            <p className="muted">
              {site.blurb}. {Math.abs(site.lat_deg).toFixed(2)}° S, {site.lon_deg.toFixed(1)}° E
            </p>
            {audience === 'educator' && (
              <>
                <p className="why">
                  Why it changes: near the Moon's south pole the Sun never climbs high. It circles the horizon once every 29.5 days,
                  only a degree or two up, so a single ridge can block it for days. Earth barely moves in the sky; it bobs slowly up
                  and down, and at some sites it dips behind the hills.
                </p>
                <p className="why">
                  We call this window <strong>{m.verdict}</strong> because Good needs sunlight at least {THRESHOLDS.goodMinSunlightPct}
                  % of the time with no dark stretch of {THRESHOLDS.goodMaxDarkHours} hours or more. These cut-offs are ours, not
                  NASA's.
                </p>
              </>
            )}
            <button type="button" className="pill pill-glass" onClick={() => setPanel('dive')}>
              Open site view
            </button>
            <div className="more-links">
              <button type="button" className="link" onClick={() => setPanel('calendar')}>
                Calendar
              </button>
              <button type="button" className="link" onClick={() => setPanel('trust')}>
                How we know
              </button>
              <button type="button" className="link export" onClick={share}>
                {copied ? 'Link copied' : 'Copy link'}
              </button>
              <button
                type="button"
                className="link export"
                onClick={() =>
                  download(`${site.id}_${isoDay(windowStartMs)}_${windowDays}d.csv`, windowCsv(data, site, windowStartMs, windowDays, m))
                }
              >
                Download CSV
              </button>
            </div>
          </div>
        )}
      </details>
    </aside>
  );
}
