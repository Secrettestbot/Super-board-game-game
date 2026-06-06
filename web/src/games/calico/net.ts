/* CALICO — netplay adapter. Maps calico's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Seats map directly to players: seat 0 = you (the
 * original human side, moves first), seat 1 = the rival. numSeats reads the real player
 * count off the state's hands array so a future 3+ player state would report correctly.
 *
 * HIDDEN INFO: each player holds a private HAND of up to 2 patch tiles the opponent must
 * not see, and the shared draw BAG is face-down. redactFor therefore blanks every other
 * seat's hand tiles and the whole bag before a view crosses the wire (the market of 3 is
 * face-up / public and stays intact). A leak test guards this.
 *
 * A turn is: place one of your hand tiles on an empty hex; the hand then auto-refills from
 * the front of the public market (which itself refills from the bag) — that draw is fixed
 * by the logic, so the intent is just { handIndex, hex }. We validate the placement against
 * legalPlacements and the live hand so the host never trusts a guest-supplied move. */

import * as C from './logic'
import type { CalicoState, Player, Patch } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: which private hand tile, onto which hex. */
export interface CalicoIntent { handIndex: number; hex: { q: number; r: number } }

/** A neutral placeholder used to hide a tile's real color/pattern from other seats. */
const HIDDEN: Patch = { color: -1, pattern: -1 }

export const calicoAdapter: GameAdapter<CalicoState, CalicoIntent> = {
  makeGame: () => C.makeGame(),
  // Real player count off the state (min 2) so a 3+ player state would report correctly.
  numSeats: s => Math.max(2, s.hands.length),
  seatToMove: s => (s.winner == null ? s.turn : null), // turn (0/1) == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    const hand = s.hands[seat]
    if (hand == null || hand[i.handIndex] == null) return s
    // The hex must be a real legal placement on this seat's own board.
    const legal = C.legalPlacements(s.boards[seat]).some(p => p.q === i.hex.q && p.r === i.hex.r)
    if (!legal) return s
    return C.placeTile(s, seat as Player, i.handIndex, i.hex)
  },
  aiStep: s => C.aiTurn(s),
  // Changes on EVERY transition: step increments on every placement (and the AI pass).
  tickKey: s => `${s.step}-${s.turn}-${s.winner ?? ''}`,
  // Hidden info: blank every OTHER seat's hand tiles and the whole face-down bag. The
  // viewing seat keeps its own real hand; the public market is left untouched.
  redactFor: (s, seat) => ({
    ...s,
    hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => ({ ...HIDDEN })))) as CalicoState['hands'],
    bag: s.bag.map(() => ({ ...HIDDEN })),
  }),
}
