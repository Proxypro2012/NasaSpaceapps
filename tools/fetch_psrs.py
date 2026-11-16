"""Write the south-pole permanently shadowed regions (PSRs) the app measures distance to.

Source: the LROC PSR Atlas list (Arizona State University), which catalogues PSRs
of 10 km^2 or more within nine degrees of each pole. Its outlines come from the
LOLA illumination modelling of Mazarico et al. (2011), Icarus 211, 1066-1081.

Usage, from tools/:
    python fetch_psrs.py                 # download the list and write public/data/psrs.json
    python fetch_psrs.py saved-list.html # parse a copy saved earlier

Standard library only, so it runs without the SPICE environment.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

URL = "https://lroc.im-ldi.com/atlases/psr/list"
OUT = Path(__file__).resolve().parents[1] / "public" / "data" / "psrs.json"
COLUMNS = ["id", "lat", "lon", "area", "perimeter", "notes", "features", "coverage", "quality"]


class TableRows(HTMLParser):
    """Collects the text of every cell in every <tr> of the page."""

    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self.row: list[str] | None = None
        self.cell: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag == "td" and self.row is not None:
            self.cell = []

    def handle_endtag(self, tag):
        if tag == "td" and self.row is not None and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)


def parse(html: str) -> list[dict]:
    reader = TableRows()
    reader.feed(html)
    psrs = []
    for cells in reader.rows:
        if len(cells) != len(COLUMNS) or not cells[0].startswith("SP_"):
            continue
        row = dict(zip(COLUMNS, cells))
        lat, lon, area = float(row["lat"]), float(row["lon"]), float(row["area"])
        if not (-90 <= lat < -80 and 0 <= lon < 360 and area > 0):
            raise ValueError(f"Unexpected values in row {row['id']}: {lat}, {lon}, {area}")
        # Kept exactly as published. The atlas runs several names together with no
        # separator ("de Gerlache Crater Shackleton Crater"), so splitting would be a guess.
        psrs.append({"id": row["id"], "lat_deg": lat, "lon_deg": lon, "area_km2": area, "features": row["features"]})
    if len(psrs) < 100:
        raise ValueError(f"Only {len(psrs)} south-pole rows found; the page layout may have changed.")
    return sorted(psrs, key=lambda p: p["id"])


def main() -> None:
    if len(sys.argv) > 1:
        html = Path(sys.argv[1]).read_text(encoding="utf-8")
    else:
        request = urllib.request.Request(URL, headers={"User-Agent": "southlight-data-prep"})
        with urllib.request.urlopen(request, timeout=60) as response:
            html = response.read().decode("utf-8")
    psrs = parse(html)
    OUT.write_text(
        json.dumps(
            {
                "source": "LROC PSR Atlas, Arizona State University",
                "url": URL,
                "retrieved_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "basis": "PSR outlines from LOLA illumination modelling, Mazarico et al. (2011), Icarus 211, 1066-1081",
                "min_area_km2": 10,
                "coordinates": "Centroid latitude (planetocentric) and east longitude of each PSR",
                "psrs": psrs,
            },
            indent=1,
        )
        + "\n"
    )
    print(f"Wrote {len(psrs)} south-pole PSRs to {OUT}")


if __name__ == "__main__":
    main()
