/* COCKROACH POKER — UI (built for this codebase). A 3-player bluffing game on the framework shell:
   you vs two rivals (AI solo, remote humans online). Pass a card face-down with a vermin claim —
   bluff or truth. The receiver calls TRUE/FALSE or peeks and passes it on. Whoever gains the
   revealed card keeps it face-up; four of one kind (or an empty hand on your turn) loses.

   Online play goes through useGameSession(cockroachPokerAdapter): the host authority runs the real
   logic, unfilled seats are driven by the existing AI, and each seat sees only a redacted view
   (rivals' hands + the face-down card are hidden unless that seat legitimately saw them). The UI is
   seat-relative: "your" hand/pile come from mySeat, and gating uses isMyTurn. Solo play is the same
   path with one local seat and AI rivals — unchanged from before. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { cockroachPokerAdapter } from './net'
import * as CP from './logic'
import type { CockroachState, Vermin } from './logic'

const GLYPH: Record<Vermin, string> = {
  cockroach: '🪳', rat: '🐀', bat: '🦇', frog: '🐸',
  fly: '🪰', spider: '🕷️', scorpion: '🦂', stinkbug: '🐞',
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="11" fill="#1b2417" stroke="#43562f" strokeWidth="1.5" />
    <ellipse cx="24" cy="25" rx="9" ry="12" fill="#243a2a" stroke="#b9e34b" strokeWidth="1.6" />
    <line x1="24" y1="13" x2="24" y2="37" stroke="#b9e34b" strokeWidth="1.2" />
    <path d="M16 17 L9 11 M32 17 L39 11" stroke="#ff7ac0" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M15 24 L7 24 M33 24 L41 24" stroke="#b9e34b" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M16 31 L9 37 M32 31 L39 37" stroke="#b9e34b" strokeWidth="1.3" strokeLinecap="round" />
    <circle cx="20.5" cy="20" r="1.6" fill="#d6f57e" />
    <circle cx="27.5" cy="20" r="1.6" fill="#d6f57e" />
  </svg>
)

type Phase =
  | { k: 'idle' }                                   // not our move / game over
  | { k: 'pass-card' }                              // choosing which card to pass
  | { k: 'pass-claim'; card: Vermin }               // chose a card, now the claim
  | { k: 'pass-target'; card: Vermin; claim: Vermin } // chose card+claim, now the target
  | { k: 'respond' }                                // a pass is pending on us — call or pass-on
  | { k: 'relay-claim'; target: number }            // passing on: chose target, now the new claim

export function CockroachPoker() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(cockroachPokerAdapter)
  const [phase, setPhase] = useState<Phase>({ k: 'idle' })
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  // Seat-relative naming: your seat is "You"; rivals are "Opponent" online, "AI N" solo.
  function name(p: number): string {
    if (p === mySeat) return 'You'
    return net.online ? `Player ${p + 1}` : CP.playerName(p)
  }
  // Hand size for a seat: redacted rival hands are zeroed, so fall back to the private totals.
  function seatHandSize(p: number): number {
    const sizes = (s as { _handSizes?: number[] })._handSizes
    if (sizes && p !== mySeat) return sizes[p]
    return CP.handSize(s.hands[p])
  }

  function newGame() {
    netNew()
    setPhase({ k: 'idle' })
    setShowRules(false)
  }

  const who = CP.decider(s)
  const yourMove = s.loser == null && isMyTurn
  const opponents = s.hands.map((_, p) => p).filter(p => p !== mySeat)

  // The AI is driven by the session for unfilled seats; nothing to do here.

  // Set the human's interactive phase when it's our move.
  useEffect(() => {
    if (!yourMove) { setPhase({ k: 'idle' }); return }
    setPhase(prev => {
      if (s.pending != null) {
        // We must respond; keep relay sub-phase if mid-flow, else 'respond'.
        if (prev.k === 'relay-claim') return prev
        return { k: 'respond' }
      }
      // We start a pass; keep our pass sub-phase if mid-flow.
      if (prev.k === 'pass-card' || prev.k === 'pass-claim' || prev.k === 'pass-target') return prev
      return { k: 'pass-card' }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yourMove, s.step])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => {
      if (showRules) { setShowRules(false); return }
      // Step back through the pass flow.
      setPhase(p => {
        if (p.k === 'pass-claim') return { k: 'pass-card' }
        if (p.k === 'pass-target') return { k: 'pass-claim', card: p.card }
        if (p.k === 'relay-claim') return { k: 'respond' }
        return p
      })
    },
  })

  // ---- banner ----
  let banner: string, bk = ''
  if (s.loser != null) {
    if (s.winner === mySeat) { bk = 'win'; banner = 'You win — the cleanest board at the table!' }
    else if (s.loser === mySeat) { bk = 'lose'; banner = 'You lost — caught with four of a kind' }
    else { bk = 'win'; banner = `${name(s.loser)} loses — you survive` }
  } else if (yourMove) {
    bk = 'you'
    if (s.pending != null) banner = `${name(s.pending.from)} claims it's a ${s.pending.claim} — call it or pass it on`
    else banner = 'Your turn — pass a card and make a claim'
  } else {
    bk = 'foe'
    banner = s.pending != null
      ? `${name(who!)} is deciding…`
      : `${name(who!)} is choosing a card…`
  }

  const pend = s.pending
  // Online guests get a redacted state where a card they may not see is masked. Detect a real,
  // known identity so we never render the placeholder as if it were a vermin.
  const cardKnown = pend != null && (CP.VERMIN as readonly string[]).includes(pend.card)
  // You can see the true card only at game end or if you're a seer in the chain
  // (you relayed it earlier and are now watching, OR you're mid-relay having just peeked).
  const humanSeer = pend != null && pend.seenBy.includes(mySeat)
  const revealCard = cardKnown && (s.loser != null || humanSeer || phase.k === 'relay-claim')

  const relayTargets = pend != null
    ? CP.eligibleTargets(s, mySeat, pend.seenBy.includes(mySeat) ? pend.seenBy : pend.seenBy.concat([mySeat]))
    : []
  const canRelay = pend != null && relayTargets.length > 0

  function doPass(card: Vermin, claim: Vermin, target: number) {
    dispatch({ kind: 'pass', cardId: card, claim, target })
    setPhase({ k: 'idle' })
  }
  function doCall(guessTrue: boolean) {
    dispatch({ kind: 'guess', truth: guessTrue })
    setPhase({ k: 'idle' })
  }
  function doRelay(target: number, claim: Vermin) {
    dispatch({ kind: 'passOn', claim, target })
    setPhase({ k: 'idle' })
  }

  function Seat({ p }: { p: number }) {
    const isYou = p === mySeat
    const pile = s.piles[p]
    const active = who === p && s.loser == null
    const lost = s.loser === p
    const won = s.loser != null && s.winner === p
    return (
      <div className={'cp-seat ' + (isYou ? 'you' : 'foe') + (active ? ' on' : '') + (lost ? ' lost' : '')}>
        <div className="cp-seat-head">
          <span className="cp-seat-name">{name(p)}</span>
          {lost && <span className="cp-seat-tag lose">lost</span>}
          {won && <span className="cp-seat-tag win">winner</span>}
          <span className="cp-seat-meta">{seatHandSize(p)} in hand</span>
        </div>
        <div className="cp-piles">
          {CP.VERMIN.map(v => {
            const n = pile[v]
            const danger = n >= CP.LOSE_AT - 1
            return (
              <div key={v} className={'cp-pile' + (n > 0 ? ' has' : ' empty') + (danger ? ' warn3' : '')} title={`${v}: ${n}`}>
                <span className="cp-pile-glyph">{GLYPH[v]}</span>
                <span className="cp-pile-count">{n}</span>
                <span className="cp-pile-pips">
                  {[0, 1, 2, 3].map(i => (
                    <span key={i} className={'cp-pip' + (i < n ? (n >= CP.LOSE_AT ? ' danger' : ' on') : '')} />
                  ))}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Cockroach Poker · bluff & call"
        title="Cockroach Poker"
        subtitle="pass the bug face-down and lie about it — collect four of one vermin and you lose. read your rivals, call the bluff."
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={s.hands.map((_, p) => `${name(p)} ${seatHandSize(p)}`).join(' · ')}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click · play &nbsp; Esc · back &nbsp; N · new</>}
      >
        <div className="cp-main">
          {/* opponents */}
          <div className="cp-seats">
            {opponents.map(p => <Seat key={p} p={p} />)}
          </div>

          {/* center table */}
          <div className="cp-table">
            {pend == null ? (
              <div className="cp-table-empty">
                {s.loser != null ? 'the table is still' : yourMove ? 'choose a card from your hand below' : 'waiting for a pass…'}
              </div>
            ) : (
              <>
                <div className="cp-pass-from">
                  from <b>{name(pend.from)}</b> → <b>{name(pend.target)}</b>
                </div>
                {revealCard ? (
                  <div className="cp-card face">
                    <span className="cp-card-glyph">{GLYPH[pend.card]}</span>
                    <span className="cp-card-label">{pend.card}</span>
                  </div>
                ) : (
                  <div className="cp-card back" />
                )}
                <div className="cp-claim">
                  <span className="glyph">{GLYPH[pend.claim]}</span>“it's a <span className="name">{pend.claim}</span>”
                </div>
                {(phase.k === 'relay-claim' || (humanSeer && pend.target !== mySeat)) && (
                  <div className="cp-peek">you peeked — it's truly a <b>{pend.card}</b></div>
                )}

                {/* human respond controls */}
                {yourMove && pend.target === mySeat && phase.k === 'respond' && (
                  <div className="cp-controls">
                    <div className="cp-ctl-label">call the claim</div>
                    <div className="cp-btn-row">
                      <button className="cp-btn true" onClick={() => doCall(true)}>It's TRUE</button>
                      <button className="cp-btn false" onClick={() => doCall(false)}>It's a BLUFF</button>
                    </div>
                    {canRelay && (
                      <>
                        <div className="cp-ctl-label">…or peek &amp; pass it on</div>
                        <div className="cp-btn-row">
                          {relayTargets.map(t => (
                            <button key={t} className="cp-btn" onClick={() => setPhase({ k: 'relay-claim', target: t })}>
                              Pass on to {name(t)}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* human relay claim picker (after peeking, we KNOW pend.card) */}
                {yourMove && phase.k === 'relay-claim' && (
                  <div className="cp-controls">
                    <div className="cp-ctl-label">claim it to {name(phase.target)} as…</div>
                    <div className="cp-claimgrid">
                      {CP.VERMIN.map(v => (
                        <div key={v} className={'cp-claimchip' + (v === pend.card ? ' truth' : '')}
                          onClick={() => doRelay(phase.target, v)}>
                          <span className="glyph">{GLYPH[v]}</span>{v}{v === pend.card ? ' (true)' : ''}
                        </div>
                      ))}
                    </div>
                    <button className="cp-btn" onClick={() => setPhase({ k: 'respond' })}>← back</button>
                  </div>
                )}
              </>
            )}

            {/* human PASS flow: claim picker / target picker shown on the table */}
            {yourMove && pend == null && phase.k === 'pass-claim' && (
              <div className="cp-controls">
                <div className="cp-ctl-label">claim it as… (lie or tell the truth)</div>
                <div className="cp-claimgrid">
                  {CP.VERMIN.map(v => (
                    <div key={v} className={'cp-claimchip' + (v === phase.card ? ' truth' : '')}
                      onClick={() => setPhase({ k: 'pass-target', card: phase.card, claim: v })}>
                      <span className="glyph">{GLYPH[v]}</span>{v}{v === phase.card ? ' (true)' : ''}
                    </div>
                  ))}
                </div>
                <button className="cp-btn" onClick={() => setPhase({ k: 'pass-card' })}>← pick another card</button>
              </div>
            )}
            {yourMove && pend == null && phase.k === 'pass-target' && (
              <div className="cp-controls">
                <div className="cp-ctl-label">
                  pass <span style={{ fontSize: 18 }}>{GLYPH[phase.card]}</span> claimed “{phase.claim}” to…
                </div>
                <div className="cp-targetpick">
                  {opponents.map(t => (
                    <button key={t} className="cp-targetbtn" onClick={() => doPass(phase.card, phase.claim, t)}>
                      {name(t)}
                    </button>
                  ))}
                </div>
                <button className="cp-btn" onClick={() => setPhase({ k: 'pass-claim', card: phase.card })}>← change claim</button>
              </div>
            )}
          </div>

          {/* your collected pile + hand */}
          <Seat p={mySeat} />
          <div className="cp-hand-wrap">
            <div className="cp-hand-head">
              <span className="cp-hand-title">Your hand</span>
              <span className="cp-hand-hint">
                {yourMove && pend == null && phase.k === 'pass-card' ? 'click a card to pass'
                  : yourMove && pend != null ? 'respond on the table above'
                  : s.loser != null ? 'game over'
                  : 'waiting…'}
              </span>
            </div>
            <div className="cp-hand">
              {CP.VERMIN.map(v => {
                const n = s.hands[mySeat][v]
                const selectable = yourMove && pend == null && phase.k === 'pass-card' && n > 0
                const selected = pend == null && (phase.k === 'pass-claim' || phase.k === 'pass-target') && phase.card === v
                return (
                  <div key={v}
                    className={'cp-hcard' + (selected ? ' sel' : '') + (selectable ? '' : ' disabled')}
                    onClick={selectable ? () => setPhase({ k: 'pass-claim', card: v }) : undefined}
                    title={`${v} ×${n}`}>
                    {n > 0 && <span className="cp-hcard-count">{n}</span>}
                    <span className="cp-hcard-glyph">{GLYPH[v]}</span>
                    <span className="cp-hcard-name">{v}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* side */}
        <div className="cp-side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel">
            <div className="panel-l" style={{ marginBottom: 8 }}>the eight vermin</div>
            <div className="cp-legend">
              {CP.VERMIN.map(v => (
                <div key={v} className="cp-legend-item"><span className="glyph">{GLYPH[v]}</span>{v}</div>
              ))}
            </div>
          </div>
          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.loser != null && <ResultModal state={s} mySeat={mySeat} name={name} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ state, mySeat, name, onNew }: { state: CockroachState; mySeat: number; name: (p: number) => string; onNew: () => void }) {
  const youWon = state.winner === mySeat
  const youLost = state.loser === mySeat
  return (
    <Modal
      eyebrow={youWon ? 'Cleanest board' : youLost ? 'Four of a kind' : 'A rival cracked'}
      title={youWon ? 'You Win' : youLost ? 'You Lose' : `${name(state.loser!)} Loses`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>
          {youLost
            ? <>You collected four of one vermin. <b>{name(state.winner!)}</b> takes it with the cleanest board.</>
            : <><b>{name(state.loser!)}</b> collected four of a kind and is out. {youWon ? <>You</> : <><b>{name(state.winner!)}</b></>} survive with the cleanest board.</>}
        </p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Cockroach Poker" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Got it</button>}>
      <div className="modal-body">
        <p>Three players share <b>64 cards</b> — eight creepy vermin, eight of each. All cards are dealt out.</p>
        <p>On your turn, take a card from your hand and <b>pass it face-down</b> to a rival, <b>claiming</b> a vermin type. You can tell the truth or <b>bluff</b>.</p>
        <p>The receiver either <b>calls</b> — guessing the claim is <b>TRUE</b> or a <b>BLUFF</b>: the card is revealed, and whoever <i>guessed wrong</i> keeps it face-up — or <b>peeks and passes it on</b> to a player who hasn't seen it yet, with a fresh claim. The chain continues until someone calls.</p>
        <p>Whoever gains the face-up card starts the next pass. Collect a <b>fourth card of the same vermin</b> and you <b>lose</b> — also if you must pass with an <b>empty hand</b>. Last one standing with the cleanest board wins.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>Esc</kbd> back/close · <kbd>?</kbd> rules.</p>
      </div>
    </Modal>
  )
}
