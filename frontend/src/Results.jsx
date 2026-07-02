import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { flagFor } from './flags.js'
import { useLang } from './i18n.jsx'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const ROUND_ORDER = ['Group Stage', 'R32', 'R16', 'QF', 'SF', 'F']
const ROUND_LABEL_KEYS = {
  'Group Stage': 'round_group',
  R32: 'round_r32',
  R16: 'round_r16',
  QF: 'round_qf',
  SF: 'round_sf',
  F: 'round_f',
}

function TeamRow({ team, score, isWinner, showScore, borderTop }) {
  const { t, tTeam } = useLang()
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-2 border-l-2 ${borderTop ? 'border-t border-t-line' : ''} ${
        isWinner ? 'border-l-emerald-500 bg-white/[0.04]' : 'border-l-transparent bg-transparent'
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        {team && <span className="text-base shrink-0">{flagFor(team)}</span>}
        <span
          className={`truncate text-xs font-semibold uppercase tracking-wide ${
            !team ? 'text-mist-700 italic normal-case font-normal' : isWinner ? 'text-mist-50' : 'text-mist-500'
          }`}
        >
          {team ? tTeam(team) : t('tbd')}
        </span>
      </span>
      {showScore ? (
        <span
          className={`w-7 h-7 shrink-0 flex items-center justify-center rounded font-mono text-sm font-bold ${
            isWinner ? 'bg-emerald-500 text-void-950' : 'bg-void-800 text-mist-500'
          }`}
        >
          {score}
        </span>
      ) : (
        <span className="w-7 h-7 shrink-0 flex items-center justify-center rounded bg-void-900 border border-line text-mist-700 text-xs">
          —
        </span>
      )}
    </div>
  )
}

function matchKey(round, index) {
  return `${round}:${index}`
}

// Pure index math: round R+1's slot k is always fed by round R's slots
// 2k and 2k+1 (the standard bracket-sheet convention — see tournament.py's
// R32_BRACKET_ORDER for where the Round of 32's own order comes from).
// This wiring is fixed regardless of whether either side is known yet, so
// every edge is always drawn, even between two "TBD" slots.
function computeEdges(tree) {
  const edges = []
  for (let r = 1; r < tree.length; r++) {
    const prevRound = tree[r - 1].round
    const round = tree[r].round
    for (let k = 0; k < tree[r].matches.length; k++) {
      edges.push({ fromKey: matchKey(prevRound, 2 * k), toKey: matchKey(round, k) })
      edges.push({ fromKey: matchKey(prevRound, 2 * k + 1), toKey: matchKey(round, k) })
    }
  }
  return edges
}

function BracketMatch({ match, boxRef }) {
  const { t } = useLang()
  const played = match.played
  return (
    <div ref={boxRef} className="rounded-lg overflow-hidden border border-line bg-void-900 shadow-lg shadow-black/40">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.04] border-b border-line">
        <span className="text-[10px] font-mono text-mist-500 uppercase tracking-wide">{match.date || '—'}</span>
        <span className="text-[10px] font-mono text-mist-700 uppercase tracking-wide">{t('score_col')}</span>
      </div>
      <div>
        <TeamRow
          team={match.home_team}
          score={match.home_score}
          isWinner={played && match.winner === match.home_team}
          showScore={played}
        />
        <TeamRow
          team={match.away_team}
          score={match.away_score}
          isWinner={played && match.winner === match.away_team}
          showScore={played}
          borderTop
        />
      </div>
      {!played && match.home_team && match.away_team && (
        <div className="px-3 py-1 bg-white/[0.03] text-center text-[10px] uppercase tracking-wide text-mist-700">
          {t('upcoming')}
        </div>
      )}
    </div>
  )
}

// A Round-of-32 slot reserves this much vertical space; every later round
// doubles it (half as many boxes, twice the space each) so a box's slot
// always spans exactly its two children's slots combined. Centering each
// box in its slot (via flexbox) then aligns it with its children's
// midpoint for free — no DOM measurement or layout math needed.
const LEAF_SLOT_HEIGHT = 170

function slotHeight(depth) {
  return LEAF_SLOT_HEIGHT * 2 ** depth
}

function BracketColumn({ roundKey, indexedMatches, depth, registerBox }) {
  const { t } = useLang()
  const h = slotHeight(depth)
  return (
    <div className="w-44 sm:w-60 shrink-0">
      <div className="kicker text-[10px] sm:text-[11px] text-mist-500 font-semibold mb-3 text-center">
        {t(ROUND_LABEL_KEYS[roundKey])}
      </div>
      <div className="flex flex-col">
        {indexedMatches.map(({ m, i }) => (
          <div key={i} style={{ height: h }} className="flex flex-col justify-center">
            <BracketMatch match={m} boxRef={(el) => registerBox(matchKey(roundKey, i), el)} />
          </div>
        ))}
      </div>
    </div>
  )
}

function BracketTree({ tree }) {
  const { t } = useLang()
  const contentRef = useRef(null)
  const boxes = useRef({})
  const [lines, setLines] = useState([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  const registerBox = (key, el) => {
    if (el) boxes.current[key] = el
    else delete boxes.current[key]
  }

  useLayoutEffect(() => {
    const recompute = () => {
      const content = contentRef.current
      if (!content) return
      const contentRect = content.getBoundingClientRect()
      const newLines = []
      for (const { fromKey, toKey } of computeEdges(tree)) {
        const fromEl = boxes.current[fromKey]
        const toEl = boxes.current[toKey]
        if (!fromEl || !toEl) continue
        const fromRect = fromEl.getBoundingClientRect()
        const toRect = toEl.getBoundingClientRect()
        newLines.push({
          x1: fromRect.right - contentRect.left,
          y1: fromRect.top + fromRect.height / 2 - contentRect.top,
          x2: toRect.left - contentRect.left,
          y2: toRect.top + toRect.height / 2 - contentRect.top,
          key: `${fromKey}->${toKey}`,
        })
      }
      setLines(newLines)
      setSize({ w: content.scrollWidth, h: content.scrollHeight })
    }

    recompute()
    // A plain window-resize listener misses layout shifts from other causes
    // (e.g. the custom Google Fonts swapping in after first paint, which
    // changes text/box widths and would otherwise leave the lines pointing
    // at stale coordinates). ResizeObserver catches any actual size change
    // to the bracket itself, whatever caused it.
    const observer = new ResizeObserver(recompute)
    observer.observe(contentRef.current)
    document.fonts?.ready?.then(recompute)
    return () => observer.disconnect()
  }, [tree])

  // Split the tree into the two halves of the draw and fan them in from
  // opposite sides toward the Final in the center — the classic "Final
  // Four" layout. Left half keeps R32 indices 0-7 -> R16 0-3 -> QF 0-1 ->
  // SF 0; right half is the mirror image (indices 8-15 -> 4-7 -> 2-3 -> 1).
  // Edge/line computation is untouched (still pure global-index math), so
  // this is purely a rendering-order change.
  const withIndex = (matches, offset) => matches.map((m, i) => ({ m, i: i + offset }))
  const [r32, r16, qf, sf, final] = tree.map((r) => r.matches)

  const leftHalves = [
    { roundKey: 'R32', depth: 0, indexedMatches: withIndex(r32.slice(0, 8), 0) },
    { roundKey: 'R16', depth: 1, indexedMatches: withIndex(r16.slice(0, 4), 0) },
    { roundKey: 'QF', depth: 2, indexedMatches: withIndex(qf.slice(0, 2), 0) },
    { roundKey: 'SF', depth: 3, indexedMatches: withIndex(sf.slice(0, 1), 0) },
  ]
  const rightHalves = [
    { roundKey: 'SF', depth: 3, indexedMatches: withIndex(sf.slice(1, 2), 1) },
    { roundKey: 'QF', depth: 2, indexedMatches: withIndex(qf.slice(2, 4), 2) },
    { roundKey: 'R16', depth: 1, indexedMatches: withIndex(r16.slice(4, 8), 4) },
    { roundKey: 'R32', depth: 0, indexedMatches: withIndex(r32.slice(8, 16), 8) },
  ]
  const finalSlotHeight = slotHeight(3)

  return (
    <div className="overflow-x-auto thin-scroll pb-2">
      <div ref={contentRef} className="relative inline-block">
        <svg className="absolute inset-0 pointer-events-none" width={size.w || '100%'} height={size.h || '100%'}>
          <defs>
            <linearGradient id="bracket-line" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#34D399" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          {lines.map(({ x1, y1, x2, y2, key }) => {
            const midX = (x1 + x2) / 2
            return <path key={key} d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`} fill="none" stroke="url(#bracket-line)" strokeWidth="2" />
          })}
        </svg>
        {/* A position:absolute sibling (the SVG above) always paints after
            plain static-position siblings in CSS stacking order, no matter
            the DOM order — so without this wrapper being explicitly
            positioned too, the lines would render on top of the cards
            instead of behind them. */}
        <div className="relative z-10 flex gap-6 sm:gap-14">
          {leftHalves.map(({ roundKey, depth, indexedMatches }, ci) => (
            <BracketColumn key={`l-${ci}`} roundKey={roundKey} depth={depth} indexedMatches={indexedMatches} registerBox={registerBox} />
          ))}
          <div className="w-44 sm:w-60 shrink-0">
            <div className="kicker text-[10px] sm:text-[11px] text-emerald-400 font-semibold mb-3 text-center">
              {t(ROUND_LABEL_KEYS.F)}
            </div>
            <div style={{ height: finalSlotHeight }} className="flex flex-col justify-center">
              <BracketMatch match={final} boxRef={(el) => registerBox(matchKey('F', 0), el)} />
            </div>
          </div>
          {rightHalves.map(({ roundKey, depth, indexedMatches }, ci) => (
            <BracketColumn key={`r-${ci}`} roundKey={roundKey} depth={depth} indexedMatches={indexedMatches} registerBox={registerBox} />
          ))}
        </div>
      </div>
    </div>
  )
}

// Small-screen fallback for the bracket tree: the funnel-shaped, horizontally
// scrolling tree reads poorly on a phone (tiny cards, sideways scrolling).
// This renders the same 31 matches as a plain vertical list grouped by
// round instead — no wiring lines, just the matches in bracket order.
function MobileBracketList({ tree }) {
  const { t } = useLang()
  return (
    <div className="space-y-6">
      {tree.map((rnd) => (
        <div key={rnd.round}>
          <div className="kicker text-[11px] text-mist-500 font-semibold mb-3">{t(ROUND_LABEL_KEYS[rnd.round])}</div>
          <div className="space-y-3">
            {rnd.matches.map((m, i) => (
              <BracketMatch key={i} match={m} boxRef={() => {}} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ResultRow({ match }) {
  const { t, tTeam } = useLang()
  const isHost = Boolean(match.country) && match.country === match.home_team
  const venue = match.city ? `${match.city}${match.country ? `, ${tTeam(match.country)}` : ''}` : undefined
  return (
    <div className="flex items-center gap-1.5 sm:gap-3 py-2 border-b border-line last:border-0" title={venue}>
      <span className="hidden sm:block font-mono text-[11px] text-mist-700 w-20 shrink-0">{match.date}</span>
      <span className="flex-1 flex items-center justify-end gap-1.5 sm:gap-2 min-w-0">
        <span className={`truncate text-xs sm:text-sm ${match.played && match.winner === match.home_team ? 'text-mist-50 font-semibold' : 'text-mist-300'}`}>
          {tTeam(match.home_team)}
        </span>
        {isHost && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-label="Host nation" />}
        <span className="shrink-0">{flagFor(match.home_team)}</span>
      </span>
      <span className="font-mono text-xs sm:text-sm w-11 sm:w-14 text-center shrink-0">
        {match.played ? `${match.home_score}–${match.away_score}` : <span className="text-mist-700 text-[10px] sm:text-xs">{t('upcoming')}</span>}
      </span>
      <span className="flex-1 flex items-center gap-1.5 sm:gap-2 min-w-0">
        <span className="shrink-0">{flagFor(match.away_team)}</span>
        <span className={`truncate text-xs sm:text-sm ${match.played && match.winner === match.away_team ? 'text-mist-50 font-semibold' : 'text-mist-300'}`}>
          {tTeam(match.away_team)}
        </span>
      </span>
    </div>
  )
}

function GroupTable({ letter, standings }) {
  const { t, tTeam } = useLang()
  return (
    <div className="rounded-lg border border-line overflow-hidden">
      <div className="px-3 py-2 bg-white/[0.03] border-b border-line font-display text-sm font-semibold text-mist-50">
        {t('group_label', { letter })}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-mist-500 border-b border-line">
            <th className="text-left px-3 py-1.5 font-normal">{t('col_team')}</th>
            <th className="px-2 py-1.5 font-normal">{t('col_played')}</th>
            <th className="px-2 py-1.5 font-normal">{t('col_gd')}</th>
            <th className="px-2 py-1.5 font-normal">{t('col_pts')}</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr key={s.team} className={`border-b border-line last:border-0 ${i < 2 ? 'text-mist-50' : 'text-mist-500'}`}>
              <td className="px-3 py-1.5">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0">{flagFor(s.team)}</span>
                  <span className={`truncate ${i < 2 ? 'font-semibold' : ''}`}>{tTeam(s.team)}</span>
                </span>
              </td>
              <td className="text-center px-2 py-1.5 font-mono">{s.played}</td>
              <td className="text-center px-2 py-1.5 font-mono">{s.goal_diff > 0 ? `+${s.goal_diff}` : s.goal_diff}</td>
              <td className="text-center px-2 py-1.5 font-mono font-bold text-emerald-400">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UpsetRow({ u }) {
  const { t, tTeam } = useLang()
  return (
    <div className="flex items-center gap-1.5 sm:gap-3 py-2 border-b border-line last:border-0">
      <span className="hidden sm:block font-mono text-[11px] text-mist-700 w-20 shrink-0">{u.date}</span>
      <span className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
        <span className="shrink-0">{flagFor(u.winner)}</span>
        <span className="text-mist-50 font-semibold truncate text-xs sm:text-sm">{tTeam(u.winner)}</span>
      </span>
      <span className="font-mono text-xs sm:text-sm text-mist-500 w-12 sm:w-16 text-center shrink-0">
        {u.home_score}–{u.away_score}
      </span>
      <span className="flex-1 min-w-0 text-right">
        <span className="text-mist-500 text-xs sm:text-sm truncate">{t('beat')} {tTeam(u.favorite)}</span>
      </span>
      <span className="font-mono text-[10px] sm:text-xs text-crimson-500 w-12 sm:w-16 text-right shrink-0">Δ{u.elo_gap}</span>
    </div>
  )
}

export default function Results() {
  const { t } = useLang()
  const [tree, setTree] = useState(null)
  const [matches, setMatches] = useState(null)
  const [groupStandings, setGroupStandings] = useState(null)
  const [upsets, setUpsets] = useState(null)
  const [error, setError] = useState(null)
  const [openRounds, setOpenRounds] = useState(() => new Set(['R32', 'R16', 'QF', 'SF', 'F']))

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/bracket-tree`).then((r) => r.json()),
      fetch(`${API_BASE}/results`).then((r) => r.json()),
      fetch(`${API_BASE}/group-standings`).then((r) => r.json()),
      fetch(`${API_BASE}/upsets`).then((r) => r.json()),
    ])
      .then(([bt, m, g, u]) => {
        setTree(bt)
        setMatches(m)
        setGroupStandings(g)
        setUpsets(u)
      })
      .catch(() => setError('error_results'))
  }, [])

  const toggleRound = (round) => {
    setOpenRounds((prev) => {
      const next = new Set(prev)
      next.has(round) ? next.delete(round) : next.add(round)
      return next
    })
  }

  if (error) {
    return <div className="rounded-lg border border-crimson-500/40 bg-void-800/60 px-4 py-3 text-sm text-crimson-500">{t(error)}</div>
  }
  if (!tree || !matches || !groupStandings || !upsets) {
    return <div className="text-center text-mist-500 text-sm py-16">{t('loading_results')}</div>
  }

  const byRound = {}
  for (const m of matches) {
    ;(byRound[m.round] ||= []).push(m)
  }

  return (
    <div className="flicker-in space-y-6">
      {/* Bracket tree */}
      <div className="glass rounded-2xl p-4 sm:p-6 lg:p-8">
        <h2 className="font-display text-xl font-semibold text-mist-50 mb-1">{t('knockout_bracket')}</h2>
        <p className="text-xs text-mist-500 mb-6">{t('knockout_desc')}</p>
        <div className="hidden sm:block">
          <BracketTree tree={tree} />
        </div>
        <div className="sm:hidden">
          <MobileBracketList tree={tree} />
        </div>
      </div>

      {/* Biggest upsets */}
      {upsets.length > 0 && (
        <div className="glass rounded-2xl p-4 sm:p-6 lg:p-8">
          <h2 className="font-display text-xl font-semibold text-mist-50 mb-1">{t('biggest_upsets')}</h2>
          <p className="text-xs text-mist-500 mb-6">{t('upsets_desc')}</p>
          <div>
            {upsets.slice(0, 10).map((u) => (
              <UpsetRow key={`${u.date}-${u.home_team}-${u.away_team}`} u={u} />
            ))}
          </div>
        </div>
      )}

      {/* Group standings */}
      <div className="glass rounded-2xl p-4 sm:p-6 lg:p-8">
        <h2 className="font-display text-xl font-semibold text-mist-50 mb-1">{t('group_standings')}</h2>
        <p className="text-xs text-mist-500 mb-6">{t('standings_desc')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(groupStandings).map(([letter, standings]) => (
            <GroupTable key={letter} letter={letter} standings={standings} />
          ))}
        </div>
      </div>

      {/* Full results list */}
      <div className="glass rounded-2xl p-4 sm:p-6 lg:p-8">
        <h2 className="font-display text-xl font-semibold text-mist-50 mb-1">{t('all_results')}</h2>
        <p className="text-xs text-mist-500 mb-6">{t('all_results_desc')}</p>

        <div className="space-y-2">
          {ROUND_ORDER.filter((r) => byRound[r]?.length).map((round) => {
            const roundMatches = byRound[round].slice().sort((a, b) => a.date.localeCompare(b.date))
            const played = roundMatches.filter((m) => m.played).length
            const isOpen = openRounds.has(round)
            return (
              <div key={round} className="rounded-lg border border-line overflow-hidden">
                <button
                  onClick={() => toggleRound(round)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] transition text-left"
                >
                  <span className="font-display text-sm font-semibold text-mist-50">{t(ROUND_LABEL_KEYS[round])}</span>
                  <span className="font-mono text-[11px] text-mist-500">
                    {t('played_count', { played, total: roundMatches.length })} {isOpen ? '▲' : '▼'}
                  </span>
                </button>
                {isOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.2 }}
                    className="px-4 py-2 max-h-96 overflow-y-auto thin-scroll"
                  >
                    {roundMatches.map((m) => (
                      <ResultRow key={`${m.date}-${m.home_team}-${m.away_team}`} match={m} />
                    ))}
                  </motion.div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
