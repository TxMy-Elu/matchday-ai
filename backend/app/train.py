"""
Matchday AI — training pipeline
================================
Builds:
  1. A time-weighted Elo rating for every national team, updated match-by-match
     from 1872 through the most recently played fixture.
  2. A calibrated multinomial logistic regression mapping Elo difference ->
     P(home win / draw / away win), fit on the full 49k-match history.
  3. Two Poisson GLMs (home goals, away goals) mapping Elo difference -> expected
     goals, used to build a full scoreline probability matrix.
  4. A Dixon-Coles low-score correlation parameter (rho) fit by grid-search MLE,
     which corrects the independent-Poisson assumption's known bias on 0-0,
     1-0, 0-1 and 1-1 scorelines.

Output: backend/ratings/team_ratings.json — everything the FastAPI service
needs at request time, with zero ML dependencies required to serve.
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
import statsmodels.api as sm

from .tournament import build_tournament_state, build_full_bracket_tree, build_group_standings, build_upsets

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUT_DIR = Path(__file__).resolve().parent.parent / "ratings"
OUT_DIR.mkdir(exist_ok=True)

TODAY = pd.Timestamp("2026-07-01")

# ---------------------------------------------------------------------------
# 1. Load & clean
# ---------------------------------------------------------------------------
results = pd.read_csv(DATA_DIR / "results.csv", parse_dates=["date"])
former = pd.read_csv(DATA_DIR / "former_names.csv")

# Normalize historical team names to their current name so a team's Elo
# history carries through name changes (e.g. "Gold Coast" -> "Ghana").
rename_map = dict(zip(former["former"], former["current"]))
results["home_team"] = results["home_team"].replace(rename_map)
results["away_team"] = results["away_team"].replace(rename_map)

# Split into played matches (used to train everything) and future fixtures
# (score is blank — these are prediction targets, e.g. the R16-onward 2026
# World Cup matches that haven't kicked off yet).
played = results.dropna(subset=["home_score", "away_score"]).copy()
played["home_score"] = played["home_score"].astype(int)
played["away_score"] = played["away_score"].astype(int)
played = played.sort_values("date").reset_index(drop=True)

future = results[results["home_score"].isna()].copy()

print(f"Played matches used for training: {len(played)}")
print(f"Future fixtures (prediction targets): {len(future)}")

# ---------------------------------------------------------------------------
# 2. Tournament importance weights (K-factor), following the well-established
#    World Football Elo methodology (eloratings.net), tuned to this dataset's
#    tournament labels.
# ---------------------------------------------------------------------------
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
    return 30  # regional cups, minor tournaments, games, etc.


HOME_ADV = 100.0  # Elo points added to the home team's rating pre-match


def expected_score(r_a: float, r_b: float) -> float:
    return 1.0 / (1.0 + 10 ** (-(r_a - r_b) / 400.0))


def goal_diff_multiplier(gd: int) -> float:
    gd = abs(gd)
    if gd <= 1:
        return 1.0
    if gd == 2:
        return 1.5
    return (11 + gd) / 8.0


# ---------------------------------------------------------------------------
# 3. Run Elo chronologically, recording the *pre-match* elo_diff for every
#    game so we can later regress outcomes against it.
# ---------------------------------------------------------------------------
elo: dict[str, float] = {}
DEFAULT_ELO = 1500.0

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

reg_df = pd.DataFrame(rows_for_regression)
print(f"Teams rated: {len(elo)}")

# ---------------------------------------------------------------------------
# 4. Calibrate W/D/L probabilities: multinomial logistic regression of match
#    outcome on the pre-match effective Elo difference. This is fit on the
#    full 49k-match history rather than hand-picking a formula, so the
#    predicted probabilities are empirically calibrated (e.g. draws really
#    do happen ~26% of the time in near-even matches, which a naive
#    Elo-expected-score formula can't produce since it has no draw outcome).
# ---------------------------------------------------------------------------
X = reg_df[["elo_diff"]].values
y = reg_df["outcome"].values
clf = LogisticRegression(max_iter=1000)
clf.fit(X, y)
classes = list(clf.classes_)  # e.g. ['A', 'D', 'H']

# ---------------------------------------------------------------------------
# 5. Expected-goals model: two Poisson GLMs (home goals, away goals) against
#    the same effective Elo difference. This is the standard route to a full
#    scoreline distribution (Maher 1982 / Dixon-Coles 1997) and is far more
#    reliable than trying to classify exact scorelines directly — most
#    scorelines occur too rarely in 49k matches for a classifier to learn
#    them, whereas Poisson goal *rates* are smooth and well estimated.
# ---------------------------------------------------------------------------
X_glm = sm.add_constant(reg_df["elo_diff"].values)
home_glm = sm.GLM(reg_df["home_score"].values, X_glm, family=sm.families.Poisson()).fit()
away_glm = sm.GLM(reg_df["away_score"].values, sm.add_constant(-reg_df["elo_diff"].values),
                   family=sm.families.Poisson()).fit()

print("Home-goals Poisson coef:", home_glm.params)
print("Away-goals Poisson coef:", away_glm.params)


# ---------------------------------------------------------------------------
# 6. Dixon-Coles low-score correction: independent Poisson systematically
#    misprices 0-0 / 1-0 / 0-1 / 1-1 (real matches are more correlated at low
#    scores — e.g. cagey 0-0s are more common than pure independence
#    predicts). Fit rho by maximizing log-likelihood over a grid.
# ---------------------------------------------------------------------------
def tau(x, y, lam, mu, rho):
    if x == 0 and y == 0:
        return 1 - lam * mu * rho
    if x == 0 and y == 1:
        return 1 + lam * rho
    if x == 1 and y == 0:
        return 1 + mu * rho
    if x == 1 and y == 1:
        return 1 - rho
    return 1.0


lam_all = home_glm.predict(X_glm)
mu_all = away_glm.predict(sm.add_constant(-reg_df["elo_diff"].values))
hs = reg_df["home_score"].values
as_ = reg_df["away_score"].values

best_rho, best_ll = 0.0, -np.inf
for rho in np.arange(-0.15, 0.151, 0.01):
    # only low-score cells are affected; compute log-likelihood contribution
    tau_vals = np.array([tau(h, a, l, m, rho) for h, a, l, m in zip(hs, as_, lam_all, mu_all)])
    tau_vals = np.clip(tau_vals, 1e-6, None)
    ll = np.sum(np.log(tau_vals))
    if ll > best_ll:
        best_ll, best_rho = ll, rho

print(f"Dixon-Coles rho = {best_rho:.3f}")

# ---------------------------------------------------------------------------
# 7. Recent-form snapshot per team (last 10 matches) — surfaced in the UI for
#    context; not fed back into the model to keep it interpretable and avoid
#    double-counting what Elo already captures.
# ---------------------------------------------------------------------------
form = {}
for team in set(played["home_team"]) | set(played["away_team"]):
    mask_home = played["home_team"] == team
    mask_away = played["away_team"] == team
    team_matches = played[mask_home | mask_away].tail(10)
    results_list = []
    for r in team_matches.itertuples(index=False):
        is_home = r.home_team == team
        gf = r.home_score if is_home else r.away_score
        ga = r.away_score if is_home else r.home_score
        res = "W" if gf > ga else ("D" if gf == ga else "L")
        results_list.append(res)
    form[team] = results_list

# ---------------------------------------------------------------------------
# 8. World Cup 2026 squad list — the 48 teams actually in the tournament,
#    pulled straight from this dataset's 2026 FIFA World Cup fixtures.
# ---------------------------------------------------------------------------
wc26 = results[(results["tournament"] == "FIFA World Cup") & (results["date"].dt.year == 2026)].copy()
wc26_teams = sorted(set(wc26["home_team"]) | set(wc26["away_team"]))

# ---------------------------------------------------------------------------
# 8b. Knockout-bracket detection + full match list, delegated to tournament.py
#     (see that module's docstring for the detection rule). Rounds beyond
#     what's determined here are simulated with randomized pairings in
#     bracket.py.
# ---------------------------------------------------------------------------
shootouts = pd.read_csv(DATA_DIR / "shootouts.csv", parse_dates=["date"])
shootouts["home_team"] = shootouts["home_team"].replace(rename_map)
shootouts["away_team"] = shootouts["away_team"].replace(rename_map)

knockout_matches, all_wc26_matches = build_tournament_state(wc26, shootouts)
bracket_tree = build_full_bracket_tree(knockout_matches)
group_standings = build_group_standings(wc26)

elo_diff_lookup = {
    (str(r["date"].date()), r["home_team"], r["away_team"]): r["elo_diff"] for r in rows_for_regression
}
upsets = build_upsets(all_wc26_matches, elo_diff_lookup)
print(f"Upsets found: {len(upsets)}")


# ---------------------------------------------------------------------------
# 9. Persist everything the API needs
# ---------------------------------------------------------------------------
output = {
    "generated_at": str(TODAY.date()),
    "home_advantage_elo": HOME_ADV,
    "elo_ratings": {team: round(r, 1) for team, r in sorted(elo.items(), key=lambda kv: -kv[1])},
    "wc2026_teams": wc26_teams,
    "team_form": form,
    "outcome_model": {
        "classes": classes,
        "coef": clf.coef_.tolist(),
        "intercept": clf.intercept_.tolist(),
    },
    "goals_model": {
        "home_intercept": float(home_glm.params[0]),
        "home_coef": float(home_glm.params[1]),
        "away_intercept": float(away_glm.params[0]),
        "away_coef": float(away_glm.params[1]),
        "dixon_coles_rho": float(best_rho),
    },
    "future_fixtures": [
        {
            "date": str(r.date.date()),
            "home_team": r.home_team,
            "away_team": r.away_team,
            "city": r.city,
            "country": r.country,
            "neutral": bool(r.neutral),
        }
        for r in future.itertuples(index=False)
    ],
    "wc2026_matches": all_wc26_matches,
    "knockout_bracket": knockout_matches,
    "bracket_tree": bracket_tree,
    "group_standings": group_standings,
    "upsets": upsets,
}

with open(OUT_DIR / "team_ratings.json", "w") as f:
    json.dump(output, f, indent=2)

print(f"\nSaved ratings to {OUT_DIR / 'team_ratings.json'}")
print(f"\nTop 10 Elo:")
for team, r in list(output["elo_ratings"].items())[:10]:
    print(f"  {team:20s} {r}")
