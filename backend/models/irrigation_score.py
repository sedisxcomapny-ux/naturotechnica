# Naturotechnica — Irrigation scorer (FAO-56 water balance for corn)
import sys
from datetime import date
from pathlib import Path

import pandas as pd

WEATHER_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "weather_growing_season.csv"
OUTPUT_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "irrigation_scores_chicago.csv"

PLANTED_DATE = date(2025, 5, 1)
DEPLETION_TRIGGER_MM = 60.0

# Corn Kc curve (FAO-56, simplified step function)
KC_STAGES = [
    (1, 30, 0.3),     # initial
    (31, 65, 0.7),    # development
    (66, 105, 1.2),   # mid-season
    (106, 130, 0.6),  # late / harvest
]


def kc_for_day(days_since_planting: int) -> float:
    for start, end, kc in KC_STAGES:
        if start <= days_since_planting <= end:
            return kc
    return 0.0


def compute_scores(weather: pd.DataFrame, planted_date: date = PLANTED_DATE) -> pd.DataFrame:
    df = weather.copy()
    df["date"] = pd.to_datetime(df["date"]).dt.date
    df = df.sort_values("date").reset_index(drop=True)

    df["days_since_planting"] = df["date"].apply(lambda d: (d - planted_date).days + 1)
    df["kc"] = df["days_since_planting"].apply(kc_for_day)
    df["etc_mm"] = df["et0_fao_evapotranspiration"].fillna(0) * df["kc"]
    df["rainfall_mm"] = df["precipitation_sum"].fillna(0)

    depletions = []
    current = 0.0
    for _, row in df.iterrows():
        current = current + row["etc_mm"] - row["rainfall_mm"]
        current = max(0.0, current)
        depletions.append(current)
    df["depletion_mm"] = depletions

    df["depletion_score"] = df["depletion_mm"].clip(lower=0, upper=100).round(2)
    df["irrigate_now"] = df["depletion_mm"] > DEPLETION_TRIGGER_MM

    return df[
        [
            "date",
            "days_since_planting",
            "kc",
            "rainfall_mm",
            "etc_mm",
            "depletion_mm",
            "depletion_score",
            "irrigate_now",
        ]
    ]


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
    except pd.errors.ParserError as exc:
        print(f"[ERROR] Could not parse weather CSV: {exc}", file=sys.stderr)
        return 1

    required = {"date", "et0_fao_evapotranspiration", "precipitation_sum"}
    missing = required - set(weather.columns)
    if missing:
        print(f"[ERROR] Weather CSV missing columns: {missing}", file=sys.stderr)
        return 1

    scores = compute_scores(weather)

    try:
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        scores.to_csv(OUTPUT_PATH, index=False)
    except OSError as exc:
        print(f"[ERROR] Could not write CSV: {exc}", file=sys.stderr)
        return 1

    total_days = len(scores)
    irrigate_days = int(scores["irrigate_now"].sum())
    latest = scores.iloc[-1]
    in_season_days = int((scores["kc"] > 0).sum())
    peak_row = scores.loc[scores["depletion_mm"].idxmax()]

    print(f"Total days scored: {total_days}")
    print(f"Days in growing season (Kc>0): {in_season_days}")
    print(f"Days irrigate_now=True: {irrigate_days}")
    print(
        f"Peak depletion: {peak_row['depletion_mm']:.2f}mm "
        f"(score={peak_row['depletion_score']:.2f}) on {peak_row['date']}"
    )
    print(
        f"Final day ({latest['date']}): "
        f"depletion={latest['depletion_mm']:.2f}mm, "
        f"score={latest['depletion_score']:.2f}, "
        f"irrigate_now={bool(latest['irrigate_now'])}"
    )

    stress_df = scores.copy()
    stress_df["date_dt"] = pd.to_datetime(stress_df["date"])
    weekly_stress = (
        stress_df.set_index("date_dt")
        .resample("W")
        .agg(
            mean_depletion_mm=("depletion_mm", "mean"),
            max_depletion_mm=("depletion_mm", "max"),
            irrigate_days=("irrigate_now", "sum"),
        )
        .reset_index()
    )
    weekly_stress["week_ending"] = weekly_stress["date_dt"].dt.date
    top_weeks = weekly_stress.sort_values("mean_depletion_mm", ascending=False).head(5)

    print("\nTop 5 highest-stress weeks (by mean depletion):")
    print(
        top_weeks[["week_ending", "mean_depletion_mm", "max_depletion_mm", "irrigate_days"]]
        .to_string(index=False)
    )

    print(f"\nSaved to: {OUTPUT_PATH}")

    if in_season_days == 0:
        print(
            "\n[NOTE] No weather rows fall inside the corn growing window "
            f"(day 1-130 after {PLANTED_DATE.isoformat()}). "
            "Re-run weather_ingest.py over the 2025 growing season "
            "or update PLANTED_DATE."
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
