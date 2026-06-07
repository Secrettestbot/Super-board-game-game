/* CARTOGRAPHERS — netplay adapter. Maps the pure roll-and-write logic onto the uniform
 * GameAdapter so useGameSession can host/join it.
 *
 * Cartographers is a SHARED-CARD roll-and-write: each "turn" the same EXPLORE card is
 * revealed to everyone, and every player draws its shape onto their OWN 11x11 map. The
 * revealed card, every player's map, the scoring edicts and the running scores are all
 * PUBLIC. The only thing a player may not see is the ORDER of the not-yet-revealed deck,
 * so redactFor strips the upcoming-deck identities (keeping only the current card).
 *
 * Seats map directly to the two player indices: seat 0 = you (the original human / host),
 * seat 1 = the rival. The logic has no single "turn" field (both players act on the same
 * card via their own `placed` flag), so we serialize them: the active seat is the lowest
 * seat that has not yet placed for the current card. After the card resolves the logic
 * advances itself (draws the next card or ends the season). At a season-end interstitial
 * seat 0 (the host) advances with a `next` intent. numSeats reads the real map count.
 *
 * Intents (JSON plain objects; the host re-validates every one against the logic and
 * returns the input state unchanged for anything illegal / out of turn):
 *   { kind: 'place', shapeId, cells, terrain } — stamp the card's shape at `cells`
 *   { kind: 'skip' }                           — give up a card with no legal placement
 *   { kind: 'next' }                           — advance past a scored-season interstitial
 *
 * tickKey is the logic's monotonic s.step (bumped on every placement, skip, card draw,
 * season-end and season advance) so the AI driver re-arms after every transition.
 */

import * as C from './logic'
import type { State, Terrain, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type CartographersIntent =
  | { kind: 'place'; shapeId: number; cells: [number, number][]; terrain: Terrain }
  | { kind: 'skip' }
  | { kind: 'next' }

/** The seat to act now: lowest un-placed seat while placing; seat 0 drives a season end. */
function seatToMove(s: State): number | null {
  if (s.phase === 'over' || s.winner != null) return null
  if (s.phase === 'seasonEnd') return 0 // host advances the interstitial
  // placing: serialize the two players — whoever still owes a placement, lowest first.
  if (!s.maps[0].placed) return 0
  if (!s.maps[1].placed) return 1
  return 0
}

/** Validate cells == some legal placement of one of the card's shapes for this seat. */
function cellsAreLegal(s: State, seat: Player, cells: [number, number][]): boolean {
  if (!s.card) return false
  const want = [...cells].map(([r, c]) => C.idx(r, c)).sort((a, b) => a - b).join('|')
  for (const shape of s.card.shapes) {
    for (const placement of C.legalPlacements(s.maps[seat].grid, shape)) {
      const key = placement.map(([r, c]) => C.idx(r, c)).sort((a, b) => a - b).join('|')
      if (key === want) return true
    }
  }
  return false
}

/** Whether this seat truly cannot place the current card (so a skip is legal). */
function deadlocked(s: State, seat: Player): boolean {
  if (!s.card) return false
  for (const shape of s.card.shapes) {
    if (C.legalPlacements(s.maps[seat].grid, shape).length > 0) return false
  }
  return true
}

export const cartographersAdapter: GameAdapter<State, CartographersIntent> = {
  makeGame: () => C.makeGame(),
  // The match is a fixed pair of maps; read it off the state so it stays honest.
  numSeats: s => s.maps.length,
  seatToMove,
  isOver: s => s.phase === 'over' || s.winner != null,
  applyIntent: (s, seat, i) => {
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'place': {
        if (s.phase !== 'placing' || !s.card) return s
        if (typeof i.terrain !== 'string' || !s.card.terrains.includes(i.terrain)) return s
        if (!Array.isArray(i.cells) || !cellsAreLegal(s, seat as Player, i.cells)) return s
        // placeShape re-validates open-cells + terrain + already-placed and returns the
        // SAME reference if anything is off, so we never trust the wire blindly.
        return C.placeShape(s, seat as Player, i.cells, i.terrain)
      }
      case 'skip': {
        // Only allow a skip when the seat genuinely cannot place (mirrors the UI).
        if (s.phase !== 'placing' || !deadlocked(s, seat as Player)) return s
        return C.skipPlacement(s, seat as Player)
      }
      case 'next': {
        // Advance the scored-season interstitial (seat 0 / host only — guarded by
        // seatToMove returning 0 in seasonEnd). nextSeason no-ops off-phase.
        return C.nextSeason(s)
      }
      default:
        return s
    }
  },
  // aiStep acts only for seat 1 during placing (greedy best placement, or a skip). It
  // bumps s.step so tickKey changes and the driver re-arms. Seat 0 is always the host,
  // so the AI never has to drive a season-end interstitial.
  aiStep: (s, seat) =>
    s.phase === 'placing' && seat === 1 && !s.maps[1].placed ? C.aiTurn(s) : s,
  // Monotonic counter the logic bumps on EVERY transition (place / skip / draw / season).
  tickKey: s => `${s.step}-${s.phase}-${s.season}-${s.cardIdx}-${s.winner ?? ''}`,
  // Hidden info: only the deck ORDER beyond the current card is secret. Keep the current
  // card (it's public) and blank the rest so a guest can't peek at upcoming draws.
  redactFor: (s, _seat) => {
    const cur = s.deck[s.cardIdx]
    const redactedDeck = s.deck.map((card, i) =>
      i === s.cardIdx
        ? card
        : { id: '?', name: 'Unknown', shapes: [], terrains: [], time: 0 },
    )
    return { ...s, deck: redactedDeck, card: cur ?? s.card }
  },
}
