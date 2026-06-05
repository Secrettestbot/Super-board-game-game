/* JAIPUR — logic (built for this codebase, not ported).
   2-player set-collection in a Rajasthan bazaar. You and a rival trade six goods —
   Diamond / Gold / Silver (expensive) and Cloth / Spice / Leather (cheap) — plus camels.
   On your turn you TAKE (one market good, all the camels, or a multi-card swap) or SELL a
   set of identical goods for the top goods-tokens (+ a bonus for big sets). A round ends
   when 3 token stacks empty or the deck can't refill; most points (camel +5 to the bigger
   herd) wins. Single round — higher total wins. The AI is a greedy heuristic. */

export type Good = 'diamond' | 'gold' | 'silver' | 'cloth' | 'spice' | 'leather'
export type Card = Good | 'camel'
export type Side = 'you' | 'foe'

export const GOODS: Good[] = ['diamond', 'gold', 'silver', 'cloth', 'spice', 'leather']
export const EXPENSIVE: Good[] = ['diamond', 'gold', 'silver']
export const HAND_LIMIT = 7
export const MARKET_SIZE = 5

export const GOOD_LABEL: Record<Good, string> = {
  diamond: 'Diamond', gold: 'Gold', silver: 'Silver', cloth: 'Cloth', spice: 'Spice', leather: 'Leather',
}

// deck composition (camels handled separately as the rest)
const DECK_COMP: Record<Card, number> = {
  diamond: 6, gold: 6, silver: 6, cloth: 8, spice: 8, leather: 10, camel: 11,
}

// goods-token stacks: descending values, top of stack = highest remaining
const TOKEN_VALUES: Record<Good, number[]> = {
  diamond: [7, 7, 5, 5, 5],
  gold:    [6, 6, 5, 5, 5],
  silver:  [5, 5, 5, 5, 5],
  cloth:   [5, 3, 3, 2, 2, 1, 1],
  spice:   [5, 3, 3, 2, 2, 1, 1],
  leather: [4, 3, 2, 1, 1, 1, 1, 1, 1],
}

// bonus tokens by set size — averaged face values per real Jaipur
const BONUS: Record<3 | 4 | 5, number[]> = {
  3: [2, 2, 3, 3], 4: [4, 4, 5, 5, 6], 5: [8, 9, 10, 10],
}

export interface LogEntry { t: string; x: string }

export interface JaipurState {
  deck: Card[]
  market: Card[]                 // length 5
  hand: Record<Side, Good[]>     // goods only
  herd: Record<Side, number>     // camels
  tokens: Record<Good, number[]> // remaining stacks, top = index 0
  bonus: Record<3 | 4 | 5, number[]>
  scoreTokens: Record<Side, number[]>  // collected goods-token values
  bonusTokens: Record<Side, number[]>  // collected bonus values
  turn: Side | null
  winner: Side | 'tie' | null
  log: LogEntry[]
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }
const other = (s: Side): Side => s === 'you' ? 'foe' : 'you'

function shuffle<T>(a: T[]): T[] {
  const r = a.slice()
  for (let i = r.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[r[i], r[j]] = [r[j], r[i]] }
  return r
}

function buildDeck(): Card[] {
  const d: Card[] = []
  for (const c of Object.keys(DECK_COMP) as Card[]) for (let k = 0; k < DECK_COMP[c]; k++) d.push(c)
  return shuffle(d)
}

export function makeGame(): JaipurState {
  // market starts with 3 camels + 2 random goods drawn from the deck
  let deck = buildDeck()
  // pull 3 camels for the market
  const market: Card[] = ['camel', 'camel', 'camel']
  let camelsPulled = 0
  deck = deck.filter(c => { if (c === 'camel' && camelsPulled < 3) { camelsPulled++; return false } return true })
  // draw 2 goods (skip camels) for the remaining slots
  while (market.length < MARKET_SIZE) {
    const i = deck.findIndex(c => c !== 'camel')
    if (i < 0) break
    market.push(deck[i]); deck.splice(i, 1)
  }

  const tokens = {} as Record<Good, number[]>
  for (const g of GOODS) tokens[g] = TOKEN_VALUES[g].slice()

  return {
    deck,
    market,
    hand: { you: [], foe: [] },
    herd: { you: 0, foe: 0 },
    tokens,
    bonus: { 3: BONUS[3].slice(), 4: BONUS[4].slice(), 5: BONUS[5].slice() },
    scoreTokens: { you: [], foe: [] },
    bonusTokens: { you: [], foe: [] },
    turn: 'you',
    winner: null,
    log: [{ t: 'sys', x: 'The bazaar is open. Take goods or camels, then sell sets for the richest tokens.' }],
  }
}

export function tokenTop(s: JaipurState, g: Good): number { return s.tokens[g].length ? s.tokens[g][0] : 0 }
export function emptyStacks(s: JaipurState): number { return GOODS.filter(g => s.tokens[g].length === 0).length }
export function sum(a: number[]): number { return a.reduce((x, y) => x + y, 0) }

export function totalScore(s: JaipurState, side: Side): number {
  let t = sum(s.scoreTokens[side]) + sum(s.bonusTokens[side])
  if (s.herd[side] > s.herd[other(side)]) t += 5
  return t
}

// --- legal-action helpers ---------------------------------------------------

export function marketGoods(s: JaipurState): number[] {
  return s.market.map((c, i) => (c !== 'camel' ? i : -1)).filter(i => i >= 0)
}
export function marketCamels(s: JaipurState): number {
  return s.market.filter(c => c === 'camel').length
}
/** Sellable goods in a side's hand: count of each type, honoring the expensive ≥2 rule. */
export function sellableSets(s: JaipurState, side: Side): { good: Good; count: number }[] {
  const out: { good: Good; count: number }[] = []
  for (const g of GOODS) {
    const n = s.hand[side].filter(x => x === g).length
    if (n >= 1 && !(EXPENSIVE.includes(g) && n < 2)) out.push({ good: g, count: n })
  }
  return out
}
export function canSell(s: JaipurState, side: Side, g: Good): boolean {
  const n = s.hand[side].filter(x => x === g).length
  if (n < 1) return false
  if (EXPENSIVE.includes(g) && n < 2) return false
  return true
}
export function handCount(s: JaipurState, side: Side): number { return s.hand[side].length }

// --- market refill / round end ---------------------------------------------

function refill(state: JaipurState): JaipurState {
  let deck = state.deck.slice()
  const market = state.market.slice()
  while (market.length < MARKET_SIZE && deck.length) market.push(deck.shift()!)
  return Object.assign({}, state, { deck, market })
}

/** Round ends when 3 token stacks are empty or the deck can't keep the market full. */
function checkEnd(state: JaipurState): JaipurState {
  const deckOut = state.deck.length === 0 && state.market.length < MARKET_SIZE
  if (emptyStacks(state) >= 3 || deckOut) return finish(state)
  return state
}

function finish(state: JaipurState): JaipurState {
  const ty = totalScore(state, 'you'), tf = totalScore(state, 'foe')
  const winner: Side | 'tie' = ty === tf ? 'tie' : ty > tf ? 'you' : 'foe'
  const msg = winner === 'tie' ? `An even purse — ${ty} rupees each.`
    : `${winner === 'you' ? 'You' : 'The rival'} won the round, ${Math.max(ty, tf)} to ${Math.min(ty, tf)} rupees.`
  return Object.assign({}, state, { turn: null, winner, log: push(state.log, winner === 'you' ? 'you' : 'ai', msg) })
}

const who = (side: Side) => side === 'you' ? 'You' : 'The rival'

// --- actions ----------------------------------------------------------------

/** Take a single goods card from market slot `i` into hand; refill; pass turn. */
export function takeGood(s: JaipurState, side: Side, i: number): JaipurState {
  if (s.winner || s.turn !== side) return s
  const card = s.market[i]
  if (!card || card === 'camel') return s
  if (handCount(s, side) >= HAND_LIMIT) return s
  const market = s.market.slice(); market.splice(i, 1)
  const hand = { ...s.hand, [side]: s.hand[side].concat([card as Good]) }
  let st = Object.assign({}, s, { market, hand })
  st = refill(st)
  st = Object.assign({}, st, { turn: other(side), log: push(st.log, side === 'you' ? 'you' : 'ai', `${who(side)} took a ${GOOD_LABEL[card as Good]} from the market.`) })
  return checkEnd(st)
}

/** Take ALL camels from the market into the herd; refill; pass turn. */
export function takeCamels(s: JaipurState, side: Side): JaipurState {
  if (s.winner || s.turn !== side) return s
  const n = marketCamels(s)
  if (n === 0) return s
  const market = s.market.filter(c => c !== 'camel')
  const herd = { ...s.herd, [side]: s.herd[side] + n }
  let st = Object.assign({}, s, { market, herd })
  st = refill(st)
  st = Object.assign({}, st, { turn: other(side), log: push(st.log, side === 'you' ? 'you' : 'ai', `${who(side)} took ${n} camel${n > 1 ? 's' : ''}.`) })
  return checkEnd(st)
}

/**
 * Swap: give `giveGoods` (goods from hand) + `giveCamels` (from herd) and take the
 * market goods at indices `take` — equal counts, ≥2. Market is NOT refilled (1:1 exchange).
 */
export function swap(s: JaipurState, side: Side, giveGoods: Good[], giveCamels: number, take: number[]): JaipurState {
  if (s.winner || s.turn !== side) return s
  const give = giveGoods.length + giveCamels
  if (give < 2 || give !== take.length) return s
  // all taken slots must be goods and distinct
  const set = new Set(take)
  if (set.size !== take.length) return s
  if (take.some(i => !s.market[i] || s.market[i] === 'camel')) return s
  // you must actually hold what you give
  const handCopy = s.hand[side].slice()
  for (const g of giveGoods) { const k = handCopy.indexOf(g); if (k < 0) return s; handCopy.splice(k, 1) }
  if (giveCamels > s.herd[side]) return s
  // hand limit after swap: incoming goods count, outgoing camels never counted
  const incoming = take.length
  if (handCopy.length + incoming > HAND_LIMIT) return s

  const taken = take.map(i => s.market[i] as Good)
  const market = s.market.filter((_, i) => !set.has(i)).concat(giveGoods)
  const herd = { ...s.herd, [side]: s.herd[side] - giveCamels }
  const hand = { ...s.hand, [side]: handCopy.concat(taken) }
  let st = Object.assign({}, s, { market, herd, hand })
  // refill only if camels were given (market shrank below 5); generally stays at 5
  st = refill(st)
  st = Object.assign({}, st, { turn: other(side), log: push(st.log, side === 'you' ? 'you' : 'ai', `${who(side)} swapped ${give} card${give > 1 ? 's' : ''} for market goods.`) })
  return checkEnd(st)
}

/** Sell every copy of good `g` from hand: collect top tokens (one per card) + size bonus. */
export function sell(s: JaipurState, side: Side, g: Good): JaipurState {
  if (s.winner || s.turn !== side) return s
  if (!canSell(s, side, g)) return s
  const n = s.hand[side].filter(x => x === g).length
  const stack = s.tokens[g].slice()
  const got: number[] = []
  for (let k = 0; k < n && stack.length; k++) got.push(stack.shift()!)
  const tokens = { ...s.tokens, [g]: stack }
  const hand = { ...s.hand, [side]: s.hand[side].filter(x => x !== g) }
  const scoreTokens = { ...s.scoreTokens, [side]: s.scoreTokens[side].concat(got) }

  // size bonus for 3 / 4 / 5+ cards sold at once
  let bonusVal = 0
  const bonus = { 3: s.bonus[3].slice(), 4: s.bonus[4].slice(), 5: s.bonus[5].slice() }
  const tier: 3 | 4 | 5 | null = n >= 5 ? 5 : n === 4 ? 4 : n === 3 ? 3 : null
  let bonusTokens = s.bonusTokens
  if (tier !== null && bonus[tier].length) {
    bonusVal = bonus[tier].shift()!
    bonusTokens = { ...s.bonusTokens, [side]: s.bonusTokens[side].concat([bonusVal]) }
  }

  let st = Object.assign({}, s, { tokens, hand, scoreTokens, bonus, bonusTokens })
  const gain = sum(got) + bonusVal
  st = Object.assign({}, st, { turn: other(side), log: push(st.log, side === 'you' ? 'you' : 'ai', `${who(side)} sold ${n} ${GOOD_LABEL[g]} for ${gain} rupees${bonusVal ? ` (incl. +${bonusVal} bonus)` : ''}.`) })
  return checkEnd(st)
}

// --- AI: greedy heuristic ---------------------------------------------------

const GOOD_WEIGHT: Record<Good, number> = { diamond: 7, gold: 6, silver: 5, cloth: 3, spice: 3, leather: 2 }

/** One whole AI turn (the rival is 'foe'). Greedy: sell good sets, else take value / camels. */
export function aiTurn(s: JaipurState): JaipurState {
  if (s.winner || s.turn !== 'foe') return s
  const me: Side = 'foe'

  // 1) Sell if we hold a strong sellable set — prefer big sets (bonus) and high-value tokens.
  const sets = sellableSets(s, me)
  let bestSell: { good: Good; score: number } | null = null
  for (const { good, count } of sets) {
    const top = tokenTop(s, good)
    // value of selling now: sum of top tokens we'd grab + an estimate of the bonus
    let val = 0
    const stack = s.tokens[good]
    for (let k = 0; k < count && k < stack.length; k++) val += stack[k]
    const bonusTier: 3 | 4 | 5 | 0 = count >= 5 ? 5 : count === 4 ? 4 : count === 3 ? 3 : 0
    if (bonusTier) val += 4
    // sell expensive goods eagerly; for cheap goods wait for ≥3 unless tokens are draining
    const drainPressure = emptyStacks(s) >= 1 || stack.length <= 2
    const worth = EXPENSIVE.includes(good)
      ? count >= 2
      : count >= 3 || (count >= 2 && drainPressure) || (top >= 4)
    if (worth && (!bestSell || val > bestSell.score)) bestSell = { good, score: val }
  }
  // forced sell if hand is full and nothing else helps
  const full = handCount(s, me) >= HAND_LIMIT
  if (bestSell && (bestSell.score >= 6 || full || emptyStacks(s) >= 1)) return sell(s, me, bestSell.good)

  // 2) Take all camels if there are several (good for swaps / the +5) and herd is modest.
  const camels = marketCamels(s)
  if (camels >= 2 && s.herd[me] < 7 && !full) return takeCamels(s, me)

  // 3) Take the most valuable market good we can fit.
  const goods = marketGoods(s)
  if (goods.length && !full) {
    let pick = -1, bestW = -1
    for (const i of goods) {
      const g = s.market[i] as Good
      const w = GOOD_WEIGHT[g] + (tokenTop(s, g) || 0)
      if (w > bestW) { bestW = w; pick = i }
    }
    if (pick >= 0) return takeGood(s, me, pick)
  }

  // 4) Fallbacks: a forced sell, take camels, or pass the turn.
  if (bestSell) return sell(s, me, bestSell.good)
  if (sets.length) return sell(s, me, sets[0].good)
  if (camels > 0) return takeCamels(s, me)
  // nothing legal — pass (treated as end check)
  return checkEnd(Object.assign({}, s, { turn: 'you' as Side, log: push(s.log, 'sys', 'The rival had no useful move and passed.') }))
}
