/* REVERSI / OTHELLO — UI (built for this codebase). 8x8 felt board on the framework shell,
   vs a positional alpha-beta AI, or a remote human via useGameSession. Legal squares are
   hinted; discs flip on capture. Seat 0 plays Black (moves first), seat 1 plays White. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { reversiAdapter } from './net'
import * as RV from './logic'
import type { Disc } from './logic'

const { N } = RV
const DISC: Disc[] = ['b', 'w'] // seat -> disc

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#16432c" stroke="#2f6a47" strokeWidth="1.5" />
    <circle cx="18" cy="18" r="6" fill="#1c211b" stroke="#000" strokeWidth="0.5" />
    <circle cx="30" cy="30" r="6" fill="#ece8db" stroke="#b8b29c" strokeWidth="0.5" />
  </svg>
)

export function Reversi() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(reversiAdapter)
  const [showRules, setShowRules] = useState(false)

  const myDisc = DISC[mySeat]            // your colour (seat 0 = Black, seat 1 = White)
  const oppDisc: Disc = myDisc === 'b' ? 'w' : 'b'
  const myName = myDisc === 'b' ? 'Black' : 'White'
  const oppName = oppDisc === 'b' ? 'Black' : 'White'
  const oppLabel = net.online ? 'Opponent' : 'Rival'

  function newGame() { netNew(); setShowRules(false) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && isMyTurn
  const legal = useMemo(() => yourTurn ? new Set(RV.legalMoves(s.board, myDisc)) : new Set<number>(), [yourTurn, s.board, myDisc])
  const { b, w } = RV.counts(s.board)
  const myN = myDisc === 'b' ? b : w
  const oppN = myDisc === 'b' ? w : b

  function clickCell(i: number) { if (yourTurn && legal.has(i)) dispatch({ cell: i }) }

  const iWon = s.winner === myDisc
  let banner: string, bk = ''
  if (s.winner === myDisc) { bk = 'win'; banner = `You win — ${myN} to ${oppN}` }
  else if (s.winner === oppDisc) { bk = 'lose'; banner = `${oppLabel} wins — ${oppN} to ${myN}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${myN}–${oppN}` }
  else if (yourTurn) { bk = 'you'; banner = `Your turn — place a ${myName.toLowerCase()} disc` }
  else { bk = 'foe'; banner = net.online ? `${oppLabel} is thinking…` : 'The rival is thinking…' }

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
          <div className="panel"><OnlineBar net={net} /></div>
          <div className="panel scoreboard">
            <div className={"sc " + myDisc + (s.turn === myDisc && !s.winner ? " on" : "")}><span className={"sc-disc " + myDisc}></span><span className="sc-name">You · {myName}</span><span className="sc-n">{myN}</span></div>
            <div className={"sc " + oppDisc + (s.turn === oppDisc && !s.winner ? " on" : "")}><span className={"sc-disc " + oppDisc}></span><span className="sc-name">{oppLabel} · {oppName}</span><span className="sc-n">{oppN}</span></div>
            <div className="sc-bar"><div className="sc-bar-b" style={{ width: `${(myN / (myN + oppN)) * 100}%` }} /></div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal winner={s.winner} won={iWon} myN={myN} oppN={oppN} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ winner, won, myN, oppN, oppLabel, onNew }: { winner: Disc | 'draw'; won: boolean; myN: number; oppN: number; oppLabel: string; onNew: () => void }) {
  const draw = winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : won ? 'Board control' : 'Out-flipped'}
      title={draw ? 'A Tie' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {myN}</span><span className="foe">{oppLabel} {oppN}</span></div>
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
