import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { testData as data } from '../test/data';
import { greatCircleKm, nearestPsr, psrHostLabel, type PsrFile } from './psr';

const psrFile = JSON.parse(readFileSync(resolve(__dirname, '../../public/data/psrs.json'), 'utf8')) as PsrFile;
const R = data.sitesFile.reference_radius_km;

/** Independent check: chord length between unit vectors, turned into an arc. */
function vectorArcKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const v = (lat: number, lon: number) => {
    const p = (lat * Math.PI) / 180;
    const l = (lon * Math.PI) / 180;
    return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
  };
  const a = v(lat1, lon1);
  const b = v(lat2, lon2);
  const chord = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return 2 * R * Math.asin(chord / 2);
}

describe('PSR table', () => {
  it('holds the south-pole atlas rows with plausible values', () => {
    expect(psrFile.psrs.length).toBe(164);
    for (const p of psrFile.psrs) {
      expect(p.id.startsWith('SP_')).toBe(true);
      expect(p.lat_deg).toBeGreaterThanOrEqual(-90);
      expect(p.lat_deg).toBeLessThan(-80);
      expect(p.area_km2).toBeGreaterThanOrEqual(psrFile.min_area_km2);
    }
    expect(psrFile.psrs.find((p) => p.id === 'SP_896450_1282030')).toMatchObject({ lat_deg: -89.645, lon_deg: 128.203, area_km2: 233.698 });
  });
});

describe('nearest PSR', () => {
  it('measures arcs along a meridian and across the pole', () => {
    expect(greatCircleKm(-89, 0, -88, 0, R)).toBeCloseTo((R * Math.PI) / 180, 6);
    expect(greatCircleKm(-89, 0, -89, 180, R)).toBeCloseTo((2 * R * Math.PI) / 180, 6);
  });

  it('matches an independent vector calculation for every site and PSR', () => {
    for (const s of data.sites)
      for (const p of psrFile.psrs)
        expect(greatCircleKm(s.lat_deg, s.lon_deg, p.lat_deg, p.lon_deg, R)).toBeCloseTo(vectorArcKm(s.lat_deg, s.lon_deg, p.lat_deg, p.lon_deg), 6);
  });

  it.each([
    ['connecting-ridge', 'SP_895060_2806850', 15.54, 'de Gerlache / Shackleton'],
    ['malapert-massif', 'SP_860280_3443410', 33.4, 'Haworth / Malapert / Cabeus'],
    ['nobile-rim-1', 'SP_853730_0452650', 18.99, 'Nobile'],
  ])('%s is nearest to %s', (siteId, psrId, km, host) => {
    const n = nearestPsr(data.sites.find((s) => s.id === siteId)!, psrFile.psrs, R)!;
    expect(n.psr.id).toBe(psrId);
    expect(n.distanceKm).toBeCloseTo(km, 1);
    expect(psrHostLabel(n.psr.features)).toBe(host);
  });

  it('leaves names without "Crater" as published', () => {
    expect(psrHostLabel('Cabeus A Cabeus B')).toBe('Cabeus A Cabeus B');
  });
});
