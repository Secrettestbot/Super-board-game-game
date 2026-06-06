/* CASCADIA — netplay adapter. Maps the pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Fully public information (both tableaus, market and
 * scores are visible to all), so no redactFor is needed. Seats map directly to the two
 * player indices: seat 0 = you (player 0), seat 1 = the rival (player 1). numSeats reads
 * the real player count off the tableaus, so a future N-player state would self-report. */

import * as C from './logic'
import type { CascadiaState, Hex } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** One full turn reduced to the wire essentials: which market pair, where the habitat
 * tile goes (hex + rotation), and where the paired token lands (or null = set aside). */
export interface CascadiaIntent {
  marketIndex: number
  hex: Hex
  rotation: number
  animalCoord: Hex | null
}

export const cascadiaAdapter: GameAdapter<CascadiaState, CascadiaIntent> = {
  makeGame: () => C.makeGame(),
  // Number of distinct tableaus = number of seated players (always 2 here, but read it
  // off the state rather than hardcoding so a future N-player state would self-report).
  numSeats: s => s.tableaus.length,
  seatToMove: s => (s.winner == null ? s.turn : null), // turn index == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    const player = seat as 0 | 1
    const pair = s.market[i.marketIndex]
    if (pair == null) return s
    // Validate the tile placement against the legal set for this player; never trust the
    // guest-supplied hex. Return the input state unchanged when illegal.
    const tab = s.tableaus[player]
    const legalTile = C.legalTilePlacements(tab).some(h => h.q === i.hex.q && h.r === i.hex.r)
    if (!legalTile) return s
    // If a token coord is supplied, it must be a legal slot on the post-tile tableau for
    // the paired animal; otherwise placePair would silently set it aside, which would let
    // an out-of-spec coord through unchanged. Reject so the intent is all-or-nothing.
    if (i.animalCoord != null) {
      const k = C.hexKey(i.hex.q, i.hex.r)
      const projected = {
        ...tab,
        [k]: { terrains: pair.tile.terrains.slice(), slots: pair.tile.slots.slice(), rotation: 0, placedAnimal: null },
      }
      const legalAnimal = C.legalAnimalSpots(projected, pair.token)
        .some(h => h.q === i.animalCoord!.q && h.r === i.animalCoord!.r)
      if (!legalAnimal) return s
    }
    const next = C.placePair(s, player, i.marketIndex, i.hex, i.rotation, i.animalCoord)
    return next === s ? s : next
  },
  aiStep: s => C.aiTurn(s),
  tickKey: s => `${s.step}-${s.turn}-${s.winner ?? ''}`,
}
