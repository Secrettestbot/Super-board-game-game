/* PERUDO / DUDO — UI (built for this codebase). A sun-baked Andean cantina: four cups of bone dice
   on a woven table, you vs three probabilistic AI players who bid and call Dudo on a timer. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
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

const NAMES = ['You', 'Carmen', 'Diego', 'Rosa']

export function Perudo() {
  const [s, setS] = useState<PerudoState>(() => P.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [qty, setQty] = useState(1)
  const [face, setFace] = useState<Face>(2)

  function syncBuilder(next: PerudoState) {
    const m = P.minRaise(next.bid, next.palifico)
    setQty(m.quantity); setFace(m.face)
  }

  function newGame() {
    const g = P.makeGame()
    setS(g); setShowRules(false)
    syncBuilder(g)
  }

  // Three AI players bid/call in sequence — re-arm the timer on EVERY action via actionSeq.
  const aiActive = s.phase === 'bidding' && s.turn !== 0 && s.winner == null && s.alive[s.turn]
  useAITurn(aiActive, () => setS(p => P.aiTurn(p)), { delayMs: 760, tick: s.actionSeq })

  const yourTurn = s.phase === 'bidding' && s.turn === 0

  function doBid() {
    if (!yourTurn) return
    if (!P.isRaise(s.bid, { quantity: qty, face }, s.palifico)) return
    const next = P.bid(s, 0, qty, face)
    setS(next); syncBuilder(next)
  }
  function doDudo() {
    if (!yourTurn || !s.bid) return
    setS(P.callDudo(s, 0))
  }
  function doContinue() {
    const next = P.nextRound(s)
    setS(next)
    if (next.phase === 'bidding') syncBuilder(next)
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (s.phase === 'reveal' && (e.key === ' ' || e.key === 'Enter')) { doContinue(); return true }
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

  let banner: string, bk = ''
  if (s.winner != null) {
    if (s.winner === 0) { bk = 'win'; banner = 'You are the last cup standing — you win!' }
    else { bk = 'lose'; banner = `${NAMES[s.winner]} wins — your cup ran dry` }
  } else if (s.phase === 'reveal' && s.reveal) {
    const r = s.reveal
    bk = r.loser === 0 ? 'lose' : 'you'
    banner = `Reveal — ${r.count} ${P.faceLabel(r.bid.face)} found · ${NAMES[r.loser]} ${r.loser === 0 ? 'lose' : 'loses'} a die`
  } else if (yourTurn) {
    bk = 'you'
    banner = s.bid ? `Raise above ${s.bid.quantity} × ${P.faceLabel(s.bid.face)} — or call Dudo` : 'Open the round — make a bid'
  } else {
    bk = 'foe'; banner = `${NAMES[s.turn]} is weighing the cup…`
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
            {[1, 2, 3].map(p => (
              <div key={p} className={'seat foe' + (!s.alive[p] ? ' dead' : '') + (s.turn === p && s.phase === 'bidding' ? ' active' : '')}>
                <div className="seat-label">
                  <span className="seat-name">{NAMES[p]}</span>
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
                <div className={'reveal-loser ' + (s.reveal.loser === 0 ? 'foe' : 'you')}>
                  {NAMES[s.reveal.loser]} {s.reveal.loser === 0 ? 'lose' : 'loses'} a die
                </div>
              </div>
            ) : s.bid ? (
              <div className="bid-card on">
                <div className="bid-eye">standing bid · {NAMES[s.bid.byPlayer]}</div>
                <div className="bid-main"><span className="bid-qty">{s.bid.quantity}</span><span className="bid-x">×</span><Die face={s.bid.face} ace /></div>
              </div>
            ) : (
              <div className="bid-card"><div className="bid-eye">open round</div><div className="bid-main muted">no bid yet</div></div>
            )}
          </div>

          {/* you */}
          <div className={'seat you' + (yourTurn ? ' active' : '') + (!s.alive[0] ? ' dead' : '')}>
            <div className="seat-label">
              <span className="seat-name">You</span>
              <span className="seat-cups">{s.alive[0] ? `${s.counts[0]} dice` : 'out'}</span>
            </div>
            <div className="cup-row">
              {s.dice[0].map((f, i) => <Die key={i} face={f} ace />)}
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
          <div className="panel tally-box">
            {[0, 1, 2, 3].map(p => (
              <div key={p} className={'tl ' + (p === 0 ? 'you' : 'foe') + (s.turn === p && s.phase === 'bidding' ? ' on' : '') + (!s.alive[p] ? ' dead' : '')}>
                <span className="tl-name">{NAMES[p]}</span>
                <span className="tl-dots">{s.alive[p] ? ('●'.repeat(s.counts[p]) || '—') : '—'}</span>
                <span className="tl-n">{s.alive[p] ? s.counts[p] : '✕'}</span>
              </div>
            ))}
          </div>
          <div className="panel hist-box">
            <div className="panel-h">This round</div>
            {s.history.length === 0 && <div className="hist-empty">No bids yet.</div>}
            {s.history.slice().reverse().map((b, i) => (
              <div key={i} className={'hist-line' + (i === 0 ? ' top' : '')}>{NAMES[b.byPlayer]}: {b.quantity} × {P.faceLabel(b.face)}</div>
            ))}
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: PerudoState; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? 'Last cup standing' : 'Out of dice'}
      title={won ? 'You Win' : `${NAMES[s.winner!]} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        {[0, 1, 2, 3].map(p => (
          <span key={p} className={p === 0 ? 'you' : 'foe'}>{NAMES[p]} {s.alive[p] ? s.counts[p] : '✕'}</span>
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
