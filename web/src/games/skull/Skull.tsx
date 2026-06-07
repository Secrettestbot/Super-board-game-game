/* SKULL — UI (built for this codebase). A smoky tavern table: your four discs in hand, four
   personal stacks of face-down discs, a brass bidding ladder, and a flip/reveal strip. You vs
   3 heuristic AI players on a timer, first to 2 points. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import * as SK from './logic'
import type { SkullState, Disc } from './logic'
import { skullAdapter } from './net'

const SOLO_NAMES = ['You', 'Rook', 'Mab', 'Cull']

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#1a1410" stroke="#43342a" strokeWidth="1.5" />
    {/* skull */}
    <path d="M24 11c-7 0-11 4.6-11 11 0 3.6 1.5 6 3.4 7.4V33a2 2 0 0 0 2 2h11.2a2 2 0 0 0 2-2v-3.6C33.5 28 35 25.6 35 22c0-6.4-4-11-11-11Z" fill="#ece4d0" stroke="#b7a988" strokeWidth="1" />
    <circle cx="19.5" cy="22" r="2.7" fill="#1a1410" />
    <circle cx="28.5" cy="22" r="2.7" fill="#1a1410" />
    <path d="M24 26.5l-1.6 3.2h3.2L24 26.5Z" fill="#1a1410" />
    <path d="M19 33v2.5M22 33v2.7M25 33v2.7M28 33v2.5" stroke="#b7a988" strokeWidth="1" strokeLinecap="round" />
  </svg>
)

function RoseGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="glyph" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="var(--rose)" stroke="var(--rose-d)" strokeWidth="1.4" />
      <circle cx="16" cy="16" r="6.4" fill="var(--rose-hi)" />
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2
        const x = 16 + Math.cos(a) * 8.2, y = 16 + Math.sin(a) * 8.2
        return <circle key={i} cx={x} cy={y} r="3.6" fill="var(--rose-d)" opacity="0.85" />
      })}
      <circle cx="16" cy="16" r="2.6" fill="#fff4ea" />
    </svg>
  )
}

function SkullGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="glyph" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="#221a14" stroke="var(--bone-d)" strokeWidth="1.2" />
      <path d="M16 6c-5.4 0-8.6 3.6-8.6 8.6 0 2.8 1.2 4.7 2.7 5.8v2.4a1.6 1.6 0 0 0 1.6 1.6h8.6a1.6 1.6 0 0 0 1.6-1.6v-2.4c1.5-1.1 2.7-3 2.7-5.8C24.6 9.6 21.4 6 16 6Z" fill="var(--bone)" stroke="var(--bone-d)" strokeWidth="0.9" />
      <circle cx="12.6" cy="15" r="2.2" fill="#221a14" />
      <circle cx="19.4" cy="15" r="2.2" fill="#221a14" />
      <path d="M16 18l-1.2 2.4h2.4L16 18Z" fill="#221a14" />
    </svg>
  )
}

function DiscFace({ disc }: { disc: Disc }) {
  return <div className={'disc face ' + disc}>{disc === 'rose' ? <RoseGlyph /> : <SkullGlyph />}</div>
}

export function Skull() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(skullAdapter)
  const [showRules, setShowRules] = useState(false)
  const [bidInput, setBidInput] = useState(1)

  // Seat-relative labels: your seat is always "You"; others are "Opponent" online (real
  // people, names unknown) or the flavour AI names in solo play.
  const NAMES = s.players.map((_, i) =>
    i === mySeat ? 'You' : net.online ? `Player ${i + 1}` : SOLO_NAMES[i] ?? `P${i + 1}`,
  )
  const oppName = (i: number) => (i === mySeat ? 'You' : net.online ? 'Opponent' : SOLO_NAMES[i] ?? `P${i + 1}`)

  function newGame() {
    netNew()
    setShowRules(false)
    setBidInput(1)
  }

  const you = s.players[mySeat]
  const yourTurn = isMyTurn && s.winner == null

  // The hook drives AI for empty seats (authority side only) — no local useAITurn here.

  // ---------- human actions ----------
  const placedTotal = SK.totalPlaced(s)
  const maxBid = Math.max(1, placedTotal)

  function doPlace(disc: Disc) {
    if (s.phase !== 'place' || !yourTurn) return
    if (disc === 'rose' && you.hand.roses <= 0) return
    if (disc === 'skull' && you.hand.skulls <= 0) return
    dispatch({ kind: 'place', disc })
  }
  function doOpenBid() {
    if (s.phase !== 'place' || !yourTurn || !s.placedFirstPass || you.stack.length === 0) return
    const n = Math.min(maxBid, Math.max(1, bidInput))
    dispatch({ kind: 'bid', n })
  }
  function doRaise() {
    if (s.phase !== 'bid' || !yourTurn || s.bid == null) return
    const n = Math.min(maxBid, Math.max(s.bid + 1, bidInput))
    if (n <= s.bid) return
    dispatch({ kind: 'bid', n })
  }
  function doPass() {
    if (s.phase !== 'bid' || !yourTurn) return
    dispatch({ kind: 'pass' })
  }
  function doFlip(target: number) {
    if (s.phase !== 'challenge' || !yourTurn) return
    dispatch({ kind: 'flip', target })
  }
  function doContinue() {
    if (s.phase !== 'reveal') return
    dispatch({ kind: 'flip', target: mySeat })
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (s.winner != null) return false
      if (s.phase === 'reveal' && yourTurn && (e.key === ' ' || e.key === 'Enter')) { doContinue(); return true }
      if (s.phase === 'place' && yourTurn) {
        if (e.key === 'r' || e.key === 'R') { doPlace('rose'); return true }
        if (e.key === 's' || e.key === 'S') { doPlace('skull'); return true }
        if (e.key === ' ' || e.key === 'Enter') { doOpenBid(); return true }
      }
      if (s.phase === 'bid' && yourTurn) {
        if (e.key === ' ' || e.key === 'Enter') { doRaise(); return true }
        if (e.key === 'p' || e.key === 'P') { doPass(); return true }
      }
      return false
    },
  })

  const legalTargets = s.phase === 'challenge' ? SK.flipTargets(s) : []
  const flippedCount = (i: number) => s.flips.filter(f => f.player === i).length

  // ---------- banner ---------- (everything relative to mySeat)
  let banner = '', bk = ''
  if (s.winner != null) {
    if (s.winner === mySeat) { bk = 'win'; banner = 'You win — two points claimed!' }
    else { bk = 'lose'; banner = `${oppName(s.winner)} wins the game.` }
  } else if (s.phase === 'reveal' && s.outcome) {
    const mine = s.outcome.player === mySeat
    bk = s.outcome.success ? (mine ? 'you' : 'foe') : 'lose'
    const who = mine ? 'You' : oppName(s.outcome.player)
    banner = s.outcome.success
      ? `${who} flipped ${s.challengeTarget} rose${s.challengeTarget === 1 ? '' : 's'} — point scored.`
      : `${who} hit a skull — lost a disc. ${yourTurn ? 'Press space to continue.' : ''}`
  } else if (s.phase === 'challenge') {
    const c = s.bidder!
    const mine = c === mySeat
    bk = mine ? 'you' : 'foe'
    banner = mine
      ? `Flip ${s.challengeTarget} roses — your stack first, then a rival's top disc.`
      : `${oppName(c)} is flipping for ${s.challengeTarget}…`
  } else if (s.phase === 'bid') {
    bk = yourTurn ? 'you' : 'foe'
    banner = yourTurn ? `Raise above ${s.bid} or pass.` : `${oppName(s.turn)} is weighing the bid…`
  } else { // place
    bk = yourTurn ? 'you' : 'foe'
    banner = yourTurn
      ? (s.placedFirstPass && you.stack.length > 0 ? 'Place another disc — or open the bid.' : 'Place a disc face-down.')
      : `${oppName(s.turn)} is placing…`
  }

  const revealing = s.phase === 'reveal' || s.phase === 'done' || s.phase === 'challenge'

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Skull · bluff & flip"
        title="Skull"
        subtitle="bid the roses you can flip without turning a skull — your own stack first"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Round ${s.round} · first to ${SK.TARGET_POINTS}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>R · rose &nbsp; S · skull &nbsp; space · bid &nbsp; P · pass &nbsp; N · new</>}
      >
        <div className="sk-wrap">
          {s.players.map((p, i) => {
            const isYou = i === mySeat
            const active = s.turn === i && s.winner == null
            const isBidder = s.bidder === i && (s.phase === 'bid' || s.phase === 'challenge')
            const canFlip = s.phase === 'challenge' && yourTurn && legalTargets.includes(i)
            const fc = flippedCount(i)
            return (
              <div key={i} className={'seat' + (isYou ? ' you' : ' foe') + (active ? ' active' : '') + (p.eliminated ? ' out' : '')}>
                <div className="seat-head">
                  <span className="seat-name">{NAMES[i]}</span>
                  <span className="seat-pts">
                    {Array.from({ length: SK.TARGET_POINTS }, (_, k) => (
                      <span key={k} className={'pt' + (k < p.points ? ' on' : '')} />
                    ))}
                  </span>
                  {p.eliminated && <span className="seat-out">out</span>}
                </div>

                {/* the personal stack of face-down discs (top = right-most / last) */}
                <div className="stack">
                  {p.stack.length === 0 && <div className="stack-empty">no discs placed</div>}
                  {p.stack.map((disc, k) => {
                    const fromTop = p.stack.length - 1 - k          // 0 = top
                    const isFlipped = revealing && fromTop < fc
                    const isTopFlippable = canFlip && fromTop === fc // next disc to flip on this stack
                    if (isFlipped) return <div key={k} className="slot"><DiscFace disc={disc} /></div>
                    return (
                      <button
                        key={k}
                        className={'slot back' + (isTopFlippable ? ' flippable' : '')}
                        disabled={!isTopFlippable}
                        onClick={() => isTopFlippable && doFlip(i)}
                        aria-label="face-down disc"
                      >
                        <span className="back-mark" />
                      </button>
                    )
                  })}
                </div>

                {isBidder && (
                  <div className="seat-bid">
                    {s.phase === 'challenge' ? `flipping ${s.flips.length}/${s.challengeTarget}` : `bid ${s.bid}`}
                  </div>
                )}

                {/* your hand of remaining discs */}
                {isYou && (
                  <div className="hand">
                    {Array.from({ length: you.hand.roses }, (_, k) => <div key={'r' + k} className="hand-disc rose"><RoseGlyph /></div>)}
                    {Array.from({ length: you.hand.skulls }, (_, k) => <div key={'s' + k} className="hand-disc skull"><SkullGlyph /></div>)}
                    {SK.handSize(you) === 0 && <div className="hand-empty">hand empty</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* control + ladder panel */}
        <div className="side">
          <div className="panel bid-panel">
            <div className="panel-h">Bid ladder</div>
            <div className="ladder">
              <div className="ladder-cur">{s.bid == null ? '—' : s.bid}</div>
              <div className="ladder-sub">{s.bid == null ? 'no bid yet' : `${NAMES[s.bidder!]}'s bid · ${placedTotal} on table`}</div>
            </div>

            {s.winner == null && yourTurn && s.phase === 'place' && (
              <div className="controls">
                <div className="ctrl-row">
                  <button className="ctrl-disc rose" disabled={you.hand.roses <= 0} onClick={() => doPlace('rose')}>
                    <RoseGlyph /><span>Place rose</span>
                  </button>
                  <button className="ctrl-disc skull" disabled={you.hand.skulls <= 0} onClick={() => doPlace('skull')}>
                    <SkullGlyph /><span>Place skull</span>
                  </button>
                </div>
                {s.placedFirstPass && you.stack.length > 0 && (
                  <div className="open-row">
                    <Stepper value={bidInput} min={1} max={maxBid} onChange={setBidInput} />
                    <button className="btn-act primary" onClick={doOpenBid}>Open bid · {Math.min(maxBid, Math.max(1, bidInput))}</button>
                  </div>
                )}
              </div>
            )}

            {s.winner == null && yourTurn && s.phase === 'bid' && s.bid != null && (
              <div className="controls">
                <div className="open-row">
                  <Stepper value={bidInput} min={s.bid + 1} max={maxBid} onChange={setBidInput} />
                  <button className="btn-act primary" disabled={Math.max(s.bid + 1, bidInput) > maxBid} onClick={doRaise}>Raise</button>
                </div>
                <button className="btn-act warn full" onClick={doPass}>Pass</button>
              </div>
            )}

            {s.winner == null && yourTurn && s.phase === 'challenge' && (
              <div className="controls">
                <div className="hint">Click a highlighted disc to flip it. {legalTargets.includes(mySeat) ? 'Your stack first.' : 'Pick a rival.'}</div>
              </div>
            )}

            {s.winner == null && yourTurn && s.phase === 'reveal' && (
              <div className="controls">
                <button className="btn-act primary full" onClick={doContinue}>Continue</button>
              </div>
            )}

            {!yourTurn && s.winner == null && (
              <div className="controls"><div className="hint waiting">{oppName(s.turn)} is thinking…</div></div>
            )}
          </div>

          <OnlineBar net={net} />

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} names={NAMES} mySeat={mySeat} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  const v = Math.min(max, Math.max(min, value))
  return (
    <div className="stepper">
      <button className="step" disabled={v <= min} onClick={() => onChange(Math.max(min, v - 1))}>–</button>
      <span className="step-val">{v}</span>
      <button className="step" disabled={v >= max} onClick={() => onChange(Math.min(max, v + 1))}>+</button>
    </div>
  )
}

function ResultModal({ s, names, mySeat, onNew }: { s: SkullState; names: string[]; mySeat: number; onNew: () => void }) {
  const won = s.winner === mySeat
  return (
    <Modal
      eyebrow={won ? 'The table folds' : 'Out-bluffed'}
      title={won ? 'You Win' : `${names[s.winner!]} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <div className="finalsc">
          {s.players.map((p, i) => (
            <span key={i} className={i === s.winner ? 'win' : ''}>{names[i]} {p.points}{p.eliminated ? ' (out)' : ''}</span>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Skull" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Each player holds <b>four discs</b>: three <b>roses</b> and one <b>skull</b>. Going around the table, everyone <b>places one disc face-down</b> onto their personal stack. After the first round of placement you may keep adding discs <i>or</i> <b>open the bidding</b>.</p>
        <p>A <b>bid</b> of N claims "I can flip <b>N roses</b> without turning over a skull." Players raise or pass in turn; once everyone but the high bidder passes, that bidder must make good.</p>
        <p>The challenger flips discs one at a time — <b>their own stack first, top-down</b>, then any rival's top disc. Reach <b>N roses</b> and you <b>score a point</b>. Reveal a <b>skull</b> first and you <b>fail</b>, losing a disc as the round resets.</p>
        <p><b>First to {SK.TARGET_POINTS} points wins.</b> Lose all four discs and you're out.</p>
        <p><b>Keys:</b> <kbd>R</kbd>/<kbd>S</kbd> place rose/skull · <kbd>Space</kbd> bid/continue · <kbd>P</kbd> pass · <kbd>N</kbd> new · <kbd>?</kbd> rules.</p>
      </div>
    </Modal>
  )
}
