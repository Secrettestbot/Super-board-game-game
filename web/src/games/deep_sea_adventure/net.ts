/* DEEP SEA ADVENTURE — netplay adapter. Maps the pure push-your-luck logic onto the
 * uniform GameAdapter so useGameSession can host/join it. Seats map directly to diver
 * indices: seat 0 = You, seats 1/2 = the rivals. numSeats reads the real diver count.
 *
 * HIDDEN INFO — treasure chips a diver is CARRYING are held FACE-DOWN: their point VALUES
 * are secret until the game ends. redactFor masks the VALUES of OTHER seats' carried
 * treasures (each value collapses to a HIDDEN sentinel) while preserving HOW MANY each
 * rival carries — that count is public at the table (and drives the shared air burn). Your
 * own carried values stay visible. Everything else is public: the shared air track, every
 * diver's depth/direction/returned flag, the tiles laid on the path, and banked scores.
 *
 * The log is free text that logic.ts writes carried/grabbed/dropped/banked point values
 * into; while a rival is still carrying treasure those lines would leak the very values
 * we mask, so redactFor also clears the log for non-host seats (the structural state is
 * the source of truth a guest renders from). The leak test guards the carry masking.
 *
 * A turn has sub-steps, so each diver decision is a JSON intent:
 *   { kind: 'roll'       }   — roll 2 dice (host RNG) and move. If a direction hasn't been
 *                              committed yet this is "dive deeper" (commits DOWN, then moves);
 *                              after a turnAround it moves UP.
 *   { kind: 'turnAround' }   — commit to heading UP toward the sub (one-way for the round).
 *   { kind: 'grab'       }   — pick up the treasure on the landing tile (after a roll).
 *   { kind: 'drop', idx  }   — drop a carried treasure onto the (blank) landing tile.
 *   { kind: 'pass'       }   — do nothing on the landing tile and end the turn.
 *
 * The dice roll is RNG on the host (the authority); guests just request a roll. seatToMove
 * stays the same seat through their own choose -> roll -> grab/drop/pass. applyIntent
 * validates against the logic and returns the input state unchanged for any illegal /
 * out-of-turn intent. tickKey changes on every action (the log grows on every mutation).
 */

import * as D from './logic'
import type { DeepSeaState } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type DeepSeaIntent =
  | { kind: 'roll' }
  | { kind: 'turnAround' }
  | { kind: 'grab' }
  | { kind: 'drop'; idx: number }
  | { kind: 'pass' }

/** Sentinel value standing in for a rival's still-secret carried treasure. */
const HIDDEN_VALUE = -1

const seatToMove = (s: DeepSeaState): number | null =>
  s.phase === 'over' ? null : s.turn

export const deepSeaAdventureAdapter: GameAdapter<DeepSeaState, DeepSeaIntent> = {
  makeGame: () => D.makeGame(),
  // Read the real diver count off the state so the seat count is always accurate.
  numSeats: s => s.divers.length,
  seatToMove,
  isOver: s => s.phase === 'over',

  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (it stays the same seat through choose -> roll -> act).
    // Never trust the wire: re-validate against the logic, which returns the same ref
    // when an action is illegal in the current phase.
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'turnAround': {
        // Only meaningful before rolling, while still able to commit a direction.
        if (s.phase !== 'choose' || s.chose) return s
        const out = D.chooseDirection(s, 'up')
        return out === s ? s : out
      }
      case 'roll': {
        if (s.phase !== 'choose') return s
        // "Dive deeper": if no direction is committed yet, commit DOWN first (the default
        // forward direction); a prior turnAround leaves the diver headed UP already.
        const ready = s.chose ? s : D.chooseDirection(s, 'down')
        if (ready.phase !== 'choose' || !ready.chose) return s
        const out = D.move(ready)
        return out === ready ? s : out
      }
      case 'grab': {
        if (s.phase !== 'rolled') return s
        const out = D.pickUp(s)
        return out === s ? s : out
      }
      case 'drop': {
        // logic.drop pops the most-recently-held treasure onto a blank landing tile; idx is
        // carried for UI intent parity but the authority drops by the rules.
        if (s.phase !== 'rolled') return s
        const out = D.drop(s)
        return out === s ? s : out
      }
      case 'pass': {
        if (s.phase !== 'rolled') return s
        const out = D.pass(s)
        return out === s ? s : out
      }
      default:
        return s
    }
  },

  // Reuse the game's existing aiStep, which performs exactly ONE AI sub-step (commit a
  // direction / roll+move / grab|drop|pass) and bails on human seat 0 or when it's not the
  // seat's turn. The dice RNG runs here on the host (the authority).
  aiStep: (s, seat) => (s.phase !== 'over' && s.turn === seat ? D.aiStep(s) : s),

  // Changes on EVERY action: turn, round, phase, chose flag, the dice signature, the shared
  // air, every diver's depth + carried count + banked total, and the log length (which grows
  // on every mutation, including back-to-back same-seat sub-steps).
  tickKey: s => {
    const divers = s.divers
      .map(d => `${d.pos}:${d.carrying.length}:${d.banked}:${d.returned ? 1 : 0}`)
      .join('|')
    return `${s.round}-${s.turn}-${s.phase}-${s.chose ? 1 : 0}-${s.air}-${s.dice ? s.dice.join(',') : ''}-${divers}-${s.log.length}-${s.winner ?? ''}`
  },

  // Hidden info: mask the VALUES of OTHER seats' carried treasures (kept face-down until the
  // game ends), preserving the COUNT each rival holds. Your own carry is untouched, and all
  // shared/public info (air, the path tiles, depths, directions, banked scores) is left as-is.
  // The log is cleared for non-host seats so its free-text point values can't leak the masked
  // carried values; a guest renders from the structural state, not the host's narration.
  redactFor: (s, seat) => ({
    ...s,
    divers: s.divers.map(d =>
      d.seat === seat ? d : { ...d, carrying: d.carrying.map(() => HIDDEN_VALUE) },
    ),
    log: seat === 0 ? s.log : [],
  }),
}
