/* LIAR'S DICE / PERUDO — UI (built for this codebase). A smoky tavern felt with carved dice
   cups on the framework shell, vs a probability-based AI — or, online, another human — that
   bids/challenges on a timer. Seat-relative: your dice come from mySeat, the standing bid and
   challenge are gated on isMyTurn, and the rival is "Opponent" when playing online. */

import { useEffect, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { liarsDiceAdapter } from './net'
import * as LD from './logic'
import type { LiarsState, Face, Bid, Player } from './logic'

const FACES: Face[] = [2, 3, 4, 5, 6]

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#2a1d12" stroke="#5a3d22" strokeWidth="1.5" />
    <rect x="9" y="14" width="18" height="18" rx="4" fill="#ece5d2" stroke="#b8a984" strokeWidth="1" transform="rotate(-8 18 23)" />
    <rect x="22" y="18" width="16" height="16" rx="4" fill="#d9b15a" stroke="#a8801f" strokeWidth="1" transform="rotate(10 30 26)" />
    <circle cx="18" cy="23" r="2.1" fill="#2a1d12" transform="rotate(-8 18 23)" />
    <circle cx="27" cy="22" r="1.8" fill="#2a1d05" transform="rotate(10 30 26)" />
    <circle cx="33" cy="30" r="1.8" fill="#2a1d05" transform="rotate(10 30 26)" />
  </svg>
)

// pip layouts for faces 1..6
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
}

function Die({ face, wild, ghost }: { face: Face; wild?: boolean; ghost?: boolean }) {
  return (
    <div className={'die' + (face === 1 && wild ? ' wild' : '') + (ghost ? ' ghost' : '')}>
      <div className="die-grid">
        {Array.from({ length: 9 }, (_, k) => {
          const r = (k / 3) | 0, c = k % 3
          const on = PIPS[face].some(([pr, pc]) => pr === r && pc === c)
          return <span key={k} className={'pip' + (on ? ' on' : '')} />
        })}
      </div>
    </div>
  )
}

export function LiarsDice() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(liarsDiceAdapter)
  // Seat 0 = 'you', seat 1 = 'foe'. Map your seat to the logic's player encoding so a
  // guest sitting in seat 1 sees its own cup at the bottom.
  const me: Player = mySeat === 0 ? 'you' : 'foe'
  const opp: Player = me === 'you' ? 'foe' : 'you'
  const myDice = me === 'you' ? s.youDice : s.foeDice
  const oppDice = me === 'you' ? s.foeDice : s.youDice
  const myCount = me === 'you' ? s.youCount : s.foeCount
  const oppCount = me === 'you' ? s.foeCount : s.youCount

  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const oppPanelName = net.online ? (mySeat === 0 ? 'Player 2' : 'Player 1') : 'Rival'

  const [showRules, setShowRules] = useState(false)
  // bid builder state
  const [qty, setQty] = useState(1)
  const [face, setFace] = useState<Face>(2)

  // Keep the bid builder primed to the smallest legal raise as the standing bid changes.
  useEffect(() => {
    if (s.phase !== 'bidding') return
    const m = LD.minRaise(s.bid)
    setQty(m.qty); setFace(m.face)
  }, [s.bid, s.phase])

  function newGame() {
    netNew(); setShowRules(false)
    setQty(1); setFace(2)
  }

  const myTurn = s.phase === 'bidding' && isMyTurn
  const candidate: Bid = { qty, face }
  const legal = myTurn && LD.isRaise(s.bid, candidate)
  const canChallenge = myTurn && !!s.bid

  function doBid() {
    if (!legal) return
    dispatch({ kind: 'bid', quantity: qty, face })
  }
  function doChallenge() {
    if (!canChallenge) return
    dispatch({ kind: 'challenge' })
  }
  function doContinue() {
    // Only the host (seat 0) rolls the next round; a guest simply waits for the new view.
    if (s.phase !== 'reveal' || mySeat !== 0) return
    dispatch({ kind: 'continue' })
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (s.phase === 'reveal' && (e.key === ' ' || e.key === 'Enter')) { doContinue(); return true }
      if (myTurn) {
        if (e.key === ' ' || e.key === 'Enter') { doBid(); return true }
        if (e.key === 'c' || e.key === 'C') { doChallenge(); return true }
      }
      return false
    },
  })

  // Result / banner relative to ME (you win iff your side is the last with dice).
  const iWon = s.winner === me
  const iLost = s.winner === opp

  let banner: string, bk = ''
  if (iWon) { bk = 'win'; banner = `You win — ${oppLabel.toLowerCase()} is out of dice` }
  else if (iLost) { bk = 'lose'; banner = `${oppLabel} wins — you are out of dice` }
  else if (s.phase === 'reveal' && s.reveal) {
    const iLostDie = s.reveal.loser === me
    bk = iLostDie ? 'foe' : 'you'
    banner = `Reveal — ${s.reveal.count} ${s.reveal.bid.face}'s found · ${iLostDie ? 'you lose a die' : `${oppLabel.toLowerCase()} loses a die`}`
  } else if (myTurn) {
    bk = 'you'; banner = s.bid ? `Raise above ${s.bid.qty} × ${s.bid.face}'s — or call "Liar!"` : 'Open the round — make a bid'
  } else {
    bk = 'foe'; banner = net.online ? `${oppLabel} is weighing the cup…` : 'The rival is weighing the cup…'
  }

  const revealing = s.phase === 'reveal' || s.phase === 'over'
  const oppTurnActive = s.phase === 'bidding' && !isMyTurn && s.winner == null
  const continueDisabled = s.phase === 'over' || (s.phase === 'reveal' && mySeat !== 0)

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Liar's Dice · ones wild"
        title="Liar's Dice"
        subtitle="bid the dice you cannot see — bluff, raise, or cry liar at the right moment"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${s.youCount + s.foeCount} dice live`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · bid/continue &nbsp; C · challenge &nbsp; N · new</>}
      >
        <div className="ld-wrap">
          {/* opponent */}
          <div className="seat foe">
            <div className="seat-label"><span className="seat-name">{oppPanelName}</span><span className="seat-cups">{oppCount} dice</span></div>
            <div className="cup-row">
              {Array.from({ length: oppCount }, (_, i) =>
                revealing
                  ? <Die key={i} face={oppDice[i] ?? 1} wild />
                  : <div key={i} className="cup" aria-label="hidden die"><span /></div>
              )}
            </div>
          </div>

          {/* current bid / reveal banner */}
          <div className="ld-center">
            {s.phase === 'reveal' && s.reveal ? (
              <div className="reveal-card">
                <div className="reveal-head">{s.reveal.held ? 'The bid held' : 'A bluff exposed'}</div>
                <div className="reveal-line">{s.reveal.bid.qty} × <Die face={s.reveal.bid.face} /> claimed — <b>{s.reveal.count}</b> on the felt</div>
                <div className={'reveal-loser ' + (s.reveal.loser === me ? 'foe' : 'you')}>{s.reveal.loser === me ? 'You lose a die' : `${oppLabel} loses a die`}</div>
              </div>
            ) : s.bid ? (
              <div className="bid-card on">
                <div className="bid-eye">standing bid</div>
                <div className="bid-main"><span className="bid-qty">{s.bid.qty}</span><span className="bid-x">×</span><Die face={s.bid.face} /></div>
              </div>
            ) : (
              <div className="bid-card"><div className="bid-eye">open round</div><div className="bid-main muted">no bid yet</div></div>
            )}
          </div>

          {/* you */}
          <div className="seat you">
            <div className="seat-label"><span className="seat-name">You</span><span className="seat-cups">{myCount} dice</span></div>
            <div className="cup-row">
              {myDice.map((f, i) => <Die key={i} face={f} wild ghost={f === 1} />)}
            </div>
          </div>

          {/* action bar */}
          <div className="action-bar">
            {revealing ? (
              <button className="btn-act primary" disabled={continueDisabled} onClick={doContinue}>
                {s.phase === 'over' ? 'Game over' : mySeat !== 0 ? 'Waiting for host…' : 'Roll next round'}
              </button>
            ) : (
              <>
                <div className="builder">
                  <div className="stepper">
                    <button className="step" disabled={!myTurn || qty <= 1} onClick={() => setQty(q => Math.max(1, q - 1))}>–</button>
                    <span className="step-val">{qty}</span>
                    <button className="step" disabled={!myTurn || qty >= s.youCount + s.foeCount} onClick={() => setQty(q => Math.min(s.youCount + s.foeCount, q + 1))}>+</button>
                  </div>
                  <span className="builder-x">×</span>
                  <div className="face-pick">
                    {FACES.map(f => (
                      <button key={f} className={'face-btn' + (face === f ? ' sel' : '')} disabled={!myTurn} onClick={() => setFace(f)}>
                        <Die face={f} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="act-buttons">
                  <button className="btn-act primary" disabled={!legal} onClick={doBid}>Bid {qty} × {face}'s</button>
                  <button className="btn-act warn" disabled={!canChallenge} onClick={doChallenge}>Liar!</button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel tally-box">
            <div className={'tl you' + (myTurn ? ' on' : '')}><span className="tl-name">You</span><span className="tl-dots">{'●'.repeat(myCount) || '—'}</span><span className="tl-n">{myCount}</span></div>
            <div className={'tl foe' + (oppTurnActive ? ' on' : '')}><span className="tl-name">{oppPanelName}</span><span className="tl-dots">{'●'.repeat(oppCount) || '—'}</span><span className="tl-n">{oppCount}</span></div>
          </div>
          <div className="panel hist-box">
            <div className="panel-h">This round</div>
            {s.history.length === 0 && <div className="hist-empty">No bids yet.</div>}
            {s.history.slice().reverse().map((b, i) => (
              <div key={i} className={'hist-line' + (i === 0 ? ' top' : '')}>{b.qty} × {b.face}'s</div>
            ))}
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={iWon} myCount={myCount} oppCount={oppCount} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, myCount, oppCount, oppLabel, onNew }: { won: boolean; myCount: number; oppCount: number; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Last cup standing' : 'Out of dice'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {myCount}</span><span className="foe">{oppLabel} {oppCount}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Liar's Dice" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Both of you hold <b>five dice</b> under a cup and roll in secret — you see <i>yours</i>, never the rival's. Take turns <b>bidding</b> a quantity and a face, e.g. "three 4's", claiming there are <b>at least</b> that many of that face among <b>all</b> dice on the table.</p>
        <p><b>Ones are wild</b> — every die showing a 1 counts as any face, so "three 4's" is met by 4's <i>plus</i> 1's.</p>
        <p>A new bid must be <b>strictly higher</b>: a bigger quantity (any face), or the same quantity with a higher face. Instead of bidding you may cry <b>"Liar!"</b> — all dice reveal and the true count is tallied. If it is <i>less</i> than the bid the bidder loses a die; otherwise the challenger does.</p>
        <p>The die-loser opens the next round. Run a player out of dice and the <b>last with dice wins</b>.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> bid / continue · <kbd>C</kbd> challenge · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
