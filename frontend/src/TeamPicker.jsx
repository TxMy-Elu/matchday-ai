import { useState, useMemo, useRef, useEffect } from 'react'
import { flagFor } from './flags.js'
import { useLang } from './i18n.jsx'

export default function TeamPicker({ label, teams, value, onChange, exclude }) {
  const { t, tTeam } = useLang()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return teams
      .filter((team) => team.name !== exclude)
      .filter((team) => !q || team.name.toLowerCase().includes(q) || tTeam(team.name).toLowerCase().includes(q))
  }, [teams, query, exclude, tTeam])

  const selected = teams.find((team) => team.name === value)

  return (
    <div className="relative w-full" ref={wrapRef}>
      <div className="kicker text-[11px] text-mist-500 font-semibold mb-2">
        {label}
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 rounded-lg border border-line bg-void-800 px-4 py-3.5 text-left transition hover:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
      >
        {selected ? (
          <span className="flex items-center gap-3 min-w-0">
            <span className="text-2xl leading-none">{flagFor(selected.name)}</span>
            <span className="flex flex-col min-w-0">
              <span className="font-body font-semibold text-mist-50 truncate">{tTeam(selected.name)}</span>
              <span className="text-[11px] text-mist-500 font-mono">Elo {Math.round(selected.elo)}</span>
            </span>
          </span>
        ) : (
          <span className="text-mist-500">{t('select_team')}</span>
        )}
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="text-mist-500 shrink-0">
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-lg border border-line bg-void-900 shadow-2xl overflow-hidden">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search_teams')}
            className="w-full px-4 py-3 bg-void-900 text-mist-50 placeholder-mist-700 border-b border-line focus:outline-none font-body text-sm"
          />
          <div className="max-h-64 overflow-y-auto thin-scroll">
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-sm text-mist-500">{t('no_teams_match', { query })}</div>
            )}
            {filtered.map((team) => (
              <button
                key={team.name}
                type="button"
                onClick={() => {
                  onChange(team.name)
                  setOpen(false)
                  setQuery('')
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition text-left"
              >
                <span className="text-xl leading-none">{flagFor(team.name)}</span>
                <span className="flex-1 text-sm font-body text-mist-50">{tTeam(team.name)}</span>
                <span className="text-[11px] font-mono text-mist-500">{Math.round(team.elo)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
