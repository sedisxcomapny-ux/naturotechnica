# Naturotechnica — Field CRUD (SQLite-backed via backend/db/fields_store)
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.db import fields_store

router = APIRouter(prefix="/api/fields", tags=["fields"])


class FieldCreate(BaseModel):
    farm_name: str
    field_name: str
    crop_type: str
    planted_date: str
    harvest_date: str
    irrigation_type: str
    boundary_geojson: dict
    farmer_name: Optional[str] = None
    location: Optional[str] = None
    soil_type: Optional[str] = None


def _centroid_from_geojson(geojson: dict) -> tuple[float, float]:
    """Return (lat, lon) centroid for a Polygon Feature/Geometry."""
    geom = geojson
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
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring = ring[:-1]
    if not ring:
        raise ValueError("Polygon ring is empty")

    lon = sum(p[0] for p in ring) / len(ring)
    lat = sum(p[1] for p in ring) / len(ring)
    return lat, lon


@router.post("")
def create_field(payload: FieldCreate):
    try:
        lat, lon = _centroid_from_geojson(payload.boundary_geojson)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Bad boundary_geojson: {exc}")

    record = {
        "field_id": str(uuid.uuid4()),
        "farm_name": payload.farm_name,
        "field_name": payload.field_name,
        "crop_type": payload.crop_type,
        "planted_date": payload.planted_date,
        "harvest_date": payload.harvest_date,
        "irrigation_type": payload.irrigation_type,
        "soil_type": payload.soil_type,
        "boundary_geojson": payload.boundary_geojson,
        "centroid_lat": lat,
        "centroid_lon": lon,
        "weather_csv_path": None,
        "irrigation_csv_path": None,
        "recommendations_json_path": None,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    saved = fields_store.save_field(record)
    return {"data": saved, "error": None, "status": "ok"}


@router.get("")
def list_fields():
    return {"data": fields_store.get_all_fields(), "error": None, "status": "ok"}


# Re-exported for pipeline router convenience — keeps call-sites stable.
def get_field(field_id: str):
    return fields_store.get_field(field_id)
