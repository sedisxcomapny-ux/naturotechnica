# Naturotechnica — Farmer-facing recommendation card generator
import json
import sys
from pathlib import Path

import pandas as pd

SCORES_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "irrigation_scores_chicago.csv"
OUTPUT_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "recommendations_chicago.json"

FIELD_NAME = "Chicago Pilot Field"
CONFIDENCE_PCT = 85.0


def urgency_for(score: float) -> str:
    if score > 80:
        return "high"
    if score >= 50:
        return "medium"
    return "low"


def title_for(urgency: str) -> str:
    return {
        "high": "Irrigate within 24 hours",
        "medium": "Schedule irrigation in 2-3 days",
        "low": "Monitor soil moisture",
    }[urgency]


def growth_stage_for(days_since_planting: int) -> str:
    if days_since_planting <= 30:
        return "initial emergence"
    if days_since_planting <= 65:
        return "canopy development"
    if days_since_planting <= 105:
        return "mid-season (tasseling/grain fill)"
    return "late maturity"


def action_text_for(
    score: float, depletion_mm: float, urgency: str, growth_stage: str = ""
) -> str:
    if score >= 90:
        return (
            f"Critical: Immediate irrigation required. Soil moisture depletion "
            f"at {score:.0f}/100 — crop yield loss is imminent without water "
            f"within 12 hours."
        )
    if score >= 70:
        return (
            f"High priority: Irrigate within 24 hours. Water deficit at "
            f"{score:.0f}/100 — corn is under significant stress during "
            f"{growth_stage}."
        )
    if score >= 50:
        return (
            f"Monitor closely: Consider irrigating within 48 hours. "
            f"Depletion at {score:.0f}/100."
        )
    return (
        f"Soil water depletion at {depletion_mm:.1f} mm "
        f"(score {score:.0f}/100). No immediate irrigation required."
    )


def build_cards(scores: pd.DataFrame, field_name: str = FIELD_NAME) -> list[dict]:
    active = scores[scores["irrigate_now"].astype(bool)].copy()
    cards = []
    for _, row in active.iterrows():
        score = float(row["depletion_score"])
        depletion = float(row["depletion_mm"])
        days = int(row["days_since_planting"])
        urgency = urgency_for(score)
        stage = growth_stage_for(days)
        cards.append(
            {
                "date": str(row["date"]),
                "field_name": field_name,
                "rec_type": "irrigation",
                "urgency": urgency,
                "title": title_for(urgency),
                "action_text": action_text_for(score, depletion, urgency, stage),
                "depletion_score": score,
                "confidence_pct": CONFIDENCE_PCT,
            }
        )
    return cards


def format_card(card: dict) -> str:
    border = "─" * 60
    return (
        f"{border}\n"
        f"  {card['date']}  |  {card['field_name']}  |  "
        f"urgency: {card['urgency'].upper()}\n"
        f"  {card['title']}\n"
        f"{border}\n"
        f"  {card['action_text']}\n"
        f"  Confidence: {card['confidence_pct']:.1f}%\n"
    )


def main() -> int:
    try:
        scores = pd.read_csv(SCORES_PATH)
    except FileNotFoundError:
        print(
            f"[ERROR] Irrigation scores not found at {SCORES_PATH}\n"
            "Run backend/models/irrigation_score.py first.",
            file=sys.stderr,
        )
        return 1

    required = {"date", "depletion_mm", "depletion_score", "irrigate_now"}
    missing = required - set(scores.columns)
    if missing:
        print(f"[ERROR] Scores CSV missing columns: {missing}", file=sys.stderr)
        return 1

    cards = build_cards(scores)

    try:
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with OUTPUT_PATH.open("w") as f:
            json.dump(cards, f, indent=2)
    except OSError as exc:
        print(f"[ERROR] Could not write JSON: {exc}", file=sys.stderr)
        return 1

    print(f"Generated {len(cards)} recommendation cards.")
    print(f"Saved to: {OUTPUT_PATH}\n")

    if not cards:
        print("No active irrigation recommendations — crop is not under water stress.")
        return 0

    active = scores[scores["irrigate_now"].astype(bool)].copy()
    top_dates = active.sort_values("depletion_score", ascending=False).head(3)["date"].astype(str).tolist()
    cards_by_date = {c["date"]: c for c in cards}

    print("Top 3 most urgent recommendations:\n")
    for d in top_dates:
        print(format_card(cards_by_date[d]))

    return 0


if __name__ == "__main__":
    sys.exit(main())
