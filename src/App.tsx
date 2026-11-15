import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { loadAppData } from './engine/load';
import { startDateMotion } from './state/motion';
import { useStore } from './state/store';
import { CalendarSheet } from './ui/Calendar';
import { Header } from './ui/Header';
import { TrustPanel } from './ui/TrustPanel';
import { VerdictCard } from './ui/VerdictCard';
import { useEscape, useModalFocus, useWindowMetrics } from './ui/hooks';
import { MissionBriefing } from './ui/Mission';
import { SubmissionSheet } from './ui/SubmissionSheet';
import { decodeLink, encodeLink } from './ui/share';

// Read the link once, before anything rewrites the address bar.
const linked = decodeLink(location.hash);
const SceneView = lazy(() => import('./ui/SceneView').then(m => ({ default: m.SceneView })));
const DiveView = lazy(() => import('./ui/DiveView').then(m => ({ default: m.DiveView })));

class ViewBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function SiteViewStatus({ failed = false }: { failed?: boolean }) {
  const close = () => useStore.getState().setPanel('none');
  useEscape(close);
  const title = failed ? 'Site view unavailable' : 'Loading site view…';
  return (
    <div className="sheet-backdrop">
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheet-head">
          <h1>{title}</h1>
          <button type="button" className="round round-x" aria-label="Close" onClick={close} autoFocus>✕</button>
        </header>
        {failed && <div className="sheet-body"><p>The 3D view could not load. Close this panel to keep using the skyline and geometric results.</p></div>}
      </section>
    </div>
  );
}

export function App() {
  const loadError = useStore((s) => s.loadError);
  useModalFocus();

  useEffect(() => {
    // Load view code alongside the data; the briefing can render immediately.
    void import('./ui/SceneView').catch(() => {});
    loadAppData()
      .then((d) => {
        if (!useStore.getState().data) useStore.getState().init(d, linked);
      })
      .catch((e: Error) => useStore.getState().setLoadError(e.message));
    return startDateMotion();
  }, []);

  if (loadError) {
    return (
      <main className="boot">
        <h1>Southlight could not start</h1>
        <p>{loadError}. Reload the page to try again.</p>
      </main>
    );
  }
  return <Loaded />;
}

function Loaded() {
  const data = useStore((s) => s.data);
  const windowStartMs = useStore(s => s.windowStartMs);
  const windowDays = useStore(s => s.windowDays);
  const targetMs = useStore(s => s.targetMs);
  const siteId = useStore(s => s.siteId);
  const audience = useStore(s => s.audience);
  const panel = useStore(s => s.panel);
  const notice = useStore(s => s.notice);
  const moving = useStore(s => s.moving);
  const playing = useStore(s => s.playing);
  const briefing = useStore(s => s.briefing);
  const metrics = useWindowMetrics(data, windowStartMs, windowDays);

  // Keep the address bar in step, so the page can be shared or reloaded as it stands.
  useEffect(() => {
    if (!data || moving || playing) return;
    history.replaceState(null, '', encodeLink({ windowStartMs, windowDays, targetMs, siteId, audience }));
  }, [data, windowStartMs, windowDays, targetMs, siteId, audience, moving, playing]);

  useEffect(() => {
    if (data && new URLSearchParams(location.search).has('guide')) useStore.getState().setPanel('submission');
  }, [data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (useStore.getState().panel !== 'none' || e.defaultPrevented || t.isContentEditable || t.closest('input, select, textarea, video') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') useStore.getState().stepDays(-1);
      else if (e.key === 'ArrowRight') useStore.getState().stepDays(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app" data-audience={audience} data-briefing={briefing}>
      <div className="workspace" inert={panel !== 'none'}>
      {data ? <ViewBoundary fallback={<div className="scene"><p className="scene-error" role="alert">The lunar view could not load. The geometric results and skyline still work. <button type="button" className="link" onClick={() => location.reload()}>Reload</button></p></div>}>
      <Suspense fallback={<div className="scene"><p className="scene-error" role="status">Preparing the lunar view…</p></div>}>
        <SceneView data={data} metrics={metrics} />
      </Suspense>
      </ViewBoundary> : <div className="scene"><p className="scene-error" role="status">Loading NASA positions and terrain…</p></div>}
      {data ? <Header data={data} /> : <header className="topbar"><div className="brand"><span className="wordmark">Southlight</span></div></header>}
      <main className="layout">
        <MissionBriefing hidden={Object.keys(linked).length > 0} />
        {data && <VerdictCard data={data} metrics={metrics} />}
      </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button type="button" className="link" onClick={() => useStore.getState().setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}
      {data && panel === 'trust' && <TrustPanel data={data} />}
      {data && panel === 'calendar' && <CalendarSheet data={data} />}
      {data && panel === 'dive' && (
        <ViewBoundary fallback={<SiteViewStatus failed />}>
          <Suspense fallback={<SiteViewStatus />}>
            <DiveView data={data} metrics={metrics} />
          </Suspense>
        </ViewBoundary>
      )}
      {panel === 'submission' && <SubmissionSheet />}
    </div>
  );
}
