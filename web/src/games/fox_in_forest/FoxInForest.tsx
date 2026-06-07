/* THE FOX IN THE FOREST — UI (built for this codebase).
   A storybook trick-taking duel on the framework shell. Three painted suits, an ornate
   decree card setting trump, and odd-card powers. Online-capable via useGameSession: the
   host runs the real logic, a guest plays the other seat through a redacted per-seat view.

   SEAT-RELATIVE: your hand is whichever side mySeat maps to (0='you', 1='ai'); banners,
   scores and the opponent strip are all framed from your seat. In solo play mySeat is 0
   and seat 1 is the fox AI, exactly as before. Two timers remain in the component:
   the post-trick reveal pause (then dispatch a 'collect' for tricks you won) and the
   hand-end deal — both expressed as net intents so the same path works online. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { foxInForestAdapter } from './net'
import * as FX from './logic'
import type { Card as TCard, Player, Suit, FoxState } from './logic'

const SUIT_GLYPH: Record<Suit, string> = { bells: '❀', keys: '⚷', moons: '☽' }
const POWER: Record<number, string> = {
  1: 'Swan', 3: 'Witch', 5: 'Treasure', 7: 'Treasure', 9: 'Charm', 11: 'Monarch',
}
const SUIT_ORDER: Record<Suit, number> = { bells: 0, keys: 1, moons: 2 }

function sortHand(hand: TCard[]): TCard[] {
  return hand.slice().sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || a.rank - b.rank)
}

function Card({ card, onClick, className, illegal }: { card: TCard; onClick?: () => void; className?: string; illegal?: boolean }) {
  const power = POWER[card.rank]
  const cls = ['fx-card', 'suit-' + card.suit, className || '']
  if (illegal) cls.push('illegal')
  if (power) cls.push('odd')
  return (
    <div className={cls.join(' ')} onClick={onClick}>
      <div className="fx-corner"><span className="fx-rank">{card.rank}</span><span className="fx-glyph">{SUIT_GLYPH[card.suit]}</span></div>
      <div className="fx-center">{SUIT_GLYPH[card.suit]}</div>
      {power && <div className="fx-power">{power}</div>}
      <div className="fx-corner br"><span className="fx-rank">{card.rank}</span><span className="fx-glyph">{SUIT_GLYPH[card.suit]}</span></div>
    </div>
  )
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#241a2e" stroke="#5a4570" strokeWidth="1.5" />
    <path d="M24 13 C19 17 15 20 15 26 C15 32 19 35 24 35 C29 35 33 32 33 26 C33 20 29 17 24 13 Z" fill="#caa05a" stroke="#8a6a32" strokeWidth="1" />
    <path d="M24 14 L21 24 L24 21 L27 24 Z" fill="#3a2c18" />
    <circle cx="20.5" cy="27" r="1.6" fill="#241a2e" />
    <circle cx="27.5" cy="27" r="1.6" fill="#241a2e" />
    <path d="M22.5 30.5 L24 32 L25.5 30.5" fill="none" stroke="#241a2e" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function FoxInForest() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(foxInForestAdapter)
  const [showRules, setShowRules] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [swanSkipped, setSwanSkipped] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  // Seat-relative players: `me` is the side you control, `foe` is the opponent.
  const me: Player = mySeat === 1 ? 'ai' : 'you'
  const foe: Player = me === 'you' ? 'ai' : 'you'
  const foeName = net.online ? 'Opponent' : 'The Fox'

  function newGame() { netNew(); setShowRules(false); setSwapping(false); setSwanSkipped(false) }

  // The Swan-swap window is yours iff YOU just led a 1 and haven't yet decided. While it is
  // open the adapter holds the follower, so the prompt below can be answered.
  const youSwanLead = FX.canSwapDecree(s, me) && isMyTurn && s.trick.length === 1 && !swanSkipped

  // Collect a completed trick after a reveal pause — only the trick winner drives it. The
  // adapter routes the winner's seat here (isMyTurn), AI collects its own pending tricks.
  useEffect(() => {
    if (s.pending && s.pending.winner === me && isMyTurn) {
      const id = setTimeout(() => dispatch({ kind: 'collect' }), 1000)
      return () => clearTimeout(id)
    }
  }, [s.pending, s.hand, me, isMyTurn, dispatch])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])
  useEffect(() => { setSwapping(false); setSwanSkipped(false) }, [s.hand, s.trick])
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setShowRules(false); setSwapping(false) } })

  const yourTurn = s.phase === 'play' && !s.pending && !s.winner && isMyTurn && !youSwanLead
  const led = s.trick.length ? s.trick[0].card : null
  const myHand = s.hands[me]
  const legal = yourTurn ? FX.legalPlays(myHand, led, s.trump) : []
  const legalIds = new Set(legal.map(c => c.id))
  const canSwap = youSwanLead

  function clickHandCard(c: TCard) {
    if (swapping) { dispatch({ kind: 'swapDecree', cardId: c.id }); setSwapping(false); return }
    if (!yourTurn || !legalIds.has(c.id)) return
    dispatch({ kind: 'play', cardId: c.id })
  }

  // ===== banner (relative to your seat) =====
  let banner: string, bk = ''
  if (s.winner) {
    if (s.winner === me) { bk = 'win'; banner = 'You win the wood — the fox bows out' }
    else if (s.winner === foe) { bk = 'lose'; banner = net.online ? 'Your opponent prevails' : 'The fox outfoxes you' }
    else { bk = ''; banner = 'A tie at the forest’s edge' }
  } else if (s.phase === 'handEnd') { bk = ''; banner = `Hand ${s.hand} settled` }
  else if (swapping) { bk = 'you'; banner = 'Swan’s gift — pick a card to swap with the decree' }
  else if (s.pending) {
    const w = s.pending.winner
    bk = w === me ? 'you' : 'foe'
    banner = `${w === me ? 'You take' : `${foeName} takes`} the trick`
  } else if (yourTurn) {
    bk = 'you'
    banner = s.trick.length === 0 ? 'Your turn — lead a card' : 'Your turn — follow suit'
  } else { bk = 'foe'; banner = net.online ? 'Waiting for your opponent…' : 'The fox is deciding…' }

  // host controls the next deal; a guest just waits for it.
  const canDeal = net.amHost && s.phase === 'handEnd' && !s.winner

  // ===== felt content =====
  function FeltContent() {
    if (s.phase === 'handEnd' && !s.winner) {
      const last = s.handLog[s.handLog.length - 1]
      const myRes = me === 'you' ? last.you : last.ai
      const foeRes = me === 'you' ? last.ai : last.you
      return (
        <div className="fx-handend">
          <div className="fx-he-title">Hand {last.hand} settled</div>
          <div className="fx-he-row">
            <span className="you">You · {myRes.tricks} tricks → <b>+{myRes.pts}</b>{myRes.sevens ? ` (${myRes.sevens}×7)` : ''}</span>
            <span className="foe">{foeName} · {foeRes.tricks} tricks → <b>+{foeRes.pts}</b>{foeRes.sevens ? ` (${foeRes.sevens}×7)` : ''}</span>
          </div>
          {canDeal
            ? <button className="fx-continue" onClick={() => dispatch({ kind: 'nextHand' })}>Deal hand {s.hand + 1}</button>
            : <div className="fx-hint">Waiting for the host to deal hand {s.hand + 1}…</div>}
        </div>
      )
    }
    if (s.trick.length === 0) {
      const leaderIsMe = s.leader === me
      return <div className="fx-hint">{leaderIsMe ? 'You lead this trick' : `${foeName} leads this trick`}</div>
    }
    const winner = s.pending ? s.pending.winner : null
    return (
      <div className="fx-trick">
        {s.trick.map((tk) => (
          <div key={tk.card.id} className={'fx-slot' + (winner === tk.player ? ' win' : '')}>
            <Card card={tk.card} className="played-in" />
            <span className="fx-slot-who">{tk.player === me ? 'You' : 'Foe'}{winner === tk.player ? ' · won' : ''}</span>
          </div>
        ))}
        {s.trick.length === 1 && !s.pending && (
          <div className="fx-slot">
            <div className="fx-empty" />
            <span className="fx-slot-who">{s.turn === me ? 'You' : 'Foe'}</span>
          </div>
        )}
      </div>
    )
  }

  const hand = sortHand(myHand)
  const foeHand = s.hands[foe]
  const myTricks = s.tricksWon[me], foeTricks = s.tricksWon[foe]
  const myScore = s.scores[me], foeScore = s.scores[foe]
  const handHint = swapping ? 'choose any card to trade for the decree'
    : yourTurn ? (s.trick.length ? 'follow the led suit if you hold it' : 'lead any card')
    : '—'

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="The Fox in the Forest · win the middle"
        title="The Fox in the Forest"
        subtitle="a storybook trick-taking duel — take just enough tricks, never too many, and bend the odd cards to your will"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Hand ${s.hand} · to ${FX.TARGET}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="fx-table">
          <div className="fx-oppstrip">
            <div className="fx-opp-id">
              <span className="fx-opp-name">{foeName}</span>
              <span className="fx-opp-meta">{foeHand.length} card{foeHand.length === 1 ? '' : 's'} in paw</span>
            </div>
            <div className="fx-opp-hand">
              {foeHand.map((_c, i) => <div className="fx-cardback" key={i} />)}
            </div>
            <div className="fx-opp-tag">
              <div className="fx-opp-stat foe"><b>{foeTricks}</b><span>tricks</span></div>
              <div className="fx-opp-stat foe"><b>{foeScore}</b><span>score</span></div>
            </div>
          </div>

          <div className="fx-felt">{FeltContent()}</div>

          <div className="fx-handrow">
            <div className="fx-hand-label">
              <span className="hl-name">Your Hand</span>
              <span className="hl-hint">{handHint}</span>
              <span className="hl-stat">{myTricks} tricks · {myScore} pts</span>
            </div>
            <div className={'fx-hand-cards' + (yourTurn || swapping ? '' : ' locked')}>
              {hand.length === 0
                ? <div className="fx-hint" style={{ padding: '24px 0' }}>Your hand is played out.</div>
                : hand.map(c => {
                  const playable = swapping || (yourTurn && legalIds.has(c.id))
                  const illegal = !swapping && yourTurn && !legalIds.has(c.id)
                  return <Card key={c.id} card={c} className={playable ? 'playable' : ''} illegal={illegal}
                    onClick={playable ? () => clickHandCard(c) : undefined} />
                })}
            </div>
            {canSwap && !swapping && (
              <div className="fx-swap-row">
                <button className="fx-swap-btn" onClick={() => setSwapping(true)}>
                  Swan: swap a card with the decree
                </button>
                <button className="fx-swap-btn ghost" onClick={() => { setSwanSkipped(true); dispatch({ kind: 'keepDecree' }) }}>
                  Keep the trump
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>

          <div className="panel fx-decree">
            <div className="panel-l">The Decree · Trump</div>
            <div className="fx-decree-body">
              <Card card={s.decree} className="fx-decree-card" />
              <div className="fx-decree-meta">
                <div className="fx-trump-name">{FX.SUIT_NAME[s.trump]}</div>
                <div className="fx-trump-sub">leads the wood {SUIT_GLYPH[s.trump]}</div>
                <div className="fx-draw-n">{s.draw.length} in the draw pile</div>
              </div>
            </div>
          </div>

          <div className="panel fx-scoreboard">
            <div className="fx-sb-tot">
              <div className="sbt you"><div className="who">You</div><div className="pts">{myScore}</div></div>
              <div className="fx-target">/ {FX.TARGET}</div>
              <div className="sbt foe"><div className="who">{net.online ? 'Foe' : 'Fox'}</div><div className="pts">{foeScore}</div></div>
            </div>
            <div className="fx-tricks">
              <span>tricks won this hand</span>
              <span className="fx-tval"><b className="you">{myTricks}</b> · <b className="foe">{foeTricks}</b></span>
            </div>
            <div className="fx-sb-head"><span>H</span><span>You</span><span>{net.online ? 'Foe' : 'Fox'}</span></div>
            <div className="fx-sb-rows">
              {s.handLog.length === 0 && <div className="fx-sb-row"><span className="rd">—</span><span className="cell">no hands yet</span><span /></div>}
              {s.handLog.map(r => {
                const myR = me === 'you' ? r.you : r.ai
                const foeR = me === 'you' ? r.ai : r.you
                return (
                  <div className="fx-sb-row" key={r.hand}>
                    <span className="rd">{r.hand}</span>
                    <span className="cell"><span className="bt">{myR.tricks}t</span><span className="dl pos">+{myR.pts}</span></span>
                    <span className="cell"><span className="bt">{foeR.tricks}t</span><span className="dl pos">+{foeR.pts}</span></span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <WinModal s={s} me={me} foeName={foeName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function WinModal({ s, me, foeName, onNew }: { s: FoxState; me: Player; foeName: string; onNew: () => void }) {
  const won = s.winner === me, tie = s.winner === 'tie'
  const myScore = s.scores[me], foeScore = s.scores[me === 'you' ? 'ai' : 'you']
  return (
    <Modal
      eyebrow={tie ? 'Even at dusk' : won ? 'Keeper of the wood' : 'Lost in the trees'}
      title={tie ? 'A Tie' : won ? 'You Win' : `${foeName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {myScore}</span><span className="foe">{foeName} {foeScore}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="The Fox in the Forest" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Into the wood</button>}>
      <div className="modal-body">
        <p>Three painted suits — <b>Bells</b>, <b>Keys</b>, <b>Moons</b> — each numbered 1–11. Every hand deals you both 13 cards and flips a <b>decree</b> card whose suit becomes <i>trump</i>. You play 13 tricks.</p>
        <p><b>Tricks:</b> the leader plays a card; you must <b>follow the led suit</b> if you hold it, else play anything. Highest <i>trump</i> wins; otherwise the highest card of the led suit.</p>
        <div className="fx-legend">
          <div className="rl-item"><span className="rl-pip">1</span><b>Swan</b> — lead a 1 to swap the decree (change trump).</div>
          <div className="rl-item"><span className="rl-pip">3</span><b>Witch</b> — counts as trump for its trick.</div>
          <div className="rl-item"><span className="rl-pip">5</span><b>Treasure</b> — playing it draws a card, then discards one.</div>
          <div className="rl-item"><span className="rl-pip">7</span><b>Treasure</b> — each 7 you collect is worth +1 point.</div>
          <div className="rl-item"><span className="rl-pip">9</span><b>Charm</b> — if both follow suit, the <i>lower</i> card wins.</div>
          <div className="rl-item"><span className="rl-pip">11</span><b>Monarch</b> — leading it forces the follower's highest or lowest of the suit.</div>
        </div>
        <p><b>Scoring — win the middle:</b> by tricks won, <i>0→6</i>, <i>1–3→3</i>, <i>4–6→6</i>, <i>7–9→1</i>, <i>10–13→0</i>, plus <i>+1 per 7</i> collected. Take just enough — greed is punished. First to <b>{FX.TARGET}</b> wins.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
