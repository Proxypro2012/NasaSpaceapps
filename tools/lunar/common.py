"""Shared geometry for the one-time data preparation.

Everything here is the reference implementation that the browser engine
(src/engine) is tested against. Frames and conventions:

* Moon-fixed frame: MOON_ME (mean Earth / polar axis, DE421), the same frame
  the LOLA south-pole elevation maps are published in.
* Map coordinates: south polar stereographic metres on a 1737.4 km sphere,
  x = r sin(lon), y = r cos(lon).
* Local sky: azimuth clockwise from north, elevation above the local
  horizontal plane of a sphere through the site.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import spiceypy as sp

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
PUBLIC_DATA = ROOT / "public" / "data"
FIXTURES = ROOT / "src" / "engine" / "__fixtures__"

MOON_RADIUS_KM = 1737.4
SUN_RADIUS_KM = 695_700.0
EARTH_RADIUS_KM = 6378.137
FRAME = "MOON_ME"
ABCORR = "LT+S"

#: Height of the observing point (solar array / antenna) above the surface.
MAST_HEIGHT_M = 2.0

#: Azimuth step of the horizon masks, degrees.
MASK_STEP_DEG = 0.5
MASK_BINS = int(round(360 / MASK_STEP_DEG))

KERNELS = [
    "naif0012.tls",
    "pck00011.tpc",
    "de440s.bsp",
    "moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf",
]

DEM_80M = RAW / "LDEM_80S_80MPP_ADJ.TIF"


def load_kernels() -> None:
    for name in KERNELS:
        sp.furnsh(str(RAW / name))


def xy_to_latlon(x: float, y: float) -> tuple[float, float]:
    """South polar stereographic metres -> (latitude, east longitude) degrees."""
    r = math.hypot(x, y)
    lat = -90.0 + 2.0 * math.degrees(math.atan(r / (2.0 * MOON_RADIUS_KM * 1000.0)))
    lon = math.degrees(math.atan2(x, y)) % 360.0
    return lat, lon


def xyh_to_me(x, y, h_m):
    """Map metres + height above the reference sphere -> MOON_ME km (vectorised)."""
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    h_m = np.asarray(h_m, dtype=np.float64)
    r = np.hypot(x, y)
    colat = 2.0 * np.arctan(r / (2.0 * MOON_RADIUS_KM * 1000.0))  # angle from the south pole
    lon = np.arctan2(x, y)
    radius = MOON_RADIUS_KM + h_m / 1000.0
    s = np.sin(colat)
    return np.stack(
        [radius * s * np.cos(lon), radius * s * np.sin(lon), -radius * np.cos(colat)],
        axis=-1,
    )


def enu_basis(lat_deg: float, lon_deg: float) -> np.ndarray:
    """Rows are the east, north and up unit vectors of a site, in MOON_ME."""
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    up = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
    east = np.array([-math.sin(lon), math.cos(lon), 0.0])
    north = np.cross(up, east)
    return np.stack([east, north, up])


def az_el(vec_enu):
    """ENU vectors (..., 3) -> (azimuth, elevation) in degrees."""
    v = np.asarray(vec_enu, dtype=np.float64)
    rng = np.linalg.norm(v, axis=-1)
    az = np.degrees(np.arctan2(v[..., 0], v[..., 1])) % 360.0
    el = np.degrees(np.arcsin(v[..., 2] / rng))
    return az, el


def load_sites() -> list[dict]:
    return json.loads((ROOT / "tools" / "sites.json").read_text())["sites"]


def load_resolved_sites() -> list[dict]:
    """Sites after build_horizons.py has snapped them to the terrain."""
    return json.loads((PUBLIC_DATA / "sites.json").read_text())["sites"]


def site_position_km(site: dict) -> np.ndarray:
    """Observer position (surface + mast) in MOON_ME km."""
    return xyh_to_me(site["x_m"], site["y_m"], site["height_m"] + MAST_HEIGHT_M)


def body_moon_centred(body: str, et: float) -> np.ndarray:
    """Apparent position of a body from the Moon's centre, MOON_ME km."""
    pos, _ = sp.spkpos(body, et, FRAME, ABCORR, "MOON")
    return np.asarray(pos)


def body_local(body: str, et: float, site: dict) -> tuple[float, float, float]:
    """Direct SPICE azimuth, elevation (deg) and range (km) of a body at a site."""
    basis = enu_basis(site["lat_deg"], site["lon_deg"])
    v = basis @ (body_moon_centred(body, et) - site_position_km(site))
    az, el = az_el(v)
    return float(az), float(el), float(np.linalg.norm(v))


def mask_at(mask: np.ndarray, az_deg):
    """Linear interpolation of a horizon mask at any azimuth (degrees)."""
    a = (np.asarray(az_deg, dtype=np.float64) % 360.0) / MASK_STEP_DEG
    i0 = np.floor(a).astype(int) % MASK_BINS
    i1 = (i0 + 1) % MASK_BINS
    f = a - np.floor(a)
    return mask[i0] * (1 - f) + mask[i1] * f


#: Vertical chords used to integrate a disc against the horizon.
DISC_CHORDS = 15


def visible_fraction(mask: np.ndarray, az_deg: float, el_deg: float, radius_deg: float) -> float:
    """Fraction of a disc's area above the terrain horizon (0..1).

    The disc is cut into DISC_CHORDS vertical chords of equal width. Each
    chord is clipped by the horizon elevation at its own azimuth.
    """
    if el_deg - radius_deg > 45.0:
        return 1.0
    n = DISC_CHORDS
    k = (np.arange(n) + 0.5) / n * 2.0 - 1.0  # chord centres across the disc, -1..1
    half = radius_deg * np.sqrt(1.0 - k * k)
    cos_el = max(math.cos(math.radians(el_deg)), 1e-6)
    horizon = mask_at(mask, az_deg + k * radius_deg / cos_el)
    seen = np.clip(el_deg + half - horizon, 0.0, 2.0 * half)
    return float(seen.sum() / (2.0 * half.sum()))
