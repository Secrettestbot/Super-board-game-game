/* BREAKTHROUGH — UI (built for this codebase). 8x8 two-tone board on the framework shell,
   vs an alpha-beta minimax AI or a remote opponent. Click a pawn to see its legal steps &
   diagonal captures; reach the far row to break through. Seat-relative: your side comes from
   mySeat (0 = White, 1 = Black), the board flips so your pawns sit nearest you, and the AI
   for any empty seat is driven by useGameSession. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { breakthroughAdapter, SIDE } from './net'
import * as BT from './logic'
import type { Move, Pawn } from './logic'

const { N } = BT

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1b2740" stroke="#3a4f7a" strokeWidth="1.5" />
    <circle cx="16" cy="32" r="6" fill="#eef2fb" stroke="#b6c0d8" strokeWidth="0.5" />
    <circle cx="32" cy="16" r="6" fill="#1a2030" stroke="#000" strokeWidth="0.5" />
    <path d="M24 33 L24 16 M19 21 L24 15 L29 21" stroke="#7fd0ff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function Breakthrough() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(breakthroughAdapter)
  const myColor: Pawn = SIDE[mySeat] // seat 0 = White, seat 1 = Black
  const oppColor: Pawn = myColor === 'w' ? 'b' : 'w'
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  const yourTurn = !s.winner && isMyTurn
  const myMoves = useMemo(() => yourTurn ? BT.legalMoves(s.board, myColor) : [], [yourTurn, s.board, myColor])
  const dests = useMemo(() => {
    const map = new Map<number, Move>()
    if (sel !== null) for (const m of myMoves) if (m.from === sel) map.set(m.to, m)
    return map
  }, [myMoves, sel])
  const movable = useMemo(() => new Set(myMoves.map(m => m.from)), [myMoves])
  const { w, b } = BT.counts(s.board)
  const myCount = myColor === 'w' ? w : b
  const oppCount = myColor === 'w' ? b : w

  // Flip the board so the local player's home rows sit at the bottom.
  const flip = mySeat !== 0
  const order = useMemo(
    () => flip ? Array.from({ length: N * N }, (_, i) => N * N - 1 - i) : Array.from({ length: N * N }, (_, i) => i),
    [flip],
  )

  function clickCell(i: number) {
    if (!yourTurn) return
    const m = dests.get(i)
    if (m) { dispatch({ from: m.from, to: m.to }); setSel(null); return }
    if (s.board[i] === myColor && movable.has(i)) { setSel(i === sel ? null : i); return }
    setSel(null)
  }

  const myWin = s.winner === myColor
  const oppLabel = net.online ? 'Opponent' : 'Rival'

  let banner: string, bk = ''
  if (s.winner === myColor) { bk = 'win'; banner = 'You broke through — you win!' }
  else if (s.winner === oppColor) { bk = 'lose'; banner = `${oppLabel} broke through` }
  else if (yourTurn) { bk = 'you'; banner = sel === null ? 'Your turn — pick a pawn' : 'Choose where to advance' }
  else { bk = 'foe'; banner = net.online ? `${oppLabel} is moving…` : 'The rival is thinking…' }

  const oppName = oppColor === 'w' ? 'White' : 'Black'
  const myName = myColor === 'w' ? 'White' : 'Black'

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Breakthrough · race the line"
        title="Breakthrough"
        subtitle="march a pawn to the far rank — capture only on the diagonals, never head-on"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="8 × 8"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="bt-wrap">
          <div className="bt-board">
            {order.map((i) => {
              const v = s.board[i]
              const isDark = ((Math.floor(i / N) + (i % N)) % 2) === 1
              const dest = dests.get(i)
              const cls = 'bt-cell' + (isDark ? ' dark' : ' light')
                + (sel === i ? ' sel' : '')
                + (dest ? (dest.cap ? ' cap' : ' move') : '')
                + (s.last && (s.last.from === i || s.last.to === i) ? ' last' : '')
              return (
                <div key={i} className={cls} onClick={() => clickCell(i)}>
                  {v && <div className={'bt-pawn ' + v + (movable.has(i) && yourTurn ? ' live' : '')} />}
                  {!v && dest && <div className="bt-dot" />}
                  {v && dest && dest.cap && <div className="bt-ring" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel scoreboard">
            <div className={'sc ' + oppColor + (s.turn === oppColor && !s.winner ? ' on' : '')}>
              <span className={'sc-pawn ' + oppColor}></span>
              <span className="sc-name">{net.online ? 'Opponent' : 'Rival'} · {oppName}</span>
              <span className="sc-n">{oppCount}</span>
            </div>
            <div className={'sc ' + myColor + (s.turn === myColor && !s.winner ? ' on' : '')}>
              <span className={'sc-pawn ' + myColor}></span>
              <span className="sc-name">You · {myName}</span>
              <span className="sc-n">{myCount}</span>
            </div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={myWin} oppLabel={oppLabel} my={myCount} opp={oppCount} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, oppLabel, my, opp, onNew }: { won: boolean; oppLabel: string; my: number; opp: number; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Line broken' : 'Outrun'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {my}</span><span className="foe">{oppLabel} {opp}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Breakthrough" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>March your pawns toward the far rank. A pawn steps one square <b>straight- or diagonally-forward</b> onto an empty square.</p>
        <p>You may <b>capture only on the diagonals</b> — landing on an enemy pawn one step forward-left or forward-right and removing it. You can <b>never</b> capture straight ahead, and there is no double move.</p>
        <p>The first player to land a pawn on the <b>far home row</b> wins instantly. You also win if your opponent has no pieces or no legal move.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
