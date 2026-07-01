import { useEffect, useState, useCallback } from 'react'
import TeamPicker from './TeamPicker.jsx'
import BracketSimulator from './BracketSimulator.jsx'
import Results from './Results.jsx'
import { flagFor } from './flags.js'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

function pct(x) {
  return `${Math.round(x * 100)}%`
}

function FormBadge({ result }) {
  const styles = {
    W: 'bg-turf-600/80 text-chalk-50 border-turf-500',
    D: 'bg-pitch-700 text-chalk-200 border-pitchline',
    L: 'bg-red-900/50 text-red-200 border-red-800/60',
  }
  return (
    <span className={`w-6 h-6 flex items-center justify-center rounded text-[11px] font-mono font-bold border ${styles[result] || styles.D}`}>
      {result}
    </span>
  )
}

function ProbBar({ label, value, accent }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-body font-medium text-chalk-200">{label}</span>
        <span className="font-mono text-sm font-semibold" style={{ color: accent }}>{pct(value)}</span>
      </div>
      <div className="h-2.5 rounded-full bg-pitch-900 border border-pitchline overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: pct(value),
            background: `linear-gradient(90deg, ${accent}88, ${accent})`,
            boxShadow: `0 0 12px ${accent}55`,
          }}
        />
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('predictor') // 'predictor' | 'bracket' | 'results'
  const [teams, setTeams] = useState([])
  const [fixtures, setFixtures] = useState([])
  const [home, setHome] = useState('')
  const [away, setAway] = useState('')
  const [neutral, setNeutral] = useState(true)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/teams`).then((r) => r.json()).then(setTeams).catch(() => setError('Could not reach the Matchday AI backend. Is it running on :8000?'))
    fetch(`${API_BASE}/fixtures`).then((r) => r.json()).then(setFixtures).catch(() => {})
  }, [])

  const runPredict = useCallback((h, a, n) => {
    if (!h || !a || h === a) return
    setLoading(true)
    setError(null)
    fetch(`${API_BASE}/predict?home=${encodeURIComponent(h)}&away=${encodeURIComponent(a)}&neutral=${n}`)
      .then((r) => {
        if (!r.ok) throw new Error('Prediction failed')
        return r.json()
      })
      .then((data) => {
        setResult(data)
        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (home && away && home !== away) runPredict(home, away, neutral)
  }, [home, away, neutral, runPredict])

  const swap = () => {
    const h = home
    setHome(away)
    setAway(h)
  }

  return (
    <div className="min-h-screen font-body">
      {/* Header */}
      <header className="border-b border-pitchline/60">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full border-2 border-floodlight-500 flex items-center justify-center">
              <span className="text-floodlight-500 text-lg">⚽</span>
            </div>
            <div>
              <h1 className="font-display text-2xl tracking-wide text-chalk-50 leading-none">MATCHDAY AI</h1>
              <p className="text-[11px] uppercase tracking-[0.25em] text-chalk-400 mt-0.5">2026 World Cup Predictor</p>
            </div>
          </div>
          <div className="hidden sm:block text-right text-[11px] text-chalk-400 font-mono leading-tight">
            <div>{teams.length || 48} teams · Elo + Dixon-Coles Poisson</div>
            <div>trained on 49,481 matches, 1872–2026</div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 sm:py-14">
        {/* Tabs */}
        <div className="flex items-center gap-2 mb-8">
          <button
            onClick={() => setTab('predictor')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold tracking-wide transition border ${
              tab === 'predictor'
                ? 'bg-floodlight-500 text-pitch-950 border-floodlight-500'
                : 'border-pitchline text-chalk-400 hover:text-chalk-50'
            }`}
          >
            Match Predictor
          </button>
          <button
            onClick={() => setTab('bracket')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold tracking-wide transition border ${
              tab === 'bracket'
                ? 'bg-floodlight-500 text-pitch-950 border-floodlight-500'
                : 'border-pitchline text-chalk-400 hover:text-chalk-50'
            }`}
          >
            🏆 Tournament Simulator
          </button>
          <button
            onClick={() => setTab('results')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold tracking-wide transition border ${
              tab === 'results'
                ? 'bg-floodlight-500 text-pitch-950 border-floodlight-500'
                : 'border-pitchline text-chalk-400 hover:text-chalk-50'
            }`}
          >
            📋 Results & Bracket
          </button>
        </div>

        {tab === 'bracket' && <BracketSimulator />}
        {tab === 'results' && <Results />}

        {tab === 'predictor' && (
        <>
        {/* Hero / picker */}
        <section className="scoreboard-panel rounded-2xl p-6 sm:p-10 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.05] pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle at 50% 50%, transparent 0%, transparent 22%, #FFB627 22.4%, transparent 22.8%)',
              backgroundSize: '340px 340px',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          />
          <p className="text-center text-chalk-400 text-sm mb-8 relative">
            Pick two national teams to generate a win / draw / loss forecast and predicted scoreline.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 sm:gap-6 items-end relative">
            <TeamPicker label="Home" teams={teams} value={home} onChange={setHome} exclude={away} />

            <button
              onClick={swap}
              title="Swap teams"
              className="hidden sm:flex items-center justify-center w-11 h-11 rounded-full border border-pitchline text-chalk-400 hover:text-floodlight-500 hover:border-floodlight-500/60 transition mb-1 mx-auto font-display"
            >
              VS
            </button>

            <TeamPicker label="Away" teams={teams} value={away} onChange={setAway} exclude={home} />
          </div>

          <div className="flex items-center justify-center gap-3 mt-6 relative">
            <button
              type="button"
              role="switch"
              aria-checked={neutral}
              onClick={() => setNeutral((n) => !n)}
              className={`relative w-11 h-6 rounded-full transition-colors ${neutral ? 'bg-floodlight-600' : 'bg-pitch-700'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-chalk-50 transition-transform ${neutral ? 'translate-x-5' : ''}`}
              />
            </button>
            <span className="text-sm text-chalk-200">
              Neutral venue <span className="text-chalk-400">(on for almost every 2026 knockout match)</span>
            </span>
          </div>

          {fixtures.length > 0 && (
            <div className="mt-8 relative">
              <div className="text-[11px] uppercase tracking-[0.2em] text-chalk-400 font-semibold mb-3">
                Or jump to a scheduled fixture
              </div>
              <div className="flex gap-2 overflow-x-auto thin-scroll pb-2">
                {fixtures.map((f) => (
                  <button
                    key={`${f.date}-${f.home_team}-${f.away_team}`}
                    onClick={() => {
                      setHome(f.home_team)
                      setAway(f.away_team)
                      setNeutral(f.neutral)
                    }}
                    className="shrink-0 rounded-lg border border-pitchline bg-pitch-900/60 px-3.5 py-2 text-xs hover:border-floodlight-500/60 transition text-left"
                  >
                    <div className="text-chalk-400 font-mono mb-1">{f.date}</div>
                    <div className="text-chalk-50 font-medium whitespace-nowrap">
                      {flagFor(f.home_team)} {f.home_team} <span className="text-chalk-400">vs</span> {flagFor(f.away_team)} {f.away_team}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {error && (
          <div className="mt-6 rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <section className="mt-8 flicker-in">
            {/* Scoreboard */}
            <div className="scoreboard-panel rounded-2xl p-8 sm:p-10 text-center">
              <div className="text-[11px] uppercase tracking-[0.3em] text-chalk-400 mb-6">Predicted Scoreline</div>
              <div className="flex items-center justify-center gap-6 sm:gap-10">
                <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
                  <span className="text-4xl">{flagFor(result.home_team)}</span>
                  <span className="font-body font-semibold text-chalk-50 text-sm sm:text-base truncate max-w-[9rem] sm:max-w-none">{result.home_team}</span>
                </div>
                <div className="led-digit font-mono text-6xl sm:text-8xl font-bold tracking-widest flex items-center gap-3 sm:gap-4">
                  <span>{result.predicted_scoreline.home_goals}</span>
                  <span className="text-chalk-600 text-4xl sm:text-6xl">–</span>
                  <span>{result.predicted_scoreline.away_goals}</span>
                </div>
                <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
                  <span className="text-4xl">{flagFor(result.away_team)}</span>
                  <span className="font-body font-semibold text-chalk-50 text-sm sm:text-base truncate max-w-[9rem] sm:max-w-none">{result.away_team}</span>
                </div>
              </div>
              <div className="mt-6 text-xs text-chalk-400 font-mono">
                Most likely exact scoreline · {pct(result.predicted_scoreline.prob)} probability &nbsp;·&nbsp;
                xG {result.expected_goals.home.toFixed(2)} – {result.expected_goals.away.toFixed(2)}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
              {/* WDL probabilities */}
              <div className="lg:col-span-3 scoreboard-panel rounded-2xl p-6 sm:p-8">
                <h2 className="font-display text-lg tracking-wide text-chalk-50 mb-6">MATCH OUTCOME</h2>
                <div className="space-y-5">
                  <ProbBar label={`${result.home_team} win`} value={result.win_draw_loss.home_win} accent="#FFB627" />
                  <ProbBar label="Draw" value={result.win_draw_loss.draw} accent="#8B9A93" />
                  <ProbBar label={`${result.away_team} win`} value={result.win_draw_loss.away_win} accent="#5AA6E8" />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-pitchline">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.15em] text-chalk-400 mb-2">Elo rating</div>
                    <div className="flex justify-between text-sm font-mono">
                      <span className="text-chalk-200">{result.home_team}</span>
                      <span className="text-chalk-50 font-semibold">{result.elo.home}</span>
                    </div>
                    <div className="flex justify-between text-sm font-mono">
                      <span className="text-chalk-200">{result.away_team}</span>
                      <span className="text-chalk-50 font-semibold">{result.elo.away}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.15em] text-chalk-400 mb-2">Recent form (last 10)</div>
                    <div className="flex gap-1 mb-1.5 flex-wrap">
                      {result.recent_form.home.map((r, i) => <FormBadge key={i} result={r} />)}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {result.recent_form.away.map((r, i) => <FormBadge key={i} result={r} />)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Top scorelines */}
              <div className="lg:col-span-2 scoreboard-panel rounded-2xl p-6 sm:p-8">
                <h2 className="font-display text-lg tracking-wide text-chalk-50 mb-6">ODDS BOARD</h2>
                <div className="space-y-3">
                  {result.top_scorelines.map((s, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-chalk-600 font-mono text-xs w-4">{i + 1}</span>
                      <span className="font-mono text-sm text-chalk-50 w-12">
                        {s.home_goals}–{s.away_goals}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-pitch-900 border border-pitchline overflow-hidden">
                        <div
                          className="h-full rounded-full bg-floodlight-500"
                          style={{ width: pct(s.prob / result.top_scorelines[0].prob) }}
                        />
                      </div>
                      <span className="font-mono text-xs text-chalk-400 w-10 text-right">{pct(s.prob)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {!result && !error && (
          <div className="mt-10 text-center text-chalk-600 text-sm">
            {loading ? 'Running the model…' : 'Select both teams above to see a prediction.'}
          </div>
        )}
        </>
        )}
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-10 border-t border-pitchline/60 mt-6">
        <p className="text-xs text-chalk-600 leading-relaxed">
          Matchday AI predicts outcomes from historical results using a time-weighted Elo rating system and a
          Dixon-Coles-corrected Poisson goals model — see the README for full methodology. Predictions are
          probabilistic estimates for entertainment and analysis, not a guarantee of results or betting advice.
        </p>
      </footer>
    </div>
  )
}
