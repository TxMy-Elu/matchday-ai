import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import TeamPicker from './TeamPicker.jsx'
import BracketSimulator from './BracketSimulator.jsx'
import Results from './Results.jsx'
import Logo from './Logo.jsx'
import TiltCard from './TiltCard.jsx'
import Footer from './Footer.jsx'
import LegalPage from './LegalPage.jsx'
import LanguageToggle from './LanguageToggle.jsx'
import { useLang } from './i18n.jsx'
import { flagFor } from './flags.js'

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

const HeroOrb = lazy(() => import('./HeroOrb.jsx'))

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

function pct(x) {
  return `${Math.round(x * 100)}%`
}

function FormBadge({ result }) {
  const styles = {
    W: 'bg-emerald-500/90 text-void-950 border-emerald-500',
    D: 'bg-void-700 text-mist-300 border-line',
    L: 'bg-void-800 text-crimson-500 border-crimson-500/40',
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
        <span className="text-sm font-body font-medium text-mist-50">{label}</span>
        <span className="font-mono text-sm font-semibold" style={{ color: accent }}>{pct(value)}</span>
      </div>
      <div className="h-2.5 rounded-full bg-void-800 border border-line overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${accent}99, ${accent})`, boxShadow: `0 0 14px ${accent}66` }}
          initial={{ width: 0 }}
          animate={{ width: pct(value) }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  )
}

function IconCrosshair({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" />
    </svg>
  )
}

function IconTrophy({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4.5A1.5 1.5 0 0 0 3 6.5 3.5 3.5 0 0 0 6.5 10H7M17 5h2.5A1.5 1.5 0 0 1 21 6.5 3.5 3.5 0 0 1 17.5 10H17" />
      <path d="M12 14v3M9 21h6M9.5 21c0-2 .8-3 2.5-4 1.7 1 2.5 2 2.5 4" />
    </svg>
  )
}

function IconBracket({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h4M4 12h4M4 19h4M8 5v3.5a1 1 0 0 0 1 1h3M8 12v3.5a1 1 0 0 0 1 1h3M12 8.5v7M17 8.5h3M17 15.5h3" />
    </svg>
  )
}

const TABS = [
  { id: 'predictor', labelKey: 'tab_predictor', Icon: IconCrosshair },
  { id: 'bracket', labelKey: 'tab_bracket', Icon: IconTrophy },
  { id: 'results', labelKey: 'tab_results', Icon: IconBracket },
]

export default function App() {
  const { t } = useLang()
  const hash = useHashRoute()
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
    fetch(`${API_BASE}/teams`).then((r) => r.json()).then(setTeams).catch(() => setError('error_backend'))
    fetch(`${API_BASE}/fixtures`).then((r) => r.json()).then(setFixtures).catch(() => {})
  }, [])

  const runPredict = useCallback((h, a, n) => {
    if (!h || !a || h === a) return
    setLoading(true)
    setError(null)
    fetch(`${API_BASE}/predict?home=${encodeURIComponent(h)}&away=${encodeURIComponent(a)}&neutral=${n}`)
      .then((r) => {
        if (!r.ok) throw new Error('error_predict')
        return r.json()
      })
      .then((data) => {
        setResult(data)
        setLoading(false)
      })
      .catch(() => {
        setError('error_predict')
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

  if (hash.startsWith('#/legal/')) {
    return <LegalPage page={hash.replace('#/legal/', '')} />
  }

  return (
    <div className="min-h-screen font-body">
      {/* Header */}
      <header className="sticky top-0 z-30 glass">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-4 sm:py-5 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Logo className="w-8 h-8 sm:w-9 sm:h-9 shrink-0" />
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-2xl font-bold gradient-text leading-none truncate">Matchday AI</h1>
              <p className="kicker text-[10px] sm:text-[11px] text-mist-500 mt-1 truncate">{t('tagline')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <div className="hidden sm:block text-right text-[11px] text-mist-500 font-mono leading-tight">
              <div>{t('stats_line1', { n: teams.length || 48 })}</div>
              <div>{t('stats_line2')}</div>
            </div>
            <LanguageToggle />
          </div>
        </div>
        <div className="border-t border-line">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {TABS.map((tabItem) => (
              <button
                key={tabItem.id}
                onClick={() => setTab(tabItem.id)}
                className={`relative shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold tracking-wide transition whitespace-nowrap ${
                  tab === tabItem.id ? 'text-mist-50' : 'text-mist-500 hover:text-mist-300'
                }`}
              >
                <tabItem.Icon className="w-4 h-4 shrink-0" />
                {t(tabItem.labelKey)}
                {tab === tabItem.id && (
                  <motion.span
                    layoutId="tab-underline"
                    className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full"
                    style={{ background: 'linear-gradient(90deg, #A78BFA, #34D399, #22D3EE)' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-14">
        <AnimatePresence mode="wait">
          {tab === 'bracket' && (
            <motion.div key="bracket" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <BracketSimulator />
            </motion.div>
          )}
          {tab === 'results' && (
            <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <Results />
            </motion.div>
          )}

          {tab === 'predictor' && (
          <motion.div key="predictor" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            {/* Hero / picker */}
            <div className="relative">
              <Suspense fallback={null}>
                <HeroOrb className="absolute -top-24 left-1/2 -translate-x-1/2 w-[560px] h-[420px] opacity-70 -z-10" />
              </Suspense>
              <TiltCard max={3} className="glass rounded-2xl p-4 sm:p-6 lg:p-10">
                <p className="text-center text-mist-500 text-sm mb-8">
                  {t('hero_desc')}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 sm:gap-6 items-end">
                  <TeamPicker label={t('label_home')} teams={teams} value={home} onChange={setHome} exclude={away} />

                  <button
                    onClick={swap}
                    title="Swap teams"
                    className="flex items-center justify-center w-11 h-11 rounded-full border border-line text-mist-300 hover:text-emerald-400 hover:border-emerald-400/60 hover:shadow-glow-emerald transition mb-1 mx-auto font-display font-semibold"
                  >
                    VS
                  </button>

                  <TeamPicker label={t('label_away')} teams={teams} value={away} onChange={setAway} exclude={home} />
                </div>

                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 mt-6 text-center">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={neutral}
                    onClick={() => setNeutral((n) => !n)}
                    className={`relative w-11 h-6 shrink-0 rounded-full transition-colors ${neutral ? 'bg-emerald-500' : 'bg-void-700 border border-line'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-mist-50 shadow transition-transform ${neutral ? 'translate-x-5' : ''}`}
                    />
                  </button>
                  <span className="text-sm text-mist-300">
                    {t('neutral_venue')} <span className="text-mist-500">{t('neutral_hint')}</span>
                  </span>
                </div>

                {fixtures.length > 0 && (
                  <div className="mt-8">
                    <div className="kicker text-[11px] text-mist-500 font-semibold mb-3">
                      {t('fixtures_heading')}
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
                          className="shrink-0 rounded-lg border border-line bg-void-800/60 px-3.5 py-2 text-xs hover:border-emerald-400/60 transition text-left"
                        >
                          <div className="text-mist-500 font-mono mb-1 flex items-center gap-1.5 whitespace-nowrap">
                            <span>{f.date}</span>
                            {f.city && (
                              <span className="text-mist-700">
                                · {flagFor(f.country)} {f.city}{f.country ? `, ${f.country}` : ''}
                              </span>
                            )}
                          </div>
                          <div className="text-mist-50 font-medium whitespace-nowrap flex items-center gap-1.5">
                            <span>{flagFor(f.home_team)} {f.home_team}</span>
                            {!f.neutral && (
                              <span className="kicker text-[9px] leading-none px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                {t('host_badge')}
                              </span>
                            )}
                            <span className="text-mist-500">vs</span>
                            <span>{flagFor(f.away_team)} {f.away_team}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </TiltCard>
            </div>

            {error && (
              <div className="mt-6 rounded-lg border border-crimson-500/40 bg-void-800/60 px-4 py-3 text-sm text-crimson-500">
                {t(error)}
              </div>
            )}

            {/* Results */}
            <AnimatePresence>
              {result && (
                <motion.section
                  key={`${result.home_team}-${result.away_team}`}
                  className="mt-8"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  {/* Scoreboard */}
                  <div className="glass rounded-2xl p-5 sm:p-8 lg:p-10 text-center">
                    <div className="kicker text-[11px] text-mist-500 mb-4 sm:mb-6">{t('scoreline_label')}</div>
                    <div className="flex items-center justify-center gap-3 sm:gap-6 lg:gap-10">
                      <div className="flex-1 flex flex-col items-center gap-1.5 sm:gap-2 min-w-0">
                        <span className="text-2xl sm:text-3xl lg:text-4xl">{flagFor(result.home_team)}</span>
                        <span className="font-body font-semibold text-mist-50 text-xs sm:text-sm lg:text-base truncate max-w-[5.5rem] sm:max-w-[9rem] lg:max-w-none">{result.home_team}</span>
                      </div>
                      <div className="font-display gradient-text text-4xl sm:text-6xl lg:text-8xl font-bold tracking-tight flex items-center gap-1.5 sm:gap-3 lg:gap-4">
                        <span>{result.predicted_scoreline.home_goals}</span>
                        <span className="text-mist-700 text-2xl sm:text-4xl lg:text-6xl">–</span>
                        <span>{result.predicted_scoreline.away_goals}</span>
                      </div>
                      <div className="flex-1 flex flex-col items-center gap-1.5 sm:gap-2 min-w-0">
                        <span className="text-2xl sm:text-3xl lg:text-4xl">{flagFor(result.away_team)}</span>
                        <span className="font-body font-semibold text-mist-50 text-xs sm:text-sm lg:text-base truncate max-w-[5.5rem] sm:max-w-[9rem] lg:max-w-none">{result.away_team}</span>
                      </div>
                    </div>
                    <div className="mt-6 text-xs text-mist-500 font-mono">
                      {t('scoreline_meta', {
                        pct: pct(result.predicted_scoreline.prob),
                        home: result.expected_goals.home.toFixed(2),
                        away: result.expected_goals.away.toFixed(2),
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
                    {/* WDL probabilities */}
                    <div className="lg:col-span-3 glass rounded-2xl p-4 sm:p-6 lg:p-8">
                      <h2 className="font-display text-lg font-semibold text-mist-50 mb-6">{t('match_outcome')}</h2>
                      <div className="space-y-5">
                        <ProbBar label={t('win_label', { team: result.home_team })} value={result.win_draw_loss.home_win} accent="#10B981" />
                        <ProbBar label={t('draw_label')} value={result.win_draw_loss.draw} accent="#9195AA" />
                        <ProbBar label={t('win_label', { team: result.away_team })} value={result.win_draw_loss.away_win} accent="#8B5CF6" />
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-line">
                        <div>
                          <div className="kicker text-[11px] text-mist-500 mb-2">{t('elo_rating')}</div>
                          <div className="flex justify-between text-sm font-mono">
                            <span className="text-mist-300">{result.home_team}</span>
                            <span className="text-mist-50 font-semibold">{result.elo.home}</span>
                          </div>
                          <div className="flex justify-between text-sm font-mono">
                            <span className="text-mist-300">{result.away_team}</span>
                            <span className="text-mist-50 font-semibold">{result.elo.away}</span>
                          </div>
                        </div>
                        <div>
                          <div className="kicker text-[11px] text-mist-500 mb-2">{t('recent_form')}</div>
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
                    <div className="lg:col-span-2 glass rounded-2xl p-4 sm:p-6 lg:p-8">
                      <h2 className="font-display text-lg font-semibold text-mist-50 mb-6">{t('odds_board')}</h2>
                      <div className="space-y-3">
                        {result.top_scorelines.map((s, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-mist-700 font-mono text-xs w-4">{i + 1}</span>
                            <span className="font-mono text-sm text-mist-50 w-12">
                              {s.home_goals}–{s.away_goals}
                            </span>
                            <div className="flex-1 h-1.5 rounded-full bg-void-800 border border-line overflow-hidden">
                              <motion.div
                                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500"
                                initial={{ width: 0 }}
                                animate={{ width: pct(s.prob / result.top_scorelines[0].prob) }}
                                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                              />
                            </div>
                            <span className="font-mono text-xs text-mist-500 w-10 text-right">{pct(s.prob)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            {!result && !error && (
              <div className="mt-10 text-center text-mist-500 text-sm">
                {loading ? t('loading_model') : t('select_prompt')}
              </div>
            )}
          </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Footer />
    </div>
  )
}
