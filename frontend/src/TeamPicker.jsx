import { useState, useMemo, useRef, useEffect } from 'react'
import { flagFor } from './flags.js'

export default function TeamPicker({ label, teams, value, onChange, exclude }) {
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
      .filter((t) => t.name !== exclude)
      .filter((t) => !q || t.name.toLowerCase().includes(q))
  }, [teams, query, exclude])

  const selected = teams.find((t) => t.name === value)

  return (
    <div className="relative w-full" ref={wrapRef}>
      <div className="text-xs uppercase tracking-[0.2em] text-chalk-400 font-semibold mb-2">
        {label}
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 rounded-lg border border-pitchline bg-pitch-900/80 px-4 py-3.5 text-left transition hover:border-floodlight-500/60 focus:outline-none focus:ring-2 focus:ring-floodlight-500/50"
      >
        {selected ? (
          <span className="flex items-center gap-3 min-w-0">
            <span className="text-2xl leading-none">{flagFor(selected.name)}</span>
            <span className="flex flex-col min-w-0">
              <span className="font-body font-semibold text-chalk-50 truncate">{selected.name}</span>
              <span className="text-[11px] text-chalk-400 font-mono">Elo {Math.round(selected.elo)}</span>
            </span>
          </span>
        ) : (
          <span className="text-chalk-400">Select a team…</span>
        )}
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="text-chalk-400 shrink-0">
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-lg border border-pitchline bg-pitch-800 shadow-2xl overflow-hidden">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams…"
            className="w-full px-4 py-3 bg-pitch-900 text-chalk-50 placeholder-chalk-600 border-b border-pitchline focus:outline-none font-body text-sm"
          />
          <div className="max-h-64 overflow-y-auto thin-scroll">
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-sm text-chalk-400">No teams match “{query}”</div>
            )}
            {filtered.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => {
                  onChange(t.name)
                  setOpen(false)
                  setQuery('')
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-floodlight-500/10 transition text-left"
              >
                <span className="text-xl leading-none">{flagFor(t.name)}</span>
                <span className="flex-1 text-sm font-body text-chalk-50">{t.name}</span>
                <span className="text-[11px] font-mono text-chalk-400">{Math.round(t.elo)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
