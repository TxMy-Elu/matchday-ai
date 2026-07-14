"""
Matchday AI — tournament state detection
=========================================
Derives the current 2026 World Cup bracket state (group stage results +
knockout progress) directly from results.csv/shootouts.csv, rather than
hand-coding the bracket. Used by train.py; kept separate from the Elo/Poisson
model-fitting pipeline since it's a different kind of logic (deterministic
data shaping, not statistical estimation) that can change on its own
schedule (e.g. a new round appearing in the data) independent of retraining.

Bracket detection rule: each team's 4th WC2026 fixture is their Round-of-32
match, 5th is Round-of-16, 6th QF, 7th SF, 8th Final (matches 1-3 are the
group stage — the dataset already encodes who advanced, so group standings/
tiebreaks don't need to be re-derived). A round is only "known" once the
fixture already exists in results.csv, which is only true once both
participants are determined.

A team's 8th fixture isn't always the Final, though: the two Semifinal
*losers* play each other in the third-place match instead, on the same
"8th fixture" index. Since both participants of a given idx-8 match always
share the same fate (both won their SF, or both lost it), we can tell the
two apart once their SF match has been played by checking whether the team
is a recorded SF loser.
"""
import pandas as pd

ROUND_NAMES = {4: "R32", 5: "R16", 6: "QF", 7: "SF", 8: "F"}


def _match_order(wc26_sorted: pd.DataFrame) -> dict:
    """team -> list of row positional indices in wc26_sorted, chronological."""
    order = {}
    for i, row in enumerate(wc26_sorted.itertuples(index=False)):
        order.setdefault(row.home_team, []).append(i)
        order.setdefault(row.away_team, []).append(i)
    return order


def _shootout_winner(shootouts: pd.DataFrame, date, home, away):
    m = shootouts[(shootouts["date"] == date) & (shootouts["home_team"] == home) & (shootouts["away_team"] == away)]
    return m.iloc[0]["winner"] if len(m) else None


def build_tournament_state(wc26: pd.DataFrame, shootouts: pd.DataFrame) -> tuple[dict, list]:
    """
    Returns (knockout_bracket, all_matches):
      - knockout_bracket: {round_name: {"decided": [...], "remaining": [...]}}
        for R32 through the Final. A round with both lists empty simply isn't
        determined yet (its participants depend on an earlier round finishing).
      - all_matches: every WC2026 match (group stage + knockout), chronological,
        each tagged with its round and (if played) score/winner.
    """
    wc26_sorted = wc26.sort_values("date").reset_index(drop=True)
    order = _match_order(wc26_sorted)

    knockout_bracket = {r: {"decided": [], "remaining": []} for r in list(ROUND_NAMES.values()) + ["TP"]}
    all_matches = []
    sf_losers = set()

    for i, row in enumerate(wc26_sorted.itertuples(index=False)):
        idx_home = order[row.home_team].index(i) + 1
        idx_away = order[row.away_team].index(i) + 1
        round_name = "Group Stage" if idx_home < 4 else ROUND_NAMES.get(idx_home, f"Match {idx_home}")
        if idx_home == 8 and idx_home == idx_away and (row.home_team in sf_losers or row.away_team in sf_losers):
            round_name = "TP"
        played = bool(pd.notna(row.home_score))

        base = {
            "date": str(row.date.date()), "home_team": row.home_team, "away_team": row.away_team,
            "city": row.city, "country": row.country,
        }

        winner = None
        if played and round_name not in ("Group Stage",):
            if row.home_score > row.away_score:
                winner = row.home_team
            elif row.home_score < row.away_score:
                winner = row.away_team
            else:
                winner = _shootout_winner(shootouts, row.date, row.home_team, row.away_team) or row.home_team

        if round_name == "SF" and played and winner:
            sf_losers.add(row.away_team if winner == row.home_team else row.home_team)

        if idx_home == idx_away and idx_home >= 4 and round_name in knockout_bracket:
            if played:
                knockout_bracket[round_name]["decided"].append({
                    **base, "home_score": int(row.home_score), "away_score": int(row.away_score), "winner": winner,
                })
            else:
                knockout_bracket[round_name]["remaining"].append(base)

        entry = {**base, "round": round_name, "played": played}
        if played:
            entry["home_score"] = int(row.home_score)
            entry["away_score"] = int(row.away_score)
            if winner:
                entry["winner"] = winner
        all_matches.append(entry)

    return knockout_bracket, all_matches


# ---------------------------------------------------------------------------
# Full 31-slot bracket tree (16 R32 -> 8 R16 -> 4 QF -> 2 SF -> 1 Final),
# including slots whose participants aren't determined yet.
#
# The only externally-sourced fact here is the Round of 32 bracket order —
# fixed once the group stage draw locked in, so it's hardcoded rather than
# scraped on every run. Source: Wikipedia "2026 FIFA World Cup knockout
# stage" article, Bracket section, fetched 2026-07-01. Adjacent pairs
# advance to the same next-round slot (row 2i & 2i+1 of a round feed row i
# of the next round) — the standard bracket-sheet convention, and verified
# against every Round-of-16 pairing already confirmed in our own data
# (Paraguay-France, Canada-Morocco, Brazil-Norway all line up with rows
# 1&2, 3&4, 9&10 below). Every later round is derived purely from this
# pairing plus our own results.csv-derived scores — never from the external
# source's scores, so results.csv stays the single source of truth for
# who actually won.
# ---------------------------------------------------------------------------
R32_BRACKET_ORDER = [
    ("Germany", "Paraguay"), ("France", "Sweden"),
    ("South Africa", "Canada"), ("Netherlands", "Morocco"),
    ("Portugal", "Croatia"), ("Spain", "Austria"),
    ("United States", "Bosnia and Herzegovina"), ("Belgium", "Senegal"),
    ("Brazil", "Japan"), ("Ivory Coast", "Norway"),
    ("Mexico", "Ecuador"), ("England", "DR Congo"),
    ("Argentina", "Cape Verde"), ("Australia", "Egypt"),
    ("Switzerland", "Algeria"), ("Colombia", "Ghana"),
]

FULL_TREE_ROUNDS = ["R32", "R16", "QF", "SF", "F"]


def _find_match(knockout_round: dict, team_a: str, team_b: str):
    for m in knockout_round.get("decided", []) + knockout_round.get("remaining", []):
        if {m["home_team"], m["away_team"]} == {team_a, team_b}:
            return m
    return None


def build_full_bracket_tree(knockout_bracket: dict) -> list:
    """
    Returns [{"round": "R32", "matches": [...16]}, {"round": "R16", "matches": [...8]}, ...]
    down to the Final. A slot's home_team/away_team is None until the round
    that decides it is actually played; its score/winner come from
    `knockout_bracket` (i.e. results.csv), looked up once both teams are known.
    """
    r32 = knockout_bracket.get("R32", {"decided": [], "remaining": []})
    current = []
    for team_a, team_b in R32_BRACKET_ORDER:
        m = _find_match(r32, team_a, team_b)
        current.append({**m, "played": "home_score" in m} if m else
                        {"home_team": team_a, "away_team": team_b, "played": False})

    tree = [{"round": "R32", "matches": current}]

    for round_name in FULL_TREE_ROUNDS[1:]:
        next_round = []
        for i in range(0, len(current), 2):
            home_team = current[i].get("winner")
            away_team = current[i + 1].get("winner")
            match = {"home_team": home_team, "away_team": away_team, "played": False}
            if home_team and away_team:
                found = _find_match(knockout_bracket.get(round_name, {}), home_team, away_team)
                if found:
                    match = {**found, "played": "home_score" in found}
            next_round.append(match)
        tree.append({"round": round_name, "matches": next_round})
        current = next_round

    return tree


def build_third_place_match(bracket_tree: list, knockout_bracket: dict):
    """
    The two Semifinal *losers* play each other for third place — a separate
    match, not part of the single-elimination tree (which only tracks
    winners advancing). Returns None until both Semifinals are actually
    played (the third-place pairing doesn't exist before then), matching how
    every other not-yet-determined slot in the tree is represented.
    """
    sf_round = next((r for r in bracket_tree if r["round"] == "SF"), None)
    if not sf_round or len(sf_round["matches"]) != 2:
        return None

    losers = []
    for m in sf_round["matches"]:
        if not m.get("played") or not m.get("winner"):
            return None
        losers.append(m["away_team"] if m["winner"] == m["home_team"] else m["home_team"])

    home_team, away_team = losers
    match = {"home_team": home_team, "away_team": away_team, "played": False}
    found = _find_match(knockout_bracket.get("TP", {}), home_team, away_team)
    if found:
        match = {**found, "played": "home_score" in found}
    return match


# ---------------------------------------------------------------------------
# Group stage standings.
#
# The 12 groups aren't labeled in results.csv, so team -> group membership is
# hardcoded here (source: Wikipedia's 12 "2026 FIFA World Cup Group X"
# articles, fetched 2026-07-01) — fixed once the draw happened, same
# reasoning as R32_BRACKET_ORDER above. Cross-checked against this dataset:
# reconstructing groups from who-played-whom in the first 3 WC2026 fixtures
# gives the identical 12 groups of 4.
# ---------------------------------------------------------------------------
GROUP_TEAMS = {
    "A": ["Mexico", "South Africa", "South Korea", "Czech Republic"],
    "B": ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"],
    "C": ["Brazil", "Morocco", "Haiti", "Scotland"],
    "D": ["United States", "Paraguay", "Australia", "Turkey"],
    "E": ["Germany", "Curaçao", "Ivory Coast", "Ecuador"],
    "F": ["Netherlands", "Japan", "Sweden", "Tunisia"],
    "G": ["Belgium", "Egypt", "Iran", "New Zealand"],
    "H": ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"],
    "I": ["France", "Senegal", "Iraq", "Norway"],
    "J": ["Argentina", "Algeria", "Austria", "Jordan"],
    "K": ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
    "L": ["England", "Croatia", "Ghana", "Panama"],
}


def build_group_standings(wc26: pd.DataFrame) -> dict:
    """
    {group_letter: [{team, played, won, drawn, lost, goals_for,
    goals_against, goal_diff, points}, ...]}, sorted by points then goal
    difference then goals scored.

    Doesn't apply FIFA's full tiebreaker rules (head-to-head result, fair
    play points) — good enough to see who's through, but two teams shown
    level could in principle be ordered differently than the official table
    in a genuine tiebreak scenario.
    """
    played = wc26.dropna(subset=["home_score", "away_score"])
    standings = {}
    for letter, teams in GROUP_TEAMS.items():
        stats = {
            t: {"team": t, "played": 0, "won": 0, "drawn": 0, "lost": 0, "goals_for": 0, "goals_against": 0}
            for t in teams
        }
        team_set = set(teams)
        group_matches = played[played["home_team"].isin(team_set) & played["away_team"].isin(team_set)]
        for row in group_matches.itertuples(index=False):
            h, a = stats[row.home_team], stats[row.away_team]
            h["played"] += 1
            a["played"] += 1
            h["goals_for"] += int(row.home_score)
            h["goals_against"] += int(row.away_score)
            a["goals_for"] += int(row.away_score)
            a["goals_against"] += int(row.home_score)
            if row.home_score > row.away_score:
                h["won"] += 1
                a["lost"] += 1
            elif row.home_score < row.away_score:
                a["won"] += 1
                h["lost"] += 1
            else:
                h["drawn"] += 1
                a["drawn"] += 1

        table = list(stats.values())
        for s in table:
            s["goal_diff"] = s["goals_for"] - s["goals_against"]
            s["points"] = s["won"] * 3 + s["drawn"]
        table.sort(key=lambda s: (-s["points"], -s["goal_diff"], -s["goals_for"], s["team"]))
        standings[letter] = table
    return standings


# ---------------------------------------------------------------------------
# Upset feed: WC2026 matches where the lower-Elo team won outright, ranked
# by how big the Elo gap was. `elo_diff_lookup` comes from train.py's Elo
# loop — the *pre-match* effective Elo difference (home + home-advantage -
# away) for every played match, keyed by (date, home_team, away_team).
# ---------------------------------------------------------------------------
def build_upsets(all_matches: list, elo_diff_lookup: dict) -> list:
    upsets = []
    for m in all_matches:
        if not m["played"]:
            continue
        key = (m["date"], m["home_team"], m["away_team"])
        ed = elo_diff_lookup.get(key)
        if ed is None:
            continue
        if m["home_score"] > m["away_score"] and ed < 0:
            upsets.append({**m, "favorite": m["away_team"], "winner": m["home_team"], "elo_gap": round(-ed, 1)})
        elif m["away_score"] > m["home_score"] and ed > 0:
            upsets.append({**m, "favorite": m["home_team"], "winner": m["away_team"], "elo_gap": round(ed, 1)})
    upsets.sort(key=lambda u: -u["elo_gap"])
    return upsets
