/* PORT ROYAL — netplay adapter. Maps the push-your-luck logic onto the uniform
 * GameAdapter so useGameSession can host/join it.
 *
 * Hidden information: the only secret is the face-DOWN draw pile (and the discard
 * pile, which is face-down and gets reshuffled back into the deck). Everything a
 * player collects — coins, ships, persons, expeditions — is PUBLIC, and the harbor
 * is face-up. redactFor therefore replaces the deck/discard card objects with
 * anonymous placeholders while preserving their LENGTH (so the UI can still show
 * "N cards left"). bustRisk is computed host-side off the true deck; guests only
 * ever receive the placeholder counts.
 *
 * Seats map directly to player indices: seat 0 = you, 1 & 2 = the other captains.
 * numSeats reads the real player count off the state.
 *
 * Turn structure: in the `discover` phase the seat to move is the discoverer; in the
 * `trade` phase it is whichever player is currently deciding (`current`). A single
 * seat may take several consecutive sub-steps (flip, flip, …, stop, then take) — the
 * session re-arms the AI after each because tickKey changes on every transition. */

import * as PR from './logic'
import type { PortState, Card } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials. `hire` carries the harbor card id (not an
 * index) so it survives redaction/reordering; the host resolves it to an index. */
export type PortRoyalIntent =
  | { kind: 'flip' }
  | { kind: 'stop' }
  | { kind: 'hire'; cardId: number }
  | { kind: 'pass' }

/** Seat whose turn it is: discoverer while flipping, current while trading; null over. */
function seatToMove(s: PortState): number | null {
  if (s.winner != null || s.phase === 'done') return null
  return s.phase === 'discover' ? s.discoverer : s.current
}

/** An anonymous stand-in for a face-down card: keeps it JSON-serializable and shaped
 * like a Card, but carries no identity, color, value, or order information. */
function hiddenCard(): Card {
  return { id: -1, kind: 'ship', name: '' }
}

export const portRoyalAdapter: GameAdapter<PortState, PortRoyalIntent> = {
  makeGame: () => PR.makeGame(),
  numSeats: s => s.players.length,
  seatToMove,
  isOver: s => s.winner != null || s.phase === 'done',

  applyIntent: (s, seat, intent) => {
    if (s.winner != null || s.phase === 'done') return s
    const mover = seatToMove(s)
    if (mover !== seat) return s

    switch (intent.kind) {
      case 'flip':
        if (s.phase !== 'discover') return s
        return PR.flip(s)
      case 'stop':
        if (s.phase !== 'discover') return s
        return PR.stop(s)
      case 'pass':
        if (s.phase !== 'trade') return s
        return PR.passTake(s)
      case 'hire': {
        if (s.phase !== 'trade') return s
        // Resolve the card id to its current harbor index; never trust a raw index.
        const idx = s.harbor.findIndex(c => c.id === intent.cardId)
        if (idx < 0) return s
        if (!PR.canTake(s, seat, idx)) return s
        return PR.takeCard(s, seat, idx)
      }
      default:
        return s
    }
  },

  aiStep: s => PR.aiStep(s),
  tickKey: s => PR.aiTick(s),

  // Hide the face-down piles: same lengths, no identities. Everything else is public.
  redactFor: (s, _seat) => ({
    ...s,
    deck: s.deck.map(hiddenCard),
    discard: s.discard.map(hiddenCard),
  }),
}
