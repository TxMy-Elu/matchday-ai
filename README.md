# Matchday AI — 2026 FIFA World Cup Predictor

Predicts the outcome of any matchup between two national teams: win / draw / loss
probabilities, expected goals, a full scoreline probability distribution, and —
new — Monte Carlo championship odds for the rest of the tournament.

Trained on `results.csv`: 49,481 international matches from 1872 to 2026.

---

## Why this modeling approach

**The short version:** Elo ratings + a Dixon-Coles-corrected Poisson goals model,
not a black-box classifier. This is the same family of approach used by
professional football analytics shops (Opta, FiveThirtyEight's old SPI model,
academic work going back to Maher 1982 and Dixon & Coles 1997), and it beats a
generic ML classifier here for a specific reason: **data sparsity at the
matchup level.**

Argentina and France have played each other a handful of times in 150 years.
A classifier trying to learn "Argentina vs France" as a labeled example has
almost nothing to learn from directly — it has to generalize from team-level
features anyway, at which point you're back to something like Elo. Meanwhile
exact scorelines (2-1, 3-0, 1-1…) are individually rare events; a classifier
trained to predict "2-1" as a class label will never see enough 2-1s between
any two specific teams to calibrate well. Goals, on the other hand, are counts
with a well-understood statistical distribution (Poisson), and *team strength*
is a smoothly-varying quantity that accumulates gradually over hundreds of
matches — which is exactly what Elo is built to estimate.

### The pipeline (see `backend/app/train.py`)

1. **Elo ratings, updated match-by-match, 1872 → today.**
   Every team starts at 1500 and gets updated after every match using the
   standard World Football Elo formula (the same methodology as
   [eloratings.net](https://www.eloratings.net)):
   - **K-factor scaled by tournament importance** — 60 for the World Cup
     finals, 50 for continental championships/Nations League, 40 for
     qualifiers, 20 for friendlies, 30 for everything else. A World Cup win
     should move the needle more than a friendly.
   - **Goal-difference multiplier** — winning 3-0 moves your rating more than
     winning 1-0.
   - **Home advantage** — +100 Elo points for the home team, zeroed out for
     matches flagged neutral in the data (which is almost every 2026 World
     Cup match played in the US/Mexico/Canada).
   - **Team name normalization** via `former_names.csv` so a team's rating
     history survives name changes (e.g. Ghana's Elo history includes its
     matches as "Gold Coast").

2. **Calibrated win/draw/loss probabilities.**
   Rather than hand-deriving a formula, a multinomial logistic regression is
   fit on the *entire* 49k-match history: outcome (H/D/A) as a function of
   the pre-match effective Elo difference. This means the draw probability
   isn't guessed — it's empirically what actually happens historically when
   two teams with a given rating gap play each other.

3. **Expected goals via two Poisson GLMs.**
   One regression predicts home goals, another predicts away goals, both as
   a function of the same Elo difference. This gives a smooth, well-behaved
   expected-goals estimate (λ, μ) for any matchup, including ones the two
   teams have never actually played.

4. **A full scoreline matrix, Dixon-Coles corrected.**
   Combining independent Poisson(λ) and Poisson(μ) gives P(any scoreline).
   Independent Poisson is well known to slightly mis-price low-scoring
   results (0-0, 1-0, 0-1, 1-1 are more/less correlated in reality than pure
   independence implies), so a correlation parameter ρ is fit by maximum
   likelihood (Dixon & Coles, 1997) and applied to correct exactly those four
   cells. The most probable cell in the corrected matrix is the "predicted
   scoreline"; the top 5 are shown as an odds board.

5. **Tournament bracket simulation (new).**
   `backend/app/bracket.py` runs a Monte Carlo simulation (20,000 trials) of
   the rest of the World Cup knockout stage. `train.py` auto-detects the
   current bracket state directly from the data — no hardcoding: each team's
   4th World Cup 2026 fixture is its Round-of-32 match, the 5th is Round of
   16, and so on, with draws resolved via `shootouts.csv`. Fixtures that are
   already scheduled in the data are simulated as real matchups; rounds whose
   participants aren't determined yet (because the data doesn't and can't
   contain a bracket tree for teams that haven't been decided) are resolved
   by randomly pairing that round's survivors, repeated 20,000 times. This is
   a standard technique for estimating title odds when the exact draw isn't
   fully known — the *relative* ranking of contenders is trustworthy, the
   exact percentages carry extra uncertainty from the randomization, and the
   UI says so explicitly.

### Why not deep learning / gradient boosting?

I considered it and rejected it for this problem, for a few concrete reasons:

- **49k matches sounds like a lot, but the effective sample size per matchup
  is tiny.** A gradient-boosted tree or neural net would need engineered
  team-strength features anyway (you can't one-hot-encode 336 teams and
  expect it to generalize to new matchups) — and once you're engineering an
  Elo-like strength feature as input, most of the benefit of the fancier
  model evaporates.
- **Calibration matters more than raw accuracy here.** The product shows
  probabilities, not just a predicted winner. Poisson/logistic models are
  *by construction* well-calibrated (that's what maximum likelihood fitting
  buys you); classifiers frequently aren't, and require a separate
  calibration step to be trustworthy as probabilities.
- **Interpretability.** Every number the API returns traces back to a
  formula you can check by hand (see the sanity checks below). That matters
  for a "why did it predict this" product, and it made this much faster to
  debug and trust than a black box would have been.
- **This is genuinely the industry-standard approach** for this exact
  problem — international football rating systems (Elo, and its cousins
  used by FIFA itself pre-2018) plus Poisson goal models are the backbone of
  most public football prediction tools.

### Validation sanity checks

A few outputs from the trained model, as a gut check:

| Matchup | Result |
|---|---|
| Argentina vs Panama (neutral) | 83% / 13% / 4% (H/D/A), predicted 3-0/3-1 |
| Brazil vs Germany (neutral) | 56% / 25% / 20%, predicted ~2-1 |
| France vs Spain (neutral) | 36% / 28% / 36% — near coin-flip, as it should be between two top-5 teams |
| New Zealand vs Argentina (neutral) | 3% / 12% / 85% |

These track intuition well: heavy favorites get correspondingly lopsided
odds, and genuinely close matchups between top teams land near 33/33/33
rather than the model overconfidently picking a winner.

---

## Architecture

```
matchday-ai/
├── backend/                  FastAPI service (Python)
│   ├── app/
│   │   ├── train.py          Offline training pipeline → team_ratings.json
│   │   ├── model.py          Loads ratings, computes predictions (no ML deps needed at request time)
│   │   ├── bracket.py        Monte Carlo knockout-stage simulator
│   │   └── main.py           API routes
│   ├── data/                 results.csv, former_names.csv, shootouts.csv
│   ├── ratings/
│   │   └── team_ratings.json Pretrained artifact (Elo ratings, model coefficients, bracket state)
│   └── requirements.txt
└── frontend/                 React + Vite + Tailwind
    └── src/
        ├── App.jsx            Tab shell + match predictor UI
        ├── BracketSimulator.jsx  Tournament Simulator tab
        ├── TeamPicker.jsx     Searchable team combobox
        └── flags.js           Team → flag emoji
```

**Backend: FastAPI.** Chosen for a typed, self-documenting API (auto Swagger
UI at `/docs`), async-ready performance, and because the model itself is pure
Python (scikit-learn / statsmodels for training, plain NumPy/math for
serving) — no need for a separate ML-serving stack. Training is a one-time
offline step (`train.py`); the API loads a small JSON file at startup and
serves predictions with simple closed-form math, so it's fast and has zero
ML-library dependency risk in production.

**Frontend: React + Vite + Tailwind.** A single-page app with two tabs: the
match predictor (pick any two teams, see a live prediction) and the
tournament simulator (championship odds + remaining fixtures). No router
needed for two tabs; Vite for fast local dev; Tailwind for the design system.

**Design direction:** a "night match" aesthetic — near-black pitch-green
background, amber floodlight accent, condensed display type for headers, and
a scoreboard-style LED digit readout for the predicted scoreline as the
signature visual element. Team win/draw/loss odds render as glowing
floodlight-beam bars; the "odds board" and bracket leaderboard borrow from
real stadium scoreboard and betting-board conventions.

---

## Running it

### 1. Backend

```bash
cd backend
pip install -r requirements.txt

# (Re)train the model — regenerates backend/ratings/team_ratings.json.
# Only needed once, or after updating backend/data/results.csv.
python -m app.train

# Start the API (http://localhost:8000, docs at /docs)
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173, proxies /api to the backend on :8000
```

Open `http://localhost:5173`. The dev server proxies `/api/*` to the FastAPI
backend on port 8000 (see `vite.config.js`), so both need to be running.

> The header/scoreboard typefaces (Anton, JetBrains Mono) load from Google
> Fonts — you'll need internet access the first time the frontend loads. For
> a fully offline setup, self-host the font files and update `index.html`.

### 3. Production build

```bash
cd frontend && npm run build   # outputs static files to frontend/dist
```
Serve `frontend/dist` with any static host, pointed at a deployed instance of
the FastAPI backend (update `API_BASE` / the Vite proxy target accordingly).

---

## API reference

| Endpoint | Description |
|---|---|
| `GET /api/teams` | The 48 World Cup 2026 teams with current Elo rating |
| `GET /api/fixtures` | Known future World Cup 2026 fixtures in the data |
| `GET /api/predict?home=X&away=Y&neutral=true` | Full prediction: W/D/L, expected goals, scoreline matrix, recent form |
| `GET /api/bracket?refresh=false` | Monte Carlo championship odds + remaining Round of 32 predictions |
| `GET /api/health` | Liveness check |

Interactive docs: `http://localhost:8000/docs`.

---

## Limitations & honest caveats

- **Elo captures long-run team strength, not squad news.** It doesn't know
  about injuries, suspensions, a manager change, or that a team is missing
  its best striker for this specific match. It's a form/history-based model,
  not a live-news-aware one.
- **The Round of 32 predictions are model-direct; later-round odds are
  approximated.** The exact knockout bracket beyond the next scheduled round
  doesn't exist in the source data — because it *can't*, until earlier
  results are known. The bracket simulator handles this by randomizing later
  pairings across 20,000 simulated tournaments rather than guessing a single
  fake bracket, but this means the championship percentages have wider
  uncertainty than the Round of 32 numbers, even though the relative
  ranking of contenders is reliable.
- **Extra time / penalties are modeled as roughly a coin flip** with a small
  Elo-based nudge, which is a simplification — penalty shootouts are
  famously close to random regardless of team quality.
- **Small samples for weaker/newer footballing nations** mean their Elo
  ratings are noisier; the model will be most confident about frequently-
  playing, well-established national teams.
- **This is a probabilistic model for entertainment and analysis, not
  betting advice.** Even a well-calibrated 85% favorite loses 15% of the
  time — that's the nature of football.
