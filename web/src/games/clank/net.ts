/* CLANK! — netplay adapter. Maps clank's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Seats map directly to players: seat 0 = you (the
 * original human side, moves first), seat 1 = the rival/AI. numSeats reads the real
 * player count off the state's players array so a future 3+ player state would report
 * correctly.
 *
 * Unlike a one-move-per-turn game, a clank turn is several actions: you PLAY cards from
 * your hand to pool resources, BUY cards from the Dungeon Row, MOVE your pawn (and grab
 * artifacts), then END the turn. Each is modelled as a separate kinded intent. The host
 * stays authoritative: applyIntent only acts when it's that seat's turn and the action is
 * legal, returning the input state unchanged otherwise (it never throws).
 *
 * HIDDEN INFO: a player's HAND and the ORDER of their draw DECK are private (the discard
 * pile is public). The Dungeon Row's face-down market DECK order is also secret. So
 * redactFor, for every seat OTHER than the viewer, replaces that seat's hand + draw deck
 * with face-down placeholders (keeping the counts), and always blanks the shared market
 * deck. The viewer keeps its own real hand/deck; the face-up market, discards, board,
 * health, clank, gold and the visible per-turn resource pools stay intact. A leak test
 * guards this. NOTE: clank.logic only emits useful resource pools (skill/swords/boots)
 * onto the shared state during the turn-holder's turn, so those are inherently this seat's
 * own — no cross-seat pool leak exists to redact. */

import * as CK from './logic'
import type { ClankState, CardInst, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A kinded, JSON-serializable move. Card targets travel as their stable instance id. */
export type ClankIntent =
  | { kind: 'play'; cardId: number }
  | { kind: 'buy'; marketIndex: number }
  | { kind: 'move'; room: number }
  | { kind: 'grab' }
  | { kind: 'end' }

/** A face-down placeholder hiding a card's real key (and the actual draw order). */
function hidden(): CardInst {
  return { id: -1, key: '?' }
}

export const clankAdapter: GameAdapter<ClankState, ClankIntent> = {
  makeGame: () => CK.makeGame(),
  // Real player count off the state (min 2) so a 3+ player state would report correctly.
  numSeats: s => Math.max(2, s.players.length),
  seatToMove: s => (s.winner == null ? s.turn : null), // turn (0/1) == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Out of turn or game over → no-op (never trust a guest's timing).
    if (s.winner != null || s.turn !== seat) return s
    switch (i.kind) {
      case 'play': {
        // Must be a card actually in this seat's hand.
        const p = s.players[seat]
        if (!p.hand.some(c => c.id === i.cardId)) return s
        return CK.playCard(s, i.cardId)
      }
      case 'buy': {
        // buyCard re-validates the slot, cost and turn; it no-ops on anything illegal.
        if (i.marketIndex < 0 || i.marketIndex >= s.market.length) return s
        if (s.market[i.marketIndex] == null) return s
        return CK.buyCard(s, seat as Player, i.marketIndex)
      }
      case 'move': {
        // canMove guards adjacency / boots / sword cost; move re-checks and no-ops if not.
        if (!CK.canMove(s, seat as Player, i.room)) return s
        return CK.move(s, seat as Player, i.room)
      }
      case 'grab':
        return CK.grabArtifact(s, seat as Player)
      case 'end':
        return CK.endTurn(s)
      default:
        return s
    }
  },
  aiStep: s => CK.aiTurn(s),
  // Changes on EVERY transition: actions is a monotonic counter bumped by every legal
  // action (play/buy/move/grab/end/dragon). Pair it with turn + winner for good measure.
  tickKey: s => `${s.actions}-${s.turn}-${s.winner ?? ''}`,
  // Hidden info: hide every OTHER seat's hand + draw-deck order (counts preserved) and the
  // face-down market deck. The viewing seat keeps its own real hand/deck; public discards,
  // the face-up market row, board state and resource pools are untouched.
  redactFor: (s, seat) => ({
    ...s,
    players: s.players.map((p, i) =>
      i === seat ? p : { ...p, hand: p.hand.map(hidden), deck: p.deck.map(hidden) },
    ) as ClankState['players'],
    marketDeck: s.marketDeck.map(hidden),
  }),
}
