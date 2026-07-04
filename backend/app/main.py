"""
Matchday AI — FastAPI service.

Endpoints:
  GET  /api/teams              -> list of the 48 World Cup 2026 teams (+ Elo)
  GET  /api/fixtures           -> remaining/known 2026 World Cup fixtures
  GET  /api/results            -> every 2026 World Cup match (group + knockout), played or not
  GET  /api/bracket-tree       -> the full 31-slot knockout tree (R32 through the Final)
  GET  /api/group-standings    -> the 12 group tables (points, GD, goals)
  GET  /api/upsets             -> WC2026 results where the lower-Elo team won, ranked by Elo gap
  GET  /api/predict?home=&away=&neutral=  -> full prediction for a matchup
  GET  /api/health             -> liveness check
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .model import MatchdayModel
from .bracket import BracketSimulator, ROUND_LABELS

app = FastAPI(
    title="Matchday AI",
    description="Elo + Poisson-based predictor for 2026 FIFA World Cup matchups.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model = MatchdayModel()


class Team(BaseModel):
    name: str
    elo: float


@app.get("/api/health")
def health():
    return {"status": "ok", "teams_loaded": len(model.elo), "generated_at": model.data["generated_at"]}


@app.get("/api/teams", response_model=list[Team])
def get_teams():
    """The 48 teams competing in the 2026 FIFA World Cup, with current Elo."""
    teams = [{"name": t, "elo": model.elo_of(t)} for t in model.wc26_teams]
    teams.sort(key=lambda t: -t["elo"])
    return teams


@app.get("/api/fixtures")
def get_fixtures():
    """
    Known 2026 World Cup fixtures still to be played, plus matchups already
    fixed by the bracket (both teams won their previous round) even though
    the source data hasn't recorded an official date for them yet — those
    are flagged `projected: true`.
    """
    return model.future_fixtures + model.projected_fixtures


@app.get("/api/results")
def get_results():
    """Every 2026 World Cup match (group stage + knockout), in chronological order.

    Each entry has `played: bool`; played entries carry scores (and a
    `winner` for knockout matches, resolved via shootouts.csv if level).
    """
    return model.wc2026_matches


@app.get("/api/bracket-tree")
def get_bracket_tree():
    """
    The full 31-slot knockout tree: 16 Round-of-32 matches, then 8/4/2/1
    for R16/QF/SF/Final. Every slot is always present — undetermined ones
    just have `home_team`/`away_team` as null until the round before them
    decides who advances. Scores/winners always come from our own
    results.csv, never guessed (see tournament.py for how the tree topology
    itself is sourced).
    """
    return model.bracket_tree


@app.get("/api/group-standings")
def get_group_standings():
    """
    The 12 group tables (points, goal difference, goals scored), sorted the
    same way a real standings table would be. Doesn't apply FIFA's full
    tiebreaker rules (head-to-head, fair play) — see tournament.py.
    """
    return model.group_standings


@app.get("/api/upsets")
def get_upsets():
    """
    WC2026 matches where the lower-Elo team won outright, ranked by how big
    the pre-match Elo gap was — the biggest surprises of the tournament so far.
    """
    return model.upsets


@app.get("/api/predict")
def predict(
    home: str = Query(..., description="Home (or first) team name"),
    away: str = Query(..., description="Away (or second) team name"),
    neutral: bool = Query(True, description="Neutral venue? (true for almost all 2026 WC knockout matches)"),
):
    if not model.has_team(home):
        raise HTTPException(status_code=404, detail=f"Unknown team: '{home}'")
    if not model.has_team(away):
        raise HTTPException(status_code=404, detail=f"Unknown team: '{away}'")
    if home == away:
        raise HTTPException(status_code=400, detail="Home and away team must differ")

    return model.predict(home, away, neutral=neutral)


# Simple in-process cache: the simulation is randomized but converges to
# stable odds at a few thousand trials, and re-running it from scratch on
# every page load is wasteful. Recomputed lazily on first request.
_bracket_cache = {"result": None}


@app.get("/api/bracket")
def bracket_simulation(refresh: bool = Query(False, description="Force a fresh Monte Carlo run")):
    """
    Simulates the rest of the 2026 World Cup knockout stage.

    `current_round`/`current_round_label` always reflect whichever round is
    actually next to be played (R32 until it's fully played, then R16, then
    QF, etc.) — this used to be hardcoded to Round of 32, which went stale
    and mislabeled the UI once that round finished. Rounds beyond that are
    resolved with randomized pairings across many trials (see bracket.py for
    the full rationale) — so championship_odds is directionally reliable,
    not an exact bracket.
    """
    if _bracket_cache["result"] is None or refresh:
        sim = BracketSimulator(model, n_simulations=20000, seed=None if refresh else 42)
        current = sim.current_round()
        _bracket_cache["result"] = {
            "current_round": current,
            "current_round_label": ROUND_LABELS.get(current),
            "current_round_fixtures": sim.round_probabilities(current) if current else [],
            "championship_odds": sim.simulate(),
            "n_simulations": sim.n_simulations,
            "note": (
                f"{ROUND_LABELS.get(current, 'Next round')} odds are direct model predictions. "
                "Rounds beyond that use randomized bracket pairings averaged over 20,000 "
                "simulated tournaments, since the real bracket tree doesn't exist in the "
                "data until earlier rounds are actually played."
            ),
        }
    return _bracket_cache["result"]
