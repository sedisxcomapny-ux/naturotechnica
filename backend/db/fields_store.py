# Naturotechnica — SQLite-backed fields store (Phase 1)
#
# This is a deliberately minimal SQLite store for the onboarding flow.
# The eventual production target is Postgres + PostGIS per backend/db/schema.sql.
import json
import sqlite3
from pathlib import Path
from typing import Any, Optional

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "naturotechnica.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS fields (
    field_id                   TEXT PRIMARY KEY,
    farm_name                  TEXT,
    field_name                 TEXT,
    crop_type                  TEXT,
    planted_date               TEXT,
    harvest_date               TEXT,
    irrigation_type            TEXT,
    soil_type                  TEXT,
    boundary_geojson           TEXT,
    centroid_lat               REAL,
    centroid_lon               REAL,
    weather_csv_path           TEXT,
    irrigation_csv_path        TEXT,
    recommendations_json_path  TEXT,
    created_at                 TEXT
);
"""

_COLUMNS = [
    "field_id",
    "farm_name",
    "field_name",
    "crop_type",
    "planted_date",
    "harvest_date",
    "irrigation_type",
    "soil_type",
    "boundary_geojson",
    "centroid_lat",
    "centroid_lon",
    "weather_csv_path",
    "irrigation_csv_path",
    "recommendations_json_path",
    "created_at",
]


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(_SCHEMA)


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    raw = d.get("boundary_geojson")
    if raw:
        try:
            d["boundary_geojson"] = json.loads(raw)
        except json.JSONDecodeError:
            pass  # leave as string if malformed — surfaces in caller
    return d


def save_field(field: dict[str, Any]) -> dict:
    """Insert a field record. `field['boundary_geojson']` may be dict or str."""
    boundary = field.get("boundary_geojson")
    if isinstance(boundary, (dict, list)):
        boundary = json.dumps(boundary)

    row = {col: field.get(col) for col in _COLUMNS}
    row["boundary_geojson"] = boundary

    placeholders = ", ".join(f":{c}" for c in _COLUMNS)
    cols = ", ".join(_COLUMNS)

    with _connect() as conn:
        conn.execute(f"INSERT INTO fields ({cols}) VALUES ({placeholders})", row)
        conn.commit()

    return get_field(field["field_id"])  # type: ignore[return-value]


def get_all_fields() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM fields ORDER BY created_at").fetchall()
    return [_row_to_dict(r) for r in rows]


def get_field(field_id: str) -> Optional[dict]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM fields WHERE field_id = ?", (field_id,)
        ).fetchone()
    return _row_to_dict(row) if row else None


def update_field_artifacts(field_id: str, artifact_paths: dict[str, str]) -> None:
    """Update artifact-path columns. Accepted keys:
    weather_csv_path, irrigation_csv_path, recommendations_json_path."""
    allowed = {"weather_csv_path", "irrigation_csv_path", "recommendations_json_path"}
    updates = {k: v for k, v in artifact_paths.items() if k in allowed}
    if not updates:
        return
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    params = {**updates, "field_id": field_id}
    with _connect() as conn:
        conn.execute(
            f"UPDATE fields SET {set_clause} WHERE field_id = :field_id", params
        )
        conn.commit()
