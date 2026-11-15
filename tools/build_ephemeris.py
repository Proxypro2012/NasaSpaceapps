"""Sample the Sun and Earth as seen from the Moon's centre into a compact table.

Output: public/data/ephemeris.bin (little-endian float32, 6 values per hourly
sample: Sun xyz km, Earth xyz km, in MOON_ME with light-time and stellar
aberration) plus ephemeris.json describing it. The browser interpolates this
table; the interpolation error against direct SPICE is measured here and
written into the metadata.
"""

from __future__ import annotations

import json

import numpy as np
import spiceypy as sp

from lunar.common import PUBLIC_DATA, body_moon_centred, load_kernels

START_UTC = "2026-01-01T00:00:00"
END_UTC = "2031-01-01T00:00:00"
STEP_S = 3600.0


def catmull_rom(table: np.ndarray, u: float) -> np.ndarray:
    """Same interpolation as src/engine/ephemeris.ts (u in sample units)."""
    i = int(np.floor(u))
    i = min(max(i, 1), len(table) - 3)
    t = u - i
    p0, p1, p2, p3 = table[i - 1], table[i], table[i + 1], table[i + 2]
    return 0.5 * (
        2 * p1
        + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
    )


def main() -> None:
    load_kernels()
    et0 = sp.str2et(START_UTC)
    et1 = sp.str2et(END_UTC)
    n = int(round((et1 - et0) / STEP_S)) + 1
    table = np.empty((n, 6), dtype=np.float64)
    for i in range(n):
        et = et0 + i * STEP_S
        table[i, 0:3] = body_moon_centred("SUN", et)
        table[i, 3:6] = body_moon_centred("EARTH", et)
    table32 = table.astype("<f4")

    # Measure what the browser will actually get: float32 table + cubic interpolation.
    rng = np.random.default_rng(7)
    worst = {"sun_deg": 0.0, "earth_deg": 0.0}
    t64 = table32.astype(np.float64)
    for u in rng.uniform(1, n - 3, size=4000):
        et = et0 + u * STEP_S
        got = catmull_rom(t64, u)
        for key, sl, body in (("sun_deg", slice(0, 3), "SUN"), ("earth_deg", slice(3, 6), "EARTH")):
            ref = body_moon_centred(body, et)
            cosang = np.dot(got[sl], ref) / (np.linalg.norm(got[sl]) * np.linalg.norm(ref))
            worst[key] = max(worst[key], float(np.degrees(np.arccos(min(1.0, cosang)))))

    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
    (PUBLIC_DATA / "ephemeris.bin").write_bytes(table32.tobytes())
    meta = {
        "start_utc": START_UTC + "Z",
        "end_utc": END_UTC + "Z",
        "step_seconds": STEP_S,
        "samples": n,
        "values_per_sample": 6,
        "layout": ["sun_x_km", "sun_y_km", "sun_z_km", "earth_x_km", "earth_y_km", "earth_z_km"],
        "frame": "MOON_ME (mean Earth / polar axis, DE421 alignment)",
        "observer": "Moon centre",
        "aberration": "LT+S",
        "kernels": ["de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf", "naif0012.tls"],
        "interpolation": "Catmull-Rom cubic on hourly samples",
        "max_interpolation_error_deg": worst,
    }
    (PUBLIC_DATA / "ephemeris.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"{n} samples, {table32.nbytes / 1e6:.2f} MB, worst interpolation error {worst}")


if __name__ == "__main__":
    main()
