import { useMemo, useState } from 'react';
import type { Ephemeris } from '../engine/ephemeris';
import { DAY_MS, STEP_MS, VISIBLE_THRESHOLD } from '../engine/metrics';
import { horizonAt } from '../engine/site';
import { emptySky, skyAt } from '../engine/sky';
import type { BodySky, Site } from '../engine/types';
import { compass, pct } from './format';

interface Props {
  eph: Ephemeris;
  site: Site;
  /** The moment the markers show. */
  ms: number;
  windowStartMs: number;
  windowDays: number;
  size?: 'compact' | 'large';
}

const PAD = { l: 34, r: 10, t: 14, b: 24 };

/** Splits a track into runs so a line never jumps across the 0/360 seam. */
function trackPath(points: { az: number; el: number }[], x: (az: number) => number, y: (el: number) => number): string {
  let d = '';
  let prev: { az: number; el: number } | null = null;
  for (const p of points) {
    const jump = prev !== null && Math.abs(p.az - prev.az) > 180;
    d += `${prev === null || jump ? 'M' : 'L'}${x(p.az).toFixed(1)} ${y(p.el).toFixed(1)}`;
    prev = p;
  }
  return d;
}

function visibility(b: BodySky): string {
  if (b.terrainFrac - b.frac > 0.005) {
    return b.frac <= 0.005 ? 'blocked by Earth (eclipse)' : `${pct(b.frac * 100)} in view during an eclipse`;
  }
  if (b.frac >= 0.995) return 'in full view';
  if (b.frac <= 0.005) return 'hidden by terrain';
  return `${pct(b.frac * 100)} in view`;
}

/**
 * The skyline a lander would see: terrain height against compass direction,
 * with the paths of the Sun and Earth over the window and their positions at
 * the chosen moment. Everything drawn comes from the engine.
 */
export function HorizonChart({ eph, site, ms, windowStartMs, windowDays, size = 'compact' }: Props) {
  const W = size === 'large' ? 1100 : 400;
  const H = size === 'large' ? 230 : 190;
  const [hoverAz, setHoverAz] = useState<number | null>(null);

  const tracks = useMemo(() => {
    const sun: { az: number; el: number }[] = [];
    const earth: { az: number; el: number }[] = [];
    const s = emptySky();
    const steps = (windowDays * DAY_MS) / STEP_MS;
    for (let i = 0; i <= steps; i += 2) {
      skyAt(eph, site, windowStartMs + i * STEP_MS, s);
      sun.push({ az: s.sun.az, el: s.sun.el });
      earth.push({ az: s.earth.az, el: s.earth.el });
    }
    return { sun, earth };
  }, [eph, site, windowStartMs, windowDays]);

  const range = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of site.mask) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    for (const p of [...tracks.sun, ...tracks.earth]) {
      if (p.el < lo) lo = p.el;
      if (p.el > hi) hi = p.el;
    }
    return { lo: Math.floor(lo - 0.6), hi: Math.ceil(hi + 0.8) };
  }, [site, tracks]);

  const now = useMemo(() => skyAt(eph, site, ms), [eph, site, ms]);

  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const x = (az: number) => PAD.l + (az / 360) * plotW;
  const y = (el: number) => PAD.t + ((range.hi - el) / (range.hi - range.lo)) * plotH;

  const skyline = useMemo(() => {
    let d = `M${x(0)} ${y(range.lo)}`;
    for (let i = 0; i <= site.mask.length; i++) {
      d += `L${x((i * 360) / site.mask.length).toFixed(1)} ${y(site.mask[i % site.mask.length]).toFixed(1)}`;
    }
    return `${d}L${x(360)} ${y(range.lo)}Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, range, H, W]);

  const span = range.hi - range.lo;
  const tickStep = span > 14 ? 4 : span > 7 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = Math.ceil(range.lo / tickStep) * tickStep; v <= range.hi; v += tickStep) ticks.push(v);
  const stretch = Math.round(plotH / span / (plotW / 360));

  const marker = (b: BodySky, cls: string, name: string) => {
    const up = b.frac >= VISIBLE_THRESHOLD;
    const mx = x(b.az);
    const my = y(Math.max(range.lo, Math.min(range.hi, b.el)));
    const flip = mx > W - 70;
    return (
      <g className={`hz-marker ${cls}`} data-up={up}>
        <circle cx={mx} cy={my} r={7} />
        <text x={mx + (flip ? -12 : 12)} y={my + 4} textAnchor={flip ? 'end' : 'start'}>
          {name}
        </text>
      </g>
    );
  };

  const summary = `Skyline at ${site.name}. Sun: ${now.sun.el.toFixed(1)} degrees elevation toward ${compass(now.sun.az)}, ${visibility(now.sun)}. Earth: ${now.earth.el.toFixed(1)} degrees elevation toward ${compass(now.earth.az)}, ${visibility(now.earth)}.`;

  return (
    <figure className={`horizon horizon-${size}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={summary}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const az = (((e.clientX - r.left) / r.width) * W - PAD.l) / plotW;
          setHoverAz(az >= 0 && az <= 1 ? az * 360 : null);
        }}
        onPointerLeave={() => setHoverAz(null)}
      >
        <rect className="hz-sky" x={PAD.l} y={PAD.t} width={plotW} height={plotH} rx={6} />
        {ticks.map((v) => (
          <g key={v}>
            <line className={v === 0 ? 'hz-zero' : 'hz-grid'} x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
            <text className="hz-tick" x={PAD.l - 6} y={y(v) + 4} textAnchor="end">
              {v}°
            </text>
          </g>
        ))}
        <path className="hz-track hz-sun" d={trackPath(tracks.sun, x, y)} />
        <path className="hz-track hz-earth" d={trackPath(tracks.earth, x, y)} />
        <path className="hz-terrain" d={skyline} />
        {['N', 'E', 'S', 'W', 'N'].map((c, i) => (
          <text key={i} className="hz-tick" x={x(i * 90)} y={H - 7} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}>
            {c}
          </text>
        ))}
        {hoverAz !== null && <line className="hz-cross" x1={x(hoverAz)} x2={x(hoverAz)} y1={PAD.t} y2={PAD.t + plotH} />}
        {marker(now.earth, 'hz-earth', 'Earth')}
        {marker(now.sun, 'hz-sun', 'Sun')}
      </svg>
      <figcaption>
        {hoverAz !== null ? (
          <span>
            Looking {compass(hoverAz)} ({Math.round(hoverAz)}°): terrain reaches {horizonAt(site, hoverAz).toFixed(1)}° above the
            horizontal.
          </span>
        ) : (
          <span>
            <i className="key key-sun" />
            Sun {visibility(now.sun)}, {now.sun.el.toFixed(1)}° {compass(now.sun.az)}
            <i className="key key-earth" />
            Earth {visibility(now.earth)}, {now.earth.el.toFixed(1)}° {compass(now.earth.az)}
          </span>
        )}
        <span className="hz-note">Lines show each path over the window. Heights are stretched about {stretch}× to be readable.</span>
      </figcaption>
    </figure>
  );
}
