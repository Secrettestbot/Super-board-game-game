/* CATAN DICE — netplay adapter. Maps the pure roll-and-write logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Both sheets, the dice and the keep
 * mask are all PUBLIC, so no redactFor is needed. Seats map directly to the logic's
 * player indices: seat 0 = You (player 0), seat 1 = the rival (player 1).
 *
 * A turn has several sub-actions by the SAME seat before play passes (Yahtzee-style),
 * so each decision is a JSON intent:
 *   { kind: 'roll' }          — roll the six resource dice (host RNG); kept dice stay.
 *                               Auto-advances to the build phase when rolls run out.
 *   { kind: 'hold',  i }      — toggle keep on die i (only in the roll phase)
 *   { kind: 'stop' }          — stop re-rolling early and move to the build phase
 *   { kind: 'build', type }   — spend the current dice to build a structure
 *   { kind: 'end' }           — end the turn; play passes to the next seat
 *
 * The dice RNG runs on the host (the authority) inside the logic's rollDice(); guests
 * just request a roll. seatToMove stays the same seat through roll/hold/build/end, then
 * advances to the other seat (or null at game over). applyIntent re-validates every
 * intent against the logic's guards and returns the input state unchanged for any
 * illegal / out-of-turn intent (never throws). tickKey changes on every action.
 *
 * The logic never edits s.you here — it only flavours log text — so the same logic.ts
 * works for either seat. AI for an empty seat reuses aiTurn (the whole-turn driver,
 * which is NOT 'you'-gated, unlike aiStep), so any seat can be AI-controlled. */

import * as C from './logic'
import type { CatanState, Player, Structure } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type CatanDiceIntent =
  | { kind: 'roll' }
  | { kind: 'hold'; i: number }
  | { kind: 'stop' }
  | { kind: 'build'; type: Structure }
  | { kind: 'end' }

const BUILDABLE: Structure[] = ['road', 'settlement', 'city', 'knight']

const seatToMove = (s: CatanState): number | null => (s.winner == null ? s.turn : null)

export const catanDiceAdapter: GameAdapter<CatanState, CatanDiceIntent> = {
  makeGame: () => C.makeGame(0),
  // A fixed 2-player roll-and-write (one sheet per player).
  numSeats: s => s.sheets.length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (it stays the same seat through roll/hold/build/end).
    // Never trust the wire: re-validate against the logic, which itself guards on s.turn.
    if (seatToMove(s) !== seat || !i) return s
    const player = seat as Player
    switch (i.kind) {
      case 'roll': {
        const out = C.rollDice(s) // host RNG; no-op if no rolls / wrong phase / over
        return out === s ? s : out
      }
      case 'hold': {
        if (!Number.isInteger(i.i)) return s
        const out = C.toggleKeep(s, i.i) // no-op if out of range / wrong phase
        return out === s ? s : out
      }
      case 'stop': {
        const out = C.stopRolling(s)
        return out === s ? s : out
      }
      case 'build': {
        if (!BUILDABLE.includes(i.type)) return s
        const out = C.build(s, player, i.type) // no-op if not buildable / wrong phase
        return out === s ? s : out
      }
      case 'end': {
        if (s.phase !== 'build') return s
        const out = C.endTurn(s)
        return out === s ? s : out
      }
      default:
        return s
    }
  },
  // Reuse aiTurn, which plays the seat's WHOLE turn (roll -> keep/reroll -> build ->
  // endTurn) in one call. Unlike aiStep it is not gated on s.you, so it can drive any
  // seat. Afterwards s.turn has advanced (or the game is over), so tickKey changes and
  // the AI timer re-arms. The dice RNG runs here on the host (the authority).
  aiStep: (s, seat) => (s.winner == null && s.turn === seat ? C.aiTurn(s) : s),
  // Changes on EVERY action: turn, phase, rolls left, the dice signature, the keep mask,
  // each sheet's progress, the round, and the log length (which grows on every action).
  tickKey: s => {
    const kept = s.kept.map(k => (k ? 1 : 0)).join('')
    const sheets = s.sheets.map(sh => `${sh.trackBuilt}.${sh.cities}.${sh.knights}`).join('/')
    return `${s.turn}-${s.phase}-${s.rollsLeft}-${s.dice.join(',')}-${kept}-${sheets}-${s.round}-${s.step}-${s.winner ?? ''}`
  },
}
