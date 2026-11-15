import type { Site, SiteRecord, SitesFile, Vec3 } from './types';

const DEG = Math.PI / 180;

/** Unit vector of a latitude and east longitude in the Moon-fixed frame. */
export function directionOf(latDeg: number, lonDeg: number): Vec3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

/** Builds the local east, north, up axes and observer position for a site. */
export function makeSite(record: SiteRecord, mask: Float32Array, file: SitesFile, comparisonMask?: Float32Array): Site {
  if (mask.length !== file.mask_bins) {
    throw new Error(`${record.id}: horizon mask has ${mask.length} bins, expected ${file.mask_bins}`);
  }
  const up = directionOf(record.lat_deg, record.lon_deg);
  const lon = record.lon_deg * DEG;
  const east: Vec3 = [-Math.sin(lon), Math.cos(lon), 0];
  const north: Vec3 = [
    up[1] * east[2] - up[2] * east[1],
    up[2] * east[0] - up[0] * east[2],
    up[0] * east[1] - up[1] * east[0],
  ];
  const radius = file.reference_radius_km + (record.height_m + file.mast_height_m) / 1000;
  return {
    ...record,
    position: [up[0] * radius, up[1] * radius, up[2] * radius],
    east,
    north,
    up,
    mask,
    maskStepDeg: file.mask_step_deg,
    comparison: comparisonMask
      ? makeSite({ ...record, height_m: record.comparison_height_m }, comparisonMask, file)
      : undefined,
  };
}

/** Terrain horizon elevation at any azimuth, linearly interpolated between bins. */
export function horizonAt(site: Site, azDeg: number): number {
  const n = site.mask.length;
  let a = (azDeg % 360) / site.maskStepDeg;
  if (a < 0) a += n;
  const i0 = Math.floor(a);
  const f = a - i0;
  const m0 = site.mask[i0 % n];
  const m1 = site.mask[(i0 + 1) % n];
  return m0 + (m1 - m0) * f;
}
