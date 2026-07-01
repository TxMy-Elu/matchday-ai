import { useEffect, useState, useCallback } from 'react'
import { flagFor } from './flags.js'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

function pct(x) {
  return `${(x * 100).toFixed(1)}%`
}

export default function BracketSimulator() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback((refresh) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    fetch(`${API_BASE}/bracket${refresh ? '?refresh=true' : ''}`)
      .then((r) => {
        if (!r.ok) throw new Error('Simulation failed')
        return r.json()
      })
      .then((d) => {
        setData(d)
        setLoading(false)
        setRefreshing(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
        setRefreshing(false)
      })
  }, [])

  useEffect(() => {
    load(false)
  }, [load])

  if (loading) {
    return <div className="text-center text-chalk-400 text-sm py-16">Running 20,000 simulated tournaments…</div>
  }
  if (error) {
    return <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>
  }
  if (!data) return null

  const top = data.championship_odds.slice(0, 12)
  const maxProb = top[0]?.champion_prob || 1

  return (
    <div className="flicker-in">
      {/* Championship odds */}
      <div className="scoreboard-panel rounded-2xl p-4 sm:p-6 lg:p-8">
        <div className="flex items-start justify-between gap-3 sm:gap-4 mb-2">
          <div className="min-w-0">
            <h2 className="font-display text-lg sm:text-xl tracking-wide text-chalk-50">CHAMPIONSHIP ODDS</h2>
            <p className="text-xs text-chalk-400 mt-1">
              {data.n_simulations.toLocaleString()} simulated knockout tournaments, from the current Round of 32 onward.
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="shrink-0 rounded-lg border border-pitchline px-2.5 sm:px-3 py-2 text-xs font-semibold text-chalk-200 hover:border-floodlight-500/60 hover:text-floodlight-500 transition disabled:opacity-50"
          >
            {refreshing ? 'Simulating…' : 'Re-run ↻'}
          </button>
        </div>

        <div className="mt-6 space-y-2.5">
          {top.map((t, i) => (
            <div key={t.team} className="flex items-center gap-1.5 sm:gap-3">
              <span className="text-chalk-600 font-mono text-xs w-3 sm:w-4 shrink-0">{i + 1}</span>
              <span className="text-lg sm:text-xl leading-none w-6 sm:w-7 shrink-0">{flagFor(t.team)}</span>
              <span className="text-xs sm:text-sm font-body font-medium text-chalk-50 w-16 sm:w-36 lg:w-40 truncate shrink-0">{t.team}</span>
              <div className="flex-1 h-2.5 sm:h-3 rounded-full bg-pitch-900 border border-pitchline overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(t.champion_prob / maxProb) * 100}%`,
                    background: 'linear-gradient(90deg, #FFB62788, #FFB627)',
                    boxShadow: '0 0 10px #FFB62755',
                  }}
                />
              </div>
              <span className="font-mono text-xs sm:text-sm font-semibold text-floodlight-500 w-10 sm:w-14 text-right shrink-0">{pct(t.champion_prob)}</span>
              <span className="hidden sm:block font-mono text-[11px] text-chalk-400 w-16 text-right shrink-0">finale {pct(t.finalist_prob)}</span>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-chalk-600 leading-relaxed mt-6 pt-5 border-t border-pitchline">{data.note}</p>
      </div>

      {/* Remaining Round of 32 */}
      <div className="scoreboard-panel rounded-2xl p-4 sm:p-6 lg:p-8 mt-6">
        <h2 className="font-display text-base sm:text-lg tracking-wide text-chalk-50 mb-1">ROUND OF 32 — REMAINING</h2>
        <p className="text-xs text-chalk-400 mb-6">Direct model predictions for each scheduled fixture still to be played.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.round32_fixtures.map((f) => (
            <div key={`${f.home_team}-${f.away_team}`} className="rounded-lg border border-pitchline bg-pitch-900/50 px-3 sm:px-4 py-3">
              <div className="flex items-center justify-between gap-2 text-sm mb-2">
                <span className="flex items-center gap-2 text-chalk-50 font-medium min-w-0 truncate">
                  <span className="shrink-0">{flagFor(f.home_team)}</span> <span className="truncate">{f.home_team}</span>
                </span>
                <span className="font-mono text-floodlight-500 text-xs shrink-0">{pct(f.home_advance_prob)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-pitch-800 border border-pitchline overflow-hidden mb-2">
                <div className="h-full bg-floodlight-500" style={{ width: pct(f.home_advance_prob) }} />
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 text-chalk-50 font-medium min-w-0 truncate">
                  <span className="shrink-0">{flagFor(f.away_team)}</span> <span className="truncate">{f.away_team}</span>
                </span>
                <span className="font-mono text-chalk-400 text-xs shrink-0">{pct(f.away_advance_prob)}</span>
              </div>
            </div>
          ))}
        </div>

        {data.fixed_round16.length > 0 && (
          <div className="mt-6 pt-5 border-t border-pitchline">
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-chalk-400 font-semibold mb-3">Already-scheduled Round of 16</h3>
            {data.fixed_round16.map((f) => (
              <div key={`${f.home_team}-${f.away_team}`} className="text-sm text-chalk-200 flex items-center flex-wrap gap-x-2 gap-y-1">
                <span>{flagFor(f.home_team)}</span> {f.home_team} <span className="text-chalk-400">vs</span>{' '}
                <span>{flagFor(f.away_team)}</span> {f.away_team}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
