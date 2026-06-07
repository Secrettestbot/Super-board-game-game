/* SPLENDOR — pure logic (built for this codebase, not ported).
   A 2-player gem engine-building game: you (player 0) vs a greedy AI (player 1).
   Collect gem tokens, buy development cards whose owned bonuses act as permanent
   discounts, attract nobles, and race to 15 prestige. First to 15 triggers a final
   round so both players have had equal turns; highest prestige wins (tie -> fewest cards).

   NO React/DOM. Deterministic setup is available for tests via makeGame(setup).
*/

export type Gem = 'emerald' | 'sapphire' | 'ruby' | 'diamond' | 'onyx'
export type Tok = Gem | 'gold'

export const GEMS: Gem[] = ['emerald', 'sapphire', 'ruby', 'diamond', 'onyx']
export const TOKS: Tok[] = ['emerald', 'sapphire', 'ruby', 'diamond', 'onyx', 'gold']

/** Per-gem amount map; defaults to 0 for any unset color. */
export type Cost = Partial<Record<Gem, number>>

export interface Card {
  id: string
  tier: 1 | 2 | 3
  cost: Cost
  /** The permanent gem discount this card grants when bought. */
  bonus: Gem
  /** Prestige points (0..5). */
  points: number
}

export interface Noble {
  id: string
  /** Bonus requirement per gem color (e.g. { ruby: 3, onyx: 3 }). */
  req: Cost
  points: number
}

export interface PlayerState {
  /** Tokens currently held, per color (gold included). */
  tokens: Record<Tok, number>
  /** Permanent bonuses from bought cards, per gem color. */
  bonuses: Record<Gem, number>
  /** Reserved cards (max 3). */
  reserved: Card[]
  /** Bought cards (kept for prestige + card-count tiebreak). */
  bought: Card[]
  prestige: number
  nobles: Noble[]
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface SplendorState {
  /** Token bank, per color (gem 0..4, gold 0..5 at start). */
  bank: Record<Tok, number>
  /** Remaining face-down deck for each tier (index 0 = tier 1). */
  decks: [Card[], Card[], Card[]]
  /** Up to 4 face-up cards per tier; null = empty slot (deck exhausted). */
  visible: [(Card | null)[], (Card | null)[], (Card | null)[]]
  nobles: Noble[]
  players: [PlayerState, PlayerState]
  /** 0 = you, 1 = AI. */
  turn: 0 | 1
  winner: 0 | 1 | null
  /** True once someone reaches 15 prestige; game ends after player 1 finishes the round. */
  finalRound: boolean
  /** Monotonic counter — bumped every applied action so the AI driver re-arms. */
  step: number
  log: LogEntry[]
}

export const WIN_PRESTIGE = 15
export const TOKEN_LIMIT = 10
export const MAX_RESERVED = 3
const VISIBLE_PER_TIER = 4

// ----------------------------------------------------------------------------
// Card / noble data
// ----------------------------------------------------------------------------

function c(id: string, tier: 1 | 2 | 3, bonus: Gem, points: number, cost: Cost): Card {
  return { id, tier, bonus, points, cost }
}

/** Compact tier decks — enough variety to play full games. (cost letters: e s r d o) */
const TIER1: Card[] = [
  c('t1-01', 1, 'emerald', 0, { ruby: 2, onyx: 1 }),
  c('t1-02', 1, 'emerald', 0, { sapphire: 1, ruby: 1, diamond: 1, onyx: 1 }),
  c('t1-03', 1, 'emerald', 1, { onyx: 3 }),
  c('t1-04', 1, 'emerald', 0, { sapphire: 2, onyx: 2 }),
  c('t1-05', 1, 'sapphire', 0, { diamond: 1, onyx: 2 }),
  c('t1-06', 1, 'sapphire', 0, { emerald: 1, ruby: 2, onyx: 2 }),
  c('t1-07', 1, 'sapphire', 1, { ruby: 4 }),
  c('t1-08', 1, 'sapphire', 0, { emerald: 2, diamond: 2 }),
  c('t1-09', 1, 'ruby', 0, { emerald: 2, onyx: 1 }),
  c('t1-10', 1, 'ruby', 0, { diamond: 1, emerald: 1, sapphire: 1, onyx: 1 }),
  c('t1-11', 1, 'ruby', 1, { diamond: 4 }),
  c('t1-12', 1, 'ruby', 0, { emerald: 2, sapphire: 2 }),
  c('t1-13', 1, 'diamond', 0, { sapphire: 2, ruby: 1 }),
  c('t1-14', 1, 'diamond', 0, { emerald: 1, sapphire: 1, ruby: 1, onyx: 1 }),
  c('t1-15', 1, 'diamond', 1, { sapphire: 3 }),
  c('t1-16', 1, 'diamond', 0, { emerald: 2, ruby: 2 }),
  c('t1-17', 1, 'onyx', 0, { emerald: 1, diamond: 2 }),
  c('t1-18', 1, 'onyx', 0, { emerald: 1, sapphire: 2, ruby: 1 }),
  c('t1-19', 1, 'onyx', 1, { emerald: 4 }),
  c('t1-20', 1, 'onyx', 0, { sapphire: 2, diamond: 2 }),
]

const TIER2: Card[] = [
  c('t2-01', 2, 'emerald', 1, { sapphire: 3, emerald: 2, onyx: 2 }),
  c('t2-02', 2, 'emerald', 2, { sapphire: 5 }),
  c('t2-03', 2, 'emerald', 3, { emerald: 6 }),
  c('t2-04', 2, 'sapphire', 1, { sapphire: 2, emerald: 2, diamond: 3 }),
  c('t2-05', 2, 'sapphire', 2, { sapphire: 5, diamond: 3 }),
  c('t2-06', 2, 'sapphire', 2, { diamond: 5 }),
  c('t2-07', 2, 'ruby', 1, { emerald: 3, ruby: 2, onyx: 3 }),
  c('t2-08', 2, 'ruby', 2, { ruby: 5, onyx: 3 }),
  c('t2-09', 2, 'ruby', 3, { ruby: 6 }),
  c('t2-10', 2, 'diamond', 1, { emerald: 3, ruby: 2, diamond: 2 }),
  c('t2-11', 2, 'diamond', 2, { ruby: 5, diamond: 3 }),
  c('t2-12', 2, 'diamond', 2, { onyx: 5 }),
  c('t2-13', 2, 'onyx', 1, { diamond: 3, onyx: 2, sapphire: 2 }),
  c('t2-14', 2, 'onyx', 2, { diamond: 5, onyx: 3 }),
  c('t2-15', 2, 'onyx', 3, { onyx: 6 }),
]

const TIER3: Card[] = [
  c('t3-01', 3, 'emerald', 4, { emerald: 3, ruby: 3, sapphire: 3, onyx: 5 }),
  c('t3-02', 3, 'emerald', 5, { emerald: 7 }),
  c('t3-03', 3, 'emerald', 4, { emerald: 6, sapphire: 3, onyx: 3 }),
  c('t3-04', 3, 'sapphire', 4, { diamond: 5, sapphire: 3, ruby: 3, emerald: 3 }),
  c('t3-05', 3, 'sapphire', 5, { sapphire: 7 }),
  c('t3-06', 3, 'sapphire', 4, { sapphire: 6, diamond: 3, onyx: 3 }),
  c('t3-07', 3, 'ruby', 4, { diamond: 3, emerald: 3, ruby: 3, onyx: 5 }),
  c('t3-08', 3, 'ruby', 5, { ruby: 7 }),
  c('t3-09', 3, 'ruby', 4, { ruby: 6, diamond: 3, onyx: 3 }),
  c('t3-10', 3, 'diamond', 4, { diamond: 3, sapphire: 3, ruby: 5, onyx: 3 }),
  c('t3-11', 3, 'diamond', 5, { diamond: 7 }),
  c('t3-12', 3, 'diamond', 4, { diamond: 6, ruby: 3, onyx: 3 }),
  c('t3-13', 3, 'onyx', 4, { diamond: 5, emerald: 3, ruby: 3, onyx: 3 }),
  c('t3-14', 3, 'onyx', 5, { onyx: 7 }),
  c('t3-15', 3, 'onyx', 4, { onyx: 6, ruby: 3, diamond: 3 }),
]

const NOBLES: Noble[] = [
  { id: 'n1', req: { ruby: 4, onyx: 4 }, points: 3 },
  { id: 'n2', req: { diamond: 4, sapphire: 4 }, points: 3 },
  { id: 'n3', req: { emerald: 4, sapphire: 4 }, points: 3 },
  { id: 'n4', req: { emerald: 3, sapphire: 3, ruby: 3 }, points: 3 },
  { id: 'n5', req: { ruby: 3, diamond: 3, onyx: 3 }, points: 3 },
  { id: 'n6', req: { emerald: 3, diamond: 3, onyx: 3 }, points: 3 },
]

// ----------------------------------------------------------------------------
// Setup
// ----------------------------------------------------------------------------

export interface Setup {
  /** Deterministic RNG returning [0,1); defaults to Math.random. */
  rng?: () => number
  /** Skip shuffling (deterministic deck order) — handy for tests. */
  noShuffle?: boolean
}

function zeroToks(): Record<Tok, number> {
  return { emerald: 0, sapphire: 0, ruby: 0, diamond: 0, onyx: 0, gold: 0 }
}
function zeroGems(): Record<Gem, number> {
  return { emerald: 0, sapphire: 0, ruby: 0, diamond: 0, onyx: 0 }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

function emptyPlayer(): PlayerState {
  return { tokens: zeroToks(), bonuses: zeroGems(), reserved: [], bought: [], prestige: 0, nobles: [] }
}

export function makeGame(setup: Setup = {}): SplendorState {
  const rng = setup.rng ?? Math.random
  const order = (deck: Card[]) => (setup.noShuffle ? deck.slice() : shuffle(deck, rng))
  const decks: [Card[], Card[], Card[]] = [order(TIER1), order(TIER2), order(TIER3)]
  const visible: [(Card | null)[], (Card | null)[], (Card | null)[]] = [[], [], []]
  for (let t = 0; t < 3; t++) {
    for (let i = 0; i < VISIBLE_PER_TIER; i++) {
      visible[t].push(decks[t].length ? decks[t].shift()! : null)
    }
  }
  const nobleSet = setup.noShuffle ? NOBLES.slice() : shuffle(NOBLES, rng)
  const nobles = nobleSet.slice(0, 3) // 2-player: 3 nobles
  const bank: Record<Tok, number> = { emerald: 4, sapphire: 4, ruby: 4, diamond: 4, onyx: 4, gold: 5 }
  return {
    bank,
    decks,
    visible,
    nobles,
    players: [emptyPlayer(), emptyPlayer()],
    turn: 0,
    winner: null,
    finalRound: false,
    step: 0,
    log: [{ t: 'sys', x: 'Collect gems, buy cards, attract nobles. First to 15 prestige triggers the final round.' }],
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-24)
}

function totalTokens(p: PlayerState): number {
  let n = 0
  for (const k of TOKS) n += p.tokens[k]
  return n
}

/** Net cost of a card for a player after bonus discounts: returns gem -> needed amount (>=0). */
export function netCost(p: PlayerState, card: Card): Record<Gem, number> {
  const out = zeroGems()
  for (const g of GEMS) {
    const need = (card.cost[g] ?? 0) - p.bonuses[g]
    out[g] = need > 0 ? need : 0
  }
  return out
}

/** How much gold a player must spend to cover a card (0 if fully affordable in plain gems). */
export function goldNeeded(p: PlayerState, card: Card): number {
  let gold = 0
  const net = netCost(p, card)
  for (const g of GEMS) {
    const short = net[g] - p.tokens[g]
    if (short > 0) gold += short
  }
  return gold
}

/** Can this player afford the card (using bonuses as discount and gold as wild)? */
export function canAfford(p: PlayerState, card: Card): boolean {
  return goldNeeded(p, card) <= p.tokens.gold
}

export function clone(s: SplendorState): SplendorState {
  return {
    bank: { ...s.bank },
    decks: [s.decks[0].slice(), s.decks[1].slice(), s.decks[2].slice()],
    visible: [s.visible[0].slice(), s.visible[1].slice(), s.visible[2].slice()],
    nobles: s.nobles.slice(),
    players: [
      { ...s.players[0], tokens: { ...s.players[0].tokens }, bonuses: { ...s.players[0].bonuses }, reserved: s.players[0].reserved.slice(), bought: s.players[0].bought.slice(), nobles: s.players[0].nobles.slice() },
      { ...s.players[1], tokens: { ...s.players[1].tokens }, bonuses: { ...s.players[1].bonuses }, reserved: s.players[1].reserved.slice(), bought: s.players[1].bought.slice(), nobles: s.players[1].nobles.slice() },
    ],
    turn: s.turn,
    winner: s.winner,
    finalRound: s.finalRound,
    step: s.step,
    log: s.log.slice(),
  }
}

const who = (p: 0 | 1) => (p === 0 ? 'You' : 'AI')

// ----------------------------------------------------------------------------
// Legality
// ----------------------------------------------------------------------------

/** Take 3 different-color gem tokens. Colors must be distinct gems that each have ≥1 in bank. */
export function canTake3(s: SplendorState, colors: Gem[]): boolean {
  if (s.winner != null) return false
  if (colors.length < 1 || colors.length > 3) return false
  const seen = new Set<Gem>()
  for (const g of colors) {
    if (!GEMS.includes(g)) return false
    if (seen.has(g)) return false
    seen.add(g)
    if (s.bank[g] < 1) return false
  }
  return true
}

/** Take 2 of the same color — only legal when that pile has at least 4. */
export function canTake2(s: SplendorState, color: Gem): boolean {
  if (s.winner != null) return false
  if (!GEMS.includes(color)) return false
  return s.bank[color] >= 4
}

function findVisible(s: SplendorState, id: string): { tier: number; idx: number; card: Card } | null {
  for (let t = 0; t < 3; t++) {
    const idx = s.visible[t].findIndex((cc) => cc != null && cc.id === id)
    if (idx >= 0) return { tier: t, idx, card: s.visible[t][idx]! }
  }
  return null
}

// ----------------------------------------------------------------------------
// Actions (all return a NEW state; illegal actions return the input unchanged)
// ----------------------------------------------------------------------------

/** Discard tokens down to TOKEN_LIMIT (only when over). `prefer` lists colors to drop first. */
function discardDown(p: PlayerState, prefer?: Tok[]): { p: PlayerState; bankBack: Record<Tok, number> } {
  const bankBack = zeroToks()
  let total = totalTokens(p)
  if (total <= TOKEN_LIMIT) return { p, bankBack }
  const tokens = { ...p.tokens }
  // Drop order: caller preference first, then most-held colors (keep gold last).
  const order: Tok[] = prefer && prefer.length
    ? prefer.slice()
    : ([...GEMS].sort((a, b) => tokens[b] - tokens[a]) as Tok[]).concat('gold')
  let oi = 0
  while (total > TOKEN_LIMIT) {
    // Pick next color that still has a token.
    let color: Tok | null = null
    for (let guard = 0; guard < TOKS.length + order.length; guard++) {
      const cand = order[oi % order.length]
      oi++
      if (tokens[cand] > 0) { color = cand; break }
    }
    if (color == null) {
      // Fallback: any color with tokens.
      color = TOKS.find((k) => tokens[k] > 0) ?? null
    }
    if (color == null) break
    tokens[color]--
    bankBack[color]++
    total--
  }
  return { p: { ...p, tokens }, bankBack }
}

function applyDiscardAndEnd(s: SplendorState, prefer?: Tok[]): SplendorState {
  const cur = s.turn
  const { p, bankBack } = discardDown(s.players[cur], prefer)
  let bank = s.bank
  let logged = false
  let log = s.log
  for (const k of TOKS) {
    if (bankBack[k] > 0) { logged = true; bank = bank === s.bank ? { ...s.bank } : bank; bank[k] += bankBack[k] }
  }
  const players = s.players.slice() as [PlayerState, PlayerState]
  players[cur] = p
  if (logged) log = push(log, cur === 0 ? 'you' : 'ai', `${who(cur)} discarded down to ${TOKEN_LIMIT} tokens.`)
  return endTurn({ ...s, bank, players, log })
}

/** Take up to 3 distinct gem tokens. */
export function take3(s: SplendorState, colors: Gem[], discardPrefer?: Tok[]): SplendorState {
  if (!canTake3(s, colors)) return s
  const cur = s.turn
  const bank = { ...s.bank }
  const tokens = { ...s.players[cur].tokens }
  for (const g of colors) { bank[g]--; tokens[g]++ }
  const players = s.players.slice() as [PlayerState, PlayerState]
  players[cur] = { ...players[cur], tokens }
  const log = push(s.log, cur === 0 ? 'you' : 'ai', `${who(cur)} took ${colors.join(', ')}.`)
  return applyDiscardAndEnd({ ...s, bank, players, log }, discardPrefer)
}

/** Take 2 tokens of one color (pile must have ≥4). */
export function take2(s: SplendorState, color: Gem, discardPrefer?: Tok[]): SplendorState {
  if (!canTake2(s, color)) return s
  const cur = s.turn
  const bank = { ...s.bank }
  const tokens = { ...s.players[cur].tokens }
  bank[color] -= 2
  tokens[color] += 2
  const players = s.players.slice() as [PlayerState, PlayerState]
  players[cur] = { ...players[cur], tokens }
  const log = push(s.log, cur === 0 ? 'you' : 'ai', `${who(cur)} took 2 ${color}.`)
  return applyDiscardAndEnd({ ...s, bank, players, log }, discardPrefer)
}

function refillSlot(s: SplendorState, tier: number, idx: number): void {
  // Mutates s.visible/decks (caller passes a fresh clone of those arrays).
  s.visible[tier][idx] = s.decks[tier].length ? s.decks[tier].shift()! : null
}

/**
 * Reserve a card: either a face-up card by id, or a blind top-deck draw via
 * { tier } (1..3). Gain 1 gold if available. Max 3 reserved.
 */
export function reserve(s: SplendorState, target: { id: string } | { tier: 1 | 2 | 3 }, discardPrefer?: Tok[]): SplendorState {
  if (s.winner != null) return s
  const cur = s.turn
  const me = s.players[cur]
  if (me.reserved.length >= MAX_RESERVED) return s

  const ns = clone(s)
  let card: Card | null = null
  if ('id' in target) {
    const found = findVisible(s, target.id)
    if (!found) return s
    card = found.card
    refillSlot(ns, found.tier, found.idx)
  } else {
    const t = target.tier - 1
    if (t < 0 || t > 2 || ns.decks[t].length === 0) return s
    card = ns.decks[t].shift()!
  }
  const player = ns.players[cur]
  player.reserved = player.reserved.concat([card])
  // Take a gold if any remain.
  let goldNote = ''
  if (ns.bank.gold > 0) {
    ns.bank.gold--
    player.tokens.gold++
    goldNote = ' (+1 gold)'
  }
  ns.players[cur] = player
  ns.log = push(ns.log, cur === 0 ? 'you' : 'ai', `${who(cur)} reserved a tier-${card.tier} card${goldNote}.`)
  return applyDiscardAndEnd(ns, discardPrefer)
}

/** Buy a card by id — from a face-up slot OR from the player's reserved pile. */
export function buy(s: SplendorState, id: string): SplendorState {
  if (s.winner != null) return s
  const cur = s.turn
  const me = s.players[cur]

  // Locate card: visible or reserved.
  let fromVisible: { tier: number; idx: number } | null = null
  let card: Card | null = null
  const found = findVisible(s, id)
  if (found) { card = found.card; fromVisible = { tier: found.tier, idx: found.idx } }
  else {
    const ri = me.reserved.findIndex((cc) => cc.id === id)
    if (ri >= 0) card = me.reserved[ri]
  }
  if (!card) return s
  if (!canAfford(me, card)) return s

  const ns = clone(s)
  const player = ns.players[cur]
  // Pay: spend plain gems first, gold for shortfall. Returned tokens go to bank.
  const net = netCost(player, card)
  for (const g of GEMS) {
    const need = net[g]
    const fromGem = Math.min(need, player.tokens[g])
    player.tokens[g] -= fromGem
    ns.bank[g] += fromGem
    const short = need - fromGem
    if (short > 0) {
      player.tokens.gold -= short
      ns.bank.gold += short
    }
  }
  // Acquire card.
  player.bonuses[card.bonus] += 1
  player.bought = player.bought.concat([card])
  player.prestige += card.points
  // Remove from source.
  if (fromVisible) refillSlot(ns, fromVisible.tier, fromVisible.idx)
  else player.reserved = player.reserved.filter((cc) => cc.id !== card!.id)
  ns.players[cur] = player
  ns.log = push(ns.log, cur === 0 ? 'you' : 'ai', `${who(cur)} bought a ${card.bonus} card (+${card.points}).`)

  // Noble visits.
  applyNobles(ns, cur)
  return endTurn(ns)
}

/** After acquiring a card, award any qualifying nobles (auto-visit). Mutates ns. */
function applyNobles(ns: SplendorState, cur: 0 | 1): void {
  const player = ns.players[cur]
  const remaining: Noble[] = []
  for (const n of ns.nobles) {
    if (qualifiesForNoble(player, n)) {
      player.nobles = player.nobles.concat([n])
      player.prestige += n.points
      ns.log = push(ns.log, cur === 0 ? 'you' : 'ai', `${who(cur)} attracted a noble (+${n.points}).`)
    } else {
      remaining.push(n)
    }
  }
  ns.nobles = remaining
}

export function qualifiesForNoble(p: PlayerState, n: Noble): boolean {
  for (const g of GEMS) {
    if (p.bonuses[g] < (n.req[g] ?? 0)) return false
  }
  return true
}

// ----------------------------------------------------------------------------
// Turn / end-game
// ----------------------------------------------------------------------------

function endTurn(s: SplendorState): SplendorState {
  const cur = s.turn
  let finalRound = s.finalRound
  let log = s.log
  // Trigger final round when someone first reaches WIN_PRESTIGE.
  if (!finalRound && (s.players[0].prestige >= WIN_PRESTIGE || s.players[1].prestige >= WIN_PRESTIGE)) {
    finalRound = true
    log = push(log, 'sys', `${WIN_PRESTIGE} prestige reached — final round!`)
  }
  // Game ends after player 1 (AI) completes the round, so both have had equal turns.
  if (finalRound && cur === 1) {
    const winner = decideWinner(s)
    log = push(log, winner === 0 ? 'you' : 'ai', `${who(winner)} win${winner === 0 ? '' : 's'} with ${s.players[winner].prestige} prestige.`)
    return { ...s, finalRound, winner, step: s.step + 1, log }
  }
  const next: 0 | 1 = cur === 0 ? 1 : 0
  return { ...s, finalRound, turn: next, step: s.step + 1, log }
}

/** Highest prestige wins; tie -> fewest bought cards; still tied -> player 0. */
export function decideWinner(s: SplendorState): 0 | 1 {
  const a = s.players[0], b = s.players[1]
  if (a.prestige !== b.prestige) return a.prestige > b.prestige ? 0 : 1
  if (a.bought.length !== b.bought.length) return a.bought.length < b.bought.length ? 0 : 1
  return 0
}

// ----------------------------------------------------------------------------
// AI — greedy heuristic
// ----------------------------------------------------------------------------

/** All cards the AI could consider buying/reserving: face-up + its reserved. */
function candidateCards(s: SplendorState): Card[] {
  const out: Card[] = []
  for (let t = 0; t < 3; t++) for (const cc of s.visible[t]) if (cc) out.push(cc)
  for (const cc of s.players[1].reserved) out.push(cc)
  return out
}

/** Score a card for purchase: prestige weighted heavily, plus progress toward nobles. */
function buyScore(s: SplendorState, card: Card): number {
  const me = s.players[1]
  let score = card.points * 6 + 1 // owning any card has small value (engine + tiebreak risk aside)
  // Bonus toward an unclaimed noble requirement we are progressing on.
  for (const n of s.nobles) {
    const req = n.req[card.bonus] ?? 0
    if (req > 0 && me.bonuses[card.bonus] < req) score += 2
  }
  // Cheap cards slightly preferred when point-equal (keeps engine flowing).
  let totalCost = 0
  for (const g of GEMS) totalCost += card.cost[g] ?? 0
  score -= totalCost * 0.05
  return score
}

/** Pick a target card to build toward (best score we can't yet afford), for token-taking. */
function targetCard(s: SplendorState): Card | null {
  const cands = candidateCards(s).filter((cc) => !canAfford(s.players[1], cc))
  if (!cands.length) return null
  cands.sort((a, b) => buyScore(s, b) - buyScore(s, a))
  // Prefer a reachable target: fewest tokens still needed (after gold), tiebreak by score.
  cands.sort((a, b) => {
    const ga = goldNeeded(s.players[1], a) - s.players[1].tokens.gold
    const gb = goldNeeded(s.players[1], b) - s.players[1].tokens.gold
    if (ga !== gb) return ga - gb
    return buyScore(s, b) - buyScore(s, a)
  })
  return cands[0]
}

/** Discard preference for the AI: drop colors NOT needed for the target first (gold last). */
function aiDiscardPrefer(s: SplendorState, target: Card | null): Tok[] {
  const me = s.players[1]
  const needed = new Set<Gem>()
  if (target) {
    const net = netCost(me, target)
    for (const g of GEMS) if (net[g] > 0) needed.add(g)
  }
  const notNeeded = GEMS.filter((g) => !needed.has(g))
  const neededList = GEMS.filter((g) => needed.has(g))
  // Drop surplus (not-needed) gems first, then needed gems, then gold as a last resort.
  return ([...notNeeded, ...neededList] as Tok[]).concat('gold')
}

/** Which gem colors most help toward the target card (where we're short). */
function neededColors(s: SplendorState, card: Card): Gem[] {
  const me = s.players[1]
  const net = netCost(me, card)
  const short: { g: Gem; n: number }[] = []
  for (const g of GEMS) {
    const s2 = net[g] - me.tokens[g]
    if (s2 > 0) short.push({ g, n: s2 })
  }
  short.sort((a, b) => b.n - a.n)
  return short.map((x) => x.g)
}

/**
 * One AI turn: buy the best affordable card; else take tokens toward a target;
 * else reserve a strong card; else take whatever tokens are available. Always
 * makes progress (token-take is the guaranteed fallback). Returns a NEW state.
 */
export function aiTurn(s: SplendorState): SplendorState {
  if (s.winner != null || s.turn !== 1) return s
  const me = s.players[1]

  // 1) Buy the best affordable card.
  const affordable = candidateCards(s).filter((cc) => canAfford(me, cc))
  if (affordable.length) {
    affordable.sort((a, b) => buyScore(s, b) - buyScore(s, a))
    const best = affordable[0]
    // Only skip a free/positive buy if it has 0 points AND we have a clearly better near-term target.
    return buy(s, best.id)
  }

  // 2) Take tokens toward a target card.
  const target = targetCard(s)
  if (target) {
    const want = neededColors(s, target)
    // Prefer take-2 if we need ≥2 of one color and that pile allows it.
    if (want.length >= 1) {
      const top = want[0]
      const net = netCost(me, target)
      if ((net[top] - me.tokens[top]) >= 2 && canTake2(s, top)) {
        return take2(s, top, aiDiscardPrefer(s, target))
      }
    }
    // Otherwise take up to 3 distinct needed colors that are in the bank.
    const pick: Gem[] = []
    for (const g of want) { if (s.bank[g] >= 1 && pick.length < 3) pick.push(g) }
    // Fill remaining slots with any other available gems (still progress / flexibility).
    if (pick.length < 3) {
      for (const g of GEMS) {
        if (pick.length >= 3) break
        if (!pick.includes(g) && s.bank[g] >= 1) pick.push(g)
      }
    }
    if (pick.length >= 1 && canTake3(s, pick)) return take3(s, pick, aiDiscardPrefer(s, target))
  }

  // 3) Reserve a strong (high-point) card to deny it / gain gold, if room.
  if (me.reserved.length < MAX_RESERVED) {
    const allVisible: Card[] = []
    for (let t = 0; t < 3; t++) for (const cc of s.visible[t]) if (cc) allVisible.push(cc)
    if (allVisible.length) {
      allVisible.sort((a, b) => b.points - a.points || buyScore(s, b) - buyScore(s, a))
      const top = allVisible[0]
      if (top.points >= 3) return reserve(s, { id: top.id })
    }
  }

  // 4) Guaranteed-progress fallback: take any available tokens.
  const avail = GEMS.filter((g) => s.bank[g] >= 1)
  if (avail.length >= 1) {
    const pick = avail.slice(0, 3)
    if (canTake3(s, pick)) return take3(s, pick)
  }
  for (const g of GEMS) if (canTake2(s, g)) return take2(s, g)
  // 5) Nothing to take at all (bank fully empty): reserve blind from any non-empty deck.
  for (let t = 0 as 0 | 1 | 2; t < 3; t = (t + 1) as 0 | 1 | 2) {
    if (s.decks[t].length && me.reserved.length < MAX_RESERVED) {
      return reserve(s, { tier: (t + 1) as 1 | 2 | 3 })
    }
  }
  // Truly stuck (no tokens, no cards, reserved full): pass the turn to avoid a stall.
  return endTurn(s)
}
