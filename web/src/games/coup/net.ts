/* COUP — netplay adapter. Maps coup's pure state machine onto the uniform GameAdapter so
 * useGameSession can host/join it. Three seats: 0 = You, 1 = Bishop, 2 = Vesper (matches the
 * player indices in logic's makeGame).
 *
 * Coup is not a simple "whose turn" game: the life of one action threads through reactive
 * decisions (challenge / block / lose-influence / exchange). The pure logic already resolves
 * these ONE decider at a time and exposes who that is, so seatToMove just reads the active
 * decider off the state machine:
 *   - no pending      -> the turn player declares an ACTION
 *   - action/block challenge or a block window -> pending.decider must react
 *   - lose            -> pending.loser must reveal a card
 *   - exchange        -> pending.actor must pick which influence to keep
 *
 * Decisions are modeled as KINDED intents and validated through the existing logic functions
 * (declareAction / challenge / passChallenge / block / passBlock / resolveLossOfInfluence /
 * resolveExchange). applyIntent returns the input state unchanged for anything illegal or out
 * of turn — it never throws.
 *
 * HIDDEN INFO: each player holds 2 FACE-DOWN influence cards; only revealed (lost) cards are
 * public, and the court deck is secret. redactFor hides every OTHER seat's un-revealed card
 * characters (keeping the slot + its revealed flag so the UI renders the right backs) and blanks
 * the whole deck. It also blanks pending.drawn (the exchange draw) unless the viewer is the actor
 * choosing. A leak test guards all of this.
 *
 * RNG: the host needs an rng for AI bluff dice and for reshuffling on exchange. We keep a module
 * rng so the adapter stays a stateless GameAdapter; determinism in tests comes from feeding fixed
 * decks via makeGame and exercising specific intents (the leak/sync paths don't depend on it).
 */

import * as C from './logic'
import type { CoupState, Character } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Reactive + proactive decisions, all JSON-serializable plain objects. */
export type CoupIntent =
  | { kind: 'action'; type: C.ActionType; target?: number | null }
  | { kind: 'challenge' }
  | { kind: 'allow' }                 // decline to challenge (a challenge phase)
  | { kind: 'block'; as: Character }
  | { kind: 'reveal'; card: number }  // lose-influence: index of the card to reveal
  | { kind: 'exchange'; keep: Character[] }

const HIDDEN_CHAR = '?' as unknown as Character  // placeholder kept off the wire; never a real id

/** Host-side rng for AI bluff dice + exchange reshuffle. */
const rng = C.makeRng((Date.now() & 0x7fffffff) || 1)

export const coupAdapter: GameAdapter<CoupState, CoupIntent> = {
  makeGame: () => C.makeGame(),

  numSeats: s => s.players.length,

  // Whoever must act or react next, or null when the game is over.
  seatToMove: s => {
    if (s.winner != null) return null
    const p = s.pending
    if (p == null) return s.turn
    if (p.kind === 'action_challenge' || p.kind === 'block_challenge' || p.kind === 'block') return p.decider
    if (p.kind === 'lose') return p.loser
    if (p.kind === 'exchange') return p.actor
    return null
  },

  isOver: s => s.winner != null,

  applyIntent: (s, seat, intent) => {
    if (s.winner != null) return s
    const p = s.pending

    // Proactive action turn (no pending sub-state).
    if (p == null) {
      if (intent.kind !== 'action' || s.turn !== seat) return s
      if (!C.legalActions(s, seat).includes(intent.type)) return s
      const target = intent.target ?? null
      if (C.actionNeedsTarget(intent.type)) {
        if (!C.legalTargets(s, seat).includes(target ?? -1)) return s
      }
      return C.declareAction(s, seat, intent.type, target)
    }

    // Challenge phases: the active decider may challenge or allow.
    if (p.kind === 'action_challenge' || p.kind === 'block_challenge') {
      if (p.decider !== seat) return s
      if (intent.kind === 'challenge') return C.challenge(s, seat)
      if (intent.kind === 'allow') return C.passChallenge(s, seat)
      return s
    }

    // Block window: the active decider may block (claiming a legal blocker) or allow.
    if (p.kind === 'block') {
      if (p.decider !== seat) return s
      if (intent.kind === 'allow') return C.passBlock(s, seat)
      if (intent.kind === 'block') {
        if (!C.blockers(p.action).includes(intent.as)) return s
        return C.block(s, seat, intent.as)
      }
      return s
    }

    // Forced loss of influence: only the loser reveals, and only a live card index is valid.
    if (p.kind === 'lose') {
      if (p.loser !== seat || intent.kind !== 'reveal') return s
      const lp = s.players[seat]
      const idx = intent.card
      if (!Number.isInteger(idx) || idx < 0 || idx >= lp.cards.length) return s
      if (lp.cards[idx].revealed) return s
      return C.resolveLossOfInfluence(s, idx)
    }

    // Exchange: only the actor chooses which characters to keep.
    if (p.kind === 'exchange') {
      if (p.actor !== seat || intent.kind !== 'exchange') return s
      if (!Array.isArray(intent.keep)) return s
      // resolveExchange sanitizes an illegal `keep` to a safe fallback, so it can't corrupt state;
      // this only ever advances the game (never a no-op against a valid exchange).
      return C.resolveExchange(s, intent.keep, rng)
    }

    return s
  },

  aiStep: s => C.aiStep(s, rng),

  // Changes on EVERY transition: log grows on each step, and the pending shape (phase + active
  // decider) shifts as the reaction window walks from player to player.
  tickKey: s => {
    const p = s.pending
    const pk = p ? `${p.kind}:${p.decider ?? ''}:${p.loser ?? ''}:${p.actor}:${p.pendingDeciders.join(',')}` : 'turn'
    return `${s.log.length}-${s.turn}-${pk}-${s.winner ?? ''}`
  },

  // Hidden info: hide every OTHER seat's un-revealed card characters, blank the deck, and hide the
  // exchange draw from anyone but the actor choosing it. Revealed (lost) cards stay public.
  redactFor: (s, seat) => {
    const players = s.players.map(pl =>
      pl.id === seat
        ? pl
        : Object.assign({}, pl, {
            cards: pl.cards.map(c => (c.revealed ? c : { char: HIDDEN_CHAR, revealed: false })),
          }),
    )
    const out = Object.assign({}, s, {
      players,
      deck: s.deck.map(() => HIDDEN_CHAR),
    }) as CoupState
    if (s.pending && s.pending.kind === 'exchange' && s.pending.actor !== seat) {
      out.pending = Object.assign({}, s.pending, { drawn: s.pending.drawn.map(() => HIDDEN_CHAR) })
    }
    return out
  },
}
