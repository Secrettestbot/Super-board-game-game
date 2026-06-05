/* CONNECT FOUR — UI (built for this codebase). Click a column to drop; alpha-beta AI. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as C4 from './logic'
import type { C4State } from './logic'

const { W, H } = C4

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1f3c82" stroke="#2e5c92" strokeWidth="1.5" />
    <circle cx="16" cy="18" r="4.5" fill="#d8503f" /><circle cx="32" cy="18" r="4.5" fill="#0e1a36" />
    <circle cx="16" cy="32" r="4.5" fill="#0e1a36" /><circle cx="32" cy="32" r="4.5" fill="#e0b33e" />
  </svg>
)

function lowestEmpty(board: C4State['board'], c: number): number {
  for (let r = H - 1; r >= 0; r--) if (!board[r * W + c]) return r
  return -1
}

export function ConnectFour() {
  const [s, setS] = useState<C4State>(() => C4.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [hoverCol, setHoverCol] = useState<number | null>(null)

  function newGame() { setS(C4.makeGame()); setShowRules(false); setHoverCol(null) }

  useAITurn(!s.winner && s.turn === 'y', () => setS(p => C4.aiMove(p)), { delayMs: 500 })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && s.turn === 'r'
  function dropCol(c: number) { if (yourTurn && lowestEmpty(s.board, c) >= 0) setS(C4.drop(s, c, 'r')) }

  let banner: string, bk = ''
  if (s.winner === 'r') { bk = 'win'; banner = 'Four in a row — you win' }
  else if (s.winner === 'y') { bk = 'lose'; banner = 'The rival connects four' }
  else if (s.winner === 'draw') { bk = ''; banner = 'The board fills — a draw' }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — drop a disc' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  const lineSet = new Set(s.line || [])
  const ghostRow = hoverCol != null && yourTurn ? lowestEmpty(s.board, hoverCol) : -1

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Connect Four · drop &amp; connect"
        title="Connect Four"
        subtitle="stack the columns, line up four, and don't hand the rival an open three"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="7 × 6"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="c4-wrap">
          <div className="c4-board" onMouseLeave={() => setHoverCol(null)}>
            {Array.from({ length: W }, (_, c) => (
              <div key={c} className={"c4-col" + (yourTurn ? " live" : "")} onClick={() => dropCol(c)} onMouseEnter={() => setHoverCol(c)}>
                {Array.from({ length: H }, (_, r) => {
                  const v = s.board[r * W + c]
                  const ghost = !v && r === ghostRow && hoverCol === c
                  return (
                    <div key={r} className="c4-hole">
                      {v && <div className={"c4-disc " + v + (lineSet.has(r * W + c) ? " win" : "")} />}
                      {ghost && <div className="c4-disc r ghost" />}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="side">
          <div className="panel players">
            <div className={"pl r" + (s.turn === 'r' && !s.winner ? " on" : "")}><span className="pl-disc r"></span><span className="pl-name">You · Red</span></div>
            <div className={"pl y" + (s.turn === 'y' && !s.winner ? " on" : "")}><span className="pl-disc y"></span><span className="pl-name">Rival · Yellow</span></div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: C4State; onNew: () => void }) {
  const won = s.winner === 'r', draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Full house' : won ? 'Four in a row' : 'Outstacked'}
      title={draw ? 'A Draw' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">{draw ? 'Every slot filled, no four.' : won ? 'You lined up four.' : 'The rival lined up four first.'}</div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Connect Four" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Take turns dropping discs into the seven columns. A disc falls to the lowest empty slot. You are <b>Red</b> and drop first; the rival is <b>Yellow</b>.</p>
        <p>The first to line up <b>four of their colour</b> — horizontally, vertically, or diagonally — wins. Fill the grid with no four and it's a draw.</p>
        <p>Watch for the rival's <i>open threes</i>, and try to make two threats at once.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
