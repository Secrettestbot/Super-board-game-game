/* REVERSI / OTHELLO — UI (built for this codebase). 8x8 felt board on the framework shell,
   vs a positional alpha-beta AI. Legal squares are hinted; discs flip on capture. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as RV from './logic'
import type { ReversiState } from './logic'

const { N } = RV

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#16432c" stroke="#2f6a47" strokeWidth="1.5" />
    <circle cx="18" cy="18" r="6" fill="#1c211b" stroke="#000" strokeWidth="0.5" />
    <circle cx="30" cy="30" r="6" fill="#ece8db" stroke="#b8b29c" strokeWidth="0.5" />
  </svg>
)

export function Reversi() {
  const [s, setS] = useState<ReversiState>(() => RV.makeGame())
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(RV.makeGame()); setShowRules(false) }

  useAITurn(!s.winner && s.turn === 'w', () => setS(p => RV.aiMove(p)), { delayMs: 480 })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && s.turn === 'b'
  const legal = useMemo(() => yourTurn ? new Set(RV.legalMoves(s.board, 'b')) : new Set<number>(), [yourTurn, s.board])
  const { b, w } = RV.counts(s.board)

  function clickCell(i: number) { if (yourTurn && legal.has(i)) setS(RV.place(s, i, 'b')) }

  let banner: string, bk = ''
  if (s.winner === 'b') { bk = 'win'; banner = `You win — ${b} to ${w}` }
  else if (s.winner === 'w') { bk = 'lose'; banner = `The rival wins — ${w} to ${b}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${b}–${w}` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — place a black disc' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Reversi · flank &amp; flip"
        title="Reversi"
        subtitle="bracket the rival's discs to flip them — and never give away a corner"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="8 × 8"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="rv-wrap">
          <div className="rv-board">
            {s.board.map((v, i) => (
              <div key={i} className={"rv-cell" + (legal.has(i) ? " hint" : "") + (s.last === i ? " last" : "")} onClick={() => clickCell(i)}>
                {v && <div className={"rv-disc " + v} />}
                {!v && legal.has(i) && <div className="rv-dot" />}
              </div>
            ))}
          </div>
        </div>

        <div className="side">
          <div className="panel scoreboard">
            <div className={"sc b" + (s.turn === 'b' && !s.winner ? " on" : "")}><span className="sc-disc b"></span><span className="sc-name">You · Black</span><span className="sc-n">{b}</span></div>
            <div className={"sc w" + (s.turn === 'w' && !s.winner ? " on" : "")}><span className="sc-disc w"></span><span className="sc-name">Rival · White</span><span className="sc-n">{w}</span></div>
            <div className="sc-bar"><div className="sc-bar-b" style={{ width: `${(b / (b + w)) * 100}%` }} /></div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} b={b} w={w} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, b, w, onNew }: { s: ReversiState; b: number; w: number; onNew: () => void }) {
  const won = s.winner === 'b', draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : won ? 'Board control' : 'Out-flipped'}
      title={draw ? 'A Tie' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {b}</span><span className="foe">Rival {w}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Reversi" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>Black</b> and move first. Place a disc so that it <b>brackets</b> a straight line of the rival's discs — horizontally, vertically, or diagonally — between your new disc and another of yours. Every disc in between <b>flips</b> to your colour.</p>
        <p>Every move must flip at least one disc. If you have no legal move you <i>pass</i>. When neither side can move, whoever has <b>more discs wins</b>.</p>
        <p><b>Corners</b> can never be flipped, so they're worth fighting for — and beware the squares next to them.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
