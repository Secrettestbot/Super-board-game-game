/* TIC-TAC-TOE — UI (built for this codebase). 3x3 board on the framework shell, vs a
   perfect minimax AI. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as TTT from './logic'
import type { Mark, TTTState } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#13171d" stroke="#33414e" strokeWidth="1.5" />
    <path d="M19 11 V37 M29 11 V37 M11 19 H37 M11 29 H37" stroke="#3a4658" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M13 13 L18 18 M18 13 L13 18" stroke="#4ec5c0" strokeWidth="2" strokeLinecap="round" />
    <circle cx="33" cy="33" r="3.2" fill="none" stroke="#e08a5a" strokeWidth="2" />
  </svg>
)

function CellMark({ m }: { m: Mark }) {
  if (m === 'x') return (
    <svg className="mk mk-x" viewBox="0 0 100 100"><line x1="24" y1="24" x2="76" y2="76" /><line x1="76" y1="24" x2="24" y2="76" /></svg>
  )
  return <svg className="mk mk-o" viewBox="0 0 100 100"><circle cx="50" cy="50" r="27" /></svg>
}

export function TicTacToe() {
  const [s, setS] = useState<TTTState>(() => TTT.makeGame())
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(TTT.makeGame()); setShowRules(false) }

  useAITurn(!s.winner && s.turn === 'o', () => setS(p => TTT.aiMove(p)), { delayMs: 420 })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && s.turn === 'x'
  function clickCell(i: number) { if (yourTurn && !s.board[i]) setS(TTT.place(s, i, 'x')) }

  let banner: string, bk = ''
  if (s.winner === 'x') { bk = 'win'; banner = 'You win' }
  else if (s.winner === 'o') { bk = 'lose'; banner = 'The rival wins' }
  else if (s.winner === 'draw') { bk = ''; banner = 'A draw' }
  else if (yourTurn) { bk = 'you'; banner = 'Your move — place an X' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  const lineSet = new Set(s.line || [])

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Tic-Tac-Toe · three in a row"
        title="Tic-Tac-Toe"
        subtitle="the oldest paper game there is — against an opponent that never blunders"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="3 × 3"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="ttt-wrap">
          <div className="ttt-board">
            {s.board.map((m, i) => (
              <button key={i} className={"ttt-cell" + (lineSet.has(i) ? " win" : "") + (yourTurn && !m ? " open" : "")}
                onClick={() => clickCell(i)} disabled={!!m || !yourTurn}>
                {m && <CellMark m={m} />}
              </button>
            ))}
          </div>
        </div>

        <div className="side">
          <div className="panel players">
            <div className={"pl x" + (s.turn === 'x' && !s.winner ? " on" : "")}><span className="pl-mk x">✕</span><span className="pl-name">You · X</span></div>
            <div className={"pl o" + (s.turn === 'o' && !s.winner ? " on" : "")}><span className="pl-mk o">○</span><span className="pl-name">Rival · O</span></div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: TTTState; onNew: () => void }) {
  const won = s.winner === 'x', draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Stalemate' : won ? 'Against the odds' : 'Outplayed'}
      title={draw ? 'A Draw' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">{draw ? 'Neither side slipped.' : won ? 'You out-thought a perfect player.' : 'Three in a row for the rival.'}</div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Tic-Tac-Toe" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Take turns marking the squares of a 3×3 grid. You are <b>X</b> and move first; the rival is <b>O</b>.</p>
        <p>The first to line up <b>three of their mark</b> in a row — across, down, or diagonally — wins. Fill the grid with no line and it's a draw.</p>
        <p>The rival plays a <i>perfect</i> game, so flawless play ends level. One slip and it pounces.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
