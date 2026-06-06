/* LIAR'S DICE / PERUDO — UI (built for this codebase). A smoky tavern felt with carved dice
   cups on the framework shell, vs a probability-based AI that bids/challenges on a timer. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as LD from './logic'
import type { LiarsState, Face, Bid } from './logic'

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
  const [s, setS] = useState<LiarsState>(() => LD.makeGame())
  const [showRules, setShowRules] = useState(false)
  // bid builder state
  const [qty, setQty] = useState(1)
  const [face, setFace] = useState<Face>(2)

  function newGame() {
    const g = LD.makeGame()
    setS(g); setShowRules(false)
    const m = LD.minRaise(g.bid); setQty(m.qty); setFace(m.face)
  }

  // The AI takes its bid/challenge on a timer.
  useAITurn(s.phase === 'bidding' && s.turn === 'foe', () => setS(p => LD.aiStep(p)), { delayMs: 720, tick: s.history.length })

  function syncBuilder(next: LiarsState) {
    const m = LD.minRaise(next.bid); setQty(m.qty); setFace(m.face)
  }

  function doBid() {
    if (!yourBid) return
    const bid: Bid = { qty, face }
    if (!LD.isRaise(s.bid, bid)) return
    const next = LD.makeBid(s, 'you', bid)
    setS(next); syncBuilder(next)
  }
  function doChallenge() {
    if (s.phase !== 'bidding' || s.turn !== 'you' || !s.bid) return
    setS(LD.challenge(s, 'you'))
  }
  function doContinue() {
    const next = LD.nextRound(s)
    setS(next)
    if (next.phase === 'bidding') syncBuilder(next)
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (s.phase === 'reveal' && (e.key === ' ' || e.key === 'Enter')) { doContinue(); return true }
      if (s.phase === 'bidding' && s.turn === 'you') {
        if (e.key === ' ' || e.key === 'Enter') { doBid(); return true }
        if (e.key === 'c' || e.key === 'C') { doChallenge(); return true }
      }
      return false
    },
  })

  const yourBid = s.phase === 'bidding' && s.turn === 'you'
  const candidate: Bid = { qty, face }
  const legal = yourBid && LD.isRaise(s.bid, candidate)
  const canChallenge = yourBid && !!s.bid

  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = 'You win — the rival is out of dice' }
  else if (s.winner === 'foe') { bk = 'lose'; banner = 'The rival wins — you are out of dice' }
  else if (s.phase === 'reveal') { bk = s.reveal!.loser === 'foe' ? 'you' : 'foe'; banner = `Reveal — ${s.reveal!.count} ${s.reveal!.bid.face}'s found · ${s.reveal!.loser === 'you' ? 'you lose a die' : 'rival loses a die'}` }
  else if (yourBid) { bk = 'you'; banner = s.bid ? `Raise above ${s.bid.qty} × ${s.bid.face}'s — or call "Liar!"` : 'Open the round — make a bid' }
  else { bk = 'foe'; banner = 'The rival is weighing the cup…' }

  const revealing = s.phase === 'reveal' || s.phase === 'over'

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
          {/* rival */}
          <div className="seat foe">
            <div className="seat-label"><span className="seat-name">Rival</span><span className="seat-cups">{s.foeCount} dice</span></div>
            <div className="cup-row">
              {Array.from({ length: s.foeCount }, (_, i) =>
                revealing
                  ? <Die key={i} face={s.foeDice[i] ?? 1} wild />
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
                <div className={'reveal-loser ' + (s.reveal.loser === 'you' ? 'foe' : 'you')}>{s.reveal.loser === 'you' ? 'You lose a die' : 'The rival loses a die'}</div>
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
            <div className="seat-label"><span className="seat-name">You</span><span className="seat-cups">{s.youCount} dice</span></div>
            <div className="cup-row">
              {s.youDice.map((f, i) => <Die key={i} face={f} wild ghost={f === 1} />)}
            </div>
          </div>

          {/* action bar */}
          <div className="action-bar">
            {revealing ? (
              <button className="btn-act primary" disabled={s.phase === 'over'} onClick={doContinue}>
                {s.phase === 'over' ? 'Game over' : 'Roll next round'}
              </button>
            ) : (
              <>
                <div className="builder">
                  <div className="stepper">
                    <button className="step" disabled={!yourBid || qty <= 1} onClick={() => setQty(q => Math.max(1, q - 1))}>–</button>
                    <span className="step-val">{qty}</span>
                    <button className="step" disabled={!yourBid || qty >= s.youCount + s.foeCount} onClick={() => setQty(q => Math.min(s.youCount + s.foeCount, q + 1))}>+</button>
                  </div>
                  <span className="builder-x">×</span>
                  <div className="face-pick">
                    {FACES.map(f => (
                      <button key={f} className={'face-btn' + (face === f ? ' sel' : '')} disabled={!yourBid} onClick={() => setFace(f)}>
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
          <div className="panel tally-box">
            <div className={'tl you' + (s.turn === 'you' && s.phase === 'bidding' ? ' on' : '')}><span className="tl-name">You</span><span className="tl-dots">{'●'.repeat(s.youCount) || '—'}</span><span className="tl-n">{s.youCount}</span></div>
            <div className={'tl foe' + (s.turn === 'foe' && s.phase === 'bidding' ? ' on' : '')}><span className="tl-name">Rival</span><span className="tl-dots">{'●'.repeat(s.foeCount) || '—'}</span><span className="tl-n">{s.foeCount}</span></div>
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

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: LiarsState; onNew: () => void }) {
  const won = s.winner === 'you'
  return (
    <Modal
      eyebrow={won ? 'Last cup standing' : 'Out of dice'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {s.youCount}</span><span className="foe">Rival {s.foeCount}</span></div>
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
