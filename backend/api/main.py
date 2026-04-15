# Naturotechnica — FastAPI entry point
import json
from datetime import date
from pathlib import Path
from typing import Optional

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes.fields import router as fields_router
from backend.api.routes.pipeline import router as pipeline_router
from backend.db import fields_store

load_dotenv()
fields_store.init_db()

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"
RECOMMENDATIONS_PATH = DATA_DIR / "recommendations_chicago.json"
IRRIGATION_SCORES_PATH = DATA_DIR / "irrigation_scores_chicago.csv"
NDVI_PATH = DATA_DIR / "ndvi_growing_season.csv"
DISEASE_RISK_PATH = DATA_DIR / "disease_risk_chicago.csv"
WEATHER_PATH = DATA_DIR / "weather_growing_season.csv"
SETTINGS_PATH = Path(__file__).resolve().parents[2] / "data" / "settings.json"

app = FastAPI(
    title="Naturotechnica API",
    description="Agricultural intelligence platform API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://naturotechnica.com",
        "https://www.naturotechnica.com",
        "https://*.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(fields_router)
app.include_router(pipeline_router)


def envelope(data=None, error: Optional[str] = None, status: str = "ok") -> dict:
    return {"data": data, "error": error, "status": status}


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "Naturotechnica", "version": "0.1.0"}


@app.get("/api/recommendations")
def recommendations(urgency: Optional[str] = Query(None, description="Filter by urgency: high|medium|low")):
    try:
        with RECOMMENDATIONS_PATH.open() as f:
            cards = json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Recommendations file not found. Run recommendation_generator.py.")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Recommendations JSON malformed: {exc}")

    if urgency is not None:
        urgency = urgency.lower()
        if urgency not in {"high", "medium", "low"}:
            raise HTTPException(status_code=400, detail="urgency must be one of: high, medium, low")
        cards = [c for c in cards if c.get("urgency") == urgency]

    return envelope(data=cards)


@app.get("/api/irrigation-summary")
def irrigation_summary():
    try:
        scores = pd.read_csv(IRRIGATION_SCORES_PATH)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Irrigation scores not found. Run irrigation_score.py.")
    except pd.errors.ParserError as exc:
        raise HTTPException(status_code=500, detail=f"Irrigation CSV malformed: {exc}")

    scores["date"] = pd.to_datetime(scores["date"]).dt.date
    total_days = int(len(scores))
    irrigate_days = int(scores["irrigate_now"].astype(bool).sum())
    peak_idx = scores["depletion_score"].idxmax()
    peak_score = float(scores.loc[peak_idx, "depletion_score"])
    peak_date = scores.loc[peak_idx, "date"].isoformat()

    season_start = scores["date"].min()
    season_end = scores["date"].max()
    today = date.today()
    if today < season_start:
        status = "pre_planting"
    elif today > season_end:
        status = "post_harvest"
    else:
        status = "in_season"

    return envelope(
        data={
            "total_days": total_days,
            "irrigate_days": irrigate_days,
            "peak_depletion_score": peak_score,
            "peak_depletion_date": peak_date,
            "current_season_status": status,
            "season_start": season_start.isoformat(),
            "season_end": season_end.isoformat(),
        }
    )


@app.get("/api/ndvi")
def ndvi():
    try:
        df = pd.read_csv(NDVI_PATH)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="NDVI data not found. Run satellite_ingest.py.")
    except pd.errors.ParserError as exc:
        raise HTTPException(status_code=500, detail=f"NDVI CSV malformed: {exc}")

    records = df[["date", "ndvi_mean", "ndvi_min", "ndvi_max"]].to_dict(orient="records")
    return envelope(data=records)


@app.get("/api/disease-risk")
def disease_risk(
    risk_type: Optional[str] = Query(None, description="Filter by risk_type: fungal|heat_stress"),
    level: Optional[str] = Query(None, description="Filter by risk_level: high|medium|low"),
):
    try:
        df = pd.read_csv(DISEASE_RISK_PATH)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Disease risk data not found. Run disease_risk.py.")
    except pd.errors.ParserError as exc:
        raise HTTPException(status_code=500, detail=f"Disease risk CSV malformed: {exc}")

    if risk_type is not None:
        rt = risk_type.lower()
        if rt not in {"fungal", "heat_stress"}:
            raise HTTPException(status_code=400, detail="risk_type must be one of: fungal, heat_stress")
        df = df[df["risk_type"] == rt]

    if level is not None:
        lvl = level.lower()
        if lvl not in {"high", "medium", "low"}:
            raise HTTPException(status_code=400, detail="level must be one of: high, medium, low")
        df = df[df["risk_level"] == lvl]

    return envelope(data=df.to_dict(orient="records"))


_WEATHER_COLUMN_MAP = {
    "temperature_2m_max": "temp_max_c",
    "temperature_2m_min": "temp_min_c",
    "precipitation_sum": "precipitation_mm",
    "relative_humidity_2m_max": "humidity_pct",
    "et0_fao_evapotranspiration": "et0_mm",
    "shortwave_radiation_sum": "solar_rad_mjm2",
}


@app.get("/api/weather-summary")
def weather_summary():
    try:
        df = pd.read_csv(WEATHER_PATH)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Weather data not found. Run weather_ingest.py.")
    except pd.errors.ParserError as exc:
        raise HTTPException(status_code=500, detail=f"Weather CSV malformed: {exc}")

    df = df.rename(columns=_WEATHER_COLUMN_MAP)
    df["date"] = pd.to_datetime(df["date"]).dt.date.astype(str)

    days = df[
        [
            "date",
            "temp_max_c",
            "temp_min_c",
            "precipitation_mm",
            "humidity_pct",
            "et0_mm",
            "solar_rad_mjm2",
        ]
    ].to_dict(orient="records")

    max_idx = df["temp_max_c"].idxmax()
    summary = {
        "total_rain_mm": round(float(df["precipitation_mm"].sum()), 2),
        "avg_temp_c": round(float(((df["temp_max_c"] + df["temp_min_c"]) / 2).mean()), 2),
        "max_temp_c": round(float(df.loc[max_idx, "temp_max_c"]), 2),
        "max_temp_date": str(df.loc[max_idx, "date"]),
        "heat_stress_days": int((df["temp_max_c"] > 35).sum()),
        "drought_days": int((df["precipitation_mm"] < 1).sum()),
    }

    return envelope(data={"days": days, "summary": summary})


_DEFAULT_SETTINGS = {
    "farm_profile": {
        "farm_name": "Chicago Pilot Field",
        "location": "Chicago, IL",
        "primary_crop": "Corn",
        "season": "2025 Growing Season",
    },
    "notifications": {
        "email_digest": True,
        "sms_alerts": False,
        "urgency_threshold": "Medium and above",
    },
}


def _load_settings() -> dict:
    if not SETTINGS_PATH.exists():
        return _DEFAULT_SETTINGS
    try:
        with SETTINGS_PATH.open() as f:
            return json.load(f)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"settings.json corrupt: {exc}")


@app.get("/api/settings")
def get_settings():
    return envelope(data=_load_settings())


@app.post("/api/settings")
def save_settings(payload: dict):
    # Merge-on-top of existing so partial updates work.
    current = _load_settings()
    for section in ("farm_profile", "notifications"):
        if section in payload and isinstance(payload[section], dict):
            current.setdefault(section, {}).update(payload[section])

    try:
        SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        with SETTINGS_PATH.open("w") as f:
            json.dump(current, f, indent=2)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not write settings: {exc}")

    return envelope(data=current)
