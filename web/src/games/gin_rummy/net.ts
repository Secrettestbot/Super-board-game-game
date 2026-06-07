/* GIN RUMMY — netplay adapter. Maps gin rummy's pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Seats map to the two sides:
 * seat 0 = 'you' (the original human side, draws first), seat 1 = 'ai' (the rival).
 *
 * HIDDEN INFO: each player's HAND is private and the STOCK (draw pile) order is
 * secret — only the top of the discard pile is public. redactFor therefore, while a
 * hand is being played, blanks the OTHER seat's hand cards (replacing each with a
 * face-down placeholder, so the count is still visible) and replaces the whole stock
 * with face-down placeholders (count visible, order/identity hidden). When the round
 * is over (roundOver / gameOver) every hand is revealed so the scoring display can
 * show both players' final hands — this matches the solo UI. A leak test guards the
 * during-play redaction so no secret card id/rank/suit ever crosses the wire.
 *
 * A turn is: DRAW (top of stock or top of discard) then DISCARD one card, optionally
 * knocking/going gin on the discard. Intents are validated against the live phase and
 * hand so the host never trusts a guest-supplied move. */

import * as G from './logic'
import type { GinState, Card, Who } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Wire intent: draw from a pile, discard a card (optionally knocking/gin), or — once a
 * round has ended (but the match has not) — deal the next hand. */
export type GinIntent =
  | { kind: 'draw'; source: 'stock' | 'discard' }
  | { kind: 'discard'; cardId: number }
  | { kind: 'knock'; cardId: number }
  | { kind: 'gin'; cardId: number }
  | { kind: 'next' }

/** A neutral placeholder that hides a card's real id/rank/suit from other seats. */
function hidden(): Card {
  return { id: -1, rank: -1 as G.Rank, suit: '?' as Card['suit'] }
}

const seatOf = (w: Who): number => (w === 'you' ? 0 : 1)
const whoOf = (seat: number): Who => (seat === 0 ? 'you' : 'ai')

export const ginRummyAdapter: GameAdapter<GinState, GinIntent> = {
  makeGame: () => G.makeGame(),
  numSeats: () => 2,
  // 'you' -> 0, 'ai' -> 1. Once the MATCH is over nobody moves. Between rounds
  // (roundOver) seat 0 "moves" so it can deal the next hand via a {kind:'next'} intent
  // (no AI fires there — aiSeat is 0 == a controlled seat — so a human clicks Continue).
  seatToMove: s => {
    if (s.winner != null || s.phase === 'gameOver') return null
    if (s.phase === 'roundOver') return 0
    return seatOf(s.turn)
  },
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.phase === 'gameOver') return s

    // Between rounds: only the {kind:'next'} intent from seat 0 deals the next hand.
    if (s.phase === 'roundOver') {
      if (i.kind === 'next' && seat === 0) return G.nextRound(s)
      return s
    }
    if (i.kind === 'next') return s
    if (seatOf(s.turn) !== seat) return s

    if (i.kind === 'draw') {
      if (s.phase !== 'draw') return s
      if (i.source === 'stock') {
        if (s.stock.length === 0) return s
        return G.drawStock(s)
      }
      if (s.discard.length === 0) return s
      return G.drawDiscard(s)
    }

    // discard / knock / gin all require the discard phase and a card in hand.
    if (s.phase !== 'discard') return s
    const hand = seat === 0 ? s.you : s.ai
    if (!hand.some(c => c.id === i.cardId)) return s

    const knock = i.kind === 'knock' || i.kind === 'gin'
    if (knock) {
      // Only allow knocking when it's actually legal after the discard.
      const rest = hand.filter(c => c.id !== i.cardId)
      if (G.deadwoodOf(rest) > 10) return s
    }
    return G.discard(s, i.cardId, knock)
  },
  aiStep: s => G.aiTurn(s),
  // Changes on EVERY transition: step bumps on every draw/discard/knock and the AI pass.
  tickKey: s => `${s.step}-${s.turn}-${s.phase}-${s.winner ?? ''}`,
  // Hidden info: while a hand is in play, blank the OTHER seat's hand and the whole
  // face-down stock (counts preserved). At round end reveal everything for scoring.
  redactFor: (s, seat) => {
    if (s.phase === 'roundOver' || s.phase === 'gameOver' || s.winner != null) return s
    const me = whoOf(seat)
    return {
      ...s,
      you: me === 'you' ? s.you : s.you.map(hidden),
      ai: me === 'ai' ? s.ai : s.ai.map(hidden),
      stock: s.stock.map(hidden),
    }
  },
}
