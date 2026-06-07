/* QUARTO — UI (built for this codebase). A 4x4 gallery and 16 unique pieces; your rival picks
   the piece you must place, you pick theirs. Complete a line of four sharing any one trait to win.
   Online-capable via useGameSession: seat 0 = you, seat 1 = the other side (AI in solo). */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { quartoAdapter } from './net'
import * as Q from './logic'
import type { QuartoState, Piece, Player } from './logic'

const SEAT_PLAYER: Record<number, Player> = { 0: 'you', 1: 'ai' }

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1a1622" stroke="#3a3450" strokeWidth="1.5" />
    <circle cx="18" cy="18" r="7" fill="none" stroke="#cdbbe6" strokeWidth="2" />
    <rect x="25" y="25" width="13" height="13" rx="2" fill="#8a6fd6" />
  </svg>
)

/** A rendered Quarto piece. size class scales tall/short; classes carry colour/shape/fill. */
function PieceView({ p, big }: { p: Piece; big?: boolean }) {
  const a = Q.attrs(p)
  const cls = [
    'qt-piece',
    a.tall ? 'tall' : 'short',
    a.dark ? 'dark' : 'light',
    a.square ? 'square' : 'round',
    a.solid ? 'solid' : 'hollow',
    big ? 'big' : '',
  ].join(' ')
  return (
    <span className={cls} title={Q.pieceName(p)}>
      <span className="qt-body">{!a.solid && <span className="qt-hole" />}</span>
    </span>
  )
}

export function Quarto() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(quartoAdapter)
  const myPlayer = SEAT_PLAYER[mySeat] // seat 0 = 'you', seat 1 = 'ai'
  const [showRules, setShowRules] = useState(false)

  function newGame() { netNew(); setShowRules(false) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && isMyTurn
  const youPlacing = yourTurn && s.hand !== null    // must place the handed piece
  const youHanding = yourTurn && s.hand === null     // must hand a piece to opponent

  function clickCell(i: number) {
    if (youPlacing && s.board[i] === null) dispatch({ kind: 'place', cell: i })
  }
  function clickPool(p: Piece) {
    if (youHanding) dispatch({ kind: 'give', piece: p })
  }

  const oppLabel = net.online ? 'opponent' : 'rival'
  const oppLabelCap = net.online ? 'Opponent' : 'Rival'
  const iWon = s.winner === myPlayer
  const oppWon = s.winner != null && s.winner !== 'draw' && s.winner !== myPlayer

  let banner: string, bk = ''
  if (iWon) { bk = 'win'; banner = 'Quarto — you win' }
  else if (oppWon) { bk = 'lose'; banner = `The ${oppLabel} completes a line` }
  else if (s.winner === 'draw') { bk = ''; banner = 'The gallery fills — a draw' }
  else if (youPlacing) { bk = 'you'; banner = 'Place the piece you were handed' }
  else if (youHanding) { bk = 'you'; banner = `Now hand a piece to the ${oppLabel}` }
  else { bk = 'foe'; banner = s.hand !== null ? `The ${oppLabel} is placing…` : `The ${oppLabel} is choosing…` }

  const pool = Q.poolPieces(s.pool)
  const winSet = new Set(s.line ?? [])

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Quarto · the rival picks your piece"
        title="Quarto"
        subtitle="four in a line sharing any single trait wins — but your opponent chooses what you play"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="4 × 4 · 16 pieces"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="qt-wrap">
          <div className="qt-board">
            {s.board.map((v, i) => (
              <div
                key={i}
                className={'qt-cell' + (youPlacing && v === null ? ' open' : '') + (s.last === i ? ' last' : '') + (winSet.has(i) ? ' win' : '')}
                onClick={() => clickCell(i)}
              >
                {v !== null && <PieceView p={v} />}
              </div>
            ))}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>

          <div className="panel handbox">
            <div className="panel-l">{s.hand !== null ? (yourTurn ? 'You must place' : `${oppLabelCap} must place`) : 'No piece in hand'}</div>
            <div className="hand-stage">
              {s.hand !== null
                ? <PieceView p={s.hand} big />
                : <span className="hand-empty">—</span>}
            </div>
            {s.hand !== null && <div className="hand-name">{Q.pieceName(s.hand)}</div>}
          </div>

          <div className={'panel poolbox' + (youHanding ? ' active' : '')}>
            <div className="panel-l">{youHanding ? 'Pick one to hand over' : 'Pieces remaining'}</div>
            <div className="qt-pool">
              {pool.map(p => (
                <button
                  key={p}
                  className={'qt-poolslot' + (youHanding ? ' pickable' : '')}
                  disabled={!youHanding}
                  onClick={() => clickPool(p)}
                >
                  <PieceView p={p} />
                </button>
              ))}
              {pool.length === 0 && <span className="hand-empty">—</span>}
            </div>
          </div>

          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={iWon} draw={s.winner === 'draw'} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, draw, oppLabel, onNew }: { won: boolean; draw: boolean; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={draw ? 'No line found' : won ? 'A line of four' : 'Out-curated'}
      title={draw ? 'A Draw' : won ? 'You Win' : `${oppLabel[0].toUpperCase() + oppLabel.slice(1)} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        {draw
          ? <p>The gallery filled with no row, column, or diagonal of four sharing a single trait. Honours even.</p>
          : <p>{won ? 'You' : `The ${oppLabel}`} completed a line of four pieces sharing a common trait — <b>Quarto!</b></p>}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Quarto" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Sixteen pieces, each unique across <b>four traits</b>: <i>tall / short</i>, <i>dark / light</i>, <i>square / round</i>, and <i>solid / hollow</i>.</p>
        <p>The twist: <b>you never choose your own piece</b>. Your opponent hands you the piece you must place on any empty cell. Then <b>you</b> hand one of the remaining pieces to them.</p>
        <p>Win by completing any row, column, or main diagonal of four pieces that <b>all share at least one trait</b> — all tall, all hollow, all round, and so on. Fill the board with no such line and it's a draw.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
