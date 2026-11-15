import { useEffect } from 'react';
import { loadAppData } from './engine/load';
import { startDateMotion } from './state/motion';
import { useStore } from './state/store';
import { CalendarSheet } from './ui/Calendar';
import { DiveView } from './ui/DiveView';
import { Header } from './ui/Header';
import { SceneView } from './ui/SceneView';
import { TrustPanel } from './ui/TrustPanel';
import { VerdictCard } from './ui/VerdictCard';
import { useWindowMetrics } from './ui/hooks';
import { decodeLink, encodeLink } from './ui/share';

// Read the link once, before anything rewrites the address bar.
const linked = decodeLink(location.hash);

export function App() {
  const data = useStore((s) => s.data);
  const loadError = useStore((s) => s.loadError);

  useEffect(() => {
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
  if (!data) {
    return (
      <main className="boot">
        <p className="wordmark">Southlight</p>
        <p>Loading the Moon…</p>
      </main>
    );
  }
  return <Loaded />;
}

function Loaded() {
  const data = useStore((s) => s.data)!;
  const { windowStartMs, windowDays, targetMs, siteId, audience, panel, notice, moving, playing } = useStore();
  const metrics = useWindowMetrics(data, windowStartMs, windowDays);

  // Keep the address bar in step, so the page can be shared or reloaded as it stands.
  useEffect(() => {
    if (moving || playing) return;
    history.replaceState(null, '', encodeLink({ windowStartMs, windowDays, targetMs, siteId, audience }));
  }, [windowStartMs, windowDays, targetMs, siteId, audience, moving, playing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') useStore.getState().stepDays(-1);
      else if (e.key === 'ArrowRight') useStore.getState().stepDays(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app" data-audience={audience}>
      <SceneView data={data} metrics={metrics} />
      <Header data={data} />
      <main className="layout">
        <VerdictCard data={data} metrics={metrics} />
      </main>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button type="button" className="link" onClick={() => useStore.getState().setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}
      {panel === 'trust' && <TrustPanel data={data} />}
      {panel === 'calendar' && <CalendarSheet data={data} />}
      {panel === 'dive' && <DiveView data={data} metrics={metrics} />}
    </div>
  );
}
