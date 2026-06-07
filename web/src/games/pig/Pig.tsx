/* PIG — UI (built for this codebase). A push-your-luck dice race to 100 on the framework
   shell. Solo: you (seat 0) vs a "hold at 20" AI (seat 1). Online: host is seat 0, a remote
   guest takes seat 1. The view is seat-relative — "you" is always whoever is at mySeat — and
   useGameSession drives the AI for any unfilled seat. The AI rolls several times per turn, so
   the hook re-arms on a tick that changes each roll (rollCount) and the dice land one at a time. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { pigAdapter } from './net'
import * as PG from './logic'
import type { PigState, Player } from './logic'

const { GOAL } = PG

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="6" y="6" width="36" height="36" rx="9" fill="#e8443a" stroke="#8e231d" strokeWidth="1.5" />
    <rect x="6" y="6" width="36" height="14" rx="9" fill="#fff" opacity="0.14" />
    <circle cx="16" cy="16" r="3.4" fill="#fff4f1" />
    <circle cx="32" cy="16" r="3.4" fill="#fff4f1" />
    <circle cx="24" cy="24" r="3.4" fill="#fff4f1" />
    <circle cx="16" cy="32" r="3.4" fill="#fff4f1" />
    <circle cx="32" cy="32" r="3.4" fill="#fff4f1" />
  </svg>
)

// Pip layouts per face (1..6), as 9-cell grid booleans.
const FACES: Record<number, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
}

function Die({ value, bust, rollKey }: { value: number; bust: boolean; rollKey: number }) {
  const cells = FACES[value] || FACES[1]
  return (
    <div key={rollKey} className={'die rolling' + (bust ? ' bust' : '')} aria-label={`die showing ${value}`}>
      {cells.map((on, i) => <span key={i} className={'pip' + (on ? '' : ' off')} />)}
    </div>
  )
}

export function Pig() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(pigAdapter)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  // Seat-relative: "me" is whoever sits at mySeat (seat 0 -> 'you', seat 1 -> 'ai' encoding).
  const me: Player = mySeat === 0 ? 'you' : 'ai'
  const opp: Player = me === 'you' ? 'ai' : 'you'
  const myScore = s.scores[me]
  const oppScore = s.scores[opp]
  const oppName = net.online ? 'Opponent' : 'Rival'

  function newGame() { netNew(); setShowRules(false) }

  const yourTurn = !s.winner && isMyTurn
  const oppTurn = !s.winner && !isMyTurn

  function rollYou() { if (yourTurn) dispatch({ kind: 'roll' }) }
  function holdYou() { if (yourTurn && s.turnTotal > 0) dispatch({ kind: 'hold' }) }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === ' ') { rollYou(); return true }
      if (e.key === 'h' || e.key === 'H') { holdYou(); return true }
      return false
    },
  })

  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = `You reached ${GOAL} — you win!` }
  else if (s.winner === opp) { bk = 'lose'; banner = `${oppName} reached ${GOAL} — you lose` }
  else if (s.busted && yourTurn) { bk = 'lose'; banner = `${oppName} busted on a 1!` } // opp just busted, now your turn
  else if (s.busted && oppTurn) { bk = 'you'; banner = 'You busted on a 1 — turn lost' } // you just busted, now opp's turn
  else if (yourTurn) { bk = 'you'; banner = 'Your roll — push your luck or hold' }
  else { bk = 'foe'; banner = `${oppName} is rolling…` }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Pig · push your luck"
        title="Pig"
        subtitle="roll to build your turn — but a single 1 wipes it all. Bank smart, race to 100"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`First to ${GOAL}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>Space · roll &nbsp; H · hold &nbsp; N · new</>}
      >
        <div className="pig-wrap">
          <div className="pig-table">
            <div className="pig-turnlabel">{s.winner ? 'game over' : yourTurn ? 'your turn' : `${oppName.toLowerCase()}'s turn`}</div>
            {s.die == null
              ? <div className="die-empty">{s.winner ? 'done' : 'ready to roll'}</div>
              : <Die value={s.die} bust={s.busted} rollKey={s.rollCount} />}
            <div className="turn-readout">
              <div className={'tr-num' + (s.busted ? ' bust' : '')}>{s.busted ? 0 : s.turnTotal}</div>
              <div className="tr-label">turn total</div>
            </div>
            <div className="pig-actions">
              <button className="big-btn roll" onClick={rollYou} disabled={!yourTurn}>Roll</button>
              <button className="big-btn hold" onClick={holdYou} disabled={!yourTurn || s.turnTotal === 0}>Hold</button>
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel scoreboard">
            <div className={'sc' + (yourTurn ? ' on' : '')}>
              <span className="sc-token you" />
              <span className="sc-name">You</span>
              <span className="sc-n">{myScore}</span>
            </div>
            <div className={'sc' + (oppTurn ? ' on' : '')}>
              <span className="sc-token ai" />
              <span className="sc-name">{oppName}</span>
              <span className="sc-n">{oppScore}</span>
            </div>
            <div className="sc-goal">banked points · first to {GOAL} wins</div>
          </div>
          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={s.winner === me} myScore={myScore} oppScore={oppScore} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, myScore, oppScore, oppName, onNew }: { won: boolean; myScore: number; oppScore: number; oppName: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Nerves of steel' : 'Out-rolled'}
      title={won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {myScore}</span><span className="foe">{oppName} {oppScore}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Pig" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Roll out</button>}>
      <div className="modal-body">
        <p>It's you against the rival — first to <b>{GOAL}</b> points wins. On your turn you keep <b>rolling</b> one die, adding each roll to your <i>turn total</i>.</p>
        <p>Roll a <b>2–6</b> and it's added — roll again or quit while you're ahead. Roll a <b>1</b> (the "pig") and your whole turn total is <b>wiped to zero</b> and your turn ends.</p>
        <p><b>Hold</b> to bank your turn total into your permanent score and pass the turn. The trick is knowing when to stop pressing your luck.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> roll · <kbd>H</kbd> hold · <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
