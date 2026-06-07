/* CARCASSONNE — netplay adapter. Maps the pure tile-laying logic onto the uniform
   GameAdapter so useGameSession can host/join it.

   Seats map directly to players: seat 0 = you (player 0), seat 1 = the rival
   (player 1). numSeats reads the real player count off the state's players tuple.

   An intent is one full turn's worth of input: WHERE to drop the public current
   tile (cell + rotation) and OPTIONALLY which segment of it to claim with a meeple.
   applyIntent validates against the game's own legality (fits + a free feature) and
   returns the input state unchanged for an illegal or out-of-turn intent.

   Hidden info: the board and the current (drawn) tile are PUBLIC, but the deck holds
   the shuffled bag in draw order — sending it would leak the next tile(s) to a guest.
   redactFor replaces the deck's tile defs with opaque placeholders (length preserved
   so the "tiles left" counter stays correct) and clears the host's RNG-derived order. */

import * as CC from './logic'
import type { CarcassonneState, TileDef } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** One turn's input: place the public current tile at (x,y) with `rotation`, then
    optionally claim segment `meepleSegId` of the just-placed tile (null = no meeple). */
export interface CarcassonneIntent {
  x: number
  y: number
  rotation: number
  meepleSegId?: number | null
}

/** An opaque face-down tile substituted for every hidden deck entry, so a guest sees
    only how many tiles remain — never which ones, nor their order. */
const HIDDEN_TILE: TileDef = {
  id: 'hidden',
  edges: ['field', 'field', 'field', 'field'],
  segments: [],
}

export const carcassonneAdapter: GameAdapter<CarcassonneState, CarcassonneIntent> = {
  makeGame: () => CC.makeGame(),
  numSeats: s => s.players.length, // real player count (2 here)
  seatToMove: s => (s.winner == null ? s.turn : null), // turn (0/1) == seat
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.current == null || s.turn !== seat) return s
    // Validate the placement against the game's own legality; never trust the wire.
    if (!CC.fits(s, s.current, i.x, i.y, i.rotation)) return s
    // placeTile itself re-checks fits + that the chosen segment is a free feature,
    // and ignores an out-of-range/occupied meeple choice, so it is safe to forward.
    const ns = CC.placeTile(s, i.x, i.y, i.rotation, i.meepleSegId ?? null)
    return ns === s ? s : ns
  },
  aiStep: s => CC.aiTurn(s),
  // Changes on every action: tick is a monotonic counter bumped by placeTile/aiTurn,
  // with turn + winner folded in for good measure.
  tickKey: s => `${s.tick}-${s.turn}-${s.winner ?? ''}`,
  // Strip the bag: keep its length (for the "tiles left" count) but hide every entry.
  redactFor: s => ({ ...s, deck: s.deck.map(() => HIDDEN_TILE) }),
}
