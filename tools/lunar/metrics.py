"""Reference window metrics and verdicts. Mirrors src/engine/metrics.ts."""

from __future__ import annotations

import math

import numpy as np
import spiceypy as sp

from .common import (
    DISC_CHORDS,
    EARTH_RADIUS_KM,
    SUN_RADIUS_KM,
    az_el,
    body_moon_centred,
    enu_basis,
    mask_at,
    site_position_km,
)

STEP_MINUTES = 30
VISIBLE_THRESHOLD = 0.5
DARK_EPSILON = 1e-6

# Verdict thresholds. These are this project's own definitions, not NASA
# standards, and they were fixed before any comparison with published values.
GOOD_MIN_SUNLIGHT_PCT = 70.0
GOOD_MAX_DARK_HOURS = 48.0
POOR_MAX_SUNLIGHT_PCT = 40.0
POOR_MIN_DARK_HOURS = 120.0


def series(site: dict, mask: np.ndarray, ets: np.ndarray, point_sun: bool = False) -> dict:
    """Per-step Sun and Earth geometry and visible fractions at a site."""
    basis = enu_basis(site["lat_deg"], site["lon_deg"])
    pos = site_position_km(site)
    out = {}
    for key, body, radius_km in (("sun", "SUN", SUN_RADIUS_KM), ("earth", "EARTH", EARTH_RADIUS_KM)):
        vecs = np.array([body_moon_centred(body, et) for et in ets]) - pos
        local = vecs @ basis.T
        az, el = az_el(local)
        rng = np.linalg.norm(local, axis=1)
        rad = np.degrees(np.arcsin(radius_km / rng))
        if key == "sun" and point_sun:
            frac = (el > mask_at(mask, az)).astype(np.float64)
        else:
            frac = visible_fraction_array(mask, az, el, rad)
        out[key] = {"az": az, "el": el, "range_km": rng, "radius_deg": rad, "frac": frac}
    sun, earth = out['sun'], out['earth']
    sa, se, ea, ee = [np.radians(a) for a in (sun['az'], sun['el'], earth['az'], earth['el'])]
    delta = ea - sa
    dot = np.sin(se) * np.sin(ee) + np.cos(se) * np.cos(ee) * np.cos(delta)
    sep = np.degrees(np.arccos(np.clip(dot, -1, 1)))
    if point_sun:
        sun['frac'] = sun['frac'] * (sep >= earth['radius_deg'])
    else:
        affected = np.nonzero(sep < sun['radius_deg'] + earth['radius_deg'])[0]
        k = (np.arange(128) + 0.5) / 128 * 2 - 1
        for i in affected:
            sr, er = sun['radius_deg'][i], earth['radius_deg'][i]
            if sep[i] + sr <= er:
                sun['frac'][i] = 0.0
                continue
            scale = sep[i] / max(np.sin(np.radians(sep[i])), 1e-12)
            cx = np.cos(ee[i]) * np.sin(delta[i]) * scale
            cy = (np.cos(se[i]) * np.sin(ee[i]) - np.sin(se[i]) * np.cos(ee[i]) * np.cos(delta[i])) * scale
            x = k * sr
            half = np.sqrt(np.maximum(0, sr * sr - x * x))
            bottom = np.maximum(-half, mask_at(mask, sun['az'][i] + x / max(np.cos(se[i]), 1e-6)) - sun['el'][i])
            er2 = er * er - (x - cx) ** 2
            eh = np.sqrt(np.maximum(0, er2))
            blocked = np.where(er2 > 0, np.maximum(0, np.minimum(half, cy + eh) - np.maximum(bottom, cy - eh)), 0)
            seen = np.maximum(0, np.maximum(0, half - bottom) - blocked)
            sun['frac'][i] = min(sun['frac'][i], max(0, float(seen.sum() / (2 * half.sum()))))
    return out


def visible_fraction_array(mask, az, el, rad):
    k = (np.arange(DISC_CHORDS) + 0.5) / DISC_CHORDS * 2.0 - 1.0
    half = rad[:, None] * np.sqrt(1.0 - k * k)[None, :]
    cos_el = np.maximum(np.cos(np.radians(el)), 1e-6)
    horizon = mask_at(mask, az[:, None] + k[None, :] * (rad / cos_el)[:, None])
    seen = np.clip(el[:, None] + half - horizon, 0.0, 2.0 * half)
    return np.clip(seen.sum(axis=1) / (2.0 * half.sum(axis=1)), 0, 1)


def longest_run_hours(flags: np.ndarray, step_minutes: float = STEP_MINUTES) -> float:
    best = run = 0
    for f in flags:
        run = run + 1 if f else 0
        best = max(best, run)
    return best * step_minutes / 60.0


def verdict(sunlight_pct: float, dark_hours: float) -> str:
    if sunlight_pct < POOR_MAX_SUNLIGHT_PCT or dark_hours > POOR_MIN_DARK_HOURS:
        return "Poor"
    if sunlight_pct >= GOOD_MIN_SUNLIGHT_PCT and dark_hours < GOOD_MAX_DARK_HOURS:
        return "Good"
    return "Risky"


def summarise(sun_frac: np.ndarray, earth_frac: np.ndarray, step_minutes: float = STEP_MINUTES) -> dict:
    sun_up = sun_frac >= VISIBLE_THRESHOLD
    earth_up = earth_frac >= VISIBLE_THRESHOLD
    sunlight = 100.0 * sun_up.mean()
    dark = longest_run_hours(sun_frac <= DARK_EPSILON, step_minutes)
    return {
        "sunlight_pct": float(sunlight),
        "longest_dark_hours": float(dark),
        "earth_link_pct": float(100.0 * earth_up.mean()),
        "combined_pct": float(100.0 * (sun_up & earth_up).mean()),
        "verdict": verdict(sunlight, dark),
    }


def window_ets(start_utc: str, days: float, step_minutes: float = STEP_MINUTES) -> np.ndarray:
    et0 = sp.str2et(start_utc)
    n = int(round(days * 24 * 60 / step_minutes))
    return et0 + np.arange(n) * step_minutes * 60.0


def window_metrics(site: dict, mask: np.ndarray, start_utc: str, days: float) -> dict:
    s = series(site, mask, window_ets(start_utc, days))
    return summarise(s["sun"]["frac"], s["earth"]["frac"])


def load_mask(path) -> np.ndarray:
    return np.fromfile(path, dtype="<f4").astype(np.float64)


def utc_iso(et: float) -> str:
    return sp.et2utc(et, "ISOC", 3) + "Z"


__all__ = [n for n in dir() if not n.startswith("_")] + ["math"]
