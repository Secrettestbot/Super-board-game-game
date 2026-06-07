/* YAHTZEE — netplay adapter. Maps the pure dice logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Dice + both scorecards are PUBLIC, so no redactFor.
 * Seats map to the logic's player strings: seat 0 = 'you', seat 1 = 'ai'.
 *
 * A turn has several sub-actions by the SAME seat before play passes, so each decision
 * is a JSON intent:
 *   { kind: 'roll'         } — roll the dice (host RNG); held dice are kept
 *   { kind: 'hold',  i     } — toggle hold on die i (only after a roll, before scoring)
 *   { kind: 'score', cat   } — score the current dice in an open category; turn passes
 *
 * The dice RNG runs on the host (the authority) inside the logic's roll(); guests just
 * request a roll. seatToMove stays the same seat through roll/hold/roll/score, then
 * advances to the other seat (or null at game over). applyIntent re-validates every intent
 * against the game's legality and returns the input state unchanged for any illegal /
 * out-of-turn intent (never throws).
 *
 * Note: the logic's toggleHold() is hardcoded to the 'you' seat, so the hold intent is
 * re-implemented here directly (same rules) so a guest at seat 1 can hold too. logic.ts is
 * never edited. */

import * as YA from './logic'
import type { YahtzeeState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type YahtzeeIntent =
  | { kind: 'roll' }
  | { kind: 'hold'; i: number }
  | { kind: 'score'; cat: string }

/** seat index -> the logic's player string. */
const SEAT_PLAYER: Player[] = ['you', 'ai']
/** logic player string -> seat index. */
function playerSeat(p: Player | null): number | null {
  return p === 'you' ? 0 : p === 'ai' ? 1 : null
}

const seatToMove = (s: YahtzeeState): number | null => (s.winner ? null : playerSeat(s.turn))

export const yahtzeeAdapter: GameAdapter<YahtzeeState, YahtzeeIntent> = {
  makeGame: () => YA.makeGame(),
  // Always 2 seats (you + rival); read the real count off the scorecards so it stays
  // correct if the state ever grows more players.
  numSeats: s => Object.keys(s.cards).length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (it stays the same seat through roll/hold/roll/score).
    if (seatToMove(s) !== seat || !i) return s
    const who = SEAT_PLAYER[seat]
    switch (i.kind) {
      case 'roll': {
        const out = YA.roll(s, who) // returns same ref if no rolls left / wrong turn
        return out === s ? s : out
      }
      case 'hold': {
        // Re-implement toggleHold for any seat (logic.ts's version is 'you'-only).
        if (!s.rolled || !Number.isInteger(i.i) || i.i < 0 || i.i >= s.held.length) return s
        const held = s.held.slice()
        held[i.i] = !held[i.i]
        return Object.assign({}, s, { held })
      }
      case 'score': {
        if (!s.rolled || typeof i.cat !== 'string') return s
        // Category must exist and be open on this seat's card.
        if (!YA.CATS.some(c => c.k === i.cat)) return s
        if (s.cards[who][i.cat] != null) return s
        const out = YA.pick(s, who, i.cat) // returns same ref if illegal
        return out === s ? s : out
      }
      default:
        return s
    }
  },
  // Reuse the game's existing aiTurn, which plays the seat's whole turn (roll -> holds ->
  // re-rolls -> score) in one call, only for the 'ai' seat. Afterwards s.turn has advanced
  // (or the game is over), so tickKey changes and the timer re-arms. AI dice RNG runs here
  // on the host (the authority).
  aiStep: (s, seat) => (s.winner == null && playerSeat(s.turn) === seat ? YA.aiTurn(s) : s),
  // Changes on EVERY action: turn, round, rolls left, the rolled flag, the dice signature,
  // the held signature, and the log length (which grows on every scored category).
  tickKey: s => {
    const held = s.held.map(h => (h ? 1 : 0)).join('')
    return `${s.turn ?? ''}-${s.round}-${s.rollsLeft}-${s.rolled ? 1 : 0}-${s.dice.join(',')}-${held}-${s.log.length}-${s.winner ?? ''}`
  },
}
