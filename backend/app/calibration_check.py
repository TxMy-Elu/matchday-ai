"""
Matchday AI — standalone calibration diagnostic
================================================
Answers "when the model says a team has a 70% chance to win, do they
actually win about 70% of the time?" against the 2026 World Cup matches
played so far. Read-only: doesn't touch team_ratings.json or any other
output — just prints a report.

Kept as its own script (rather than living in train.py) so it doesn't
interfere with the version of that check being developed separately on
the `dev` branch. Duplicates train.py's Elo + outcome-model fitting to
stay fully independent — this is intentionally a throwaway diagnostic,
not something meant to be imported elsewhere.

Usage:
    python -m app.calibration_check
"""
import math
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

results = pd.read_csv(DATA_DIR / "results.csv", parse_dates=["date"])
former = pd.read_csv(DATA_DIR / "former_names.csv")
rename_map = dict(zip(former["former"], former["current"]))
results["home_team"] = results["home_team"].replace(rename_map)
results["away_team"] = results["away_team"].replace(rename_map)

played = results.dropna(subset=["home_score", "away_score"]).copy()
played["home_score"] = played["home_score"].astype(int)
played["away_score"] = played["away_score"].astype(int)
played = played.sort_values("date").reset_index(drop=True)


def k_factor(tournament: str) -> int:
    t = tournament.lower()
    if t == "fifa world cup":
        return 60
    if any(s in t for s in ["euro", "copa américa", "copa america", "african cup of nations",
                             "afc asian cup", "gold cup", "concacaf championship",
                             "confederations cup", "nations league"]) and "qualif" not in t:
        return 50
    if "qualif" in t:
        return 40
    if t == "friendly":
        return 20
    return 30


HOME_ADV = 100.0


def expected_score(r_a: float, r_b: float) -> float:
    return 1.0 / (1.0 + 10 ** (-(r_a - r_b) / 400.0))


def goal_diff_multiplier(gd: int) -> float:
    gd = abs(gd)
    if gd <= 1:
        return 1.0
    if gd == 2:
        return 1.5
    return (11 + gd) / 8.0


elo: dict[str, float] = {}
DEFAULT_ELO = 1500.0
rows = []

for row in played.itertuples(index=False):
    home, away = row.home_team, row.away_team
    r_home = elo.get(home, DEFAULT_ELO)
    r_away = elo.get(away, DEFAULT_ELO)
    adv = 0.0 if row.neutral else HOME_ADV
    elo_diff = (r_home + adv) - r_away

    rows.append({
        "date": row.date, "home_team": home, "away_team": away, "elo_diff": elo_diff,
        "outcome": "H" if row.home_score > row.away_score else ("A" if row.home_score < row.away_score else "D"),
    })

    we_home = expected_score(r_home + adv, r_away)
    w_home = 1.0 if row.home_score > row.away_score else (0.5 if row.home_score == row.away_score else 0.0)
    k = k_factor(row.tournament) * goal_diff_multiplier(row.home_score - row.away_score)
    delta = k * (w_home - we_home)
    elo[home] = r_home + delta
    elo[away] = r_away - delta

reg_df = pd.DataFrame(rows)
clf = LogisticRegression(max_iter=1000)
clf.fit(reg_df[["elo_diff"]].values, reg_df["outcome"].values)
classes = list(clf.classes_)
class_idx = {c: i for i, c in enumerate(classes)}

wc26 = results[(results["tournament"] == "FIFA World Cup") & (results["date"].dt.year == 2026)]
wc26_keys = set(zip(wc26["date"], wc26["home_team"], wc26["away_team"]))
wc26_rows = [r for r in rows if (r["date"], r["home_team"], r["away_team"]) in wc26_keys]

n = len(wc26_rows)
print(f"2026 World Cup calibration check ({n} matches played so far):")
if n < 10:
    print("  Not enough played matches yet for a meaningful check.")
else:
    elo_diff = np.array([r["elo_diff"] for r in wc26_rows]).reshape(-1, 1)
    actual = [r["outcome"] for r in wc26_rows]
    probs = clf.predict_proba(elo_diff)

    brier_total, logloss_total = 0.0, 0.0
    for p_row, a in zip(probs, actual):
        for c in classes:
            brier_total += (p_row[class_idx[c]] - (1.0 if c == a else 0.0)) ** 2
        logloss_total += -math.log(max(p_row[class_idx[a]], 1e-9))
    print(f"  Brier score: {brier_total / n:.4f} (0 = perfect, 0.667 = uninformative baseline)")
    print(f"  Log loss:    {logloss_total / n:.4f} (lower is better; ln(3)={math.log(3):.4f} = uninformative baseline)")

    p_home = probs[:, class_idx["H"]]
    bins = [(0.0, 0.2, "0-20%"), (0.2, 0.4, "20-40%"), (0.4, 0.6, "40-60%"), (0.6, 0.8, "60-80%"), (0.8, 1.001, "80-100%")]
    print(f"  {'Predicted P(home win)':<24} {'# matches':<10} {'Actual home-win rate'}")
    for lo, hi, label in bins:
        mask = (p_home >= lo) & (p_home < hi)
        count = int(mask.sum())
        if count == 0:
            continue
        rate = sum(1 for a, m in zip(actual, mask) if m and a == "H") / count
        print(f"  {label:<24} {count:<10} {rate:.0%}")
