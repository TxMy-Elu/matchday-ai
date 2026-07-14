import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { flagFor } from './flags.js'
import { useLang } from './i18n.jsx'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const ROUND_ORDER = ['Group Stage', 'R32', 'R16', 'QF', 'SF', 'TP', 'F']
const ROUND_LABEL_KEYS = {
  'Group Stage': 'round_group',
  R32: 'round_r32',
  R16: 'round_r16',
  QF: 'round_qf',
  SF: 'round_sf',
  TP: 'round_tp',
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

// The first round (in tree order) that isn't 100% played yet — earlier
// rounds are fully decided and just clutter the funnel view (their results
// are still in the "All Results" list below), so the tree starts here
// instead of always at Round of 32. Falls back to the last round (Final)
// if literally everything has been played.
function firstVisibleRoundIndex(tree) {
  for (let i = 0; i < tree.length - 1; i++) {
    if (!tree[i].matches.every((m) => m.played)) return i
  }
  return tree.length - 1
}

// Pure index math: round R+1's slot k is always fed by round R's slots
// 2k and 2k+1 (the standard bracket-sheet convention — see tournament.py's
// R32_BRACKET_ORDER for where the Round of 32's own order comes from).
// This wiring is fixed regardless of whether either side is known yet, so
// every edge is always drawn, even between two "TBD" slots. Operates on the
// full tree (not just the visible slice) — edges into a hidden round's box
// simply find no ref and are skipped, which is what we want.
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

function BracketMatch({ match, boxRef, emphasis, dim }) {
  const { t } = useLang()
  const played = match.played
  return (
    <div
      ref={boxRef}
      className={`rounded-lg overflow-hidden border bg-void-900 shadow-lg shadow-black/40 ${
        emphasis ? 'border-emerald-500/50 ring-1 ring-emerald-500/30' : 'border-line'
      } ${dim ? 'opacity-70' : ''}`}
    >
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

// The third-place match isn't part of the single-elimination tree (it pairs
// the two Semifinal *losers*, not winners advancing) but it's fed by the
// exact same two Semifinal boxes as the Final. Its edges leave from the
// *bottom* of each Semifinal box (not the vertical center the Final's edges
// use) and land on the left/right side of the third-place box, so the two
// pairs of lines never share a start point or cross each other.
function thirdPlaceEdges() {
  return [
    { fromKey: matchKey('SF', 0), side: 'left' },
    { fromKey: matchKey('SF', 1), side: 'right' },
  ]
}

// Same sharp right-angle elbow as computeEdges' lines (drop straight down,
// then a single horizontal run into the box) — no curve, so it reads as
// the same drafting style as the rest of the tree.
function elbowPath(x1, y1, x2, y2) {
  return `M ${x1} ${y1} V ${y2} H ${x2}`
}

function BracketTree({ tree, thirdPlaceMatch }) {
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
        const x1 = fromRect.right - contentRect.left
        const y1 = fromRect.top + fromRect.height / 2 - contentRect.top
        const x2 = toRect.left - contentRect.left
        const y2 = toRect.top + toRect.height / 2 - contentRect.top
        const midX = (x1 + x2) / 2
        newLines.push({ key: `${fromKey}->${toKey}`, d: `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`, muted: false })
      }

      if (thirdPlaceMatch) {
        const toEl = boxes.current[matchKey('TP', 0)]
        if (toEl) {
          const toRect = toEl.getBoundingClientRect()
          for (const { fromKey, side } of thirdPlaceEdges()) {
            const fromEl = boxes.current[fromKey]
            if (!fromEl) continue
            const fromRect = fromEl.getBoundingClientRect()
            const x1 = fromRect.left + fromRect.width / 2 - contentRect.left
            const y1 = fromRect.bottom - contentRect.top
            const x2 = (side === 'left' ? toRect.left : toRect.right) - contentRect.left
            const y2 = toRect.top + toRect.height / 2 - contentRect.top
            newLines.push({ key: `${fromKey}->TP`, d: elbowPath(x1, y1, x2, y2), muted: true })
          }
        }
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
  }, [tree, thirdPlaceMatch])

  // Split the tree into the two halves of the draw and fan them in from
  // opposite sides toward the Final in the center — the classic "Final
  // Four" layout. Fully-played leading rounds are dropped first (see
  // firstVisibleRoundIndex) so the funnel always starts at whichever round
  // is actually still in progress, rather than always at Round of 32.
  // Global indices (used by matchKey/computeEdges) are preserved exactly —
  // only which rounds get rendered changes, not their numbering.
  const withIndex = (matches, offset) => matches.map((m, i) => ({ m, i: i + offset }))
  const startIdx = firstVisibleRoundIndex(tree)
  const visible = tree.slice(startIdx) // always ends with the Final
  const rounds = visible.slice(0, -1) // every visible round except the Final
  const final = visible[visible.length - 1].matches[0]

  const leftHalves = []
  const rightHalves = []
  rounds.forEach(({ round: roundKey, matches }, depth) => {
    const half = matches.length / 2
    leftHalves.push({ roundKey, depth, indexedMatches: withIndex(matches.slice(0, half), 0) })
    rightHalves.unshift({ roundKey, depth, indexedMatches: withIndex(matches.slice(half), half) })
  })
  const finalDepth = Math.max(rounds.length - 1, 0)
  const finalSlotHeight = slotHeight(finalDepth)

  return (
    <div className="overflow-x-auto thin-scroll pb-2">
      <div ref={contentRef} className="relative inline-block">
        <svg className="absolute inset-0 pointer-events-none" width={size.w || '100%'} height={size.h || '100%'}>
          <defs>
            <linearGradient id="bracket-line" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#34D399" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="bracket-line-muted" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#71717A" stopOpacity="0.25" />
            </linearGradient>
          </defs>
          {lines.map(({ d, key, muted }) => (
            <path key={key} d={d} fill="none" stroke={muted ? 'url(#bracket-line-muted)' : 'url(#bracket-line)'} strokeWidth="2" />
          ))}
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
            {/* Sized to exactly finalSlotHeight (not inflated for the
                third-place box below) so the Final stays vertically centered
                at the same height as the Semifinal boxes — its connector
                lines are a single clean bend only when both ends line up;
                any extra height here would offset it and turn that bend
                into a visible little zigzag. */}
            <div style={{ height: finalSlotHeight }} className="flex flex-col justify-center">
              <BracketMatch match={final} boxRef={(el) => registerBox(matchKey('F', 0), el)} emphasis />
            </div>
            {thirdPlaceMatch && (
              <div className="mt-4">
                <div className="kicker text-[10px] sm:text-[11px] text-mist-500 font-semibold mb-2 text-center">
                  {t(ROUND_LABEL_KEYS.TP)}
                </div>
                <BracketMatch match={thirdPlaceMatch} boxRef={(el) => registerBox(matchKey('TP', 0), el)} dim />
              </div>
            )}
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
function MobileBracketList({ tree, thirdPlaceMatch }) {
  const { t } = useLang()
  const visible = tree.slice(firstVisibleRoundIndex(tree))
  // Insert the third-place match right before the Final, matching where it
  // sits in the desktop funnel (fed by the same two Semifinal boxes).
  const withThirdPlace = thirdPlaceMatch
    ? [...visible.slice(0, -1), { round: 'TP', matches: [thirdPlaceMatch] }, visible[visible.length - 1]]
    : visible
  return (
    <div className="space-y-6">
      {withThirdPlace.map((rnd) => (
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
  const [thirdPlaceMatch, setThirdPlaceMatch] = useState(null)
  const [error, setError] = useState(null)
  const [openRounds, setOpenRounds] = useState(() => new Set(['R32', 'R16', 'QF', 'SF', 'TP', 'F']))

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/bracket-tree`).then((r) => r.json()),
      fetch(`${API_BASE}/results`).then((r) => r.json()),
      fetch(`${API_BASE}/group-standings`).then((r) => r.json()),
      fetch(`${API_BASE}/upsets`).then((r) => r.json()),
      fetch(`${API_BASE}/third-place-match`).then((r) => r.json()),
    ])
      .then(([bt, m, g, u, tp]) => {
        setTree(bt)
        setMatches(m)
        setGroupStandings(g)
        setUpsets(u)
        setThirdPlaceMatch(tp)
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
          <BracketTree tree={tree} thirdPlaceMatch={thirdPlaceMatch} />
        </div>
        <div className="sm:hidden">
          <MobileBracketList tree={tree} thirdPlaceMatch={thirdPlaceMatch} />
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
