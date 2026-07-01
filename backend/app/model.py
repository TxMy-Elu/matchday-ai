"""
Matchday AI — prediction engine.

Loads the pretrained artifacts from train.py (Elo ratings, multinomial logit
coefficients, Poisson GLM coefficients, Dixon-Coles rho) and turns them into
a full prediction for any matchup: W/D/L probabilities + a scoreline
probability matrix, from which we derive the single most likely scoreline
and a top-5 list.

No sklearn/statsmodels dependency at serve time — everything reduces to a
handful of closed-form formulas, so this is fast and has zero ML runtime
dependencies in production.
"""
import json
import math
from pathlib import Path
from typing import Optional

import numpy as np

RATINGS_PATH = Path(__file__).resolve().parent.parent / "ratings" / "team_ratings.json"

MAX_GOALS = 8  # scoreline matrix truncation (P(>8 goals) is negligible)


class MatchdayModel:
    def __init__(self, path: Path = RATINGS_PATH):
        with open(path) as f:
            self.data = json.load(f)

        self.elo = self.data["elo_ratings"]
        self.home_adv = self.data["home_advantage_elo"]
        self.wc26_teams = self.data["wc2026_teams"]
        self.team_form = self.data["team_form"]
        self.future_fixtures = self.data["future_fixtures"]
        self.wc2026_matches = self.data.get("wc2026_matches", [])
        self.bracket_tree = self.data.get("bracket_tree", [])
        self.group_standings = self.data.get("group_standings", {})
        self.upsets = self.data.get("upsets", [])

        om = self.data["outcome_model"]
        self.outcome_classes = om["classes"]
        self.outcome_coef = np.array(om["coef"]).flatten()
        self.outcome_intercept = np.array(om["intercept"])

        gm = self.data["goals_model"]
        self.home_intercept = gm["home_intercept"]
        self.home_coef = gm["home_coef"]
        self.away_intercept = gm["away_intercept"]
        self.away_coef = gm["away_coef"]
        self.rho = gm["dixon_coles_rho"]

    # -- helpers -----------------------------------------------------------
    def has_team(self, team: str) -> bool:
        return team in self.elo

    def elo_of(self, team: str) -> float:
        return self.elo.get(team, 1500.0)

    def _tau(self, x: int, y: int, lam: float, mu: float) -> float:
        rho = self.rho
        if x == 0 and y == 0:
            return 1 - lam * mu * rho
        if x == 0 and y == 1:
            return 1 + lam * rho
        if x == 1 and y == 0:
            return 1 + mu * rho
        if x == 1 and y == 1:
            return 1 - rho
        return 1.0

    def outcome_only(self, home: str, away: str, neutral: bool = True) -> dict:
        """Fast W/D/L-only prediction (skips the scoreline matrix) for Monte Carlo simulation."""
        r_home = self.elo_of(home)
        r_away = self.elo_of(away)
        adv = 0.0 if neutral else self.home_adv
        diff = (r_home + adv) - r_away
        z = self.outcome_coef * diff + self.outcome_intercept
        expz = np.exp(z - z.max())
        p = expz / expz.sum()
        outcome_probs = dict(zip(self.outcome_classes, p.tolist()))
        return {
            "home_win": outcome_probs.get("H", 0.0),
            "draw": outcome_probs.get("D", 0.0),
            "away_win": outcome_probs.get("A", 0.0),
        }

    # -- core prediction -----------------------------------------------------
    def predict(self, home: str, away: str, neutral: bool = True) -> dict:
        r_home = self.elo_of(home)
        r_away = self.elo_of(away)
        adv = 0.0 if neutral else self.home_adv
        diff = (r_home + adv) - r_away

        # W/D/L via the calibrated multinomial logit
        z = self.outcome_coef * diff + self.outcome_intercept
        expz = np.exp(z - z.max())
        p = expz / expz.sum()
        outcome_probs = dict(zip(self.outcome_classes, p.tolist()))

        # Expected goals via the Poisson GLMs
        lam = math.exp(self.home_intercept + self.home_coef * diff)   # home xG
        mu = math.exp(self.away_intercept + self.away_coef * (-diff))  # away xG

        # Full scoreline matrix with Dixon-Coles low-score correction
        matrix = np.zeros((MAX_GOALS + 1, MAX_GOALS + 1))
        for i in range(MAX_GOALS + 1):
            for j in range(MAX_GOALS + 1):
                p_ij = (
                    math.exp(-lam) * lam ** i / math.factorial(i)
                    * math.exp(-mu) * mu ** j / math.factorial(j)
                    * self._tau(i, j, lam, mu)
                )
                matrix[i, j] = max(p_ij, 0.0)
        matrix /= matrix.sum()  # renormalize (tau correction + truncation)

        flat = [
            {"home_goals": i, "away_goals": j, "prob": float(matrix[i, j])}
            for i in range(MAX_GOALS + 1)
            for j in range(MAX_GOALS + 1)
        ]
        flat.sort(key=lambda x: -x["prob"])
        top_scorelines = flat[:5]
        predicted_scoreline = flat[0]

        return {
            "home_team": home,
            "away_team": away,
            "neutral_venue": neutral,
            "elo": {"home": round(r_home, 1), "away": round(r_away, 1), "diff": round(diff, 1)},
            "win_draw_loss": {
                "home_win": round(outcome_probs.get("H", 0.0), 4),
                "draw": round(outcome_probs.get("D", 0.0), 4),
                "away_win": round(outcome_probs.get("A", 0.0), 4),
            },
            "expected_goals": {"home": round(lam, 2), "away": round(mu, 2)},
            "predicted_scoreline": {
                "home_goals": predicted_scoreline["home_goals"],
                "away_goals": predicted_scoreline["away_goals"],
                "prob": round(predicted_scoreline["prob"], 4),
            },
            "top_scorelines": [
                {**s, "prob": round(s["prob"], 4)} for s in top_scorelines
            ],
            "recent_form": {
                "home": self.team_form.get(home, []),
                "away": self.team_form.get(away, []),
            },
        }
