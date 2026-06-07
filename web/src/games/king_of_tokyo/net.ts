/* KING OF TOKYO — netplay adapter. Maps the pure dice-brawl logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Everything is PUBLIC — health, VP,
 * energy, who's in Tokyo, the dice, and the log are all visible to all players, and this
 * build has no face-down power-card deck/shop, so there is NO hidden info and NO redactFor.
 *
 * Seats map directly to monster indices: seat 0 = You, seat 1 & 2 = the other monsters.
 * numSeats reads the real monster count off the state.
 *
 * A turn has sub-steps, so each player decision is a JSON intent:
 *   { kind: 'roll'          }  — roll / reroll the un-kept dice (host RNG); first roll or a reroll
 *   { kind: 'hold',   i     }  — toggle keeping die i between rolls
 *   { kind: 'resolve'       }  — stop rolling and resolve the kept dice (attack/heal/energy/VP)
 *   { kind: 'yield',  yes   }  — the Tokyo defender answers a yield prompt (leave / hold)
 *   { kind: 'end'           }  — end the turn and pass to the next monster
 *
 * The same seat does roll -> hold/reroll -> resolve -> end before passing. The ONE
 * exception is a yield prompt: the monster in Tokyo (the defender, which may be a DIFFERENT
 * seat than the turn) is the one who must answer, so seatToMove returns the defender during
 * the 'yield' phase. applyIntent validates and returns the input state unchanged for any
 * illegal / out-of-turn intent (it never throws). tickKey changes on every action. */

import * as KOT from './logic'
import type { KotState } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type KingOfTokyoIntent =
  | { kind: 'roll' }
  | { kind: 'hold'; i: number }
  | { kind: 'resolve' }
  | { kind: 'yield'; yes: boolean }
  | { kind: 'end' }

/** Whose decision is needed right now: the Tokyo defender during a yield prompt,
 *  otherwise the monster whose turn it is. null when the game is over. */
function seatToMove(s: KotState): number | null {
  if (s.winner != null || s.phase === 'over') return null
  if (s.phase === 'yield' && s.pendingYield != null) return s.pendingYield.defender
  return s.turn
}

export const kingOfTokyoAdapter: GameAdapter<KotState, KingOfTokyoIntent> = {
  makeGame: () => KOT.makeGame(),
  // Read the real monster count off the state so the seat count is always accurate.
  numSeats: s => s.monsters.length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's decision (turn player, or the defender during a yield prompt).
    // Never trust the wire — re-validate against the pure logic, which itself returns the
    // same ref when the action is illegal for the current phase.
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'roll': {
        const out = KOT.rollDice(s)
        return out === s ? s : out
      }
      case 'hold': {
        if (typeof i.i !== 'number') return s
        const out = KOT.toggleKeep(s, i.i)
        return out === s ? s : out
      }
      case 'resolve': {
        const out = KOT.resolveDice(s)
        return out === s ? s : out
      }
      case 'yield': {
        const out = KOT.yieldTokyo(s, i.yes === true)
        return out === s ? s : out
      }
      case 'end': {
        const out = KOT.endTurn(s)
        return out === s ? s : out
      }
      default:
        return s
    }
  },
  // Reuse the game's existing single-step AI. aiStep advances exactly one sub-action for
  // the seat that owes a decision (roll / keep+reroll / resolve / end, or answering an AI
  // yield), so one call == one transition and the timer re-arms via tickKey. The AI dice
  // RNG runs here on the host (the authority). aiStep guards on winner/turn/yield-owner.
  aiStep: s => KOT.aiStep(s),
  // Changes on EVERY action: the logic bumps `step` on each state-advancing call (roll,
  // resolve, yield, end). `kept`/`rolled`/`phase` cover the keep-toggles (which don't bump
  // step), and winner closes out the game.
  tickKey: s =>
    `${s.step}-${s.turn}-${s.phase}-${s.rolled ? 1 : 0}-${s.rerollsLeft}-${s.kept.map(k => (k ? 1 : 0)).join('')}-${s.winner ?? ''}`,
}
