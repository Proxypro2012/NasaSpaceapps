"""Write reference values that the browser engine's unit tests must reproduce.

Directions come straight from SPICE (not from the interpolated table), so the
tests cover the table, the interpolation and the TypeScript geometry together.
"""

from __future__ import annotations

import json

import numpy as np
import spiceypy as sp

from lunar.common import FIXTURES, PUBLIC_DATA, load_kernels, load_resolved_sites
from lunar.metrics import load_mask, series, summarise, utc_iso, window_ets, window_summary

WINDOWS = [("2026-11-14T00:00:00", 30), ("2027-06-01T00:00:00", 30), ("2029-01-10T00:00:00", 14),
           ("2026-03-03T00:00:00", 7), ("2027-01-01T00:00:00", 7), ("2027-01-10T00:00:00", 7),
           ("2027-01-01T00:00:00", 29.5)]


def main() -> None:
    load_kernels()
    rng = np.random.default_rng(42)
    et_lo = sp.str2et("2026-01-02T00:00:00")
    et_hi = sp.str2et("2030-12-30T00:00:00")
    out = {"samples": [], "windows": []}
    for site in load_resolved_sites():
        mask = load_mask(PUBLIC_DATA / site["horizon_file"])
        ets = np.sort(rng.uniform(et_lo, et_hi, size=60))
        s = series(site, mask, ets)
        for i, et in enumerate(ets):
            out["samples"].append(
                {
                    "site": site["id"],
                    "utc": utc_iso(et),
                    **{
                        f"{b}_{k}": float(s[b][k][i])
                        for b in ("sun", "earth")
                        for k in ("az", "el", "range_km", "radius_deg", "frac")
                    },
                }
            )
        for start, days in WINDOWS:
            ets = window_ets(start, days)
            w = series(site, mask, ets)
            sun, earth = w["sun"]["frac"], w["earth"]["frac"]
            out["windows"].append({"site": site["id"], "start_utc": start + "Z", "days": days,
                                   **summarise(sun, earth), **window_summary(sun, earth, ets[0])})
    FIXTURES.mkdir(parents=True, exist_ok=True)
    (FIXTURES / "golden.json").write_text(json.dumps(out, indent=1) + "\n")
    for w in out["windows"]:
        print(w)


if __name__ == "__main__":
    main()
