"""Build primary 40 m and comparison 80 m LOLA horizon masks at fixed sites.

For every 0.5 degrees of azimuth, the mask holds the highest elevation angle at
which terrain blocks the sky, seen from a point MAST_HEIGHT_M above the site.
Angles are computed in true 3D (the Moon's curvature is included), not on the
flat map.

Near the site (out to NEAR_KM) the elevation map is sampled along closely
spaced rays with bilinear interpolation, so that nearby ground, which spans
many azimuths per map cell, leaves no gaps. Beyond that every map cell out to
the edge of the map is used.

Outputs: public/data/horizon_<id>.bin (float32 degrees) and public/data/sites.json.
"""

from __future__ import annotations

import json
import sys

import numpy as np
import rasterio

from lunar.common import (
    DEM_80M,
    MASK_BINS,
    MASK_STEP_DEG,
    MAST_HEIGHT_M,
    PUBLIC_DATA,
    RAW,
    ROOT,
    az_el,
    enu_basis,
    xy_to_latlon,
    xyh_to_me,
)

NEAR_KM = 20.0
FAR_START_KM = 15.0
RAY_STEP_DEG = 0.125
FIRST_SAMPLE_M = 8.0


class Dem:
    def __init__(self, path=DEM_80M):
        with rasterio.open(path) as src:
            self.height = src.read(1).astype(np.float32)
            self.transform = src.transform
            self.nodata = src.nodata
            self.res = src.res[0]
            self.name = path.name
            tags = src.tags(1)
            scale = src.scales[0] if src.scales else 1.0
            offset = src.offsets[0] if src.offsets else 0.0
        if scale != 1.0 or offset != 0.0:
            self.height = self.height * scale + offset
        self.units = tags.get("UNITTYPE", "")
        t = self.transform
        assert t.b == 0 and t.d == 0, "expected a north-up map"
        self.x0, self.dx, self.y0, self.dy = t.c, t.a, t.f, t.e
        self.rows, self.cols = self.height.shape

    def xy_of(self, row, col):
        return self.x0 + (col + 0.5) * self.dx, self.y0 + (row + 0.5) * self.dy

    def sample(self, x, y):
        """Bilinear height (m) at map coordinates; NaN outside the map."""
        c = (np.asarray(x) - self.x0) / self.dx - 0.5
        r = (np.asarray(y) - self.y0) / self.dy - 0.5
        ok = (c >= 0) & (c <= self.cols - 1.001) & (r >= 0) & (r <= self.rows - 1.001)
        c = np.clip(c, 0, self.cols - 1.001)
        r = np.clip(r, 0, self.rows - 1.001)
        c0 = np.floor(c).astype(np.int64)
        r0 = np.floor(r).astype(np.int64)
        fc = c - c0
        fr = r - r0
        h = self.height
        v = (
            h[r0, c0] * (1 - fr) * (1 - fc)
            + h[r0, c0 + 1] * (1 - fr) * fc
            + h[r0 + 1, c0] * fr * (1 - fc)
            + h[r0 + 1, c0 + 1] * fr * fc
        )
        return np.where(ok, v, np.nan)


def snap_to_high_ground(dem: Dem, x: float, y: float, radius_m: float):
    col = int((x - dem.x0) / dem.dx)
    row = int((y - dem.y0) / dem.dy)
    n = int(np.ceil(radius_m / dem.res))
    best = None
    for r in range(row - n, row + n + 1):
        for c in range(col - n, col + n + 1):
            px, py = dem.xy_of(r, c)
            if (px - x) ** 2 + (py - y) ** 2 > radius_m**2:
                continue
            h = float(dem.height[r, c])
            if best is None or h > best[2]:
                best = (px, py, h)
    return best


def accumulate(mask, basis, site_km, x, y, h):
    good = np.isfinite(h)
    p = xyh_to_me(x[good], y[good], h[good])
    v = (p - site_km) @ basis.T
    az, el = az_el(v)
    idx = np.round(az / MASK_STEP_DEG).astype(np.int64) % MASK_BINS
    np.maximum.at(mask, idx, el)


def build_mask(dem: Dem, sx: float, sy: float, sh: float, lat: float, lon: float):
    basis = enu_basis(lat, lon)
    site_km = xyh_to_me(sx, sy, sh + MAST_HEIGHT_M)
    mask = np.full(MASK_BINS, -90.0, dtype=np.float64)

    # Near field: rays in map coordinates (the projection is conformal, so map
    # bearings are local bearings; exact angles are recomputed in 3D anyway).
    dists = [FIRST_SAMPLE_M]
    while dists[-1] < NEAR_KM * 1000.0:
        dists.append(dists[-1] + max(FIRST_SAMPLE_M, 0.004 * dists[-1]))
    d = np.array(dists)
    bearings = np.radians(np.arange(0.0, 360.0, RAY_STEP_DEG))
    north = np.array([sx, sy]) / np.hypot(sx, sy)  # away from the south pole
    east = np.array([north[1], -north[0]])
    dirs = np.sin(bearings)[:, None] * east + np.cos(bearings)[:, None] * north
    rx = sx + dirs[:, 0:1] * d
    ry = sy + dirs[:, 1:2] * d
    accumulate(mask, basis, site_km, rx.ravel(), ry.ravel(), dem.sample(rx, ry).ravel())

    # Far field: every map cell beyond FAR_START_KM, in row chunks.
    cols = np.arange(dem.cols)
    px = dem.x0 + (cols + 0.5) * dem.dx
    for r0 in range(0, dem.rows, 400):
        r1 = min(dem.rows, r0 + 400)
        py = dem.y0 + (np.arange(r0, r1) + 0.5) * dem.dy
        gx, gy = np.meshgrid(px, py)
        h = dem.height[r0:r1].astype(np.float64)
        if dem.nodata is not None:
            h = np.where(h == dem.nodata, np.nan, h)
        far = (gx - sx) ** 2 + (gy - sy) ** 2 >= (FAR_START_KM * 1000.0) ** 2
        accumulate(mask, basis, site_km, gx[far], gy[far], h[far])
    return mask


def main() -> None:
    spec = json.loads((ROOT / "tools" / "sites.json").read_text())
    dem = Dem()
    fine = Dem(RAW / 'LDEM_80S_40MPP_ADJ.TIF')
    print(f"{dem.name}: {dem.cols}x{dem.rows} at {dem.res} m, units '{dem.units}', nodata {dem.nodata}")
    print(f"height range {np.nanmin(dem.height):.0f} .. {np.nanmax(dem.height):.0f} m")
    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
    out_sites = []
    for s in spec["sites"]:
        sx, sy, sh = snap_to_high_ground(dem, s["region_x_m"], s["region_y_m"], spec["snap_radius_m"])
        lat, lon = xy_to_latlon(sx, sy)
        coarse_mask = build_mask(dem, sx, sy, sh, lat, lon)
        coarse_height = sh
        sh = float(fine.sample(np.array([sx]), np.array([sy]))[0])
        mask = build_mask(fine, sx, sy, sh, lat, lon)
        assert mask.min() > -90.0, "empty azimuth bin"
        fname = f"horizon_{s['id']}.bin"
        (PUBLIC_DATA / fname).write_bytes(mask.astype("<f4").tobytes())
        coarse_name = f"horizon_80m_{s['id']}.bin"
        (PUBLIC_DATA / coarse_name).write_bytes(coarse_mask.astype('<f4').tobytes())
        print(
            f"{s['name']}: lat {lat:.4f} lonE {lon:.4f} h {sh:.0f} m | horizon "
            f"min {mask.min():.2f} mean {mask.mean():.2f} max {mask.max():.2f} deg"
        )
        out_sites.append(
            {
                "id": s["id"],
                "name": s["name"],
                "blurb": s["blurb"],
                "lat_deg": round(lat, 5),
                "lon_deg": round(lon, 5),
                "height_m": round(sh, 1),
                "x_m": sx,
                "y_m": sy,
                "horizon_file": fname,
                "comparison_horizon_file": coarse_name,
                "comparison_height_m": round(coarse_height, 1),
                "artemis_list": s["artemis_list"],
                "source": (
                    f"Highest 80 m terrain cell within {spec['snap_radius_m']} m of the centre of NASA PGDA "
                    f"LOLA 5 m/pix site map {s['pgda_site']} (Barker et al. 2021)"
                ),
            }
        )
    meta = {
        "terrain_file": fine.name,
        "terrain_resolution_m": fine.res,
        "comparison_terrain_file": dem.name,
        "comparison_resolution_m": dem.res,
        "mast_height_m": MAST_HEIGHT_M,
        "mask_step_deg": MASK_STEP_DEG,
        "mask_bins": MASK_BINS,
        "reference_radius_km": 1737.4,
        "frame": "MOON_ME",
        "sites": out_sites,
    }
    (PUBLIC_DATA / "sites.json").write_text(json.dumps(meta, indent=2) + "\n")


if __name__ == "__main__":
    sys.exit(main())
