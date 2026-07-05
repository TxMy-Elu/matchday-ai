"""
Matchday AI — Wikipedia results scraper
========================================
Standalone script, run manually (same philosophy as `train.py` and
`fetch_results.py`) — NOT wired into the FastAPI app.

Why this exists: API-Football's free tier only serves seasons 2022-2024
(current-season/2026 data needs a paid plan, see `fetch_results.py`'s
docstring for that investigation). Wikipedia's per-round World Cup articles
(e.g. "2026 FIFA World Cup round of 32") are free, CC-licensed, and updated
within minutes of a match ending, with match data in a consistent
`{{#invoke:Football box|main ...}}` template — good enough to scrape.

Trade-off: this only covers the World Cup itself (one Wikipedia page per
knockout round), not qualifiers/friendlies/other cups — API-Football would
cover those too, but only on a paid plan. Good enough for the immediate
need: no more manually googling scores during the tournament.

Usage:
    python -m app.fetch_wikipedia_results                  # Round of 32 only
    python -m app.fetch_wikipedia_results --pages "2026_FIFA_World_Cup_round_of_16"
    python -m app.fetch_wikipedia_results --dry-run

As new knockout rounds get their own Wikipedia article, add the page title
to DEFAULT_PAGES below (or pass --pages).

After running, retrain manually as usual:
    python -m app.train
This script does NOT auto-retrain, same reasoning as fetch_results.py.
"""
import argparse
import re
import sys
from pathlib import Path

import pandas as pd
import requests

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RESULTS_PATH = DATA_DIR / "results.csv"
SHOOTOUTS_PATH = DATA_DIR / "shootouts.csv"

USER_AGENT = "MatchdayAI-personal-project/1.0 (contact: to.doguet@gmail.com)"

DEFAULT_PAGES = [
    "2026_FIFA_World_Cup_round_of_32",
    # Later rounds (R16 onward) don't get their own dedicated article right
    # away — until they do, their match sections live on the umbrella
    # "knockout stage" page instead. Harmless to include even once a
    # dedicated page exists later: results already in results.csv are
    # deduped by (date, home, away).
    "2026_FIFA_World_Cup_knockout_stage",
]

# FIFA 3-letter codes (as used in Wikipedia's {{#invoke:flag|...}} templates)
# -> this dataset's team name (see frontend/src/flags.js for the canonical
# list of the 48 WC26 teams).
FIFA_CODE_TO_TEAM = {
    "ALG": "Algeria", "ARG": "Argentina", "AUS": "Australia", "AUT": "Austria",
    "BEL": "Belgium", "BIH": "Bosnia and Herzegovina", "BRA": "Brazil",
    "CAN": "Canada", "CPV": "Cape Verde", "COL": "Colombia", "CRO": "Croatia",
    "CUW": "Curaçao", "CZE": "Czech Republic", "COD": "DR Congo",
    "ECU": "Ecuador", "EGY": "Egypt", "ENG": "England", "FRA": "France",
    "GER": "Germany", "GHA": "Ghana", "HAI": "Haiti", "IRN": "Iran",
    "IRQ": "Iraq", "CIV": "Ivory Coast", "JPN": "Japan", "JOR": "Jordan",
    "MEX": "Mexico", "MAR": "Morocco", "NED": "Netherlands",
    "NZL": "New Zealand", "NOR": "Norway", "PAN": "Panama", "PAR": "Paraguay",
    "POR": "Portugal", "QAT": "Qatar", "KSA": "Saudi Arabia", "SCO": "Scotland",
    "SEN": "Senegal", "RSA": "South Africa", "KOR": "South Korea",
    "ESP": "Spain", "SWE": "Sweden", "SUI": "Switzerland", "TUN": "Tunisia",
    "TUR": "Turkey", "USA": "United States", "URU": "Uruguay",
    "UZB": "Uzbekistan",
}

# One match block, captured non-greedily between the football-box invoke
# and its matching closing "}}" (the `<section end=...>` marker is a
# reliable right-hand boundary since it immediately follows in every case
# observed).
MATCH_BLOCK_RE = re.compile(
    r"\{\{#invoke:[Ff]ootball box\|main(.*?)\}\}<section end=", re.DOTALL
)
FIELD_RE = re.compile(r"^\|\s*([a-zA-Z0-9]+)\s*=\s*(.*)$")


def fetch_wikitext(page_title: str) -> str:
    resp = requests.get(
        "https://en.wikipedia.org/w/index.php",
        params={"title": page_title, "action": "raw"},
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    if resp.status_code == 404:
        print(f"  Page '{page_title}' doesn't exist yet (likely round hasn't started) — skipping.")
        return ""
    resp.raise_for_status()
    return resp.text


def parse_field(block_text: str, name: str) -> str | None:
    for line in block_text.split("\n"):
        m = FIELD_RE.match(line.strip())
        if m and m.group(1) == name:
            return m.group(2).strip()
    return None


def extract_team_code(field_value: str) -> str | None:
    # e.g. "{{#invoke:flag|fb-rt|ENG}}" or "{{#invoke:flag|fb|COD}}"
    m = re.search(r"\{\{#invoke:flag\|[a-z-]+\|([A-Z]{3})\}\}", field_value or "")
    return m.group(1) if m else None


def clean_wikilink_text(raw: str) -> str:
    """[[Article|Display]] -> Display ; [[Article]] -> Article ; strip refs."""
    raw = re.sub(r"<ref.*?</ref>", "", raw, flags=re.DOTALL)
    m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", raw)
    if not m:
        return raw.strip()
    return (m.group(2) or m.group(1)).strip()


def parse_matches(wikitext: str, tournament_label: str = "FIFA World Cup") -> tuple[list, list]:
    result_rows, shootout_rows, unmatched = [], [], set()

    for match in MATCH_BLOCK_RE.finditer(wikitext):
        block = match.group(1)

        date_field = parse_field(block, "date")
        date_m = re.search(r"\{\{Start date\|(\d{4})\|(\d{1,2})\|(\d{1,2})", date_field or "")
        if not date_m:
            continue
        date = f"{date_m.group(1)}-{int(date_m.group(2)):02d}-{int(date_m.group(3)):02d}"

        team1_code = extract_team_code(parse_field(block, "team1") or "")
        team2_code = extract_team_code(parse_field(block, "team2") or "")
        if not team1_code or not team2_code:
            continue

        home = FIFA_CODE_TO_TEAM.get(team1_code)
        away = FIFA_CODE_TO_TEAM.get(team2_code)
        if not home:
            unmatched.add(team1_code)
        if not away:
            unmatched.add(team2_code)
        if not home or not away:
            continue

        score_field = parse_field(block, "score") or ""
        # Unplayed matches show e.g. "Match 80" as the score-link display
        # text; played ones show the actual "H–A" score (en dash).
        score_m = re.search(r"\|\s*(\d+)\s*[–-]\s*(\d+)\s*\}\}", score_field)
        if not score_m:
            continue  # not played yet
        home_score, away_score = int(score_m.group(1)), int(score_m.group(2))

        stadium_field = parse_field(block, "stadium") or ""
        city = ""
        if "," in stadium_field:
            city = clean_wikilink_text(stadium_field.split(",", 1)[1])

        result_rows.append({
            "date": date,
            "home_team": home,
            "away_team": away,
            "home_score": home_score,
            "away_score": away_score,
            "tournament": tournament_label,
            "city": city,
            "country": "",
            "neutral": True,
        })

        penalty_score = parse_field(block, "penaltyscore")
        if penalty_score:
            pen_m = re.search(r"(\d+)\s*[–-]\s*(\d+)", penalty_score)
            if pen_m:
                p1, p2 = int(pen_m.group(1)), int(pen_m.group(2))
                winner = home if p1 > p2 else away
                shootout_rows.append({
                    "date": date,
                    "home_team": home,
                    "away_team": away,
                    "winner": winner,
                    "first_shooter": home,  # not reliably parseable from the template; best-effort default
                })

    if unmatched:
        print(f"  WARNING: unrecognized FIFA team code(s), add to FIFA_CODE_TO_TEAM: {sorted(unmatched)}")

    return result_rows, shootout_rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", nargs="*", default=DEFAULT_PAGES,
                         help="Wikipedia page titles to scrape (underscores, as in the URL)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    existing = pd.read_csv(RESULTS_PATH, parse_dates=["date"])
    # Only matches that already have a real score count as "already have it" —
    # a placeholder fixture row (score still NA) must not block a real result
    # from being written in.
    played_existing = existing.dropna(subset=["home_score", "away_score"])
    existing_keys = set(
        zip(played_existing["date"].dt.strftime("%Y-%m-%d"), played_existing["home_team"], played_existing["away_team"])
    )

    all_new_results, all_new_shootouts = [], []
    for page in args.pages:
        print(f"Fetching {page}...")
        wikitext = fetch_wikitext(page)
        if not wikitext:
            continue
        results, shootouts = parse_matches(wikitext)
        all_new_results.extend(results)
        all_new_shootouts.extend(shootouts)

    new_results = [r for r in all_new_results if (r["date"], r["home_team"], r["away_team"]) not in existing_keys]
    new_shootouts = [
        s for s in all_new_shootouts if (s["date"], s["home_team"], s["away_team"]) not in existing_keys
    ]

    if not new_results:
        print("No new finished matches found.")
        return

    print(f"\nFound {len(new_results)} new result(s):")
    for row in new_results:
        print(f"  {row['date']}  {row['home_team']} {row['home_score']}-{row['away_score']} {row['away_team']}")

    if args.dry_run:
        print("\n--dry-run set: not writing any files.")
        return

    # Most "new" results actually match an existing placeholder fixture row
    # (score still NA) — update that row in place rather than appending a
    # duplicate. Only truly unseen fixtures (not yet in results.csv at all)
    # get appended.
    date_str = existing["date"].dt.strftime("%Y-%m-%d")
    unplayed_index = {
        (d, h, a): idx
        for idx, d, h, a, played in zip(existing.index, date_str, existing["home_team"], existing["away_team"], existing["home_score"].isna())
        if played
    }

    appended, updated_count = [], 0
    for row in new_results:
        key = (row["date"], row["home_team"], row["away_team"])
        if key in unplayed_index:
            idx = unplayed_index[key]
            existing.at[idx, "home_score"] = row["home_score"]
            existing.at[idx, "away_score"] = row["away_score"]
            updated_count += 1
        else:
            appended.append(row)

    results_df = pd.concat([existing, pd.DataFrame(appended)], ignore_index=True) if appended else existing
    results_df.to_csv(RESULTS_PATH, index=False)
    print(f"Updated {updated_count} placeholder row(s), appended {len(appended)} new row(s) to {RESULTS_PATH}")

    if new_shootouts:
        shootouts_df = pd.concat(
            [pd.read_csv(SHOOTOUTS_PATH), pd.DataFrame(new_shootouts)], ignore_index=True
        )
        shootouts_df.to_csv(SHOOTOUTS_PATH, index=False)
        print(f"Appended {len(new_shootouts)} shootout(s) to {SHOOTOUTS_PATH}")

    print("\nDone. Now run `python -m app.train` to recompute ratings.")


if __name__ == "__main__":
    main()
