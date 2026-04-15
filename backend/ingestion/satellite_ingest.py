# Naturotechnica — Satellite NDVI ingestion pipeline
#
# Data sources, tried in order:
#   1. Copernicus Data Space Ecosystem via openEO (real Sentinel-2 NDVI)
#      Requires OPENEO_CLIENT_ID + OPENEO_CLIENT_SECRET env vars.
#   2. Synthetic NDVI proxy derived from weather variables
#      (radiation + temperature). For early-stage development only —
#      swap in real satellite data once Copernicus / EE is available.
import math
import os
import sys
from datetime import date
from pathlib import Path

import pandas as pd

LAT = 41.8781
LON = -87.6298
BUFFER_DEG = 0.01
START_DATE = date(2025, 5, 1)
END_DATE = date(2025, 9, 7)
CLOUD_MAX_PCT = 20

WEATHER_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "weather_growing_season.csv"
OUTPUT_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "ndvi_growing_season.csv"
OUTPUT_COLS = ["date", "ndvi_mean", "ndvi_min", "ndvi_max", "cloud_cover_pct"]


# -------- Primary path: Copernicus Data Space via openEO --------

def fetch_from_copernicus() -> pd.DataFrame | None:
    try:
        import openeo
    except ImportError:
        print("[INFO] openeo package not installed — skipping Copernicus path.", file=sys.stderr)
        return None

    client_id = os.environ.get("OPENEO_CLIENT_ID")
    client_secret = os.environ.get("OPENEO_CLIENT_SECRET")
    if not (client_id and client_secret):
        print(
            "[INFO] OPENEO_CLIENT_ID / OPENEO_CLIENT_SECRET not set — "
            "skipping Copernicus path (would require interactive OIDC auth).",
            file=sys.stderr,
        )
        return None

    try:
        conn = openeo.connect("https://openeo.dataspace.copernicus.eu")
        conn.authenticate_oidc_client_credentials(
            client_id=client_id, client_secret=client_secret, provider_id="CDSE"
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[WARN] Copernicus auth failed: {exc}", file=sys.stderr)
        return None

    start_date = START_DATE
    end_date = END_DATE
    bbox = [LON - BUFFER_DEG, LAT - BUFFER_DEG, LON + BUFFER_DEG, LAT + BUFFER_DEG]

    try:
        cube = conn.load_collection(
            "SENTINEL2_L2A",
            spatial_extent={"west": bbox[0], "south": bbox[1], "east": bbox[2], "north": bbox[3]},
            temporal_extent=[start_date.isoformat(), end_date.isoformat()],
            bands=["B04", "B08", "SCL"],
            max_cloud_cover=CLOUD_MAX_PCT,
        )
        ndvi = (cube.band("B08") - cube.band("B04")) / (cube.band("B08") + cube.band("B04"))
        ts = ndvi.aggregate_spatial(geometries=bbox, reducer="mean").execute()
        rows = []
        for ts_date, values in ts.items():
            v = values[0] if isinstance(values, list) else values
            if v is None:
                continue
            rows.append({"date": pd.to_datetime(ts_date).date(), "ndvi": float(v)})
        if not rows:
            return None
        df = pd.DataFrame(rows).sort_values("date")
        weekly = (
            df.set_index(pd.to_datetime(df["date"]))
            .resample("W")
            .agg(ndvi_mean=("ndvi", "mean"), ndvi_min=("ndvi", "min"), ndvi_max=("ndvi", "max"))
            .dropna()
            .reset_index()
            .rename(columns={"index": "date"})
        )
        weekly["date"] = weekly["date"].dt.date
        weekly["cloud_cover_pct"] = float("nan")
        return weekly[OUTPUT_COLS]
    except Exception as exc:  # noqa: BLE001
        print(f"[WARN] Copernicus NDVI query failed: {exc}", file=sys.stderr)
        return None


# -------- Fallback: synthetic NDVI proxy from weather --------

def clear_sky_radiation(day_of_year: int) -> float:
    # Rough annual sinusoid for Chicago latitude (41.9°N), MJ/m²/day.
    # Peak ~30 at summer solstice (doy ~172), trough ~9 at winter solstice.
    return 19.5 + 10.5 * math.sin(2 * math.pi * (day_of_year - 80) / 365)


def temp_factor(tmin: float, tmax: float) -> float:
    tavg = (tmin + tmax) / 2
    if tavg <= 10:
        return 0.0
    if tavg <= 25:
        return (tavg - 10) / 15
    if tavg <= 32:
        return max(0.2, 1.0 - (tavg - 25) / 20)
    return 0.2


def synthetic_ndvi_from_weather() -> pd.DataFrame:
    required = {
        "date",
        "temperature_2m_max",
        "temperature_2m_min",
        "shortwave_radiation_sum",
        "precipitation_sum",
    }
    weather = pd.read_csv(WEATHER_PATH)
    missing = required - set(weather.columns)
    if missing:
        raise ValueError(f"Weather CSV missing columns: {missing}")

    weather["date"] = pd.to_datetime(weather["date"])
    weather = weather.sort_values("date").reset_index(drop=True)

    weather["doy"] = weather["date"].dt.dayofyear
    weather["clear_sky_mj"] = weather["doy"].apply(clear_sky_radiation)
    weather["rad_factor"] = (weather["shortwave_radiation_sum"] / 30.0).clip(0, 1)
    weather["temp_factor"] = weather.apply(
        lambda r: temp_factor(r["temperature_2m_min"], r["temperature_2m_max"]), axis=1
    )
    # Pseudo-NDVI: base soil signal + vegetation response to light and temperature.
    pseudo = 0.15 + 0.65 * (0.5 * weather["rad_factor"] + 0.5 * weather["temp_factor"])
    weather["pseudo_ndvi"] = pseudo.rolling(7, min_periods=1).mean().clip(0, 0.9)

    # Cloud proxy: shortfall vs day-of-year clear-sky reference.
    weather["cloud_cover_pct"] = (
        100 * (1 - weather["shortwave_radiation_sum"] / weather["clear_sky_mj"])
    ).clip(0, 100)

    weekly = (
        weather.set_index("date")
        .resample("W")
        .agg(
            ndvi_mean=("pseudo_ndvi", "mean"),
            ndvi_min=("pseudo_ndvi", "min"),
            ndvi_max=("pseudo_ndvi", "max"),
            cloud_cover_pct=("cloud_cover_pct", "mean"),
        )
        .dropna(subset=["ndvi_mean"])
        .reset_index()
    )
    weekly["date"] = weekly["date"].dt.date
    weekly[["ndvi_mean", "ndvi_min", "ndvi_max", "cloud_cover_pct"]] = weekly[
        ["ndvi_mean", "ndvi_min", "ndvi_max", "cloud_cover_pct"]
    ].round(3)
    return weekly[OUTPUT_COLS]


# -------- Entry point --------

def main() -> int:
    source = "copernicus"
    df = fetch_from_copernicus()
    if df is None or df.empty:
        print("[INFO] Falling back to synthetic NDVI proxy from weather data.", file=sys.stderr)
        source = "synthetic_from_weather"
        try:
            df = synthetic_ndvi_from_weather()
        except FileNotFoundError:
            print(
                f"[ERROR] Weather CSV not found at {WEATHER_PATH}. "
                "Run backend/ingestion/weather_ingest.py first.",
                file=sys.stderr,
            )
            return 1
        except ValueError as exc:
            print(f"[ERROR] {exc}", file=sys.stderr)
            return 1

    try:
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(OUTPUT_PATH, index=False)
    except OSError as exc:
        print(f"[ERROR] Could not write CSV: {exc}", file=sys.stderr)
        return 1

    print(f"Source: {source}")
    print(f"Weekly NDVI rows: {len(df)}")
    if not df.empty:
        print(f"Date range: {df['date'].min()} to {df['date'].max()}")
        print("First 3 rows:")
        print(df.head(3).to_string(index=False))
    print(f"Saved to: {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
