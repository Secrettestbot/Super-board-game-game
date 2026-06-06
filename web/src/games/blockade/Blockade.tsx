/* BLOCKADE — UI (built for this codebase). An 11x11 slate board with two pawns per side and a
   shared groove network for length-2 walls, vs a BFS-greedy AI. A turn is move-THEN-wall: first
   click one of YOUR pawns and step it to a highlighted cell, then drop a wall into a legal groove.
   Player 0 = you (slate-blue, bottom). Player 1 = ai (amber, top). Goals are the rival's two
   start cells, marked with rings. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as BL from './logic'
import type { BlockadeState, Wall } from './logic'

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

const youGoalSet = new Set(goalsOf(0).map(g => cellKey(g.r, g.c)))   // rival starts (your goal)
const aiGoalSet = new Set(goalsOf(1).map(g => cellKey(g.r, g.c)))    // your starts (ai goal)
const youStartSet = new Set(STARTS[0].map(g => cellKey(g.r, g.c)))
const aiStartSet = new Set(STARTS[1].map(g => cellKey(g.r, g.c)))

export function Blockade() {
  const [s, setS] = useState<BlockadeState>(() => BL.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null) // selected pawn index for the move phase

  function newGame() { setS(BL.makeGame()); setShowRules(false); setSel(null) }

  // The AI plays its entire move-then-wall turn in one call. Re-arm on the turn flag.
  useAITurn(s.winner == null && s.turn === 1, () => setS(p => BL.aiTurn(p)), { delayMs: 560 })

  const yourTurn = s.winner == null && s.turn === 0
  const wallPhase = BL.awaitingWall(s, 0)
  const movePhase = yourTurn && !wallPhase

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setSel(null) },
  })

  // In the move phase: legal destinations for the currently-selected pawn.
  const moveTargets = useMemo(() => {
    if (!movePhase || sel == null) return new Set<number>()
    return new Set(BL.legalMoves(s, 0, sel).map(([r, c]) => cellKey(r, c)))
  }, [movePhase, sel, s])

  const wallSlots = useMemo(() => (wallPhase ? BL.legalWalls(s, 0) : []), [wallPhase, s])
  const wallSlotSet = useMemo(() => new Set(wallSlots.map(wallKey)), [wallSlots])
  const placed = useMemo(() => new Set(s.walls.map(wallKey)), [s.walls])

  // If we're in the wall phase but no legal wall exists, auto-pass the turn so play continues.
  if (wallPhase && wallSlots.length === 0 && s.left[0] > 0) {
    // defer to a microtask to avoid setState-in-render
    queueMicrotask(() => setS(p => (BL.awaitingWall(p, 0) && BL.legalWalls(p, 0).length === 0
      ? Object.assign({}, p, { turn: 1, last: { kind: 'wall' as const, who: 0 } })
      : p)))
  }

  function clickPawn(player: number, idx: number) {
    if (!movePhase) return
    if (player !== 0) return
    setSel(idx)
  }
  function clickCell(r: number, c: number) {
    if (!movePhase || sel == null) return
    if (moveTargets.has(cellKey(r, c))) { setS(BL.move(s, 0, sel, r, c)); setSel(null) }
  }
  function clickWall(w: Wall) {
    if (wallPhase && wallSlotSet.has(wallKey(w))) setS(BL.placeWall(s, w, 0))
  }

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'You stormed a rival start — you win!' }
  else if (s.winner === 1) { bk = 'lose'; banner = 'The rival reached your start — it wins' }
  else if (wallPhase) { bk = 'you'; banner = 'Now place a wall — click a glowing groove' }
  else if (movePhase) { bk = 'you'; banner = sel == null ? 'Your turn — pick a pawn to move' : 'Step it to a highlighted cell' }
  else { bk = 'foe'; banner = 'The rival is plotting…' }

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
              if (youGoalSet.has(k)) mark = ' goal-you'      // rival starts = where YOU want to land
              else if (aiGoalSet.has(k)) mark = ' goal-ai'   // your starts = where AI wants to land
              return (
                <div
                  key={'cell' + i}
                  className={'bk-cell' + (target ? ' target' : '') + mark}
                  style={{ gridColumn: c * 2 + 1, gridRow: r * 2 + 1 }}
                  onClick={() => clickCell(r, c)}
                >
                  {(youGoalSet.has(k) || aiGoalSet.has(k)) && <div className="bk-ring" />}
                  {target && <div className="bk-dot" />}
                </div>
              )
            })}

            {/* pawns */}
            {([0, 1] as const).flatMap(player =>
              s.pawns[player].map((p, idx) => {
                const who = player === 0 ? 'you' : 'ai'
                const selected = player === 0 && movePhase && sel === idx
                const clickable = player === 0 && movePhase
                return (
                  <div
                    key={'pawn' + player + idx}
                    className={'bk-pawn ' + who + (selected ? ' sel' : '') + (clickable ? ' pick' : '')}
                    style={{ gridColumn: p.c * 2 + 1, gridRow: p.r * 2 + 1 }}
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
                  ? { gridColumn: w.c * 2 + 1 + ' / ' + (w.c * 2 + 4), gridRow: w.r * 2 + 2 }
                  : { gridColumn: w.c * 2 + 2, gridRow: w.r * 2 + 1 + ' / ' + (w.r * 2 + 4) }}
              />
            ))}

            {/* legal wall grooves (wall phase only) */}
            {wallSlots.map((w) => (
              <div
                key={'ws' + wallKey(w)}
                className={'bk-slot ' + w.o}
                style={w.o === 'h'
                  ? { gridColumn: w.c * 2 + 1 + ' / ' + (w.c * 2 + 4), gridRow: w.r * 2 + 2 }
                  : { gridColumn: w.c * 2 + 2, gridRow: w.r * 2 + 1 + ' / ' + (w.r * 2 + 4) }}
                onClick={() => clickWall(w)}
              />
            ))}
            <span style={{ display: 'none' }}>{placed.size}{youStartSet.size}{aiStartSet.size}</span>
          </div>
        </div>

        <div className="side">
          <div className="panel scoreboard">
            <div className={'sc ai' + (s.turn === 1 && s.winner == null ? ' on' : '')}>
              <span className="sc-pawn ai" /><span className="sc-name">Rival · top</span>
              <span className="sc-walls">{'▮'.repeat(s.left[1]) || '—'}</span><span className="sc-n">{s.left[1]}</span>
            </div>
            <div className={'sc you' + (s.turn === 0 && s.winner == null ? ' on' : '')}>
              <span className="sc-pawn you" /><span className="sc-name">You · bottom</span>
              <span className="sc-walls">{'▮'.repeat(s.left[0]) || '—'}</span><span className="sc-n">{s.left[0]}</span>
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

      {s.winner != null && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: BlockadeState; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? 'Breakthrough' : 'Out-raced'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You · {s.left[0]} walls left</span>
        <span className="foe">Rival · {s.left[1]} walls left</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Blockade" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You command the <b>two slate pawns</b> on the bottom row. Land <b>either</b> pawn on <b>either</b> of the rival's two start cells (the ringed amber cells up top) to win — the rival is racing back to <i>your</i> starts.</p>
        <p>Every turn is two steps: <b>first move</b> one pawn one square (up/down/left/right), then <b>place one wall</b>. If a pawn sits in the square you'd enter, you <i>jump</i> over it.</p>
        <p>A wall is a two-cell fence dropped into the grooves between cells. It blocks movement and can't overlap or cross another — and may <b>never</b> completely seal off any pawn from all of its goals.</p>
        <p>Each side has <b>{BL.START_WALLS} walls</b>; once you're out, you simply move.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
    </Modal>
  )
}
