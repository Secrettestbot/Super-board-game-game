/* QUORIDOR — UI (built for this codebase). A 9x9 agate board with groove slots for walls on the
   framework shell, vs a BFS-greedy AI. Click a highlighted neighbour to move; toggle wall mode to
   drop a 2-cell wall into a legal groove (illegal/sealing placements are hidden). */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as QD from './logic'
import type { QuoridorState, Wall } from './logic'

const { N, WALL_N } = QD

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#3a2a18" stroke="#6b4e2c" strokeWidth="1.5" />
    <rect x="9" y="9" width="30" height="30" rx="3" fill="#caa86a" stroke="#8a6a38" strokeWidth="1" />
    <circle cx="18" cy="30" r="4.5" fill="#2b6f8e" />
    <circle cx="30" cy="18" r="4.5" fill="#c45a3a" />
    <rect x="22.4" y="13" width="3.2" height="22" rx="1.2" fill="#6b4e2c" />
  </svg>
)

const wallKey = (w: Wall) => `${w.o}${w.r}-${w.c}`

export function Quoridor() {
  const [s, setS] = useState<QuoridorState>(() => QD.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [wallMode, setWallMode] = useState(false)

  function newGame() { setS(QD.makeGame()); setShowRules(false); setWallMode(false) }

  useAITurn(!s.winner && s.turn === 'ai', () => setS(p => QD.aiMove(p)), { delayMs: 520 })
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setWallMode(false) },
    extra: (e) => { if (e.key === 'w' || e.key === 'W') { setWallMode(v => !v); return true } },
  })

  const yourTurn = !s.winner && s.turn === 'you'

  const moveTargets = useMemo(
    () => yourTurn && !wallMode ? new Set(QD.legalMoves(s, 'you').map(([r, c]) => r * N + c)) : new Set<number>(),
    [yourTurn, wallMode, s],
  )
  const wallSlots = useMemo(
    () => yourTurn && wallMode ? QD.legalWalls(s, 'you') : [],
    [yourTurn, wallMode, s],
  )
  const wallSlotSet = useMemo(() => new Set(wallSlots.map(wallKey)), [wallSlots])
  const placed = useMemo(() => new Set(s.walls.map(wallKey)), [s.walls])

  function clickCell(r: number, c: number) {
    if (yourTurn && !wallMode && moveTargets.has(r * N + c)) setS(QD.move(s, r, c, 'you'))
  }
  function clickWall(w: Wall) {
    if (yourTurn && wallMode && wallSlotSet.has(wallKey(w))) { setS(QD.placeWall(s, w, 'you')); setWallMode(false) }
  }

  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = 'You reached the top — you win!' }
  else if (s.winner === 'ai') { bk = 'lose'; banner = 'The rival reached the bottom — it wins' }
  else if (yourTurn) { bk = 'you'; banner = wallMode ? 'Wall mode — click a groove to place a wall' : 'Your turn — move, or press W for a wall' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  const py = s.pawns.you, pa = s.pawns.ai

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Quoridor · race &amp; wall"
        title="Quoridor"
        subtitle="dash your pawn to the far row while fencing the rival in with walls"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="9 × 9 · 10 walls"
        banner={banner}
        bannerClass={bk}
        modeRight={<>W · wall &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="qd-wrap">
          <div className="qd-board">
            {/* cells */}
            {Array.from({ length: N * N }, (_, i) => {
              const r = Math.floor(i / N), c = i % N
              const isYou = py.r === r && py.c === c
              const isAi = pa.r === r && pa.c === c
              const target = moveTargets.has(i)
              return (
                <div
                  key={'cell' + i}
                  className={'qd-cell' + (target ? ' target' : '')}
                  style={{ gridColumn: c * 2 + 1, gridRow: r * 2 + 1 }}
                  onClick={() => clickCell(r, c)}
                >
                  {isYou && <div className="qd-pawn you" />}
                  {isAi && <div className="qd-pawn ai" />}
                  {target && !isYou && !isAi && <div className="qd-dot" />}
                </div>
              )
            })}

            {/* placed walls */}
            {s.walls.map((w) => (
              <div
                key={'pw' + wallKey(w)}
                className={'qd-wall ' + w.o}
                style={w.o === 'h'
                  ? { gridColumn: w.c * 2 + 1 + ' / ' + (w.c * 2 + 4), gridRow: w.r * 2 + 2 }
                  : { gridColumn: w.c * 2 + 2, gridRow: w.r * 2 + 1 + ' / ' + (w.r * 2 + 4) }}
              />
            ))}

            {/* legal wall slots (only in wall mode) */}
            {wallSlots.map((w) => (
              <div
                key={'ws' + wallKey(w)}
                className={'qd-slot ' + w.o}
                style={w.o === 'h'
                  ? { gridColumn: w.c * 2 + 1 + ' / ' + (w.c * 2 + 4), gridRow: w.r * 2 + 2 }
                  : { gridColumn: w.c * 2 + 2, gridRow: w.r * 2 + 1 + ' / ' + (w.r * 2 + 4) }}
                onClick={() => clickWall(w)}
              />
            ))}
          </div>
        </div>

        <div className="side">
          <div className="panel scoreboard">
            <div className={'sc ai' + (s.turn === 'ai' && !s.winner ? ' on' : '')}>
              <span className="sc-pawn ai" /><span className="sc-name">Rival · top</span>
              <span className="sc-walls">{'▮'.repeat(s.left.ai) || '—'}</span><span className="sc-n">{s.left.ai}</span>
            </div>
            <div className={'sc you' + (s.turn === 'you' && !s.winner ? ' on' : '')}>
              <span className="sc-pawn you" /><span className="sc-name">You · bottom</span>
              <span className="sc-walls">{'▮'.repeat(s.left.you) || '—'}</span><span className="sc-n">{s.left.you}</span>
            </div>
          </div>
          <button
            className={'qd-wallbtn' + (wallMode ? ' active' : '')}
            disabled={!yourTurn || s.left.you <= 0}
            onClick={() => setWallMode(v => !v)}
          >
            {wallMode ? 'Cancel wall' : 'Place wall (W)'}
          </button>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: QuoridorState; onNew: () => void }) {
  const won = s.winner === 'you'
  return (
    <Modal
      eyebrow={won ? 'First to the far row' : 'Out-raced'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You · {s.left.you} walls left</span>
        <span className="foe">Rival · {s.left.ai} walls left</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Quoridor" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are the <b>bottom pawn</b>. Reach <b>any cell in the top row</b> before the rival reaches the bottom row. On your turn you either <b>move</b> one step (up/down/left/right) or <b>place a wall</b>.</p>
        <p>If the rival's pawn is in the square you'd step into, you <i>jump</i> straight over it — or diagonally if a wall or the edge blocks the straight hop.</p>
        <p>Each side has <b>10 walls</b>. A wall is a two-cell fence dropped into the grooves between cells; it blocks movement and can't overlap or cross another. A wall may <b>never</b> completely seal off either pawn from its goal row.</p>
        <p><b>Keys:</b> <kbd>W</kbd> wall mode · <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel.</p>
      </div>
    </Modal>
  )
}
