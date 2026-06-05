/* GIN RUMMY — logic (built for this codebase, not ported).
   Classic 2-player Gin Rummy: you vs a heuristic AI. Each player is dealt 10
   cards; one card is flipped to start the discard pile, the rest form the stock.
   On a turn you DRAW (top discard or top stock) then DISCARD one card. Goal: form
   your 10 cards into melds — sets (3-4 same rank) and runs (3+ consecutive same
   suit). Deadwood = cards in no meld; A=1, faces=10, number=pip. KNOCK when your
   deadwood ≤ 10 after discarding, or GIN at 0 deadwood. On knock the opponent lays
   off deadwood onto the knocker's melds, then deadwood is compared; undercuts and
   gin score bonuses. First to 100 across hands wins the match.

   NO React/DOM here. Deterministic deals are possible via makeGame(deck?). */

export type Who = 'you' | 'ai'
export type Phase = 'draw' | 'discard' | 'roundOver' | 'gameOver'
export interface LogEntry { t: string; x: string }

export const SUITS = ['S', 'H', 'D', 'C'] as const
export type Suit = (typeof SUITS)[number]
/** Rank index 1..13 → A,2..10,J,Q,K. */
export type Rank = number

export interface Card {
  /** 0..51 unique id; id = (rank-1)*4 + suitIndex. */
  id: number
  rank: Rank
  suit: Suit
}

export const RANK_LABEL: Record<number, string> = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K',
}
export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
export const RED_SUITS: Suit[] = ['H', 'D']
export const isRed = (s: Suit) => s === 'H' || s === 'D'

/** Point value of a card: A=1, faces (J,Q,K)=10, others = pip (10 caps at 10). */
export function cardValue(c: Card): number {
  if (c.rank >= 11) return 10
  return c.rank
}

export function cardLabel(c: Card): string {
  return RANK_LABEL[c.rank] + SUIT_SYMBOL[c.suit]
}

export function makeCard(rank: Rank, suit: Suit): Card {
  return { id: (rank - 1) * 4 + SUITS.indexOf(suit), rank, suit }
}

/** Build an ordered 52-card deck. */
export function freshDeck(): Card[] {
  const d: Card[] = []
  for (let r = 1; r <= 13; r++) for (const s of SUITS) d.push(makeCard(r, s))
  return d
}

/* ----------------------------- RNG / shuffle ----------------------------- */

/** Tiny deterministic PRNG (mulberry32) so deals can be seeded in tests. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffled(deck: Card[], rng: () => number = Math.random): Card[] {
  const a = deck.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* ----------------------------- meld / deadwood ----------------------------- */

export interface Meld {
  kind: 'set' | 'run'
  cards: Card[]
}
export interface MeldResult {
  melds: Meld[]
  deadwoodCards: Card[]
  deadwoodValue: number
}

const byRank = (a: Card, b: Card) => a.rank - b.rank

/** All possible sets (3-4 of a kind) present in the hand. */
function findSets(hand: Card[]): Meld[] {
  const out: Meld[] = []
  for (let r = 1; r <= 13; r++) {
    const same = hand.filter((c) => c.rank === r)
    if (same.length >= 3) {
      // full set (3 or 4)
      out.push({ kind: 'set', cards: same.slice() })
      // every 3-card subset when 4 present (so we can leave one card out for a run)
      if (same.length === 4) {
        for (let i = 0; i < 4; i++) out.push({ kind: 'set', cards: same.filter((_, k) => k !== i) })
      }
    }
  }
  return out
}

/** All possible runs (3+ consecutive same suit) present in the hand. */
function findRuns(hand: Card[]): Meld[] {
  const out: Meld[] = []
  for (const s of SUITS) {
    const suited = hand.filter((c) => c.suit === s).sort(byRank)
    // walk for maximal consecutive stretches, then enumerate every window of len>=3
    let i = 0
    while (i < suited.length) {
      let j = i
      while (j + 1 < suited.length && suited[j + 1].rank === suited[j].rank + 1) j++
      const stretch = suited.slice(i, j + 1)
      if (stretch.length >= 3) {
        for (let a = 0; a < stretch.length; a++) {
          for (let b = a + 2; b < stretch.length; b++) {
            out.push({ kind: 'run', cards: stretch.slice(a, b + 1) })
          }
        }
      }
      i = j + 1
    }
  }
  return out
}

/**
 * Minimum-deadwood meld partition. Enumerates candidate melds (all sets + all
 * runs, including sub-melds), then does a small exact search choosing a disjoint
 * subset that maximises melded value. Hands are 10-11 cards so the candidate set
 * is tiny and this is fast. Returns the best melds + leftover deadwood.
 */
export function bestMelds(hand: Card[]): MeldResult {
  const cards = hand.slice()
  const candidates = [...findSets(cards), ...findRuns(cards)]

  // map card id -> bit index
  const idx = new Map<number, number>()
  cards.forEach((c, i) => idx.set(c.id, i))
  const maskOf = (m: Meld): number => m.cards.reduce((acc, c) => acc | (1 << idx.get(c.id)!), 0)
  const cand = candidates.map((m) => ({ m, mask: maskOf(m), val: m.cards.reduce((a, c) => a + cardValue(c), 0) }))

  let best = { melds: [] as Meld[], used: 0, val: 0 }

  // Depth-first: try including/excluding each candidate that is disjoint from used.
  function search(start: number, used: number, picked: Meld[], val: number) {
    if (val > best.val) best = { melds: picked.slice(), used, val }
    for (let i = start; i < cand.length; i++) {
      const c = cand[i]
      if ((c.mask & used) === 0) {
        search(i + 1, used | c.mask, [...picked, c.m], val + c.val)
      }
    }
  }
  search(0, 0, [], 0)

  const usedMask = best.used
  const deadwoodCards = cards.filter((c) => (usedMask & (1 << idx.get(c.id)!)) === 0)
  const deadwoodValue = deadwoodCards.reduce((a, c) => a + cardValue(c), 0)
  return { melds: best.melds, deadwoodCards, deadwoodValue }
}

/** Deadwood value of a hand under its best partition. */
export function deadwoodOf(hand: Card[]): number {
  return bestMelds(hand).deadwoodValue
}

/* ----------------------------- game state ----------------------------- */

export const TARGET = 100
export const HAND_SIZE = 10
export const GIN_BONUS = 25
export const UNDERCUT_BONUS = 25

export interface GinState {
  you: Card[]
  ai: Card[]
  stock: Card[]
  discard: Card[]
  turn: Who
  phase: Phase
  scores: { you: number; ai: number }
  /** Result of the most recent finished round (null until a round ends). */
  round: RoundResult | null
  /** Overall match winner once a side reaches TARGET. */
  winner: Who | null
  /** Bumps every state-changing action so AI drivers / effects can re-arm. */
  step: number
  log: LogEntry[]
}

export interface RoundResult {
  kind: 'knock' | 'gin' | 'undercut' | 'wash'
  /** Who pressed the knock/gin (null for a wash). */
  by: Who | null
  /** Who actually scored the points (after undercut). */
  scorer: Who | null
  points: number
  youDead: number
  aiDead: number
  /** Lay-off cards (by the non-knocker), for display. */
  layoffs: Card[]
}

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-40)
}

/**
 * Start a fresh round (deal). If a full deck is supplied it is used verbatim
 * (top of array dealt first) for deterministic tests; otherwise shuffled.
 * `dealer` discards-side: the non-dealer draws first; we simplify: 'you' first.
 */
export function deal(deck: Card[], scores: { you: number; ai: number }, log: LogEntry[], starter: Who): GinState {
  const d = deck.slice()
  const you: Card[] = []
  const ai: Card[] = []
  // Deal 10 each, alternating (you, ai, you, ...).
  for (let i = 0; i < HAND_SIZE; i++) {
    you.push(d.shift()!)
    ai.push(d.shift()!)
  }
  const upcard = d.shift()!
  const stock = d
  return {
    you, ai,
    stock,
    discard: [upcard],
    turn: starter,
    phase: 'draw',
    scores: { ...scores },
    round: null,
    winner: null,
    step: 0,
    log: push(log, 'sys', `New hand dealt — ${starter === 'you' ? 'you' : 'rival'} to draw.`),
  }
}

/** Create a new match. Optionally pass a full 52-card deck for deterministic deals. */
export function makeGame(deck?: Card[], seed?: number): GinState {
  const base = deck ?? shuffled(freshDeck(), seed != null ? mulberry32(seed) : Math.random)
  return deal(base, { you: 0, ai: 0 }, [], 'you')
}

export const topDiscard = (s: GinState): Card | null => (s.discard.length ? s.discard[s.discard.length - 1] : null)

/** Total card count across all zones — must always equal 52. */
export function cardCount(s: GinState): number {
  return s.you.length + s.ai.length + s.stock.length + s.discard.length
}

/* ----------------------------- actions ----------------------------- */

function handOf(s: GinState, w: Who): Card[] { return w === 'you' ? s.you : s.ai }

/**
 * If the stock runs too low to continue (≤ 2 cards left and no one knocked),
 * the hand is a wash: no score, redeal. We treat ≤2 as exhausted (classic rule).
 */
export function stockExhausted(s: GinState): boolean {
  return s.stock.length <= 2
}

/** Draw from the stock (top of array). Mutates a clone; returns new state. */
export function drawStock(s: GinState): GinState {
  if (s.phase !== 'draw' || s.stock.length === 0) return s
  const stock = s.stock.slice()
  const card = stock.shift()!
  const hand = handOf(s, s.turn).slice()
  hand.push(card)
  const ns: GinState = { ...s, stock, phase: 'discard', step: s.step + 1 }
  if (s.turn === 'you') ns.you = hand; else ns.ai = hand
  ns.log = push(s.log, s.turn === 'you' ? 'you' : 'ai', `${s.turn === 'you' ? 'You' : 'Rival'} drew from the stock.`)
  return ns
}

/** Draw the top of the discard pile. */
export function drawDiscard(s: GinState): GinState {
  if (s.phase !== 'draw' || s.discard.length === 0) return s
  const discard = s.discard.slice()
  const card = discard.pop()!
  const hand = handOf(s, s.turn).slice()
  hand.push(card)
  const ns: GinState = { ...s, discard, phase: 'discard', step: s.step + 1 }
  if (s.turn === 'you') ns.you = hand; else ns.ai = hand
  ns.log = push(s.log, s.turn === 'you' ? 'you' : 'ai', `${s.turn === 'you' ? 'You' : 'Rival'} took ${cardLabel(card)} from the discard.`)
  return ns
}

/**
 * Discard a card (by id) from the current player's hand, ending their portion
 * of the turn. If `knock` is true (and legal) the round is resolved instead of
 * passing the turn. Returns new state.
 */
export function discard(s: GinState, cardId: number, knock = false): GinState {
  if (s.phase !== 'discard') return s
  const w = s.turn
  const hand = handOf(s, w).slice()
  const i = hand.findIndex((c) => c.id === cardId)
  if (i < 0) return s
  const card = hand.splice(i, 1)[0]
  const dead = deadwoodOf(hand)

  let ns: GinState = { ...s, discard: s.discard.concat([card]), step: s.step + 1 }
  if (w === 'you') ns.you = hand; else ns.ai = hand
  ns.log = push(s.log, w === 'you' ? 'you' : 'ai', `${w === 'you' ? 'You' : 'Rival'} discarded ${cardLabel(card)}.`)

  if (knock && dead <= 10) {
    return resolveKnock({ ...ns }, w)
  }

  // pass turn
  ns.turn = w === 'you' ? 'ai' : 'you'
  ns.phase = 'draw'

  // stock-exhaustion check: if the next player cannot meaningfully draw, wash.
  if (stockExhausted(ns)) {
    return washRound(ns)
  }
  return ns
}

/** Can the given player knock right now (hand currently 10 cards, deadwood ≤10)? */
export function canKnock(hand: Card[]): boolean {
  return hand.length === HAND_SIZE && deadwoodOf(hand) <= 10
}
export function isGin(hand: Card[]): boolean {
  return hand.length === HAND_SIZE && deadwoodOf(hand) === 0
}

/* ----------------------------- knock resolution ----------------------------- */

/**
 * Lay off the layer's deadwood onto the knocker's melds where legal. Returns the
 * reduced deadwood value for the layer and the cards actually laid off. Sets
 * cannot accept lay-offs unless the set is only 3 cards (the 4th of that rank);
 * runs accept extensions on either end.
 */
export function layOff(knockerMelds: Meld[], layerDeadwood: Card[]): { remaining: Card[]; laid: Card[] } {
  // Work on mutable copies of meld card lists.
  const melds = knockerMelds.map((m) => ({ kind: m.kind, cards: m.cards.slice() }))
  const remaining: Card[] = layerDeadwood.slice()
  const laid: Card[] = []

  let changed = true
  while (changed) {
    changed = false
    for (let di = 0; di < remaining.length; di++) {
      const c = remaining[di]
      for (const m of melds) {
        if (m.kind === 'set') {
          if (m.cards.length < 4 && m.cards[0].rank === c.rank) {
            m.cards.push(c); laid.push(c); remaining.splice(di, 1); changed = true; break
          }
        } else {
          // run: same suit, extends low or high end
          if (m.cards[0].suit !== c.suit) continue
          const ranks = m.cards.map((x) => x.rank)
          const lo = Math.min(...ranks), hi = Math.max(...ranks)
          if (c.rank === lo - 1 || c.rank === hi + 1) {
            m.cards.push(c); laid.push(c); remaining.splice(di, 1); changed = true; break
          }
        }
      }
      if (changed) break
    }
  }
  return { remaining, laid }
}

/**
 * Resolve a knock (or gin) by `knocker`. Computes both deadwoods, applies
 * lay-offs (unless gin), determines scorer (with undercut), updates scores, and
 * flags game-over if a side reached TARGET. The knocker's hand is already 10
 * cards at call time (they have discarded).
 */
export function resolveKnock(s: GinState, knocker: Who): GinState {
  const kHand = handOf(s, knocker)
  const oWho: Who = knocker === 'you' ? 'ai' : 'you'
  const oHand = handOf(s, oWho)

  const kMeld = bestMelds(kHand)
  const oMeld = bestMelds(oHand)
  const kDead = kMeld.deadwoodValue
  const gin = kDead === 0

  let oRemainingDead = oMeld.deadwoodValue
  let laid: Card[] = []
  if (!gin) {
    const res = layOff(kMeld.melds, oMeld.deadwoodCards)
    oRemainingDead = res.remaining.reduce((a, c) => a + cardValue(c), 0)
    laid = res.laid
  }

  let result: RoundResult
  if (gin) {
    const pts = oRemainingDead + GIN_BONUS
    result = { kind: 'gin', by: knocker, scorer: knocker, points: pts, youDead: knocker === 'you' ? 0 : oRemainingDead, aiDead: knocker === 'ai' ? 0 : oRemainingDead, layoffs: [] }
  } else if (oRemainingDead < kDead) {
    // undercut: opponent scores the difference + bonus
    const pts = (kDead - oRemainingDead) + UNDERCUT_BONUS
    result = { kind: 'undercut', by: knocker, scorer: oWho, points: pts, youDead: knocker === 'you' ? kDead : oRemainingDead, aiDead: knocker === 'ai' ? kDead : oRemainingDead, layoffs: laid }
  } else {
    const pts = oRemainingDead - kDead
    result = { kind: 'knock', by: knocker, scorer: knocker, points: pts, youDead: knocker === 'you' ? kDead : oRemainingDead, aiDead: knocker === 'ai' ? kDead : oRemainingDead, layoffs: laid }
  }

  const scores = { ...s.scores }
  if (result.scorer) scores[result.scorer] += result.points

  const matchWinner: Who | null = scores.you >= TARGET ? 'you' : scores.ai >= TARGET ? 'ai' : null

  const verb = result.kind === 'gin' ? 'goes GIN' : result.kind === 'undercut' ? 'knocks — undercut!' : 'knocks'
  const log1 = push(s.log, knocker === 'you' ? 'you' : 'ai', `${knocker === 'you' ? 'You' : 'Rival'} ${verb}.`)
  const log2 = result.scorer
    ? push(log1, result.scorer === 'you' ? 'you' : 'ai', `${result.scorer === 'you' ? 'You' : 'Rival'} score ${result.points}.`)
    : log1

  return {
    ...s,
    scores,
    round: result,
    phase: matchWinner ? 'gameOver' : 'roundOver',
    winner: matchWinner,
    step: s.step + 1,
    log: log2,
  }
}

/** A wash (stock exhausted, no knock): no points, ready to redeal. */
function washRound(s: GinState): GinState {
  return {
    ...s,
    round: { kind: 'wash', by: null, scorer: null, points: 0, youDead: deadwoodOf(s.you), aiDead: deadwoodOf(s.ai), layoffs: [] },
    phase: 'roundOver',
    step: s.step + 1,
    log: push(s.log, 'sys', 'Stock exhausted — the hand is a wash. Redeal.'),
  }
}

/** Begin the next round after a roundOver (loser/next deals; we alternate starter). */
export function nextRound(s: GinState, deck?: Card[], seed?: number): GinState {
  if (s.phase === 'gameOver') return s
  const base = deck ?? shuffled(freshDeck(), seed != null ? mulberry32(seed) : Math.random)
  // alternate who draws first each hand
  const lastStarter: Who = s.round?.by ?? 'you'
  const starter: Who = lastStarter === 'you' ? 'ai' : 'you'
  return deal(base, s.scores, s.log, starter)
}

/* ----------------------------- AI ----------------------------- */

/** Value of the best discard hand the AI can reach by adding `card` then dropping its worst. */
function evaluateWithCard(hand: Card[], card: Card): { dead: number; drop: Card } {
  const h = hand.concat([card])
  // try dropping each card; pick the drop that minimises deadwood (prefer dropping high cards on ties)
  let best: { dead: number; drop: Card } | null = null
  for (const c of h) {
    const rest = h.filter((x) => x.id !== c.id)
    const dead = deadwoodOf(rest)
    if (
      best == null ||
      dead < best.dead ||
      (dead === best.dead && cardValue(c) > cardValue(best.drop))
    ) {
      best = { dead, drop: c }
    }
  }
  return best!
}

/**
 * The AI takes its WHOLE turn (draw THEN discard, possibly knock/gin) in one
 * call. Heuristic: it compares taking the up-card vs an estimated stock draw,
 * takes the discard only if it strictly helps (lower resulting deadwood); then
 * discards the card that leaves the smallest deadwood (dumping high cards on
 * ties); knocks/gins when its post-discard deadwood ≤ 10 (gin at 0).
 */
export function aiTurn(s: GinState): GinState {
  if (s.turn !== 'ai' || s.phase === 'roundOver' || s.phase === 'gameOver') return s

  const hand = s.ai
  const baseDead = deadwoodOf(hand)

  // Evaluate the visible discard.
  const up = topDiscard(s)
  const upEval = up ? evaluateWithCard(hand, up) : null

  // Take the discard if it improves on the current deadwood (strict), else draw stock.
  let st = s
  let drewDiscard = false
  if (upEval && upEval.dead < baseDead && s.stock.length > 0) {
    st = drawDiscard(s)
    drewDiscard = true
  } else if (s.stock.length > 0) {
    st = drawStock(s)
  } else if (up) {
    // no stock left: must take discard
    st = drawDiscard(s)
    drewDiscard = true
  } else {
    return washRound(s)
  }

  // Now choose a discard from the 11-card hand minimising deadwood.
  const h11 = st.ai
  let bestDrop: Card | null = null
  let bestDead = Infinity
  for (const c of h11) {
    // never re-discard the very card we just drew from the discard (illegal)
    if (drewDiscard && up && c.id === up.id) continue
    const rest = h11.filter((x) => x.id !== c.id)
    const dead = deadwoodOf(rest)
    if (
      dead < bestDead ||
      (dead === bestDead && bestDrop != null && cardValue(c) > cardValue(bestDrop))
    ) {
      bestDead = dead
      bestDrop = c
    }
  }
  if (bestDrop == null) bestDrop = h11[h11.length - 1]

  const willGin = bestDead === 0
  const willKnock = bestDead <= 10 // knock whenever legal (simple, advantageous early)

  return discard(st, bestDrop.id, willKnock || willGin)
}
