import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppData } from '../engine/load';
import { loadTerrain } from '../engine/load';
import { DAY_MS, STEP_MS } from '../engine/metrics';
import { eclipseTransmission, skyAt } from '../engine/sky';
import type { Site, WindowMetrics } from '../engine/types';
import { TERRAIN_STRETCH, TerrainView } from '../scene/TerrainView';
import { useStore } from '../state/store';
import { HorizonChart } from './HorizonChart';
import { ResolutionNote, VerdictBadge } from './VerdictCard';
import { fmtDate, fmtTime, pct } from './format';
import { useEscape } from './hooks';

interface Props {
  data: AppData;
  metrics: Record<string, WindowMetrics>;
}

/** A close-up of one site: real terrain under the real Sun, and the skyline that decides the verdict. */
export function DiveView({ data, metrics }: Props) {
  const { siteId, windowStartMs, windowDays, displayMs, targetMs } = useStore();
  const { setPanel, setMoment, stepDays } = useStore.getState();
  const site = data.sites.find((s) => s.id === siteId) as Site;
  const tile = data.textures.terrain_tiles.find((t) => t.id === siteId)!;
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<TerrainView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const close = () => setPanel('none');
  useEscape(close);

  const sky = useMemo(() => skyAt(data.eph, site, displayMs), [data, site, displayMs]);

  useEffect(() => {
    let alive = true;
    setFailed(null);
    loadTerrain(tile)
      .then(({ near, far }) => {
        if (!alive || !canvas.current) return;
        view.current = new TerrainView(canvas.current, tile, near, far);
        pushSun();
      })
      .catch((e: Error) => setFailed(e.message));
    return () => {
      alive = false;
      view.current?.dispose();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile]);

  const pushSun = () => {
    // Turn the Sun's compass direction at the site into a direction on the polar map.
    const r = Math.hypot(site.x_m, site.y_m);
    const north = [site.x_m / r, site.y_m / r];
    const east = [north[1], -north[0]];
    const az = (sky.sun.az * Math.PI) / 180;
    view.current?.setSun(
      Math.sin(az) * east[0] + Math.cos(az) * north[0],
      Math.sin(az) * east[1] + Math.cos(az) * north[1],
      sky.sun.el,
      sky.sun.radius,
      eclipseTransmission(sky.sun, sky.earth),
    );
  };
  useEffect(pushSun);

  const steps = (windowDays * DAY_MS) / STEP_MS - 1;
  const step = Math.round((targetMs - windowStartMs) / STEP_MS);
  const km = Math.round((tile.size * tile.cell_m) / 1000);

  return (
    <div className="dive" role="dialog" aria-modal="true" aria-label={`${site.name} site view`}>
      <header className="dive-head">
        <button type="button" className="pill pill-glass" onClick={close} autoFocus>
          ‹ Back to the Moon
        </button>
        <div className="dive-title">
          <h1>{site.name}</h1>
          <VerdictBadge verdict={metrics[siteId].verdict} />
        </div>
        <p className="dive-when">
          {fmtDate.format(displayMs)}, {fmtTime.format(displayMs)} UTC
        </p>
      </header>

      <div className="dive-terrain">
        <canvas ref={canvas} aria-label={`3D terrain around ${site.name}, lit from the Sun's real direction`} />
        {failed && <p className="dive-error">The terrain could not be loaded ({failed}). The skyline below still works.</p>}
        <p className="dive-caption">
          {km} km of real terrain around the site (ringed), lit from the Sun's real direction. Sun {sky.sun.el.toFixed(1)}°{' '}
          {sky.sun.el >= 0 ? 'above' : 'below'} level, {pct(sky.sun.frac * 100)} in view at the site. Heights are stretched {TERRAIN_STRETCH}×.
          Shadows are cast by terrain out to about {Math.round((tile.size * tile.far_cell_m) / 2000)} km. Drag to turn, scroll to zoom.
        </p>
      </div>

      <div className="dive-panel">
        <ResolutionNote metrics={metrics[siteId]} />
        <HorizonChart eph={data.eph} site={site} ms={displayMs} windowStartMs={windowStartMs} windowDays={windowDays} size="large" />
        <div className="scrub">
          <button type="button" className="round" aria-label="Previous day" onClick={() => stepDays(-1)}>
            ‹
          </button>
          <label>
            <span className="sr-only">Moment within the window</span>
            <input
              type="range"
              min={0}
              max={steps}
              step={1}
              value={step}
              onChange={(e) => setMoment(windowStartMs + Number(e.target.value) * STEP_MS)}
              aria-valuetext={`${fmtDate.format(targetMs)} ${fmtTime.format(targetMs)} UTC`}
            />
          </label>
          <button type="button" className="round" aria-label="Next day" onClick={() => stepDays(1)}>
            ›
          </button>
        </div>
        <p className="scrub-note">
          Drag to move through the {windowDays}-day window in {STEP_MS / 60000}-minute steps. The arrows move the whole window by a day.
        </p>
      </div>
    </div>
  );
}
