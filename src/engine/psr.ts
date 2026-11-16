import type { SiteRecord } from './types';

/** One permanently shadowed region from the LROC PSR Atlas (10 km² or more). */
export interface Psr {
  id: string;
  /** Centroid, planetocentric latitude and east longitude, degrees. */
  lat_deg: number;
  lon_deg: number;
  area_km2: number;
  /** Host features exactly as the atlas lists them; several names can run together. */
  features: string;
}

export interface PsrFile {
  source: string;
  url: string;
  retrieved_utc: string;
  basis: string;
  min_area_km2: number;
  coordinates: string;
  psrs: Psr[];
}

export interface NearestPsr {
  psr: Psr;
  /** Great-circle distance from the site to the PSR's centroid, km. */
  distanceKm: number;
}

const DEG = Math.PI / 180;

/** Great-circle distance between two latitude/longitude points on a sphere (haversine). */
export function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number, radiusKm: number): number {
  const p1 = lat1 * DEG;
  const p2 = lat2 * DEG;
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((lon2 - lon1) * DEG) / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The PSR whose centroid is closest to the site, measured on the reference sphere.
 * Distance is to the centroid, so the shadow's edge is closer than this number.
 */
export function nearestPsr(site: Pick<SiteRecord, 'lat_deg' | 'lon_deg'>, psrs: Psr[], radiusKm: number): NearestPsr | null {
  let best: NearestPsr | null = null;
  for (const psr of psrs) {
    const distanceKm = greatCircleKm(site.lat_deg, site.lon_deg, psr.lat_deg, psr.lon_deg, radiusKm);
    if (!best || distanceKm < best.distanceKm) best = { psr, distanceKm };
  }
  return best;
}

/** Host names for display: "de Gerlache Crater Shackleton Crater" reads "de Gerlache / Shackleton". */
export function psrHostLabel(features: string): string {
  const names = features.split(/(?<=Crater)\s+/).map((f) => f.replace(/\s+Crater$/, '').trim()).filter(Boolean);
  return names.join(' / ');
}
