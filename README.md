# Southlight: Lunar Landing Site Navigator

Pick a date and see, site by site, whether a lander at the Moon's south pole gets sunlight and a line of sight to Earth. Built for the NASA Space Apps challenge "Lunar Landing Site Navigator".

Everything runs in the browser. There is no server and no API key.

## Run it

```bash
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
| `public/data` | Sun/Earth position table, horizon masks, terrain tiles, validation results |

The verdict thresholds (Good, Risky, Poor) are this project's own definitions, not NASA standards. They are listed in the app under "How we know", together with every assumption, the validation results, and the limits.

## Rebuilding the data

Needs [uv](https://docs.astral.sh/uv/) and about 1 GB of disk. Download these into `data/raw/`:

| File | Source |
| --- | --- |
| `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls`, `pck00011.tpc` | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ (`spk/planets`, `pck`, `fk/satellites`, `lsk`) |
| `LDEM_80S_80MPP_ADJ.TIF` | https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/ |
| `LDEM_80S_40MPP_ADJ.TIF` (optional, for the resolution check) | same folder |

The Moon Kit maps are downloaded by the texture script itself. Then:

```bash
cd tools
uv run python build_ephemeris.py        # Sun and Earth positions, hourly, 2026 to 2030
uv run python build_horizons.py         # site points and their terrain skylines
uv run python build_textures.py         # Moon picture maps and site terrain tiles
uv run python validate_horizons_api.py  # compare directions with NASA/JPL Horizons
uv run python build_validation.py       # the checks shown in the app
uv run python build_golden.py           # reference values for npm test
```

Sites are defined in `tools/sites.json`.

## References

**Data**

- NASA NAIF generic SPICE kernels: DE440 planetary ephemeris, lunar orientation and frame kernels, leap seconds.
- NASA GSFC Planetary Geodesy Data Archive: LOLA south pole elevation maps (`LDEM_80S_80MPP_ADJ.TIF`, `LDEM_80S_40MPP_ADJ.TIF`), and the high-resolution site maps (product 78) whose centres locate the three sites. Barker, M. K., et al. (2021), "Improved LOLA elevation maps for south pole landing sites", *Planetary and Space Science* 203, 105119.
- NASA Scientific Visualization Studio, CGI Moon Kit (https://svs.gsfc.nasa.gov/4720): colour and elevation maps, used for the picture of the Moon only.
- NASA/JPL Horizons (https://ssd.jpl.nasa.gov/horizons/), used as an independent check.
- Bryant, S., "Lunar Pole Illumination and Communications Statistics Computed from GSSR Elevation Data", JPL (NASA NTRS 20150008843), used as a published benchmark.

**Software**: SPICE toolkit via SpiceyPy, NumPy, Rasterio, Pillow (data preparation); three.js, React, Zustand, Vite, TypeScript, Vitest (the app).

**Design**: Instrument Serif typeface (SIL Open Font License, `public/fonts/OFL.txt`). The sky shader, palette and visual style are adapted from Voca, the team's own earlier app; that is pre-existing work.

**AI tools**: Claude (Anthropic) was used to help write the code.
