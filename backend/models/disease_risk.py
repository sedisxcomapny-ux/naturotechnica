# Naturotechnica — Disease & heat-stress risk detector (rule-based, corn)
import sys
from pathlib import Path

import pandas as pd

WEATHER_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "weather_growing_season.csv"
OUTPUT_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "disease_risk_chicago.csv"

# Fungal favorability bands (corn, generic gray-leaf-spot / rust profile)
FUNGAL_TEMP_MIN = 15.0
FUNGAL_TEMP_MAX = 25.0
FUNGAL_HUMIDITY_HIGH = 80.0
FUNGAL_HUMIDITY_MED = 70.0
FUNGAL_HIGH_DAYS = 3
FUNGAL_MED_DAYS = 2

# Heat-stress thresholds on 3-day rolling max of daily tmax
HEAT_HIGH_C = 35.0
HEAT_MED_C = 32.0
HEAT_ROLL_DAYS = 3

CONFIDENCE_PCT = 80.0


def _fungal_action(level: str) -> tuple[str, str]:
    if level == "high":
        return (
            "Extended favorable conditions for fungal infection",
            "Scout the canopy for lesions and apply a preventative fungicide within 48 hours.",
        )
    return (
        "Conditions trending favorable for fungal infection",
        "Increase scouting frequency; prepare fungicide program in case favorability persists.",
    )


def _heat_action(level: str) -> tuple[str, str]:
    if level == "high":
        return (
            "Multi-day extreme heat on canopy",
            "Irrigate to cool the canopy if possible and avoid any mid-day spraying; watch for tassel blast.",
        )
    return (
        "Sustained elevated heat",
        "Monitor soil moisture closely and shift any planned field operations to early morning.",
    )


def detect_fungal(weather: pd.DataFrame) -> list[dict]:
    """One event per tier-crossing within a contiguous favorable run."""
    df = weather.copy()
    df["tavg"] = (df["temperature_2m_max"] + df["temperature_2m_min"]) / 2
    df["humidity"] = df["relative_humidity_2m_max"].fillna(0)
    df["temp_ok"] = df["tavg"].between(FUNGAL_TEMP_MIN, FUNGAL_TEMP_MAX)
    df["med_fav"] = df["temp_ok"] & (df["humidity"] > FUNGAL_HUMIDITY_MED)
    df["high_fav"] = df["temp_ok"] & (df["humidity"] > FUNGAL_HUMIDITY_HIGH)

    events: list[dict] = []
    med_run = 0
    high_run = 0
    med_emitted = False
    high_emitted = False

    for _, row in df.iterrows():
        if row["med_fav"]:
            med_run += 1
        else:
            med_run = 0
            med_emitted = False
        if row["high_fav"]:
            high_run += 1
        else:
            high_run = 0
            high_emitted = False

        if high_run >= FUNGAL_HIGH_DAYS and not high_emitted:
            cause, action = _fungal_action("high")
            events.append(
                {
                    "date": str(row["date"]),
                    "risk_type": "fungal",
                    "risk_level": "high",
                    "consecutive_days": int(high_run),
                    "probable_cause": cause,
                    "action_text": action,
                    "confidence_pct": CONFIDENCE_PCT,
                }
            )
            high_emitted = True
        elif (
            med_run >= FUNGAL_MED_DAYS
            and not med_emitted
            and high_run < FUNGAL_HIGH_DAYS
        ):
            cause, action = _fungal_action("medium")
            events.append(
                {
                    "date": str(row["date"]),
                    "risk_type": "fungal",
                    "risk_level": "medium",
                    "consecutive_days": int(med_run),
                    "probable_cause": cause,
                    "action_text": action,
                    "confidence_pct": CONFIDENCE_PCT,
                }
            )
            med_emitted = True

    return events


def detect_heat_stress(weather: pd.DataFrame) -> list[dict]:
    """One event per entry into a contiguous heat tier (MEDIUM/HIGH)."""
    df = weather.copy()
    df["rolling_tmax"] = df["temperature_2m_max"].rolling(HEAT_ROLL_DAYS, min_periods=1).max()

    def level_for(t: float) -> str:
        if t > HEAT_HIGH_C:
            return "high"
        if t > HEAT_MED_C:
            return "medium"
        return "low"

    df["level"] = df["rolling_tmax"].apply(level_for)

    events: list[dict] = []
    run_level = "low"
    run_len = 0
    for _, row in df.iterrows():
        lvl = row["level"]
        if lvl == run_level:
            run_len += 1
        else:
            run_level = lvl
            run_len = 1
            if lvl in ("medium", "high"):
                cause, action = _heat_action(lvl)
                events.append(
                    {
                        "date": str(row["date"]),
                        "risk_type": "heat_stress",
                        "risk_level": lvl,
                        "consecutive_days": 1,  # updated below
                        "probable_cause": cause,
                        "action_text": action,
                        "confidence_pct": CONFIDENCE_PCT,
                    }
                )
        # Update the most recent event's consecutive_days if we're still in same run
        if events and events[-1]["risk_level"] == lvl and events[-1]["risk_type"] == "heat_stress":
            events[-1]["consecutive_days"] = int(run_len)

    return events


def detect_all(weather: pd.DataFrame) -> list[dict]:
    events = detect_fungal(weather) + detect_heat_stress(weather)
    events.sort(key=lambda e: (e["date"], e["risk_type"]))
    return events


def most_dangerous_period(events: list[dict], window_days: int = 7) -> tuple[str, str, int]:
    if not events:
        return ("", "", 0)
    df = pd.DataFrame(events)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date")
    # Rolling count over a calendar window ending at each event date
    counts: dict[pd.Timestamp, int] = {}
    for d in df["date"]:
        lo = d - pd.Timedelta(days=window_days - 1)
        counts[d] = int(((df["date"] >= lo) & (df["date"] <= d)).sum())
    end = max(counts, key=counts.get)
    start = end - pd.Timedelta(days=window_days - 1)
    return (start.date().isoformat(), end.date().isoformat(), counts[end])


def main() -> int:
    try:
        weather = pd.read_csv(WEATHER_PATH)
    except FileNotFoundError:
        print(
            f"[ERROR] Weather data not found at {WEATHER_PATH}\n"
            "Run backend/ingestion/weather_ingest.py first.",
            file=sys.stderr,
        )
        return 1

    required = {
        "date",
        "temperature_2m_max",
        "temperature_2m_min",
        "relative_humidity_2m_max",
    }
    missing = required - set(weather.columns)
    if missing:
        print(f"[ERROR] Weather CSV missing columns: {missing}", file=sys.stderr)
        return 1

    events = detect_all(weather)

    try:
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        pd.DataFrame(
            events,
            columns=[
                "date",
                "risk_type",
                "risk_level",
                "consecutive_days",
                "probable_cause",
                "action_text",
                "confidence_pct",
            ],
        ).to_csv(OUTPUT_PATH, index=False)
    except OSError as exc:
        print(f"[ERROR] Could not write CSV: {exc}", file=sys.stderr)
        return 1

    total = len(events)
    high = sum(1 for e in events if e["risk_level"] == "high")
    start, end, count = most_dangerous_period(events)

    print(f"Total risk events: {total}")
    print(f"High-urgency events: {high}")
    if total:
        print(f"Most dangerous window: {start} → {end} ({count} events in 7 days)")

    ranked = sorted(
        events,
        key=lambda e: (0 if e["risk_level"] == "high" else 1, -e["consecutive_days"], e["date"]),
    )[:3]
    if ranked:
        print("\nTop 3 risk events:")
        for e in ranked:
            print(
                f"  • {e['date']} — {e['risk_type']} ({e['risk_level']}, "
                f"{e['consecutive_days']}d): {e['action_text']}"
            )

    print(f"\nSaved to: {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
