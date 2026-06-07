/* CONNECT FOUR — UI (built for this codebase). Click a column to drop; alpha-beta AI
   in solo, or a remote human online. Seat-relative: "your side" comes from mySeat. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { connectFourAdapter } from './net'
import * as C4 from './logic'
import type { C4State, Disc } from './logic'

const { W, H } = C4

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1f3c82" stroke="#2e5c92" strokeWidth="1.5" />
    <circle cx="16" cy="18" r="4.5" fill="#d8503f" /><circle cx="32" cy="18" r="4.5" fill="#0e1a36" />
    <circle cx="16" cy="32" r="4.5" fill="#0e1a36" /><circle cx="32" cy="32" r="4.5" fill="#e0b33e" />
  </svg>
)

const SEAT_DISC: Record<number, Disc> = { 0: 'r', 1: 'y' }

function lowestEmpty(board: C4State['board'], c: number): number {
  for (let r = H - 1; r >= 0; r--) if (!board[r * W + c]) return r
  return -1
}

export function ConnectFour() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(connectFourAdapter)
  const myDisc: Disc = SEAT_DISC[mySeat] ?? 'r'
  const oppDisc: Disc = myDisc === 'r' ? 'y' : 'r'
  const [showRules, setShowRules] = useState(false)
  const [hoverCol, setHoverCol] = useState<number | null>(null)

  function newGame() { netNew(); setShowRules(false); setHoverCol(null) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && isMyTurn
  function dropCol(c: number) { if (yourTurn && lowestEmpty(s.board, c) >= 0) dispatch({ col: c }) }

  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const myColorName = myDisc === 'r' ? 'Red' : 'Yellow'
  const oppColorName = oppDisc === 'r' ? 'Red' : 'Yellow'

  let banner: string, bk = ''
  if (s.winner === myDisc) { bk = 'win'; banner = 'Four in a row — you win' }
  else if (s.winner === oppDisc) { bk = 'lose'; banner = `The ${oppLabel.toLowerCase()} connects four` }
  else if (s.winner === 'draw') { bk = ''; banner = 'The board fills — a draw' }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — drop a disc' }
  else { bk = 'foe'; banner = net.online ? 'Waiting for opponent…' : 'The rival is thinking…' }

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
                      {ghost && <div className={"c4-disc " + myDisc + " ghost"} />}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel players">
            <div className={"pl " + myDisc + (s.turn === myDisc && !s.winner ? " on" : "")}><span className={"pl-disc " + myDisc}></span><span className="pl-name">You · {myColorName}</span></div>
            <div className={"pl " + oppDisc + (s.turn === oppDisc && !s.winner ? " on" : "")}><span className={"pl-disc " + oppDisc}></span><span className="pl-name">{oppLabel} · {oppColorName}</span></div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} myDisc={myDisc} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, myDisc, oppLabel, onNew }: { s: C4State; myDisc: Disc; oppLabel: string; onNew: () => void }) {
  const won = s.winner === myDisc, draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Full house' : won ? 'Four in a row' : 'Outstacked'}
      title={draw ? 'A Draw' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">{draw ? 'Every slot filled, no four.' : won ? 'You lined up four.' : `The ${oppLabel.toLowerCase()} lined up four first.`}</div>
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
