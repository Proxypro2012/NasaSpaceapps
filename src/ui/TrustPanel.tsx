import { useState } from 'react';
import type { AppData } from '../engine/load';
import { STEP_MINUTES, THRESHOLDS, VISIBLE_THRESHOLD } from '../engine/metrics';
import { useStore } from '../state/store';
import { fmtDate } from './format';
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
    `- ${data.validation.yearly.benchmark.source}`,
    'Software',
    '- SPICE toolkit via SpiceyPy; NumPy; Rasterio; Pillow (data preparation)',
    '- three.js; React; Zustand; Vite; TypeScript; Vitest (the app)',
    'Design',
    '- Instrument Serif typeface, SIL Open Font License',
    "- Sky shader, palette and visual style adapted from Voca, the team's own earlier app",
    'AI tools',
    '- Claude (Anthropic) was used to help write the code',
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
              <li>The Sun and Earth are treated as discs. The share of each disc above the skyline is measured, so rises and sets are gradual.</li>
              <li>
                The window is stepped every {STEP_MINUTES} minutes. Sunlight and Earth-in-view count the steps where at least{' '}
                {VISIBLE_THRESHOLD * 100}% of the disc is clear. The dark stretch is the longest run with the Sun fully hidden.
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
                  {v.horizons.rows.map((r, i) => (
                    <tr key={i}>
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
              <Check ok={v.resolution.available ? !v.resolution.sites.some((s) => s.verdict_flips) : null}>
                Finer terrain does not change a verdict
              </Check>
            </h3>
            <p>{v.resolution.note}</p>
            {v.resolution.available && (
              <>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th>{data.sitesFile.terrain_resolution_m} m map</th>
                      <th>40 m map</th>
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
                  The verdicts hold, but the sunlight share can move by several points with finer terrain. Treat the percentages as
                  estimates at this map resolution.
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
              It matters for the shape of each sunrise and sunset, not for the totals.
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
              <li>
                The picture of the Moon is for orientation. Its lit side follows the real Sun direction, but the texture drives no number,
                and Earth and the Sun are drawn much closer than they are. Only their directions are real.
              </li>
            </ul>
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
