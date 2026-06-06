/* ALHAMBRA — pure logic (built for this codebase, not ported).
   A 3-player tile-buying game: you (player 0) vs two greedy AIs (players 1, 2).
   Collect money cards in 4 currencies, buy building tiles from the market (each
   tile is priced in one specific currency), place them into your Alhambra, and
   build type-majorities. Paying the EXACT cost grants an extra turn. Scoring
   happens in 3 rounds (triggered as the money deck depletes); the player with the
   MOST of each building type scores, plus a longest-wall bonus. Most points wins.

   NO React/DOM. Deterministic setup is available for tests via makeGame(setup).
*/

export type Currency = 'green' | 'blue' | 'orange' | 'yellow'
export type Building = 'pavilion' | 'seraglio' | 'arcade' | 'chambers' | 'garden' | 'tower'

export const CURRENCIES: Currency[] = ['green', 'blue', 'orange', 'yellow']
export const BUILDINGS: Building[] = ['pavilion', 'seraglio', 'arcade', 'chambers', 'garden', 'tower']

/** A money card: one currency, one value. */
export interface MoneyCard {
  id: string
  currency: Currency
  value: number
}

/** A building tile available in the market or placed in an Alhambra. */
export interface Tile {
  id: string
  building: Building
  /** Currency the price must be paid in. */
  priceCur: Currency
  /** Cost in that currency. */
  cost: number
}

/** A placed tile and its grid coordinate. */
export interface Placed {
  tile: Tile
  x: number
  y: number
}

export interface PlayerState {
  /** Money cards held (any number, any currency). */
  hand: MoneyCard[]
  /** Buildings placed into the Alhambra. */
  alhambra: Placed[]
  /** Reserved tile not yet placed (at most one in this simplification). */
  reserved: Tile | null
  /** Running score (filled as scoring rounds fire). */
  score: number
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export type PlayerIdx = 0 | 1 | 2

export interface AlhambraState {
  /** Money market: up to 4 face-up money cards (null = empty slot). */
  moneyMarket: (MoneyCard | null)[]
  /** Draw deck for money cards. */
  moneyDeck: MoneyCard[]
  /** Building market: up to 4 face-up tiles (null = empty slot). */
  buildingMarket: (Tile | null)[]
  /** Draw deck for building tiles. */
  buildingDeck: Tile[]
  players: [PlayerState, PlayerState, PlayerState]
  /** Whose turn (0 = you, 1/2 = AI). */
  turn: PlayerIdx
  /** Scoring rounds already resolved (0..3). */
  roundsScored: number
  /** Deck-size thresholds that trigger the next scoring round. */
  scoreTriggers: number[]
  winner: PlayerIdx | null
  /** Monotonic counter — bumped every applied action so the AI driver re-arms. */
  step: number
  log: LogEntry[]
}

export const NUM_PLAYERS = 3
const MARKET_SIZE = 4
export const MAX_TAKE_SUM = 5

// ----------------------------------------------------------------------------
// Setup data
// ----------------------------------------------------------------------------

export interface Setup {
  rng?: () => number
  noShuffle?: boolean
}

function buildMoneyDeck(): MoneyCard[] {
  const out: MoneyCard[] = []
  let n = 0
  // A spread of values 1..3 per currency, several copies — enough for full games.
  for (const cur of CURRENCIES) {
    for (const value of [1, 2, 3]) {
      const copies = value === 1 ? 8 : value === 2 ? 6 : 5
      for (let i = 0; i < copies; i++) out.push({ id: `m${n++}`, currency: cur, value })
    }
  }
  return out
}

function buildTileDeck(): Tile[] {
  const out: Tile[] = []
  let n = 0
  // Each building type appears multiple times across the 4 currencies/costs.
  for (const building of BUILDINGS) {
    for (const priceCur of CURRENCIES) {
      // Costs vary by building to create texture; two copies of each combo.
      const base = 2 + (BUILDINGS.indexOf(building) % 4)
      for (const cost of [base, base + 2]) {
        out.push({ id: `t${n++}`, building, priceCur, cost })
      }
    }
  }
  return out
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
  return { hand: [], alhambra: [], reserved: null, score: 0 }
}

function drawTo<T>(market: (T | null)[], deck: T[], size: number): void {
  for (let i = 0; i < size; i++) {
    if (market[i] == null) market[i] = deck.length ? deck.shift()! : null
  }
}

export function makeGame(setup: Setup = {}): AlhambraState {
  const rng = setup.rng ?? Math.random
  const moneyDeck = setup.noShuffle ? buildMoneyDeck() : shuffle(buildMoneyDeck(), rng)
  const buildingDeck = setup.noShuffle ? buildTileDeck() : shuffle(buildTileDeck(), rng)

  const players: [PlayerState, PlayerState, PlayerState] = [emptyPlayer(), emptyPlayer(), emptyPlayer()]
  // Deal each player a small starting hand (so early buys are possible).
  for (let i = 0; i < NUM_PLAYERS; i++) {
    for (let k = 0; k < 4; k++) if (moneyDeck.length) players[i].hand.push(moneyDeck.shift()!)
  }

  const moneyMarket: (MoneyCard | null)[] = new Array(MARKET_SIZE).fill(null)
  drawTo(moneyMarket, moneyDeck, MARKET_SIZE)
  const buildingMarket: (Tile | null)[] = new Array(MARKET_SIZE).fill(null)
  drawTo(buildingMarket, buildingDeck, MARKET_SIZE)

  // Three scoring rounds as the money deck depletes toward 0.
  const start = moneyDeck.length
  const scoreTriggers = [Math.floor(start * 0.6), Math.floor(start * 0.3), 0]

  return {
    moneyMarket,
    moneyDeck,
    buildingMarket,
    buildingDeck,
    players,
    turn: 0,
    roundsScored: 0,
    scoreTriggers,
    winner: null,
    step: 0,
    log: [{ t: 'sys', x: 'Collect money in 4 currencies, buy building tiles, and build type majorities. Three scoring rounds; most points wins.' }],
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-24)
}

const who = (p: PlayerIdx) => (p === 0 ? 'You' : `AI ${p}`)
const logT = (p: PlayerIdx): LogEntry['t'] => (p === 0 ? 'you' : 'ai')

export function clonePlayer(p: PlayerState): PlayerState {
  return {
    hand: p.hand.slice(),
    alhambra: p.alhambra.map((pl) => ({ ...pl })),
    reserved: p.reserved ? { ...p.reserved } : null,
    score: p.score,
  }
}

export function clone(s: AlhambraState): AlhambraState {
  return {
    moneyMarket: s.moneyMarket.slice(),
    moneyDeck: s.moneyDeck.slice(),
    buildingMarket: s.buildingMarket.slice(),
    buildingDeck: s.buildingDeck.slice(),
    players: [clonePlayer(s.players[0]), clonePlayer(s.players[1]), clonePlayer(s.players[2])],
    turn: s.turn,
    roundsScored: s.roundsScored,
    scoreTriggers: s.scoreTriggers.slice(),
    winner: s.winner,
    step: s.step,
    log: s.log.slice(),
  }
}

/** Total value a player holds in a given currency. */
export function currencyTotal(p: PlayerState, cur: Currency): number {
  let n = 0
  for (const c of p.hand) if (c.currency === cur) n += c.value
  return n
}

/** Count of placed buildings of a given type. */
export function buildingCount(p: PlayerState, b: Building): number {
  let n = 0
  for (const pl of p.alhambra) if (pl.tile.building === b) n++
  return n
}

// ----------------------------------------------------------------------------
// Legality
// ----------------------------------------------------------------------------

/** A take of money-market cards is legal: exactly one card, OR multiple cards
 *  whose values sum to ≤ MAX_TAKE_SUM. Indices must be valid + non-empty. */
export function canTakeMoney(s: AlhambraState, indices: number[]): boolean {
  if (s.winner != null) return false
  if (indices.length === 0) return false
  const seen = new Set<number>()
  let sum = 0
  for (const i of indices) {
    if (i < 0 || i >= s.moneyMarket.length) return false
    if (seen.has(i)) return false
    seen.add(i)
    const card = s.moneyMarket[i]
    if (card == null) return false
    sum += card.value
  }
  if (indices.length === 1) return true
  return sum <= MAX_TAKE_SUM
}

/** Can the player pay this tile's cost EXACTLY using cards of the required
 *  currency? (Exact payment grants an extra turn.) */
export function canPayExact(p: PlayerState, tile: Tile): boolean {
  return subsetSumExists(cardValues(p, tile.priceCur), tile.cost)
}

/** Can the player afford the tile at all (>= cost in the required currency)? */
export function canAfford(p: PlayerState, tile: Tile): boolean {
  return currencyTotal(p, tile.priceCur) >= tile.cost
}

function cardValues(p: PlayerState, cur: Currency): number[] {
  const out: number[] = []
  for (const c of p.hand) if (c.currency === cur) out.push(c.value)
  return out
}

/** Whether some subset of `values` sums exactly to `target`. */
function subsetSumExists(values: number[], target: number): boolean {
  if (target === 0) return true
  const reachable = new Set<number>([0])
  for (const v of values) {
    const next = new Set<number>(reachable)
    for (const r of reachable) {
      const sum = r + v
      if (sum === target) return true
      if (sum < target) next.add(sum)
    }
    reachable.clear()
    for (const r of next) reachable.add(r)
  }
  return reachable.has(target)
}

// ----------------------------------------------------------------------------
// Placement (simplified grid: place adjacent to fountain at 0,0 or existing)
// ----------------------------------------------------------------------------

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]]

function occupied(p: PlayerState, x: number, y: number): boolean {
  for (const pl of p.alhambra) if (pl.x === x && pl.y === y) return true
  return false
}

/** Legal placement: empty cell orthogonally adjacent to the fountain (0,0) or
 *  an existing building. The first building may go at (1,0) next to the fountain. */
export function isLegalPlacement(p: PlayerState, x: number, y: number): boolean {
  if (x === 0 && y === 0) return false // reserved for the fountain
  if (occupied(p, x, y)) return false
  // Adjacent to fountain?
  for (const [dx, dy] of NEIGHBORS) {
    if (x + dx === 0 && y + dy === 0) return true
  }
  // Adjacent to an existing building?
  for (const pl of p.alhambra) {
    for (const [dx, dy] of NEIGHBORS) {
      if (pl.x === x + dx && pl.y === y + dy) return true
    }
  }
  return false
}

/** Find a default legal placement for a player (first free adjacent cell). */
export function defaultPlacement(p: PlayerState): { x: number; y: number } {
  // Candidate cells: neighbors of fountain + neighbors of every placed tile.
  const cands: { x: number; y: number }[] = []
  const add = (cx: number, cy: number) => {
    for (const [dx, dy] of NEIGHBORS) cands.push({ x: cx + dx, y: cy + dy })
  }
  add(0, 0)
  for (const pl of p.alhambra) add(pl.x, pl.y)
  for (const c of cands) {
    if (isLegalPlacement(p, c.x, c.y)) return c
  }
  // Fallback (should not happen): straight line to the right.
  return { x: p.alhambra.length + 1, y: 0 }
}

// ----------------------------------------------------------------------------
// Actions (all return a NEW state; illegal actions return the input unchanged)
// ----------------------------------------------------------------------------

/** TAKE money: remove the chosen money-market cards into the player's hand,
 *  then refill the market and end the turn. */
export function takeMoney(s: AlhambraState, player: PlayerIdx, indices: number[]): AlhambraState {
  if (player !== s.turn) return s
  if (!canTakeMoney(s, indices)) return s
  const ns = clone(s)
  const taken: MoneyCard[] = []
  for (const i of indices) {
    const card = ns.moneyMarket[i]
    if (card) { taken.push(card); ns.moneyMarket[i] = null }
  }
  ns.players[player].hand = ns.players[player].hand.concat(taken)
  drawTo(ns.moneyMarket, ns.moneyDeck, MARKET_SIZE)
  const desc = taken.map((c) => `${c.value}${c.currency[0]}`).join('+')
  ns.log = push(ns.log, logT(player), `${who(player)} took money (${desc}).`)
  return advance(ns, false)
}

/** BUY a building from the market: pay `payment` (card ids of the required
 *  currency) — total must be >= cost. Overpay allowed but no change. Exact
 *  payment grants an EXTRA turn. The tile is placed at `placement`. */
export function buyBuilding(
  s: AlhambraState,
  player: PlayerIdx,
  marketIndex: number,
  payment: string[],
  placement?: { x: number; y: number },
): AlhambraState {
  if (player !== s.turn) return s
  if (s.winner != null) return s
  if (marketIndex < 0 || marketIndex >= s.buildingMarket.length) return s
  const tile = s.buildingMarket[marketIndex]
  if (tile == null) return s
  const me = s.players[player]

  // Validate payment cards: must exist in hand, be the right currency.
  const ids = new Set(payment)
  if (ids.size !== payment.length) return s
  let paid = 0
  const payCards: MoneyCard[] = []
  for (const id of payment) {
    const card = me.hand.find((c) => c.id === id)
    if (!card || card.currency !== tile.priceCur) return s
    paid += card.value
    payCards.push(card)
  }
  if (paid < tile.cost) return s

  const ns = clone(s)
  const p = ns.players[player]
  // Remove paid cards from hand.
  p.hand = p.hand.filter((c) => !ids.has(c.id))
  // Place tile.
  const pos = placement && isLegalPlacement(p, placement.x, placement.y)
    ? placement
    : defaultPlacement(p)
  p.alhambra = p.alhambra.concat([{ tile, x: pos.x, y: pos.y }])
  // Remove from market + refill.
  ns.buildingMarket[marketIndex] = null
  drawTo(ns.buildingMarket, ns.buildingDeck, MARKET_SIZE)

  const exact = paid === tile.cost
  ns.log = push(
    ns.log,
    logT(player),
    `${who(player)} bought a ${tile.building} for ${paid} ${tile.priceCur}${exact ? ' (exact — extra turn!)' : ''}.`,
  )
  return advance(ns, exact)
}

/** REDESIGN: place a previously reserved tile into the Alhambra (no purchase).
 *  Simplified: if the player has a reserved tile, place it; this ends the turn. */
export function redesign(s: AlhambraState, player: PlayerIdx, placement?: { x: number; y: number }): AlhambraState {
  if (player !== s.turn) return s
  if (s.winner != null) return s
  const me = s.players[player]
  if (me.reserved == null) return s
  const ns = clone(s)
  const p = ns.players[player]
  const tile = p.reserved!
  const pos = placement && isLegalPlacement(p, placement.x, placement.y)
    ? placement
    : defaultPlacement(p)
  p.alhambra = p.alhambra.concat([{ tile, x: pos.x, y: pos.y }])
  p.reserved = null
  ns.log = push(ns.log, logT(player), `${who(player)} redesigned — placed a reserved ${tile.building}.`)
  return advance(ns, false)
}

// ----------------------------------------------------------------------------
// Scoring
// ----------------------------------------------------------------------------

/** Longest orthogonally-contiguous run of placed tiles (simplified "wall"). */
export function longestWall(p: PlayerState): number {
  if (p.alhambra.length === 0) return 0
  const key = (x: number, y: number) => `${x},${y}`
  const set = new Set(p.alhambra.map((pl) => key(pl.x, pl.y)))
  const seen = new Set<string>()
  let best = 0
  for (const pl of p.alhambra) {
    const start = key(pl.x, pl.y)
    if (seen.has(start)) continue
    // BFS the connected component; its size is the "wall length".
    let size = 0
    const stack = [[pl.x, pl.y]]
    seen.add(start)
    while (stack.length) {
      const [cx, cy] = stack.pop()!
      size++
      for (const [dx, dy] of NEIGHBORS) {
        const nk = key(cx + dx, cy + dy)
        if (set.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push([cx + dx, cy + dy]) }
      }
    }
    if (size > best) best = size
  }
  return best
}

/** Resolve one scoring round (round index 0,1,2). Awards points for each
 *  building type's majority (and 2nd place in rounds >=1), plus a wall bonus.
 *  Mutates `ns` (adds to each player's score). Returns nothing. */
export function scoreRound(ns: AlhambraState, round: number): void {
  // Per-type majority points scale with the round.
  const firstPts = [1, 2, 3][round] ?? 3
  const secondPts = round >= 1 ? [0, 1, 2][round] ?? 2 : 0

  for (const b of BUILDINGS) {
    const counts = ns.players.map((p) => buildingCount(p, b))
    const max = Math.max(...counts)
    if (max === 0) continue
    const leaders = counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0)
    // First place: split only when uniquely shared? Standard rule: all top-tied
    // get full first-place points; we award full points to each leader.
    for (const i of leaders) ns.players[i].score += firstPts
    if (secondPts > 0 && leaders.length === 1) {
      // Second place among the rest.
      const rest = counts.map((c, i) => ({ c, i })).filter((x) => x.i !== leaders[0] && x.c > 0)
      if (rest.length) {
        const m2 = Math.max(...rest.map((x) => x.c))
        for (const x of rest) if (x.c === m2) ns.players[x.i].score += secondPts
      }
    }
  }

  // Longest-wall bonus: top wall earns a small bonus (scaled with round).
  const walls = ns.players.map((p) => longestWall(p))
  const maxWall = Math.max(...walls)
  if (maxWall > 0) {
    const wallBonus = round + 1
    for (let i = 0; i < walls.length; i++) if (walls[i] === maxWall) ns.players[i].score += wallBonus
  }

  ns.log = push(ns.log, 'sys', `Scoring round ${round + 1} resolved — You ${ns.players[0].score} · AI1 ${ns.players[1].score} · AI2 ${ns.players[2].score}.`)
}

/** Check whether the money deck has crossed the next scoring trigger; if so,
 *  resolve scoring rounds. After the third round, decide the winner. Mutates ns. */
function maybeScore(ns: AlhambraState): void {
  while (ns.roundsScored < ns.scoreTriggers.length &&
         ns.moneyDeck.length <= ns.scoreTriggers[ns.roundsScored]) {
    scoreRound(ns, ns.roundsScored)
    ns.roundsScored++
  }
  if (ns.roundsScored >= ns.scoreTriggers.length && ns.winner == null) {
    ns.winner = decideWinner(ns)
    ns.log = push(ns.log, logT(ns.winner), `${who(ns.winner)} win${ns.winner === 0 ? '' : 's'} with ${ns.players[ns.winner].score} points!`)
  }
}

/** Highest score wins; tie -> most total buildings; still tied -> lowest index. */
export function decideWinner(s: AlhambraState): PlayerIdx {
  let best: PlayerIdx = 0
  for (let i = 1 as PlayerIdx; i < NUM_PLAYERS; i = (i + 1) as PlayerIdx) {
    const a = s.players[best], b = s.players[i]
    if (b.score > a.score) best = i
    else if (b.score === a.score && b.alhambra.length > a.alhambra.length) best = i
  }
  return best
}

// ----------------------------------------------------------------------------
// Turn flow
// ----------------------------------------------------------------------------

/** Advance after an action. `extraTurn` keeps the same player (exact payment).
 *  Always resolves scoring triggers + bumps step. */
function advance(s: AlhambraState, extraTurn: boolean): AlhambraState {
  maybeScore(s)
  if (s.winner != null) return { ...s, step: s.step + 1 }
  const next: PlayerIdx = extraTurn ? s.turn : (((s.turn + 1) % NUM_PLAYERS) as PlayerIdx)
  return { ...s, turn: next, step: s.step + 1 }
}

// ----------------------------------------------------------------------------
// AI — greedy
// ----------------------------------------------------------------------------

/** Score a tile for the AI: prefer types it already leads or can take the lead
 *  in, and prefer exact-payment opportunities (extra turn). */
function tileScore(s: AlhambraState, player: PlayerIdx, tile: Tile): number {
  const me = s.players[player]
  let score = 2
  // Value of advancing this building type toward / past a majority.
  const mine = buildingCount(me, tile.building)
  let othersMax = 0
  for (let i = 0; i < NUM_PLAYERS; i++) {
    if (i === player) continue
    othersMax = Math.max(othersMax, buildingCount(s.players[i], tile.building))
  }
  if (mine >= othersMax) score += 3 // extend/secure a lead
  else if (mine + 1 >= othersMax) score += 4 // take the lead
  else score += 1
  // Exact payment is great (extra turn).
  if (canPayExact(me, tile)) score += 5
  // Prefer cheaper tiles slightly (keeps money for more buys).
  score -= tile.cost * 0.1
  return score
}

/** Choose exact-or-minimal payment card ids for a tile (prefer exact). */
export function choosePayment(p: PlayerState, tile: Tile): string[] | null {
  const cur = tile.priceCur
  const cards = p.hand.filter((c) => c.currency === cur)
  // Try exact subset first (greedy DP reconstruction over distinct card ids).
  const exact = findSubset(cards, tile.cost)
  if (exact) return exact.map((c) => c.id)
  // Otherwise minimal overpay: sort ascending, accumulate until >= cost.
  const total = cards.reduce((a, c) => a + c.value, 0)
  if (total < tile.cost) return null
  const sorted = cards.slice().sort((a, b) => a.value - b.value)
  const picked: MoneyCard[] = []
  let sum = 0
  for (const c of sorted) {
    if (sum >= tile.cost) break
    picked.push(c); sum += c.value
  }
  return picked.map((c) => c.id)
}

/** Find a subset of cards summing exactly to target (or null). */
function findSubset(cards: MoneyCard[], target: number): MoneyCard[] | null {
  if (target === 0) return []
  // reachable sum -> list of cards forming it (first found).
  const map = new Map<number, MoneyCard[]>()
  map.set(0, [])
  for (const c of cards) {
    const entries = Array.from(map.entries())
    for (const [sum, list] of entries) {
      const ns = sum + c.value
      if (ns > target || map.has(ns)) continue
      const nl = list.concat([c])
      if (ns === target) return nl
      map.set(ns, nl)
    }
  }
  return map.get(target) ?? null
}

/** One AI turn: buy the best affordable tile (favoring exact payment for the
 *  extra turn); otherwise take money toward the cheapest affordable target;
 *  otherwise take any money. Always makes progress. Returns a NEW state. */
export function aiTurn(s: AlhambraState): AlhambraState {
  if (s.winner != null) return s
  const player = s.turn
  if (player === 0) return s // never auto-play the human
  const me = s.players[player]

  // 1) Buy the best affordable tile.
  const affordable: { idx: number; tile: Tile }[] = []
  s.buildingMarket.forEach((tile, idx) => {
    if (tile && canAfford(me, tile)) affordable.push({ idx, tile })
  })
  if (affordable.length) {
    affordable.sort((a, b) => tileScore(s, player, b.tile) - tileScore(s, player, a.tile))
    const best = affordable[0]
    const payment = choosePayment(me, best.tile)
    if (payment) {
      return buyBuilding(s, player, best.idx, payment, defaultPlacement(me))
    }
  }

  // 2) Take money toward a target tile (the cheapest tile we can't yet afford).
  const wanted: Tile[] = []
  for (const tile of s.buildingMarket) if (tile && !canAfford(me, tile)) wanted.push(tile)
  wanted.sort((a, b) => tileScore(s, player, b) - tileScore(s, player, a))
  const target = wanted[0]

  if (target) {
    // Take money-market cards of the needed currency, summing as high as legal.
    const want = chooseMoneyTake(s, target.priceCur)
    if (want.length) return takeMoney(s, player, want)
  }

  // 3) Fallback: take any single money card (most valuable), else best multi.
  const any = chooseMoneyTake(s, null)
  if (any.length) return takeMoney(s, player, any)

  // 4) Truly nothing to take (money market empty): place a reserved tile or pass.
  if (me.reserved != null) return redesign(s, player)
  return advance(s, false)
}

/** Pick money-market indices to take. If `cur` given, prefer that currency;
 *  return either a single card or a multi-take summing ≤ MAX_TAKE_SUM. */
function chooseMoneyTake(s: AlhambraState, cur: Currency | null): number[] {
  const slots: { i: number; card: MoneyCard }[] = []
  s.moneyMarket.forEach((card, i) => { if (card) slots.push({ i, card }) })
  if (slots.length === 0) return []

  // Preferred-currency slots, sorted by value descending.
  const pref = (cur ? slots.filter((x) => x.card.currency === cur) : slots)
    .slice().sort((a, b) => b.card.value - a.card.value)

  // Try to grab multiple small preferred cards summing as close to 5 as possible.
  const small = pref.slice().sort((a, b) => a.card.value - b.card.value)
  const multi: number[] = []
  let sum = 0
  for (const x of small) {
    if (sum + x.card.value <= MAX_TAKE_SUM) { multi.push(x.i); sum += x.card.value }
  }
  if (multi.length >= 2) return multi

  // Otherwise take the single most-valuable preferred card (or any).
  if (pref.length) return [pref[0].i]
  const best = slots.slice().sort((a, b) => b.card.value - a.card.value)[0]
  return [best.i]
}

/** True when it's an AI's turn and the game isn't over. */
export function isAITurn(s: AlhambraState): boolean {
  return s.winner == null && s.turn !== 0
}
