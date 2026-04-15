# Naturotechnica — Weather ingestion pipeline
import sys
from datetime import date
from pathlib import Path

import pandas as pd
import requests

LAT = 41.8781
LON = -87.6298
START_DATE = date(2025, 5, 1)
END_DATE = date(2025, 9, 7)
DAILY_VARS = [
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "relative_humidity_2m_max",
    "et0_fao_evapotranspiration",
    "shortwave_radiation_sum",
]
API_URL = "https://archive-api.open-meteo.com/v1/archive"
OUTPUT_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "weather_growing_season.csv"


def fetch_weather(
    lat: float = LAT,
    lon: float = LON,
    start_date: date = START_DATE,
    end_date: date = END_DATE,
    timezone: str = "America/Chicago",
) -> pd.DataFrame:
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily": ",".join(DAILY_VARS),
        "timezone": timezone,
    }
    response = requests.get(API_URL, params=params, timeout=30)
    response.raise_for_status()
    payload = response.json()
    daily = payload.get("daily")
    if not daily or "time" not in daily:
        raise ValueError(f"Unexpected API response: {payload}")
    df = pd.DataFrame(daily)
    df = df.rename(columns={"time": "date"})
    df["date"] = pd.to_datetime(df["date"]).dt.date
    return df


def main() -> int:
    try:
        df = fetch_weather()
    except requests.RequestException as exc:
        print(f"[ERROR] Network/API failure: {exc}", file=sys.stderr)
        return 1
    except (ValueError, KeyError) as exc:
        print(f"[ERROR] Bad API payload: {exc}", file=sys.stderr)
        return 1

    try:
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(OUTPUT_PATH, index=False)
    except OSError as exc:
        print(f"[ERROR] Could not write CSV: {exc}", file=sys.stderr)
        return 1

    print(f"Rows downloaded: {len(df)}")
    print(f"Date range: {df['date'].min()} to {df['date'].max()}")
    print(f"Saved to: {OUTPUT_PATH}")
    print("First 3 rows:")
    print(df.head(3).to_string(index=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
