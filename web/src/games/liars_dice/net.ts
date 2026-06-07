/* LIAR'S DICE / PERUDO — netplay adapter. Maps the pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Seats map to the two sides:
 * seat 0 = 'you' (the original human side), seat 1 = 'foe' (the rival).
 *
 * HIDDEN INFO: each player's DICE under their cup are private during bidding — you
 * see your own roll, never the other side's. redactFor therefore blanks the OTHER
 * seat's dice VALUES while the round is being bid (replacing each die with a neutral
 * placeholder, so the COUNT under the cup is still visible). The moment a challenge
 * resolves (phase 'reveal') or the match ends ('over') every die is revealed so both
 * players see the tally — matching the solo UI. A leak test guards the during-bidding
 * redaction so no secret die value ever crosses the wire.
 *
 * A turn during 'bidding' is one of: BID a strictly-higher quantity+face, or
 * CHALLENGE ("Liar!") the standing bid. A challenge flips the game into 'reveal';
 * from there seat 0 (the host) advances to the next round with a {kind:'continue'}
 * intent — the reroll is host RNG (logic.ts runs only on the authority). All intents
 * are validated against the live phase / turn / raise rule so the host never trusts a
 * guest-supplied move; an illegal or out-of-turn intent returns the input state
 * unchanged. */

import * as LD from './logic'
import type { LiarsState, Face, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Wire intent: place a bid, cry "Liar!", or — once a challenge has revealed — roll
 * the next round. JSON-serializable plain objects only. */
export type LiarsIntent =
  | { kind: 'bid'; quantity: number; face: Face }
  | { kind: 'challenge' }
  | { kind: 'continue' }

const seatOf = (p: Player): number => (p === 'you' ? 0 : 1)
const playerOf = (seat: number): Player => (seat === 0 ? 'you' : 'foe')

/** A neutral placeholder that hides a die's real value from the other seat. */
const HIDDEN_DIE = 1 as Face

export const liarsDiceAdapter: GameAdapter<LiarsState, LiarsIntent> = {
  makeGame: () => LD.makeGame(),
  numSeats: () => 2,
  // 'you' -> 0, 'foe' -> 1. Once the MATCH is over nobody moves. During 'reveal'
  // seat 0 "moves" so it can roll the next round via {kind:'continue'} — no AI fires
  // there (seat 0 is always host-controlled), so a human clicks Continue.
  seatToMove: s => {
    if (s.winner != null || s.phase === 'over') return null
    if (s.phase === 'reveal') return 0
    return seatOf(s.turn)
  },
  isOver: s => s.winner != null || s.phase === 'over',
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.phase === 'over') return s

    // After a reveal: only seat 0's {kind:'continue'} rolls the next round (host RNG).
    if (s.phase === 'reveal') {
      if (i.kind === 'continue' && seat === 0) return LD.nextRound(s)
      return s
    }
    if (i.kind === 'continue') return s

    // Bidding: must be this seat's turn.
    if (s.phase !== 'bidding' || seatOf(s.turn) !== seat) return s
    const who = playerOf(seat)

    if (i.kind === 'challenge') {
      if (!s.bid) return s // nothing to challenge on an open round
      return LD.challenge(s, who)
    }

    // A bid must clear the strict raise rule (validated inside makeBid too).
    const bid = { qty: i.quantity, face: i.face }
    if (!LD.isRaise(s.bid, bid)) return s
    return LD.makeBid(s, who, bid)
  },
  aiStep: s => LD.aiStep(s),
  // Changes on EVERY transition: history grows per bid, phase/turn flip on a challenge
  // and reveal, youCount/foeCount drop on a lost die, log grows on the reroll.
  tickKey: s =>
    `${s.phase}-${s.turn}-${s.history.length}-${s.youCount}-${s.foeCount}-${s.log.length}-${s.winner ?? ''}`,
  // Hidden info: while bidding, blank the OTHER seat's die VALUES (count preserved via
  // array length). On reveal / game over, show everything so both sides see the tally.
  redactFor: (s, seat) => {
    if (s.phase !== 'bidding') return s
    const me = playerOf(seat)
    return {
      ...s,
      youDice: me === 'you' ? s.youDice : s.youDice.map(() => HIDDEN_DIE),
      foeDice: me === 'foe' ? s.foeDice : s.foeDice.map(() => HIDDEN_DIE),
    }
  },
}
