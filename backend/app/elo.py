"""
Matchday AI — shared Elo core.

Holds the pieces that both the training pipeline (train.py) and the backtest
(evaluate.py) must agree on: data loading/normalization, the K-factor schedule,
and the chronological Elo walk.

These live here rather than in train.py because a backtest that re-implemented
them would silently drift the day either is tuned, and the resulting metrics
would look fine while measuring a model nobody ships.
"""
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

DEFAULT_ELO = 1500.0
HOME_ADV = 100.0  # Elo points added to the home team's rating pre-match


def k_factor(tournament: str) -> int:
    """Tournament importance weight, following the World Football Elo
    methodology (eloratings.net), tuned to this dataset's tournament labels."""
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
    return 30  # regional cups, minor tournaments, games, etc.


def expected_score(r_a: float, r_b: float) -> float:
    return 1.0 / (1.0 + 10 ** (-(r_a - r_b) / 400.0))


def goal_diff_multiplier(gd: int) -> float:
    gd = abs(gd)
    if gd <= 1:
        return 1.0
    if gd == 2:
        return 1.5
    return (11 + gd) / 8.0


def load_results():
    """Load results.csv with historical team names normalized to current ones,
    split into played matches and future (score-blank) fixtures.

    Returns (results, played, future, rename_map).
    """
    results = pd.read_csv(DATA_DIR / "results.csv", parse_dates=["date"])
    former = pd.read_csv(DATA_DIR / "former_names.csv")

    # Normalize historical team names to their current name so a team's Elo
    # history carries through name changes (e.g. "Gold Coast" -> "Ghana").
    rename_map = dict(zip(former["former"], former["current"]))
    results["home_team"] = results["home_team"].replace(rename_map)
    results["away_team"] = results["away_team"].replace(rename_map)

    played = results.dropna(subset=["home_score", "away_score"]).copy()
    played["home_score"] = played["home_score"].astype(int)
    played["away_score"] = played["away_score"].astype(int)
    played = played.sort_values("date").reset_index(drop=True)

    future = results[results["home_score"].isna()].copy()

    return results, played, future, rename_map


def run_elo(played: pd.DataFrame):
    """Walk every played match in chronological order, updating Elo as we go
    and recording the *pre-match* effective Elo difference for each game.

    Because the walk is strictly chronological and each row's elo_diff is read
    before that match's own result is applied, the recorded elo_diff for any
    match only reflects information available before kickoff. That is what
    makes a temporal backtest on these rows honest.

    Returns (elo, reg_df).
    """
    elo: dict[str, float] = {}
    rows_for_regression = []

    for row in played.itertuples(index=False):
        home, away = row.home_team, row.away_team
        r_home = elo.get(home, DEFAULT_ELO)
        r_away = elo.get(away, DEFAULT_ELO)

        adv = 0.0 if row.neutral else HOME_ADV
        elo_diff_effective = (r_home + adv) - r_away

        rows_for_regression.append({
            "date": row.date,
            "home_team": home,
            "away_team": away,
            "elo_diff": elo_diff_effective,
            "home_score": row.home_score,
            "away_score": row.away_score,
            "outcome": "H" if row.home_score > row.away_score else ("A" if row.home_score < row.away_score else "D"),
        })

        we_home = expected_score(r_home + adv, r_away)
        w_home = 1.0 if row.home_score > row.away_score else (0.5 if row.home_score == row.away_score else 0.0)
        gd = row.home_score - row.away_score
        k = k_factor(row.tournament) * goal_diff_multiplier(gd)

        delta = k * (w_home - we_home)
        elo[home] = r_home + delta
        elo[away] = r_away - delta

    return elo, pd.DataFrame(rows_for_regression)
