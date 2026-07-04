import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { flagFor } from './flags.js'
import { useLang } from './i18n.jsx'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

function pct(x) {
  return `${(x * 100).toFixed(1)}%`
}

export default function BracketSimulator() {
  const { t, tTeam } = useLang()
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
    return <div className="text-center text-mist-500 text-sm py-16">{t('running_sims')}</div>
  }
  if (error) {
    return <div className="rounded-lg border border-crimson-500/40 bg-void-800/60 px-4 py-3 text-sm text-crimson-500">{error}</div>
  }
  if (!data) return null

  const top = data.championship_odds.slice(0, 12)
  const maxProb = top[0]?.champion_prob || 1

  return (
    <div className="flicker-in">
      {/* Championship odds */}
      <div className="glass rounded-2xl p-4 sm:p-6 lg:p-8">
        <div className="flex items-start justify-between gap-3 sm:gap-4 mb-2">
          <div className="min-w-0">
            <h2 className="font-display text-lg sm:text-xl font-semibold text-mist-50">{t('championship_odds')}</h2>
            <p className="text-xs text-mist-500 mt-1">
              {t('sims_desc', {
                n: data.n_simulations.toLocaleString(),
                round: data.current_round ? t(`round_${data.current_round.toLowerCase()}`) : t('round_f'),
              })}
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="shrink-0 rounded-lg border border-line px-2.5 sm:px-3 py-2 text-xs font-semibold text-mist-300 hover:border-amber-500/60 hover:text-amber-500 transition disabled:opacity-50"
          >
            {refreshing ? t('simulating') : t('rerun')}
          </button>
        </div>

        <div className="mt-6 space-y-2.5">
          {top.map((team, i) => (
            <div key={team.team} className="flex items-center gap-1.5 sm:gap-3">
              <span className="text-mist-700 font-mono text-xs w-3 sm:w-4 shrink-0">{i + 1}</span>
              <span className="text-lg sm:text-xl leading-none w-6 sm:w-7 shrink-0">{flagFor(team.team)}</span>
              <span className="text-xs sm:text-sm font-body font-medium text-mist-50 w-16 sm:w-36 lg:w-40 truncate shrink-0">{tTeam(team.team)}</span>
              <div className="flex-1 h-2.5 sm:h-3 rounded-full bg-void-800 border border-line overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #F5B94299, #F5B942)', boxShadow: '0 0 12px #F5B94266' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(team.champion_prob / maxProb) * 100}%` }}
                  transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <span className="font-mono text-xs sm:text-sm font-semibold text-amber-500 w-10 sm:w-14 text-right shrink-0">{pct(team.champion_prob)}</span>
              <span className="hidden sm:block font-mono text-[11px] text-mist-500 w-16 text-right shrink-0">{t('finale_pct', { pct: pct(team.finalist_prob) })}</span>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-mist-500 leading-relaxed mt-6 pt-5 border-t border-line">{data.note}</p>
      </div>

      {/* Remaining fixtures for whichever round is currently up next */}
      <div className="glass rounded-2xl p-4 sm:p-6 lg:p-8 mt-6">
        <h2 className="font-display text-base sm:text-lg font-semibold text-mist-50 mb-1">
          {data.current_round ? t('round_remaining', { round: t(`round_${data.current_round.toLowerCase()}`) }) : t('round_f')}
        </h2>
        {data.current_round ? (
          <>
            <p className="text-xs text-mist-500 mb-6">{t('round_fixtures_desc')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.current_round_fixtures.map((f) => (
                <div key={`${f.home_team}-${f.away_team}`} className="rounded-lg border border-line bg-void-800/50 px-3 sm:px-4 py-3">
                  <div className="flex items-center justify-between gap-2 text-sm mb-2">
                    <span className="flex items-center gap-2 text-mist-50 font-medium min-w-0 truncate">
                      <span className="shrink-0">{flagFor(f.home_team)}</span> <span className="truncate">{tTeam(f.home_team)}</span>
                    </span>
                    <span className="font-mono text-emerald-400 text-xs shrink-0">{pct(f.home_advance_prob)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-void-900 border border-line overflow-hidden mb-2">
                    <div className="h-full bg-emerald-500" style={{ width: pct(f.home_advance_prob) }} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-mist-50 font-medium min-w-0 truncate">
                      <span className="shrink-0">{flagFor(f.away_team)}</span> <span className="truncate">{tTeam(f.away_team)}</span>
                    </span>
                    <span className="font-mono text-mist-500 text-xs shrink-0">{pct(f.away_advance_prob)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-mist-500 mb-2">{t('round_done')}</p>
        )}
      </div>
    </div>
  )
}
