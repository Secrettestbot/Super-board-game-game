/* PENTAGO — UI (built for this codebase). A 6x6 board of four rotatable wooden quadrants and
   glassy marbles on the framework shell, vs an alpha-beta AI or a remote opponent online. Place
   a marble, then twist a quadrant clockwise or counter-clockwise; five in a row wins.

   Online: a full turn (place + rotate) crosses the wire as ONE intent. So the place-then-rotate
   interaction lives as LOCAL UI state here — we hold the pending placement until a quadrant twist
   is chosen, then dispatch the complete { cell, quad, dir } intent exactly once. Everything is
   seat-relative: your marble colour comes from mySeat, isMyTurn gates interaction, and banners /
   panels read from your perspective ("Opponent" when online). */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { pentagoAdapter } from './net'
import * as PG from './logic'
import type { Dir, Marble } from './logic'

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
const NAME: Record<Marble, string> = { w: 'White', b: 'Black' }

export function Pentago() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(pentagoAdapter)
  const myColor: Marble = mySeat === 0 ? 'w' : 'b'
  const oppColor: Marble = myColor === 'w' ? 'b' : 'w'
  const [showRules, setShowRules] = useState(false)
  // Local two-step interaction state: the cell we've tentatively placed, awaiting a twist.
  const [pendingCell, setPendingCell] = useState<number | null>(null)

  function newGame() { netNew(); setShowRules(false); setPendingCell(null) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (pendingCell != null) setPendingCell(null); else setShowRules(false) },
  })

  const over = s.winner != null
  const yourTurn = !over && isMyTurn
  // Within your turn: choose a cell first (place phase), then a rotation.
  const canPlace = yourTurn && pendingCell == null
  const canRotate = yourTurn && pendingCell != null
  const winSet = useMemo(() => new Set(s.line ?? []), [s.line])

  function clickCell(i: number) {
    if (!canPlace || s.board[i]) return
    setPendingCell(i)
  }
  function doRotate(q: number, dir: Dir) {
    if (!canRotate || pendingCell == null) return
    dispatch({ cell: pendingCell, quad: q, dir })
    setPendingCell(null)
  }

  // A marble is "previewed" in the pending cell while we wait for the twist choice.
  const previewCell = canRotate ? pendingCell : null

  const myWin = s.winner === myColor
  const oppLabel = net.online ? 'Opponent' : 'Rival'

  let banner: string, bk = ''
  if (s.winner === myColor) { bk = 'win'; banner = 'You win — five in a row' }
  else if (s.winner === oppColor) { bk = 'lose'; banner = `The ${oppLabel.toLowerCase()} wins — five in a row` }
  else if (s.winner === 'draw') { bk = ''; banner = 'A draw — no five in a row' }
  else if (canPlace) { bk = 'you'; banner = 'Your turn — place a marble' }
  else if (canRotate) { bk = 'you'; banner = 'Now rotate a quadrant ↻ ↺' }
  else { bk = 'foe'; banner = net.online ? `The ${oppLabel.toLowerCase()} is moving…` : 'The rival is thinking…' }

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
                    const isPreview = bi === previewCell
                    return (
                      <div
                        key={bi}
                        className={"pg-cell" + (canPlace && !v ? " open" : "") + (s.last === bi ? " last" : "") + (winSet.has(bi) ? " win" : "")}
                        onClick={() => clickCell(bi)}
                      >
                        {v && <div className={"pg-marble " + v} />}
                        {!v && isPreview && <div className={"pg-marble " + myColor} />}
                        {!v && !isPreview && canPlace && <div className="pg-ghost" />}
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
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel players">
            <div className={"pl " + myColor + (yourTurn ? " on" : "")}>
              <span className={"pl-marble " + myColor} /><span className="pl-name">You · {NAME[myColor]}</span>
              {yourTurn && <span className="pl-step">{canPlace ? 'place' : 'rotate'}</span>}
            </div>
            <div className={"pl " + oppColor + (!over && !isMyTurn ? " on" : "")}>
              <span className={"pl-marble " + oppColor} /><span className="pl-name">{oppLabel} · {NAME[oppColor]}</span>
              {!over && !isMyTurn && <span className="pl-step">{net.online ? 'moving' : 'thinking'}</span>}
            </div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {over && <ResultModal won={myWin} draw={s.winner === 'draw'} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, draw, oppLabel, onNew }: { won: boolean; draw: boolean; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={draw ? 'No line found' : won ? 'Five in a row' : 'Out-spun'}
      title={draw ? 'A Draw' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        {draw ? <span className="you">Stalemate</span> : <><span className={won ? 'you' : 'foe'}>{won ? 'You' : oppLabel}</span><span className="foe">five in a row</span></>}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Pentago" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Each turn has <b>two steps</b>: first <b>place</b> one of your marbles in any empty cell, then <b>rotate</b> one of the four 3×3 quadrants a quarter-turn — clockwise <i>↻</i> or counter-clockwise <i>↺</i>. White moves first.</p>
        <p>After the rotation, having <b>five of your marbles in a row</b> — horizontally, vertically, or diagonally, anywhere on the 6×6 (lines may cross quadrant borders) — wins.</p>
        <p>If both players make five at once after a rotation, or the board fills with no five, it's a <b>draw</b>.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> undo placement / close.</p>
      </div>
    </Modal>
  )
}
