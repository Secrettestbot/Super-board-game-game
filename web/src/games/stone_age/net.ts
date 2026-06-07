/* STONE AGE — netplay adapter. Maps the pure worker-placement logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Everything is PUBLIC — the board, every
 * player's resources, workers, tools, farm, and claimed buildings are all visible — so no
 * redactFor is needed (this implementation has no hidden civilization hand cards).
 *
 * Seats map directly to player indices: seat 0 = You, seat 1 = the rival clan. numSeats
 * reads the real player count off the state.
 *
 * A round has phases (place -> resolve -> feed), and within them each decision is a
 * JSON intent submitted by the seat whose turn it is:
 *   { kind: 'place', space, count } — place a worker batch onto an action space
 *   { kind: 'resolve' }            — resolve THIS seat's placements (gather DICE roll on
 *                                    the host RNG, grow tribe, craft tools, build, etc.)
 *   { kind: 'feed' }               — feed this seat's tribe (ends round on the last seat)
 *
 * The gathering dice are RNG on the host (the authority): resolvePlacements()/feedPhase()
 * run with Math.random on the host, and guests only request the action. applyIntent
 * validates against the logic and returns the input state unchanged for any illegal /
 * out-of-turn intent (never throws). tickKey changes on every action. */

import * as SA from './logic'
import type { State, SpaceId } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type StoneAgeIntent =
  | { kind: 'place'; space: SpaceId; count: number }
  | { kind: 'resolve' }
  | { kind: 'feed' }

const seatToMove = (s: State): number | null => (s.winner == null ? s.turn : null)

export const stoneAgeAdapter: GameAdapter<State, StoneAgeIntent> = {
  makeGame: () => SA.makeGame(),
  // Read the real player count off the state so a future 3/4-player game reports its true
  // seat count automatically.
  numSeats: s => s.players.length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (placement / resolve / feed are all driven by s.turn).
    // Never trust the wire: re-validate against the logic, which returns the same ref on
    // any illegal action.
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'place': {
        if (s.phase !== 'place' || typeof i.count !== 'number') return s
        // canPlace() already enforces phase/turn/slot/count rules; placeWorker returns the
        // same ref when the placement is illegal.
        return SA.placeWorker(s, seat, i.space, i.count)
      }
      case 'resolve': {
        if (s.phase !== 'resolve') return s
        // Gather dice roll runs here on the host RNG (the authority).
        const out = SA.resolvePlacements(s)
        return out === s ? s : out
      }
      case 'feed': {
        if (s.phase !== 'feed') return s
        const out = SA.feedPhase(s, seat)
        return out === s ? s : out
      }
      default:
        return s
    }
  },
  // Reuse the game's existing aiTurn, which performs ONE sub-step for the current phase
  // (place a batch / resolve / feed) and only acts for the seat at s.turn (it guards
  // against player 0). The AI gather dice RNG runs here on the host. After each call the
  // tick changes (placement turn, resolveIdx, phase, round, or log length), re-arming the
  // timer so the AI completes its multi-step turn without stalling.
  aiStep: (s, seat) => (s.winner == null && s.turn === seat ? SA.aiTurn(s) : s),
  // Changes on EVERY action: round, phase, turn, remaining placements, resolve index, and
  // the log length (which grows on every mutation, including back-to-back same-seat
  // placements within the place phase).
  tickKey: s =>
    `${s.round}-${s.phase}-${s.turn}-${s.toPlace.join('.')}-${s.resolveIdx}-${s.log.length}-${s.winner ?? ''}`,
}
