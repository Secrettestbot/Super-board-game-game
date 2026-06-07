/* PERUDO / DUDO — UI (built for this codebase). A sun-baked Andean cantina: four cups of bone dice
   on a woven table. Solo: you vs three probabilistic AI players. Online: each seat is a remote
   human (empty seats fall back to AI), and everything renders relative to YOUR seat — your dice come
   from mySeat, your turn gates the bid/Dudo controls, and foes are shown anonymously. */

import { useEffect, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { perudoAdapter } from './net'
import * as P from './logic'
import type { PerudoState, Face } from './logic'

const FACES: Face[] = [1, 2, 3, 4, 5, 6]

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#3a1d14" stroke="#7a3d22" strokeWidth="1.5" />
    <rect x="9" y="13" width="17" height="17" rx="4" fill="#f1e7cf" stroke="#c0a87e" strokeWidth="1" transform="rotate(-9 17 22)" />
    <rect x="23" y="18" width="16" height="16" rx="4" fill="#e0a23a" stroke="#a8701f" strokeWidth="1" transform="rotate(11 31 26)" />
    <circle cx="17" cy="22" r="2.2" fill="#3a1d14" transform="rotate(-9 17 22)" />
    <circle cx="28" cy="22" r="1.8" fill="#3a1d05" transform="rotate(11 31 26)" />
    <circle cx="34" cy="30" r="1.8" fill="#3a1d05" transform="rotate(11 31 26)" />
  </svg>
)

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
}

function Die({ face, ace }: { face: Face; ace?: boolean }) {
  return (
    <div className={'die' + (face === 1 && ace ? ' ace' : '')}>
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

const SOLO_NAMES = ['You', 'Carmen', 'Diego', 'Rosa']

export function Perudo() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(perudoAdapter)
  const [showRules, setShowRules] = useState(false)
  const [qty, setQty] = useState(1)
  const [face, setFace] = useState<Face>(2)

  // Name a seat relative to YOU. Solo keeps the flavorful cast; online stays anonymous.
  const nameOf = (p: number): string => {
    if (p === mySeat) return 'You'
    if (net.online) return 'Player ' + (p + 1)
    return SOLO_NAMES[p] ?? 'Player ' + (p + 1)
  }

  function syncBuilder(bid: PerudoState['bid'], palifico: boolean) {
    const m = P.minRaise(bid, palifico)
    setQty(m.quantity); setFace(m.face)
  }

  function newGame() {
    netNew(); setShowRules(false)
    syncBuilder(null, false)
  }

  const yourTurn = s.phase === 'bidding' && isMyTurn
  // After every transition, keep the bid builder primed to the smallest legal raise.
  useEffect(() => {
    if (s.phase === 'bidding') syncBuilder(s.bid, s.palifico)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.actionSeq, s.phase])

  function doBid() {
    if (!yourTurn) return
    if (!P.isRaise(s.bid, { quantity: qty, face }, s.palifico)) return
    dispatch({ kind: 'bid', quantity: qty, face })
  }
  function doDudo() {
    if (!yourTurn || !s.bid) return
    dispatch({ kind: 'challenge' })
  }
  // During a reveal, only the designated mover (the die-loser) may roll on.
  const canContinue = s.phase === 'reveal' && isMyTurn
  function doContinue() {
    if (!canContinue) return
    dispatch({ kind: 'continue' })
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (canContinue && (e.key === ' ' || e.key === 'Enter')) { doContinue(); return true }
      if (yourTurn) {
        if (e.key === ' ' || e.key === 'Enter') { doBid(); return true }
        if (e.key === 'd' || e.key === 'D') { doDudo(); return true }
      }
      return false
    },
  })

  const candidate = { quantity: qty, face }
  const legal = yourTurn && P.isRaise(s.bid, candidate, s.palifico)
  const canDudo = yourTurn && !!s.bid
  const total = P.totalDice(s)
  const won = s.winner === mySeat

  // Seats other than yours, in seating order starting just after you (stable layout per viewer).
  const n = s.counts.length
  const foeSeats: number[] = []
  for (let i = 1; i < n; i++) foeSeats.push((mySeat + i) % n)

  let banner: string, bk = ''
  if (s.winner != null) {
    if (won) { bk = 'win'; banner = 'You are the last cup standing — you win!' }
    else { bk = 'lose'; banner = `${nameOf(s.winner)} wins — your cup ran dry` }
  } else if (s.phase === 'reveal' && s.reveal) {
    const r = s.reveal
    bk = r.loser === mySeat ? 'lose' : 'you'
    banner = `Reveal — ${r.count} ${P.faceLabel(r.bid.face)} found · ${nameOf(r.loser)} ${r.loser === mySeat ? 'lose' : 'loses'} a die`
  } else if (yourTurn) {
    bk = 'you'
    banner = s.bid ? `Raise above ${s.bid.quantity} × ${P.faceLabel(s.bid.face)} — or call Dudo` : 'Open the round — make a bid'
  } else {
    bk = 'foe'; banner = `${nameOf(s.turn)} is weighing the cup…`
  }

  const revealing = s.phase === 'reveal' || s.phase === 'over'

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow={'Perudo · Liar’s Dice' + (s.palifico ? ' · PALIFICO' : '')}
        title="Perudo"
        subtitle="four cups, one truth — bid the dice you cannot see, then call the bluff"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${total} dice live`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · bid/continue &nbsp; D · dudo &nbsp; N · new</>}
      >
        <div className="pd-wrap">
          {/* foes row */}
          <div className="foes">
            {foeSeats.map(p => (
              <div key={p} className={'seat foe' + (!s.alive[p] ? ' dead' : '') + (s.turn === p && s.phase === 'bidding' ? ' active' : '')}>
                <div className="seat-label">
                  <span className="seat-name">{nameOf(p)}</span>
                  <span className="seat-cups">{s.alive[p] ? `${s.counts[p]} dice` : 'out'}</span>
                </div>
                <div className="cup-row">
                  {s.alive[p] && Array.from({ length: s.counts[p] }, (_, i) =>
                    revealing
                      ? <Die key={i} face={s.dice[p][i] ?? 1} ace />
                      : <div key={i} className="cup" aria-label="hidden die"><span /></div>
                  )}
                  {!s.alive[p] && <div className="out-mark">✕</div>}
                </div>
              </div>
            ))}
          </div>

          {/* center bid / reveal plaque */}
          <div className="pd-center">
            {s.phase === 'reveal' && s.reveal ? (
              <div className="reveal-card">
                <div className="reveal-head">{s.reveal.held ? 'The bid held' : 'A bluff exposed'}</div>
                <div className="reveal-line">
                  {s.reveal.bid.quantity} × <Die face={s.reveal.bid.face} ace /> claimed — <b>{s.reveal.count}</b> on the table
                </div>
                <div className={'reveal-loser ' + (s.reveal.loser === mySeat ? 'foe' : 'you')}>
                  {nameOf(s.reveal.loser)} {s.reveal.loser === mySeat ? 'lose' : 'loses'} a die
                </div>
              </div>
            ) : s.bid ? (
              <div className="bid-card on">
                <div className="bid-eye">standing bid · {nameOf(s.bid.byPlayer)}</div>
                <div className="bid-main"><span className="bid-qty">{s.bid.quantity}</span><span className="bid-x">×</span><Die face={s.bid.face} ace /></div>
              </div>
            ) : (
              <div className="bid-card"><div className="bid-eye">open round</div><div className="bid-main muted">no bid yet</div></div>
            )}
          </div>

          {/* you */}
          <div className={'seat you' + (yourTurn ? ' active' : '') + (!s.alive[mySeat] ? ' dead' : '')}>
            <div className="seat-label">
              <span className="seat-name">You</span>
              <span className="seat-cups">{s.alive[mySeat] ? `${s.counts[mySeat]} dice` : 'out'}</span>
            </div>
            <div className="cup-row">
              {s.dice[mySeat].map((f, i) => <Die key={i} face={f} ace />)}
            </div>
          </div>

          {/* action bar */}
          <div className="action-bar">
            {revealing ? (
              <button className="btn-act primary" disabled={s.phase === 'over' || !canContinue} onClick={doContinue}>
                {s.phase === 'over' ? 'Game over' : canContinue ? 'Roll next round' : 'Waiting…'}
              </button>
            ) : (
              <>
                <div className="builder">
                  <div className="stepper">
                    <button className="step" disabled={!yourTurn || qty <= 1} onClick={() => setQty(q => Math.max(1, q - 1))}>–</button>
                    <span className="step-val">{qty}</span>
                    <button className="step" disabled={!yourTurn || qty >= total} onClick={() => setQty(q => Math.min(total, q + 1))}>+</button>
                  </div>
                  <span className="builder-x">×</span>
                  <div className="face-pick">
                    {FACES.map(f => (
                      <button key={f} className={'face-btn' + (face === f ? ' sel' : '') + (f === 1 ? ' ace' : '')} disabled={!yourTurn} onClick={() => setFace(f)}>
                        <Die face={f} ace />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="act-buttons">
                  <button className="btn-act primary" disabled={!legal} onClick={doBid}>Bid {qty} × {P.faceLabel(face)}</button>
                  <button className="btn-act warn" disabled={!canDudo} onClick={doDudo}>Dudo!</button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="side">
          <div className="panel"><OnlineBar net={net} /></div>
          <div className="panel tally-box">
            {[mySeat, ...foeSeats].map(p => (
              <div key={p} className={'tl ' + (p === mySeat ? 'you' : 'foe') + (s.turn === p && s.phase === 'bidding' ? ' on' : '') + (!s.alive[p] ? ' dead' : '')}>
                <span className="tl-name">{nameOf(p)}</span>
                <span className="tl-dots">{s.alive[p] ? ('●'.repeat(s.counts[p]) || '—') : '—'}</span>
                <span className="tl-n">{s.alive[p] ? s.counts[p] : '✕'}</span>
              </div>
            ))}
          </div>
          <div className="panel hist-box">
            <div className="panel-h">This round</div>
            {s.history.length === 0 && <div className="hist-empty">No bids yet.</div>}
            {s.history.slice().reverse().map((b, i) => (
              <div key={i} className={'hist-line' + (i === 0 ? ' top' : '')}>{nameOf(b.byPlayer)}: {b.quantity} × {P.faceLabel(b.face)}</div>
            ))}
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} mySeat={mySeat} nameOf={nameOf} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, mySeat, nameOf, onNew }: { s: PerudoState; mySeat: number; nameOf: (p: number) => string; onNew: () => void }) {
  const won = s.winner === mySeat
  const n = s.counts.length
  return (
    <Modal
      eyebrow={won ? 'Last cup standing' : 'Out of dice'}
      title={won ? 'You Win' : `${nameOf(s.winner!)} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        {Array.from({ length: n }, (_, p) => (
          <span key={p} className={p === mySeat ? 'you' : 'foe'}>{nameOf(p)} {s.alive[p] ? s.counts[p] : '✕'}</span>
        ))}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Perudo" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Four players each hold <b>five dice</b> under a cup and roll in secret — you see <i>your</i> dice, never the others'. Take turns <b>bidding</b> a quantity and a face, e.g. "three 4's", claiming there are <b>at least</b> that many of that face among <b>all</b> dice on the table.</p>
        <p><b>Aces (1's) are wild</b> — every ace counts as any face, so "three 4's" is met by 4's <i>plus</i> aces.</p>
        <p>A new bid must <b>raise</b>: a bigger quantity (any face), or the same quantity with a higher face. Switching <i>to</i> aces halves the quantity (rounded up); coming back <i>off</i> aces, the quantity must be at least <b>2×aces + 1</b>.</p>
        <p>Instead of bidding you may call <b>Dudo!</b> — all dice reveal and the true count is tallied. If it is <i>less</i> than the bid the bidder loses a die; otherwise the caller does. Lose your last die and you're out; the <b>last player with dice wins</b>. A player down to one die triggers a <b>palifico</b> round where aces are <i>not</i> wild.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> bid / continue · <kbd>D</kbd> dudo · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
