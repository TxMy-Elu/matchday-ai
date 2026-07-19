"""
Matchday AI — temporal backtest
================================
Answers the only question that matters for a probabilistic model: when it says
70%, does it happen 70% of the time?

Method
------
Elo is walked chronologically over the full history (each match's elo_diff is
recorded before that match's own result is applied, so it only ever reflects
pre-kickoff information). The rows are then split on a cutoff date:

    train: everything before  --cutoff   -> fits the logit, the Poisson GLMs, rho
    test:  everything on/after --cutoff  -> never seen by any fitted coefficient

A random split would leak the future into the past through the Elo ratings —
a team's 2010 rating already embeds its 2015 matches — and would produce a
flattering, meaningless number. Hence the temporal split.

Baselines are reported alongside, because a log-loss without a baseline says
nothing: the question is never "is 0.98 good" but "is 0.98 better than what
you get for free".

Usage
-----
    python -m app.evaluate                     # cutoff defaults to 2018-01-01
    python -m app.evaluate --cutoff 2014-01-01
    python -m app.evaluate --json metrics.json
"""
import argparse
import json
import math

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
import statsmodels.api as sm

from .elo import load_results, run_elo

CLASSES = ["A", "D", "H"]  # sklearn sorts them this way; fixed here for clarity
MAX_GOALS = 8


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
def log_loss(probs: np.ndarray, y_idx: np.ndarray) -> float:
    """Multiclass log-loss. Lower is better. Uniform 1/3 guessing = 1.0986."""
    p = np.clip(probs[np.arange(len(y_idx)), y_idx], 1e-15, 1.0)
    return float(-np.mean(np.log(p)))


def brier(probs: np.ndarray, y_idx: np.ndarray) -> float:
    """Multiclass Brier score (sum of squared error over the 3 classes,
    averaged). Lower is better. Uniform guessing = 0.6667."""
    onehot = np.zeros_like(probs)
    onehot[np.arange(len(y_idx)), y_idx] = 1.0
    return float(np.mean(np.sum((probs - onehot) ** 2, axis=1)))


def accuracy(probs: np.ndarray, y_idx: np.ndarray) -> float:
    return float(np.mean(np.argmax(probs, axis=1) == y_idx))


def calibration_table(probs: np.ndarray, y_idx: np.ndarray, n_bins: int = 10) -> list:
    """Reliability table over every (match, class) probability emitted.

    For each bin of predicted probability, report how often the event actually
    happened. A well-calibrated model has predicted ~= observed in every bin.
    """
    flat_p = probs.ravel()
    onehot = np.zeros_like(probs)
    onehot[np.arange(len(y_idx)), y_idx] = 1.0
    flat_y = onehot.ravel()

    edges = np.linspace(0.0, 1.0, n_bins + 1)
    rows = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (flat_p >= lo) & (flat_p < hi if hi < 1.0 else flat_p <= hi)
        if mask.sum() == 0:
            continue
        rows.append({
            "bin": f"{lo:.0%}-{hi:.0%}",
            "n": int(mask.sum()),
            "predicted": float(flat_p[mask].mean()),
            "observed": float(flat_y[mask].mean()),
        })
    return rows


def expected_calibration_error(cal_rows: list) -> float:
    """Weighted mean gap between predicted and observed across bins."""
    total = sum(r["n"] for r in cal_rows)
    return float(sum(r["n"] * abs(r["predicted"] - r["observed"]) for r in cal_rows) / total)


# ---------------------------------------------------------------------------
# Models under test
# ---------------------------------------------------------------------------
def fit_outcome_model(train: pd.DataFrame) -> LogisticRegression:
    clf = LogisticRegression(max_iter=1000)
    clf.fit(train[["elo_diff"]].values, train["outcome"].values)
    return clf


def elo_only_probs(test: pd.DataFrame, draw_rate: float) -> np.ndarray:
    """Baseline: raw Elo expected score, with no fitted calibration.

    Elo has no draw outcome, so we hold the draw probability at the training
    base rate and split the remainder in proportion to the Elo expected score.
    This isolates exactly what the multinomial logit adds on top of Elo.
    """
    e = 1.0 / (1.0 + 10 ** (-test["elo_diff"].values / 400.0))
    p_home = (1 - draw_rate) * e
    p_away = (1 - draw_rate) * (1 - e)
    p_draw = np.full(len(test), draw_rate)
    # column order must match CLASSES = [A, D, H]
    return np.column_stack([p_away, p_draw, p_home])


def scoreline_loglik(test: pd.DataFrame, home_glm, away_glm, rho: float, use_dc: bool) -> float:
    """Mean log-likelihood of the actual scoreline under the Poisson model,
    with or without the Dixon-Coles correction. Higher (less negative) is better."""
    lam = home_glm.predict(sm.add_constant(test["elo_diff"].values))
    mu = away_glm.predict(sm.add_constant(-test["elo_diff"].values))
    hs = test["home_score"].values
    as_ = test["away_score"].values

    lls = []
    for h, a, l, m in zip(hs, as_, lam, mu):
        p = (math.exp(-l) * l ** h / math.factorial(min(h, 170))
             * math.exp(-m) * m ** a / math.factorial(min(a, 170)))
        if use_dc:
            p *= _tau(h, a, l, m, rho)
        lls.append(math.log(max(p, 1e-15)))
    return float(np.mean(lls))


def _tau(x, y, lam, mu, rho):
    if x == 0 and y == 0:
        return 1 - lam * mu * rho
    if x == 0 and y == 1:
        return 1 + lam * rho
    if x == 1 and y == 0:
        return 1 + mu * rho
    if x == 1 and y == 1:
        return 1 - rho
    return 1.0


def fit_rho(train: pd.DataFrame, home_glm, away_glm) -> float:
    lam = home_glm.predict(sm.add_constant(train["elo_diff"].values))
    mu = away_glm.predict(sm.add_constant(-train["elo_diff"].values))
    hs = train["home_score"].values
    as_ = train["away_score"].values

    best_rho, best_ll = 0.0, -np.inf
    for rho in np.arange(-0.15, 0.151, 0.01):
        tau_vals = np.array([_tau(h, a, l, m, rho) for h, a, l, m in zip(hs, as_, lam, mu)])
        tau_vals = np.clip(tau_vals, 1e-6, None)
        ll = np.sum(np.log(tau_vals))
        if ll > best_ll:
            best_ll, best_rho = ll, rho
    return float(best_rho)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Temporal backtest of the Matchday AI model")
    ap.add_argument("--cutoff", default="2018-01-01",
                    help="train on matches before this date, test on/after (default: 2018-01-01)")
    ap.add_argument("--json", default=None, help="also write metrics to this JSON path")
    args = ap.parse_args()

    cutoff = pd.Timestamp(args.cutoff)

    _, played, _, _ = load_results()
    _, reg_df = run_elo(played)

    train = reg_df[reg_df["date"] < cutoff].reset_index(drop=True)
    test = reg_df[reg_df["date"] >= cutoff].reset_index(drop=True)

    print("=" * 68)
    print(f"TEMPORAL BACKTEST — cutoff {cutoff.date()}")
    print("=" * 68)
    print(f"  train : {len(train):>6} matches  ({train['date'].min().date()} -> {train['date'].max().date()})")
    print(f"  test  : {len(test):>6} matches  ({test['date'].min().date()} -> {test['date'].max().date()})")

    y_idx = np.array([CLASSES.index(o) for o in test["outcome"].values])

    # --- the model -------------------------------------------------------
    clf = fit_outcome_model(train)
    assert list(clf.classes_) == CLASSES, f"unexpected class order: {clf.classes_}"
    probs_model = clf.predict_proba(test[["elo_diff"]].values)

    # --- baselines -------------------------------------------------------
    probs_uniform = np.full((len(test), 3), 1 / 3)

    base_rates = np.array([(train["outcome"] == c).mean() for c in CLASSES])
    probs_base = np.tile(base_rates, (len(test), 1))

    draw_rate = float((train["outcome"] == "D").mean())
    probs_elo = elo_only_probs(test, draw_rate)

    print("\n" + "-" * 68)
    print("W/D/L PROBABILITIES")
    print("-" * 68)
    print(f"{'model':<26}{'log-loss':>11}{'Brier':>10}{'accuracy':>11}")
    rows = [
        ("uniform (1/3 each)", probs_uniform),
        ("train base rates", probs_base),
        ("Elo only, uncalibrated", probs_elo),
        ("Elo + multinomial logit", probs_model),
    ]
    results_out = {}
    for name, p in rows:
        ll, bs, acc = log_loss(p, y_idx), brier(p, y_idx), accuracy(p, y_idx)
        marker = "  <-- shipped" if name.startswith("Elo + ") else ""
        print(f"{name:<26}{ll:>11.4f}{bs:>10.4f}{acc:>10.1%}{marker}")
        results_out[name] = {"log_loss": ll, "brier": bs, "accuracy": acc}

    lift = (results_out["train base rates"]["log_loss"]
            - results_out["Elo + multinomial logit"]["log_loss"])
    print(f"\n  log-loss gained over base rates : {lift:+.4f}")

    # --- calibration -----------------------------------------------------
    cal = calibration_table(probs_model, y_idx)
    ece = expected_calibration_error(cal)
    print("\n" + "-" * 68)
    print("CALIBRATION — when the model says X%, it happens Y% of the time")
    print("-" * 68)
    print(f"{'bin':<14}{'n':>8}{'predicted':>12}{'observed':>11}{'gap':>9}")
    for r in cal:
        gap = r["observed"] - r["predicted"]
        print(f"{r['bin']:<14}{r['n']:>8}{r['predicted']:>11.1%}{r['observed']:>11.1%}{gap:>+9.1%}")
    print(f"\n  expected calibration error : {ece:.4f}")

    # --- goals -----------------------------------------------------------
    X_tr = sm.add_constant(train["elo_diff"].values)
    home_glm = sm.GLM(train["home_score"].values, X_tr, family=sm.families.Poisson()).fit()
    away_glm = sm.GLM(train["away_score"].values, sm.add_constant(-train["elo_diff"].values),
                      family=sm.families.Poisson()).fit()
    rho = fit_rho(train, home_glm, away_glm)

    lam_te = home_glm.predict(sm.add_constant(test["elo_diff"].values))
    mu_te = away_glm.predict(sm.add_constant(-test["elo_diff"].values))
    mae_home = float(np.mean(np.abs(lam_te - test["home_score"].values)))
    mae_away = float(np.mean(np.abs(mu_te - test["away_score"].values)))

    ll_plain = scoreline_loglik(test, home_glm, away_glm, rho, use_dc=False)
    ll_dc = scoreline_loglik(test, home_glm, away_glm, rho, use_dc=True)

    print("\n" + "-" * 68)
    print("GOALS & SCORELINES")
    print("-" * 68)
    print(f"  Dixon-Coles rho (fit on train)     : {rho:+.3f}")
    print(f"  MAE expected vs actual goals       : home {mae_home:.3f}   away {mae_away:.3f}")
    print(f"  scoreline log-lik, plain Poisson   : {ll_plain:.4f}")
    print(f"  scoreline log-lik, + Dixon-Coles   : {ll_dc:.4f}   ({ll_dc - ll_plain:+.4f})")

    results_out["calibration"] = {"bins": cal, "expected_calibration_error": ece}
    results_out["goals"] = {
        "dixon_coles_rho": rho,
        "mae_home_goals": mae_home,
        "mae_away_goals": mae_away,
        "scoreline_loglik_plain": ll_plain,
        "scoreline_loglik_dixon_coles": ll_dc,
    }
    results_out["split"] = {
        "cutoff": str(cutoff.date()),
        "n_train": len(train),
        "n_test": len(test),
    }

    if args.json:
        with open(args.json, "w") as f:
            json.dump(results_out, f, indent=2)
        print(f"\nWrote {args.json}")


if __name__ == "__main__":
    main()
