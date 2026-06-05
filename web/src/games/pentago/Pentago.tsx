/* PENTAGO — UI (built for this codebase). A 6x6 board of four rotatable wooden quadrants and
   glassy marbles on the framework shell, vs an alpha-beta AI. Place a marble, then twist a
   quadrant clockwise or counter-clockwise; five in a row wins. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as PG from './logic'
import type { PentagoState, Dir } from './logic'

const { N, QUADS } = PG

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#6b4a2b" stroke="#8a6334" strokeWidth="1.5" />
    <line x1="24" y1="5" x2="24" y2="43" stroke="#3c2916" strokeWidth="1.4" />
    <line x1="5" y1="24" x2="43" y2="24" stroke="#3c2916" strokeWidth="1.4" />
    <circle cx="14" cy="14" r="5" fill="#f4efe2" stroke="#b8b29c" strokeWidth="0.5" />
    <circle cx="34" cy="34" r="5" fill="#23201c" stroke="#000" strokeWidth="0.5" />
    <circle cx="34" cy="14" r="5" fill="#f4efe2" stroke="#b8b29c" strokeWidth="0.5" />
  </svg>
)

const ARROW: Record<Dir, string> = { cw: '↻', ccw: '↺' }

export function Pentago() {
  const [s, setS] = useState<PentagoState>(() => PG.makeGame())
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(PG.makeGame()); setShowRules(false) }

  useAITurn(!s.winner && s.turn === 'b' && s.phase === 'place', () => setS(p => PG.aiMove(p)), { delayMs: 560 })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && s.turn === 'w'
  const canPlace = yourTurn && s.phase === 'place'
  const canRotate = yourTurn && s.phase === 'rotate'
  const winSet = useMemo(() => new Set(s.line ?? []), [s.line])

  function clickCell(i: number) { if (canPlace && !s.board[i]) setS(PG.place(s, i, 'w')) }
  function doRotate(q: number, dir: Dir) { if (canRotate) setS(PG.rotate(s, q, dir, 'w')) }

  let banner: string, bk = ''
  if (s.winner === 'w') { bk = 'win'; banner = 'You win — five in a row' }
  else if (s.winner === 'b') { bk = 'lose'; banner = 'The rival wins — five in a row' }
  else if (s.winner === 'draw') { bk = ''; banner = 'A draw — no five in a row' }
  else if (canPlace) { bk = 'you'; banner = 'Your turn — place a marble' }
  else if (canRotate) { bk = 'you'; banner = 'Now rotate a quadrant ↻ ↺' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  // Build the four quadrant grids (each 3x3 slice of the 6x6 board).
  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Pentago · place &amp; twist"
        title="Pentago"
        subtitle="drop a marble, then spin a quadrant — line up five before the rival does"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="6 × 6 · 4 quadrants"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="pg-wrap">
          <div className={"pg-board" + (canRotate ? " rotating" : "")}>
            {QUADS.map(qd => (
              <div className="pg-quad" key={qd.id}>
                <div className="pg-grid">
                  {[0, 1, 2].map(r => [0, 1, 2].map(c => {
                    const bi = (qd.r0 + r) * N + (qd.c0 + c)
                    const v = s.board[bi]
                    return (
                      <div
                        key={bi}
                        className={"pg-cell" + (canPlace && !v ? " open" : "") + (s.last === bi ? " last" : "") + (winSet.has(bi) ? " win" : "")}
                        onClick={() => clickCell(bi)}
                      >
                        {v && <div className={"pg-marble " + v} />}
                        {!v && canPlace && <div className="pg-ghost" />}
                      </div>
                    )
                  }))}
                </div>
                {canRotate && (
                  <div className="pg-rot">
                    <button className="pg-rot-btn" title={`Rotate ${qd.name} counter-clockwise`} onClick={() => doRotate(qd.id, 'ccw')}>{ARROW.ccw}</button>
                    <span className="pg-rot-tag">{qd.name}</span>
                    <button className="pg-rot-btn" title={`Rotate ${qd.name} clockwise`} onClick={() => doRotate(qd.id, 'cw')}>{ARROW.cw}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="side">
          <div className="panel players">
            <div className={"pl w" + (s.turn === 'w' && !s.winner ? " on" : "")}>
              <span className="pl-marble w" /><span className="pl-name">You · White</span>
              {s.turn === 'w' && !s.winner && <span className="pl-step">{s.phase === 'place' ? 'place' : 'rotate'}</span>}
            </div>
            <div className={"pl b" + (s.turn === 'b' && !s.winner ? " on" : "")}>
              <span className="pl-marble b" /><span className="pl-name">Rival · Black</span>
              {s.turn === 'b' && !s.winner && <span className="pl-step">thinking</span>}
            </div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: PentagoState; onNew: () => void }) {
  const won = s.winner === 'w', draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'No line found' : won ? 'Five in a row' : 'Out-spun'}
      title={draw ? 'A Draw' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        {draw ? <span className="you">Stalemate</span> : <><span className={won ? 'you' : 'foe'}>{won ? 'You' : 'Rival'}</span><span className="foe">five in a row</span></>}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Pentago" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>White</b> and move first. Each turn has <b>two steps</b>: first <b>place</b> one of your marbles in any empty cell, then <b>rotate</b> one of the four 3×3 quadrants a quarter-turn — clockwise <i>↻</i> or counter-clockwise <i>↺</i>.</p>
        <p>After the rotation, having <b>five of your marbles in a row</b> — horizontally, vertically, or diagonally, anywhere on the 6×6 (lines may cross quadrant borders) — wins.</p>
        <p>If both players make five at once after a rotation, or the board fills with no five, it's a <b>draw</b>.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
