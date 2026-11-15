import { useState } from 'react';
import type { AppData } from '../engine/load';
import { THRESHOLDS } from '../engine/metrics';
import type { Site, WindowMetrics } from '../engine/types';
import { useStore } from '../state/store';
import { HorizonChart } from './HorizonChart';
import { VERDICT_GLYPH, duration, fmtDayMonth, isoDay, pct } from './format';
import { useCountUp } from './hooks';
import { download, encodeLink, windowCsv } from './share';

interface Props {
  data: AppData;
  metrics: Record<string, WindowMetrics>;
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
    <span className="verdict" data-verdict={verdict}>
      <i aria-hidden="true">{VERDICT_GLYPH[verdict]}</i>
      {verdict}
    </span>
  );
}

export function VerdictCard({ data, metrics }: Props) {
  const { siteId, windowStartMs, windowDays, displayMs, targetMs, audience, playing } = useStore();
  const { setSite, setPanel, setPlaying, setNotice } = useStore.getState();
  const site = data.sites.find((s) => s.id === siteId) as Site;
  const m = metrics[siteId];
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const noDark = m.longestDarkHours < 0.25;

  const share = async () => {
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
      <nav className="other-sites" aria-label="Other landing sites">
        {data.sites
          .filter((s) => s.id !== siteId)
          .map((s) => (
            <button key={s.id} type="button" className="link" onClick={() => setSite(s.id)}>
              {s.name}
            </button>
          ))}
      </nav>

      {audience === 'planner' && (
        <dl className="metrics">
          <div>
            <dt>Sunlight</dt>
            <dd>
              <Numeral value={m.sunlightPct} format={pct} />
            </dd>
            <p>of {windowDays} days</p>
          </div>
          <div>
            <dt>Longest dark</dt>
            <dd>
              <Numeral value={m.longestDarkHours} format={duration} />
            </dd>
            <p>{noDark ? 'Sun never fully sets' : 'without the Sun'}</p>
          </div>
          <div>
            <dt>Earth link</dt>
            <dd>
              <Numeral value={m.earthLinkPct} format={pct} />
            </dd>
            <p>line of sight</p>
          </div>
        </dl>
      )}

      {audience === 'educator' && (
        <div className="plain">
          <p>
            Over the {windowDays} days from {fmtDayMonth.format(windowStartMs)}, a lander here would see the Sun for{' '}
            <strong>{pct(m.sunlightPct)}</strong> of the time.{' '}
            {noDark ? 'The Sun never fully disappears.' : `Its longest wait in the dark would be ${duration(m.longestDarkHours)}.`}
          </p>
          <p>
            It could see Earth, and so talk to it directly, for <strong>{pct(m.earthLinkPct)}</strong> of the time.
          </p>
        </div>
      )}

      {audience === 'public' && (
        <div className="plain">
          <p className="headline">
            {m.verdict === 'Good'
              ? 'A good place to land right now.'
              : m.verdict === 'Risky'
                ? 'You could land here, but it would be tight.'
                : 'Not a good time to land here.'}
          </p>
          <p>
            Sunlight {pct(m.sunlightPct)} of the time, and Earth in view {pct(m.earthLinkPct)} of the time, over the next {windowDays}{' '}
            days.
          </p>
          <button type="button" className="pill" onClick={() => setPlaying(!playing)}>
            {playing ? 'Pause' : 'Play the time-lapse'}
          </button>
        </div>
      )}

      <details className="more" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>Skyline and details</summary>
        {open && (
          <div className="more-body">
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
            <HorizonChart eph={data.eph} site={site} ms={displayMs} windowStartMs={windowStartMs} windowDays={windowDays} />
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
