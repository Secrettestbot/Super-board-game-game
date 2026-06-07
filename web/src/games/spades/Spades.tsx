/* SPADES — UI.
   4-player partnership trick-taking on the framework shell. Online-capable via
   useGameSession(spadesAdapter): the hook drives the AI for any empty seat (no local
   useAITurn) and, when online, redacts every other seat's private hand so it never
   reaches you.

   Everything is rendered relative to mySeat. Your hand is hands[mySeat]; isMyTurn gates
   both bidding and playing. The table is rotated so YOU always sit south, your partner
   (seat mySeat+2) sits north across from you, and the two opponents sit west / east.
   Partnership scores stay "your team" vs "the rivals" regardless of which seat you hold.
   When online, the human seats are labelled "You" / "Player N" and the AI seats are
   left as their table names. */

import { useEffect, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { spadesAdapter } from './net'
import * as SP from './logic'
import type { Card as TCard, Seat, Suit, SpadesState } from './logic'
import type { OnlineController } from '../../net/useGameSession'

const SUIT_SYM: Record<Suit, string> = { C: '♣', D: '♦', H: '♥', S: '♠' }
const SUIT_COLOR: Record<Suit, string> = { C: 'black', D: 'red', H: 'red', S: 'spade' }
const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 }

/** Visual ring positions, index 0..3 = south/west/north/east. */
const RING = ['south', 'west', 'north', 'east']

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
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(spadesAdapter)
  const me = mySeat as Seat
  const [bidSel, setBidSel] = useState<number | null>(null)
  const [showRules, setShowRules] = useState(false)
  // pause flag: when a trick is complete (lastTrick set & trick empty) we briefly show it.
  const [sweeping, setSweeping] = useState(false)

  function newGame() { netNew(); setBidSel(null); setShowRules(false); setSweeping(false) }

  // ----- seat-relative helpers -------------------------------------------------
  const myTeam = SP.teamOf(me)
  // Ring position of a seat relative to me (0 = south = you, 2 = north = partner).
  const ringOf = (seat: Seat) => (seat - me + 4) % 4
  // Display name for a seat. Online: human seats become You / Player N; AI keep their
  // table name. Solo: the original SEAT_NAME labels (relative to mySeat = 0).
  function nameOf(seat: Seat): string {
    if (seat === me) return 'You'
    if (net.online) {
      const info = net.seats[seat]
      if (info && (info.kind === 'host' || info.kind === 'guest')) {
        return seat === ((me + 2) % 4) ? 'Partner' : `Player ${seat + 1}`
      }
      // AI / open seat
      return seat === ((me + 2) % 4) ? 'Partner' : 'Opponent'
    }
    return SP.SEAT_NAME[seat]
  }

  const yourBidTurn = s.phase === 'bidding' && isMyTurn
  const yourPlayTurn = s.phase === 'playing' && isMyTurn && s.trick.length < 4

  // When a trick just completed, show the final card set briefly before it's swept.
  useEffect(() => {
    if (s.lastTrick && s.phase !== 'done') {
      setSweeping(true)
      const id = setTimeout(() => setSweeping(false), 900)
      return () => clearTimeout(id)
    }
  }, [s.lastTrick])

  useEffect(() => { setBidSel(null) }, [s.handNo, s.phase])
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const legal = yourPlayTurn && !sweeping ? SP.legalPlays(s, me) : []
  const legalIds = new Set(legal.map(c => c.id))

  function clickCard(c: TCard) {
    if (!yourPlayTurn || sweeping || !legalIds.has(c.id)) return
    dispatch({ kind: 'play', cardId: c.id })
  }
  function confirmBid() { if (bidSel != null) dispatch({ kind: 'bid', n: bidSel }) }

  const over = s.winner != null
  const youWon = s.winner === myTeam

  // ===== banner =====
  let banner = '', bk = ''
  if (over) {
    if (youWon) { bk = 'win'; banner = 'Your team takes the table — you win' }
    else { bk = 'lose'; banner = 'The rival pair runs out the score' }
  } else if (s.phase === 'bidding') {
    if (yourBidTurn) { bk = 'you'; banner = 'Bid the tricks you expect to take' }
    else { bk = 'foe'; banner = `${nameOf(s.turn)} is bidding…` }
  } else if (sweeping && s.lastTrick) {
    const w = s.lastTrick.winner
    bk = SP.teamOf(w) === myTeam ? 'you' : 'foe'
    banner = `${w === me ? 'You take' : nameOf(w) + ' takes'} the trick`
  } else if (yourPlayTurn) {
    bk = 'you'; banner = s.trick.length === 0 ? 'Your lead' : 'Your turn — follow suit'
  } else {
    bk = 'foe'; banner = `${nameOf(s.turn)} is playing…`
  }

  // current trick map by seat
  const trickBySeat: Record<number, TCard | null> = { 0: null, 1: null, 2: null, 3: null }
  const showTrick = sweeping && s.lastTrick ? s.lastTrick.cards : s.trick
  for (const t of showTrick) trickBySeat[t.seat] = t.card
  const winSeat = sweeping && s.lastTrick ? s.lastTrick.winner : -1

  function SeatPlate({ seat }: { seat: Seat }) {
    const team = SP.teamOf(seat) === myTeam ? 'teamA' : 'teamB'
    const active = !over && s.turn === seat && !sweeping
    const n = s.hands[seat].length
    return (
      <div className={['seat-plate', 'seat-' + RING[ringOf(seat)]].join(' ')}>
        <div className={['seat-id', team, active ? 'active' : ''].join(' ')}>
          <span className={['seat-name', team].join(' ')}>{nameOf(seat)}</span>
          <span className="seat-meta">
            bid <b>{s.bids[seat] == null ? '—' : (s.bids[seat] === 0 ? 'NIL' : s.bids[seat])}</b>
            &nbsp;·&nbsp; won <b>{s.tricksWon[seat]}</b>
          </span>
        </div>
        {seat !== me && (
          <div className="seat-back-row">
            {Array.from({ length: Math.min(n, 13) }, (_, i) => <div className="minicard" key={i} />)}
          </div>
        )}
      </div>
    )
  }

  const hand = sortHand(s.hands[me] ?? [])
  const cA = SP.teamContract(s, myTeam)
  const cB = SP.teamContract(s, (1 - myTeam) as SP.Team)
  const tA = s.tricksWon[me] + s.tricksWon[(me + 2) % 4]
  const rivalTricks = s.tricksWon[(me + 1) % 4] + s.tricksWon[(me + 3) % 4]

  function FeltCenter() {
    if (s.phase === 'bidding') {
      return <div className="felt-hint">Each player bids the tricks they expect. Your team's bids combine into one contract.</div>
    }
    if (s.trick.length === 0 && !(sweeping && s.lastTrick)) {
      return <div className="felt-hint">{nameOf(s.leader)} {s.leader === me ? 'lead' : 'leads'} this trick{!s.spadesBroken ? ' · spades not broken' : ''}</div>
    }
    return (
      <div className="center-cross">
        {([0, 1, 2, 3] as Seat[]).map(seat => {
          const c = trickBySeat[seat]
          if (!c) return null
          return (
            <div key={seat} className={['tslot', 'p' + ringOf(seat), seat === winSeat ? 'win' : ''].join(' ')}>
              <CardView card={c} className="played-in" />
              <span className="tslot-who">{seat === me ? 'You' : nameOf(seat)}{seat === winSeat ? ' · won' : ''}</span>
            </div>
          )
        })}
      </div>
    )
  }

  const partner: Seat = ((me + 2) % 4) as Seat
  const oppL: Seat = ((me + 1) % 4) as Seat
  const oppR: Seat = ((me + 3) % 4) as Seat

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
            <SeatPlate seat={partner} />
            <SeatPlate seat={oppL} />
            <FeltCenter />
            <SeatPlate seat={oppR} />
            <SeatPlate seat={me} />
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
                bid {s.bids[me] == null ? '—' : (s.bids[me] === 0 ? 'NIL' : s.bids[me])} · won {s.tricksWon[me]}
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
          <OnlineBar net={net} />

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
                    <span className={s.phase !== 'bidding' && tA >= cA && cA > 0 ? 'made' : ''}>{tA}</span> / {cA}
                  </div>
                  <div className="cc-sub">won / bid</div>
                  <div className="cc-bids">{seatBidStr(s, me, nameOf)} &amp; {seatBidStr(s, partner, nameOf)}</div>
                </div>
                <div className="contract-card teamB">
                  <div className="cc-who teamB">Rivals</div>
                  <div className="cc-val"><span>{rivalTricks}</span> / {cB}</div>
                  <div className="cc-sub">won / bid</div>
                  <div className="cc-bids">{seatBidStr(s, oppL, nameOf)} &amp; {seatBidStr(s, oppR, nameOf)}</div>
                </div>
              </div>
            </div>
          )}

          <div className="panel scoreboard">
            <div className="sb-tot">
              <div className="sbt teamA">
                <div className="who">Your Team</div>
                <div className="pts">{s.scores[myTeam]}</div>
                <div className="bagn">{s.bags[myTeam]} bag{s.bags[myTeam] === 1 ? '' : 's'}</div>
              </div>
              <div className="sbt teamB">
                <div className="who">Rivals</div>
                <div className="pts">{s.scores[1 - myTeam]}</div>
                <div className="bagn">{s.bags[1 - myTeam]} bag{s.bags[1 - myTeam] === 1 ? '' : 's'}</div>
              </div>
            </div>
            <div className="sb-head"><span>H</span><span>You</span><span>Rivals</span></div>
            <div className="sb-rows">
              {s.handLog.length === 0 && <div className="sb-row"><span className="rd">—</span><span className="sb-cell">no hands yet</span><span /></div>}
              {s.handLog.map(h => (
                <div className="sb-row" key={h.handNo}>
                  <span className="rd">{h.handNo}</span>
                  <span className="sb-cell"><span className="bt">{h.tricks[myTeam]}/{h.contract[myTeam]}</span><span className={'dl ' + (h.delta[myTeam] >= 0 ? 'pos' : 'neg')}>{h.delta[myTeam] >= 0 ? '+' : ''}{h.delta[myTeam]}</span></span>
                  <span className="sb-cell"><span className="bt">{h.tricks[1 - myTeam]}/{h.contract[1 - myTeam]}</span><span className={'dl ' + (h.delta[1 - myTeam] >= 0 ? 'pos' : 'neg')}>{h.delta[1 - myTeam] >= 0 ? '+' : ''}{h.delta[1 - myTeam]}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GameShell>

      {over && <WinModal s={s} youWon={youWon} myTeam={myTeam} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function seatBidStr(s: SpadesState, seat: Seat, nameOf: (seat: Seat) => string): string {
  const b = s.bids[seat]
  return `${nameOf(seat)} ${b == null ? '—' : (b === 0 ? 'nil' : b)}`
}

function WinModal({ s, youWon, myTeam, onNew }: { s: SpadesState; youWon: boolean; myTeam: SP.Team; onNew: () => void }) {
  return (
    <Modal
      eyebrow={youWon ? 'Hand and table' : 'Outbid and outplayed'}
      title={youWon ? 'Your Team Wins' : 'Rivals Win'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Deal again</button>}
    >
      <div className="finalsc">
        <span className="fs teamA">Your Team {s.scores[myTeam]}</span>
        <span className="fs teamB">Rivals {s.scores[1 - myTeam]}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Spades" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Deal me in</button>}>
      <div className="modal-body">
        <p>Four players, two partnerships. <b>You</b> team with your <b>Partner</b> across the table; the other pair are your rivals. Everyone is dealt 13 cards. <b>Spades are always trump.</b></p>
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
