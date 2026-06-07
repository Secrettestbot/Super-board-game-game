/* CRYPTID — netplay adapter. Maps cryptid's pure logic onto the uniform GameAdapter
 * so useGameSession can host/join it. Seats map to the two naturalists:
 * seat 0 = 'you' (the original human side, moves first), seat 1 = the rival.
 *
 * HIDDEN INFO: each player holds ONE secret clue, and the board secretly hides the
 * cryptid on the single hex satisfying every clue. Only the public map, the placed
 * discs/cubes (markers), and your OWN clue are yours to see. redactFor therefore, while
 * the game is live, replaces every OTHER seat's clue with a neutral placeholder and
 * blanks the true `cryptid` index (so a guest can't just search the answer). When the
 * game is over every clue + the cryptid are revealed so the result screen can show the
 * rival's clue and the lair — matching the solo UI. A leak test guards the during-play
 * redaction so no other seat's clue type/terrain/color ever crosses the wire.
 *
 * Intents are the two standard actions — ASK a hex (the rival drops a disc=fits or
 * cube=no per their clue) and SEARCH a hex (a correct guess wins, else a penalty cube).
 * Both are validated against the live turn/markers so the host never trusts a guest. */

import * as C from './logic'
import type { CryptidState, Clue, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Wire intent: ask the rival about a hex, or search a hex for the cryptid. */
export type CryptidIntent =
  | { kind: 'question'; target: number; cell: number }
  | { kind: 'search'; cell: number }

/** A neutral placeholder that hides another seat's real clue identity. */
function hiddenClue(): Clue {
  return { type: 'twoTerrains', a: '?' as never, b: '?' as never }
}

export const cryptidAdapter: GameAdapter<CryptidState, CryptidIntent> = {
  makeGame: () => C.makeGame(),
  // Two clues, so two seats; read it off the state so it stays in lockstep with logic.
  numSeats: s => s.clues.length,
  seatToMove: s => (s.winner == null ? s.turn : null), // turn (0/1) == seat
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    const asker = seat as Player
    if (i.kind === 'question') {
      // Validate: target must be a real, other seat, the hex in range, and unanswered.
      if (i.target < 0 || i.target >= s.clues.length) return s
      if (i.target === seat) return s
      if (i.cell < 0 || i.cell >= C.NHEX) return s
      if (s.markers[i.target as Player][i.cell] != null) return s // already answered
      return C.ask(s, asker, i.target as Player, i.cell)
    }
    // search
    if (i.cell < 0 || i.cell >= C.NHEX) return s
    return C.search(s, asker, i.cell)
  },
  aiStep: s => C.aiTurn(s),
  // Changes on EVERY transition: turn flips each move and the log grows each action.
  tickKey: s => `${s.turn}-${s.winner ?? ''}-${s.log.length}`,
  // Hidden info: while the game is live, blank every OTHER seat's clue and the true
  // cryptid index. At game over reveal everything for the result display.
  redactFor: (s, seat) => {
    if (s.winner != null) return s
    return {
      ...s,
      clues: s.clues.map((cl, i) => (i === seat ? cl : hiddenClue())) as [Clue, Clue],
      cryptid: -1,
    }
  },
}
