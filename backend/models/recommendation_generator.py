# Naturotechnica — Farmer-facing recommendation card generator
import json
import sys
from pathlib import Path

import pandas as pd

SCORES_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "irrigation_scores_chicago.csv"
RISK_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "disease_risk_chicago.csv"
OUTPUT_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "recommendations_chicago.json"

FIELD_NAME = "Chicago Pilot Field"
CONFIDENCE_PCT = 85.0

URGENCY_RANK = {"high": 0, "medium": 1, "low": 2}


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


def _disease_title(risk_type: str, level: str) -> str:
    if risk_type == "fungal":
        return "High fungal disease risk" if level == "high" else "Fungal disease risk building"
    if risk_type == "heat_stress":
        return "Extreme heat warning" if level == "high" else "Heat stress warning"
    return f"{risk_type.title()} risk"


def build_disease_cards(risks: pd.DataFrame, field_name: str = FIELD_NAME) -> list[dict]:
    cards = []
    for _, row in risks.iterrows():
        risk_type = str(row["risk_type"])
        level = str(row["risk_level"])
        action = str(row["action_text"])
        cause = str(row["probable_cause"])
        days = int(row["consecutive_days"])
        cards.append(
            {
                "date": str(row["date"]),
                "field_name": field_name,
                "rec_type": risk_type,
                "urgency": level,
                "title": _disease_title(risk_type, level),
                "action_text": f"{cause} ({days}-day run). {action}",
                "confidence_pct": float(row.get("confidence_pct", 80.0)),
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

    irrigation_cards = build_cards(scores)

    disease_cards: list[dict] = []
    if RISK_PATH.exists():
        try:
            risks = pd.read_csv(RISK_PATH)
            disease_cards = build_disease_cards(risks)
        except pd.errors.ParserError as exc:
            print(f"[WARN] Could not parse disease risk CSV: {exc}", file=sys.stderr)
    else:
        print(
            f"[INFO] Disease risk CSV not found at {RISK_PATH} — "
            "run disease_risk.py to include disease cards.",
            file=sys.stderr,
        )

    all_cards = irrigation_cards + disease_cards
    all_cards.sort(
        key=lambda c: (URGENCY_RANK.get(c["urgency"], 99), c["date"], c["rec_type"])
    )

    try:
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with OUTPUT_PATH.open("w") as f:
            json.dump(all_cards, f, indent=2)
    except OSError as exc:
        print(f"[ERROR] Could not write JSON: {exc}", file=sys.stderr)
        return 1

    print(f"Generated {len(all_cards)} recommendation cards "
          f"({len(irrigation_cards)} irrigation, {len(disease_cards)} disease/heat).")
    print(f"Saved to: {OUTPUT_PATH}\n")

    if not all_cards:
        print("No active recommendations.")
        return 0

    top = all_cards[: min(5, len(all_cards))]
    print("Top 5 recommendations (by urgency, then date):\n")
    for card in top:
        print(format_card(card))

    return 0


if __name__ == "__main__":
    sys.exit(main())
