/* SUSHI GO! — logic (built for this codebase, not ported).
   A fast card-drafting / "draft and pass" game. Three players (you = seat 0, two AI
   = seats 1,2) play three rounds. Each round everyone is dealt a hand; every turn ALL
   players simultaneously keep one card face-up in front of them, then pass the rest of
   their hands to the LEFT. Repeat until hands are empty, then score the round. Pudding
   is held and scored once at GAME END. Highest total over three rounds wins.

   Pure, deterministic, no React/DOM. makeGame(optionalDeck?) accepts a pre-built deck for
   tests; otherwise it shuffles a fresh Sushi Go deck. */

export const NPLAYERS = 3
export const ROUNDS = 3
/** 3 players → 9 cards per hand (classic Sushi Go deal count). */
export const HAND_SIZE = 9

/** The card kinds. Maki/Nigiri carry a numeric value field. */
export type Kind =
  | 'tempura' | 'sashimi' | 'dumpling'
  | 'maki' | 'nigiri' | 'wasabi' | 'chopsticks' | 'pudding'

export interface Card {
  /** Stable unique id so React keys + tests can track individual cards. */
  id: number
  kind: Kind
  /** Maki: roll-icon count (1..3). Nigiri: base points (egg=1, salmon=2, squid=3). */
  val?: number
}

export interface LogEntry { t: string; x: string }

export interface SushiState {
  /** Each seat's current hand (cards still to be drafted). hands[seat]. */
  hands: Card[][]
  /** Each seat's face-up collected cards this round. */
  collected: Card[][]
  /** Puddings each seat has banked across the whole game (kept aside, scored at end). */
  puddings: number[]
  /** Cumulative game score per seat (sum of finished rounds; pudding added at game end). */
  scores: number[]
  /** This round's per-seat score, frozen after each round scoring (for the panel). */
  roundScores: number[]
  round: number            // 1..ROUNDS
  /** Pending simultaneous picks: pending[seat] = chosen card id, or null if not yet chosen. */
  pending: (number | null)[]
  /** Optional second pick id when a seat spent chopsticks this turn (id or null). */
  pendingExtra: (number | null)[]
  /** Whether each seat is "armed" to use chopsticks this turn (take 2). UI/AI flag. */
  phase: 'draft' | 'roundEnd' | 'gameEnd'
  winner: string | null    // 'You' | 'AI 1' | 'AI 2' | 'Tie' | null  — never seat-int (falsy-zero safe)
  /** Monotonic counter; bumps on every state transition so the AI driver re-arms. */
  step: number
  log: LogEntry[]
}

export const SEAT_NAMES = ['You', 'AI 1', 'AI 2']
export function seatName(seat: number): string { return SEAT_NAMES[seat] ?? `Seat ${seat}` }

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

// ============================ deck ============================

/** Classic Sushi Go 108-card distribution. */
export function buildDeck(): Card[] {
  const cards: Card[] = []
  let id = 0
  const add = (kind: Kind, n: number, val?: number) => {
    for (let i = 0; i < n; i++) cards.push(val == null ? { id: id++, kind } : { id: id++, kind, val })
  }
  add('tempura', 14)
  add('sashimi', 14)
  add('dumpling', 14)
  add('maki', 6, 2)   // 2-icon maki
  add('maki', 12, 3)  // 3-icon maki
  add('maki', 8, 1)   // 1-icon maki  (26 maki total)
  add('nigiri', 5, 3) // squid
  add('nigiri', 10, 2) // salmon
  add('nigiri', 5, 1) // egg  (20 nigiri total)
  add('wasabi', 6)
  add('chopsticks', 4)
  add('pudding', 10)
  return cards
}

/** Mulberry32 deterministic PRNG so non-seeded shuffles are still uniform. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Deal HAND_SIZE to each of NPLAYERS off the top of a deck. */
function deal(deck: Card[]): Card[][] {
  const hands: Card[][] = []
  let k = 0
  for (let p = 0; p < NPLAYERS; p++) {
    hands.push(deck.slice(k, k + HAND_SIZE))
    k += HAND_SIZE
  }
  return hands
}

// ============================ game setup ============================

/**
 * Create a new game. Pass `optionalDeck` (already ordered; first NPLAYERS*HAND_SIZE used as
 * round-1 hands) for deterministic tests. Otherwise a fresh shuffled deck is used and
 * reshuffled between rounds.
 */
export function makeGame(optionalDeck?: Card[]): SushiState {
  const rng = mulberry32(((Math.random() * 2 ** 31) | 0) >>> 0)
  // Keep the full deck around so we can redeal fresh rounds (pudding persists across rounds).
  const deck = optionalDeck ? optionalDeck.slice() : shuffle(buildDeck(), rng)
  const hands = deal(deck)
  return {
    hands,
    collected: [[], [], []],
    puddings: [0, 0, 0],
    scores: [0, 0, 0],
    roundScores: [0, 0, 0],
    round: 1,
    pending: [null, null, null],
    pendingExtra: [null, null, null],
    phase: 'draft',
    winner: null,
    step: 0,
    log: [{ t: 'sys', x: 'Round 1 — draft a card, then pass your hand to the left. Tempura pairs, sashimi triples, dumpling ladders, maki races, nigiri, wasabi and pudding all score.' }],
    // stash the deck on a non-enumerable-ish field for redeal
    ...({ _deck: deck } as object),
  } as SushiState & { _deck: Card[] }
}

function getDeck(s: SushiState): Card[] {
  return (s as SushiState & { _deck?: Card[] })._deck ?? buildDeck()
}

// ============================ helpers ============================

/** True once every seat has registered a pick this turn (ready to reveal). */
export function allPicked(s: SushiState): boolean {
  return s.pending.every(p => p != null)
}

/** Does this seat currently hold a chopsticks card it could spend (to take a 2nd card)? */
export function hasChopsticks(s: SushiState, seat: number): boolean {
  return s.collected[seat].some(c => c.kind === 'chopsticks')
}

// ============================ picking (simultaneous) ============================

/**
 * Register seat's chosen card id for this turn. If `extraId` is provided AND the seat has a
 * chopsticks in front of them AND the hand is big enough, it's a chopsticks double-pick:
 * the seat keeps two cards and returns a chopsticks card to the hand to be passed.
 * This only records the pick; nothing is revealed until everyone has chosen.
 */
export function setPick(s: SushiState, seat: number, cardId: number, extraId?: number): SushiState {
  if (s.phase !== 'draft') return s
  const hand = s.hands[seat]
  if (!hand.some(c => c.id === cardId)) return s
  let extra: number | null = null
  if (extraId != null && extraId !== cardId && hasChopsticks(s, seat) && hand.length >= 2 && hand.some(c => c.id === extraId)) {
    extra = extraId
  }
  const pending = s.pending.slice()
  const pendingExtra = s.pendingExtra.slice()
  pending[seat] = cardId
  pendingExtra[seat] = extra
  return { ...s, pending, pendingExtra, step: s.step + 1 }
}

/**
 * Reveal: every seat moves its chosen card(s) to its collection, returns a chopsticks card
 * to hand when one was spent, then all hands rotate one seat to the LEFT (seat i receives
 * seat i+1's leftovers). If hands are now empty the round is scored.
 */
export function reveal(s: SushiState): SushiState {
  if (s.phase !== 'draft' || !allPicked(s)) return s
  const hands = s.hands.map(h => h.slice())
  const collected = s.collected.map(c => c.slice())

  for (let seat = 0; seat < NPLAYERS; seat++) {
    const pickId = s.pending[seat]!
    const extraId = s.pendingExtra[seat]
    const hand = hands[seat]
    const takeIds = new Set<number>([pickId])
    let usedChopsticks = false
    if (extraId != null) { takeIds.add(extraId); usedChopsticks = true }
    // Move kept cards out of the hand into the collection.
    const kept = hand.filter(c => takeIds.has(c.id))
    hands[seat] = hand.filter(c => !takeIds.has(c.id))
    collected[seat].push(...kept)
    // Spending chopsticks: return ONE chopsticks card from the collection back to the hand.
    if (usedChopsticks) {
      const ci = collected[seat].findIndex(c => c.kind === 'chopsticks')
      if (ci >= 0) {
        const [chop] = collected[seat].splice(ci, 1)
        hands[seat].push(chop)
      }
    }
  }

  // Pass hands to the LEFT: new hand of seat i = old leftover of seat i+1.
  const passed: Card[][] = []
  for (let seat = 0; seat < NPLAYERS; seat++) {
    passed[seat] = hands[(seat + 1) % NPLAYERS]
  }

  const next: SushiState = {
    ...s,
    hands: passed,
    collected,
    pending: [null, null, null],
    pendingExtra: [null, null, null],
    step: s.step + 1,
  }

  if (passed.every(h => h.length === 0)) {
    return scoreRound(next)
  }
  return next
}

// ============================ scoring ============================

/** Total maki roll icons in a collection. */
export function makiIcons(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + (c.kind === 'maki' ? (c.val ?? 0) : 0), 0)
}

/** Dumpling ladder: 1/2/3/4/5+ → 1/3/6/10/15. */
export function dumplingPoints(n: number): number {
  if (n <= 0) return 0
  if (n === 1) return 1
  if (n === 2) return 3
  if (n === 3) return 6
  if (n === 4) return 10
  return 15
}

/**
 * Score a single seat's collected cards for a round — EXCLUDING maki (which is relative,
 * scored in scoreRound) and pudding (game-end only). Wasabi triples the NEXT nigiri played
 * after it, in collection order.
 */
export function scoreCollectionLocal(cards: Card[]): number {
  let pts = 0
  let tempura = 0, sashimi = 0, dumpling = 0
  let pendingWasabi = 0 // count of unused wasabi waiting for a nigiri
  for (const c of cards) {
    switch (c.kind) {
      case 'tempura': tempura++; break
      case 'sashimi': sashimi++; break
      case 'dumpling': dumpling++; break
      case 'wasabi': pendingWasabi++; break
      case 'nigiri': {
        const base = c.val ?? 0
        if (pendingWasabi > 0) { pts += base * 3; pendingWasabi-- }
        else pts += base
        break
      }
      // maki, chopsticks, pudding: not scored here
      default: break
    }
  }
  pts += Math.floor(tempura / 2) * 5
  pts += Math.floor(sashimi / 3) * 10
  pts += dumplingPoints(dumpling)
  return pts
}

/** Maki standings for a round: most = 6 (split among tied), 2nd-most = 3 (split among tied). */
export function scoreMaki(collected: Card[][]): number[] {
  const icons = collected.map(makiIcons)
  const out = [0, 0, 0]
  const positive = icons.filter(v => v > 0)
  if (positive.length === 0) return out
  const max = Math.max(...icons)
  const topSeats = icons.map((v, i) => ({ v, i })).filter(o => o.v === max).map(o => o.i)
  for (const i of topSeats) out[i] += Math.floor(6 / topSeats.length)
  // Second place only among seats below the max (and with > 0 icons).
  const below = icons.map((v, i) => ({ v, i })).filter(o => o.v < max && o.v > 0)
  if (below.length > 0) {
    const max2 = Math.max(...below.map(o => o.v))
    const second = below.filter(o => o.v === max2).map(o => o.i)
    for (const i of second) out[i] += Math.floor(3 / second.length)
  }
  return out
}

/** Score the just-finished round into cumulative scores; bank puddings; advance or end. */
export function scoreRound(s: SushiState): SushiState {
  const local = s.collected.map(scoreCollectionLocal)
  const maki = scoreMaki(s.collected)
  const roundScores = [0, 0, 0]
  const puddings = s.puddings.slice()
  const scores = s.scores.slice()
  for (let seat = 0; seat < NPLAYERS; seat++) {
    roundScores[seat] = local[seat] + maki[seat]
    scores[seat] += roundScores[seat]
    puddings[seat] += s.collected[seat].filter(c => c.kind === 'pudding').length
  }
  let log = push(s.log, 'sys', `Round ${s.round} scored — ${SEAT_NAMES.map((n, i) => `${n} +${roundScores[i]}`).join(', ')}.`)

  if (s.round >= ROUNDS) {
    return endGame({ ...s, scores, puddings, roundScores, log })
  }

  // Redeal a fresh round from a freshly shuffled deck (pudding already banked).
  const rng = mulberry32((((s.step + 1) * 2654435761) ^ 0x9e3779b9) >>> 0)
  const deck = shuffle(getDeck(s), rng)
  const hands = deal(deck)
  const nextRound = s.round + 1
  log = push(log, 'sys', `Round ${nextRound} — fresh hands dealt.`)
  return {
    ...s,
    hands,
    collected: [[], [], []],
    puddings,
    scores,
    roundScores,
    round: nextRound,
    pending: [null, null, null],
    pendingExtra: [null, null, null],
    phase: 'draft',
    step: s.step + 1,
    log,
  }
}

/** Apply game-end pudding scoring and decide the winner (string label, falsy-zero safe). */
export function endGame(s: SushiState): SushiState {
  const scores = s.scores.slice()
  const pud = s.puddings
  const maxP = Math.max(...pud)
  const minP = Math.min(...pud)
  let log = s.log
  if (maxP > 0 || minP !== maxP) {
    const tops = pud.map((v, i) => ({ v, i })).filter(o => o.v === maxP).map(o => o.i)
    const bots = pud.map((v, i) => ({ v, i })).filter(o => o.v === minP).map(o => o.i)
    // Most puddings: +6 split (only if at least one pudding exists).
    if (maxP > 0) for (const i of tops) scores[i] += Math.floor(6 / tops.length)
    // Fewest puddings: -6 split (3-player: always applied; only meaningful when not everyone ties).
    if (maxP !== minP) for (const i of bots) scores[i] -= Math.floor(6 / bots.length)
    log = push(log, 'sys', `Pudding — ${SEAT_NAMES.map((n, i) => `${n} ${pud[i]}`).join(', ')}.`)
  }

  const max = Math.max(...scores)
  const leaders = scores.map((v, i) => ({ v, i })).filter(o => o.v === max).map(o => o.i)
  // Tie-break in Sushi Go: most puddings wins.
  let winnerSeat: number
  if (leaders.length === 1) {
    winnerSeat = leaders[0]
  } else {
    const bestP = Math.max(...leaders.map(i => pud[i]))
    const tied = leaders.filter(i => pud[i] === bestP)
    winnerSeat = tied.length === 1 ? tied[0] : -1
  }
  const winner = winnerSeat < 0 ? 'Tie' : seatName(winnerSeat)
  log = push(log, winner === 'Tie' ? 'sys' : (winnerSeat === 0 ? 'you' : 'ai'),
    winner === 'Tie' ? 'Game tied!' : `${winner} win${winnerSeat === 0 ? '' : 's'} with ${max} points!`)
  return { ...s, scores, phase: 'gameEnd', winner, step: s.step + 1, log }
}

// ============================ AI ============================

/**
 * Greedy heuristic value of taking `card` given a seat's current collection and how many
 * draft turns remain this round (used for late-game pudding hoarding and contested maki).
 * No search — just a one-card marginal estimate.
 */
export function cardValue(card: Card, mine: Card[], turnsLeft: number, contestedMaki: boolean): number {
  switch (card.kind) {
    case 'tempura': {
      const t = mine.filter(c => c.kind === 'tempura').length
      // Completing a pair is worth +5 now; an unpaired tempura is a deferred 2.5 (if reachable).
      return t % 2 === 1 ? 5 : (turnsLeft >= 1 ? 2.5 : 0.5)
    }
    case 'sashimi': {
      const sCount = mine.filter(c => c.kind === 'sashimi').length
      const mod = sCount % 3
      if (mod === 2) return 10            // completes a set of 3
      if (mod === 1) return turnsLeft >= 1 ? 4.5 : 0.5 // 2nd of a set, needs one more
      return turnsLeft >= 2 ? 3 : 0.3     // start a fresh set, needs two more
    }
    case 'dumpling': {
      const d = mine.filter(c => c.kind === 'dumpling').length
      // Marginal ladder gain for the next dumpling.
      return dumplingPoints(d + 1) - dumplingPoints(d)
    }
    case 'maki': {
      const icons = card.val ?? 0
      // Maki only pays if you win/place; weight by icon count and whether the lead is contested.
      return icons * (contestedMaki ? 1.1 : 0.7)
    }
    case 'nigiri': {
      const base = card.val ?? 0
      const wasabiOpen = mine.some(c => c.kind === 'wasabi') &&
        mine.filter(c => c.kind === 'wasabi').length > mine.filter(c => c.kind === 'nigiri').length
      return wasabiOpen ? base * 3 : base
    }
    case 'wasabi':
      // Worth the expected boost only if nigiri are still likely to come.
      return turnsLeft >= 2 ? 4 : 1
    case 'chopsticks':
      // A flexible extra pick, but only useful with turns left to spend it.
      return turnsLeft >= 3 ? 2.5 : 0.4
    case 'pudding':
      // Pudding pays at game end; hoard harder when few of them remain to be seen.
      return 3
    default:
      return 0
  }
}

/** Whether this seat is in or near the maki lead this round (so maki cards matter to it). */
function makiContested(s: SushiState, seat: number): boolean {
  const mine = makiIcons(s.collected[seat])
  const others = s.collected.map((c, i) => (i === seat ? -1 : makiIcons(c)))
  const top = Math.max(...others)
  return mine + 3 >= top // close enough that a maki could swing a placing
}

/**
 * Greedy AI: choose the highest-marginal-value card from the seat's hand. Returns the chosen
 * card id (and, when a chopsticks double-pick is clearly worth it, an extra id) so the caller
 * can feed it to setPick. Never mutates state.
 */
export function aiPick(s: SushiState, seat: number): { cardId: number; extraId?: number } {
  const hand = s.hands[seat]
  const mine = s.collected[seat]
  const turnsLeft = hand.length // cards left in hand ≈ remaining draft turns this round
  const contested = makiContested(s, seat)

  const ranked = hand
    .map(c => ({ c, v: cardValue(c, mine, turnsLeft, contested) }))
    .sort((a, b) => b.v - a.v)

  const best = ranked[0].c

  // Chopsticks double-pick: if we hold chopsticks and the top TWO cards are both juicy,
  // grab both this turn (the engine returns a chopsticks card to the hand).
  if (hasChopsticks(s, seat) && hand.length >= 2 && ranked.length >= 2) {
    const second = ranked[1]
    // Worth it when the second card is itself a strong, time-sensitive grab.
    if (second.v >= 5) {
      return { cardId: best.id, extraId: second.c.id }
    }
  }
  return { cardId: best.id }
}

/** Resolve all unset AI picks for this turn (seats 1..2), leaving seat 0 to the human. */
export function aiPickAll(s: SushiState): SushiState {
  if (s.phase !== 'draft') return s
  let next = s
  for (let seat = 1; seat < NPLAYERS; seat++) {
    if (next.pending[seat] == null) {
      const { cardId, extraId } = aiPick(next, seat)
      next = setPick(next, seat, cardId, extraId)
    }
  }
  return next
}

/** Full headless turn step used by self-play tests: AI picks, plus seat-0 if `autoSeat0`. */
export function autoStep(s: SushiState, autoSeat0 = true): SushiState {
  if (s.phase !== 'draft') return s
  let next = aiPickAll(s)
  if (autoSeat0 && next.pending[0] == null) {
    const { cardId, extraId } = aiPick(next, 0)
    next = setPick(next, 0, cardId, extraId)
  }
  if (allPicked(next)) next = reveal(next)
  return next
}

/** The winning seat label, or null while the game is unfinished. */
export function winner(s: SushiState): string | null {
  return s.winner
}
