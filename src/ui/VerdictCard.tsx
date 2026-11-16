import { useMemo, useState } from 'react';
import type { AppData } from '../engine/load';
import { THRESHOLDS } from '../engine/metrics';
import { nearestPsr, psrHostLabel } from '../engine/psr';
import { windowSummary, type WindowSummary } from '../engine/summary';
import type { Site, Verdict, WindowMetrics } from '../engine/types';
import { useStore } from '../state/store';
import { EvidenceSummary, MissionComparison, MissionPrompt } from './Mission';
import { VisibilityTimeline } from './VisibilityTimeline';
import { WindowRange } from './WindowRange';
import { AllSites } from './AllSites';
import { VERDICT_GLYPH, duration, fmtDate, fmtDayMonth, fmtTime, isoDay, km, pct } from './format';
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

/** "Operable 13 of 30 days in this window — first dark stretch of 48 h or longer starts 13 Jun 2027, 10:30 UTC." */
export function summarySentence(s: WindowSummary): string {
  const n = (v: number) => String(Number(v.toFixed(1)));
  // Non-breaking spaces keep "48 h" and the time "13:30 UTC" from splitting across lines.
  const long = `dark stretch of ${THRESHOLDS.goodMaxDarkHours}\u00a0h or longer`;
  const ms = s.firstLongDarkStartMs;
  const tail = ms === null
    ? `no ${long}`
    : s.longDarkAtStart
      ? `a ${long} is under way at the window start`
      : `first ${long} starts ${fmtDate.format(ms)}, ${fmtTime.format(ms)}\u00a0UTC`;
  return `Operable ${n(s.operableDays)} of ${n(s.totalDays)} days in this window — ${tail}.`;
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
  // Both are new readouts; they add to the window metrics and change none of them.
  const summary = useMemo(() => windowSummary(data.eph, site, windowStartMs, windowDays), [data.eph, site, windowStartMs, windowDays]);
  const psr = useMemo(() => nearestPsr(site, data.psrs.psrs, data.sitesFile.reference_radius_km), [site, data.psrs, data.sitesFile]);
  const psrHost = psr ? psrHostLabel(psr.psr.features) : '';

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
      <p className="window-summary" title="A day counts as operable when the Sun and Earth are both in view for at least half of it.">
        {summarySentence(summary)}
      </p>
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
          {psr && (
            <div className="metric-psr" title={`${psr.psr.id}, ${psrHost}: ${Math.round(psr.psr.area_km2)} km² of permanent shadow. Distance is to its centre; the shadow's edge is closer.`}>
              <dt>Nearest PSR</dt>
              <dd>
                <Numeral value={psr.distanceKm} format={km} />
                <p>water-ice target<span className="sr-only">, the centre of a permanently shadowed region in {psrHost}</span></p>
              </dd>
            </div>
          )}
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
          {psr && (
            <p>
              The nearest big crater shadow that never sees the Sun, in {psrHost}, is <strong>{km(psr.distanceKm)}</strong> away. Water ice
              may be trapped there; that is possible, not confirmed.
            </p>
          )}
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
