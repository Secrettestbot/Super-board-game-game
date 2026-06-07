/* CAN'T STOP — UI (built for this codebase). Eleven numbered tracks on the framework shell.
   Roll four dice, pick a pairing to climb up to three columns, then press on or stop. Bust
   on a dead roll. Claim three columns to win. Online-capable via useGameSession: the host
   runs the real logic and AI fills any empty seat; the view is seat-relative so a guest can
   play seat 1. Seats: 0 = 'you', 1 = 'ai'/opponent. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { cantStopAdapter } from './net'
import * as CS from './logic'
import type { Player } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#241c44" stroke="#463a78" strokeWidth="1.5" />
    <rect x="11" y="26" width="7" height="13" rx="2" fill="#ff7aa8" />
    <rect x="20.5" y="14" width="7" height="25" rx="2" fill="#ffc24b" />
    <rect x="30" y="22" width="7" height="17" rx="2" fill="#6fe0c0" />
    <circle cx="24" cy="10" r="3.4" fill="#ffd97a" stroke="#d8920f" strokeWidth="1" />
  </svg>
)

// Standard die-face pip layout per value (3x3 grid, true = filled).
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}
function Die({ v }: { v: number }) {
  const on = new Set(PIPS[v] || [])
  return (
    <div className="cs-die">
      {Array.from({ length: 9 }, (_, i) => <span key={i} className={'cs-pip' + (on.has(i) ? '' : ' off')} />)}
    </div>
  )
}

export function CantStop() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(cantStopAdapter)
  // Seat 0 = 'you', seat 1 = 'ai'/opponent. Everything below is relative to mySeat.
  const me: Player = mySeat === 0 ? 'you' : 'ai'
  const foe: Player = me === 'you' ? 'ai' : 'you'

  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setShowRules(false) }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  const yourTurn = !s.winner && isMyTurn
  const haveRunners = Object.keys(s.runners).length > 0

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === ' ' && s.phase === 'preroll') { dispatch({ kind: 'roll' }); return true }
      if ((e.key === 's' || e.key === 'S') && s.phase === 'preroll' && haveRunners) { dispatch({ kind: 'stop' }); return true }
      return false
    },
  })

  const meLabel = 'You'
  const foeLabel = net.online ? 'Opponent' : 'Rival'

  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = 'You win — three columns claimed!' }
  else if (s.winner === foe) { bk = 'lose'; banner = `${foeLabel} claimed three columns` }
  else if (yourTurn) {
    bk = 'you'
    banner = s.phase === 'choose' ? 'Pick a pairing to climb' : haveRunners ? 'Press on, or stop to bank' : 'Your turn — roll the dice'
  } else { bk = 'foe'; banner = `${foeLabel} is pressing their luck…` }

  function StepCell({ c, lvl }: { c: number; lvl: number }) {
    // A runner belongs to whoever's turn it is right now.
    const runnerHere = s.runners[c] === lvl && !s.winner
    const myRunner = runnerHere && s.turn === me
    const foeRunner = runnerHere && s.turn === foe
    const youPerm = s.perm[me][c] === lvl && lvl > 0
    const aiPerm = s.perm[foe][c] === lvl && lvl > 0
    return (
      <div className={'cs-step' + (lvl === CS.HEIGHTS[c] ? ' top' : '')}>
        {(myRunner || foeRunner) && <div className="cs-runner" />}
        {youPerm && <div className="cs-mark you" />}
        {aiPerm && <div className="cs-mark ai" />}
      </div>
    )
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Can't Stop · press your luck"
        title="Can't Stop"
        subtitle="climb the pyramid of odds — pair the dice, push your luck, and claim three columns before the rival"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`You ${CS.claimedCount(s, me)}/3 · ${foeLabel} ${CS.claimedCount(s, foe)}/3`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · roll &nbsp; s · stop &nbsp; N · new</>}
      >
        <div className="cs-wrap">
          <div className="cs-board">
            {CS.COLS.map(c => {
              const owner = s.claimed[c]
              const claimCls = owner === me ? ' claimed-you' : owner === foe ? ' claimed-ai' : ''
              return (
                <div key={c} className={'cs-col' + claimCls}>
                  <div className="cs-track">
                    {Array.from({ length: CS.HEIGHTS[c] }, (_, k) => <StepCell key={k} c={c} lvl={k + 1} />)}
                  </div>
                  <div className="cs-head">{c}{owner && <span className="cs-flag">{owner === me ? '★' : '✦'}</span>}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <OnlineBar net={net} />

          <div className="panel cs-score">
            <div className={'cs-row' + (s.turn === me && !s.winner ? ' on' : '')}>
              <span className="cs-pawn you" />
              <span className="cs-who">{meLabel}</span>
              <span className="cs-claims">{CS.claimedCount(s, me)}/3</span>
            </div>
            <div className="cs-owned">{CS.claimedCols(s, me).join(' · ') || '—'}</div>
            <div className={'cs-row' + (s.turn === foe && !s.winner ? ' on' : '')}>
              <span className="cs-pawn ai" />
              <span className="cs-who">{foeLabel}</span>
              <span className="cs-claims">{CS.claimedCount(s, foe)}/3</span>
            </div>
            <div className="cs-owned">{CS.claimedCols(s, foe).join(' · ') || '—'}</div>
          </div>

          <div className="panel cs-control">
            <div className="cs-dice">
              {s.dice.length ? s.dice.map((d, i) => <Die key={i} v={d} />) : <div className="cs-hint">no dice yet</div>}
            </div>

            {yourTurn && s.phase === 'choose' && (
              <div className="cs-pairs">
                <div className="cs-pl">choose a pairing</div>
                {s.pairings.map((p, i) => (
                  <div key={i} className={'cs-pair' + (p.usable ? ' usable' : ' dead')}
                    onClick={p.usable ? () => dispatch({ kind: 'pick', pairing: i }) : undefined}>
                    {p.sums[0]}<span className="amp">+</span>{p.sums[1]}
                  </div>
                ))}
              </div>
            )}

            {yourTurn && s.phase === 'preroll' && (
              <div className="cs-btns">
                <button className="cs-btn" onClick={() => dispatch({ kind: 'roll' })}>Roll</button>
                <button className="cs-btn stop" disabled={!haveRunners} onClick={() => dispatch({ kind: 'stop' })}>Stop</button>
              </div>
            )}

            {yourTurn && (
              <div className="cs-hint">
                {s.phase === 'choose' ? 'a struck-through pair has no legal advance'
                  : haveRunners ? 'roll again to climb higher — or stop to make it permanent'
                  : 'roll four dice to begin your climb'}
              </div>
            )}
            {!yourTurn && !s.winner && <div className="cs-hint">watching {foeLabel.toLowerCase()} climb…</div>}
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={s.winner === me} foeLabel={foeLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, foeLabel, onNew }: { won: boolean; foeLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Nerve held' : 'Pushed too far'}
      title={won ? 'You Win' : `${foeLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">{won ? <span className="you">Three columns claimed</span> : <span className="foe">{foeLabel} reached three first</span>}</div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Can't Stop" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Roll out</button>}>
      <div className="modal-body">
        <p>Race up the eleven columns numbered <b>2 to 12</b>. Each column is as tall as the number of ways its sum can be rolled — <b>7</b> is the longest at 13 steps, <b>2</b> and <b>12</b> the shortest at 3.</p>
        <p>On your turn, <b>roll four dice</b> and split them into two pairs. Each pair's sum is a column you may advance. You can have <b>runners in only three columns</b> per turn; a pairing is usable only if it climbs a column you already hold or you have a free runner to start one.</p>
        <p>If <i>neither</i> pairing offers a legal advance, you <b>bust</b> — this turn's runner progress is lost and your turn ends. After any good roll, choose to <b>press on</b> or <b>stop</b>. Stopping banks your runners as permanent markers.</p>
        <p>Reach the <b>top</b> of a column to <b>claim</b> it. The first to claim <b>three columns wins</b>.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> roll · <kbd>S</kbd> stop · <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
