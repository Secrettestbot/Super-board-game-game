/* QWIXX — netplay adapter. Maps the roll-and-write logic onto the uniform GameAdapter
 * so useGameSession can host/join it. Everything is PUBLIC (all sheets, dice, penalties),
 * so no redactFor is needed. Seats map directly to player indices: seat 0 = You, seat 1 =
 * Rival. numSeats reads the real player count off the state.
 *
 * Qwixx has a simultaneous/secondary-mark phase: the ACTIVE player rolls six dice (host
 * RNG, public); then BOTH players may cross the white-dice sum, and the active player may
 * ALSO cross a white+colour sum. The session is strictly one-seat-at-a-time, so we
 * SERIALIZE that window: in the 'act' phase the PASSIVE player reacts first (white-sum or
 * pass), then the ACTIVE player finishes (white-sum + colour, then ends the turn). Each
 * player's decision is one JSON intent:
 *   { kind: 'roll' }              — active only, in the 'roll' phase (host RNG)
 *   { kind: 'mark', color, index} — cross a legal cell (kind white/colour auto-detected)
 *   { kind: 'pass' }              — decline the rest of your window:
 *                                     passive -> records they took no white-sum this turn
 *                                     active  -> ends the turn (penalty if nothing crossed)
 *
 * seatToMove returns whoever the logic says must act next. tickKey changes on EVERY action.
 * applyIntent validates against the logic and returns the input state unchanged for any
 * illegal / out-of-turn intent. The winner can be 0, so all guards use `!= null`. */

import * as QX from './logic'
import type { QwixxState, Color } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type QwixxIntent =
  | { kind: 'roll' }
  | { kind: 'mark'; color: Color; index: number }
  | { kind: 'pass' }

const other = (p: number): 0 | 1 => (p === 0 ? 1 : 0)

// Does this passive player still have an open white-sum decision (a legal white cross they
// haven't taken yet)? Only then do they hold the move during the 'act' window.
function passiveHasWhite(s: QwixxState, p: 0 | 1): boolean {
  if (s.whiteTakenBy[p]) return false
  return QX.options(s, p).some(o => o.kind === 'white')
}

// A passive player declining their white-sum window: record that they took no white-sum
// this turn (whiteTakenBy[p] = true) without crossing anything. There is no logic fn for a
// passive decline, so the adapter performs this minimal, public-field-only transition.
function passiveDecline(s: QwixxState, p: 0 | 1): QwixxState {
  const wt = s.whiteTakenBy.slice()
  wt[p] = true
  return Object.assign({}, s, { whiteTakenBy: wt })
}

// Whose turn is it to act, or null when the game is over. Serializes the 'act' window:
// passive (while they have a pending white-sum) -> active.
function seatToMove(s: QwixxState): number | null {
  if (s.winner != null) return null
  if (s.phase === 'roll') return s.active // only the active player may roll
  // 'act' phase: the passive player reacts first while they still hold a white decision.
  const passive = other(s.active)
  if (passiveHasWhite(s, passive)) return passive
  return s.active
}

export const qwixxAdapter: GameAdapter<QwixxState, QwixxIntent> = {
  makeGame: () => QX.makeGame(),
  numSeats: s => s.players.length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (seatToMove(s) !== seat || !i) return s
    const sd = seat as 0 | 1
    switch (i.kind) {
      case 'roll': {
        if (s.phase !== 'roll' || seat !== s.active) return s
        const out = QX.rollDice(s)
        return out === s ? s : out
      }
      case 'mark': {
        if (s.phase !== 'act' || typeof i.index !== 'number') return s
        // Re-validate against the legal set for this seat; never trust the wire. The
        // logic's `cross` also re-checks, but we resolve the kind (white vs colour) from
        // the seat's own options so we call it with the right kind.
        const o = QX.options(s, sd).find(x => x.color === i.color && x.index === i.index)
        if (!o) return s
        const out = QX.cross(s, sd, o.color, o.index, o.kind)
        return out === s ? s : out
      }
      case 'pass': {
        if (s.phase !== 'act') return s
        if (seat === s.active) {
          // The active player declines the rest of their window -> end the turn (logic
          // applies the no-cross penalty if they crossed nothing this turn).
          const out = QX.endTurn(s)
          return out === s ? s : out
        }
        // A passive player declining their white-sum window.
        if (!passiveHasWhite(s, sd)) return s
        return passiveDecline(s, sd)
      }
      default:
        return s
    }
  },
  // Reuse the game's existing AI, ONE action per call. logic.aiStep drives the ACTIVE
  // player's turn one decision at a time (roll -> white -> colour -> end). passiveWhite
  // handles a passive player's single white-sum reaction. We only ever advance the AI for
  // the seat that must move, so each call returns a state whose tickKey has changed.
  aiStep: (s, seat) => {
    if (s.winner != null) return s
    const sd = seat as 0 | 1
    if (seat === s.active) return QX.aiStep(s)
    // Passive AI: take a sensible white-sum, else decline so the move passes to the active.
    const out = QX.passiveWhite(s, sd)
    return out === s ? passiveDecline(s, sd) : out
  },
  // Changes on EVERY action: turn number, active seat, phase, the dice signature, both
  // players' white-taken flags + the active player's acted flags, total crosses + penalties,
  // lock count, and the log length (grows on every mutation). Together these flip after a
  // roll, each cross, a passive decline, and the end of a turn.
  tickKey: s => {
    const dice = s.dice ? s.dice.join(',') : ''
    let crosses = 0
    for (const p of s.players) for (const c of QX.COLORS) for (const m of p.rows[c].marks) if (m) crosses++
    const pens = s.players.map(p => p.penalties).join('.')
    return `${s.turnNo}-${s.active}-${s.phase}-${dice}-${s.whiteTakenBy.join('')}-${s.acted.white ? 1 : 0}${s.acted.color ? 1 : 0}-${crosses}-${pens}-${s.locks}-${s.log.length}-${s.winner ?? ''}`
  },
}
