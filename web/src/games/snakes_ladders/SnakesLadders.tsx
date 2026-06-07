/* SNAKES & LADDERS — UI (built for this codebase). A 4-player dice race on the framework
   shell. Solo: you (seat 0) play three "just roll" AIs. Online: useGameSession runs the
   real logic on the host, the AI fills empty seats, and your turn is a single ROLL intent
   ({ kind: 'roll' }) — the host rolls, moves, resolves snakes/ladders + win, and passes the
   turn (a 6 keeps it). The view is seat-relative: "you" is the local mySeat, and the banner,
   scores and result are all from that seat's perspective. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { snakesLaddersAdapter } from './net'
import * as SL from './logic'
import type { SLState } from './logic'

const { SIZE, GOAL, NAMES } = SL

const PLAYER_VARS = ['p0', 'p1', 'p2', 'p3'] // → --player-N colors

/** Seat-relative display name: "You" for your seat; otherwise the themed name, or a generic
 * "Opponent" / "Player N" when playing online (the real name of a remote human is unknown). */
function nameFor(p: number, mySeat: number, online: boolean, numSeats: number): string {
  if (p === mySeat) return 'You'
  if (!online) return NAMES[p] ?? `Player ${p + 1}`
  return numSeats === 2 ? 'Opponent' : `Player ${p + 1}`
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="5" y="5" width="38" height="38" rx="8" fill="#2c8a5c" stroke="#185235" strokeWidth="1.5" />
    {/* ladder */}
    <g stroke="#f2c14e" strokeWidth="2.2" strokeLinecap="round">
      <line x1="14" y1="11" x2="20" y2="37" />
      <line x1="19" y1="11" x2="25" y2="37" />
      <line x1="15.4" y1="17" x2="22.4" y2="17" />
      <line x1="16.6" y1="24" x2="23.4" y2="24" />
      <line x1="17.8" y1="31" x2="24.6" y2="31" />
    </g>
    {/* snake */}
    <path d="M34 10 q-9 5 0 11 q9 6 -1 11 q-6 4 -2 8" fill="none" stroke="#d96b5b" strokeWidth="3.4" strokeLinecap="round" />
    <circle cx="34" cy="10" r="2.4" fill="#d96b5b" />
  </svg>
)

// Pip layouts per face (1..6), as a 9-cell grid of booleans.
const FACES: Record<number, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
}

function Die({ value, rollKey, six }: { value: number; rollKey: number; six: boolean }) {
  const cells = FACES[value] || FACES[1]
  return (
    <div key={rollKey} className={'sl-die rolling' + (six ? ' six' : '')} aria-label={`die showing ${value}`}>
      {cells.map((on, i) => <span key={i} className={'sl-pip' + (on ? '' : ' off')} />)}
    </div>
  )
}

/* Geometry: a square's center as a fraction (0..1) of the board, x→right, y→down (row 9 top). */
function squareCenter(n: number): { x: number; y: number } {
  const { row, col } = SL.squareToRC(n)
  const x = (col + 0.5) / SIZE
  const yFromBottom = (row + 0.5) / SIZE
  return { x, y: 1 - yFromBottom }
}

export function SnakesLadders() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(snakesLaddersAdapter)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const numSeats = s.positions.length

  function newGame() { netNew(); setShowRules(false) }

  const yourTurn = s.winner == null && isMyTurn
  const youWon = s.winner === mySeat

  // Your turn is a single action: roll (the host rolls, moves, resolves jumps + win, and
  // passes the turn — a 6 keeps it for you). The AI fills empty seats via the hook.
  function act() {
    if (!yourTurn) return
    dispatch({ kind: 'roll' })
  }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === ' ' || e.key === 'Enter') { act(); return true }
      return false
    },
  })

  const turnName = nameFor(s.turn, mySeat, net.online, numSeats)

  // Banner (relative to your seat).
  let banner: string, bk = ''
  if (youWon) { bk = 'win'; banner = 'You reached 100 — you win!' }
  else if (s.winner != null) { bk = 'lose'; banner = `${nameFor(s.winner, mySeat, net.online, numSeats)} reached 100 — you lose` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — roll the die' }
  else { bk = 'foe'; banner = `${turnName} is rolling…` }

  // Board squares bottom-to-top so row 9 renders at the top. We render rows top→bottom for DOM.
  const rows: number[][] = []
  for (let row = SIZE - 1; row >= 0; row--) {
    const r: number[] = []
    for (let col = 0; col < SIZE; col++) r.push(SL.rcToSquare(row, col))
    rows.push(r)
  }

  // Ladders + snakes as SVG path data (in a 0..100 viewBox where x→right, y→down).
  const jumpsList = Object.keys(s.jumps).map(k => {
    const from = Number(k)
    const to = s.jumps[from]
    return { from, to, kind: SL.jumpKind(from, to) }
  })

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Snakes & Ladders · dice race"
        title="Snakes & Ladders"
        subtitle="climb the ladders, dodge the snakes — first of four to square 100 wins"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`First to ${GOAL}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>Space · roll &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="sl-wrap">
          <div className="sl-board">
            <div className="sl-grid">
              {rows.map((r, ri) =>
                r.map((n) => {
                  const j = s.jumps[n]
                  const cls =
                    j == null ? '' : j > n ? ' ladder-foot' : ' snake-head'
                  return (
                    <div key={n} className={'sl-cell' + cls + (ri % 2 === 0 ? ' even' : ' odd')}>
                      <span className="sl-num">{n}</span>
                    </div>
                  )
                }),
              )}
            </div>

            {/* Snakes + ladders overlay */}
            <svg className="sl-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {jumpsList.map(({ from, to, kind }) => {
                const a = squareCenter(from)
                const b = squareCenter(to)
                const ax = a.x * 100, ay = a.y * 100, bx = b.x * 100, by = b.y * 100
                if (kind === 'ladder') {
                  // two rails + rungs
                  const dx = bx - ax, dy = by - ay
                  const len = Math.hypot(dx, dy) || 1
                  const nx = (-dy / len) * 1.6, ny = (dx / len) * 1.6 // perpendicular offset
                  const rungs = []
                  const steps = Math.max(2, Math.round(len / 6))
                  for (let i = 1; i < steps; i++) {
                    const t = i / steps
                    const mx = ax + dx * t, my = ay + dy * t
                    rungs.push(
                      <line key={i} x1={mx - nx} y1={my - ny} x2={mx + nx} y2={my + ny}
                        className="ov-rung" />,
                    )
                  }
                  return (
                    <g key={`l${from}`} className="ov-ladder">
                      <line x1={ax - nx} y1={ay - ny} x2={bx - nx} y2={by - ny} className="ov-rail" />
                      <line x1={ax + nx} y1={ay + ny} x2={bx + nx} y2={by + ny} className="ov-rail" />
                      {rungs}
                    </g>
                  )
                }
                // snake: a curved body from head (from) to tail (to)
                const mx = (ax + bx) / 2 + (by - ay) * 0.22
                const my = (ay + by) / 2 + (ax - bx) * 0.22
                return (
                  <g key={`s${from}`} className="ov-snake">
                    <path d={`M ${ax} ${ay} Q ${mx} ${my} ${bx} ${by}`} className="ov-body" />
                    <circle cx={ax} cy={ay} r={2.2} className="ov-head" />
                  </g>
                )
              })}
            </svg>

            {/* Tokens */}
            {s.positions.map((pos, p) => {
              if (pos === 0) return null // off-board start tokens shown in the side panel
              const c = squareCenter(pos)
              // fan out multiple tokens sharing a square
              const sharers = s.positions
                .map((q, idx) => ({ q, idx }))
                .filter(o => o.q === pos)
              const order = sharers.findIndex(o => o.idx === p)
              const total = sharers.length
              const angle = (order / Math.max(1, total)) * Math.PI * 2
              const r = total > 1 ? 1.7 : 0
              const ox = Math.cos(angle) * r, oy = Math.sin(angle) * r
              const isWin = s.winner === p
              return (
                <div
                  key={p}
                  className={'sl-token ' + PLAYER_VARS[p] + (isWin ? ' win' : '') + (s.last?.player === p ? ' moved' : '')}
                  style={{ left: `calc(${c.x * 100}% + ${ox}%)`, top: `calc(${c.y * 100}% + ${oy}%)` }}
                  title={`${nameFor(p, mySeat, net.online, numSeats)} on ${pos}`}
                >
                  <span className="sl-token-dot">{p === mySeat ? '★' : NAMES[p][0]}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>

          <div className="panel sl-roller">
            <div className="sl-turnlabel">
              {s.winner != null ? 'game over' : yourTurn ? 'your turn' : `${turnName.toLowerCase()}'s turn`}
            </div>
            {s.die == null
              ? <div className="sl-die-empty">{s.winner != null ? 'done' : 'ready'}</div>
              : <Die value={s.die} rollKey={s.step} six={s.rolledSix} />}
            <button className="big-btn roll" onClick={act} disabled={!yourTurn}>Roll</button>
          </div>

          <div className="panel sl-scores">
            {s.positions.map((pos, p) => (
              <div key={p} className={'sl-sc' + (s.turn === p && s.winner == null ? ' on' : '') + (s.winner === p ? ' won' : '')}>
                <span className={'sl-sc-token ' + PLAYER_VARS[p]} />
                <span className="sl-sc-name">{nameFor(p, mySeat, net.online, numSeats)}</span>
                <span className="sl-sc-n">{pos}</span>
              </div>
            ))}
          </div>

          <div className="panel sl-log" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'sl-log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && (
        <ResultModal s={s} mySeat={mySeat} online={net.online} numSeats={numSeats} onNew={newGame} />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal(
  { s, mySeat, online, numSeats, onNew }:
  { s: SLState; mySeat: number; online: boolean; numSeats: number; onNew: () => void },
) {
  const won = s.winner === mySeat
  return (
    <Modal
      eyebrow={won ? 'Home first' : 'Out-rolled'}
      title={won ? 'You Win' : `${nameFor(s.winner!, mySeat, online, numSeats)} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="sl-final">
        {s.positions.map((pos, p) => (
          <span key={p} className={'sl-final-row ' + PLAYER_VARS[p]}>
            <b>{nameFor(p, mySeat, online, numSeats)}</b> {pos}
          </span>
        ))}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Snakes & Ladders" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Got it</button>}>
      <div className="modal-body">
        <p>You and three rivals race a single token each up a board numbered <b>1 to 100</b>. On your turn, <b>roll one die</b> and advance that many squares.</p>
        <p>Land on the foot of a <b>ladder</b> and you climb to its top. Land on the head of a <b>snake</b> and you slide down to its tail.</p>
        <p>Roll a <b>6</b> and you get to <b>roll again</b>. The first token to reach (or pass) square <b>100</b> wins — it's nearly all luck.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> roll · <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
