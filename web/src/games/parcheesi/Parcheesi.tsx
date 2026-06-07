/* PARCHEESI — UI (built for this codebase). Cross-and-circle board on the framework shell:
   four colored START circles, a shared 68-square loop, four home paths into the CENTER.
   Solo: you (seat 0) play three heuristic AIs. Online: useGameSession runs the authoritative
   logic on the host, fills empty seats with AI, and hands each guest a per-seat view. The view
   is seat-relative: "you" is the local mySeat, and the banner, panels, movable pawns and result
   are all from that seat's perspective. Roll TWO dice, then click a glowing pawn and a die to
   move. A 5 releases a pawn; capture a lone rival for a +20 bonus; reach the center for a +10
   bonus; two pawns on a square form a blockade; doubles roll again.

   Rivals are named ("Coral"/"Teal"/"Amber") in solo play; online they become "Player N"
   (the real name of a remote human is unknown). */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import * as P from './logic'
import type { ParState } from './logic'
import { parcheesiAdapter, type ParcheesiIntent } from './net'

/* ---- Board geometry: a 17×17 grid. ----
   ABS[a] = [row,col] for shared-loop absolute square a (0..67), walked clockwise starting at
   player 0's ENTRY square. Player p's ENTRY = ABS[p*17]. Four 3-wide arms cross at the center.
   PATHS[p] = the 5 home-path cells (progress 64..68) leading into the center for player p.
   STARTS[p] = the 2×2 pad of START-circle slots in each corner base. */
const N = 17

// 68 loop cells [row,col] in path order beginning at player 0's ENTRY (bottom arm, left lane).
// Player 0 enters at the bottom and travels UP the left lane, around clockwise.
const ABS: [number, number][] = [
  // p0 entry & up the left lane of the bottom arm (col 7), rows 15..9
  [15, 7], [14, 7], [13, 7], [12, 7], [11, 7], [10, 7], [9, 7],
  // across the bottom of the left arm (row 9), cols 6..0
  [9, 6], [9, 5], [9, 4], [9, 3], [9, 2], [9, 1], [9, 0],
  // up the left edge (col 0), row 8  ·  then p1 entry lane down col 0? -> turn at row 8
  [8, 0],
  // p1 entry & along the top of the left arm (row 7), cols 1..7
  [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7],
  // up the right lane of the top arm (col 7), rows 6..0
  [6, 7], [5, 7], [4, 7], [3, 7], [2, 7], [1, 7], [0, 7],
  // across the top (col 8)
  [0, 8],
  // p2 entry & down the left lane of the top arm (col 9), rows 1..7
  [1, 9], [2, 9], [3, 9], [4, 9], [5, 9], [6, 9], [7, 9],
  // across the top of the right arm (row 7), cols 10..16
  [7, 10], [7, 11], [7, 12], [7, 13], [7, 14], [7, 15], [7, 16],
  // down the right edge (row 8)
  [8, 16],
  // p3 entry & along the bottom of the right arm (row 9), cols 15..9
  [9, 15], [9, 14], [9, 13], [9, 12], [9, 11], [9, 10], [9, 9],
  // down the right lane of the bottom arm (col 9), rows 10..16
  [10, 9], [11, 9], [12, 9], [13, 9], [14, 9], [15, 9], [16, 9],
  // across the bottom (col 8)
  [16, 8],
  // back up the left lane of the bottom arm toward p0 entry (col 7), rows 16
  [16, 7],
]

// Home-path cells (progress 64..68) per player — the colored run into the center column.
const PATHS: [number, number][][] = [
  [[15, 8], [14, 8], [13, 8], [12, 8], [11, 8]], // p0 up the bottom-center column
  [[8, 1], [8, 2], [8, 3], [8, 4], [8, 5]],       // p1 across the left-center row
  [[1, 8], [2, 8], [3, 8], [4, 8], [5, 8]],       // p2 down the top-center column
  [[8, 15], [8, 14], [8, 13], [8, 12], [8, 11]],  // p3 across the right-center row
]

// START-circle pad cells (2×2) per player, inside each corner base.
const STARTS: [number, number][][] = [
  [[13, 2], [13, 4], [15, 2], [15, 4]], // p0 bottom-left
  [[1, 2], [1, 4], [3, 2], [3, 4]],     // p1 top-left
  [[1, 12], [1, 14], [3, 12], [3, 14]], // p2 top-right
  [[13, 12], [13, 14], [15, 12], [15, 14]], // p3 bottom-right
]

// Corner base bounding boxes [r0,c0,r1,c1] (6×6) for coloring.
const BASES: [number, number, number, number][] = [
  [11, 0, 16, 5],  // p0 bottom-left
  [0, 0, 5, 5],    // p1 top-left
  [0, 11, 5, 16],  // p2 top-right
  [11, 11, 16, 16], // p3 bottom-right
]

const CENTER = [7, 7, 9, 9] as const

const cellKey = (r: number, c: number) => r * N + c

const PLAYER_CLASS = ['p0', 'p1', 'p2', 'p3']
const PLAYER_NAME = ['You', 'Coral', 'Teal', 'Amber']

// Seat-relative display name: the local seat is "You"; rivals keep their named persona in
// solo play, but online become "Player N" (a remote human's real name is unknown).
function nameFor(p: number, mySeat: number, online: boolean): string {
  if (p === mySeat) return 'You'
  if (!online) return PLAYER_NAME[p] ?? `Player ${p + 1}`
  return `Player ${p + 1}`
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1b1d2c" stroke="#3a3a58" strokeWidth="1.5" />
    <path d="M19 6 h10 v13 h13 v10 h-13 v13 h-10 v-13 h-13 v-10 h13 z" fill="#2a2c42" stroke="#4a4a70" strokeWidth="1" />
    <circle cx="24" cy="24" r="5" fill="#f4f2fb" stroke="#1b1d2c" strokeWidth="1.2" />
    <circle cx="11" cy="11" r="3.4" fill="#8a6cf0" />
    <circle cx="37" cy="11" r="3.4" fill="#e0584f" />
    <circle cx="11" cy="37" r="3.4" fill="#36b3a8" />
    <circle cx="37" cy="37" r="3.4" fill="#e0a23a" />
  </svg>
)

// Standard die-face pip layout (3×3 grid indices that are filled).
const PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
}
function Die({ v, used, live, onClick }: { v: number | null; used?: boolean; live?: boolean; onClick?: () => void }) {
  const on = new Set(v ? PIPS[v] : [])
  return (
    <div className={'par-die' + (used ? ' used' : '') + (live ? ' live' : '')}
      onClick={live && !used ? onClick : undefined}>
      {Array.from({ length: 9 }, (_, i) => <span key={i} className={'par-pip' + (v && on.has(i) ? '' : ' off')} />)}
    </div>
  )
}

export function Parcheesi() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(parcheesiAdapter)
  const [showRules, setShowRules] = useState(false)
  const [selDie, setSelDie] = useState<number | null>(null) // 0 or 1, the die you chose to move with

  function newGame() { netNew(); setShowRules(false); setSelDie(null) }

  const online = net.online
  const yourTurn = s.winner == null && isMyTurn
  const canRoll = yourTurn && s.phase === 'roll' && !s.rolled

  // The die value you are currently moving with (bonus pool, or a chosen unused die).
  const activeDie: number | null = useMemo(() => {
    if (!yourTurn || s.phase !== 'move' || !s.rolled) return null
    if (s.bonus > 0) return s.bonus
    if (s.dice == null) return null
    if (selDie != null && !s.usedDice[selDie]) return s.dice[selDie]
    // default to the first unused die
    if (!s.usedDice[0]) return s.dice[0]
    if (!s.usedDice[1]) return s.dice[1]
    return null
  }, [yourTurn, s.phase, s.rolled, s.bonus, s.dice, s.usedDice, selDie])

  const sumRelease = useMemo(
    () => yourTurn && s.phase === 'move' && s.rolled && s.bonus === 0 &&
      s.dice != null && !s.usedDice[0] && !s.usedDice[1] && s.dice[0] + s.dice[1] === 5,
    [yourTurn, s.phase, s.rolled, s.bonus, s.dice, s.usedDice],
  )

  // Movable pawn indices for the local seat, given the active die (+ any sum-release pawns).
  const movable = useMemo(() => {
    const set = new Set<number>()
    if (!yourTurn || s.phase !== 'move' || !s.rolled) return set
    if (activeDie != null) for (const i of P.legalMoves(s, mySeat, activeDie)) set.add(i)
    if (sumRelease) for (let i = 0; i < P.PAWNS; i++) if (P.canReleaseWithSum(s, mySeat, i)) set.add(i)
    return set
  }, [yourTurn, s.phase, s.rolled, s, activeDie, sumRelease, mySeat])

  function rollNow() { if (canRoll) { dispatch({ kind: 'roll' }); setSelDie(null) } }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setSelDie(null) },
    extra: (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && canRoll) { rollNow(); return true }
      if ((e.key === '1' || e.key === '2') && yourTurn && s.phase === 'move' && s.bonus === 0) {
        const slot = e.key === '1' ? 0 : 1
        if (s.dice && !s.usedDice[slot]) { setSelDie(slot); return true }
      }
      return false
    },
  })

  function clickPawn(player: number, i: number) {
    if (player !== mySeat || !yourTurn || s.phase !== 'move' || !movable.has(i)) return
    if (s.bonus > 0) { dispatch({ kind: 'move', token: i, die: s.bonus }); return }
    // prefer a plain die move; fall back to sum-release if only that is legal for this pawn
    if (activeDie != null && P.destOf(s, mySeat, i, activeDie) != null) {
      dispatch({ kind: 'move', token: i, die: activeDie }); setSelDie(null); return
    }
    if (sumRelease && P.canReleaseWithSum(s, mySeat, i)) { dispatch({ kind: 'move', token: i, die: 5 }); setSelDie(null) }
  }

  // occupants on loop + home-path cells
  const cellTokens = useMemo(() => {
    const m = new Map<number, { player: number; i: number; mv: boolean; stack: number }>()
    const counts = new Map<number, number>()
    for (let p = 0; p < P.PLAYERS; p++) {
      s.pawns[p].forEach((prog, i) => {
        let cell = -1
        if (prog >= 1 && prog <= 63) { const [r, c] = ABS[P.absSquare(p, prog)]; cell = cellKey(r, c) }
        else if (prog >= P.PATH_FIRST && prog < P.HOME) { const [r, c] = PATHS[p][prog - P.PATH_FIRST]; cell = cellKey(r, c) }
        if (cell >= 0) {
          const stack = (counts.get(cell) || 0) + 1
          counts.set(cell, stack)
          const prev = m.get(cell)
          const mv = p === mySeat && movable.has(i)
          if (!prev || (mv && !prev.mv)) m.set(cell, { player: p, i, mv, stack })
          else m.set(cell, Object.assign({}, prev, { stack }))
        }
      })
    }
    return m
  }, [s.pawns, movable, mySeat])

  // START-circle pawns: each player's pawns still in start fill the pad slots in order.
  const startTokens = useMemo(() => {
    const m = new Map<number, { player: number; i: number; mv: boolean }>()
    for (let p = 0; p < P.PLAYERS; p++) {
      let slot = 0
      s.pawns[p].forEach((prog, i) => {
        if (prog === P.START) {
          const [r, c] = STARTS[p][slot]; slot++
          m.set(cellKey(r, c), { player: p, i, mv: p === mySeat && movable.has(i) })
        }
      })
    }
    return m
  }, [s.pawns, movable, mySeat])

  // HOME pawns count per player (shown in center)
  const homeCounts = [0, 1, 2, 3].map(p => P.homeCount(s, p))

  const lastCell = useMemo(() => {
    if (!s.last) return -1
    const { player, to } = s.last
    if (to >= 1 && to <= 63) { const [r, c] = ABS[P.absSquare(player, to)]; return cellKey(r, c) }
    if (to >= P.PATH_FIRST && to < P.HOME) { const [r, c] = PATHS[player][to - P.PATH_FIRST]; return cellKey(r, c) }
    return -1
  }, [s.last])

  // precompute cell roles
  const loopCells = useMemo(() => {
    const m = new Map<number, { safe: boolean; entry: number }>()
    ABS.forEach(([r, c], a) => {
      const safe = P.SAFE_SQUARES.has(a)
      const entry = [0, 17, 34, 51].indexOf(a)  // entryOffset(p)
      m.set(cellKey(r, c), { safe, entry })
    })
    return m
  }, [])
  const pathOwner = useMemo(() => {
    const m = new Map<number, number>()
    PATHS.forEach((cells, p) => cells.forEach(([r, c]) => m.set(cellKey(r, c), p)))
    return m
  }, [])
  const startSlots = useMemo(() => {
    const m = new Map<number, number>()
    STARTS.forEach((cells, p) => cells.forEach(([r, c]) => m.set(cellKey(r, c), p)))
    return m
  }, [])

  let banner: string, bk = ''
  if (s.winner === mySeat) { bk = 'win'; banner = 'You win — all four pawns home!' }
  else if (s.winner != null) { bk = 'lose'; banner = `${nameFor(s.winner, mySeat, online)} wins the race` }
  else if (canRoll) { bk = 'you'; banner = s.doublesCount > 0 ? 'Doubles — roll again!' : 'Your turn — roll the dice' }
  else if (yourTurn && s.phase === 'move') {
    bk = 'you'
    if (s.bonus > 0) banner = `Bonus +${s.bonus} — move a glowing pawn`
    else if (movable.size) banner = sumRelease && activeDie == null ? 'Release a pawn (dice sum 5)' : `Move with ${activeDie} — click a glowing pawn`
    else banner = 'No move — pass'
  } else { bk = 'foe'; banner = `${nameFor(s.turn, mySeat, online)} is playing…` }

  const moveMode = yourTurn && s.phase === 'move' && s.rolled

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Parcheesi · dice race"
        title="Parcheesi"
        subtitle="roll a five to break out, race four pawns around the cross to the center — capture rivals for a bonus, wall them off with blockades"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Home — You ${homeCounts[mySeat]}/4 · ${[0, 1, 2, 3].filter(p => p !== mySeat).map(p => `${nameFor(p, mySeat, online)[0]} ${homeCounts[p]}`).join(' · ')}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · roll &nbsp; 1/2 · pick die &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="par-wrap">
          <div className="par-board">
            {BASES.map((b, p) => (
              <div key={'base' + p} className={'par-base ' + PLAYER_CLASS[p]}
                style={{ gridRow: `${b[0] + 1} / ${b[2] + 2}`, gridColumn: `${b[1] + 1} / ${b[3] + 2}` }}>
                <div className="par-base-inner" />
              </div>
            ))}

            <div className="par-center"
              style={{ gridRow: `${CENTER[0] + 1} / ${CENTER[2] + 2}`, gridColumn: `${CENTER[1] + 1} / ${CENTER[3] + 2}` }}>
              <span className="par-tri p0" /><span className="par-tri p1" />
              <span className="par-tri p2" /><span className="par-tri p3" />
              <div className="par-home-tally">
                {[0, 1, 2, 3].map(p => (
                  <span key={p} className={'par-tally ' + PLAYER_CLASS[p]}>{homeCounts[p]}</span>
                ))}
              </div>
            </div>

            {Array.from({ length: N * N }, (_, cell) => {
              const r = Math.floor(cell / N), c = cell % N
              const loop = loopCells.get(cell)
              const path = pathOwner.get(cell)
              const isStartSlot = startSlots.has(cell)
              const occ = cellTokens.get(cell)
              const startTok = startTokens.get(cell)
              const isPath = loop != null || path != null
              if (!isPath && !isStartSlot) return null

              let cls = 'par-cell'
              if (loop) { cls += ' path'; if (loop.safe) cls += ' safe'; if (loop.entry >= 0) cls += ' entry ' + PLAYER_CLASS[loop.entry] }
              if (path != null) cls += ' homepath ' + PLAYER_CLASS[path]
              if (isStartSlot && !isPath) cls += ' startslot'
              if (lastCell === cell) cls += ' last'

              const tok = occ || startTok
              return (
                <div key={cell} className={cls} style={{ gridRow: r + 1, gridColumn: c + 1 }}
                  onClick={() => { if (tok) clickPawn(tok.player, tok.i) }}>
                  {loop?.safe && !tok && <span className="par-star" aria-hidden="true">✦</span>}
                  {tok && (
                    <span className={'par-pawn ' + PLAYER_CLASS[tok.player] + (tok.mv ? ' movable' : '') + (occ && occ.stack >= 2 ? ' block' : '')}>
                      {occ && occ.stack > 1 && <span className="par-stack">{occ.stack}</span>}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel par-score">
            {[0, 1, 2, 3].map(p => (
              <div key={p} className={'par-pr ' + PLAYER_CLASS[p] + (s.turn === p && s.winner == null ? ' on' : '')}>
                <span className={'par-dot ' + PLAYER_CLASS[p]} />
                <span className="par-pname">{p === mySeat ? 'You · Violet' : nameFor(p, mySeat, online)}</span>
                <span className="par-home">{homeCounts[p]}/4</span>
              </div>
            ))}
          </div>

          <div className="panel par-control">
            <div className="par-dicebox">
              <Die v={s.dice ? s.dice[0] : null} used={s.usedDice[0]}
                live={moveMode && s.bonus === 0 && s.dice != null && !s.usedDice[0]}
                onClick={() => setSelDie(0)} />
              <Die v={s.dice ? s.dice[1] : null} used={s.usedDice[1]}
                live={moveMode && s.bonus === 0 && s.dice != null && !s.usedDice[1]}
                onClick={() => setSelDie(1)} />
            </div>
            {s.bonus > 0 && <div className="par-bonus">Bonus move +{s.bonus}</div>}
            <button className={'par-rollbtn' + (canRoll ? ' live' : '')} disabled={!canRoll} onClick={rollNow}>
              {canRoll ? 'Roll dice' : moveMode ? 'Move' : 'Wait'}
            </button>
            <div className="par-hint">
              {canRoll ? 'roll a 5 to release a pawn; doubles roll again'
                : moveMode ? (s.bonus > 0 ? 'spend the bonus move on a glowing pawn'
                  : 'pick a die (1/2 or click it), then a glowing pawn')
                : s.winner == null ? `${nameFor(s.turn, mySeat, online)} is thinking…` : 'game over'}
            </div>
          </div>

          <div className="panel"><OnlineBar net={net} /></div>

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal winner={s.winner} mySeat={mySeat} online={online} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ winner, mySeat, online, onNew }: { winner: number; mySeat: number; online: boolean; onNew: () => void }) {
  const won = winner === mySeat
  return (
    <Modal
      eyebrow={won ? 'All pawns home' : 'Out-raced'}
      title={won ? 'You Win' : `${nameFor(winner, mySeat, online)} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}>
      <div className="finalsc">
        {won ? <span className="you">You brought all four pawns to the center</span>
          : <span className="foe">{nameFor(winner, mySeat, online)} finished first</span>}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Parcheesi" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Roll out</button>}>
      <div className="modal-body">
        <p>You are <b>violet</b>; three rivals race you. Each side has <b>four pawns</b> waiting in its corner start circle and runs them around the shared <b>68-square loop</b>, then up its own <b>home path</b> to the centre.</p>
        <p>On your turn, <b>roll two dice</b> and use each die <b>separately</b> — move one pawn by each, or one pawn by both. You need a <b>5</b> (one die, or both dice summing to 5) to release a pawn from start onto your entry square.</p>
        <p>Land on a square holding a single rival to <b>capture</b> it (back to start) and earn a <b>+20 bonus</b> move. Reaching the centre with the exact count earns a <b>+10 bonus</b>. Two of your pawns on one square form a <b>blockade</b> rivals can't pass or land on. <b>Safe</b> star squares can't be captured on. <b>Doubles</b> grant an extra turn — but three doubles in a row sends your furthest pawn home.</p>
        <p>The first player to get <b>all four pawns to the centre</b> wins.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> roll · <kbd>1</kbd>/<kbd>2</kbd> pick a die · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
