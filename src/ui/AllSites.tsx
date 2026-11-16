import type { AppData } from '../engine/load';
import type { Site, Verdict, WindowMetrics } from '../engine/types';
import { useStore } from '../state/store';
import { pct } from './format';
import { useCountUp } from './hooks';

function SiteRow({ site, metrics, verdict, selected }: { site: Site; metrics: WindowMetrics; verdict: Verdict; selected: boolean }) {
  const sunlight = useCountUp(metrics.sunlightPct);
  const earthLink = useCountUp(metrics.earthLinkPct);
  return (
    <button type="button" className="site-row" data-site={site.id} data-verdict={verdict}
      aria-pressed={selected} onClick={() => useStore.getState().setSite(site.id, true)}>
      <span className="site-dot" aria-hidden="true" />
      <span className="site-name">{site.name}</span>
      <span className="site-verdict">{verdict}<span className="sr-only"> sunlight conditions</span></span>
      <span className="site-sun"><span className="sr-only">Sunlight </span>{pct(sunlight)}</span>
      <span className="site-earth"><span className="sr-only">Earth link visibility </span>{pct(earthLink)}</span>
    </button>
  );
}

export function AllSites({ data, metrics, verdicts }: { data: AppData; metrics: Record<string, WindowMetrics>; verdicts: Record<string, Verdict> }) {
  const siteId = useStore(s => s.siteId);
  return (
    <section className="all-sites" aria-labelledby="all-sites-title">
      <div className="all-sites-heading">
        <div className="all-sites-label"><h2 id="all-sites-title">All sites</h2><button type="button" className="link" onClick={() => useStore.getState().setPanel('calendar')}>Compare sites</button></div>
        <span aria-hidden="true">Sunlight</span><span aria-hidden="true">Earth link</span>
      </div>
      {data.sites.map(site => <SiteRow key={site.id} site={site} metrics={metrics[site.id]}
        verdict={verdicts[site.id] ?? metrics[site.id].verdict} selected={site.id === siteId} />)}
    </section>
  );
}
