/* LUDO — UI (built for this codebase). The classic cross board on the framework shell:
   four colored yards, a 52-square shared loop, four home columns into the centre. You are
   yellow; three heuristic AIs play the others. Roll, then click a glowing token to move.
   A 6 releases a token and grants an extra roll; land on a lone enemy to send it home. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as L from './logic'
import type { LudoState } from './logic'

/* ---- Board geometry: a 15×15 grid. ----
   ABS[a] = [row,col] for shared-loop absolute square a (0..51), starting at player 0's start.
   The loop is walked clockwise. Player 0 (yellow) starts bottom-left arm, then the path runs
   up-left, across the top, down-right, etc. Columns: each player's 6 home-column cells.
   Yards: the 2×2 token pads inside each corner home base. */
const N = 15

// 52 loop cells as [row,col], in path order beginning at player 0's START square. Indexed so
// player p's START square = ABS[p*13], and after a full lap (progress 51) the token lands on the
// cross-tip cell directly beside its own home column (a clean turn-in). The four outer corners
// step around the arm tips (as on a physical board).
const ABS: [number, number][] = [
  [12, 6], [11, 6], [10, 6], [9, 6], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0],
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [8, 8], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [13, 6],
]

// Home-column cells (progress 52..57) per player — the colored run into the centre.
const COLUMNS: [number, number][][] = [
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],  // p0 up the bottom centre column
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],       // p1 across left centre row
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],       // p2 down the top centre column
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],   // p3 across right centre row
]

// Yard pad cells (2×2) per player, inside each corner base.
const YARDS: [number, number][][] = [
  [[11, 2], [11, 3], [12, 2], [12, 3]], // p0 bottom-left
  [[2, 2], [2, 3], [3, 2], [3, 3]],     // p1 top-left
  [[2, 11], [2, 12], [3, 11], [3, 12]], // p2 top-right
  [[11, 11], [11, 12], [12, 11], [12, 12]], // p3 bottom-right
]

// Corner home-base bounding boxes [r0,c0,r1,c1] (6×6) for coloring.
const BASES: [number, number, number, number][] = [
  [9, 0, 14, 5],   // p0 bottom-left
  [0, 0, 5, 5],    // p1 top-left
  [0, 9, 5, 14],   // p2 top-right
  [9, 9, 14, 14],  // p3 bottom-right
]

const CENTER = [6, 6, 8, 8] as const // center triangle zone bbox

const cellKey = (r: number, c: number) => r * N + c

// Which absolute loop square is each player's START (for safe-square highlighting)
const START_ABS = [0, 13, 26, 39].map(a => a) // = entryOffset(p)

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1d2230" stroke="#3a4258" strokeWidth="1.5" />
    <rect x="8" y="8" width="14" height="14" rx="3" fill="#e8c14a" />
    <rect x="26" y="8" width="14" height="14" rx="3" fill="#e0584f" />
    <rect x="8" y="26" width="14" height="14" rx="3" fill="#4aa3e0" />
    <rect x="26" y="26" width="14" height="14" rx="3" fill="#5bbf6a" />
    <circle cx="24" cy="24" r="5.5" fill="#f4f5fa" stroke="#1d2230" strokeWidth="1.2" />
  </svg>
)

const PLAYER_CLASS = ['p0', 'p1', 'p2', 'p3']
const PLAYER_NAME = ['You', 'Red', 'Blue', 'Green']

// Standard die-face pip layout (3×3 grid indices that are filled).
const PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
}
function Die({ v }: { v: number | null }) {
  const on = new Set(v ? PIPS[v] : [])
  return (
    <div className="ludo-die">
      {Array.from({ length: 9 }, (_, i) => <span key={i} className={'ludo-pip' + (v && on.has(i) ? '' : ' off')} />)}
    </div>
  )
}

export function Ludo() {
  const [s, setS] = useState<LudoState>(() => L.makeGame())
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(L.makeGame()); setShowRules(false) }

  // 3 AIs each take several sub-turns (a 6 grants extra rolls), so re-arm on s.step every action.
  const aiActive = s.winner == null && s.turn !== 0
  useAITurn(aiActive, () => setS(p => L.aiStep(p)), { delayMs: 520, tick: s.step })

  const yourTurn = s.winner == null && s.turn === 0
  const canRoll = yourTurn && s.phase === 'roll' && !s.rolled

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && canRoll) { setS(p => L.roll(p)); return true }
      return false
    },
  })

  const movable = useMemo(
    () => (yourTurn && s.phase === 'move' && s.rolled && s.die != null
      ? new Set(L.legalMoves(s, 0, s.die)) : new Set<number>()),
    [yourTurn, s.phase, s.rolled, s.die, s],
  )

  function clickToken(player: number, i: number) {
    if (player === 0 && yourTurn && s.phase === 'move' && movable.has(i)) setS(L.moveToken(s, 0, i))
  }
  function rollNow() { if (canRoll) setS(L.roll(s)) }

  // Build per-cell content: occupant tokens (loop + columns) keyed by grid cell.
  const cellTokens = useMemo(() => {
    const m = new Map<number, { player: number; i: number; mv: boolean; stack: number }>()
    const counts = new Map<number, number>()
    for (let p = 0; p < L.PLAYERS; p++) {
      s.tokens[p].forEach((prog, i) => {
        let cell = -1
        if (prog >= 1 && prog <= 51) { const [r, c] = ABS[L.absSquare(p, prog)]; cell = cellKey(r, c) }
        else if (prog >= L.COL_FIRST && prog < L.FINISH) { const [r, c] = COLUMNS[p][prog - L.COL_FIRST]; cell = cellKey(r, c) }
        if (cell >= 0) {
          const stack = counts.get(cell) || 0
          counts.set(cell, stack + 1)
          // keep the top occupant for click target, prefer a movable 'you' token
          const prev = m.get(cell)
          const mv = p === 0 && movable.has(i)
          if (!prev || (mv && !prev.mv)) m.set(cell, { player: p, i, mv, stack: stack + 1 })
          else m.set(cell, Object.assign({}, prev, { stack: stack + 1 }))
        }
      })
    }
    return m
  }, [s.tokens, movable])

  // Yard tokens: each player's tokens still in the yard fill the 2×2 pad slots in order.
  const yardTokens = useMemo(() => {
    const m = new Map<number, { player: number; i: number; mv: boolean }>()
    for (let p = 0; p < L.PLAYERS; p++) {
      let slot = 0
      s.tokens[p].forEach((prog, i) => {
        if (prog === L.YARD) {
          const [r, c] = YARDS[p][slot]
          slot++
          m.set(cellKey(r, c), { player: p, i, mv: p === 0 && movable.has(i) })
        }
      })
    }
    return m
  }, [s.tokens, movable])

  const lastCell = useMemo(() => {
    if (!s.last) return -1
    const { player, to } = s.last
    if (to >= 1 && to <= 51) { const [r, c] = ABS[L.absSquare(player, to)]; return cellKey(r, c) }
    if (to >= L.COL_FIRST && to < L.FINISH) { const [r, c] = COLUMNS[player][to - L.COL_FIRST]; return cellKey(r, c) }
    return -1
  }, [s.last])

  // precompute cell roles for rendering
  const loopCells = useMemo(() => {
    const m = new Map<number, { safe: boolean; tint: number }>()
    ABS.forEach(([r, c], a) => {
      const safe = L.SAFE_SQUARES.has(a)
      // tint a player's START cell with that player's color
      const startOwner = START_ABS.indexOf(a)
      m.set(cellKey(r, c), { safe, tint: startOwner })
    })
    return m
  }, [])
  const columnOwner = useMemo(() => {
    const m = new Map<number, number>()
    COLUMNS.forEach((cells, p) => cells.forEach(([r, c]) => m.set(cellKey(r, c), p)))
    return m
  }, [])

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'You win — all four tokens home!' }
  else if (s.winner != null) { bk = 'lose'; banner = `${PLAYER_NAME[s.winner]} wins the race` }
  else if (canRoll) { bk = 'you'; banner = s.rolledSix ? 'You rolled a 6 — roll again!' : 'Your turn — roll the die' }
  else if (yourTurn && s.phase === 'move') {
    bk = 'you'
    banner = movable.size ? `You rolled a ${s.die} — move a glowing token` : `No move with a ${s.die}…`
  } else { bk = 'foe'; banner = `${PLAYER_NAME[s.turn]} is playing…` }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Ludo · dice race"
        title="Ludo"
        subtitle="roll a six to break out, race four tokens around the cross and home — capture rivals on the way"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Home — You ${L.finishedCount(s, 0)}/4 · R ${L.finishedCount(s, 1)} · B ${L.finishedCount(s, 2)} · G ${L.finishedCount(s, 3)}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · roll &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="ludo-wrap">
          <div className="ludo-board">
            {/* corner home bases */}
            {BASES.map((b, p) => (
              <div key={'base' + p} className={'ludo-base ' + PLAYER_CLASS[p]}
                style={{ gridRow: `${b[0] + 1} / ${b[2] + 2}`, gridColumn: `${b[1] + 1} / ${b[3] + 2}` }}>
                <div className="ludo-base-inner" />
              </div>
            ))}
            {/* center triangle */}
            <div className="ludo-center"
              style={{ gridRow: `${CENTER[0] + 1} / ${CENTER[2] + 2}`, gridColumn: `${CENTER[1] + 1} / ${CENTER[3] + 2}` }}>
              <span className="ludo-tri p0" /><span className="ludo-tri p1" />
              <span className="ludo-tri p2" /><span className="ludo-tri p3" />
            </div>

            {/* all 15×15 cells */}
            {Array.from({ length: N * N }, (_, cell) => {
              const r = Math.floor(cell / N), c = cell % N
              const loop = loopCells.get(cell)
              const col = columnOwner.get(cell)
              const occ = cellTokens.get(cell)
              const yard = yardTokens.get(cell)
              const isYardSlot = YARDS.some(pad => pad.some(([yr, yc]) => yr === r && yc === c))
              const isPath = loop != null || col != null
              if (!isPath && !isYardSlot) return null // not a rendered cell (bases/center drawn above)

              let cls = 'ludo-cell'
              if (loop) { cls += ' path'; if (loop.safe) cls += ' safe'; if (loop.tint >= 0) cls += ' start ' + PLAYER_CLASS[loop.tint] }
              if (col != null) cls += ' col ' + PLAYER_CLASS[col]
              if (isYardSlot && !isPath) cls += ' yardslot'
              if (lastCell === cell) cls += ' last'

              const tok = occ || yard
              return (
                <div key={cell} className={cls}
                  style={{ gridRow: r + 1, gridColumn: c + 1 }}
                  onClick={() => { if (tok) clickToken(tok.player, tok.i) }}>
                  {loop?.safe && !tok && <span className="ludo-star" aria-hidden="true">★</span>}
                  {tok && (
                    <span className={'ludo-token ' + PLAYER_CLASS[tok.player] + (tok.mv ? ' movable' : '')}>
                      {occ && occ.stack > 1 && <span className="ludo-stack">{occ.stack}</span>}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel ludo-score">
            {[0, 1, 2, 3].map(p => (
              <div key={p} className={'ludo-pr ' + PLAYER_CLASS[p] + (s.turn === p && s.winner == null ? ' on' : '')}>
                <span className={'ludo-dot ' + PLAYER_CLASS[p]} />
                <span className="ludo-pname">{p === 0 ? 'You · Yellow' : PLAYER_NAME[p]}</span>
                <span className="ludo-home">{L.finishedCount(s, p)}/4</span>
              </div>
            ))}
          </div>

          <div className="panel ludo-control">
            <div className="ludo-dicebox">
              <Die v={s.die} />
              <button className={'ludo-rollbtn' + (canRoll ? ' live' : '')} disabled={!canRoll}
                onClick={rollNow}>
                {canRoll ? 'Roll' : yourTurn && s.phase === 'move' ? 'Move' : 'Wait'}
              </button>
            </div>
            <div className="ludo-hint">
              {canRoll ? 'roll a 6 to release a token, or to roll again'
                : yourTurn && s.phase === 'move' ? 'click a glowing token to move it'
                : s.winner == null ? `${PLAYER_NAME[s.turn]} is thinking…` : 'game over'}
            </div>
          </div>

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal winner={s.winner} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ winner, onNew }: { winner: number; onNew: () => void }) {
  const won = winner === 0
  return (
    <Modal
      eyebrow={won ? 'All tokens home' : 'Out-raced'}
      title={won ? 'You Win' : `${PLAYER_NAME[winner]} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}>
      <div className="finalsc">
        {won ? <span className="you">You brought all four tokens home</span>
          : <span className="foe">{PLAYER_NAME[winner]} finished first</span>}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Ludo" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Roll out</button>}>
      <div className="modal-body">
        <p>You are <b>yellow</b>; three rivals (red, blue, green) race you. Each side has <b>four tokens</b> waiting in its corner yard and runs them around the shared <b>52-square loop</b>, then up its own <b>home column</b> to the centre.</p>
        <p>On your turn, <b>roll one die</b>. You need a <b>6</b> to move a token out of the yard onto your start square. Otherwise advance any active token by the rolled amount. Rolling a <b>6 grants an extra roll</b>.</p>
        <p>Land on a square holding a single rival token to <b>capture</b> it — back to its yard. The coloured <b>star start squares are safe</b>: tokens there can't be captured. You need the <b>exact count</b> to reach the centre; overshooting isn't allowed.</p>
        <p>The first player to get <b>all four tokens home</b> wins.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> roll · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
