/* SPADES — UI.
   4-player partnership trick-taking on the framework shell. You are seat 0 (south);
   your partner sits across (seat 2, north); the rival pair is West (1) and East (3).

   Two driven processes: the AI bids then plays across many tricks (useAITurn), and a
   short reveal pause after a completed trick before it's swept (a collect timer is not
   needed since playCard resolves instantly — instead we pause on a full trick via a
   derived flag). The AI acts MANY times consecutively, so useAITurn's `tick` must change
   on every AI action; we feed it the monotonically-increasing `s.ply` counter. */

import { useEffect, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as SP from './logic'
import type { Card as TCard, Seat, Suit, SpadesState } from './logic'

const SUIT_SYM: Record<Suit, string> = { C: '♣', D: '♦', H: '♥', S: '♠' }
const SUIT_COLOR: Record<Suit, string> = { C: 'black', D: 'red', H: 'red', S: 'spade' }
const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 }

function sortHand(hand: TCard[]): TCard[] {
  return hand.slice().sort((a, b) =>
    SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || b.rank - a.rank)
}

function CardView({ card, onClick, className }: { card: TCard; onClick?: () => void; className?: string }) {
  const color = SUIT_COLOR[card.suit]
  const sym = SUIT_SYM[card.suit]
  const r = SP.rankName(card.rank)
  return (
    <div className={['card', color, className || ''].join(' ')} onClick={onClick}>
      <div className="corner"><span className="rank">{r}</span><span className="suit-sym">{sym}</span></div>
      <div className="center-sym">{sym}</div>
      <div className="corner br"><span className="rank">{r}</span><span className="suit-sym">{sym}</span></div>
    </div>
  )
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#16162a" stroke="#3a3a66" strokeWidth="1.5" />
    <path d="M24 11 C24 11 14 20 14 27 a6 6 0 0 0 9 5 c0 3 -1 5 -3 6 l8 0 c-2 -1 -3 -3 -3 -6 a6 6 0 0 0 9 -5 C34 20 24 11 24 11 Z"
      fill="#ece9f5" stroke="#b6b6e0" strokeWidth="1" />
  </svg>
)

export function Spades() {
  const [s, setS] = useState<SpadesState>(() => SP.makeGame())
  const [bidSel, setBidSel] = useState<number | null>(null)
  const [showRules, setShowRules] = useState(false)
  // pause flag: when a trick is complete (lastTrick set & trick empty) we briefly show it.
  const [sweeping, setSweeping] = useState(false)

  function newGame() { setS(SP.makeGame()); setBidSel(null); setShowRules(false); setSweeping(false) }

  const yourBidTurn = s.phase === 'bidding' && s.turn === 0
  const yourPlayTurn = s.phase === 'playing' && s.turn === 0 && s.trick.length < 4
  const aiActive = s.winner == null && !sweeping && s.turn !== 0 &&
    (s.phase === 'bidding' || (s.phase === 'playing' && s.trick.length < 4))

  // Drive the AI: bids then plays, MANY consecutive actions. tick = s.ply changes every action.
  useAITurn(aiActive, () => setS(p => SP.aiStep(p)), { delayMs: 620, tick: s.ply })

  // When a trick just completed (4 cards were shown then swept by playCard), show the
  // final card set briefly. We detect "a fresh trick just resolved" via lastTrick + empty trick.
  // playCard clears trick immediately, so we instead hold a reveal when the previous render
  // had 3 cards and the human/AI played the 4th. Simpler: pause whenever lastTrick changes.
  useEffect(() => {
    if (s.lastTrick && s.phase !== 'done') {
      setSweeping(true)
      const id = setTimeout(() => setSweeping(false), 900)
      return () => clearTimeout(id)
    }
  }, [s.lastTrick])

  useEffect(() => { setBidSel(null) }, [s.handNo, s.phase])
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const legal = yourPlayTurn && !sweeping ? SP.legalPlays(s, 0) : []
  const legalIds = new Set(legal.map(c => c.id))

  function clickCard(c: TCard) {
    if (!yourPlayTurn || sweeping || !legalIds.has(c.id)) return
    setS(SP.playCard(s, 0, c))
  }
  function confirmBid() { if (bidSel != null) setS(SP.placeBid(s, 0, bidSel)) }

  // ===== banner =====
  let banner = '', bk = ''
  if (s.winner != null) {
    if (s.winner === 0) { bk = 'win'; banner = 'Your team takes the table — you win' }
    else { bk = 'lose'; banner = 'The rival pair runs out the score' }
  } else if (s.phase === 'bidding') {
    if (yourBidTurn) { bk = 'you'; banner = 'Bid the tricks you expect to take' }
    else { bk = 'foe'; banner = `${SP.SEAT_NAME[s.turn]} is bidding…` }
  } else if (sweeping && s.lastTrick) {
    const w = s.lastTrick.winner
    bk = SP.teamOf(w) === 0 ? 'you' : 'foe'
    banner = `${w === 0 ? 'You take' : SP.SEAT_NAME[w] + ' takes'} the trick`
  } else if (yourPlayTurn) {
    bk = 'you'; banner = s.trick.length === 0 ? 'Your lead' : 'Your turn — follow suit'
  } else {
    bk = 'foe'; banner = `${SP.SEAT_NAME[s.turn]} is playing…`
  }

  // current trick map by seat
  const trickBySeat: Record<number, TCard | null> = { 0: null, 1: null, 2: null, 3: null }
  const showTrick = sweeping && s.lastTrick ? s.lastTrick.cards : s.trick
  for (const t of showTrick) trickBySeat[t.seat] = t.card
  const winSeat = sweeping && s.lastTrick ? s.lastTrick.winner : -1

  function Seat({ seat }: { seat: Seat }) {
    const team = SP.teamOf(seat) === 0 ? 'teamA' : 'teamB'
    const active = s.winner == null && s.turn === seat && !sweeping
    const n = s.hands[seat].length
    return (
      <div className={['seat-plate', 'seat-' + ['south', 'west', 'north', 'east'][seat]].join(' ')}>
        <div className={['seat-id', team, active ? 'active' : ''].join(' ')}>
          <span className={['seat-name', team].join(' ')}>{SP.SEAT_NAME[seat]}{seat === 0 ? '' : ''}</span>
          <span className="seat-meta">
            bid <b>{s.bids[seat] == null ? '—' : (s.bids[seat] === 0 ? 'NIL' : s.bids[seat])}</b>
            &nbsp;·&nbsp; won <b>{s.tricksWon[seat]}</b>
          </span>
        </div>
        {seat !== 0 && (
          <div className="seat-back-row">
            {Array.from({ length: Math.min(n, 13) }, (_, i) => <div className="minicard" key={i} />)}
          </div>
        )}
      </div>
    )
  }

  const hand = sortHand(s.hands[0])
  const cA = SP.teamContract(s, 0), cB = SP.teamContract(s, 1)
  const tA = s.tricksWon[0] + s.tricksWon[2], tB = s.tricksWon[1] + s.tricksWon[3]

  function FeltCenter() {
    if (s.phase === 'bidding') {
      return <div className="felt-hint">Each player bids the tricks they expect. Your team's bids combine into one contract.</div>
    }
    if (s.trick.length === 0 && !(sweeping && s.lastTrick)) {
      return <div className="felt-hint">{SP.SEAT_NAME[s.leader]} {s.leader === 0 ? 'lead' : 'leads'} this trick{!s.spadesBroken ? ' · spades not broken' : ''}</div>
    }
    return (
      <div className="center-cross">
        {([0, 1, 2, 3] as Seat[]).map(seat => {
          const c = trickBySeat[seat]
          if (!c) return null
          return (
            <div key={seat} className={['tslot', 'p' + seat, seat === winSeat ? 'win' : ''].join(' ')}>
              <CardView card={c} className="played-in" />
              <span className="tslot-who">{seat === 0 ? 'You' : SP.SEAT_NAME[seat]}{seat === winSeat ? ' · won' : ''}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Spades · partnership trick-taking"
        title="Spades"
        subtitle="bid your tricks, partner up across the table, and let the black suit rule"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Hand ${s.handNo} · to ${SP.TARGET}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="tablecol">
          <div className="felt">
            <Seat seat={2} />
            <Seat seat={1} />
            <FeltCenter />
            <Seat seat={3} />
            <Seat seat={0} />
          </div>

          <div className="handrow">
            <div className="hand-label">
              <span className="hl-name">Your Hand</span>
              <span className="hl-hint">
                {yourPlayTurn && !sweeping
                  ? (s.trick.length === 0 ? 'lead any card (no spades until broken)' : 'follow suit if you can')
                  : s.phase === 'bidding' ? 'study your hand, then bid' : '—'}
              </span>
              <span className="hl-stat">
                bid {s.bids[0] == null ? '—' : (s.bids[0] === 0 ? 'NIL' : s.bids[0])} · won {s.tricksWon[0]}
              </span>
            </div>
            <div className={'hand-cards' + (yourPlayTurn && !sweeping ? '' : ' locked')}>
              {hand.length === 0
                ? <div className="felt-hint" style={{ padding: '28px 0' }}>Hand played out.</div>
                : hand.map(c => {
                  const playable = yourPlayTurn && !sweeping && legalIds.has(c.id)
                  const illegal = yourPlayTurn && !sweeping && !legalIds.has(c.id)
                  return <CardView key={c.id} card={c}
                    className={(playable ? 'playable' : '') + (illegal ? ' illegal' : '')}
                    onClick={playable ? () => clickCard(c) : undefined} />
                })}
            </div>
          </div>
        </div>

        <div className="side">
          {yourBidTurn ? (
            <div className="panel bidbox">
              <div className="bid-prompt">How many tricks for <b>your team</b>?</div>
              <div className="bid-grid">
                {Array.from({ length: 14 }, (_, i) => (
                  <button key={i} className={'bid-chip' + (i === 0 ? ' nil' : '') + (bidSel === i ? ' sel' : '')}
                    onClick={() => setBidSel(i)}>{i === 0 ? 'N' : i}</button>
                ))}
              </div>
              <button className="bid-confirm" disabled={bidSel == null} onClick={confirmBid}>
                {bidSel == null ? 'Choose your bid'
                  : bidSel === 0 ? 'Go Nil (take zero tricks)'
                    : `Bid ${bidSel} trick${bidSel === 1 ? '' : 's'}`}
              </button>
            </div>
          ) : (
            <div className="panel bidbox">
              <div className="panel-l">This hand</div>
              <div className="contracts">
                <div className="contract-card teamA">
                  <div className="cc-who teamA">Your Team</div>
                  <div className="cc-val">
                    <span className={s.phase !== 'bidding' && tA >= cA && cA > 0 ? 'made' : (s.phase !== 'bidding' && cA > 0 ? '' : '')}>{tA}</span> / {cA}
                  </div>
                  <div className="cc-sub">won / bid</div>
                  <div className="cc-bids">{seatBidStr(s, 0)} &amp; {seatBidStr(s, 2)}</div>
                </div>
                <div className="contract-card teamB">
                  <div className="cc-who teamB">Rivals</div>
                  <div className="cc-val"><span>{tB}</span> / {cB}</div>
                  <div className="cc-sub">won / bid</div>
                  <div className="cc-bids">{seatBidStr(s, 1)} &amp; {seatBidStr(s, 3)}</div>
                </div>
              </div>
            </div>
          )}

          <div className="panel scoreboard">
            <div className="sb-tot">
              <div className="sbt teamA">
                <div className="who">Your Team</div>
                <div className="pts">{s.scores[0]}</div>
                <div className="bagn">{s.bags[0]} bag{s.bags[0] === 1 ? '' : 's'}</div>
              </div>
              <div className="sbt teamB">
                <div className="who">Rivals</div>
                <div className="pts">{s.scores[1]}</div>
                <div className="bagn">{s.bags[1]} bag{s.bags[1] === 1 ? '' : 's'}</div>
              </div>
            </div>
            <div className="sb-head"><span>H</span><span>You</span><span>Rivals</span></div>
            <div className="sb-rows">
              {s.handLog.length === 0 && <div className="sb-row"><span className="rd">—</span><span className="sb-cell">no hands yet</span><span /></div>}
              {s.handLog.map(h => (
                <div className="sb-row" key={h.handNo}>
                  <span className="rd">{h.handNo}</span>
                  <span className="sb-cell"><span className="bt">{h.tricks[0]}/{h.contract[0]}</span><span className={'dl ' + (h.delta[0] >= 0 ? 'pos' : 'neg')}>{h.delta[0] >= 0 ? '+' : ''}{h.delta[0]}</span></span>
                  <span className="sb-cell"><span className="bt">{h.tricks[1]}/{h.contract[1]}</span><span className={'dl ' + (h.delta[1] >= 0 ? 'pos' : 'neg')}>{h.delta[1] >= 0 ? '+' : ''}{h.delta[1]}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GameShell>

      {s.winner != null && <WinModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function seatBidStr(s: SpadesState, seat: Seat): string {
  const b = s.bids[seat]
  const name = seat === 0 ? 'You' : SP.SEAT_NAME[seat]
  return `${name} ${b == null ? '—' : (b === 0 ? 'nil' : b)}`
}

function WinModal({ s, onNew }: { s: SpadesState; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? 'Hand and table' : 'Outbid and outplayed'}
      title={won ? 'Your Team Wins' : 'Rivals Win'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Deal again</button>}
    >
      <div className="finalsc">
        <span className="fs teamA">Your Team {s.scores[0]}</span>
        <span className="fs teamB">Rivals {s.scores[1]}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Spades" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Deal me in</button>}>
      <div className="modal-body">
        <p>Four players, two partnerships. <b>You</b> (south) team with <b>Partner</b> across the table; <b>West</b> and <b>East</b> are the rival pair. Everyone is dealt 13 cards. <b>Spades are always trump.</b></p>
        <p><b>Bidding:</b> each player bids how many tricks they'll take. Your two bids combine into one team contract. A bid of <b>Nil (0)</b> is a solo gamble — score big for taking zero tricks, lose big if you take any.</p>
        <div className="rules-legend">
          <div className="rl-item"><span className="rl-swatch" style={{ background: '#1c1b24' }} />Spades — trump; can't be led until "broken" by a discard</div>
          <div className="rl-item"><span className="rl-swatch" style={{ background: '#c23a3a' }} />Hearts &amp; Diamonds, plus Clubs — follow the led suit if you hold it</div>
        </div>
        <p><b>Play:</b> highest spade wins the trick; with no spade, the highest card of the led suit wins. The winner leads next.</p>
        <p><b>Scoring:</b> make your contract for <i>10 × bid</i>, +1 per overtrick (a "bag"). Collect <i>10 bags</i> and lose <i>100</i>. Miss the contract and lose <i>10 × bid</i>. A made Nil is <i>+100</i>, a failed Nil <i>-100</i>. First team to <b>500</b> wins.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
