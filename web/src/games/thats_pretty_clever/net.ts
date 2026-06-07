/* THAT'S PRETTY CLEVER! (Ganz schön clever) — netplay adapter. Maps the roll-and-write
 * logic onto the uniform GameAdapter so useGameSession can host/join it. Everything is
 * PUBLIC (all sheets, the table dice and the silver platter), so no redactFor is needed.
 * Seats map directly to player indices: seat 0 = You, seat 1 = Rival. numSeats reads the
 * real player count off the state (s.sheets.length).
 *
 * A turn has many sub-steps, so each decision is one JSON intent:
 *   { kind: 'roll' }                 — active player, in the 'roll' phase (host RNG, public)
 *   { kind: 'reroll' }               — alias of 'roll': re-roll the still-live dice before the
 *                                      next pick (the logic re-enters the 'roll' phase after a
 *                                      mid-turn pick, so this is the same authoritative call)
 *   { kind: 'pick', die, target? }   — choose die index `die`; for the white wild, `target` is
 *                                      the colour track to use. In the 'pick' phase this is the
 *                                      active player's placement; in the 'platter' phase it is a
 *                                      passive opponent taking ONE platter die.
 *   { kind: 'done' }                 — active player ends their pick early (no legal/last die);
 *                                      all live dice fall to the platter for the opponents.
 *
 * seatToMove walks the right players: the ACTIVE player through their roll -> pick -> (re)roll ->
 * pick … sequence, then each PENDING passive opponent takes one platter die. applyIntent
 * validates against the logic and returns the input state UNCHANGED for any illegal / out-of-turn
 * intent (never throws). The winner can be 0, so all guards use `!= null`. tickKey changes on
 * EVERY action. aiStep reuses the existing AI, ONE sub-action per call. */

import * as G from './logic'
import type { State, Color } from './logic'
import type { GameAdapter } from '../../net/protocol'

type TrackColor = Exclude<Color, 'white'>

export type ThatsPrettyCleverIntent =
  | { kind: 'roll' }
  | { kind: 'reroll' }
  | { kind: 'pick'; die: number; target?: TrackColor }
  | { kind: 'done' }

// Whose turn is it to act, or null when the game is over. The active player owns the
// roll/pick phases; in the platter phase the next still-pending opponent acts.
function seatToMove(s: State): number | null {
  if (s.winner != null) return null
  if (s.phase === 'platter') return s.platterPending.length ? s.platterPending[0] : null
  // 'roll' and 'pick' belong to the active player; 'done' is unreachable as a live phase.
  if (s.phase === 'roll' || s.phase === 'pick') return s.active
  return null
}

export const thatsPrettyCleverAdapter: GameAdapter<State, ThatsPrettyCleverIntent> = {
  makeGame: () => G.makeGame(),
  // Read the real player count off the state (currently 2) so it stays in sync automatically.
  numSeats: s => s.sheets.length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'roll':
      case 'reroll': {
        // Both request the host to (re)roll the live dice; only legal in the 'roll' phase for
        // the active player. rollDice returns the same ref if it rejects.
        if (s.phase !== 'roll' || seat !== s.active) return s
        const out = G.rollDice(s)
        return out === s ? s : out
      }
      case 'pick': {
        if (typeof i.die !== 'number') return s
        if (s.phase === 'pick') {
          // Active placement. The white wild needs a target colour; for a coloured die `target`
          // is ignored. pickDie returns the same ref when the placement is illegal.
          if (seat !== s.active) return s
          const out = G.pickDie(s, i.die, i.target)
          return out === s ? s : out
        }
        if (s.phase === 'platter') {
          // A passive opponent takes ONE platter die. platterPick consumes the pending slot even
          // on an illegal placement (a skip), so compare by tickKey, not reference, to detect a
          // genuine no-op (e.g. a bad index).
          const out = G.platterPick(s, seat as 0 | 1, i.die, i.target)
          return out === s ? s : out
        }
        return s
      }
      case 'done': {
        // Only the active player, mid-pick, may bail early (the rest of the dice go to the platter).
        if (s.phase !== 'pick' || seat !== s.active) return s
        const out = G.forfeitPick(s)
        return out === s ? s : out
      }
      default:
        return s
    }
  },
  // Reuse the game's existing AI, ONE sub-action per call. aiActiveTurn drives the active
  // player's roll -> pick -> (re)roll -> pick sequence one step at a time; aiPlatterPick handles
  // a single passive platter take. We only ever advance the AI for the seat that must move, so
  // each call returns a state whose tickKey has changed and the timer re-arms.
  aiStep: (s, seat) => {
    if (s.winner != null) return s
    if (s.phase === 'platter') {
      return s.platterPending.includes(seat as 0 | 1) ? G.aiPlatterPick(s, seat as 0 | 1) : s
    }
    if ((s.phase === 'roll' || s.phase === 'pick') && s.active === seat) return G.aiActiveTurn(s)
    return s
  },
  // Changes on EVERY action: phase, active seat, picks remaining, the live-dice signature, the
  // platter signature, the pending-opponent list, the round, both sheets' total scores, and the
  // log length (which grows on every mutation). Together these flip after a roll, each active
  // pick, a mid-turn re-roll, a passive platter pick, and the end of a turn / round.
  tickKey: s => {
    const roll = s.roll.map(d => d.color + d.value).join(',')
    const plat = s.platter.map(d => d.color + d.value).join(',')
    const scores = `${G.totalScore(s.sheets[0])}.${G.totalScore(s.sheets[1])}`
    return `${s.round}-${s.active}-${s.phase}-${s.picksLeft}-${roll}-${plat}-${s.platterPending.join('')}-${scores}-${s.log.length}-${s.winner ?? ''}`
  },
}
