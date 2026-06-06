/* COCKROACH POKER — pure logic (built for this codebase, not ported).
   A bluffing game for 3 players (you=0, AI=1, AI=2). 64 cards: 8 vermin types × 8 copies.
   All cards are dealt out. On a turn the active player passes a card FACE-DOWN to a target,
   CLAIMING a vermin type (true or a bluff). The receiver either CALLS (guesses TRUE/FALSE —
   on a correct guess the PASSER keeps the revealed card face-up, otherwise the RECEIVER does)
   or PASSES IT ON (peeks, then re-passes to a player who hasn't seen it, with a fresh claim).
   Whoever GAINS the face-up card starts the next turn. A player who collects FOUR face-up of
   the SAME type LOSES; a player who must act with an EMPTY hand also LOSES. The game ends on
   the first loser.

   Randomness is injectable (Rng) so tests are deterministic. Every resolved card adds exactly
   one face-up card to someone (toward the 4-of-a-type loss) and hands strictly shrink, so play
   is bounded and always terminates. */

export const VERMIN = ['cockroach', 'rat', 'bat', 'frog', 'fly', 'spider', 'scorpion', 'stinkbug'] as const
export type Vermin = typeof VERMIN[number]
export const COPIES = 8
export const TYPES = VERMIN.length      // 8
export const DECK_SIZE = COPIES * TYPES // 64
export const LOSE_AT = 4                // 4 of a kind in your pile = you lose
export const NUM_PLAYERS = 3

export interface LogEntry { t: 'sys' | 'you' | 'ai' | 'good' | 'warn'; x: string }

/** A pending face-down pass awaiting the receiver's decision. */
export interface Pending {
  card: Vermin          // the TRUE identity of the passed card (hidden from non-seers in UI)
  claim: Vermin         // what the current passer CLAIMS it is
  from: number          // who passed it this hop
  target: number        // who must now decide
  seenBy: number[]      // every player who has seen the card (passer + prior peekers + target peekers)
}

export interface CockroachState {
  /** Each player's hand: a multiset count per vermin type. */
  hands: Record<Vermin, number>[]
  /** Each player's face-up collected pile: count per vermin type. */
  piles: Record<Vermin, number>[]
  /** The active pass awaiting a decision, or null when it's `turn`'s player to start a pass. */
  pending: Pending | null
  /** Whose turn it is to START a pass (only meaningful when pending == null). */
  turn: number
  loser: number | null
  /** The non-loser with the best board; set together with loser. */
  winner: number | null
  /** Monotonic counter — bumped on EVERY mutation so the AI driver re-arms. */
  step: number
  log: LogEntry[]
}

// ----------------------------------------------------------------------------
// Randomness — injectable, deterministic.
// ----------------------------------------------------------------------------
export interface Rng { next(): number } // returns [0,1)
export function makeRng(seed: number): Rng {
  let s = (seed >>> 0) || 0x9e3779b9
  return {
    next() {
      // mulberry32
      s |= 0; s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function emptyCounts(): Record<Vermin, number> {
  const o = {} as Record<Vermin, number>
  for (const v of VERMIN) o[v] = 0
  return o
}
function cloneCounts(c: Record<Vermin, number>): Record<Vermin, number> {
  const o = {} as Record<Vermin, number>
  for (const v of VERMIN) o[v] = c[v]
  return o
}
function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-30)
}
export function playerName(p: number): string { return p === 0 ? 'You' : `AI ${p}` }
function logTag(p: number): LogEntry['t'] { return p === 0 ? 'you' : 'ai' }

export function handSize(c: Record<Vermin, number>): number {
  let n = 0
  for (const v of VERMIN) n += c[v]
  return n
}
export function pileTotal(c: Record<Vermin, number>): number {
  return handSize(c)
}

/** Total cards across all hands + all piles + pending (always 64). */
export function cardCount(s: CockroachState): number {
  let n = 0
  for (const h of s.hands) n += handSize(h)
  for (const p of s.piles) n += handSize(p)
  if (s.pending != null) n += 1
  return n
}

// ----------------------------------------------------------------------------
// Setup
// ----------------------------------------------------------------------------
/** Build the standard 64-card deck (8 of each type). */
export function freshDeck(): Vermin[] {
  const d: Vermin[] = []
  for (const v of VERMIN) for (let i = 0; i < COPIES; i++) d.push(v)
  return d
}

function shuffle(deck: Vermin[], rng: Rng): Vermin[] {
  const a = deck.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

/**
 * Create a new game. `optionalDeck` (length 64) is dealt in order without shuffling
 * (deterministic tests); otherwise the deck is shuffled with `rng` (default a fixed seed,
 * so even the no-arg call is reproducible).
 */
export function makeGame(optionalDeck?: Vermin[], rng: Rng = makeRng(0xC0CC0)): CockroachState {
  const deck = optionalDeck && optionalDeck.length === DECK_SIZE ? optionalDeck.slice() : shuffle(freshDeck(), rng)
  const hands = [emptyCounts(), emptyCounts(), emptyCounts()]
  deck.forEach((card, i) => { hands[i % NUM_PLAYERS][card]++ })
  return {
    hands,
    piles: [emptyCounts(), emptyCounts(), emptyCounts()],
    pending: null,
    turn: 0,
    loser: null,
    winner: null,
    step: 0,
    log: [{ t: 'sys', x: 'Pass a card face-down and claim a vermin — bluff or tell the truth. Collect four of one kind and you lose.' }],
  }
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------
/** Players (other than `from`/already-seen) eligible to receive a pass-on. */
export function eligibleTargets(s: CockroachState, from: number, seenBy: number[]): number[] {
  const out: number[] = []
  for (let p = 0; p < NUM_PLAYERS; p++) {
    if (p === from) continue
    if (seenBy.includes(p)) continue
    out.push(p)
  }
  return out
}

/** Whose decision is it right now (the human or an AI)? null when the game is over. */
export function decider(s: CockroachState): number | null {
  if (s.loser != null) return null
  if (s.pending != null) return s.pending.target
  return s.turn
}

/** Worst (largest) same-type stack in a pile. */
export function maxStack(pile: Record<Vermin, number>): number {
  let m = 0
  for (const v of VERMIN) if (pile[v] > m) m = pile[v]
  return m
}

// ----------------------------------------------------------------------------
// Resolution
// ----------------------------------------------------------------------------
/** Award the (revealed) pending card to `gainer` as a face-up pile card; check the loss. */
function awardCard(s: CockroachState, gainer: number, card: Vermin, log: LogEntry[]): CockroachState {
  const piles = s.piles.map(cloneCounts)
  piles[gainer][card]++
  const next: CockroachState = {
    ...s,
    piles,
    pending: null,
    turn: gainer,
    step: s.step + 1,
    log,
  }
  // Loss: four of a kind.
  if (piles[gainer][card] >= LOSE_AT) {
    return finishGame({ ...next, log: push(log, 'warn', `${playerName(gainer)} now holds ${LOSE_AT} ${card}s — ${playerName(gainer)} loses!`) }, gainer)
  }
  // Loss: the gainer must now start a pass but has no cards in hand.
  if (handSize(next.hands[gainer]) === 0) {
    return finishGame({ ...next, log: push(next.log, 'warn', `${playerName(gainer)} must pass but has an empty hand — ${playerName(gainer)} loses!`) }, gainer)
  }
  return next
}

/** Set loser + derive the winner (non-loser with the smallest worst-stack, then fewest cards). */
function finishGame(s: CockroachState, loser: number): CockroachState {
  let best: number | null = null
  let bestKey = Infinity
  for (let p = 0; p < NUM_PLAYERS; p++) {
    if (p === loser) continue
    const key = maxStack(s.piles[p]) * 100 + pileTotal(s.piles[p])
    if (key < bestKey) { bestKey = key; best = p }
  }
  const log = push(s.log, best === 0 ? 'good' : 'sys', `${playerName(best!)} wins with the cleanest board.`)
  return { ...s, loser, winner: best, step: s.step + 1, log }
}

// ----------------------------------------------------------------------------
// Actions
// ----------------------------------------------------------------------------
/**
 * The active player (`s.turn`) passes `card` face-down to `target`, claiming `claim`.
 * Requires pending == null, a card of that type in hand, and a valid distinct target.
 */
export function pass(s: CockroachState, card: Vermin, target: number, claim: Vermin): CockroachState {
  if (s.loser != null || s.pending != null) return s
  const from = s.turn
  if (target === from || target < 0 || target >= NUM_PLAYERS) return s
  if (s.hands[from][card] <= 0) return s
  const hands = s.hands.map(cloneCounts)
  hands[from][card]--
  const log = push(s.log, logTag(from), `${playerName(from)} passes a card to ${playerName(target)}, claiming "${claim}".`)
  return {
    ...s,
    hands,
    pending: { card, claim, from, target, seenBy: [from] },
    step: s.step + 1,
    log,
  }
}

/**
 * The pending target CALLS by guessing whether the claim is TRUE.
 * Correct guess → the passer keeps the card face-up; wrong guess → the receiver keeps it.
 */
export function respondCall(s: CockroachState, guessTrue: boolean): CockroachState {
  const p = s.pending
  if (p == null || s.loser != null) return s
  const receiver = p.target
  const isTrue = p.card === p.claim
  const correct = guessTrue === isTrue
  const gainer = correct ? p.from : receiver
  let log = push(s.log, logTag(receiver),
    `${playerName(receiver)} calls ${guessTrue ? 'TRUE' : 'FALSE'} — the card is a ${p.card} (claim "${p.claim}").`)
  log = push(log, correct ? 'good' : 'warn',
    `${playerName(receiver)} guessed ${correct ? 'right' : 'wrong'} — ${playerName(gainer)} takes the ${p.card}.`)
  return awardCard(s, gainer, p.card, log)
}

/**
 * The pending target PASSES IT ON: peeks the card, then re-passes to `target` with `claim`.
 * `target` must be eligible (not the chain's seers). If no eligible target exists this is illegal
 * (the receiver must CALL instead).
 */
export function respondPassOn(s: CockroachState, target: number, claim: Vermin): CockroachState {
  const p = s.pending
  if (p == null || s.loser != null) return s
  const receiver = p.target
  const seenBy = p.seenBy.includes(receiver) ? p.seenBy.slice() : p.seenBy.concat([receiver])
  if (!eligibleTargets(s, receiver, seenBy).includes(target)) return s
  const log = push(s.log, logTag(receiver),
    `${playerName(receiver)} peeks and passes it on to ${playerName(target)}, claiming "${claim}".`)
  return {
    ...s,
    pending: { card: p.card, claim, from: receiver, target, seenBy },
    step: s.step + 1,
    log,
  }
}

/** Can the current receiver pass the card on (is there any eligible onward target)? */
export function canPassOn(s: CockroachState): boolean {
  const p = s.pending
  if (p == null) return false
  const seenBy = p.seenBy.includes(p.target) ? p.seenBy : p.seenBy.concat([p.target])
  return eligibleTargets(s, p.target, seenBy).length > 0
}

// ----------------------------------------------------------------------------
// AI — heuristic bluff / call / pass-on. Fast, simple, always terminating.
// ----------------------------------------------------------------------------

/** What `observer` believes about the chance the claim is TRUE, from cards it can see. */
function truthProbability(s: CockroachState, observer: number): number {
  const p = s.pending!
  // If the observer has already seen the card (it's the receiver and we let it cheat-check is
  // disallowed; but for a fresh receiver it never has), it can't. Use public counting:
  // copies of `claim` already accounted for (this observer's hand + all face-up piles).
  let known = 0
  for (let pl = 0; pl < NUM_PLAYERS; pl++) known += s.piles[pl][s.pending!.claim]
  known += s.hands[observer][p.claim]
  const remaining = COPIES - known // copies of the claimed type that could still be the hidden card
  // Base credibility: more remaining copies → more plausible the claim is honest. With 0 left it
  // is certainly a bluff. Scale into a soft probability.
  if (remaining <= 0) return 0.04
  // Each unaccounted copy lifts plausibility; cap below 1 (passers bluff ~half the time).
  const base = 0.30 + 0.09 * remaining
  return Math.max(0.05, Math.min(0.9, base))
}

/** Pick the vermin in `hand` that is SAFEST to shed (fewest already in our own pile, then most copies in hand). */
function pickCardToPass(s: CockroachState, who: number, rng: Rng): Vermin {
  const hand = s.hands[who]
  const owned = VERMIN.filter(v => hand[v] > 0)
  let best = owned[0]
  let bestKey = -Infinity
  for (const v of owned) {
    // Prefer types we hold many of (easy to spare) and that we DON'T fear collecting.
    const key = hand[v] * 2 + (4 - Math.min(4, s.piles[who][v])) + rng.next() * 0.5
    if (key > bestKey) { bestKey = key; best = v }
  }
  return best
}

/** Choose a target to pass to (prefer a player who already has a tall stack we can poison). */
function pickTarget(s: CockroachState, who: number, claim: Vermin, rng: Rng): number {
  let best = -1
  let bestKey = -Infinity
  for (let p = 0; p < NUM_PLAYERS; p++) {
    if (p === who) continue
    if (handSize(s.hands[p]) === 0) continue // passing to an empty hand would just bounce back oddly; avoid if possible
    // Targeting a player who already holds several of the CLAIMED type pressures them.
    const key = s.piles[p][claim] * 3 + rng.next()
    if (key > bestKey) { bestKey = key; best = p }
  }
  if (best < 0) {
    // Everyone else is empty-handed; pass to anyone valid (they'll be forced to call).
    for (let p = 0; p < NUM_PLAYERS; p++) if (p !== who) { best = p; break }
  }
  return best
}

export interface AiAction {
  kind: 'pass' | 'call' | 'passon'
  card?: Vermin
  target?: number
  claim?: Vermin
  guessTrue?: boolean
}

/** Decide the AI's next action for whoever's decision it currently is. Pure (uses injected rng). */
export function aiDecide(s: CockroachState, rng: Rng = makeRng((s.step * 2654435761) >>> 0)): AiAction | null {
  if (s.loser != null) return null
  if (s.pending == null) {
    // Start a pass.
    const who = s.turn
    if (handSize(s.hands[who]) === 0) return null // caller handles forced loss
    const card = pickCardToPass(s, who, rng)
    // Bluff roughly half the time; when honest, claim the card's true type.
    const bluff = rng.next() < 0.5
    let claim: Vermin = card
    if (bluff) {
      // Claim a different type, ideally one the target already fears (decided after target pick).
      const others = VERMIN.filter(v => v !== card)
      claim = others[Math.floor(rng.next() * others.length)]
    }
    const target = pickTarget(s, who, claim, rng)
    return { kind: 'pass', card, target, claim }
  }
  // Respond to a pending pass.
  const p = s.pending
  const me = p.target
  const honest = truthProbability(s, me) // P(claim is true)
  // Decide whether to call now or pass it on.
  const canRelay = canPassOn(s)
  // We're more inclined to relay when the claim is very suspicious AND we have somewhere to send it.
  const suspicious = honest < 0.42
  if (canRelay && (suspicious || rng.next() < 0.35)) {
    // Pass it on. We now KNOW the true card (we peeked). Re-claim: usually keep it plausible,
    // sometimes bluff. We want to NOT poison ourselves, so just relay onward.
    const seen = p.seenBy.includes(me) ? p.seenBy : p.seenBy.concat([me])
    const targets = eligibleTargets(s, me, seen).filter(t => handSize(s.hands[t]) > 0)
    const pool = targets.length ? targets : eligibleTargets(s, me, seen)
    const target = pool[Math.floor(rng.next() * pool.length)]
    // Since we saw the true card, bluff half the time on the new claim.
    const trueCard = p.card
    let claim: Vermin = trueCard
    if (rng.next() < 0.5) {
      const others = VERMIN.filter(v => v !== trueCard)
      claim = others[Math.floor(rng.next() * others.length)]
    }
    return { kind: 'passon', target, claim }
  }
  // Call. Guess TRUE if we believe the claim more often than not.
  // Add small jitter so play isn't perfectly predictable.
  const guessTrue = honest + (rng.next() - 0.5) * 0.1 >= 0.5
  return { kind: 'call', guessTrue }
}

/** If the player to act must START a pass but has an empty hand, end the game with them as loser.
    Safe to call any time; a no-op otherwise. Used by the UI on the human's turn. */
export function forcedLossCheck(s: CockroachState): CockroachState {
  if (s.loser != null || s.pending != null) return s
  const who = s.turn
  if (handSize(s.hands[who]) > 0) return s
  return finishGame(
    { ...s, step: s.step + 1, log: push(s.log, 'warn', `${playerName(who)} must pass but has an empty hand — ${playerName(who)} loses!`) },
    who,
  )
}

/** Apply the AI's decision (a single step). Returns a new state. Used by the UI driver + tests. */
export function aiStep(s: CockroachState, rng?: Rng): CockroachState {
  if (s.loser != null) return s
  const who = decider(s)
  if (who == null || who === 0) return s // never auto-drive the human
  // Forced-loss guard: AI must start a pass but has no cards.
  if (s.pending == null && handSize(s.hands[who]) === 0) {
    return finishGame({ ...s, step: s.step + 1, log: push(s.log, 'warn', `${playerName(who)} must pass but has an empty hand — ${playerName(who)} loses!`) }, who)
  }
  const act = aiDecide(s, rng)
  if (act == null) return s
  if (act.kind === 'pass') return pass(s, act.card!, act.target!, act.claim!)
  if (act.kind === 'passon') return respondPassOn(s, act.target!, act.claim!)
  return respondCall(s, !!act.guessTrue)
}
