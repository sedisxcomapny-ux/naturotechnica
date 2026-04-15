# Naturotechnica — Per-field pipeline orchestrator
import json
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, HTTPException

from backend.db import fields_store
from backend.ingestion.weather_ingest import fetch_weather
from backend.models.irrigation_score import compute_scores
from backend.models.recommendation_generator import build_cards

DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "raw"

router = APIRouter(prefix="/api/fields", tags=["pipeline"])


def _centroid(boundary_geojson: dict) -> tuple[float, float]:
    """Extract centroid (lon, lat) from a GeoJSON Feature/FeatureCollection/Geometry Polygon."""
    geom = boundary_geojson
    if geom.get("type") == "FeatureCollection":
        features = geom.get("features") or []
        if not features:
            raise ValueError("FeatureCollection has no features")
        geom = features[0].get("geometry", {})
    elif geom.get("type") == "Feature":
        geom = geom.get("geometry", {})

    if geom.get("type") != "Polygon":
        raise ValueError(f"Expected Polygon geometry, got {geom.get('type')!r}")

    coords = geom.get("coordinates") or []
    if not coords or not coords[0]:
        raise ValueError("Polygon has no coordinates")

    ring = coords[0]
    # Drop the closing duplicate point if present
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring = ring[:-1]
    if not ring:
        raise ValueError("Polygon ring is empty")

    lon = sum(p[0] for p in ring) / len(ring)
    lat = sum(p[1] for p in ring) / len(ring)
    return lon, lat


def _parse_iso_date(s: str, field: str) -> date:
    try:
        return datetime.fromisoformat(s).date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {field}: {exc}")


@router.post("/{field_id}/run-pipeline")
def run_pipeline(field_id: str):
    field = fields_store.get_field(field_id)
    if field is None:
        raise HTTPException(status_code=404, detail=f"Field {field_id} not found")

    # Prefer stored centroid; fall back to computing from GeoJSON.
    if field.get("centroid_lat") is not None and field.get("centroid_lon") is not None:
        lat = float(field["centroid_lat"])
        lon = float(field["centroid_lon"])
    else:
        try:
            lon, lat = _centroid(field["boundary_geojson"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Bad boundary_geojson: {exc}")

    planted = _parse_iso_date(field["planted_date"], "planted_date")
    harvest = _parse_iso_date(field["harvest_date"], "harvest_date")

    # Open-Meteo archive API only has data through yesterday.
    yesterday = date.today() - timedelta(days=1)
    start = planted
    end = min(harvest, yesterday)
    if end < start:
        raise HTTPException(
            status_code=400,
            detail=(
                f"No archive weather available for this field yet — "
                f"planted_date {start} is after most recent archive date {yesterday}."
            ),
        )

    try:
        weather_df = fetch_weather(
            lat=lat, lon=lon, start_date=start, end_date=end, timezone="auto"
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Weather fetch failed: {exc}")

    if weather_df.empty:
        raise HTTPException(status_code=502, detail="Weather API returned no rows")

    # Persist per-field weather CSV (keeps the pilot files untouched).
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    weather_path = DATA_DIR / f"weather_{field_id}.csv"
    weather_df.to_csv(weather_path, index=False)

    try:
        scores = compute_scores(weather_df, planted_date=planted)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Scoring failed: {exc}")

    scores_path = DATA_DIR / f"irrigation_scores_{field_id}.csv"
    scores.to_csv(scores_path, index=False)

    try:
        cards = build_cards(scores, field_name=field["field_name"])
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Recommendation build failed: {exc}")

    recs_path = DATA_DIR / f"recommendations_{field_id}.json"
    with recs_path.open("w") as f:
        json.dump(cards, f, indent=2)

    # Persist artifact paths back onto the field record.
    project_root = DATA_DIR.parents[1]
    fields_store.update_field_artifacts(
        field_id,
        {
            "weather_csv_path": str(weather_path.relative_to(project_root)),
            "irrigation_csv_path": str(scores_path.relative_to(project_root)),
            "recommendations_json_path": str(recs_path.relative_to(project_root)),
        },
    )

    return {
        "status": "complete",
        "field_id": field_id,
        "recommendations_count": len(cards),
        "weather_days": len(weather_df),
        "date_range": {"start": start.isoformat(), "end": end.isoformat()},
    }
