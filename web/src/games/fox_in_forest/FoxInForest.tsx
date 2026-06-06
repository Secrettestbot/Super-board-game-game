/* THE FOX IN THE FOREST — UI (built for this codebase).
   A storybook trick-taking duel on the framework shell. Three painted suits, an ornate
   decree card setting trump, and odd-card powers. Two timers: the AI's play step
   (useAITurn) and the post-trick reveal pause (a collect timer), mirroring Skull King. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
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
  const [s, setS] = useState<FoxState>(() => FX.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [swanSkipped, setSwanSkipped] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(FX.makeGame()); setShowRules(false); setSwapping(false); setSwanSkipped(false) }

  // While the human has led a 1 (and hasn't declined), hold the fox so the Swan-swap
  // prompt can be answered.
  const youSwanLead = FX.canSwapDecree(s, 'you') && !swanSkipped
  // AI plays on a timer; re-arm on trick length + pending changes.
  useAITurn(
    s.phase === 'play' && s.turn === 'ai' && !s.pending && !s.winner && !youSwanLead,
    () => setS(p => FX.aiStep(p)),
    { delayMs: 700, tick: `${s.trick.length}-${s.pending ? 1 : 0}-${s.hand}` },
  )
  // collect a completed trick after a reveal pause
  useEffect(() => {
    if (s.pending) {
      const id = setTimeout(() => setS(p => FX.collectTrick(p)), 1000)
      return () => clearTimeout(id)
    }
  }, [s.pending, s.hand])

  // The fox never swaps the decree (it simply plays its 1); only the human is prompted.
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])
  useEffect(() => { setSwapping(false); setSwanSkipped(false) }, [s.hand, s.trick])
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setShowRules(false); setSwapping(false) } })

  const yourTurn = s.phase === 'play' && s.turn === 'you' && !s.pending && !s.winner
  const led = s.trick.length ? s.trick[0].card : null
  const legal = yourTurn ? FX.legalPlays(s.hands.you, led, s.trump) : []
  const legalIds = new Set(legal.map(c => c.id))
  const canSwap = youSwanLead

  function clickHandCard(c: TCard) {
    if (swapping) { setS(FX.swapDecree(s, 'you', c.id)); setSwapping(false); return }
    if (!yourTurn || !legalIds.has(c.id)) return
    setS(FX.playCard(s, 'you', c.id))
  }

  // ===== banner =====
  let banner: string, bk = ''
  if (s.winner) {
    if (s.winner === 'you') { bk = 'win'; banner = 'You win the wood — the fox bows out' }
    else if (s.winner === 'ai') { bk = 'lose'; banner = 'The fox outfoxes you' }
    else { bk = ''; banner = 'A tie at the forest’s edge' }
  } else if (s.phase === 'handEnd') { bk = ''; banner = `Hand ${s.hand} settled` }
  else if (swapping) { bk = 'you'; banner = 'Swan’s gift — pick a card to swap with the decree' }
  else if (s.pending) {
    const w = s.pending.winner
    bk = w === 'you' ? 'you' : 'foe'
    banner = `${w === 'you' ? 'You take' : 'The fox takes'} the trick`
  } else if (yourTurn) {
    bk = 'you'
    banner = s.trick.length === 0 ? 'Your turn — lead a card' : 'Your turn — follow suit'
  } else { bk = 'foe'; banner = 'The fox is deciding…' }

  // ===== felt content =====
  function FeltContent() {
    if (s.phase === 'handEnd' && !s.winner) {
      const last = s.handLog[s.handLog.length - 1]
      return (
        <div className="fx-handend">
          <div className="fx-he-title">Hand {last.hand} settled</div>
          <div className="fx-he-row">
            <span className="you">You · {last.you.tricks} tricks → <b>+{last.you.pts}</b>{last.you.sevens ? ` (${last.you.sevens}×7)` : ''}</span>
            <span className="foe">Fox · {last.ai.tricks} tricks → <b>+{last.ai.pts}</b>{last.ai.sevens ? ` (${last.ai.sevens}×7)` : ''}</span>
          </div>
          <button className="fx-continue" onClick={() => setS(FX.nextHand(s))}>Deal hand {s.hand + 1}</button>
        </div>
      )
    }
    if (s.trick.length === 0) {
      return <div className="fx-hint">{s.leader === 'you' ? 'You lead this trick' : 'The fox leads this trick'}</div>
    }
    const winner = s.pending ? s.pending.winner : null
    return (
      <div className="fx-trick">
        {s.trick.map((tk) => (
          <div key={tk.card.id} className={'fx-slot' + (winner === tk.player ? ' win' : '')}>
            <Card card={tk.card} className="played-in" />
            <span className="fx-slot-who">{tk.player === 'you' ? 'You' : 'Fox'}{winner === tk.player ? ' · won' : ''}</span>
          </div>
        ))}
        {s.trick.length === 1 && !s.pending && (
          <div className="fx-slot">
            <div className="fx-empty" />
            <span className="fx-slot-who">{s.turn === 'you' ? 'You' : 'Fox'}</span>
          </div>
        )}
      </div>
    )
  }

  const hand = sortHand(s.hands.you)
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
              <span className="fx-opp-name">The Fox</span>
              <span className="fx-opp-meta">{s.hands.ai.length} card{s.hands.ai.length === 1 ? '' : 's'} in paw</span>
            </div>
            <div className="fx-opp-hand">
              {s.hands.ai.map((_c, i) => <div className="fx-cardback" key={i} />)}
            </div>
            <div className="fx-opp-tag">
              <div className="fx-opp-stat foe"><b>{s.tricksWon.ai}</b><span>tricks</span></div>
              <div className="fx-opp-stat foe"><b>{s.scores.ai}</b><span>score</span></div>
            </div>
          </div>

          <div className="fx-felt">{FeltContent()}</div>

          <div className="fx-handrow">
            <div className="fx-hand-label">
              <span className="hl-name">Your Hand</span>
              <span className="hl-hint">{handHint}</span>
              <span className="hl-stat">{s.tricksWon.you} tricks · {s.scores.you} pts</span>
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
                <button className="fx-swap-btn ghost" onClick={() => setSwanSkipped(true)}>
                  Keep the trump
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="side">
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
              <div className="sbt you"><div className="who">You</div><div className="pts">{s.scores.you}</div></div>
              <div className="fx-target">/ {FX.TARGET}</div>
              <div className="sbt foe"><div className="who">Fox</div><div className="pts">{s.scores.ai}</div></div>
            </div>
            <div className="fx-tricks">
              <span>tricks won this hand</span>
              <span className="fx-tval"><b className="you">{s.tricksWon.you}</b> · <b className="foe">{s.tricksWon.ai}</b></span>
            </div>
            <div className="fx-sb-head"><span>H</span><span>You</span><span>Fox</span></div>
            <div className="fx-sb-rows">
              {s.handLog.length === 0 && <div className="fx-sb-row"><span className="rd">—</span><span className="cell">no hands yet</span><span /></div>}
              {s.handLog.map(r => (
                <div className="fx-sb-row" key={r.hand}>
                  <span className="rd">{r.hand}</span>
                  <span className="cell"><span className="bt">{r.you.tricks}t</span><span className="dl pos">+{r.you.pts}</span></span>
                  <span className="cell"><span className="bt">{r.ai.tricks}t</span><span className="dl pos">+{r.ai.pts}</span></span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <WinModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function WinModal({ s, onNew }: { s: FoxState; onNew: () => void }) {
  const won = s.winner === 'you', tie = s.winner === 'tie'
  return (
    <Modal
      eyebrow={tie ? 'Even at dusk' : won ? 'Keeper of the wood' : 'Lost in the trees'}
      title={tie ? 'A Tie' : won ? 'You Win' : 'The Fox Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {s.scores.you}</span><span className="foe">Fox {s.scores.ai}</span></div>
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
