/* POINT SALAD — logic (built for this codebase, not ported).
   3-player card-drafting set-collection. Cards are double-sided: one face is a VEGETABLE
   (6 types), the other a SCORING criterion. Setup uses 54 cards split into 3 face-up
   "point card" piles (criterion side up); below each pile a market of 2 face-up veg cards
   (6 veg cards on the table). On a turn a player takes EITHER one point card from the top
   of a pile, OR two veg cards from the market. After taking, the corresponding market slots
   refill from the top of their pile (flipped to veg side). When all 54 cards are gone the
   game ends. Each player sums their point cards' criteria over the veg they collected;
   most points wins.

   No React / DOM in this file. Deterministic deck supported for tests (pass a deck order). */

export const VEG = ['pepper', 'lettuce', 'carrot', 'cabbage', 'onion', 'tomato'] as const
export type Veg = typeof VEG[number]
export const N_VEG = VEG.length
export const N_PLAYERS = 3
export const N_PILES = 3
export const MARKET_SLOTS = 6 // 2 veg under each of the 3 piles
export const DECK_SIZE = 54

export type VegVec = Record<Veg, number>

// ===== criteria =====
// Each card carries a criterion id (its scoring face). The CRITERIA table maps an id to a
// human label and a pure scoring function over (my veg vector, all players' veg vectors).
export interface Criterion {
  id: string
  label: string
  short: string
  // score this criterion given my collected veg + everyone's veg (for most/fewest).
  score: (mine: VegVec, all: VegVec[]) => number
}

function vec(init = 0): VegVec {
  const v = {} as VegVec
  for (const k of VEG) v[k] = init
  return v
}
export function emptyVec(): VegVec { return vec(0) }

// helper: most/fewest of a veg across all players (ties => everyone tied gets it).
function hasMost(mine: VegVec, all: VegVec[], v: Veg): boolean {
  const max = Math.max(...all.map(a => a[v]))
  return mine[v] > 0 && mine[v] === max
}
function hasFewest(mine: VegVec, all: VegVec[], v: Veg): boolean {
  const min = Math.min(...all.map(a => a[v]))
  return mine[v] === min // note: fewest can be 0 (you have the fewest by having none)
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// builders for the criterion families
function perVeg(v: Veg, n: number): Criterion {
  return {
    id: `per_${v}_${n}`,
    label: `${n} / ${cap(v)}`,
    short: `${n}/${cap(v).slice(0, 3)}`,
    score: (mine) => n * mine[v],
  }
}
function perTwoVeg(a: Veg, b: Veg, n: number): Criterion {
  return {
    id: `per2_${a}_${b}_${n}`,
    label: `${n} / ${cap(a)} & ${cap(b)}`,
    short: `${n}/${cap(a).slice(0, 3)}+${cap(b).slice(0, 3)}`,
    score: (mine) => n * (mine[a] + mine[b]),
  }
}
function most(v: Veg, pts: number): Criterion {
  return {
    id: `most_${v}`,
    label: `Most ${cap(v)} = ${pts}`,
    short: `Most ${cap(v).slice(0, 3)} ${pts}`,
    score: (mine, all) => (hasMost(mine, all, v) ? pts : 0),
  }
}
function fewest(v: Veg, pts: number): Criterion {
  return {
    id: `fewest_${v}`,
    label: `Fewest ${cap(v)} = ${pts}`,
    short: `Few ${cap(v).slice(0, 3)} ${pts}`,
    score: (mine, all) => (hasFewest(mine, all, v) ? pts : 0),
  }
}
function combo3(a: Veg, b: Veg, c: Veg, pts: number): Criterion {
  return {
    id: `combo_${a}_${b}_${c}`,
    label: `${cap(a)}+${cap(b)}+${cap(c)} = ${pts}`,
    short: `Set3 ${pts}`,
    // pts per complete one-of-each set
    score: (mine) => pts * Math.min(mine[a], mine[b], mine[c]),
  }
}
function evenOdd(v: Veg, even: number, odd: number): Criterion {
  return {
    id: `parity_${v}`,
    label: `${cap(v)}: even = ${even}, odd = ${odd}`,
    short: `${cap(v).slice(0, 3)} ±`,
    // count 0 is even but worth nothing (no veg)
    score: (mine) => {
      const c = mine[v]
      if (c === 0) return 0
      return c % 2 === 0 ? even : odd
    },
  }
}
function fewestType(pts: number): Criterion {
  return {
    id: `fewest_type_${pts}`,
    label: `${pts} / veg of the type you have fewest of`,
    short: `${pts}/minType`,
    score: (mine) => {
      const counts = VEG.map(v => mine[v])
      const min = Math.min(...counts)
      return pts * min
    },
  }
}
function twoColors(a: Veg, b: Veg, n: number): Criterion {
  // identical maths to perTwoVeg but kept as a distinct labelled family for variety
  return {
    id: `pair_${a}_${b}_${n}`,
    label: `${n} per ${cap(a)} or ${cap(b)}`,
    short: `${n}/${cap(a).slice(0, 3)}|${cap(b).slice(0, 3)}`,
    score: (mine) => n * (mine[a] + mine[b]),
  }
}

// The representative criteria set (16 distinct criteria) used to build the deck.
export const CRITERIA: Criterion[] = [
  perVeg('pepper', 2),
  perVeg('lettuce', 1),
  perVeg('carrot', 3),
  perVeg('cabbage', 5),
  perVeg('onion', 2),
  perVeg('tomato', 1),
  perTwoVeg('tomato', 'cabbage', 2),
  most('carrot', 8),
  most('tomato', 7),
  fewest('onion', 7),
  fewest('cabbage', 6),
  evenOdd('lettuce', 7, 3),
  evenOdd('onion', 5, 2),
  combo3('pepper', 'lettuce', 'carrot', 5),
  fewestType(5),
  twoColors('pepper', 'onion', 1),
]

export const CRITERIA_BY_ID: Record<string, Criterion> = (() => {
  const m: Record<string, Criterion> = {}
  for (const c of CRITERIA) m[c.id] = c
  return m
})()

// ===== cards & deck =====
// A card has a veg face and a criterion face; once dealt to a pile it is "criterion side up"
// (a point card); once moved to the market it is "veg side up".
export interface Card { veg: Veg; crit: string }

// Build the canonical 54-card deck: each criterion appears on several cards, and each card's
// veg face cycles through the 6 vegetables so the table always has a balanced veg mix.
export function buildDeck(): Card[] {
  const cards: Card[] = []
  let i = 0
  // 54 cards over 16 criteria — cycle criteria, cycle veg faces.
  while (cards.length < DECK_SIZE) {
    const crit = CRITERIA[i % CRITERIA.length].id
    const veg = VEG[i % N_VEG]
    cards.push({ crit, veg })
    i++
  }
  return cards
}

// Fisher–Yates shuffle (only used when no deterministic deck supplied).
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let k = a.length - 1; k > 0; k--) {
    const j = (Math.random() * (k + 1)) | 0
    ;[a[k], a[j]] = [a[j], a[k]]
  }
  return a
}

// ===== state =====
export interface LogEntry { t: string; x: string }

export interface PlayerState {
  veg: VegVec
  points: string[] // criterion ids this player has collected (their point cards)
}

export interface PointSaladState {
  // piles[p] is a stack of point cards (criterion side up); top of pile = end of array.
  piles: Card[][]
  // market[i] is a veg card or null. Slots 2i and 2i+1 sit under pile i.
  market: (Card | null)[]
  players: PlayerState[]
  turn: number | null // 0..2, or null when game over
  winner: number | null // 0..2, null while playing; ties resolved to lowest index
  scores: number[] | null
  log: LogEntry[]
}

function emptyPlayer(): PlayerState {
  return { veg: emptyVec(), points: [] }
}

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-24)
}

// Which pile a market slot belongs to.
export function pileOfSlot(slot: number): number { return Math.floor(slot / 2) }

export function makeGame(optionalDeck?: Card[]): PointSaladState {
  const deck = (optionalDeck ? optionalDeck.slice() : shuffle(buildDeck())).slice(0, DECK_SIZE)
  // 54 cards: 6 go face-up as the market (veg side), remaining 48 split into 3 piles of 16.
  // We deal the market first (one card to each of the 6 slots), then the piles.
  const market: (Card | null)[] = []
  for (let i = 0; i < MARKET_SLOTS; i++) market.push(deck[i])
  const rest = deck.slice(MARKET_SLOTS)
  const per = Math.floor(rest.length / N_PILES)
  const piles: Card[][] = []
  for (let p = 0; p < N_PILES; p++) {
    // top of pile = end of array; deal so rest[order] becomes draw order from the top.
    const chunk = rest.slice(p * per, (p + 1) * per)
    // any remainder cards (rest.length not divisible) go onto the last pile
    if (p === N_PILES - 1) piles.push(rest.slice(p * per).reverse())
    else piles.push(chunk.reverse())
  }
  return {
    piles,
    market,
    players: Array.from({ length: N_PLAYERS }, emptyPlayer),
    turn: 0,
    winner: null,
    scores: null,
    log: [{ t: 'sys', x: 'Take a point card from a pile, or two veg from the market. Most points wins.' }],
  }
}

// ===== queries =====
export function pileTop(s: PointSaladState, pile: number): Card | null {
  const stack = s.piles[pile]
  return stack.length ? stack[stack.length - 1] : null
}

export function marketVegCards(s: PointSaladState): { slot: number; card: Card }[] {
  const out: { slot: number; card: Card }[] = []
  s.market.forEach((c, i) => { if (c) out.push({ slot: i, card: c }) })
  return out
}

export function cardsLeft(s: PointSaladState): number {
  const inPiles = s.piles.reduce((a, p) => a + p.length, 0)
  const inMarket = s.market.reduce((a, c) => a + (c ? 1 : 0), 0)
  return inPiles + inMarket
}

// total cards still in play OR already collected — for conservation checks in tests.
export function totalCards(s: PointSaladState): number {
  let n = cardsLeft(s)
  for (const pl of s.players) n += pl.points.length + VEG.reduce((a, v) => a + pl.veg[v], 0)
  return n
}

export function canTakePoint(s: PointSaladState, pile: number): boolean {
  return s.winner == null && s.turn != null && pile >= 0 && pile < N_PILES && s.piles[pile].length > 0
}
export function canTakeVeg(s: PointSaladState, slots: number[]): boolean {
  if (s.winner != null || s.turn == null) return false
  if (slots.length !== 2) return false
  if (slots[0] === slots[1]) return false
  return slots.every(i => i >= 0 && i < MARKET_SLOTS && s.market[i] != null)
}

// ===== refill =====
// After a market slot empties, refill it from the top of its pile (flipping to veg side).
function refillSlot(s: PointSaladState, slot: number): void {
  if (s.market[slot] != null) return
  const pile = pileOfSlot(slot)
  const stack = s.piles[pile]
  if (stack.length) {
    s.market[slot] = stack.pop() as Card
  }
}

// public refill: ensure every empty market slot is topped up from its pile. Mutates a fresh
// state (callers always pass a clone). Returns the same object for convenience.
export function refill(s: PointSaladState): PointSaladState {
  for (let i = 0; i < MARKET_SLOTS; i++) refillSlot(s, i)
  return s
}

// ===== actions =====
function clone(s: PointSaladState): PointSaladState {
  return {
    piles: s.piles.map(p => p.slice()),
    market: s.market.slice(),
    players: s.players.map(pl => ({ veg: { ...pl.veg }, points: pl.points.slice() })),
    turn: s.turn,
    winner: s.winner,
    scores: s.scores,
    log: s.log,
  }
}

function nextTurn(s: PointSaladState): void {
  if (cardsLeft(s) === 0) { finish(s); return }
  s.turn = ((s.turn as number) + 1) % N_PLAYERS
}

function finish(s: PointSaladState): void {
  const scores = scoreAll(s)
  let best = 0
  for (let p = 1; p < N_PLAYERS; p++) if (scores[p] > scores[best]) best = p
  s.scores = scores
  s.winner = best
  s.turn = null
  s.log = push(s.log, best === 0 ? 'you' : 'ai',
    `Game over — ${best === 0 ? 'You win' : `Player ${best + 1} wins`} with ${scores[best]} points.`)
}

const who = (p: number) => (p === 0 ? 'You' : `Player ${p + 1}`)

// Take the top point card of a pile (criterion side) and add it to the current player.
export function takePointCard(s: PointSaladState, pile: number): PointSaladState {
  if (!canTakePoint(s, pile)) return s
  const ns = clone(s)
  const turn = ns.turn as number
  const stack = ns.piles[pile]
  const card = stack.pop() as Card
  ns.players[turn].points.push(card.crit)
  refill(ns)
  ns.log = push(ns.log, turn === 0 ? 'you' : 'ai',
    `${who(turn)} took a point card (${CRITERIA_BY_ID[card.crit]?.label ?? card.crit}).`)
  nextTurn(ns)
  return ns
}

// Take two veg cards from the market (by slot indices), add their veg to the player, refill.
export function takeVeg(s: PointSaladState, marketIndices: number[]): PointSaladState {
  if (!canTakeVeg(s, marketIndices)) return s
  const ns = clone(s)
  const turn = ns.turn as number
  const taken: Veg[] = []
  for (const slot of marketIndices) {
    const card = ns.market[slot] as Card
    ns.players[turn].veg[card.veg]++
    taken.push(card.veg)
    ns.market[slot] = null
  }
  refill(ns)
  ns.log = push(ns.log, turn === 0 ? 'you' : 'ai',
    `${who(turn)} took ${taken.map(cap).join(' + ')}.`)
  nextTurn(ns)
  return ns
}

// ===== scoring =====
export function scorePlayer(s: PointSaladState, p: number): number {
  const all = s.players.map(pl => pl.veg)
  const mine = s.players[p].veg
  let total = 0
  for (const id of s.players[p].points) {
    const c = CRITERIA_BY_ID[id]
    if (c) total += c.score(mine, all)
  }
  return total
}

export function scoreAll(s: PointSaladState): number[] {
  return s.players.map((_, p) => scorePlayer(s, p))
}

export function winner(s: PointSaladState): number | null {
  return s.winner
}

// ===== AI =====
// Greedy: evaluate every legal move by the increase in MY expected final score, grabbing
// contested "most/fewest" enablers. We approximate "expected" by scoring the resulting board
// for myself only (criteria evaluated over the live veg vectors of all players).
function myScoreAfter(s: PointSaladState, p: number): number {
  return scorePlayer(s, p)
}

// value of each legal move for the current player.
function evalTakePoint(s: PointSaladState, pile: number, me: number): number {
  const before = myScoreAfter(s, me)
  const next = takePointCard(s, pile)
  // takePointCard advanced the turn / possibly finished; score the same player on it.
  const after = scorePlayer(next, me)
  // small forward-looking bonus: a per-veg / per-pair card on veg I already hold is great;
  // a most/fewest card I'm winning is great. before/after already captures current holdings,
  // but new point cards score 0 until I hold the veg, so add a potential term.
  const top = pileTop(s, pile)
  let potential = 0
  if (top) {
    const c = CRITERIA_BY_ID[top.crit]
    if (c) {
      // estimate by scoring this single criterion as if I had +2 of each relevant veg later.
      potential = estimatePotential(c, s.players[me].veg, s.players.map(pl => pl.veg))
    }
  }
  return (after - before) + 0.5 * potential
}

function evalTakeVeg(s: PointSaladState, slots: number[], me: number): number {
  const before = myScoreAfter(s, me)
  const next = takeVeg(s, slots)
  const after = scorePlayer(next, me)
  // forward bonus: veg that feeds my existing point cards is worth grabbing even if it
  // doesn't immediately tip a most/fewest threshold.
  let potential = 0
  for (const slot of slots) {
    const card = s.market[slot]
    if (card) potential += vegPotential(s, me, card.veg)
  }
  return (after - before) + 0.6 * potential
}

// how valuable an extra unit of veg `v` is to player `me` given their point cards.
function vegPotential(s: PointSaladState, me: number, v: Veg): number {
  let val = 0
  const all = s.players.map(pl => pl.veg)
  const mine = s.players[me].veg
  for (const id of s.players[me].points) {
    const c = CRITERIA_BY_ID[id]
    if (!c) continue
    const test = { ...mine, [v]: mine[v] + 1 }
    const testAll = all.map((a, i) => (i === me ? test : a))
    val += c.score(test, testAll) - c.score(mine, all)
  }
  // even a veg I have no card for is a tiny hedge.
  return val + 0.1
}

// rough potential of acquiring a criterion card now (before I own the matching veg).
function estimatePotential(c: Criterion, mine: VegVec, all: VegVec[]): number {
  // imagine I add ~2 more of each veg over the rest of the game and see what this card scores.
  const boosted = { ...mine }
  for (const v of VEG) boosted[v] += 2
  const boostedAll = all.map((a, i) => (a === mine ? boosted : a))
  return c.score(boosted, boostedAll)
}

// The AI's whole turn: pick the single best legal move.
export function aiTurn(s: PointSaladState): PointSaladState {
  if (s.winner != null || s.turn == null) return s
  const me = s.turn
  let bestVal = -Infinity
  let best: (() => PointSaladState) | null = null

  for (let pile = 0; pile < N_PILES; pile++) {
    if (!canTakePoint(s, pile)) continue
    const v = evalTakePoint(s, pile, me)
    if (v > bestVal) { bestVal = v; best = () => takePointCard(s, pile) }
  }

  const cards = marketVegCards(s)
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const slots = [cards[i].slot, cards[j].slot]
      if (!canTakeVeg(s, slots)) continue
      const v = evalTakeVeg(s, slots, me)
      if (v > bestVal) { bestVal = v; best = () => takeVeg(s, slots) }
    }
  }

  if (best) return best()
  // No legal move (shouldn't happen while cards remain) — force-finish to guarantee progress.
  const ns = clone(s)
  finish(ns)
  return ns
}
