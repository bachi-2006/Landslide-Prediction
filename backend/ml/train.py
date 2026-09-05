"""Train and evaluate the NE-SHIELD landslide risk model.

Input CSV columns:
    rain_1h,rain_3h,rain_24h,soil_moisture,elevation,slope,
    hist_count,hist_fatalities,label

The label must be binary: 0 for no landslide and 1 for landslide.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

FEATURES = [
    "rain_1h",
    "rain_3h",
    "rain_24h",
    "soil_moisture",
    "elevation",
    "slope",
    "hist_count",
    "hist_fatalities",
]


def load_csv(path: Path) -> tuple[np.ndarray, np.ndarray]:
    with path.open(newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))

    missing = [column for column in [*FEATURES, "label"] if not rows or column not in rows[0]]
    if missing:
        raise ValueError(f"Missing required CSV columns: {', '.join(missing)}")

    features = np.array([[float(row[column]) for column in FEATURES] for row in rows], dtype=float)
    labels = np.array([int(row["label"]) for row in rows], dtype=int)
    if set(labels) != {0, 1}:
        raise ValueError("The training data must contain both label classes: 0 and 1")
    return features, labels


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True, help="Labeled CSV dataset")
    parser.add_argument("--model", type=Path, default=Path("backend/ml/model.joblib"))
    parser.add_argument("--metrics", type=Path, default=Path("backend/ml/metrics.json"))
    args = parser.parse_args()

    features, labels = load_csv(args.data)
    x_train, x_test, y_train, y_test = train_test_split(
        features,
        labels,
        test_size=0.2,
        random_state=42,
        stratify=labels,
    )

    model = XGBClassifier(
        n_estimators=250,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        objective="binary:logistic",
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(x_train, y_train)

    predictions = model.predict(x_test)
    probabilities = model.predict_proba(x_test)[:, 1]
    metrics = {
        "samples": int(len(labels)),
        "test_samples": int(len(y_test)),
        "accuracy": float(accuracy_score(y_test, predictions)),
        "roc_auc": float(roc_auc_score(y_test, probabilities)),
        "classification_report": classification_report(y_test, predictions, output_dict=True),
        "features": FEATURES,
    }

    args.model.parent.mkdir(parents=True, exist_ok=True)
    args.metrics.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, args.model)
    args.metrics.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))
    print(f"Saved model to {args.model}")
    print(f"Saved metrics to {args.metrics}")


if __name__ == "__main__":
    main()
