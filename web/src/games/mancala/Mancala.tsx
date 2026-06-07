/* MANCALA — Kalah (6/4) UI on the framework shell. A carved-timber board: two rows of six
   rounded pits plus a big end store each. You sow your bottom row counterclockwise into your
   right store; landing your last seed in your store earns another turn — so a single side
   may sow several times in a row.

   Online-capable via useGameSession(mancalaAdapter): seat 0 = the original human side,
   seat 1 = the opponent (AI locally, a remote human online). Everything is rendered
   relative to mySeat — your pits/store sit at the bottom, the opponent at the top. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { mancalaAdapter } from './net'
import * as MC from './logic'
import type { MancalaState, Side } from './logic'

const SEAT_TO_SIDE: Side[] = ['you', 'ai']

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="9" width="42" height="30" rx="14" fill="#5a3a1e" stroke="#7a5230" strokeWidth="1.5" />
    <ellipse cx="11" cy="24" rx="4" ry="7" fill="#33200f" />
    <ellipse cx="37" cy="24" rx="4" ry="7" fill="#33200f" />
    <circle cx="20" cy="18" r="2.4" fill="#caa46a" />
    <circle cx="27" cy="18" r="2.4" fill="#caa46a" />
    <circle cx="20" cy="30" r="2.4" fill="#caa46a" />
    <circle cx="27" cy="30" r="2.4" fill="#caa46a" />
  </svg>
)

// render up to a cap of seed dots, scattered deterministically inside a pit
function Seeds({ n }: { n: number }) {
  const dots = Math.min(n, 12)
  return (
    <span className="seedfield">
      {Array.from({ length: dots }).map((_, k) => (
        <span key={k} className={'seed s' + (k % 4)} />
      ))}
    </span>
  )
}

export function Mancala() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(mancalaAdapter)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  // Seat-relative sides: mySide is whichever side this seat controls, oppSide the other.
  const mySide = SEAT_TO_SIDE[mySeat] // seat 0 -> 'you', seat 1 -> 'ai'
  const oppSide: Side = mySide === 'you' ? 'ai' : 'you'
  const oppLabel = net.online ? 'Opponent' : 'Rival'

  function newGame() { netNew(); setShowRules(false) }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && isMyTurn
  const legal = useMemo(
    () => (yourTurn ? new Set(MC.legalMoves(s.pits, mySide)) : new Set<number>()),
    [yourTurn, s.pits, mySide],
  )
  const counts = MC.storeCounts(s.pits)
  const myScore = mySide === 'you' ? counts.you : counts.ai
  const oppScore = mySide === 'you' ? counts.ai : counts.you

  function clickPit(i: number) { if (yourTurn && legal.has(i)) dispatch({ pit: i }) }

  // Did MY seat win? (s.winner is a Side or 'draw')
  const iWon = s.winner === mySide
  const oppWon = s.winner === oppSide

  let banner: string, bk = ''
  if (iWon) { bk = 'win'; banner = `You win — ${myScore} to ${oppScore}` }
  else if (oppWon) { bk = 'lose'; banner = `${oppLabel} wins — ${oppScore} to ${myScore}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${myScore}–${oppScore}` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — sow one of your pits' }
  else { bk = 'foe'; banner = net.online ? `${oppLabel} is thinking…` : 'The rival is thinking…' }

  // Board is always drawn relative to YOU at the bottom: your six pits read left→right in
  // your own sowing order, the opponent's pits read right→left across the top so the board
  // reads counterclockwise from your perspective.
  const myRow = mySide === 'you' ? [0, 1, 2, 3, 4, 5] : [12, 11, 10, 9, 8, 7]
  const oppRow = mySide === 'you' ? [12, 11, 10, 9, 8, 7] : [0, 1, 2, 3, 4, 5]

  function Pit({ i, mine }: { i: number; mine: boolean }) {
    const side: Side = mine ? mySide : oppSide
    const playable = mine && legal.has(i)
    return (
      <button
        type="button"
        className={'pit ' + (mine ? 'you' : 'ai') + (playable ? ' playable' : '') + (s.last === i ? ' last' : '') + (s.pits[i] === 0 ? ' empty' : '')}
        onClick={() => clickPit(i)}
        disabled={!playable}
        aria-label={`${mine ? 'Your' : oppLabel} pit ${MC.pitLabel(side, i)}, ${s.pits[i]} seeds`}
      >
        <Seeds n={s.pits[i]} />
        <span className="pit-count">{s.pits[i]}</span>
        <span className="pit-num">{MC.pitLabel(side, i)}</span>
      </button>
    )
  }

  function Store({ mine, n }: { mine: boolean; n: number }) {
    const side: Side = mine ? mySide : oppSide
    const on = !s.winner && s.turn === side
    return (
      <div className={'store ' + (mine ? 'you' : 'ai') + (on ? ' on' : '')}>
        <Seeds n={n} />
        <span className="store-count">{n}</span>
        <span className="store-label">{mine ? 'You' : oppLabel}</span>
      </div>
    )
  }

  const myTurnNow = !s.winner && s.turn === mySide
  const oppTurnNow = !s.winner && s.turn === oppSide

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Mancala · Kalah rules"
        title="Mancala"
        subtitle="sow your seeds counterclockwise, bank them in your store, and capture across the board"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="6 × 4 · Kalah"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="mc-wrap">
          <div className="mc-board">
            <Store mine={false} n={oppScore} />
            <div className="mc-pits">
              <div className="mc-row ai">{oppRow.map(i => <Pit key={i} i={i} mine={false} />)}</div>
              <div className="mc-row you">{myRow.map(i => <Pit key={i} i={i} mine={true} />)}</div>
            </div>
            <Store mine={true} n={myScore} />
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel scoreboard">
            <div className={'sc ai' + (oppTurnNow ? ' on' : '')}>
              <span className="sc-dot ai" /><span className="sc-name">{oppLabel}</span><span className="sc-n">{oppScore}</span>
            </div>
            <div className={'sc you' + (myTurnNow ? ' on' : '')}>
              <span className="sc-dot you" /><span className="sc-name">You</span><span className="sc-n">{myScore}</span>
            </div>
            <div className="sc-bar"><div className="sc-bar-you" style={{ width: `${(myScore / Math.max(1, myScore + oppScore)) * 100}%` }} /></div>
          </div>
          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal iWon={iWon} draw={s.winner === 'draw'} oppLabel={oppLabel} you={myScore} opp={oppScore} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ iWon, draw, oppLabel, you, opp, onNew }: { iWon: boolean; draw: boolean; oppLabel: string; you: number; opp: number; onNew: () => void }) {
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : iWon ? 'Seeds banked' : 'Out-sown'}
      title={draw ? 'A Tie' : iWon ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {you}</span><span className="foe">{oppLabel} {opp}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Mancala" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You own the <b>bottom six pits</b> and the <b>store on the right</b>. Each pit starts with four seeds. To move, lift all the seeds from one of your pits and <b>sow</b> them one at a time counterclockwise — along your row, into your store, then across the rival's row — but never into the rival's store.</p>
        <p>If your last seed lands in <i>your own store</i>, you take an <b>extra turn</b>.</p>
        <p>If your last seed lands in an <i>empty pit on your own side</i> and the pit directly opposite holds seeds, you <b>capture</b> both — that seed and all the opposite ones — into your store.</p>
        <p>When all six pits on <i>either</i> side are empty the game ends; each player banks the seeds left on their own side. <b>Most seeds wins.</b></p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
