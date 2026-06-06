/* WARI / OWARE — Abapa capture rules on the framework shell. Two rows of six carved
   pits, four seeds each, no end stores — captured seeds bank into a per-player count.
   You sow your row counterclockwise; landing your last seed in a rival pit that
   becomes 2 or 3 captures it (and chains backward).

   Online-capable via useGameSession(wariAdapter): seat 0 = the 'you' side (bottom pits
   0..5, moves first), seat 1 = the 'ai' side (pits 6..11). Solo play fills seat 1 with
   the depth-7 alpha-beta AI; online play hands seat 1 to a remote human. The board and
   all banners/scores are rendered relative to your own seat. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { wariAdapter } from './net'
import * as W from './logic'
import type { WariState, Side } from './logic'

const SEAT_SIDE: Record<number, Side> = { 0: 'you', 1: 'ai' }

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="11" width="42" height="26" rx="9" fill="#5a3a1c" stroke="#8a5a28" strokeWidth="1.5" />
    <ellipse cx="13" cy="19" rx="4" ry="4.6" fill="#2a1808" />
    <ellipse cx="24" cy="19" rx="4" ry="4.6" fill="#2a1808" />
    <ellipse cx="35" cy="19" rx="4" ry="4.6" fill="#2a1808" />
    <ellipse cx="13" cy="29" rx="4" ry="4.6" fill="#2a1808" />
    <ellipse cx="24" cy="29" rx="4" ry="4.6" fill="#2a1808" />
    <ellipse cx="35" cy="29" rx="4" ry="4.6" fill="#2a1808" />
    <circle cx="13" cy="19" r="1.6" fill="#d6a85a" />
    <circle cx="35" cy="29" r="1.6" fill="#d6a85a" />
    <circle cx="24" cy="29" r="1.6" fill="#d6a85a" />
  </svg>
)

// scatter up to a cap of seed dots inside a pit (deterministic per index)
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

export function Wari() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(wariAdapter)
  const mySide: Side = SEAT_SIDE[mySeat]            // the side YOU control
  const oppSide: Side = mySide === 'you' ? 'ai' : 'you'
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setShowRules(false) }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = s.winner == null && isMyTurn
  const legal = useMemo(
    () => (yourTurn ? new Set(W.legalMoves(s.pits, mySide)) : new Set<number>()),
    [yourTurn, s.pits, mySide],
  )
  // captured counts relative to YOU
  const mine = mySide === 'you' ? s.captured.you : s.captured.ai
  const theirs = mySide === 'you' ? s.captured.ai : s.captured.you

  function clickPit(i: number) { if (yourTurn && legal.has(i)) dispatch(i) }

  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const myWin = (s.winner as Side | 'draw' | null) === mySide
  const oppWin = s.winner != null && s.winner !== 'draw' && s.winner !== mySide

  let banner: string, bk = ''
  if (myWin) { bk = 'win'; banner = `You win — ${mine} to ${theirs}` }
  else if (oppWin) { bk = 'lose'; banner = `${oppLabel} wins — ${theirs} to ${mine}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${mine}–${theirs}` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — sow one of your pits' }
  else { bk = 'foe'; banner = net.online ? `${oppLabel} is thinking…` : 'The rival is thinking…' }

  // Render YOUR six pits along the bottom and the OPPONENT's six along the top, drawn so
  // the board reads counterclockwise from your seat. 'you' pits are 0..5, 'ai' pits 6..11.
  // Bottom row: your pits in sowing order (left→right). Top row: opponent's pits reversed.
  const myPits = mySide === 'you' ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11]
  const oppPits = mySide === 'you' ? [6, 7, 8, 9, 10, 11] : [0, 1, 2, 3, 4, 5]
  const topRow = oppPits.slice().reverse()
  const bottomRow = myPits
  const capSet = new Set(s.capturedPits)

  function Pit({ i, owner }: { i: number; owner: 'mine' | 'theirs' }) {
    const playable = owner === 'mine' && legal.has(i)
    const side: Side = owner === 'mine' ? mySide : oppSide
    const cls = 'pit ' + (owner === 'mine' ? 'you' : 'ai') +
      (playable ? ' playable' : '') +
      (s.last === i ? ' last' : '') +
      (capSet.has(i) ? ' captured' : '') +
      (s.pits[i] === 0 ? ' empty' : '')
    return (
      <button
        type="button"
        className={cls}
        onClick={() => clickPit(i)}
        disabled={!playable}
        aria-label={`${owner === 'mine' ? 'Your' : oppLabel} pit ${W.pitLabel(side, i)}, ${s.pits[i]} seeds`}
      >
        <Seeds n={s.pits[i]} />
        <span className="pit-count">{s.pits[i]}</span>
        <span className="pit-num">{W.pitLabel(side, i)}</span>
      </button>
    )
  }

  function Bowl({ owner, n }: { owner: 'mine' | 'theirs'; n: number }) {
    const side: Side = owner === 'mine' ? mySide : oppSide
    const on = s.winner == null && s.turn === side
    return (
      <div className={'bowl ' + (owner === 'mine' ? 'you' : 'ai') + (on ? ' on' : '')}>
        <span className="bowl-count">{n}</span>
        <span className="bowl-label">{owner === 'mine' ? 'You' : oppLabel}</span>
        <span className="bowl-sub">captured</span>
      </div>
    )
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Wari · Oware · abapa rules"
        title="Wari"
        subtitle="sow seeds counterclockwise and capture the rival's pits as they fall to two or three"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="6 × 4 · capture"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="wa-wrap">
          <div className="wa-board">
            <Bowl owner="theirs" n={theirs} />
            <div className="wa-pits">
              <div className="wa-row ai">{topRow.map(i => <Pit key={i} i={i} owner="theirs" />)}</div>
              <div className="wa-row you">{bottomRow.map(i => <Pit key={i} i={i} owner="mine" />)}</div>
            </div>
            <Bowl owner="mine" n={mine} />
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel scoreboard">
            <div className={'sc ai' + (s.turn === oppSide && s.winner == null ? ' on' : '')}>
              <span className="sc-dot ai" /><span className="sc-name">{oppLabel}</span><span className="sc-n">{theirs}</span>
            </div>
            <div className={'sc you' + (s.turn === mySide && s.winner == null ? ' on' : '')}>
              <span className="sc-dot you" /><span className="sc-name">You</span><span className="sc-n">{mine}</span>
            </div>
            <div className="sc-bar"><div className="sc-bar-you" style={{ width: `${(mine / Math.max(1, mine + theirs)) * 100}%` }} /></div>
            <div className="sc-goal">first to 25 of 48 wins</div>
          </div>
          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && (
        <ResultModal won={myWin} draw={s.winner === 'draw'} mine={mine} theirs={theirs} oppLabel={oppLabel} onNew={newGame} />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal(
  { won, draw, mine, theirs, oppLabel, onNew }:
  { won: boolean; draw: boolean; mine: number; theirs: number; oppLabel: string; onNew: () => void },
) {
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : won ? 'Seeds banked' : 'Out-sown'}
      title={draw ? 'A Tie' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {mine}</span><span className="foe">{oppLabel} {theirs}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Wari / Oware" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You own the <b>bottom six pits</b>. Each starts with four seeds — there are no stores; captured seeds bank into your <i>count</i>. To move, lift all the seeds from one of your pits and <b>sow</b> them one at a time counterclockwise around the board. On a full lap of twelve or more seeds the origin pit is <b>skipped</b>.</p>
        <p>If your last seed lands in a <i>rival pit</i> and leaves it holding exactly <b>two or three</b> seeds, you <b>capture</b> them. Then check the pit just before it (still the rival's row): if it is also two or three, capture it too — chaining backward until a pit isn't two or three.</p>
        <p><b>Grand slam:</b> a move that would capture <i>all</i> of the rival's seeds is sown but captures nothing. <b>Feeding:</b> if the rival has no seeds you must play a move that gives them some, when one exists.</p>
        <p>The game ends when a player can't move; the seeds left on the board go to whoever still has them. <b>Most seeds wins</b> — 25 of 48 clinches it, 24–24 is a draw.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
