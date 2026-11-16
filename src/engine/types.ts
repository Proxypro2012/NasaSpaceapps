/** Shared engine types. All angles are degrees, all times are UTC milliseconds. */

export type Vec3 = [number, number, number];

export interface EphemerisMeta {
  start_utc: string;
  end_utc: string;
  step_seconds: number;
  samples: number;
  values_per_sample: number;
  frame: string;
  aberration: string;
  kernels: string[];
  interpolation: string;
  max_interpolation_error_deg: { sun_deg: number; earth_deg: number };
}

export interface SiteRecord {
  id: string;
  name: string;
  blurb: string;
  lat_deg: number;
  lon_deg: number;
  height_m: number;
  x_m: number;
  y_m: number;
  horizon_file: string;
  comparison_horizon_file: string;
  comparison_height_m: number;
  artemis_list: string;
  source: string;
}

export interface SitesFile {
  terrain_file: string;
  terrain_resolution_m: number;
  comparison_terrain_file: string;
  comparison_resolution_m: number;
  mast_height_m: number;
  mask_step_deg: number;
  mask_bins: number;
  reference_radius_km: number;
  frame: string;
  sites: SiteRecord[];
}

/** A site ready for calculation: local axes, position and horizon mask. */
export interface Site extends SiteRecord {
  /** Observer position in the Moon-fixed frame, km. */
  position: Vec3;
  east: Vec3;
  north: Vec3;
  up: Vec3;
  /** Terrain horizon elevation per azimuth bin, degrees. */
  mask: Float32Array;
  maskStepDeg: number;
  comparison?: Site;
}

export interface BodySky {
  /** Azimuth, clockwise from north. */
  az: number;
  /** Elevation of the disc centre above the local horizontal. */
  el: number;
  /** Angular radius of the disc. */
  radius: number;
  /** Fraction of the disc above the terrain horizon, 0 to 1. */
  frac: number;
  /** Fraction above terrain alone, before eclipse obstruction. */
  terrainFrac: number;
}

export interface SkyState {
  sun: BodySky;
  earth: BodySky;
}

export type Verdict = 'Good' | 'Risky' | 'Poor';

export interface WindowMetrics {
  sunlightPct: number;
  longestDarkHours: number;
  earthLinkPct: number;
  /** Longest window-clipped run below the half-disc Earth visibility threshold. */
  longestEarthGapHours: number;
  combinedPct: number;
  verdict: Verdict;
  resolution?: {
    sunlightPct: number;
    longestDarkHours: number;
    earthLinkPct: number;
    longestEarthGapHours: number;
    combinedPct: number;
    verdict: Verdict;
    sensitive: boolean;
  };
}

export interface DayCell {
  /** Start of the UTC day. */
  dayMs: number;
  sunlightPct: number;
  earthLinkPct: number;
  combinedPct: number;
}
