/* STAR REALMS — netplay adapter. Maps star_realms' pure logic onto the uniform
   GameAdapter so useGameSession can host/join it. Seats map directly to players:
   seat 0 = you (the original human side, moves first), seat 1 = the rival.

   A Star Realms turn is MULTIPLE actions by the same player: play cards, buy from the
   trade row, attack, then end turn — the seat-to-move only changes on endTurn. So the
   intent is a small tagged union and `tickKey` keys off the monotonic `actions` counter
   (every legal action bumps it) so the AI timer re-arms after each step.

   HIDDEN INFO:
     - each player's HAND is private (the opponent must not see your cards),
     - each player's draw DECK order is secret (face-down; only the count is public),
     - the shared trade DECK is face-down too (only its count is public).
   The trade ROW (5 face-up market cards), the explorer pile, both DISCARD piles, bases
   in play, authority, trade/combat pools and the log are all public.

   redactFor therefore: blanks the OTHER seat's hand, blanks BOTH players' draw decks, and
   blanks the shared trade deck — replacing each hidden card with a neutral placeholder that
   keeps the array length (so counts stay correct) but carries no real key/id. A leak test
   guards that none of the opponent's real card ids/keys cross the wire. */

import * as SR from './logic'
import type { StarRealmsState, CardInst, PlayerState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Intents a seat can submit during its turn. JSON-serializable plain objects. */
export type StarRealmsIntent =
  | { kind: 'play'; cardId: number }
  | { kind: 'playAll' }
  | { kind: 'buy'; cardId: number | 'explorer' }
  | { kind: 'attack'; target: 'face' | number }
  | { kind: 'endTurn' }

/** A neutral placeholder hiding a card's real key/id from a seat that may not see it. */
const HIDDEN_CARD: CardInst = { id: -1, key: 'hidden' }
const hide = (cards: CardInst[]): CardInst[] => cards.map(() => ({ ...HIDDEN_CARD }))

export const starRealmsAdapter: GameAdapter<StarRealmsState, StarRealmsIntent> = {
  makeGame: () => SR.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null ? s.turn : null), // turn (0/1) == seat index
  isOver: s => s.winner != null,

  applyIntent: (s, seat, intent) => {
    // Out of turn / game over: return the input state UNCHANGED (never throw).
    if (s.winner != null || s.turn !== seat) return s
    switch (intent.kind) {
      case 'play': {
        // The card must be in this seat's own live hand.
        if (!s.players[seat].hand.some(c => c.id === intent.cardId)) return s
        return SR.playCard(s, intent.cardId)
      }
      case 'playAll':
        if (s.players[seat].hand.length === 0) return s
        return SR.playAll(s)
      case 'buy': {
        if (intent.cardId === 'explorer') {
          if (s.explorerCount <= 0 || s.trade < SR.CARDS.explorer.cost) return s
          return SR.buyCard(s, 'explorer')
        }
        // Resolve the trade-row slot holding that card id; reject anything not face-up there.
        const slot = s.tradeRow.findIndex(c => c != null && c.id === intent.cardId)
        if (slot < 0) return s
        const d = SR.def(s.tradeRow[slot] as CardInst)
        if (s.trade < d.cost) return s
        return SR.buyCard(s, slot)
      }
      case 'attack': {
        if (intent.target === 'face') {
          if (!SR.faceOpen(s) || s.combat <= 0) return s
          return SR.attack(s, 'face')
        }
        // Must be a real enemy base whose defense we can afford (and legal vs outposts).
        const foe: Player = seat === 0 ? 1 : 0
        const opp = s.players[foe]
        const base = opp.bases.find(b => b.id === intent.target)
        if (base == null) return s
        const bd = SR.def(base)
        if (opp.bases.some(b => SR.def(b).outpost) && !bd.outpost) return s
        if (s.combat < (bd.defense ?? 0)) return s
        return SR.attack(s, intent.target)
      }
      case 'endTurn':
        return SR.endTurn(s)
      default:
        return s
    }
  },

  aiStep: s => SR.aiTurn(s), // reuse the existing greedy AI (plays its whole turn at once)

  // Changes on EVERY transition: `actions` bumps on every play/buy/attack/endTurn.
  tickKey: s => `${s.actions}-${s.turn}-${s.winner ?? ''}`,

  // Hidden info: blank the OTHER seat's hand, blank BOTH players' face-down draw decks,
  // and blank the shared face-down trade deck. Counts (array lengths) are preserved; the
  // viewing seat keeps its own real hand. Everything else (trade row, discards, bases,
  // authority, pools, explorer count, log) is public and left untouched.
  redactFor: (s, seat) => ({
    ...s,
    players: s.players.map((p, i): PlayerState => ({
      ...p,
      deck: hide(p.deck),
      hand: i === seat ? p.hand : hide(p.hand),
    })) as [PlayerState, PlayerState],
    tradeDeck: hide(s.tradeDeck),
  }),
}
