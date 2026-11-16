import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ephemeris } from '../engine/ephemeris';
import type { AppData } from '../engine/load';
import { makeSite } from '../engine/site';

const root = resolve(__dirname, '../../public/data');
const json = (name: string) => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const floats = (name: string) => {
  const b = readFileSync(resolve(root, name));
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const sitesFile: AppData['sitesFile'] = json('sites.json');
export const testData: AppData = {
  eph: new Ephemeris(json('ephemeris.json'), floats('ephemeris.bin')), sitesFile,
  sites: sitesFile.sites.map(s => makeSite(s, floats(s.horizon_file), sitesFile, floats(s.comparison_horizon_file))),
  textures: json('textures.json'), validation: json('validation.json'), psrs: json('psrs.json'),
};
