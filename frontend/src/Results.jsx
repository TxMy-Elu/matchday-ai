import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flagFor } from './flags.js'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const ROUND_ORDER = ['Group Stage', 'R32', 'R16', 'QF', 'SF', 'F']
const ROUND_LABELS = {
  'Group Stage': 'Group Stage',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinals',
  SF: 'Semifinals',
  F: 'Final',
}

function TeamRow({ team, score, isWinner, showScore, borderTop }) {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 py-2 border-l-2 ${borderTop ? 'border-t border-t-pitchline' : ''} ${
        isWinner ? 'border-l-floodlight-500 bg-pitch-800' : 'border-l-transparent bg-pitch-900/60'
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        {team && <span className="text-base shrink-0">{flagFor(team)}</span>}
        <span
          className={`truncate text-xs font-semibold uppercase tracking-wide ${
            !team ? 'text-chalk-600 italic normal-case font-normal' : isWinner ? 'text-chalk-50' : 'text-chalk-400'
          }`}
        >
          {team || 'À déterminer'}
        </span>
      </span>
      {showScore ? (
        <span
          className={`w-7 h-7 shrink-0 flex items-center justify-center rounded font-mono text-sm font-bold ${
            isWinner ? 'bg-floodlight-500 text-pitch-950' : 'bg-pitch-700 text-chalk-400'
          }`}
        >
          {score}
        </span>
      ) : (
        <span className="w-7 h-7 shrink-0 flex items-center justify-center rounded bg-pitch-900 border border-pitchline text-chalk-600 text-xs">
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
// every edge is always drawn, even between two "À déterminer" slots.
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
  const played = match.played
  return (
    <div ref={boxRef} className="rounded-lg overflow-hidden border border-pitchline bg-pitch-950">
      <div className="flex items-center justify-between px-3 py-1.5 bg-pitch-950">
        <span className="text-[10px] font-mono text-chalk-400 uppercase tracking-wide">{match.date || '—'}</span>
        <span className="text-[10px] font-mono text-chalk-600 uppercase tracking-wide">Score</span>
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
        <div className="px-3 py-1 bg-pitch-950/60 text-center text-[10px] uppercase tracking-wide text-chalk-600">
          À venir
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
  const h = slotHeight(depth)
  return (
    <div className="w-56 shrink-0">
      <div className="text-[11px] uppercase tracking-[0.2em] text-chalk-400 font-semibold mb-3 text-center">
        {ROUND_LABELS[roundKey]}
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
          {lines.map(({ x1, y1, x2, y2, key }) => {
            const midX = (x1 + x2) / 2
            return <path key={key} d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`} fill="none" stroke="#2A3B30" strokeWidth="2" />
          })}
        </svg>
        {/* A position:absolute sibling (the SVG above) always paints after
            plain static-position siblings in CSS stacking order, no matter
            the DOM order — so without this wrapper being explicitly
            positioned too, the lines would render on top of the cards
            instead of behind them. */}
        <div className="relative z-10 flex gap-14">
          {leftHalves.map(({ roundKey, depth, indexedMatches }, ci) => (
            <BracketColumn key={`l-${ci}`} roundKey={roundKey} depth={depth} indexedMatches={indexedMatches} registerBox={registerBox} />
          ))}
          <div className="w-56 shrink-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-floodlight-500 font-semibold mb-3 text-center">
              {ROUND_LABELS.F}
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

function ResultRow({ match }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-pitchline/50 last:border-0">
      <span className="font-mono text-[11px] text-chalk-600 w-20 shrink-0">{match.date}</span>
      <span className="flex-1 flex items-center justify-end gap-2 min-w-0">
        <span className={`truncate text-sm ${match.played && match.winner === match.home_team ? 'text-chalk-50 font-semibold' : 'text-chalk-200'}`}>
          {match.home_team}
        </span>
        <span>{flagFor(match.home_team)}</span>
      </span>
      <span className="font-mono text-sm w-14 text-center shrink-0">
        {match.played ? `${match.home_score}–${match.away_score}` : <span className="text-chalk-600 text-xs">à venir</span>}
      </span>
      <span className="flex-1 flex items-center gap-2 min-w-0">
        <span>{flagFor(match.away_team)}</span>
        <span className={`truncate text-sm ${match.played && match.winner === match.away_team ? 'text-chalk-50 font-semibold' : 'text-chalk-200'}`}>
          {match.away_team}
        </span>
      </span>
    </div>
  )
}

function GroupTable({ letter, standings }) {
  return (
    <div className="rounded-lg border border-pitchline overflow-hidden">
      <div className="px-3 py-2 bg-pitch-900/60 font-display text-sm tracking-wide text-chalk-50">Group {letter}</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-chalk-400 border-b border-pitchline">
            <th className="text-left px-3 py-1.5 font-normal">Team</th>
            <th className="px-2 py-1.5 font-normal">P</th>
            <th className="px-2 py-1.5 font-normal">GD</th>
            <th className="px-2 py-1.5 font-normal">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr key={s.team} className={`border-b border-pitchline/50 last:border-0 ${i < 2 ? 'text-chalk-50' : 'text-chalk-400'}`}>
              <td className="px-3 py-1.5">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0">{flagFor(s.team)}</span>
                  <span className={`truncate ${i < 2 ? 'font-semibold' : ''}`}>{s.team}</span>
                </span>
              </td>
              <td className="text-center px-2 py-1.5 font-mono">{s.played}</td>
              <td className="text-center px-2 py-1.5 font-mono">{s.goal_diff > 0 ? `+${s.goal_diff}` : s.goal_diff}</td>
              <td className="text-center px-2 py-1.5 font-mono font-bold text-floodlight-500">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UpsetRow({ u }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-pitchline/50 last:border-0">
      <span className="font-mono text-[11px] text-chalk-600 w-20 shrink-0">{u.date}</span>
      <span className="flex items-center gap-2 flex-1 min-w-0">
        <span className="shrink-0">{flagFor(u.winner)}</span>
        <span className="text-chalk-50 font-semibold truncate">{u.winner}</span>
      </span>
      <span className="font-mono text-sm text-chalk-400 w-16 text-center shrink-0">
        {u.home_score}–{u.away_score}
      </span>
      <span className="flex-1 min-w-0 text-right">
        <span className="text-chalk-400 text-sm truncate">beat {u.favorite}</span>
      </span>
      <span className="font-mono text-xs text-floodlight-500 w-16 text-right shrink-0">Δ{u.elo_gap}</span>
    </div>
  )
}

export default function Results() {
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
      .then(([t, m, g, u]) => {
        setTree(t)
        setMatches(m)
        setGroupStandings(g)
        setUpsets(u)
      })
      .catch(() => setError('Could not load results. Is the backend running on :8000?'))
  }, [])

  const toggleRound = (round) => {
    setOpenRounds((prev) => {
      const next = new Set(prev)
      next.has(round) ? next.delete(round) : next.add(round)
      return next
    })
  }

  if (error) {
    return <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>
  }
  if (!tree || !matches || !groupStandings || !upsets) {
    return <div className="text-center text-chalk-400 text-sm py-16">Loading results…</div>
  }

  const byRound = {}
  for (const m of matches) {
    ;(byRound[m.round] ||= []).push(m)
  }

  return (
    <div className="flicker-in space-y-6">
      {/* Bracket tree */}
      <div className="scoreboard-panel rounded-2xl p-6 sm:p-8">
        <h2 className="font-display text-xl tracking-wide text-chalk-50 mb-1">KNOCKOUT BRACKET</h2>
        <p className="text-xs text-chalk-400 mb-6">
          The full tree toward the final. "À déterminer" slots follow the official bracket order — the pairing
          itself is fixed, only the teams (and scores) fill in once each round is actually played.
        </p>
        <BracketTree tree={tree} />
      </div>

      {/* Biggest upsets */}
      {upsets.length > 0 && (
        <div className="scoreboard-panel rounded-2xl p-6 sm:p-8">
          <h2 className="font-display text-xl tracking-wide text-chalk-50 mb-1">BIGGEST UPSETS</h2>
          <p className="text-xs text-chalk-400 mb-6">
            Matches where the lower-Elo team won outright, ranked by how big the pre-match Elo gap was.
          </p>
          <div>
            {upsets.slice(0, 10).map((u) => (
              <UpsetRow key={`${u.date}-${u.home_team}-${u.away_team}`} u={u} />
            ))}
          </div>
        </div>
      )}

      {/* Group standings */}
      <div className="scoreboard-panel rounded-2xl p-6 sm:p-8">
        <h2 className="font-display text-xl tracking-wide text-chalk-50 mb-1">GROUP STANDINGS</h2>
        <p className="text-xs text-chalk-400 mb-6">
          Points, then goal difference, then goals scored. Doesn't apply FIFA's full tiebreaker rules
          (head-to-head, fair play) — good enough to see who's through, not a guarantee of the official order
          in a genuine tiebreak.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(groupStandings).map(([letter, standings]) => (
            <GroupTable key={letter} letter={letter} standings={standings} />
          ))}
        </div>
      </div>

      {/* Full results list */}
      <div className="scoreboard-panel rounded-2xl p-6 sm:p-8">
        <h2 className="font-display text-xl tracking-wide text-chalk-50 mb-1">ALL RESULTS</h2>
        <p className="text-xs text-chalk-400 mb-6">Every 2026 World Cup match, group stage through the final.</p>

        <div className="space-y-2">
          {ROUND_ORDER.filter((r) => byRound[r]?.length).map((round) => {
            const roundMatches = byRound[round].slice().sort((a, b) => a.date.localeCompare(b.date))
            const played = roundMatches.filter((m) => m.played).length
            const isOpen = openRounds.has(round)
            return (
              <div key={round} className="rounded-lg border border-pitchline overflow-hidden">
                <button
                  onClick={() => toggleRound(round)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-pitch-900/60 hover:bg-pitch-900 transition text-left"
                >
                  <span className="font-display text-sm tracking-wide text-chalk-50">{ROUND_LABELS[round]}</span>
                  <span className="font-mono text-[11px] text-chalk-400">
                    {played}/{roundMatches.length} played {isOpen ? '▲' : '▼'}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-4 py-2 max-h-96 overflow-y-auto thin-scroll">
                    {roundMatches.map((m) => (
                      <ResultRow key={`${m.date}-${m.home_team}-${m.away_team}`} match={m} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
