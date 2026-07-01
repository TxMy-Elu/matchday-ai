"""
Matchday AI — automated results fetcher
========================================
Standalone script, run manually (mirrors `train.py`'s workflow) — this is
NOT wired into the FastAPI app and does not run on every request. It exists
to remove the manual "search the web for scores" step: it calls the
API-Football (api-sports.io) API, finds newly finished international
matches not yet in `results.csv`, and appends them.

Covers all international competitions present in the dataset (World Cup,
qualifiers, Euro, Copa América, AFCON, Nations League, friendlies, etc.),
not just the World Cup — the dataset already tracks all of these.

Usage:
    python -m app.fetch_results                # fetch last 3 days, append
    python -m app.fetch_results --days 10       # look back further
    python -m app.fetch_results --dry-run       # print what would be added, don't write

Requires an API-Football key (free tier: 100 req/day) in the environment
as API_FOOTBALL_KEY, e.g. via a `.env` file in `backend/` (see `.env.example`).
Sign up at https://www.api-football.com/ or https://rapidapi.com/api-sports/api/api-football

After running this, retrain manually as usual:
    python -m app.train
This script deliberately does NOT auto-retrain — keeping "fetch new data"
and "recompute ratings" as separate manual steps, same as the existing
results.csv-editing workflow described in CLAUDE.md.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import pandas as pd
import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv is optional; env vars can be set another way

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
LEAGUE_MAP_PATH = DATA_DIR / "api_football_league_map.json"
RESULTS_PATH = DATA_DIR / "results.csv"
SHOOTOUTS_PATH = DATA_DIR / "shootouts.csv"

API_BASE = "https://v3.football.api-sports.io"

# Dataset tournament label -> (match mode, [names/substrings]) to match
# against API-Football league names (case-insensitive). "exact" avoids
# accidentally sweeping in Women's/U20/Beach/Futsal variants that also
# contain the same words (e.g. "World Cup" substring-matches ~18 leagues,
# only 1 of which is the senior men's tournament we want). "contains" is
# used only for qualification labels, where we deliberately want every
# confederation's sub-league (they share a common substring by design).
TOURNAMENT_LEAGUE_QUERIES = {
    "FIFA World Cup": ("exact", ["World Cup"]),
    "FIFA World Cup qualification": ("contains", ["World Cup - Qualification"]),
    "UEFA Euro": ("exact", ["Euro Championship"]),
    "UEFA Euro qualification": ("exact", ["Euro Championship - Qualification"]),
    "Copa América": ("exact", ["Copa America"]),
    "African Cup of Nations": ("exact", ["Africa Cup of Nations"]),
    "African Cup of Nations qualification": ("exact", ["Africa Cup of Nations - Qualification"]),
    "AFC Asian Cup": ("exact", ["Asian Cup"]),
    "AFC Asian Cup qualification": ("exact", ["Asian Cup - Qualification"]),
    "UEFA Nations League": ("exact", ["UEFA Nations League"]),
    "CONCACAF Nations League": ("exact", ["CONCACAF Nations League"]),
    "Gold Cup": ("exact", ["Gold Cup", "CONCACAF Gold Cup"]),
    "Friendly": ("exact", ["Friendlies"]),
}

# API-Football team names that differ from this dataset's naming. Extend
# this as you hit unmatched-team warnings — matching is deliberately loud
# (prints a warning) rather than silently dropping or guessing.
TEAM_NAME_ALIASES = {
    "USA": "United States",
    "IR Iran": "Iran",
    "Türkiye": "Turkey",
    "Turkiye": "Turkey",
    "South Korea Republic": "South Korea",
    "Korea Republic": "South Korea",
    "Korea DPR": "North Korea",
    "Congo DR": "DR Congo",
    "DR Congo": "DR Congo",
    "Cape Verde Islands": "Cape Verde",
    "Bosnia": "Bosnia and Herzegovina",
    "St Kitts and Nevis": "Saint Kitts and Nevis",
    "St Vincent and the Grenadines": "Saint Vincent and the Grenadines",
    "St Lucia": "Saint Lucia",
    "US Virgin Islands": "United States Virgin Islands",
}


def _headers():
    key = os.environ.get("API_FOOTBALL_KEY")
    if not key:
        sys.exit(
            "API_FOOTBALL_KEY not set. Put it in backend/.env (see .env.example) "
            "or export it in your shell before running this script."
        )
    return {"x-apisports-key": key}


def normalize_team(name: str) -> str:
    return TEAM_NAME_ALIASES.get(name, name)


def resolve_league_map(force: bool = False) -> dict:
    """Map dataset tournament labels -> list of API-Football league IDs.

    Cached to disk after first resolution so we don't burn API quota on
    every run just to re-discover the same IDs.
    """
    if LEAGUE_MAP_PATH.exists() and not force:
        return json.loads(LEAGUE_MAP_PATH.read_text())

    print("Resolving API-Football league IDs (first run only, cached after)...")
    resp = requests.get(f"{API_BASE}/leagues", headers=_headers(), timeout=30)
    resp.raise_for_status()
    all_leagues = resp.json()["response"]

    league_map = {}
    for tournament, (mode, queries) in TOURNAMENT_LEAGUE_QUERIES.items():
        ids = []
        for entry in all_leagues:
            league_name = entry["league"]["name"]
            if mode == "exact":
                matched = any(q.lower() == league_name.lower() for q in queries)
            else:
                matched = any(q.lower() in league_name.lower() for q in queries)
            if matched:
                ids.append(entry["league"]["id"])
        if not ids:
            print(f"  WARNING: no API-Football league found for '{tournament}' "
                  f"(tried: {queries}) — will be skipped.")
        league_map[tournament] = sorted(set(ids))

    LEAGUE_MAP_PATH.write_text(json.dumps(league_map, indent=2))
    print(f"Saved league map to {LEAGUE_MAP_PATH}")
    return league_map


def fetch_fixtures_for_league(league_id: int, date_from: str, date_to: str) -> list:
    for attempt in range(3):
        resp = requests.get(
            f"{API_BASE}/fixtures",
            headers=_headers(),
            params={"league": league_id, "from": date_from, "to": date_to, "timezone": "UTC"},
            timeout=30,
        )
        if resp.status_code == 429:
            wait = 20 * (attempt + 1)
            print(f"  Rate limited, waiting {wait}s before retry...")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()["response"]
    resp.raise_for_status()
    return []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=3, help="How many days back to check for finished matches")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be added without writing files")
    parser.add_argument("--refresh-league-map", action="store_true", help="Re-resolve league IDs instead of using the cache")
    args = parser.parse_args()

    date_to = pd.Timestamp.now("UTC").normalize()
    date_from = date_to - pd.Timedelta(days=args.days)

    league_map = resolve_league_map(force=args.refresh_league_map)

    existing = pd.read_csv(RESULTS_PATH, parse_dates=["date"])
    existing_keys = set(
        zip(existing["date"].dt.strftime("%Y-%m-%d"), existing["home_team"], existing["away_team"])
    )
    known_teams = set(existing["home_team"]) | set(existing["away_team"])

    new_result_rows = []
    new_shootout_rows = []
    unmatched_teams = set()

    for tournament, league_ids in league_map.items():
        for league_id in league_ids:
            time.sleep(6.5)  # free-tier is rate-limited to ~10 req/min, not just 100/day
            fixtures = fetch_fixtures_for_league(
                league_id, date_from.strftime("%Y-%m-%d"), date_to.strftime("%Y-%m-%d")
            )
            for fx in fixtures:
                status = fx["fixture"]["status"]["short"]
                if status not in ("FT", "AET", "PEN"):
                    continue  # not finished yet

                date = fx["fixture"]["date"][:10]
                home = normalize_team(fx["teams"]["home"]["name"])
                away = normalize_team(fx["teams"]["away"]["name"])
                city = (fx["fixture"]["venue"].get("city") or "").strip()
                country = fx["league"].get("country", "")

                if (date, home, away) in existing_keys:
                    continue  # already have it

                if home not in known_teams:
                    unmatched_teams.add(home)
                if away not in known_teams:
                    unmatched_teams.add(away)

                # Regulation/ET score (before penalties), matching how this
                # dataset already records shootout games (e.g. Germany 1-1
                # Paraguay, Paraguay in shootouts.csv).
                home_score = fx["score"]["fulltime"]["home"]
                away_score = fx["score"]["fulltime"]["away"]
                if home_score is None:
                    # some feeds only populate extratime when it went there
                    home_score = fx["score"]["extratime"]["home"]
                    away_score = fx["score"]["extratime"]["away"]

                if home_score is None or away_score is None:
                    print(f"  Skipping {home} vs {away} on {date}: no score in API response")
                    continue

                neutral = fx["fixture"]["venue"].get("city") is not None and tournament != "Friendly"

                new_result_rows.append({
                    "date": date,
                    "home_team": home,
                    "away_team": away,
                    "home_score": home_score,
                    "away_score": away_score,
                    "tournament": tournament,
                    "city": city,
                    "country": country,
                    "neutral": neutral,
                })

                if status == "PEN":
                    penalty_winner_side = fx["teams"]["home"]["winner"]
                    winner = home if penalty_winner_side else away
                    new_shootout_rows.append({
                        "date": date,
                        "home_team": home,
                        "away_team": away,
                        "winner": winner,
                        "first_shooter": home,  # API-Football doesn't expose who shot first; best-effort default
                    })

    if unmatched_teams:
        print(f"WARNING: unrecognized team names, check TEAM_NAME_ALIASES: {sorted(unmatched_teams)}")

    if not new_result_rows:
        print("No new finished matches found.")
        return

    print(f"Found {len(new_result_rows)} new result(s):")
    for row in new_result_rows:
        print(f"  {row['date']}  {row['home_team']} {row['home_score']}-{row['away_score']} {row['away_team']}  ({row['tournament']})")

    if args.dry_run:
        print("\n--dry-run set: not writing any files.")
        return

    results_df = pd.concat([existing, pd.DataFrame(new_result_rows)], ignore_index=True)
    results_df.to_csv(RESULTS_PATH, index=False)
    print(f"Appended to {RESULTS_PATH}")

    if new_shootout_rows:
        shootouts_df = pd.concat(
            [pd.read_csv(SHOOTOUTS_PATH), pd.DataFrame(new_shootout_rows)], ignore_index=True
        )
        shootouts_df.to_csv(SHOOTOUTS_PATH, index=False)
        print(f"Appended {len(new_shootout_rows)} shootout(s) to {SHOOTOUTS_PATH}")

    print("\nDone. Now run `python -m app.train` to recompute ratings.")


if __name__ == "__main__":
    main()
