import { useState } from 'react';
import type { AppData } from '../engine/load';
import { STEP_MINUTES, THRESHOLDS, VISIBLE_THRESHOLD } from '../engine/metrics';
import { nearestPsr, psrHostLabel } from '../engine/psr';
import { useStore } from '../state/store';
import { fmtDate, km } from './format';
import { useEscape } from './hooks';

function Check({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <span className="check" data-ok={ok === null ? 'info' : ok}>
      <i aria-hidden="true">{ok === null ? 'i' : ok ? '✓' : '✕'}</i>
      {children}
    </span>
  );
}

function references(data: AppData): string {
  const k = data.eph.meta.kernels;
  return [
    'Data',
    `- NASA NAIF generic SPICE kernels: ${k.join(', ')} (naif.jpl.nasa.gov/pub/naif/generic_kernels)`,
    `- NASA GSFC PGDA, LOLA south pole elevation map ${data.sitesFile.terrain_file} (pgda.gsfc.nasa.gov/data/LOLA_20mpp)`,
    '- NASA GSFC PGDA, high-resolution LOLA site maps, used for site locations (pgda.gsfc.nasa.gov/products/78); Barker, M. K., et al. (2021), Planetary and Space Science 203, 105119',
    '- NASA Scientific Visualization Studio, CGI Moon Kit (svs.gsfc.nasa.gov/4720): colour map and elevation map, used for the picture of the Moon only',
    '- NASA/JPL Horizons system (ssd.jpl.nasa.gov/horizons), used as an independent check',
    `- ${data.psrs.source}, south-pole permanently shadowed regions of ${data.psrs.min_area_km2} km² or more (${data.psrs.url.replace(/^https:\/\//, '')}, retrieved ${data.psrs.retrieved_utc}); outlines from Mazarico, E., et al. (2011), Icarus 211, 1066-1081`,
    `- ${data.validation.yearly.benchmark.source}`,
    'Software',
    '- SPICE toolkit via SpiceyPy; NumPy; Rasterio; Pillow (data preparation)',
    '- three.js; React; Zustand; Vite; TypeScript; Vitest (the app)',
    'Design',
    '- Instrument Serif typeface, SIL Open Font License',
    "- Sky shader, palette and visual style adapted from Voca, the team's own earlier app",
    'AI tools',
    '- Claude (Anthropic) and Codex (OpenAI) assisted with writing, debugging and reviewing the code',
  ].join('\n');
}

/** Assumptions, thresholds, data and the validation results, all on one sheet. */
export function TrustPanel({ data }: { data: AppData }) {
  const close = () => useStore.getState().setPanel('none');
  useEscape(close);
  const [copied, setCopied] = useState(false);
  const v = data.validation;
  const name = (id: string) => data.sites.find((s) => s.id === id)?.name ?? id;
  const refs = references(data);

  return (
    <div className="sheet-backdrop" onClick={close}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label="How we know" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h1>How we know</h1>
          <button type="button" className="round round-x" aria-label="Close" onClick={close} autoFocus>
            ✕
          </button>
        </header>

        <div className="sheet-body">
          <section>
            <h2>What the verdict means</h2>
            <p>These cut-offs are our own definitions, not NASA standards. They were set before we compared anything with published values.</p>
            <table className="data">
              <thead>
                <tr>
                  <th>Verdict</th>
                  <th>Rule</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Good</td>
                  <td>
                    Sunlight at least {THRESHOLDS.goodMinSunlightPct}% of the window, and the longest dark stretch under{' '}
                    {THRESHOLDS.goodMaxDarkHours} hours
                  </td>
                </tr>
                <tr>
                  <td>Poor</td>
                  <td>
                    Sunlight under {THRESHOLDS.poorMaxSunlightPct}%, or a dark stretch over {THRESHOLDS.poorMinDarkHours} hours
                  </td>
                </tr>
                <tr>
                  <td>Risky</td>
                  <td>Everything in between</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2>How each number is calculated</h2>
            <ol>
              <li>
                The Sun's and Earth's positions come from NASA's DE440 ephemeris, in the Moon's own rotating frame (the mean Earth / polar
                axis frame, the same one the terrain map uses), sampled hourly and interpolated. The interpolation stays within{' '}
                {Math.max(data.eph.meta.max_interpolation_error_deg.sun_deg, data.eph.meta.max_interpolation_error_deg.earth_deg).toFixed(6)}°
                of the source.
              </li>
              <li>Each is turned into a compass direction and a height above level ground at the site.</li>
              <li>
                A skyline is built for each site from the {data.sitesFile.terrain_resolution_m} m laser-altimeter map: for every{' '}
                {data.sitesFile.mask_step_deg}° of compass direction, the highest angle at which terrain blocks the sky, out to the edge of
                the map, seen from {data.sitesFile.mast_height_m} m above the ground.
              </li>
              <li>The Sun and Earth are treated as discs. Visibility includes the terrain skyline and Earth's obstruction of the Sun during lunar eclipses. Overlapping obstructions are counted once.</li>
              <li>
                The window is stepped every {STEP_MINUTES} minutes. Sunlight and Earth-in-view count the steps where at least{' '}
                {VISIBLE_THRESHOLD * 100}% of the disc is clear. The dark stretch is the longest run without direct sunlight, including total eclipses.
              </li>
              <li>
                The line under the site name splits the window into 24-hour days from its start. A day is operable when the Sun and Earth
                are both in view for at least half of it; a final half day counts as half. It also gives the start of the first stretch of
                full darkness lasting {THRESHOLDS.goodMaxDarkHours} hours or more, the length that rules out a Good verdict.
              </li>
            </ol>
            <p>All of this runs in your browser. Nothing is sent to a server.</p>
          </section>

          <section>
            <h2>Checks we ran</h2>

            <h3>
              <Check ok={v.horizons.pass}>Directions agree with NASA's Horizons service</Check>
            </h3>
            <p>
              Horizons is a separate NASA system. At {data.sites.length} sites on 3 dates, our Sun and Earth directions differ from it by at
              most {v.horizons.worst_abs_diff_deg < 0.0001 ? '0.0001' : v.horizons.worst_abs_diff_deg.toFixed(4)}° (pass mark {v.horizons.tolerance_deg}°).
            </p>
            <details>
              <summary>Show all {v.horizons.rows.length} comparisons</summary>
              <table className="data">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>UTC</th>
                    <th>Body</th>
                    <th>Ours (compass, height)</th>
                    <th>Horizons</th>
                  </tr>
                </thead>
                <tbody>
                  {v.horizons.rows.map((r) => (
                    <tr key={`${r.site}-${r.utc}-${r.body}`}>
                      <td>{name(r.site)}</td>
                      <td>{r.utc}</td>
                      <td>{r.body}</td>
                      <td>
                        {r.ours_az.toFixed(4)}°, {r.ours_el.toFixed(4)}°
                      </td>
                      <td>
                        {r.horizons_az.toFixed(4)}°, {r.horizons_el.toFixed(4)}°
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>

            <h3>
              <Check ok={v.sun_elevation.pass}>The Sun stays low, as it should at the pole</Check>
            </h3>
            <p>
              NASA's Artemis material says the Sun stays below about {v.sun_elevation.expected_max_deg}° at south-pole landing regions.
              Across all the dates we cover, our highest Sun is{' '}
              {v.sun_elevation.sites.map((s) => `${s.max_deg}° at ${name(s.site)}`).join(', ')}.
            </p>

            <h3>
              <Check ok={v.day_length.pass}>The lunar day comes out the right length</Check>
            </h3>
            <p>
              The Sun should circle the sky about every {v.day_length.expected_days} Earth days. We measure{' '}
              {v.day_length.sites.map((s) => `${s.period_days} at ${name(s.site)}`).join(', ')}.
            </p>

            <h3>
              <Check ok={null}>A full year, next to a published study</Check>
            </h3>
            <p>
              A JPL study using radar terrain found its best south-pole site had sunlight about {v.yearly.benchmark.solar_pct}% of the time
              and a direct line to Earth about {v.yearly.benchmark.earth_pct}%. Our figures for {v.yearly.year}:
            </p>
            <table className="data">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Sunlight</th>
                  <th>Earth in view</th>
                </tr>
              </thead>
              <tbody>
                {v.yearly.sites.map((s) => (
                  <tr key={s.site}>
                    <td>{name(s.site)}</td>
                    <td>{s.sunlight_pct}%</td>
                    <td>{s.earth_link_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>{v.yearly.note} We did not adjust anything to bring these closer.</p>

            <h3>
              <Check ok={null}>
                Terrain resolution can change a verdict
              </Check>
            </h3>
            <p>{v.resolution.note}</p>
            {v.resolution.available && (
              <>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th>80 m comparison</th>
                      <th>40 m calculation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.resolution.sites.map((s) => (
                      <tr key={s.site}>
                        <td>{name(s.site)}</td>
                        <td>
                          {s.coarse.sunlight_pct}% sunlight, {s.coarse.verdict}
                        </td>
                        <td>
                          {s.fine.sunlight_pct}% sunlight, {s.fine.verdict}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>
                  This table is the 30-day reference window starting 14 Nov 2026. Agreement here does not prove stability on other dates.
                  In the 2027 sweep, the number of seven-day windows whose verdict changed was{' '}
                  {v.resolution.sites.map(s => `${name(s.site)}: ${s.yearly_verdict_flips['7']} of 365`).join('; ')}.
                  The card flags disagreement for the selected window. Both maps are estimates; their difference is not an error bound.
                </p>
              </>
            )}

            <h3>
              <Check ok={null}>Treating the Sun as a disc rather than a point</Check>
            </h3>
            <p>
              Over {v.yearly.year}, the disc changes the yearly sunlight share by at most{' '}
              {Math.max(...v.disc_vs_point.sites.map((s) => Math.abs(s.disc_sunlight_pct - s.point_sunlight_pct))).toFixed(1)} points, and{' '}
              {v.disc_vs_point.sites.some((s) => s.verdict_flips) ? 'it changes a verdict for the default window' : 'it changes no verdict for the default window'}.
                These are measured comparisons for the stated year and reference window; other windows can differ.
            </p>
          </section>

          <section>
            <h2>What this does not tell you</h2>
            <ul>
              <li>Earth in view means line of sight only. It does not guarantee a working radio link.</li>
              <li>The verdict looks at sunlight and darkness. It says nothing about slopes, hazards, temperature or landing safety.</li>
              <li>
                Each site is a single point: {data.sites.map((s) => s.name).join(', ')}. A lander a few hundred metres away could see a
                different skyline.
              </li>
              <li>
                Dates covered: {fmtDate.format(data.eph.usableStartMs)} to {fmtDate.format(data.eph.usableEndMs)}. Outside that range the
                app says so instead of guessing.
              </li>
              <li>All times are UTC.</li>
              <li>Eclipses use the geometric Sun and Earth discs. Atmospheric refraction, diffuse light and solar-array energy yield are not modeled.</li>
              <li>
                The picture of the Moon is for orientation. Its lit side follows the real Sun direction, but the texture drives no number,
                and Earth and the Sun are drawn much closer than they are. Only their directions are real.
              </li>
            </ul>
          </section>

          <section>
            <h2>Water-ice targets</h2>
            <p>
              A permanently shadowed region (PSR) is ground the Sun never reaches, usually a crater floor near the pole. PSRs are cold
              enough to trap water ice, so they are prime targets for finding it. Being near one suggests possible water ice; it does not
              mean ice has been confirmed there.
            </p>
            <p>
              PSR locations come from the {data.psrs.source}, which lists every south-pole PSR of {data.psrs.min_area_km2} km² or more
              with its centre point and area. Its shadow outlines come from Mazarico et al. (2011), who modelled sunlight over an 18.6-year
              cycle on NASA's Lunar Orbiter Laser Altimeter (LOLA) terrain. We store the {data.psrs.psrs.length} south-pole entries
              unchanged and measure the great-circle distance from each site to each PSR's centre on a {data.sitesFile.reference_radius_km} km
              sphere. The shadow's edge is closer than its centre, and smaller shadowed pockets below the atlas's size limit lie closer still.
            </p>
            <table className="data">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Nearest PSR (atlas ID)</th>
                  <th>In or near</th>
                  <th>Area</th>
                  <th>Distance to centre</th>
                </tr>
              </thead>
              <tbody>
                {data.sites.map((s) => {
                  const n = nearestPsr(s, data.psrs.psrs, data.sitesFile.reference_radius_km);
                  return n && (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{n.psr.id}</td>
                      <td>{psrHostLabel(n.psr.features)}</td>
                      <td>{Math.round(n.psr.area_km2)} km²</td>
                      <td>{km(n.distanceKm)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section>
            <h2>Where the sites come from</h2>
            <table className="data">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Position</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {data.sites.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>
                      {s.lat_deg.toFixed(4)}°, {s.lon_deg.toFixed(4)}° E, {Math.round(s.height_m)} m
                    </td>
                    <td>
                      {s.source}. {s.artemis_list}.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2>Data and credits</h2>
            <pre className="refs">{refs}</pre>
            <button
              type="button"
              className="pill"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(refs);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                } catch {
                  /* the list is on screen to copy by hand */
                }
              }}
            >
              {copied ? 'Copied' : 'Copy the reference list'}
            </button>
            <p className="muted">Checks last run {v.generated_utc.replace('T', ' ').replace('Z', ' UTC')}.</p>
          </section>
        </div>
      </section>
    </div>
  );
}
