# Southlight: Lunar Landing Site Navigator

Pick a date and see, site by site, whether a lander at the Moon's south pole gets sunlight and a line of sight to Earth. Built for the NASA Space Apps challenge "Lunar Landing Site Navigator".

Everything runs in the browser. There is no server and no API key.

**Live app:** https://southlight-tau.vercel.app/

**Project guide, screenshots and captioned walkthrough:** https://southlight-tau.vercel.app/?guide=1

## Run it

```bash
nvm use 24         # Node.js 24.x (or install it with your preferred version manager)
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests against the SPICE reference values
npm run build      # static site in dist/
```

The prepared data is already in `public/data` and `public/textures`, so the steps above are all you need.

## How it works

1. `tools/` (Python, run once) turns NASA's files into small data files.
2. `src/engine/` (TypeScript, runs in the browser) computes every direction, visible fraction, metric and verdict from those files, for any date from 2 Jan 2026 to 30 Dec 2030.
3. `src/scene/` and `src/ui/` draw what the engine returns. They calculate nothing themselves.

| Folder | What is in it |
| --- | --- |
| `src/engine` | Ephemeris interpolation, local sky geometry, disc-against-skyline visibility, window metrics, verdicts, best-window search |
| `src/scene` | The Moon, Earth and Sun scene, and the 3D terrain close-up (three.js) |
| `src/ui` | Verdict card, skyline chart, calendar, trust panel, site view |
| `tools` | Data preparation and validation scripts |
| `public/data` | Sun/Earth position table, horizon masks, terrain tiles, validation results, south-pole PSR locations |

The verdict thresholds (Good, Risky, Poor) are this project's own definitions, not NASA standards. They are listed in the app under "How we know", together with every assumption, the validation results, and the limits.

Calculations use the 40 m LOLA terrain map, with an 80 m comparison at the same
points. The selected window is flagged when the two resolutions disagree on
the sunlight verdict. Solar visibility includes geometric lunar eclipses and
terrain obstruction. Good/Risky/Poor describe sunlight conditions; Earth
visibility is reported separately and does not establish a working radio link
or landing safety. All metrics use 30-minute samples, so percentages and dark
durations are estimates rather than exact event times.

## Rebuilding the data

Needs [uv](https://docs.astral.sh/uv/) and about 1 GB of disk. Download these into `data/raw/`:

| File | Source |
| --- | --- |
| `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls`, `pck00011.tpc` | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ (`spk/planets`, `pck`, `fk/satellites`, `lsk`) |
| `LDEM_80S_80MPP_ADJ.TIF` | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/ |
| `LDEM_80S_40MPP_ADJ.TIF` (primary calculations) | same folder |

The Moon Kit maps are downloaded by the texture script itself. Then:

```bash
cd tools
uv run python build_ephemeris.py        # Sun and Earth positions, hourly, 2026 to 2030
uv run python build_horizons.py         # site points and their terrain skylines
uv run python build_textures.py         # Moon picture maps and site terrain tiles
uv run python validate_horizons_api.py  # compare directions with NASA/JPL Horizons
uv run python build_validation.py       # the checks shown in the app
uv run python build_golden.py           # reference values for npm test
uv run python fetch_psrs.py             # south-pole PSR locations from the LROC PSR Atlas
```

Sites are defined in `tools/sites.json`.

## References

**Data**

- NASA NAIF generic SPICE kernels: DE440 planetary ephemeris, lunar orientation and frame kernels, leap seconds.
- NASA GSFC Planetary Geodesy Data Archive: LOLA south pole elevation maps (`LDEM_80S_80MPP_ADJ.TIF`, `LDEM_80S_40MPP_ADJ.TIF`), and the high-resolution site maps (product 78) whose centres locate the three sites. Barker, M. K., et al. (2021), "Improved LOLA elevation maps for south pole landing sites", *Planetary and Space Science* 203, 105119.
- NASA Scientific Visualization Studio, CGI Moon Kit (https://svs.gsfc.nasa.gov/4720): colour and elevation maps, used for the picture of the Moon only.
- NASA/JPL Horizons (https://ssd.jpl.nasa.gov/horizons/), used as an independent check.
- LROC PSR Atlas, Arizona State University (https://lroc.im-ldi.com/atlases/psr/list): centroids and areas of south-pole permanently shadowed regions of 10 km² or more, from the LOLA illumination modelling of Mazarico, E., et al. (2011), Icarus 211, 1066-1081. Used for the Nearest PSR readout only.
- Bryant, S., "Lunar Pole Illumination and Communications Statistics Computed from GSSR Elevation Data", JPL (NASA NTRS 20150008843), used as a published benchmark.

**Software**: SPICE toolkit via SpiceyPy, NumPy, Rasterio, Pillow (data preparation); three.js, React, Zustand, Vite, TypeScript, Vitest (the app).

**Design**: Instrument Serif typeface (SIL Open Font License, `public/fonts/OFL.txt`). The sky shader, palette and visual style are adapted from Voca, the team's own earlier app; that is pre-existing work.

## AI use and data provenance

The team chose the challenge, set the goals and design direction, and directed
the work. Claude (Anthropic), through Claude Code, and Codex (OpenAI) generated
and revised substantial portions of the code, tests, documentation and
data-processing scripts under that direction. AI tools also assisted with
debugging, research and code review. This disclosure covers the repository and
its prepared data pipeline, not just files carrying an AI comment.

The scientific source data comes from the cited NASA/JPL datasets. Prepared
ephemeris tables, terrain masks and validation files are numerical outputs of
the processing scripts; the displayed values are deterministic calculations,
not AI predictions or invented NASA measurements. The Moon textures come from
NASA's CGI Moon Kit. Screenshots and the walkthrough capture the running app.

## Limits

- Three sampled site points, not a survey of all landing terrain; small features
  below the 40 m grid can be missed. The 80 m comparison measures sensitivity,
  not an error bound or ground truth.
- Thirty-minute samples estimate visibility shares and gap durations within the
  selected window; a gap can extend beyond that window. Coverage is 2026–2030.
- Earth visibility and its longest gap use a half-disc threshold. They do not
  model antennas, radio budgets, relays or ground-station service.
- Sunlight visibility is not power or energy yield. Thermal conditions, slopes,
  hazards and landing safety are not assessed. Eclipse geometry excludes
  atmospheric refraction and diffuse light.
- Good/Risky/Poor are our sunlight thresholds, not NASA standards or approval.
  The verdict uses the single longest dark stretch, so over a one-year window
  almost every site reads Poor.
- Nearest PSR is the distance to the centre of the closest permanently shadowed
  region of 10 km² or more in the LROC PSR Atlas. The shadow's edge, and smaller
  shadowed pockets, are closer. Being near a PSR indicates possible water ice,
  not confirmed ice.
- An operable day is our own definition: a 24-hour block with the Sun and Earth
  both in view for at least half of it.

## Inspiration

[Earthrise](https://github.com/Abulkosim/earthrise) inspired this iteration's
site-comparison view, longest Earth-gap readout and guided month playback.
Southlight implements these features using its existing site metrics, calendar
and date animation. Earthrise's numerical results and validation claims are not
Southlight validation evidence.

## Mission and virtual project guide

Choose **Try a mission** for a reproducible seven-day Connecting Ridge example.
The better-window search keeps original and destination results side by side;
the shared visibility timeline explains terrain obstruction and eclipses at the
same moment used by the skyline and scene. Both terrain maps are searched to
flag recommendations whose preferred dates depend on map detail.

Open `/?guide=1` for the project introduction, screenshots and captioned recording.

The header's **Scene time** is the UTC moment actually shown. The result card's
**Assessment window** labels the full interval used for its totals and has its
own start-date control. Calendar and timeline selections inspect moments inside
that interval. Shared links restore both dates, site and audience in a fresh tab,
in an already-open tab, and through browser back/forward navigation.
The compact **All sites** strip compares the same window across all three sites.
Its verdicts and dots share the pin colors and timing; select a row to focus its
pin. Open **Skyline and details** for the timeline, evidence and exports.
Source materials are in `public/submission/`; current submission-requirement
findings are in `docs/submission-requirements.md`.

Run `npm run verify:all-sites` against a production preview to check all three
sites against the engine and pins on three dates, animation, selection and fit.

Deploy with the authenticated Vercel CLI using `vercel --prod`. The project
configuration builds `dist/`; `.vercelignore` excludes raw data and environments.

To regenerate the recorded walkthrough and screenshots, have FFmpeg installed
and a production preview running, then run `npm run capture:mission`.
