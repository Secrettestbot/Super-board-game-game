/* KINGDOMINO — netplay adapter. Maps the pure logic onto the uniform GameAdapter so
   useGameSession can host/join it. Perfect information: the deck, both kingdoms, the
   draft lineup and every claimed tile are all public, so no redactFor is needed.

   Seats map directly to player indices: seat 0 = player 0, seat 1 = player 1. The
   active player is `s.order[s.turnPos]` (the logic mirrors it on `s.current`). A turn
   is encoded as ONE action — either placing the previously-claimed domino, or claiming
   a tile from the lineup — matching the game's two-phase ('place' then 'claim') flow.
   numSeats reads the real player count off the state. */

import * as KD from './logic'
import type { KingdomState, Placement, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A single action. 'place' covers both the in-round placement and the final-round
    placement (the adapter routes on lineup length); placement === null means discard. */
export type KingdominoIntent =
  | { kind: 'place'; placement: Placement | null }
  | { kind: 'claim'; lineIndex: number }

function activeSeat(s: KingdomState): Player {
  return s.order[s.turnPos]
}

/** Reuse the game's exported primitives to advance whichever seat needs an AI move.
    The bundled aiTurn is hard-wired to player 1, so we drive other seats with the same
    public helpers (bestPlacement / claim heuristic) it uses. */
function aiStepForSeat(s: KingdomState, seat: number): KingdomState {
  if (s.phase === 'over') return s
  if (activeSeat(s) !== seat) return s
  // Seat 1 is exactly what the built-in AI plays — reuse it verbatim.
  if (seat === 1) return KD.aiTurn(s)
  if (s.phase === 'place') {
    const ps = s.players[seat as Player]
    const best = ps.claimed != null ? KD.bestPlacement(ps.grid, ps.claimed) : null
    return s.lineup.length === 0 ? KD.finalPlace(s, best) : KD.placeTile(s, best)
  }
  // claim phase: pick the highest-crown tile that best fits this seat's kingdom.
  let bestIdx = -1
  let bestVal = -Infinity
  const grid = s.players[seat as Player].grid
  for (let i = 0; i < s.lineup.length; i++) {
    if (s.lineup[i].claimedBy != null) continue
    const tile = s.lineup[i].tile
    const crowns = tile.a.crowns + tile.b.crowns
    const best = KD.bestPlacement(grid, tile)
    const fit = best == null ? -5 : (KD.scoreGrid(KD.applyPlacement(grid, tile, best)) - KD.scoreGrid(grid))
    const v = crowns * 3 + fit - tile.num / 100
    if (v > bestVal) { bestVal = v; bestIdx = i }
  }
  if (bestIdx < 0) return s
  return KD.claimTile(s, bestIdx)
}

export const kingdominoAdapter: GameAdapter<KingdomState, KingdominoIntent> = {
  makeGame: () => KD.makeGame(),
  // Read the real player count off the state (always 2 today, future-proof otherwise).
  numSeats: s => s.players.length,
  seatToMove: s => (s.phase === 'over' ? null : activeSeat(s)),
  isOver: s => s.phase === 'over',
  applyIntent: (s, seat, i) => {
    if (s.phase === 'over' || activeSeat(s) !== seat) return s
    if (i.kind === 'place') {
      if (s.phase !== 'place') return s
      const ps = s.players[seat as Player]
      // Validate against the legal set; never trust a guest-supplied placement. A null
      // placement (discard) is only honoured when there is genuinely no legal spot.
      if (i.placement != null) {
        if (ps.claimed == null) return s
        const legal = KD.legalPlacements(ps.grid, ps.claimed)
        const ok = legal.some(l => l.anchor === i.placement!.anchor && l.orient === i.placement!.orient)
        if (!ok) return s
      } else {
        if (ps.claimed != null && KD.legalPlacements(ps.grid, ps.claimed).length > 0) return s
      }
      return s.lineup.length === 0 ? KD.finalPlace(s, i.placement) : KD.placeTile(s, i.placement)
    }
    // claim
    if (s.phase !== 'claim') return s
    const entry = s.lineup[i.lineIndex]
    if (entry == null || entry.claimedBy != null) return s
    return KD.claimTile(s, i.lineIndex)
  },
  aiStep: (s, seat) => aiStepForSeat(s, seat),
  // Changes on every action: the logic bumps `tick` on every place/claim/finalPlace.
  tickKey: s => `${s.tick}-${s.phase}-${s.turnPos}-${s.winner ?? ''}-${s.tie}`,
}
