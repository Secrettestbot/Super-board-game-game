/* GAME OF THE AMAZONS — UI (built for this codebase). A 10x10 frozen board on the
   framework shell, vs a mobility-minimax AI. Select an amazon (queen-move squares
   light up), click a destination, then click a square to shoot a burning arrow. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { amazonsAdapter } from './net'
import * as AZ from './logic'
import type { Side } from './logic'

const { N } = AZ

// Two interaction phases for the human turn: pick origin/destination, then pick the arrow.
type Sel =
  | { phase: 'pick' }                                  // choosing an amazon / destination
  | { phase: 'shoot'; from: number; to: number }       // amazon moved, choosing arrow square

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#16243a" stroke="#3a6a9a" strokeWidth="1.5" />
    <path d="M16 30 L14 18 L19 23 L24 16 L29 23 L34 18 L32 30 Z" fill="#e7eef6" stroke="#9fb6cc" strokeWidth="0.6" strokeLinejoin="round" />
    <rect x="15" y="31" width="18" height="3.4" rx="1.2" fill="#cdd9e6" />
    <path d="M36 12 l4 4 M40 12 l-4 4" stroke="#ff8a3c" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

function Queen({ side }: { side: AZ.Side }) {
  return (
    <svg className={'az-queen ' + side} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M11 27 L8 13 L14 19 L20 10 L26 19 L32 13 L29 27 Z" />
      <rect x="9.5" y="28" width="21" height="4.5" rx="1.6" />
      <circle cx="8" cy="11" r="2.1" /><circle cx="20" cy="8" r="2.1" /><circle cx="32" cy="11" r="2.1" />
    </svg>
  )
}

export function Amazons() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(amazonsAdapter)
  const mySide: Side = mySeat === 0 ? 'w' : 'b'   // seat 0 = White, seat 1 = Black
  const oppSide: Side = mySide === 'w' ? 'b' : 'w'
  const [sel, setSel] = useState<Sel>({ phase: 'pick' })
  const [pickedAmazon, setPickedAmazon] = useState<number | null>(null)
  const [showRules, setShowRules] = useState(false)

  function newGame() {
    netNew(); setSel({ phase: 'pick' }); setPickedAmazon(null); setShowRules(false)
  }
  function deselect() { setSel({ phase: 'pick' }); setPickedAmazon(null) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else deselect() },
  })

  const yourTurn = !s.winner && isMyTurn

  // Highlight sets for the current interaction phase.
  const moveTargets = useMemo(() => {
    if (!yourTurn || pickedAmazon === null || sel.phase !== 'pick') return new Set<number>()
    return new Set(AZ.queenMoves(s.board, pickedAmazon))
  }, [yourTurn, pickedAmazon, sel, s.board])

  const shootTargets = useMemo(() => {
    if (!yourTurn || sel.phase !== 'shoot') return new Set<number>()
    return new Set(AZ.arrowTargets(s.board, sel.from, sel.to))
  }, [yourTurn, sel, s.board])

  const myMob = AZ.mobility(s.board, mySide)
  const opMob = AZ.mobility(s.board, oppSide)
  const oppLabel = net.online ? 'Opponent' : 'Rival'

  function clickCell(i: number) {
    if (!yourTurn) return
    if (sel.phase === 'pick') {
      if (s.board[i] === mySide) { setPickedAmazon(i); return }         // (re)select an amazon
      if (pickedAmazon !== null && moveTargets.has(i)) {               // move it
        setSel({ phase: 'shoot', from: pickedAmazon, to: i })
        setPickedAmazon(null)
        return
      }
      // click on empty/other -> clear pending selection
      setPickedAmazon(null)
    } else {
      // shoot phase — dispatch the COMPLETE turn (glide + arrow) as one atomic intent
      if (shootTargets.has(i)) {
        dispatch({ from: sel.from, to: sel.to, arrow: i })
        deselect()
      }
    }
  }

  // While in the shoot phase the amazon visually sits on `to`, not `from`.
  const ghostFrom = sel.phase === 'shoot' ? sel.from : null
  const ghostTo = sel.phase === 'shoot' ? sel.to : null

  const myWin = s.winner === mySide
  let banner: string, bk = ''
  if (s.winner != null) {
    bk = myWin ? 'win' : 'lose'
    banner = myWin ? `You win — the ${oppLabel.toLowerCase()} is frozen` : `The ${oppLabel.toLowerCase()} wins — you are frozen`
  }
  else if (!yourTurn) { bk = 'foe'; banner = net.online ? 'Waiting for the opponent…' : 'The rival is thinking…' }
  else if (sel.phase === 'shoot') { bk = 'you'; banner = 'Shoot a burning arrow' }
  else if (pickedAmazon !== null) { bk = 'you'; banner = 'Choose where to glide' }
  else { bk = 'you'; banner = 'Your turn — select an amazon' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Amazons · move &amp; burn"
        title="Amazons"
        subtitle="glide a queen, then loose a flaming arrow to scorch a square — strand the rival to win"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="10 × 10"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules &nbsp; Esc · cancel</>}
      >
        <div className="az-wrap">
          <div className="az-board">
            {s.board.map((v, i) => {
              const isMoveT = moveTargets.has(i)
              const isShootT = shootTargets.has(i)
              const isSelected = pickedAmazon === i
              const lastMove = s.lastMoveFrom === i || s.lastMoveTo === i
              const cls = 'az-cell'
                + (((Math.floor(i / N) + (i % N)) % 2 === 0) ? ' lite' : ' dark')
                + (isMoveT ? ' move-t' : '')
                + (isShootT ? ' shoot-t' : '')
                + (isSelected ? ' selected' : '')
                + (lastMove ? ' last' : '')
                + (s.lastShot === i ? ' last-shot' : '')
              // The amazon to render here, accounting for the in-progress shoot phase.
              let piece: AZ.Side | null = (v === 'w' || v === 'b') ? v : null
              if (i === ghostFrom) piece = null
              if (i === ghostTo) piece = mySide
              const burned = v === 'x'
              return (
                <div key={i} className={cls} onClick={() => clickCell(i)}>
                  {burned && <div className="az-burn" />}
                  {piece && <Queen side={piece} />}
                  {isMoveT && !piece && <div className="az-dot" />}
                  {isShootT && <div className="az-spark" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel az-score">
            <div className={'az-row ' + mySide + (s.turn === mySide && !s.winner ? ' on' : '')}>
              <Queen side={mySide} /><span className="az-name">You · {mySide === 'w' ? 'White' : 'Black'}</span><span className="az-mob">{myMob}</span>
            </div>
            <div className={'az-row ' + oppSide + (s.turn === oppSide && !s.winner ? ' on' : '')}>
              <Queen side={oppSide} /><span className="az-name">{oppLabel} · {oppSide === 'w' ? 'White' : 'Black'}</span><span className="az-mob">{opMob}</span>
            </div>
            <div className="az-readout">
              <span>mobility</span>
              <div className="az-bar">
                <div className="az-bar-w" style={{ width: `${(myMob / Math.max(1, myMob + opMob)) * 100}%` }} />
              </div>
            </div>
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={myWin} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, oppLabel, onNew }: { won: boolean; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Territory seized' : 'Stranded'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>{won
          ? `The ${oppLabel.toLowerCase()} has no amazon that can move — every queen is walled in by ice and fire.`
          : 'All four of your amazons are boxed in. Control more open territory next time.'}</p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Game of the Amazons" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>White</b> with four <b>amazons</b> and move first. Each turn has two parts.</p>
        <p>First <b>move</b> one amazon like a chess <b>queen</b> — any number of empty squares in a straight line (horizontal, vertical, or diagonal). It may not pass through another amazon or a burned square.</p>
        <p>Then, from its new square, <b>shoot a flaming arrow</b> along another queen-line. The square it lands on <i>burns</i> permanently — no amazon may ever move through or onto it.</p>
        <p>The board fills with fire and the open space shrinks. A player who <b>cannot move any amazon loses</b>.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel selection.</p>
      </div>
    </Modal>
  )
}
