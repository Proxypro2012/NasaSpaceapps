"""Independent check of Sun and Earth directions against NASA/JPL Horizons.

Horizons computes azimuth and elevation for an observer on the lunar surface
with its own software and its own lunar orientation model. We compare it with
our SPICE-based calculation at each site on three dates.

Output: data/validation/horizons_check.json (merged into the trust panel data
by build_validation.py).
"""

from __future__ import annotations

import json
import re

import requests
import spiceypy as sp

from lunar.common import MAST_HEIGHT_M, ROOT, body_local, load_kernels, load_resolved_sites

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
DATES = ["2026-11-14 12:00", "2027-06-21 00:00", "2029-02-03 18:00"]
BODIES = {"SUN": "10", "EARTH": "399"}


def horizons_az_el(command: str, site: dict, date: str) -> tuple[float, float]:
    alt_km = (site["height_m"] + MAST_HEIGHT_M) / 1000.0
    params = {
        "format": "text",
        "COMMAND": f"'{command}'",
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"'{site['lon_deg']},{site['lat_deg']},{alt_km}'",
        "TLIST": f"'{date}'",
        "TIME_TYPE": "UT",
        "QUANTITIES": "'4'",
        "ANG_FORMAT": "DEG",
        "APPARENT": "AIRLESS",
        "CSV_FORMAT": "YES",
    }
    text = requests.get(API, params=params, timeout=60).text
    m = re.search(r"\$\$SOE\s*(.*?)\s*\$\$EOE", text, re.S)
    if not m:
        raise RuntimeError(text[-1500:])
    parts = [p.strip() for p in m.group(1).split(",")]
    numbers = [float(p) for p in parts[1:] if re.fullmatch(r"-?\d+(\.\d+)?", p)]
    return numbers[0], numbers[1]


def main() -> None:
    load_kernels()
    rows = []
    worst = 0.0
    for site in load_resolved_sites():
        for date in DATES:
            et = sp.str2et(date + " UTC")
            for body, command in BODIES.items():
                az, el, _ = body_local(body, et, site)
                haz, hel = horizons_az_el(command, site, date)
                d_az = (az - haz + 180) % 360 - 180
                d_el = el - hel
                worst = max(worst, abs(d_az), abs(d_el))
                rows.append(
                    {
                        "site": site["id"],
                        "utc": date,
                        "body": body.title(),
                        "ours_az": round(az, 4),
                        "ours_el": round(el, 4),
                        "horizons_az": haz,
                        "horizons_el": hel,
                        "diff_az": round(d_az, 4),
                        "diff_el": round(d_el, 4),
                    }
                )
                print(f"{site['id']:18s} {date} {body:5s} ours {az:9.4f} {el:8.4f}  horizons {haz:9.4f} {hel:8.4f}  diff {d_az:+.4f} {d_el:+.4f}")
    out = ROOT / "data" / "validation"
    out.mkdir(parents=True, exist_ok=True)
    (out / "horizons_check.json").write_text(
        json.dumps({"tolerance_deg": 0.1, "worst_abs_diff_deg": round(worst, 4), "pass": worst <= 0.1, "rows": rows}, indent=2)
        + "\n"
    )
    print(f"worst difference {worst:.4f} deg -> {'PASS' if worst <= 0.1 else 'FAIL'}")


if __name__ == "__main__":
    main()
