/* JOTTO — netplay adapter. Maps jotto's pure word-deduction logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Seats map to the two players:
 * seat 0 = the original human side (moves first), seat 1 = the opponent (AI when unfilled).
 *
 * HIDDEN INFO: each player holds a SECRET 5-LETTER WORD the opponent is trying to deduce.
 * Guesses and their "jot" feedback (the count of letters in common) are fully PUBLIC — they
 * live in `history`, which is never redacted. The only secret is `secrets`: you always see
 * your OWN word, but the OPPONENT's word must be hidden while the game is live. redactFor
 * therefore replaces every OTHER seat's secret with a neutral placeholder ('?????', which is
 * not a real playable word, so a guest can't reconstruct it). At game over both words are
 * revealed so the result screen can show the opponent's word, matching the solo UI. A leak
 * test guards the during-play redaction so the host's secret never crosses the wire.
 *
 * Intent is a single action — GUESS a word — validated against the live turn and dictionary
 * so the host never trusts a guest-supplied (or invalid) word. */

import * as J from './logic'
import type { JottoState } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Wire intent: guess a 5-letter word against the opponent's secret. */
export interface JottoIntent {
  kind: 'guess'
  word: string
}

/** A placeholder that hides another seat's secret word (never a valid playable word). */
const HIDDEN_WORD = '?????'

export const jottoAdapter: GameAdapter<JottoState, JottoIntent> = {
  makeGame: () => J.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null ? s.turn : null), // turn (0/1) == seat
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    if (i == null || i.kind !== 'guess' || typeof i.word !== 'string') return s
    const w = i.word.toLowerCase()
    if (!J.isValidWord(w)) return s // not a real playable word -> reject, never trust the guest
    return J.guess(s, seat as 0 | 1, w)
  },
  aiStep: s => {
    const g = J.aiGuess(s)
    return g == null ? s : J.guess(s, s.turn, g)
  },
  // Changes on EVERY transition: the current player's guess history grows each action and
  // the turn flips, plus the winner field once decided.
  tickKey: s => `${s.turn}-${s.history[0].length}-${s.history[1].length}-${s.winner ?? ''}`,
  // Hidden info: while the game is live, blank every OTHER seat's secret word. At game over
  // reveal everything so the result display can show the opponent's word.
  redactFor: (s, seat) => {
    if (s.winner != null) return s
    return {
      ...s,
      secrets: s.secrets.map((w, i) => (i === seat ? w : HIDDEN_WORD)) as [string, string],
    }
  },
}
