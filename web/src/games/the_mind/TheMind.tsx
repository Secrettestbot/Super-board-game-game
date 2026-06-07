/* THE MIND — UI. A COOPERATIVE, wordless, real-time-ish card game on the framework
   shell. Play every card onto one shared pile in ascending order without communicating.

   Seat-relative & online-capable: your hand comes from `mySeat`, your "play my lowest"
   button is gated on holding the single lowest outstanding card (isMyTurn), and the
   level / lives / shuriken / pile are shared and public. Solo fills the partner seats
   with the existing co-op timing AI (driven by useGameSession on tickKey); hosting lets
   real teammates take those seats. Online, partners are "Player N" / "Teammate".

   HIDDEN INFO: only your own hand is real — partners' hands are redacted to counts by the
   adapter before a view crosses the wire (you only ever see how many cards they hold). */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { theMindAdapter } from './net'
import * as M from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="11" fill="#171a2e" stroke="#33406b" strokeWidth="1.5" />
    <circle cx="24" cy="24" r="13" fill="none" stroke="#6fb4ff" strokeWidth="1.5" opacity="0.6" />
    <circle cx="24" cy="24" r="8" fill="none" stroke="#9d7bff" strokeWidth="1.5" opacity="0.8" />
    <circle cx="24" cy="24" r="3.2" fill="#ffd36e" />
    <circle cx="24" cy="9" r="1.6" fill="#cfe3ff" />
    <circle cx="38" cy="30" r="1.4" fill="#cfe3ff" />
    <circle cx="11" cy="32" r="1.4" fill="#cfe3ff" />
  </svg>
)

export function TheMind() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(theMindAdapter)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setShowRules(false) }

  const playing = s.phase === 'playing'
  const complete = M.levelComplete(s) // level cleared, ready to advance
  const handCount = M.totalCardsLeft(s)

  // Auto-advance to the next level a beat after a level is cleared. Only the host/local
  // authority deals the next level (the adapter routes the breather turn to seat 0);
  // guests just receive the new view. Mirrors the original solo auto-step.
  useEffect(() => {
    if (!complete || !net.amHost) return
    const id = setTimeout(() => dispatch({ kind: 'advance' }), 1100)
    return () => clearTimeout(id)
  }, [complete, s.level, net.amHost, dispatch])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  // Your hand & whether you currently hold the single lowest outstanding card (your turn).
  const myHand = s.hands[mySeat] ?? []
  const yourTurn = playing && !complete && isMyTurn && myHand.length > 0
  const myLowest = myHand.length > 0 ? myHand[0] : null

  function doPlay() { if (yourTurn) dispatch({ kind: 'play' }) }
  // Shuriken is a shared action; only the seat currently "to move" can route it through
  // the turn surface (the adapter gates it to the lowest holder).
  function doShuriken() {
    if (!playing || complete || s.shuriken <= 0 || handCount === 0) return
    if (!isMyTurn) return
    dispatch({ kind: 'star' })
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (!playing || complete) return false
      if (e.key === ' ') { doPlay(); return true }
      if (e.key === 's' || e.key === 'S') { doShuriken(); return true }
      return false
    },
  })

  const tension = M.tension(s)
  const tensionPct = Math.round(tension * 100)

  // Seat-relative naming: in solo keep the "Partner N" flavour; online say "Teammate".
  function nameFor(p: number): string {
    if (p === mySeat) return 'You'
    return net.online ? `Player ${p + 1}` : `Partner ${p}`
  }

  let banner: string, bk = ''
  if (s.phase === 'won') { bk = 'win'; banner = 'In sync — the team cleared The Mind!' }
  else if (s.phase === 'lost') { bk = 'lose'; banner = 'Out of lives — the connection broke' }
  else if (complete) { bk = 'win'; banner = `Level ${s.level} cleared — breathe…` }
  else {
    bk = 'you'
    banner = myHand.length === 0
      ? `Your hand is empty — trust your ${net.online ? 'teammates' : 'partners'}`
      : yourTurn
        ? 'You hold the lowest — play it when it feels right'
        : 'Sense the moment — wait for the lowest card to surface'
  }

  const lives = Array.from({ length: M.START_LIVES }, (_, i) => i < s.lives)
  const stars = Array.from({ length: M.START_SHURIKEN }, (_, i) => i < s.shuriken)

  // Partner seats = everyone but me, in stable order.
  const partnerSeats: number[] = []
  for (let p = 0; p < s.hands.length; p++) if (p !== mySeat) partnerSeats.push(p)

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="The Mind · wordless cooperation"
        title="The Mind"
        subtitle={net.online
          ? 'play every card onto one pile in ascending order — no talking, no signals, just shared intuition with your teammates'
          : 'play every card onto one pile in ascending order — no talking, no signals, just shared intuition with two AI partners'}
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Level {s.level} / {s.maxLevel} &nbsp;·&nbsp; {handCount} cards left</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · play lowest &nbsp; s · shuriken &nbsp; N · new</>}
      >
        <div className="tm-stage">
          {/* Center column: pile + tension + your hand + controls */}
          <div className="tm-center">
            <div className="panel tm-pile-panel">
              <div className="tm-pile-label">shared pile</div>
              <div className="tm-pile">
                <div className={'tm-pile-card' + (s.pileTop > 0 ? '' : ' empty')}>
                  {s.pileTop > 0 ? s.pileTop : '–'}
                </div>
              </div>
              <div className="tm-pile-sub">
                {s.pileTop > 0 ? `next must be higher than ${s.pileTop}` : 'nothing played yet'}
              </div>

              <div className="tm-tension">
                <div className="tm-tension-row">
                  <span className="tm-tension-cap">tension</span>
                  <span className="tm-tension-val">{tensionPct}%</span>
                </div>
                <div className="tm-tension-bar">
                  <div
                    className={'tm-tension-fill' + (tension > 0.66 ? ' hot' : tension > 0.33 ? ' warm' : '')}
                    style={{ width: `${tensionPct}%` }}
                  />
                </div>
              </div>

              {s.lastRevealed.length > 0 && !complete && s.phase === 'playing' && (
                <div className="tm-revealed">
                  discarded: {s.lastRevealed.join(' · ')}
                </div>
              )}
            </div>

            <div className="panel tm-hand-panel">
              <div className="tm-hand-label">your hand</div>
              <div className="tm-hand">
                {myHand.length === 0
                  ? <div className="tm-hand-empty">empty</div>
                  : myHand.map((v, i) => (
                      <div key={v} className={'tm-card' + (i === 0 ? ' lowest' : '')}>
                        {v}
                        {i === 0 && <span className="tm-card-tag">lowest</span>}
                      </div>
                    ))}
              </div>

              <div className="tm-btns">
                <button
                  className="tm-btn play"
                  disabled={!yourTurn}
                  onClick={doPlay}
                >
                  Play my lowest{myLowest != null ? ` (${myLowest})` : ''}
                </button>
                <button
                  className="tm-btn star"
                  disabled={!playing || complete || s.shuriken <= 0 || handCount === 0 || !isMyTurn}
                  onClick={doShuriken}
                >
                  ★ Shuriken
                </button>
              </div>
            </div>
          </div>

          {/* Side: online bar + status + partners + log */}
          <div className="side">
            <div className="panel">
              <OnlineBar net={net} />
            </div>

            <div className="panel tm-status">
              <div className="tm-stat-row">
                <span className="tm-stat-cap">lives</span>
                <span className="tm-hearts">
                  {lives.map((on, i) => <span key={i} className={'tm-heart' + (on ? '' : ' off')}>♥</span>)}
                </span>
              </div>
              <div className="tm-stat-row">
                <span className="tm-stat-cap">shuriken</span>
                <span className="tm-stars">
                  {stars.map((on, i) => <span key={i} className={'tm-star' + (on ? '' : ' off')}>★</span>)}
                </span>
              </div>
              <div className="tm-stat-row">
                <span className="tm-stat-cap">level</span>
                <span className="tm-level">{s.level} / {s.maxLevel}</span>
              </div>
            </div>

            <div className="panel tm-partners">
              <div className="tm-partners-label">{net.online ? 'teammates' : 'partners'}</div>
              {partnerSeats.map(p => (
                <div key={p} className="tm-partner">
                  <span className="tm-partner-dot" />
                  <span className="tm-partner-name">{nameFor(p)}</span>
                  <span className="tm-partner-cards">
                    {s.hands[p].length === 0
                      ? 'done'
                      : `${s.hands[p].length} card${s.hands[p].length === 1 ? '' : 's'}`}
                  </span>
                </div>
              ))}
              <div className="tm-partner-hint">their cards stay hidden — feel the timing</div>
            </div>

            <div className="panel logbox" ref={logRef}>
              {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
            </div>
          </div>
        </div>
      </GameShell>

      {(s.phase === 'won' || s.phase === 'lost') && <ResultModal won={s.phase === 'won'} level={s.level} onNew={newGame} />}
      {showRules && <RulesModal online={net.online} onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, level, onNew }: { won: boolean; level: number; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Minds aligned' : 'Out of sync'}
      title={won ? 'You Win' : 'Game Over'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        {won
          ? <span className="you">All levels cleared — perfect wordless harmony</span>
          : <span className="foe">The team ran out of lives at level {level}</span>}
      </div>
    </Modal>
  )
}

function RulesModal({ online, onClose }: { online: boolean; onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="The Mind" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p><b>The Mind</b> is cooperative — you and {online ? <>your <b>teammates</b></> : <>two <b>AI partners</b></>} share one goal and <b>never communicate</b>. The deck is numbered <b>1 to 100</b>.</p>
        <p>Each <b>level</b>, everyone is dealt that many cards (level 1 → 1 card each, level 2 → 2 each, and so on). The team must play <b>every card</b> onto a single shared pile in <b>strictly ascending order</b>.</p>
        <p>There are <b>no turns</b>. Everyone senses the timing together; <b>you play your lowest card</b> with the button (or <kbd>Space</kbd>) whenever you sense it's the lowest one left. If any card is played while someone still holds a <b>lower</b> one, the team <b>loses a life</b> and those lower cards are revealed and discarded.</p>
        <p>You have <b>{M.START_LIVES} lives</b> and a <b>shuriken</b> (★): spend it (or <kbd>S</kbd>) and everyone discards their lowest card face up — no life lost. Clear all <b>{M.MAX_LEVEL} levels</b> to win; lose all lives and the game ends.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> play lowest · <kbd>S</kbd> shuriken · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
