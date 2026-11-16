import { Ephemeris } from './ephemeris';
import type { PsrFile } from './psr';
import { makeSite } from './site';
import type { EphemerisMeta, Site, SitesFile } from './types';

export interface TerrainTile {
  id: string;
  file: string;
  size: number;
  cell_m: number;
  x_left_m: number;
  y_top_m: number;
  site_col: number;
  site_row: number;
  min_m: number;
  max_m: number;
  /** A wider, coarser tile centred on the same point, used only to cast distant shadows. */
  far_file: string;
  far_cell_m: number;
}

export interface TexturesFile {
  moon_color: string;
  moon_normal: string;
  pole_normal: string;
  pole_half_extent_m: number;
  terrain_tiles: TerrainTile[];
}

export interface HorizonsRow {
  site: string;
  utc: string;
  body: string;
  ours_az: number;
  ours_el: number;
  horizons_az: number;
  horizons_el: number;
  diff_az: number;
  diff_el: number;
}

export interface ValidationFile {
  generated_utc: string;
  horizons: { tolerance_deg: number; worst_abs_diff_deg: number; pass: boolean; rows: HorizonsRow[] };
  sun_elevation: { expected_max_deg: number; pass: boolean; sites: { site: string; min_deg: number; max_deg: number }[] };
  day_length: { expected_days: number; pass: boolean; sites: { site: string; period_days: number }[] };
  yearly: {
    year: number;
    benchmark: { solar_pct: number; earth_pct: number; source: string };
    sites: { site: string; sunlight_pct: number; earth_link_pct: number; longest_dark_hours: number }[];
    note: string;
  };
  resolution: {
    available: boolean;
    note: string;
    sites: {
      site: string;
      window_start_utc: string;
      days: number;
      coarse: { sunlight_pct: number; earth_link_pct: number; verdict: string };
      fine: { sunlight_pct: number; earth_link_pct: number; verdict: string };
      verdict_flips: boolean;
      yearly_verdict_flips: Record<string, number>;
    }[];
  };
  disc_vs_point: {
    note: string;
    sites: { site: string; disc_sunlight_pct: number; point_sunlight_pct: number; verdict_flips: boolean }[];
  };
}

export interface AppData {
  eph: Ephemeris;
  sitesFile: SitesFile;
  sites: Site[];
  textures: TexturesFile;
  validation: ValidationFile;
  /** South-pole permanently shadowed regions, LROC PSR Atlas. */
  psrs: PsrFile;
}

const base = `${import.meta.env.BASE_URL}data/`;

async function json<T>(name: string): Promise<T> {
  const res = await fetch(base + name);
  if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
  return (await res.json()) as T;
}

async function floats(name: string): Promise<Float32Array> {
  const res = await fetch(base + name);
  if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
  return new Float32Array(await res.arrayBuffer());
}

export async function loadAppData(): Promise<AppData> {
  const [meta, table, sitesFile, textures, validation, psrs] = await Promise.all([
    json<EphemerisMeta>('ephemeris.json'),
    floats('ephemeris.bin'),
    json<SitesFile>('sites.json'),
    json<TexturesFile>('textures.json'),
    json<ValidationFile>('validation.json'),
    json<PsrFile>('psrs.json'),
  ]);
  const [masks, comparisonMasks] = await Promise.all([
    Promise.all(sitesFile.sites.map((s) => floats(s.horizon_file))),
    Promise.all(sitesFile.sites.map((s) => floats(s.comparison_horizon_file))),
  ]);
  return {
    eph: new Ephemeris(meta, table),
    sitesFile,
    sites: sitesFile.sites.map((s, i) => makeSite(s, masks[i], sitesFile, comparisonMasks[i])),
    textures,
    validation,
    psrs,
  };
}

export async function loadTerrain(tile: TerrainTile): Promise<{ near: Int16Array; far: Int16Array }> {
  const get = async (file: string) => {
    const res = await fetch(base + file);
    if (!res.ok) throw new Error(`Could not load ${file} (${res.status})`);
    return new Int16Array(await res.arrayBuffer());
  };
  const [near, far] = await Promise.all([get(tile.file), get(tile.far_file)]);
  return { near, far };
}
