/* BLOCKADE — UI (built for this codebase). An 11x11 slate board with two pawns per side and a
   shared groove network for length-2 walls. A turn is move-THEN-wall: first click one of YOUR
   pawns and step it to a highlighted cell, then drop a wall into a legal groove — the two are
   submitted together as ONE turn (one net intent). Player 0 = you (slate-blue, bottom).
   Player 1 = ai/opponent (amber, top). Goals are the rival's two start cells, marked with rings.

   Online (useGameSession): the host runs the real logic and the guest plays the other seat;
   the board and all banners are relative to mySeat, so a guest sees its own pawns as "you". */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { blockadeAdapter } from './net'
import * as BL from './logic'
import type { BlockadeState, Wall, Player } from './logic'

const { N, STARTS, goalsOf } = BL

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1d2733" stroke="#3a4d63" strokeWidth="1.5" />
    <rect x="9" y="9" width="30" height="30" rx="3" fill="#26323f" stroke="#3a4d63" strokeWidth="1" />
    <circle cx="17" cy="17" r="4.5" fill="#e0a23b" />
    <circle cx="31" cy="31" r="4.5" fill="#4f93c9" />
    <rect x="22" y="9" width="4" height="20" rx="1.5" fill="#7a5b22" />
    <rect x="19" y="27" width="20" height="4" rx="1.5" fill="#2c5d80" />
  </svg>
)

const wallKey = (w: Wall) => `${w.o}${w.r}-${w.c}`
const cellKey = (r: number, c: number) => r * N + c

const youGoalSet = new Set(goalsOf(0).map(g => cellKey(g.r, g.c)))   // rival starts (player-0 goal)
const aiGoalSet = new Set(goalsOf(1).map(g => cellKey(g.r, g.c)))    // your starts (player-1 goal)
const youStartSet = new Set(STARTS[0].map(g => cellKey(g.r, g.c)))
const aiStartSet = new Set(STARTS[1].map(g => cellKey(g.r, g.c)))

/** A pawn move staged locally, awaiting its wall, before the whole turn is dispatched. */
interface PendingMove { idx: number; r: number; c: number }

export function Blockade() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(blockadeAdapter)
  const me = mySeat as Player                 // seat 0 = you (bottom), seat 1 = opponent (top)
  const opp: Player = me === 0 ? 1 : 0
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)        // selected pawn index (move phase)
  const [pending, setPending] = useState<PendingMove | null>(null) // staged move (wall phase)

  function newGame() { netNew(); setShowRules(false); setSel(null); setPending(null) }

  const over = s.winner != null
  const yourTurn = !over && isMyTurn
  // We stage the move locally, so the wall phase is local-state driven (pending != null),
  // not derived from s — the authority only sees the combined turn.
  const wallPhase = yourTurn && pending != null
  const movePhase = yourTurn && pending == null

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); if (pending) setPending(null); else setSel(null) },
  })

  // The state AFTER the staged move (for showing the moved pawn + legal walls in the wall phase).
  const staged = useMemo<BlockadeState | null>(() => {
    if (pending == null) return null
    return BL.move(s, me, pending.idx, pending.r, pending.c)
  }, [pending, s, me])

  // In the move phase: legal destinations for the currently-selected pawn.
  const moveTargets = useMemo(() => {
    if (!movePhase || sel == null) return new Set<number>()
    return new Set(BL.legalMoves(s, me, sel).map(([r, c]) => cellKey(r, c)))
  }, [movePhase, sel, s, me])

  // In the wall phase: legal walls relative to the staged (post-move) state.
  const wallSlots = useMemo(
    () => (wallPhase && staged ? BL.legalWalls(staged, me) : []),
    [wallPhase, staged, me],
  )
  const wallSlotSet = useMemo(() => new Set(wallSlots.map(wallKey)), [wallSlots])

  // Pawn positions as displayed: in the wall phase the staged move is already shown.
  const shownPawns = staged ? staged.pawns : s.pawns
  const placed = useMemo(() => new Set(s.walls.map(wallKey)), [s.walls])

  function commitMove(idx: number, r: number, c: number) {
    const moved = BL.move(s, me, idx, r, c)
    if (moved === s) return // illegal (shouldn't happen — target was highlighted)
    // If the move wins or the mover has no walls left, the move IS the whole turn.
    if (moved.winner != null || moved.turn !== me) {
      dispatch({ idx, r, c })
      setSel(null); setPending(null)
      return
    }
    // Otherwise we must also place a wall — stage the move and enter the wall phase.
    setSel(null); setPending({ idx, r, c })
  }

  function clickPawn(player: number, idx: number) {
    if (!movePhase || player !== me) return
    setSel(idx === sel ? null : idx)
  }
  function clickCell(r: number, c: number) {
    if (!movePhase || sel == null) return
    if (moveTargets.has(cellKey(r, c))) commitMove(sel, r, c)
  }
  function clickWall(w: Wall) {
    if (!wallPhase || pending == null || !wallSlotSet.has(wallKey(w))) return
    dispatch({ idx: pending.idx, r: pending.r, c: pending.c, wall: w })
    setPending(null)
  }

  const myWin = s.winner === me
  const oppLabel = net.online ? 'Opponent' : 'Rival'

  let banner: string, bk = ''
  if (over) {
    bk = myWin ? 'win' : 'lose'
    banner = myWin ? 'You stormed a rival start — you win!' : `${oppLabel} reached your start — it wins`
  } else if (wallPhase) {
    bk = 'you'; banner = 'Now place a wall — click a glowing groove'
  } else if (movePhase) {
    bk = 'you'; banner = sel == null ? 'Your turn — pick a pawn to move' : 'Step it to a highlighted cell'
  } else {
    bk = 'foe'; banner = net.online ? `${oppLabel} is moving…` : 'The rival is plotting…'
  }

  // Orient the board so the local player's pawns sit at the bottom (seat 1 flips).
  const flip = me === 1
  const dispR = (r: number) => (flip ? N - 1 - r : r)
  // Wall anchors (both orients): a vertical wall spans rows r..r+1 and a horizontal wall sits in
  // the groove below row r — flipping maps the anchor row r to display row WALL_N-1-r in both cases.
  const dispWallR = (r: number) => (flip ? BL.WALL_N - 1 - r : r)

  // Goal/start tinting is relative to mySeat: where YOU land vs where the opponent lands.
  const myGoalSet = me === 0 ? youGoalSet : aiGoalSet
  const oppGoalSet = me === 0 ? aiGoalSet : youGoalSet

  const leftMine = s.left[me]
  const leftOpp = s.left[opp]

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Blockade · race &amp; wall"
        title="Blockade"
        subtitle="dash a pawn onto a rival start while fencing the rival in — move, then wall"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${N} × ${N} · 2 pawns · ${BL.START_WALLS} walls`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="bk-wrap">
          <div className="bk-board">
            {/* cells */}
            {Array.from({ length: N * N }, (_, i) => {
              const r = Math.floor(i / N), c = i % N
              const k = cellKey(r, c)
              const target = moveTargets.has(k)
              let mark = ''
              if (myGoalSet.has(k)) mark = ' goal-you'     // where YOU want to land
              else if (oppGoalSet.has(k)) mark = ' goal-ai' // where the opponent wants to land
              return (
                <div
                  key={'cell' + i}
                  className={'bk-cell' + (target ? ' target' : '') + mark}
                  style={{ gridColumn: c * 2 + 1, gridRow: dispR(r) * 2 + 1 }}
                  onClick={() => clickCell(r, c)}
                >
                  {(myGoalSet.has(k) || oppGoalSet.has(k)) && <div className="bk-ring" />}
                  {target && <div className="bk-dot" />}
                </div>
              )
            })}

            {/* pawns (with the staged move already applied during the wall phase) */}
            {([0, 1] as const).flatMap(player =>
              shownPawns[player].map((p, idx) => {
                const mine = player === me
                const who = mine ? 'you' : 'ai'
                const selected = mine && movePhase && sel === idx
                const clickable = mine && movePhase
                return (
                  <div
                    key={'pawn' + player + idx}
                    className={'bk-pawn ' + who + (selected ? ' sel' : '') + (clickable ? ' pick' : '')}
                    style={{ gridColumn: p.c * 2 + 1, gridRow: dispR(p.r) * 2 + 1 }}
                    onClick={() => clickPawn(player, idx)}
                  />
                )
              }),
            )}

            {/* placed walls */}
            {s.walls.map((w) => (
              <div
                key={'pw' + wallKey(w)}
                className={'bk-wall ' + w.o}
                style={w.o === 'h'
                  ? { gridColumn: w.c * 2 + 1 + ' / ' + (w.c * 2 + 4), gridRow: dispWallR(w.r) * 2 + 2 }
                  : { gridColumn: w.c * 2 + 2, gridRow: dispWallR(w.r) * 2 + 1 + ' / ' + (dispWallR(w.r) * 2 + 4) }}
              />
            ))}

            {/* legal wall grooves (wall phase only) */}
            {wallSlots.map((w) => (
              <div
                key={'ws' + wallKey(w)}
                className={'bk-slot ' + w.o}
                style={w.o === 'h'
                  ? { gridColumn: w.c * 2 + 1 + ' / ' + (w.c * 2 + 4), gridRow: dispWallR(w.r) * 2 + 2 }
                  : { gridColumn: w.c * 2 + 2, gridRow: dispWallR(w.r) * 2 + 1 + ' / ' + (dispWallR(w.r) * 2 + 4) }}
                onClick={() => clickWall(w)}
              />
            ))}
            <span style={{ display: 'none' }}>{placed.size}{youStartSet.size}{aiStartSet.size}</span>
          </div>
        </div>

        <div className="side">
          <div className="panel"><OnlineBar net={net} /></div>
          <div className="panel scoreboard">
            <div className={'sc ai' + (!yourTurn && !over ? ' on' : '')}>
              <span className="sc-pawn ai" /><span className="sc-name">{oppLabel} · top</span>
              <span className="sc-walls">{'▮'.repeat(leftOpp) || '—'}</span><span className="sc-n">{leftOpp}</span>
            </div>
            <div className={'sc you' + (yourTurn ? ' on' : '')}>
              <span className="sc-pawn you" /><span className="sc-name">You · bottom</span>
              <span className="sc-walls">{'▮'.repeat(leftMine) || '—'}</span><span className="sc-n">{leftMine}</span>
            </div>
          </div>
          <div className="bk-phase">
            <span className={'ph' + (movePhase ? ' on' : '')}>1 · Move</span>
            <span className="ph-arrow">→</span>
            <span className={'ph' + (wallPhase ? ' on' : '')}>2 · Wall</span>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {over && <ResultModal won={myWin} oppLabel={oppLabel} leftMine={leftMine} leftOpp={leftOpp} onNew={newGame} />}
      {showRules && <RulesModal online={net.online} onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, oppLabel, leftMine, leftOpp, onNew }: { won: boolean; oppLabel: string; leftMine: number; leftOpp: number; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Breakthrough' : 'Out-raced'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You · {leftMine} walls left</span>
        <span className="foe">{oppLabel} · {leftOpp} walls left</span>
      </div>
    </Modal>
  )
}

function RulesModal({ online, onClose }: { online: boolean; onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Blockade" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You command the <b>two slate pawns</b> on the bottom row. Land <b>either</b> pawn on <b>either</b> of the rival's two start cells (the ringed cells across the board) to win — {online ? 'your opponent is' : 'the rival is'} racing back to <i>your</i> starts.</p>
        <p>Every turn is two steps: <b>first move</b> one pawn one square (up/down/left/right), then <b>place one wall</b>. If a pawn sits in the square you'd enter, you <i>jump</i> over it.</p>
        <p>A wall is a two-cell fence dropped into the grooves between cells. It blocks movement and can't overlap or cross another — and may <b>never</b> completely seal off any pawn from all of its goals.</p>
        <p>Each side has <b>{BL.START_WALLS} walls</b>; once you're out, you simply move.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
    </Modal>
  )
}
