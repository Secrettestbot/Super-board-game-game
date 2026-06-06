/* THE MIND — UI (built for this codebase). A COOPERATIVE real-time-ish card game.
   You are player 0; players 1 and 2 are AI partners. Play every card onto one shared
   pile in ascending order without communicating. The AI partners auto-play on internal
   timers (driven by useAITurn re-armed on s.clock + state changes); you play your lowest
   via a button when you judge it's time. A life is lost if a card is played while a
   lower one is still held. Clear the final level to win; run out of lives to lose. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as M from './logic'
import type { MindState } from './logic'

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

// Tick cadence for the simulation clock (ms per tick). Each tick lets ready AIs play.
const TICK_MS = 240

export function TheMind() {
  const [s, setS] = useState<MindState>(() => M.makeGame(1))
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(M.makeGame(1)); setShowRules(false) }

  const playing = s.phase === 'playing'
  const complete = M.levelComplete(s) // level cleared, ready to advance
  const handCount = M.totalCardsLeft(s)

  // The AI partners run on timers. While the game is in play and the current level is
  // not yet fully cleared, keep ticking the simulation. We re-arm on s.clock so the
  // driver keeps firing every tick, plus on handCount/level so it re-arms after plays
  // and level changes. When a level is complete we pause (no tick) until advance.
  const aiActive = playing && !complete && handCount > 0
  useAITurn(aiActive, () => setS(p => M.tick(p)), { delayMs: TICK_MS, tick: `${s.clock}:${handCount}:${s.level}` })

  // Auto-advance to the next level a beat after a level is cleared.
  useEffect(() => {
    if (!complete) return
    const id = setTimeout(() => setS(p => M.advanceLevel(p)), 1100)
    return () => clearTimeout(id)
  }, [complete, s.level])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  function doPlay() {
    if (!playing || complete) return
    if (s.hands[0].length === 0) return
    setS(p => M.playLowest(p, 0))
  }
  function doShuriken() {
    if (!playing || complete) return
    if (s.shuriken <= 0) return
    setS(p => M.useShuriken(p))
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

  const yourLowest = M.yourLowest(s)
  const tension = M.tension(s)
  const tensionPct = Math.round(tension * 100)

  let banner: string, bk = ''
  if (s.phase === 'won') { bk = 'win'; banner = 'In sync — the team cleared The Mind!' }
  else if (s.phase === 'lost') { bk = 'lose'; banner = 'Out of lives — the connection broke' }
  else if (complete) { bk = 'win'; banner = `Level ${s.level} cleared — breathe…` }
  else {
    bk = 'you'
    banner = yourLowest != null
      ? 'Sense the moment — play your lowest when it feels right'
      : 'Your hand is empty — trust your partners'
  }

  const lives = Array.from({ length: M.START_LIVES }, (_, i) => i < s.lives)
  const stars = Array.from({ length: M.START_SHURIKEN }, (_, i) => i < s.shuriken)

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="The Mind · wordless cooperation"
        title="The Mind"
        subtitle="play every card onto one pile in ascending order — no talking, no signals, just shared intuition with two AI partners"
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
                {s.hands[0].length === 0
                  ? <div className="tm-hand-empty">empty</div>
                  : s.hands[0].map((v, i) => (
                      <div key={v} className={'tm-card' + (i === 0 ? ' lowest' : '')}>
                        {v}
                        {i === 0 && <span className="tm-card-tag">lowest</span>}
                      </div>
                    ))}
              </div>

              <div className="tm-btns">
                <button
                  className="tm-btn play"
                  disabled={!playing || complete || yourLowest == null}
                  onClick={doPlay}
                >
                  Play my lowest{yourLowest != null ? ` (${yourLowest})` : ''}
                </button>
                <button
                  className="tm-btn star"
                  disabled={!playing || complete || s.shuriken <= 0 || handCount === 0}
                  onClick={doShuriken}
                >
                  ★ Shuriken
                </button>
              </div>
            </div>
          </div>

          {/* Side: status + partners + log */}
          <div className="side">
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
              <div className="tm-partners-label">partners</div>
              {[1, 2].map(p => (
                <div key={p} className="tm-partner">
                  <span className="tm-partner-dot" />
                  <span className="tm-partner-name">Partner {p}</span>
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
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
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

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="The Mind" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p><b>The Mind</b> is cooperative — you and <b>two AI partners</b> share one goal and <b>never communicate</b>. The deck is numbered <b>1 to 100</b>.</p>
        <p>Each <b>level</b>, everyone is dealt that many cards (level 1 → 1 card each, level 2 → 2 each, and so on). The team must play <b>every card</b> onto a single shared pile in <b>strictly ascending order</b>.</p>
        <p>There are <b>no turns</b>. Your partners play on their own timing; <b>you play your lowest card</b> with the button (or <kbd>Space</kbd>) whenever you sense it's the lowest one left. If any card is played while someone still holds a <b>lower</b> one, the team <b>loses a life</b> and those lower cards are revealed and discarded.</p>
        <p>You have <b>{M.START_LIVES} lives</b> and a <b>shuriken</b> (★): spend it (or <kbd>S</kbd>) and everyone discards their lowest card face up — no life lost. Clear all <b>{M.MAX_LEVEL} levels</b> to win; lose all lives and the game ends.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> play lowest · <kbd>S</kbd> shuriken · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
