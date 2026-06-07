/* MACHI KORO — netplay adapter. Maps the pure dice-city logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Coins, cards and dice are all PUBLIC,
 * so no redactFor is needed. Seats map directly to player indices: seat 0 = You,
 * seat 1+ = the rivals. numSeats reads the real player count off the state.
 *
 * A turn has sub-steps, so each player decision is a JSON intent:
 *   { kind: 'roll',   n }   — roll 1 or 2 dice (host RNG); auto-applies income unless the
 *                             roller owns a Radio Tower (then they may reroll / take income)
 *   { kind: 'reroll', n }   — Radio Tower re-roll (only before income is applied)
 *   { kind: 'income'    }   — take the pending income (Radio Tower owners only)
 *   { kind: 'buy', card }   — buy an establishment or build a landmark
 *   { kind: 'pass'      }   — end the build step (advance / take the doubles extra turn)
 *
 * The dice roll is RNG on the host (the authority); guests just request a roll. seatToMove
 * stays the same seat through their own roll -> build -> buy/pass, AND through a doubles
 * extra turn (s.turn does not change). applyIntent validates and returns the input state
 * unchanged for any illegal / out-of-turn intent. tickKey changes on every action. */

import * as MK from './logic'
import type { State } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type MachiKoroIntent =
  | { kind: 'roll'; n: number }
  | { kind: 'reroll'; n: number }
  | { kind: 'income' }
  | { kind: 'buy'; card: string }
  | { kind: 'pass' }

const seatToMove = (s: State): number | null => (s.winner == null ? s.turn : null)

export const machiKoroAdapter: GameAdapter<State, MachiKoroIntent> = {
  makeGame: () => MK.makeGame(),
  // Read the real player count off the state so a 2/3/4-player game reports its true
  // seat count automatically.
  numSeats: s => s.players.length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (it stays the same seat through roll -> build and through
    // any doubles extra turn). Never trust the wire: re-validate against the logic.
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'roll': {
        if (s.phase !== 'roll') return s
        const rolled = MK.rollDice(s, i.n === 2 ? 2 : 1)
        if (rolled === s) return s // rollDice rejected (wrong phase / over)
        // Mirror the solo flow: auto-apply income unless the roller owns a Radio Tower
        // (then they may re-roll first or choose to take income).
        return rolled.players[rolled.turn].landmarks.radio ? rolled : MK.applyIncome(rolled)
      }
      case 'reroll': {
        const out = MK.reroll(s, i.n === 2 ? 2 : 1)
        return out === s ? s : out
      }
      case 'income': {
        const out = MK.applyIncome(s)
        return out === s ? s : out
      }
      case 'buy': {
        // Only legal during the build step, after income has resolved.
        if (s.phase !== 'build' || !s.incomeDone || typeof i.card !== 'string') return s
        const out = MK.buy(s, seat, i.card)
        return out === s ? s : out // buy returns the same ref when it rejects the purchase
      }
      case 'pass': {
        if (s.phase !== 'build' || !s.incomeDone) return s
        const out = MK.endTurn(s)
        return out === s ? s : out
      }
      default:
        return s
    }
  },
  // Reuse the game's existing aiTurn, which plays the seat's whole turn (roll -> income ->
  // build -> endTurn, looping over any doubles extra turns) in one call. It only acts for
  // the seat at s.turn (and bails on human seat 0), and afterwards s.turn has advanced to
  // the next player or the game is over, so tickKey changes and the timer re-arms. The AI
  // dice RNG runs here on the host (the authority).
  aiStep: (s, seat) => (s.winner == null && s.turn === seat ? MK.aiTurn(s) : s),
  // Changes on EVERY action: phase, turn, the dice signature, every player's coins +
  // landmark count, and the log length (which grows on every mutation, including
  // back-to-back same-seat actions and doubles extra turns).
  tickKey: s => {
    const coins = s.players.map(p => p.coins).join('.')
    const lm = s.players.map(p => MK.landmarksBuilt(p)).join('.')
    return `${s.turn}-${s.phase}-${s.roll}-${s.dice.join(',')}-${s.incomeDone ? 1 : 0}-${s.rerolled ? 1 : 0}-${coins}-${lm}-${s.log.length}-${s.winner ?? ''}`
  },
}
