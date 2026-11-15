import { useEffect, useRef, useState } from 'react';
import type { AppData } from '../engine/load';
import type { WindowMetrics } from '../engine/types';
import { MoonScene } from '../scene/MoonScene';
import { prefersReducedMotion, useStore } from '../state/store';

interface Props {
  data: AppData;
  metrics: Record<string, WindowMetrics>;
}

/** Width kept clear on the right for the verdict card, in pixels. */
const CARD_SPACE = 480;

/** Pre-rendered film grain: one noise tile drawn once, laid over the scene as a texture. */
function grainTile(): string {
  const size = 192;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 96 + Math.random() * 64;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

export function SceneView({ data, metrics }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const grain = useRef<HTMLDivElement>(null);
  const scene = useRef<MoonScene | null>(null);
  const latest = useRef(metrics);
  useEffect(() => { latest.current = metrics; }, [metrics]);
  const moving = useStore((s) => s.moving);
  const siteId = useStore((s) => s.siteId);
  const playing = useStore((s) => s.playing);
  const [moved, setMoved] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);

  useEffect(() => {
    const s = new MoonScene({
      canvas: canvas.current!,
      overlay: overlay.current!,
      eph: data.eph,
      sites: data.sites,
      poleHalfExtentM: data.textures.pole_half_extent_m,
      reducedMotion: prefersReducedMotion(),
      // Clicking a pin selects it and flies to the pole, where the three sites pull apart.
      onSelectSite: (id) => {
        useStore.getState().setSite(id);
        s.focusSite(id);
      },
      onViewChange: setMoved,
      onAssetError: setAssetError,
      onOpenSite: (id) => {
        useStore.getState().setSite(id);
        useStore.getState().setPanel('dive');
      },
    });
    scene.current = s;
    s.setTime(useStore.getState().displayMs);
    s.setVerdicts(verdictsOf(latest.current), false);
    s.setSelected(useStore.getState().siteId);
    // The scene reads the displayed date straight from the store on every change, outside React.
    const unsubscribe = useStore.subscribe((state) => {
      s.setTime(state.displayMs);
    });

    const frame = () => {
      const el = canvas.current!;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const wide = w >= 1080;
      // Leave room for the card on the right on wide screens.
      // Below the top bar; Earth sits about 1.3 Moon radii above the centre.
      const briefing = useStore.getState().briefing;
      const top = briefing ? (wide ? 300 : 440) : (wide ? 84 : 180);
      const bottom = wide ? h - 40 : h - 64;
      const cx = wide ? (w - CARD_SPACE) * 0.5 + 10 : w / 2;
      const radius = Math.max(80, Math.min((bottom - top) / 2.5, (wide ? w - CARD_SPACE : w) * 0.3));
      s.setFrame(cx, bottom - radius - 4, radius);
      s.labelBottomInset = wide ? 24 : 64;
    };
    frame();
    const observer = new ResizeObserver(frame);
    observer.observe(canvas.current!);
    window.addEventListener('resize', frame);
    if (grain.current) grain.current.style.backgroundImage = `url(${grainTile()})`;
    return () => {
      window.removeEventListener('resize', frame);
      observer.disconnect();
      unsubscribe();
      s.dispose();
      scene.current = null;
    };
  }, [data]);

  // Pins take their new colour when the date has finished moving, with a pulse if the verdict changed.
  useEffect(() => {
    if (!moving) scene.current?.setVerdicts(verdictsOf(metrics), !playing);
  }, [moving, metrics, playing]);

  useEffect(() => scene.current?.setSelected(siteId), [siteId]);

  return (
    <div className="scene">
      <canvas ref={canvas} aria-label="The Moon seen from below its south pole, lit from the Sun's real direction for the chosen date" />
      <div ref={grain} className="grain" aria-hidden="true" />
      <div ref={overlay} className="scene-overlay" />
      {assetError && <p className="scene-error" role="status">{assetError}</p>}
      {moved && (
        <div className="scene-tools">
          <button type="button" className="pill pill-glass" onClick={() => scene.current?.focusSite(null)}>
            Whole Moon
          </button>
        </div>
      )}
    </div>
  );
}

function verdictsOf(metrics: Record<string, WindowMetrics>) {
  return Object.fromEntries(Object.entries(metrics).map(([id, m]) => [id, m.verdict]));
}
