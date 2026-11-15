"""Run the validation checks and write them for the app's trust panel.

Thresholds and methods are fixed before these checks run. Nothing here feeds
back into the engine: the results are reported as they come out.

Output: public/data/validation.json
"""

from __future__ import annotations

import datetime as dt
import json

import numpy as np
import spiceypy as sp

from build_horizons import Dem, build_mask
from lunar.common import PUBLIC_DATA, RAW, ROOT, load_kernels, load_resolved_sites
from lunar.metrics import load_mask, series, summarise, window_ets

DEFAULT_WINDOW = ("2026-11-14T00:00:00", 30)
YEAR = 2027
FINE_DEM = RAW / "LDEM_80S_40MPP_ADJ.TIF"


def hourly(start: str, end: str) -> np.ndarray:
    return np.arange(sp.str2et(start), sp.str2et(end), 3600.0)


def main() -> None:
    load_kernels()
    sites = load_resolved_sites()
    masks = {s["id"]: load_mask(PUBLIC_DATA / s["horizon_file"]) for s in sites}

    horizons = json.loads((ROOT / "data" / "validation" / "horizons_check.json").read_text())

    # Sun elevation range over the whole supported span.
    span = hourly("2026-01-01T00:00:00", "2031-01-01T00:00:00")
    sun_el = []
    for s in sites:
        el = series(s, masks[s["id"]], span)["sun"]["el"]
        sun_el.append({"site": s["id"], "min_deg": round(float(el.min()), 2), "max_deg": round(float(el.max()), 2)})

    # Length of the lunar day: mean time between the Sun crossing due north.
    year_hours = hourly(f"{YEAR}-01-01T00:00:00", f"{YEAR + 1}-01-01T00:00:00")
    day_len = []
    for s in sites:
        az = series(s, masks[s["id"]], year_hours)["sun"]["az"]
        wrapped = (az + 180.0) % 360.0 - 180.0
        idx = np.nonzero((wrapped[:-1] < 0) & (wrapped[1:] >= 0) & (np.abs(wrapped[:-1]) < 90))[0]
        if len(idx) < 2:
            idx = np.nonzero((wrapped[:-1] >= 0) & (wrapped[1:] < 0) & (np.abs(wrapped[:-1]) < 90))[0]
        cross = idx + wrapped[idx] / (wrapped[idx] - wrapped[idx + 1])
        day_len.append({"site": s["id"], "period_days": round(float(np.diff(cross).mean() / 24.0), 2)})

    # A full year, for comparison with the published study.
    year_steps = window_ets(f"{YEAR}-01-01T00:00:00", 365)
    yearly, disc_point = [], []
    for s in sites:
        disc = series(s, masks[s["id"]], year_steps)
        m = summarise(disc["sun"]["frac"], disc["earth"]["frac"])
        yearly.append(
            {
                "site": s["id"],
                "sunlight_pct": round(m["sunlight_pct"], 1),
                "earth_link_pct": round(m["earth_link_pct"], 1),
                "longest_dark_hours": m["longest_dark_hours"],
            }
        )
        point = series(s, masks[s["id"]], year_steps, point_sun=True)
        pm = summarise(point["sun"]["frac"], point["earth"]["frac"])
        w = window_ets(*DEFAULT_WINDOW)
        wd = series(s, masks[s["id"]], w)
        wp = series(s, masks[s["id"]], w, point_sun=True)
        disc_point.append(
            {
                "site": s["id"],
                "disc_sunlight_pct": round(m["sunlight_pct"], 1),
                "point_sunlight_pct": round(pm["sunlight_pct"], 1),
                "verdict_flips": summarise(wd["sun"]["frac"], wd["earth"]["frac"])["verdict"]
                != summarise(wp["sun"]["frac"], wp["earth"]["frac"])["verdict"],
            }
        )

    # Terrain resolution: rebuild each mask from the 40 m map at the same point.
    fine = None
    if FINE_DEM.exists():
        try:
            fine = Dem(FINE_DEM)
        except Exception as err:  # an incomplete download cannot be read
            print("40 m map unreadable, skipping the resolution check:", str(err)[:80])
    resolution = {"available": fine is not None, "note": "", "sites": []}
    if fine is not None:
        w = window_ets(*DEFAULT_WINDOW)
        for s in sites:
            h = float(fine.sample(np.array([s["x_m"]]), np.array([s["y_m"]]))[0])
            fine_mask = build_mask(fine, s["x_m"], s["y_m"], h, s["lat_deg"], s["lon_deg"])
            fine_site = {**s, "height_m": h}
            a = series(s, masks[s["id"]], w)
            b = series(fine_site, fine_mask, w)
            ma = summarise(a["sun"]["frac"], a["earth"]["frac"])
            mb = summarise(b["sun"]["frac"], b["earth"]["frac"])
            pick = lambda m: {  # noqa: E731
                "sunlight_pct": round(m["sunlight_pct"], 1),
                "earth_link_pct": round(m["earth_link_pct"], 1),
                "verdict": m["verdict"],
            }
            resolution["sites"].append(
                {
                    "site": s["id"],
                    "window_start_utc": DEFAULT_WINDOW[0] + "Z",
                    "days": DEFAULT_WINDOW[1],
                    "coarse": pick(ma),
                    "fine": pick(mb),
                    "verdict_flips": ma["verdict"] != mb["verdict"],
                }
            )
        resolution["note"] = (
            "Each horizon was rebuilt from the 40 m map at the same map point and the default window was recomputed."
        )
    else:
        resolution["note"] = "The 40 m terrain map was not available when the data was prepared, so this check was not run."

    out = {
        "generated_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "horizons": horizons,
        "sun_elevation": {
            "expected_max_deg": 7.0,
            "pass": all(x["max_deg"] <= 7.0 for x in sun_el),
            "sites": sun_el,
        },
        "day_length": {
            "expected_days": 29.53,
            "pass": all(abs(x["period_days"] - 29.53) <= 0.5 for x in day_len),
            "sites": day_len,
        },
        "yearly": {
            "year": YEAR,
            "benchmark": {
                "solar_pct": 92,
                "earth_pct": 50,
                "source": "Bryant, S., Lunar Pole Illumination and Communications Statistics Computed from GSSR Elevation Data, JPL (NASA NTRS 20150008843)",
            },
            "sites": yearly,
            "note": (
                "The study's figures are multi-year averages for its own best site, from radar terrain. "
                "Ours are one calendar year at different points from laser terrain, so they are a neighbourhood check, not a match."
            ),
        },
        "resolution": resolution,
        "disc_vs_point": {
            "note": f"Sunlight share over {YEAR} with the Sun as a disc (used in the app) and as a single point; the flip column is for the default window.",
            "sites": disc_point,
        },
    }
    (PUBLIC_DATA / "validation.json").write_text(json.dumps(out, indent=2) + "\n")
    for k in ("sun_elevation", "day_length", "yearly", "resolution", "disc_vs_point"):
        print(k, json.dumps(out[k])[:700])


if __name__ == "__main__":
    main()
