/* CODENAMES DUET — netplay adapter. Maps the cooperative word-association logic onto
 * the uniform GameAdapter so useGameSession can host/join it. Two seats map directly to
 * the two players: seat 0 = You (the host / original human), seat 1 = your partner.
 *
 * CO-OP: both players share one mission — contact all 15 agents within the turn budget.
 * The public board WORDS, the active clue, the shared turn counter, the contacted/revealed
 * markers and the status are all PUBLIC and stay intact.
 *
 * HIDDEN INFO: each player has their OWN secret KEY CARD — i.e. each card's `roles[p]`
 * tells player p whether that word is an agent / bystander / assassin from THEIR side.
 * You must NOT see your partner's key (you give clues from your key, they give from theirs).
 * redactFor therefore replaces every OTHER seat's per-card role with a neutral placeholder,
 * EXCEPT on cards already resolved (contacted/revealed) whose true role is public, and
 * except when the game is over (then everything is revealed for the result screen). A leak
 * test guards this: a seat never sees the other seat's still-hidden key entries.
 *
 * Turn model: when there is no active clue the CLUE-GIVER (s.clueGiver) acts by giving a
 * clue; once a clue exists the GUESSER (the player who is NOT clue.from) acts by tapping a
 * word or passing. Intents — {kind:'clue',word,count} (clue-giver) and
 * {kind:'guess',cell} / {kind:'pass'} (guesser) — are validated against the live state so
 * the host never trusts a guest. Out-of-turn / illegal intents return the input unchanged. */

import * as G from './logic'
import type { State, Role } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Wire intents. `clue` is the clue-giver's action; `guess`/`pass` are the guesser's. */
export type CodenamesDuetIntent =
  | { kind: 'clue'; word: string; count: number }
  | { kind: 'guess'; cell: number }
  | { kind: 'pass' }

/** A neutral role placeholder hiding the other seat's true key-card entry. */
const HIDDEN_ROLE = 'hidden' as unknown as Role

/** The seat acting right now: clue-giver when no clue is active, else the guesser. */
function actor(s: State): 0 | 1 {
  return s.clue == null ? s.clueGiver : (s.clue.from === 0 ? 1 : 0)
}

export const codenamesDuetAdapter: GameAdapter<State, CodenamesDuetIntent> = {
  makeGame: () => G.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.status === 'playing' ? actor(s) : null),
  isOver: s => s.status !== 'playing',
  applyIntent: (s, seat, i) => {
    if (s.status !== 'playing') return s
    if (actor(s) !== seat) return s
    if (i.kind === 'clue') {
      // Only the clue-giver, only when no clue is active. setHumanClue re-validates and
      // clamps the count; reject empties up front so a blank intent is a no-op.
      if (s.clue != null) return s
      const word = (i.word ?? '').trim()
      if (word.length === 0) return s
      const next = G.setHumanClue(s, word, i.count)
      return next.clue == null ? s : next // setHumanClue no-ops -> unchanged
    }
    if (i.kind === 'guess') {
      // Only the guesser, only with an active clue, only a real still-hidden cell.
      if (s.clue == null) return s
      if (i.cell < 0 || i.cell >= s.cards.length) return s
      const card = s.cards[i.cell]
      if (card.contacted) return s // already an agent — can't re-tap
      return G.guess(s, card.word)
    }
    // pass: the guesser voluntarily ends the guessing phase (only with an active clue).
    if (s.clue == null) return s
    return passTurn(s)
  },
  // Reuse the existing AI for both phases: give a clue from its key, or run its full
  // guessing phase for the active clue. Only ever called for the AI's own seat.
  aiStep: (s, seat) => {
    if (s.status !== 'playing' || actor(s) !== seat) return s
    if (s.clue == null) return G.giveClue(s, seat as 0 | 1)
    return G.aiGuess(s)
  },
  // Changes on EVERY transition: turns taken bump per turn-end, the clue presence flips
  // each phase, and contacted count grows on every successful guess.
  tickKey: s => `${s.turnsTaken}-${s.clueGiver}-${s.clue ? s.clue.remaining : 'x'}-${s.cards.filter(c => c.contacted).length}-${s.status}`,
  // Hidden info: hide every OTHER seat's per-card key role while the game is live, except
  // on cards already resolved (their role is public) — then reveal all at game over.
  redactFor: (s, seat) => {
    if (s.status !== 'playing') return s
    const other = seat === 0 ? 1 : 0
    return {
      ...s,
      cards: s.cards.map(c => {
        // A resolved card's role is public knowledge; keep it visible to both seats.
        if (c.contacted || c.revealed) return { ...c, roles: [c.roles[0], c.roles[1]] as [Role, Role] }
        const roles: [Role, Role] = [c.roles[0], c.roles[1]]
        roles[other] = HIDDEN_ROLE
        return { ...c, roles }
      }),
      clue: s.clue ? { ...s.clue } : null,
    }
  },
}

/** End the current turn when the guesser passes. The pure logic exposes no standalone
 *  end-turn, so a pass is realised through the legal guesser action that ends a turn without
 *  loss: tapping one of the guesser's own bystanders (which reveals it and ends the turn).
 *  If no such bystander remains (degenerate; a 25-card board always retains some), the turn
 *  is kept unchanged so applyIntent never throws. */
function passTurn(s: State): State {
  const guesser: 0 | 1 = s.clue!.from === 0 ? 1 : 0
  const bystander = s.cards.find(c => !c.contacted && !c.revealed && c.roles[guesser] === 'bystander')
  return bystander ? G.guess(s, bystander.word) : s
}
