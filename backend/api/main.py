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

app = FastAPI(
    title="Naturotechnica API",
    description="Agricultural intelligence platform API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
