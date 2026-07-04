"""
Matchday AI — knockout bracket simulator.

Simulates the rest of the 2026 World Cup knockout stage. Rounds that are
already scheduled in the data (fully known pairings) are simulated exactly
as they'll be played. Rounds that don't exist yet in the data (their
participants depend on earlier results) are resolved by pairing that
round's survivors at random and simulating a match — repeated across many
trials so the law of large numbers converges on stable championship odds.

This is a deliberate approximation: the *true* FIFA bracket tree beyond the
already-scheduled fixtures isn't recoverable from the results data (it
doesn't exist yet, by definition, until earlier rounds are actually played).
Randomizing later-round pairings is the standard way to estimate title odds
without that information — the relative ranking of contenders is reliable,
the exact percentages carry extra uncertainty from the randomization.
"""
import random
from collections import defaultdict
from functools import lru_cache

from .model import MatchdayModel

ROUND_ORDER = ["R32", "R16", "QF", "SF", "F"]
ROUND_LABELS = {"R32": "Round of 32", "R16": "Round of 16", "QF": "Quarterfinals", "SF": "Semifinals", "F": "Final"}


class BracketSimulator:
    def __init__(self, model: MatchdayModel, n_simulations: int = 20000, seed: int | None = None):
        self.model = model
        self.n_simulations = n_simulations
        self._rng = random.Random(seed)
        self.bracket = model.data.get("knockout_bracket", {})
        self._prob_cache: dict[tuple, float] = {}

    def _knockout_win_prob(self, a: str, b: str) -> float:
        """P(a advances) in a single-elimination match (extra time + penalties on a draw).
        Memoized since the probability only depends on the (static) Elo ratings of a and b.
        """
        key = (a, b)
        if key in self._prob_cache:
            return self._prob_cache[key]
        wdl = self.model.outcome_only(a, b, neutral=True)
        pens_a = self.model.penalty_shootout_prob(a, b)
        p = wdl["home_win"] + wdl["draw"] * pens_a
        self._prob_cache[key] = p
        self._prob_cache[(b, a)] = 1 - p
        return p

    def remaining_round32(self):
        return [(m["home_team"], m["away_team"]) for m in self.bracket.get("R32", {}).get("remaining", [])]

    def already_through(self):
        """Teams that have already won their Round-of-32 match."""
        return [m["winner"] for m in self.bracket.get("R32", {}).get("decided", [])]

    def fixed_pairs(self, round_name: str):
        """Already-scheduled pairings for a round beyond R32 (e.g. R16 fixtures set once both teams are known)."""
        return [
            (m["home_team"], m["away_team"])
            for m in self.bracket.get(round_name, {}).get("remaining", [])
        ]

    def current_round(self) -> str | None:
        """The earliest round (in ROUND_ORDER) that still has unplayed fixtures
        with both participants known. None once every knowable fixture is
        played (i.e. we're waiting on an earlier round to finish before the
        next round's pairings even exist)."""
        for r in ROUND_ORDER:
            if self.bracket.get(r, {}).get("remaining"):
                return r
        return None

    def round_probabilities(self, round_name: str):
        """Advance probability for each remaining fixture in the given round —
        generalizes round32_probabilities() to whichever round is current, so
        the UI doesn't keep pointing at Round of 32 once it's fully played."""
        out = []
        for m in self.bracket.get(round_name, {}).get("remaining", []):
            a, b = m["home_team"], m["away_team"]
            p = self._knockout_win_prob(a, b)
            out.append({"home_team": a, "away_team": b, "home_advance_prob": round(p, 4), "away_advance_prob": round(1 - p, 4)})
        return out

    def simulate(self):
        champion_count = defaultdict(int)
        finalist_count = defaultdict(int)
        semifinalist_count = defaultdict(int)
        quarterfinalist_count = defaultdict(int)

        remaining_r32 = self.remaining_round32()
        already = self.already_through()
        fixed_r16 = self.fixed_pairs("R16")
        fixed_r16_teams = {t for pair in fixed_r16 for t in pair}

        for _ in range(self.n_simulations):
            # Resolve remaining Round of 32
            survivors = list(already)
            for a, b in remaining_r32:
                p = self._knockout_win_prob(a, b)
                survivors.append(a if self._rng.random() < p else b)

            # Round of 16: honor any already-fixed pairings, randomize the rest
            pool = [t for t in survivors if t not in fixed_r16_teams]
            self._rng.shuffle(pool)
            r16_pairs = list(fixed_r16) + [(pool[i], pool[i + 1]) for i in range(0, len(pool) - 1, 2)]

            quarterfinalists = self._play_round(r16_pairs)
            for t in quarterfinalists:
                quarterfinalist_count[t] += 1

            pool = list(quarterfinalists)
            self._rng.shuffle(pool)
            qf_pairs = [(pool[i], pool[i + 1]) for i in range(0, len(pool) - 1, 2)]
            semifinalists = self._play_round(qf_pairs)
            for t in semifinalists:
                semifinalist_count[t] += 1

            pool = list(semifinalists)
            self._rng.shuffle(pool)
            sf_pairs = [(pool[i], pool[i + 1]) for i in range(0, len(pool) - 1, 2)]
            finalists = self._play_round(sf_pairs)
            for t in finalists:
                finalist_count[t] += 1

            champ = self._play_round([tuple(finalists)])[0]
            champion_count[champ] += 1

        n = self.n_simulations
        teams = set(champion_count) | set(finalist_count) | set(semifinalist_count) | set(quarterfinalist_count)
        rows = []
        for t in teams:
            rows.append({
                "team": t,
                "elo": self.model.elo_of(t),
                "champion_prob": round(champion_count.get(t, 0) / n, 4),
                "finalist_prob": round(finalist_count.get(t, 0) / n, 4),
                "semifinalist_prob": round(semifinalist_count.get(t, 0) / n, 4),
                "quarterfinalist_prob": round(quarterfinalist_count.get(t, 0) / n, 4),
            })
        rows.sort(key=lambda r: -r["champion_prob"])
        return rows

    def _play_round(self, pairs):
        winners = []
        for pair in pairs:
            if len(pair) == 1:
                winners.append(pair[0])
                continue
            a, b = pair
            p = self._knockout_win_prob(a, b)
            winners.append(a if self._rng.random() < p else b)
        return winners
