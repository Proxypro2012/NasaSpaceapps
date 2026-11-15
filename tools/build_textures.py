"""Prepare the picture assets: Moon colour, surface normals, and site terrain tiles.

None of these drive a number in the app. The verdicts come only from the
ephemeris table and the horizon masks.

* public/textures/moon_color.jpg     NASA CGI Moon Kit colour map (LROC WAC), 4096x2048
* public/textures/moon_normal.jpg    Moon-fixed surface normals from the Moon Kit elevation map
* public/textures/pole_normal.jpg    Moon-fixed surface normals of the south polar cap, from LOLA 80 m
* public/data/terrain_<id>.bin       int16 heights (m) around each site, for the site close-up
"""

from __future__ import annotations

import json
import urllib.request

import numpy as np
import rasterio
from PIL import Image

from build_horizons import Dem
from lunar.common import MOON_RADIUS_KM, PUBLIC_DATA, RAW, ROOT, load_resolved_sites, xyh_to_me

Image.MAX_IMAGE_PIXELS = None

KIT = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/"
COLOR = "lroc_color_poles_4k.tif"
ELEVATION = "ldem_16.tif"
TEXTURES = ROOT / "public" / "textures"

#: Relief exaggeration of the whole-Moon normals, for looks only.
GLOBAL_RELIEF = 2.0
POLE_SIZE = 2048
TILE_SIZE = 512
#: Each cell of the wide tile is the highest point of an 8x8 block of the 80 m map,
#: so crests that cast long shadows are kept.
FAR_BLOCK = 8


def fetch(name: str):
    path = RAW / name
    if not path.exists():
        print("downloading", name)
        urllib.request.urlretrieve(KIT + name, path)
    return path


def encode_normals(n: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip((n * 0.5 + 0.5) * 255.0 + 0.5, 0, 255).astype(np.uint8), "RGB")


def normals_from_positions(p: np.ndarray, flip: bool) -> np.ndarray:
    """Unit normals of a gridded surface from neighbouring positions."""
    du = np.roll(p, -1, axis=1) - np.roll(p, 1, axis=1)
    dv = np.empty_like(p)
    dv[1:-1] = p[2:] - p[:-2]
    dv[0] = p[1] - p[0]
    dv[-1] = p[-1] - p[-2]
    n = np.cross(du, dv)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    outward = np.sum(n * p, axis=-1, keepdims=True)
    n = np.where(outward < 0, -n, n) if flip else n
    return n


def moon_color() -> None:
    img = Image.open(fetch(COLOR)).convert("RGB").resize((4096, 2048), Image.LANCZOS)
    img.save(TEXTURES / "moon_color.jpg", quality=88, optimize=True)


def moon_normals() -> None:
    with rasterio.open(fetch(ELEVATION)) as src:
        h_km = src.read(1, out_shape=(1440, 2880), resampling=rasterio.enums.Resampling.average).astype(np.float64)
    rows, cols = h_km.shape
    lat = np.radians(90.0 - (np.arange(rows) + 0.5) * 180.0 / rows)[:, None]
    lon = np.radians(-180.0 + (np.arange(cols) + 0.5) * 360.0 / cols)[None, :]
    radius = MOON_RADIUS_KM + GLOBAL_RELIEF * h_km
    p = np.stack(
        [radius * np.cos(lat) * np.cos(lon), radius * np.cos(lat) * np.sin(lon), radius * np.sin(lat) * np.ones_like(lon)],
        axis=-1,
    )
    n = normals_from_positions(p, flip=True)
    encode_normals(n).save(TEXTURES / "moon_normal.jpg", quality=92)


def pole_normals(dem: Dem) -> float:
    factor = dem.rows // POLE_SIZE
    used = POLE_SIZE * factor
    off = (dem.rows - used) // 2
    block = dem.height[off : off + used, off : off + used].astype(np.float64)
    h = np.nanmean(block.reshape(POLE_SIZE, factor, POLE_SIZE, factor), axis=(1, 3))
    h = np.nan_to_num(h, nan=float(np.nanmean(h)))
    cell = dem.res * factor
    half = used * dem.res / 2.0
    xs = -half + (np.arange(POLE_SIZE) + 0.5) * cell
    ys = half - (np.arange(POLE_SIZE) + 0.5) * cell
    gx, gy = np.meshgrid(xs, ys)
    p = xyh_to_me(gx, gy, h)
    n = normals_from_positions(p, flip=True)
    encode_normals(n).save(TEXTURES / "pole_normal.jpg", quality=92)
    return half


def site_tiles(dem: Dem) -> list[dict]:
    tiles = []
    for site in load_resolved_sites():
        col = int((site["x_m"] - dem.x0) / dem.dx)
        row = int((site["y_m"] - dem.y0) / dem.dy)
        r0 = row - TILE_SIZE // 2
        c0 = col - TILE_SIZE // 2
        tile = dem.height[r0 : r0 + TILE_SIZE, c0 : c0 + TILE_SIZE]
        assert tile.shape == (TILE_SIZE, TILE_SIZE) and np.isfinite(tile).all()
        name = f"terrain_{site['id']}.bin"
        (PUBLIC_DATA / name).write_bytes(np.round(tile).astype("<i2").tobytes())
        x_left, y_top = dem.x0 + c0 * dem.dx, dem.y0 + r0 * dem.dy

        half = TILE_SIZE * FAR_BLOCK // 2
        fr0, fc0 = row - half, col - half
        wide = dem.height[fr0 : fr0 + 2 * half, fc0 : fc0 + 2 * half]
        assert wide.shape == (2 * half, 2 * half), "wide tile runs off the map"
        far = np.nanmax(wide.reshape(TILE_SIZE, FAR_BLOCK, TILE_SIZE, FAR_BLOCK), axis=(1, 3))
        far_name = f"terrain_far_{site['id']}.bin"
        (PUBLIC_DATA / far_name).write_bytes(np.round(np.nan_to_num(far, nan=0.0)).astype("<i2").tobytes())
        tiles.append(
            {
                "id": site["id"],
                "file": name,
                "size": TILE_SIZE,
                "cell_m": dem.res,
                "x_left_m": x_left,
                "y_top_m": y_top,
                "site_col": col - c0,
                "site_row": row - r0,
                "min_m": float(tile.min()),
                "max_m": float(tile.max()),
                "far_file": far_name,
                "far_cell_m": dem.res * FAR_BLOCK,
            }
        )
    return tiles


def main() -> None:
    TEXTURES.mkdir(parents=True, exist_ok=True)
    if not (TEXTURES / "moon_normal.jpg").exists():
        moon_color()
        moon_normals()
    dem = Dem()
    half = pole_normals(dem)
    tiles = site_tiles(dem)
    meta = {
        "moon_color": "NASA SVS CGI Moon Kit, lroc_color_poles_4k.tif",
        "moon_normal": f"Derived from NASA SVS CGI Moon Kit ldem_16.tif, relief x{GLOBAL_RELIEF}",
        "pole_normal": f"Derived from {dem.name}, true relief",
        "pole_half_extent_m": half,
        "terrain_tiles": tiles,
    }
    (PUBLIC_DATA / "textures.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps(meta, indent=1)[:900])


if __name__ == "__main__":
    main()
