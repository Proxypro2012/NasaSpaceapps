import type { Ephemeris } from './ephemeris';
import { horizonAt } from './site';
import type { BodySky, Site, SkyState, Vec3 } from './types';

export const SUN_RADIUS_KM = 695_700;
export const EARTH_RADIUS_KM = 6378.137;

/** Vertical chords used to integrate a disc against the horizon. */
const DISC_CHORDS = 15;
const CHORD_K = new Float64Array(DISC_CHORDS);
const CHORD_HALF = new Float64Array(DISC_CHORDS);
let chordHalfSum = 0;
for (let i = 0; i < DISC_CHORDS; i++) {
  const k = ((i + 0.5) / DISC_CHORDS) * 2 - 1;
  CHORD_K[i] = k;
  CHORD_HALF[i] = Math.sqrt(1 - k * k);
  chordHalfSum += CHORD_HALF[i];
}

const RAD = 180 / Math.PI;

/** Geometric direct solar light before terrain obstruction, for scene shading. */
export function eclipseTransmission(sun: BodySky, earth: BodySky): number {
  const se = sun.el / RAD, ee = earth.el / RAD;
  const dot = Math.sin(se) * Math.sin(ee) + Math.cos(se) * Math.cos(ee) * Math.cos((earth.az - sun.az) / RAD);
  const d = Math.acos(Math.max(-1, Math.min(1, dot))) * RAD;
  const r = sun.radius, R = earth.radius;
  if (d >= r + R) return 1;
  if (d + r <= R) return 0;
  if (d + R <= r) return 1 - (R * R) / (r * r);
  const a = Math.acos(Math.max(-1, Math.min(1, (d*d + r*r - R*R) / (2*d*r))));
  const b = Math.acos(Math.max(-1, Math.min(1, (d*d + R*R - r*r) / (2*d*R))));
  const q = Math.max(0, (-d+r+R)*(d+r-R)*(d-r+R)*(d+r+R));
  return Math.max(0, Math.min(1, 1 - (r*r*a + R*R*b - Math.sqrt(q) / 2) / (Math.PI*r*r)));
}

/**
 * Fraction of a disc's area above the terrain horizon. The disc is cut into
 * vertical chords and each chord is clipped by the horizon at its own azimuth,
 * so rises and sets are gradual.
 */
export function visibleFraction(site: Site, az: number, el: number, radius: number): number {
  if (el - radius > 45) return 1;
  const cosEl = Math.max(Math.cos(el / RAD), 1e-6);
  let seen = 0;
  for (let i = 0; i < DISC_CHORDS; i++) {
    const half = radius * CHORD_HALF[i];
    const horizon = horizonAt(site, az + (CHORD_K[i] * radius) / cosEl);
    const v = el + half - horizon;
    seen += v <= 0 ? 0 : v >= 2 * half ? 2 * half : v;
  }
  return Math.min(1, Math.max(0, seen / (2 * radius * chordHalfSum)));
}

/** Solar disc clipped by both terrain and Earth's disc; overlapping blockers
 * are subtracted once. Angular coordinates are in the Sun's tangent plane. */
export function sunlightFraction(site: Site, sun: BodySky, earth: BodySky): number {
  const sa = sun.az / RAD, se = sun.el / RAD;
  const ea = earth.az / RAD, ee = earth.el / RAD;
  const delta = ea - sa;
  const dot = Math.sin(se) * Math.sin(ee) + Math.cos(se) * Math.cos(ee) * Math.cos(delta);
  const separation = Math.acos(Math.max(-1, Math.min(1, dot))) * RAD;
  if (separation >= sun.radius + earth.radius) return sun.frac;
  if (separation + sun.radius <= earth.radius) return 0;
  // Azimuthal-equidistant projection preserves separation from the solar centre.
  const scale = separation / Math.max(Math.sin(separation / RAD), 1e-12);
  const cx = Math.cos(ee) * Math.sin(delta) * scale;
  const cy = (Math.cos(se) * Math.sin(ee) - Math.sin(se) * Math.cos(ee) * Math.cos(delta)) * scale;
  const chords = 128;
  const cosEl = Math.max(Math.cos(se), 1e-6);
  let total = 0, seen = 0;
  for (let i = 0; i < chords; i++) {
    const x = ((i + 0.5) / chords * 2 - 1) * sun.radius;
    const half = Math.sqrt(Math.max(0, sun.radius * sun.radius - x * x));
    const bottom = Math.max(-half, horizonAt(site, sun.az + x / cosEl) - sun.el);
    const visible = Math.max(0, half - bottom);
    const er2 = earth.radius * earth.radius - (x - cx) * (x - cx);
    const eh = Math.sqrt(Math.max(0, er2));
    const blocked = er2 > 0 ? Math.max(0, Math.min(half, cy + eh) - Math.max(bottom, cy - eh)) : 0;
    total += 2 * half;
    seen += Math.max(0, visible - blocked);
  }
  // A different quadrature must never add sunlight during an eclipse.
  return Math.min(sun.frac, Math.max(0, seen / total));
}

function localSky(site: Site, body: Vec3, bodyRadiusKm: number, out: BodySky): void {
  const dx = body[0] - site.position[0];
  const dy = body[1] - site.position[1];
  const dz = body[2] - site.position[2];
  const e = dx * site.east[0] + dy * site.east[1] + dz * site.east[2];
  const n = dx * site.north[0] + dy * site.north[1] + dz * site.north[2];
  const u = dx * site.up[0] + dy * site.up[1] + dz * site.up[2];
  const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
  let az = Math.atan2(e, n) * RAD;
  if (az < 0) az += 360;
  out.az = az;
  out.el = Math.asin(u / range) * RAD;
  out.radius = Math.asin(bodyRadiusKm / range) * RAD;
  out.frac = visibleFraction(site, out.az, out.el, out.radius);
  out.terrainFrac = out.frac;
}

const sunVec: Vec3 = [0, 0, 0];
const earthVec: Vec3 = [0, 0, 0];

export function emptySky(): SkyState {
  return {
    sun: { az: 0, el: 0, radius: 0, frac: 0, terrainFrac: 0 },
    earth: { az: 0, el: 0, radius: 0, frac: 0, terrainFrac: 0 },
  };
}

/** Where the Sun and Earth are in a site's sky at an instant, and how much of each is visible. */
export function skyAt(eph: Ephemeris, site: Site, ms: number, out: SkyState = emptySky()): SkyState {
  eph.sample(ms, sunVec, earthVec);
  localSky(site, sunVec, SUN_RADIUS_KM, out.sun);
  localSky(site, earthVec, EARTH_RADIUS_KM, out.earth);
  out.sun.frac = sunlightFraction(site, out.sun, out.earth);
  return out;
}

/** Unit directions from the Moon's centre to the Sun and Earth, Moon-fixed frame. */
export function bodyDirections(eph: Ephemeris, ms: number, sun: Vec3, earth: Vec3): [number, number] {
  eph.sample(ms, sun, earth);
  const distances: [number, number] = [Math.hypot(...sun), Math.hypot(...earth)];
  for (const v of [sun, earth]) {
    const len = Math.hypot(v[0], v[1], v[2]);
    v[0] /= len;
    v[1] /= len;
    v[2] /= len;
  }
  return distances;
}
