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
  return seen / (2 * radius * chordHalfSum);
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
}

const sunVec: Vec3 = [0, 0, 0];
const earthVec: Vec3 = [0, 0, 0];

export function emptySky(): SkyState {
  return {
    sun: { az: 0, el: 0, radius: 0, frac: 0 },
    earth: { az: 0, el: 0, radius: 0, frac: 0 },
  };
}

/** Where the Sun and Earth are in a site's sky at an instant, and how much of each is visible. */
export function skyAt(eph: Ephemeris, site: Site, ms: number, out: SkyState = emptySky()): SkyState {
  eph.sample(ms, sunVec, earthVec);
  localSky(site, sunVec, SUN_RADIUS_KM, out.sun);
  localSky(site, earthVec, EARTH_RADIUS_KM, out.earth);
  return out;
}

/** Unit directions from the Moon's centre to the Sun and Earth, Moon-fixed frame. */
export function bodyDirections(eph: Ephemeris, ms: number, sun: Vec3, earth: Vec3): void {
  eph.sample(ms, sun, earth);
  for (const v of [sun, earth]) {
    const len = Math.hypot(v[0], v[1], v[2]);
    v[0] /= len;
    v[1] /= len;
    v[2] /= len;
  }
}
