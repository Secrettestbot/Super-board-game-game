/* CHECKERS / ENGLISH DRAUGHTS — UI (built for this codebase). Hardwood 8x8 board on the
   framework shell, glossy red & black discs, vs a minimax alpha-beta AI — or a remote human
   via useGameSession. Click a piece to see its legal landings; captures are forced and
   multi-jumps resolve in one move. Seat-relative: your side comes from mySeat, the board
   flips for the Black seat so your discs sit nearest you. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { checkersAdapter } from './net'
import * as CK from './logic'
import type { Move, Side } from './logic'

const { N } = CK
const SIDE: Side[] = ['r', 'b'] // seat -> side

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#3a2417" stroke="#6b4427" strokeWidth="1.5" />
    <rect x="3" y="3" width="21" height="21" fill="#caa06a" />
    <rect x="24" y="24" width="21" height="21" fill="#caa06a" />
    <circle cx="16" cy="32" r="7" fill="#cf3030" stroke="#7e1414" strokeWidth="1" />
    <circle cx="32" cy="16" r="7" fill="#23262b" stroke="#000" strokeWidth="1" />
  </svg>
)

export function Checkers() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(checkersAdapter)
  const mySide = SIDE[mySeat] // 'r' for seat 0, 'b' for seat 1
  const oppSide: Side = mySide === 'r' ? 'b' : 'r'
  const [sel, setSel] = useState<number | null>(null)
  const [showRules, setShowRules] = useState(false)

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  const yourTurn = !s.winner && isMyTurn

  // all legal moves for the local player this turn, and which source squares can move
  const legal = useMemo(() => (yourTurn ? CK.legalMoves(s.board, mySide) : []), [yourTurn, s.board, mySide])
  const movableFrom = useMemo(() => new Set(legal.map(m => m.from)), [legal])
  const selMoves = useMemo<Move[]>(() => (sel == null ? [] : legal.filter(m => m.from === sel)), [sel, legal])
  const targets = useMemo(() => new Set(selMoves.map(m => m.to)), [selMoves])

  const c = CK.counts(s.board)
  const mine = (p: CK.Piece) => (mySide === 'r' ? p === 'r' || p === 'R' : p === 'b' || p === 'B')

  function clickCell(i: number) {
    if (!yourTurn) return
    const p = s.board[i]
    // selecting one of your movable pieces
    if (mine(p) && movableFrom.has(i)) {
      setSel(i === sel ? null : i)
      return
    }
    // moving to a highlighted target
    if (sel != null && targets.has(i)) {
      const m = selMoves.find(mv => mv.to === i)!
      dispatch({ from: m.from, to: m.to })
      setSel(null)
    }
  }

  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const myWin = s.winner === mySide

  let banner: string, bk = ''
  if (s.winner) {
    if (myWin) { bk = 'win'; banner = 'You win — the board is yours' }
    else { bk = 'lose'; banner = `${oppLabel} wins this one` }
  } else if (yourTurn) {
    bk = 'you'; banner = movableFrom.size ? 'Your turn — move a disc' : 'Your turn'
  } else {
    bk = 'foe'; banner = net.online ? `${oppLabel} is moving…` : 'The rival is thinking…'
  }

  const lastSet = s.last ? new Set([s.last.from, s.last.to]) : new Set<number>()
  // flip the board for the Black seat so the local player's pieces sit at the bottom
  const flip = mySide === 'b'
  const order = useMemo(
    () => Array.from({ length: N * N }, (_, k) => (flip ? N * N - 1 - k : k)),
    [flip],
  )

  // scoreboard counts relative to the local player
  const myCount = mySide === 'r' ? c.r : c.b
  const oppCount = mySide === 'r' ? c.b : c.r
  const myKings = mySide === 'r' ? c.rk : c.bk
  const oppKings = mySide === 'r' ? c.bk : c.rk
  const myName = mySide === 'r' ? 'Red' : 'Black'
  const oppName = oppSide === 'r' ? 'Red' : 'Black'

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Checkers · jump &amp; crown"
        title="Checkers"
        subtitle="march your men up the dark squares, force the jumps, and crown a king"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="8 × 8 · draughts"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="ck-wrap">
          <div className="ck-board">
            {order.map((i) => {
              const p = s.board[i]
              const dark = (Math.floor(i / N) + (i % N)) % 2 === 1
              const cls =
                'ck-cell ' + (dark ? 'dark' : 'light') +
                (i === sel ? ' sel' : '') +
                (targets.has(i) ? ' target' : '') +
                (lastSet.has(i) ? ' last' : '')
              const pickable = yourTurn && ((mine(p) && movableFrom.has(i)) || targets.has(i))
              return (
                <div key={i} className={cls + (pickable ? ' pick' : '')} onClick={() => clickCell(i)}>
                  {p && (
                    <div className={'ck-disc ' + (p === 'r' || p === 'R' ? 'r' : 'b')}>
                      {(p === 'R' || p === 'B') && <span className="ck-crown" />}
                    </div>
                  )}
                  {!p && targets.has(i) && <div className="ck-dot" />}
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
            <div className={'sc ' + mySide + (s.turn === mySide && !s.winner ? ' on' : '')}>
              <span className={'sc-disc ' + mySide} />
              <span className="sc-name">You · {myName}</span>
              <span className="sc-n">{myCount}</span>
            </div>
            <div className={'sc ' + oppSide + (s.turn === oppSide && !s.winner ? ' on' : '')}>
              <span className={'sc-disc ' + oppSide} />
              <span className="sc-name">{oppLabel} · {oppName}</span>
              <span className="sc-n">{oppCount}</span>
            </div>
            <div className="sc-kings">
              <span>{myKings} king{myKings === 1 ? '' : 's'}</span>
              <span>{oppKings} king{oppKings === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={myWin} myName={myName} oppName={oppName} oppLabel={oppLabel} myCount={myCount} oppCount={oppCount} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, myName, oppName, oppLabel, myCount, oppCount, onNew }: {
  won: boolean; myName: string; oppName: string; oppLabel: string; myCount: number; oppCount: number; onNew: () => void
}) {
  return (
    <Modal
      eyebrow={won ? 'Cleared the board' : 'Boxed in'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">{myName} {myCount}</span><span className="foe">{oppName} {oppCount}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Checkers" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>Red</b> at the bottom and move first. Men step <b>one diagonal square forward</b> onto an empty dark square — Red moves up, Black moves down.</p>
        <p>To <b>capture</b>, jump diagonally over an adjacent enemy into the empty square beyond. If a further jump is available with the same piece it <b>chains</b> — the whole multi-jump is one move. <i>Captures are mandatory:</i> if any jump exists you must take one.</p>
        <p>Reach the far row and your man is <b>crowned a King</b>, free to move and jump in <b>both</b> directions.</p>
        <p>Lose all your pieces — or have no legal move — and you lose. Click a piece to see its landings, then click a square to move.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
    </Modal>
  )
}
