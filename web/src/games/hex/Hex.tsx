/* HEX — the connection game (UI, built for this codebase). An 11x11 rhombus of hexagons on the
   framework shell. Solo: you (amber) link top↔bottom vs a shortest-connection-distance AI (slate,
   left↔right). Online: seat 0 is amber/top-bottom, seat 1 is slate/left-right, and each side is
   shown from its own perspective. Click an empty cell to place; the winning chain lights up. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { hexAdapter } from './net'
import * as HX from './logic'
import type { Stone } from './logic'

const { N } = HX

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#181d27" stroke="#2c3445" strokeWidth="1.5" />
    <polygon points="24,9 33,14.5 33,25.5 24,31 15,25.5 15,14.5" fill="none" stroke="#e0a23c" strokeWidth="2" strokeLinejoin="round" />
    <polygon points="24,17 28.5,19.7 28.5,25.3 24,28 19.5,25.3 19.5,19.7" fill="#e0a23c" />
    <circle cx="33" cy="36" r="4" fill="#7e93b8" />
  </svg>
)

/** seat -> Stone (0 = amber/you, 1 = slate). */
const SEAT_STONE: Stone[] = ['y', 's']

export function Hex() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(hexAdapter)
  const [showRules, setShowRules] = useState(false)

  const myStone = SEAT_STONE[mySeat]              // your colour this seat
  const oppStone: Stone = myStone === 'y' ? 's' : 'y'
  const myAmber = myStone === 'y'                  // amber links top↕bottom, slate links left↔right
  const oppLabel = net.online ? 'Opponent' : 'Rival'

  function newGame() { netNew(); setShowRules(false) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && isMyTurn
  const winSet = new Set(s.win)

  function clickCell(i: number) { if (yourTurn && !s.board[i]) dispatch({ cell: i }) }

  const iWon = s.winner === myStone
  const myEdges = myAmber ? 'top ↕ bottom' : 'left ↔ right'
  const oppEdges = myAmber ? 'left ↔ right' : 'top ↕ bottom'

  let banner: string, bk = ''
  if (s.winner != null && iWon) { bk = 'win'; banner = `You connect ${myEdges} — you win` }
  else if (s.winner != null) { bk = 'lose'; banner = `${oppLabel} links ${oppEdges} — it wins` }
  else if (yourTurn) { bk = 'you'; banner = `Your turn — place ${myAmber ? 'an amber' : 'a slate'} stone` }
  else { bk = 'foe'; banner = net.online ? `${oppLabel} is thinking…` : 'The rival is thinking…' }

  const rows = []
  for (let r = 0; r < N; r++) {
    const cells = []
    for (let c = 0; c < N; c++) {
      const i = HX.idx(r, c)
      const v = s.board[i]
      cells.push(
        <button
          key={i}
          className={'hx-cell' + (s.last === i ? ' last' : '') + (winSet.has(i) ? ' win' : '')}
          onClick={() => clickCell(i)}
          disabled={!yourTurn || !!v}
          aria-label={`${'ABCDEFGHIJK'[c]}${r + 1}`}
        >
          <span className="hx-hex" />
          {v && <span className={'hx-stone ' + v} />}
        </button>,
      )
    }
    rows.push(<div className="hx-row" key={r}>{cells}</div>)
  }

  // seat-relative turn highlight: is it my / the opponent's move right now?
  const myOn = !s.winner && isMyTurn
  const oppOn = !s.winner && !isMyTurn

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Hex · connect your edges"
        title="Hex"
        subtitle="link your two sides with an unbroken chain — and block the rival linking theirs"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${N} × ${N}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="hx-wrap">
          <div className="hx-frame">
            <span className="hx-edge top" /><span className="hx-edge bottom" />
            <span className="hx-edge left" /><span className="hx-edge right" />
            <div className="hx-board">{rows}</div>
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel players">
            <div className={'pl ' + myStone + (myOn ? ' on' : '')}>
              <span className={'pl-stone ' + myStone} />
              <span className="pl-txt"><b>You · {myAmber ? 'Amber' : 'Slate'}</b><i>{myEdges}</i></span>
            </div>
            <div className={'pl ' + oppStone + (oppOn ? ' on' : '')}>
              <span className={'pl-stone ' + oppStone} />
              <span className="pl-txt"><b>{oppLabel} · {myAmber ? 'Slate' : 'Amber'}</b><i>{oppEdges}</i></span>
            </div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal iWon={iWon} myEdges={myEdges} oppEdges={oppEdges} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ iWon, myEdges, oppEdges, oppLabel, onNew }: { iWon: boolean; myEdges: string; oppEdges: string; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={iWon ? 'Edges linked' : 'Out-connected'}
      title={iWon ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className={iWon ? 'you' : 'foe'}>{iWon ? `${myEdges} connected` : `${oppEdges} connected`}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Hex" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>Amber</b> and move first. Click any empty hexagon to place a stone, then the rival (<b>Slate</b>) replies. You alternate — every move is a placement and there is <i>no passing</i>.</p>
        <p>You own the <b>top</b> and <b>bottom</b> edges and win by forming an unbroken chain of amber stones connecting them. Slate owns the <b>left</b> and <b>right</b> edges. Hexes touch their six neighbours, so chains can snake diagonally.</p>
        <p>Hex can <b>never draw</b> — exactly one player connects, so blocking the rival and building your own link are the same fight.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
