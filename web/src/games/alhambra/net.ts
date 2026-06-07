/* ALHAMBRA — netplay adapter. Maps alhambra's pure logic onto the uniform GameAdapter
 * so useGameSession can host/join it. Seats map directly to players: seat 0 = you (the
 * original human side, moves first), seats 1 & 2 = the rival architects. numSeats reads
 * the real player count off the players tuple so it tracks the logic's NUM_PLAYERS.
 *
 * HIDDEN INFO: each player's MONEY cards (their `hand`) are private — an opponent must not
 * see what currency/values you hold. The face-down `moneyDeck` and `buildingDeck` are also
 * secret. Everything else is public: the face-up money market, the face-up building market,
 * every player's built Alhambra (placed tiles), reserved tiles, and scores.
 *
 * redactFor therefore (a) blanks every OTHER seat's hand cards to neutral placeholders
 * (keeping the count so the UI can still show "cards: N") and (b) replaces both face-down
 * decks with same-length placeholder arrays (so deck-size logic / scoring-trigger UI still
 * works, but the order and contents never cross the wire). A STRUCTURAL leak test guards
 * this — ids in this game are not globally unique (`m0…`, `t0…`), so the test asserts the
 * redacted regions are placeholders rather than substring-scanning the whole view.
 *
 * A turn is ONE of: take money cards from the market, buy a building (paying card ids of
 * the required currency), or redesign (place a reserved tile). The intent is a tagged union
 * and every action is re-validated by the pure logic, so the host never trusts a guest. */

import * as A from './logic'
import type { AlhambraState, MoneyCard, Tile, PlayerIdx } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials, as a tagged union over the three actions. */
export type AlhambraIntent =
  | { kind: 'take'; indices: number[] }
  | { kind: 'buy'; marketIndex: number; payment: string[]; placement?: { x: number; y: number } }
  | { kind: 'redesign'; placement?: { x: number; y: number } }

/** Neutral placeholders that hide a card's real currency/value and a tile's identity. */
const HIDDEN_MONEY: MoneyCard = { id: '?', currency: 'green', value: 0 }
const HIDDEN_TILE: Tile = { id: '?', building: 'pavilion', priceCur: 'green', cost: 0 }

export const alhambraAdapter: GameAdapter<AlhambraState, AlhambraIntent> = {
  makeGame: () => A.makeGame(),
  // Real player count off the state (min 2) so it tracks the logic's NUM_PLAYERS.
  numSeats: s => Math.max(2, s.players.length),
  seatToMove: s => (s.winner == null ? s.turn : null), // turn (0/1/2) == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    const p = seat as PlayerIdx
    switch (i.kind) {
      case 'take':
        // takeMoney re-validates the indices (canTakeMoney) and returns s unchanged if illegal.
        return A.takeMoney(s, p, i.indices)
      case 'buy':
        // buyBuilding re-validates the tile, payment cards (ownership + currency + total),
        // and placement, returning s unchanged if anything is wrong.
        return A.buyBuilding(s, p, i.marketIndex, i.payment, i.placement)
      case 'redesign':
        return A.redesign(s, p, i.placement)
      default:
        return s
    }
  },
  aiStep: s => A.aiTurn(s),
  // Changes on EVERY transition: step bumps on every applied action (and the AI driver step).
  tickKey: s => `${s.step}-${s.turn}-${s.winner ?? ''}`,
  // Hidden info: blank every OTHER seat's money hand and both face-down decks. The viewing
  // seat keeps its own real hand; all public regions (markets, built Alhambras, reserved,
  // scores) are left untouched. Counts are preserved so size-dependent UI still works.
  redactFor: (s, seat) => ({
    ...s,
    moneyDeck: s.moneyDeck.map(() => ({ ...HIDDEN_MONEY })),
    buildingDeck: s.buildingDeck.map(() => ({ ...HIDDEN_TILE })),
    players: s.players.map((p, i) =>
      i === seat ? p : { ...p, hand: p.hand.map(() => ({ ...HIDDEN_MONEY })) },
    ) as AlhambraState['players'],
  }),
}
