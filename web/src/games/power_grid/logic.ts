/* POWER GRID — simplified economic network-building engine (DOM-free, pure logic).

   You (player 0) vs one greedy AI (player 1). Each player owns ELEKTRO (money), up to
   3 POWER PLANTS, a small stock of RESOURCES (coal/oil/garbage/uranium), and a NETWORK
   of CITIES connected on a shared map.

   A ROUND has five phases:
     ORDER    — recompute player order by number of cities (most cities acts in a
                position that varies per phase; we model the auction "weakest-first"
                ordering and the build "most-cities-last" ordering implicitly).
     AUCTION  — a face-up MARKET of power plant cards. In turn order each player may
                BUY one market plant at its listed cost (streamlined "buy at cost" auction;
                the player with the FEWER cities chooses first so the leader can react).
                Each plant: cost, the RESOURCE it burns, the AMOUNT it burns, the number
                of CITIES it can POWER. A wind plant burns nothing (free fuel).
     RESOURCES— a resource MARKET. Coal/oil/garbage/uranium are bought; the unit price
                RISES as that resource's remaining supply dwindles (cheaper when plentiful).
     BUILD    — connect new cities: pay (connection cost to reach the city) + (slot cost
                that grows in later STEPS) per city added to your network.
     BUREAU   — for each plant you choose to run, spend its fuel to power up to its capacity
                in cities; earn ELEKTRO from the PAYOUT table by total cities powered.
                Then refill the plant market and the resource supply.

   The game ends when a player's network reaches the CITY TARGET (default 7). The winner is
   whoever can POWER the most cities (tie -> most money).

   Randomness (plant deck shuffle) is injectable for deterministic tests.                  */

export type ResourceId = 'coal' | 'oil' | 'garbage' | 'uranium'
/** A plant's fuel: a real resource or 'wind' (free / eco — burns nothing). */
export type FuelId = ResourceId | 'wind'

export type Phase = 'auction' | 'resources' | 'build' | 'bureau' | 'over'

export interface Plant {
  id: number
  /** Purchase cost in Elektro (also its market rank). */
  cost: number
  /** Fuel it burns; 'wind' is free. */
  fuel: FuelId
  /** Units of fuel burned to run the plant once. */
  burn: number
  /** Cities it can power when run. */
  capacity: number
}

export interface City {
  id: string
  name: string
  x: number
  y: number
}

export interface Player {
  id: number
  name: string
  money: number
  plants: Plant[]
  res: Record<ResourceId, number>
  /** City ids this player has connected (their network). */
  network: string[]
  /** Cities powered in the most recent bureau phase (for display / scoring). */
  powered: number
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface State {
  players: Player[]
  cities: City[]
  /** Connection cost between two cities (undirected) keyed "a|b" (a<b). */
  links: Record<string, number>
  /** Face-up plant market (sorted ascending by cost). */
  market: Plant[]
  /** Remaining plant deck to refill the market from. */
  deck: Plant[]
  /** Remaining supply of each purchasable resource. */
  supply: Record<ResourceId, number>
  round: number
  phase: Phase
  /** Whose action it is. */
  turn: number
  /** Turn order for the current phase (list of player ids). */
  order: number[]
  /** Index into `order` for the current actor. */
  orderIdx: number
  /** Players who have already passed/finished the current phase. */
  done: boolean[]
  /** Current STEP (1 or 2): raises city slot costs as the game progresses. */
  step: number
  winner: number | null
  log: LogEntry[]
}

// ---------- catalogue ----------

export const RESOURCES: ResourceId[] = ['coal', 'oil', 'garbage', 'uranium']
export const FUELS: FuelId[] = ['coal', 'oil', 'garbage', 'uranium', 'wind']

/** City target that ends the game. */
export const CITY_TARGET = 7
/** Slots a city can hold (we only ever build the cheapest empty slot). */
export const MARKET_SIZE = 4

/** Per-city SLOT cost by build step (the connection cost is added on top). */
export const SLOT_COST: Record<number, number> = { 1: 10, 2: 15 }

/** Payout table: Elektro earned for powering N cities (index = cities powered). */
export const PAYOUT: number[] = [
  10, 22, 33, 44, 54, 64, 73, 82, 90, 98, 105, 112, 118, 124, 129, 134,
]

export function payout(citiesPowered: number): number {
  if (citiesPowered <= 0) return PAYOUT[0]
  const i = Math.min(citiesPowered, PAYOUT.length - 1)
  return PAYOUT[i]
}

/** Resource supply caps (starting stock). */
export const SUPPLY_CAP: Record<ResourceId, number> = {
  coal: 24, oil: 24, garbage: 18, uranium: 12,
}

/** Unit price of the NEXT unit of `r` given how many remain in `supply`.
    Price RISES as remaining supply drops (scarcity). */
export function resourcePrice(r: ResourceId, remaining: number): number {
  const cap = SUPPLY_CAP[r]
  const used = cap - remaining
  // Cheapest when full; each band of a few units bumps the price up.
  if (r === 'uranium') {
    // Uranium is dear and steep: ~ base 5 + 1 per unit used (each unit individually priced).
    return 5 + used
  }
  // coal/oil/garbage: bands of ~6 units; price 1..8.
  const frac = used / cap
  return 1 + Math.floor(frac * 7) // 1 (plentiful) .. 8 (nearly gone)
}

/** Total cost to buy `qty` units of `r` from the current supply (prices rise as it drains). */
export function resourceBuyCost(r: ResourceId, remaining: number, qty: number): number {
  let total = 0
  let rem = remaining
  for (let i = 0; i < qty; i++) {
    if (rem <= 0) break
    total += resourcePrice(r, rem)
    rem -= 1
  }
  return total
}

// ---------- map ----------

const CITY_DEFS: { id: string; name: string; x: number; y: number }[] = [
  { id: 'AME', name: 'Ames', x: 12, y: 22 },
  { id: 'BRN', name: 'Brno', x: 38, y: 14 },
  { id: 'CDR', name: 'Cedar', x: 66, y: 20 },
  { id: 'DEL', name: 'Delta', x: 88, y: 30 },
  { id: 'ELM', name: 'Elm', x: 20, y: 50 },
  { id: 'FOX', name: 'Fox', x: 50, y: 44 },
  { id: 'GRV', name: 'Grove', x: 78, y: 52 },
  { id: 'HBR', name: 'Harbor', x: 30, y: 78 },
  { id: 'IRN', name: 'Iron', x: 58, y: 74 },
  { id: 'JNO', name: 'Juno', x: 84, y: 80 },
]

const LINK_DEFS: [string, string, number][] = [
  ['AME', 'BRN', 8], ['AME', 'ELM', 6], ['BRN', 'CDR', 7], ['BRN', 'FOX', 9],
  ['CDR', 'DEL', 6], ['CDR', 'GRV', 8], ['DEL', 'GRV', 7], ['ELM', 'FOX', 10],
  ['ELM', 'HBR', 9], ['FOX', 'GRV', 11], ['FOX', 'IRN', 8], ['GRV', 'JNO', 9],
  ['HBR', 'IRN', 7], ['IRN', 'JNO', 6], ['IRN', 'GRV', 12],
]

function linkKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

// ---------- plant deck ----------

const PLANT_DECK_DEF: Omit<Plant, 'id'>[] = [
  { cost: 3, fuel: 'oil', burn: 2, capacity: 1 },
  { cost: 4, fuel: 'coal', burn: 2, capacity: 1 },
  { cost: 5, fuel: 'garbage', burn: 1, capacity: 1 },
  { cost: 6, fuel: 'wind', burn: 0, capacity: 1 },
  { cost: 7, fuel: 'oil', burn: 3, capacity: 2 },
  { cost: 8, fuel: 'coal', burn: 3, capacity: 2 },
  { cost: 9, fuel: 'oil', burn: 1, capacity: 2 },
  { cost: 10, fuel: 'coal', burn: 2, capacity: 2 },
  { cost: 11, fuel: 'uranium', burn: 1, capacity: 2 },
  { cost: 12, fuel: 'garbage', burn: 2, capacity: 2 },
  { cost: 13, fuel: 'wind', burn: 0, capacity: 2 },
  { cost: 14, fuel: 'coal', burn: 3, capacity: 3 },
  { cost: 15, fuel: 'oil', burn: 3, capacity: 3 },
  { cost: 16, fuel: 'garbage', burn: 3, capacity: 3 },
  { cost: 17, fuel: 'uranium', burn: 1, capacity: 3 },
  { cost: 18, fuel: 'wind', burn: 0, capacity: 3 },
  { cost: 19, fuel: 'coal', burn: 3, capacity: 4 },
  { cost: 20, fuel: 'oil', burn: 3, capacity: 4 },
  { cost: 21, fuel: 'uranium', burn: 2, capacity: 4 },
  { cost: 22, fuel: 'garbage', burn: 2, capacity: 4 },
  { cost: 24, fuel: 'wind', burn: 0, capacity: 4 },
  { cost: 26, fuel: 'coal', burn: 3, capacity: 5 },
  { cost: 28, fuel: 'oil', burn: 2, capacity: 5 },
  { cost: 30, fuel: 'wind', burn: 0, capacity: 5 },
]

// Simple deterministic shuffle (seeded) so makeGame(seed) is reproducible in tests.
function shuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice()
  let st = (seed >>> 0) || 1
  const rnd = () => {
    st = (st * 1664525 + 1013904223) >>> 0
    return st / 0xffffffff
  }
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------- clone ----------

function clonePlayer(p: Player): Player {
  return {
    ...p,
    plants: p.plants.map(pl => ({ ...pl })),
    res: { ...p.res },
    network: p.network.slice(),
  }
}

function clone(s: State): State {
  return {
    players: s.players.map(clonePlayer),
    cities: s.cities,            // immutable map definition — share
    links: s.links,              // immutable
    market: s.market.map(p => ({ ...p })),
    deck: s.deck.map(p => ({ ...p })),
    supply: { ...s.supply },
    round: s.round,
    phase: s.phase,
    turn: s.turn,
    order: s.order.slice(),
    orderIdx: s.orderIdx,
    done: s.done.slice(),
    step: s.step,
    winner: s.winner,
    log: s.log.slice(),
  }
}

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-40)
}

function newPlayer(id: number, name: string): Player {
  return {
    id, name,
    money: 50,
    plants: [],
    res: { coal: 0, oil: 0, garbage: 0, uranium: 0 },
    network: [],
    powered: 0,
  }
}

// ---------- setup ----------

export function makeGame(seed?: number): State {
  const cities: City[] = CITY_DEFS.map(c => ({ ...c }))
  const links: Record<string, number> = {}
  for (const [a, b, c] of LINK_DEFS) links[linkKey(a, b)] = c

  const withIds: Plant[] = PLANT_DECK_DEF.map((p, i) => ({ id: i + 1, ...p }))
  const ordered = seed == null ? withIds : shuffle(withIds, seed)
  // Market = the cheapest 4 available plants, always shown sorted ascending.
  const sorted = ordered.slice().sort((a, b) => a.cost - b.cost)
  const market = sorted.slice(0, MARKET_SIZE)
  const marketIds = new Set(market.map(p => p.id))
  const deck = ordered.filter(p => !marketIds.has(p.id))

  return {
    players: [newPlayer(0, 'You'), newPlayer(1, 'Volt AI')],
    cities,
    links,
    market,
    deck,
    supply: { ...SUPPLY_CAP },
    round: 1,
    phase: 'auction',
    turn: 0,
    order: computeOrder([newPlayer(0, 'You'), newPlayer(1, 'Volt AI')], 'auction'),
    orderIdx: 0,
    done: [false, false],
    step: 1,
    winner: null,
    log: [{ t: 'sys', x: 'Buy plants, stock fuel, connect cities, and power your grid to riches.' }],
  }
}

// ---------- player order ----------

/** Order by city count. For the AUCTION the FEWER-cities player chooses first (so the
    leader reacts). For other phases MOST cities acts first. Player 0 wins ties on order. */
export function computeOrder(players: Player[], phase: Phase): number[] {
  const ids = players.map(p => p.id)
  if (phase === 'auction') {
    return ids.slice().sort((a, b) => {
      const d = players[a].network.length - players[b].network.length
      if (d !== 0) return d            // fewer cities first
      return a - b
    })
  }
  return ids.slice().sort((a, b) => {
    const d = players[b].network.length - players[a].network.length
    if (d !== 0) return d              // more cities first
    return a - b
  })
}

// ---------- network helpers ----------

/** Connection cost to add `cityId` to `player`'s network: cheapest link to an already
    owned city, or 0 if it is the player's FIRST city (free initial connection). Returns
    null if the city is already owned or unreachable from the network. */
export function connectionCost(s: State, player: number, cityId: string): number | null {
  const p = s.players[player]
  if (p.network.includes(cityId)) return null
  if (p.network.length === 0) return 0           // first city: place anywhere, no link cost
  let best: number | null = null
  for (const owned of p.network) {
    const k = linkKey(owned, cityId)
    const c = s.links[k]
    if (c != null && (best == null || c < best)) best = c
  }
  return best   // null if not adjacent to the network
}

/** Total Elektro to build `cityId` right now (connection + slot), or null if illegal. */
export function buildCost(s: State, player: number, cityId: string): number | null {
  const conn = connectionCost(s, player, cityId)
  if (conn == null) return null
  return conn + SLOT_COST[s.step]
}

export function canBuildCity(s: State, player: number, cityId: string): boolean {
  if (s.phase !== 'build' || s.winner != null || s.turn !== player) return false
  const cost = buildCost(s, player, cityId)
  if (cost == null) return false
  return s.players[player].money >= cost
}

// ---------- AUCTION (streamlined buy-at-cost) ----------

/** Can `player` buy market plant at `marketIndex` for the given (or listed) bid? */
export function canBuyPlant(s: State, player: number, marketIndex: number, bid?: number): boolean {
  if (s.phase !== 'auction' || s.winner != null || s.turn !== player) return false
  const plant = s.market[marketIndex]
  if (!plant) return false
  const price = bid ?? plant.cost
  if (price < plant.cost) return false           // cannot bid below the listed cost
  if (s.players[player].money < price) return false
  if (s.players[player].plants.length >= 3) return false  // already hold the max of 3
  return true
}

/** Buy a market plant. Pays `bid` (defaults to listed cost), adds the plant to the player
    (keeping at most 3 — if already 3 this is rejected), removes it from the market and
    refills from the deck. Then marks the player done for the auction and advances. */
export function buyPlant(s: State, player: number, marketIndex: number, bid?: number): State {
  if (!canBuyPlant(s, player, marketIndex, bid)) return s
  const out = clone(s)
  const plant = out.market[marketIndex]
  const price = bid ?? plant.cost
  const p = out.players[player]
  p.money -= price
  p.plants.push({ ...plant })
  p.plants.sort((a, b) => a.cost - b.cost)
  // Remove from market + refill from deck (next cheapest), keep market sorted.
  out.market.splice(marketIndex, 1)
  refillMarket(out)
  out.log = push(out.log, player === 0 ? 'you' : 'ai',
    `${p.name} bought a ${fuelLabel(plant.fuel)} plant (cap ${plant.capacity}) for ${price}.`)
  // A player buys at most one plant per auction.
  out.done[player] = true
  advanceAuction(out)
  return out
}

/** Pass on buying a plant this auction. */
export function passAuction(s: State, player: number): State {
  if (s.phase !== 'auction' || s.winner != null || s.turn !== player) return s
  const out = clone(s)
  out.done[player] = true
  out.log = push(out.log, player === 0 ? 'you' : 'ai', `${out.players[player].name} passed on the auction.`)
  advanceAuction(out)
  return out
}

function advanceAuction(s: State): void {
  // Advance to the next not-done player in order; when all done, go to resources phase.
  for (let step = 1; step <= s.order.length; step++) {
    const idx = (s.orderIdx + step) % s.order.length
    const pl = s.order[idx]
    if (!s.done[pl]) { s.orderIdx = idx; s.turn = pl; return }
  }
  startResourcesPhase(s)
}

// ---------- RESOURCES ----------

export function canBuyResource(s: State, player: number, type: ResourceId, qty: number): boolean {
  if (s.phase !== 'resources' || s.winner != null || s.turn !== player) return false
  if (qty <= 0) return false
  if (s.supply[type] < qty) return false
  const cost = resourceBuyCost(type, s.supply[type], qty)
  if (s.players[player].money < cost) return false
  // Cannot store more fuel than the player's plants could ever burn (capacity*2 buffer).
  const cap = fuelCapacityFor(s.players[player], type)
  if (s.players[player].res[type] + qty > cap) return false
  return true
}

/** How much of `type` a player could usefully hold: 2x the burn of plants that use it. */
export function fuelCapacityFor(p: Player, type: ResourceId): number {
  let cap = 0
  for (const pl of p.plants) if (pl.fuel === type) cap += pl.burn * 2
  return cap
}

export function buyResource(s: State, player: number, type: ResourceId, qty: number): State {
  if (!canBuyResource(s, player, type, qty)) return s
  const out = clone(s)
  const cost = resourceBuyCost(type, out.supply[type], qty)
  const p = out.players[player]
  p.money -= cost
  p.res[type] += qty
  out.supply[type] -= qty
  out.log = push(out.log, player === 0 ? 'you' : 'ai',
    `${p.name} bought ${qty} ${type} for ${cost}.`)
  return out
}

/** Finish buying resources for `player`; advance the order, then to build phase. */
export function endResources(s: State, player: number): State {
  if (s.phase !== 'resources' || s.winner != null || s.turn !== player) return s
  const out = clone(s)
  out.done[player] = true
  advanceResources(out)
  return out
}

function startResourcesPhase(s: State): void {
  s.phase = 'resources'
  s.order = computeOrder(s.players, 'resources')
  s.orderIdx = 0
  s.turn = s.order[0]
  s.done = s.players.map(() => false)
}

function advanceResources(s: State): void {
  for (let step = 1; step <= s.order.length; step++) {
    const idx = (s.orderIdx + step) % s.order.length
    const pl = s.order[idx]
    if (!s.done[pl]) { s.orderIdx = idx; s.turn = pl; return }
  }
  startBuildPhase(s)
}

// ---------- BUILD ----------

export function buildCity(s: State, player: number, cityId: string): State {
  if (!canBuildCity(s, player, cityId)) return s
  const out = clone(s)
  const cost = buildCost(out, player, cityId)!
  const p = out.players[player]
  p.money -= cost
  p.network.push(cityId)
  out.log = push(out.log, player === 0 ? 'you' : 'ai',
    `${p.name} connected ${cityName(out, cityId)} for ${cost}.`)
  // Step up to 2 once anyone reaches 4 cities (raises slot costs).
  if (out.step === 1 && out.players.some(pl => pl.network.length >= 4)) {
    out.step = 2
    out.log = push(out.log, 'sys', 'Step 2 begins — city slots now cost more.')
  }
  // End trigger: reaching the city target ends the game after this round's bureau.
  return out
}

export function endBuild(s: State, player: number): State {
  if (s.phase !== 'build' || s.winner != null || s.turn !== player) return s
  const out = clone(s)
  out.done[player] = true
  advanceBuild(out)
  return out
}

function startBuildPhase(s: State): void {
  s.phase = 'build'
  s.order = computeOrder(s.players, 'build')
  s.orderIdx = 0
  s.turn = s.order[0]
  s.done = s.players.map(() => false)
}

function advanceBuild(s: State): void {
  for (let step = 1; step <= s.order.length; step++) {
    const idx = (s.orderIdx + step) % s.order.length
    const pl = s.order[idx]
    if (!s.done[pl]) { s.orderIdx = idx; s.turn = pl; return }
  }
  startBureauPhase(s)
}

// ---------- BUREAU ----------

/** Cities a player CAN power given chosen plants and current fuel (capped at network size). */
export function poweredFrom(p: Player, plantIds: number[]): number {
  let cap = 0
  const fuelLeft: Record<ResourceId, number> = { ...p.res }
  for (const id of plantIds) {
    const pl = p.plants.find(x => x.id === id)
    if (!pl) continue
    if (pl.fuel === 'wind') { cap += pl.capacity; continue }
    if (fuelLeft[pl.fuel] >= pl.burn) {
      fuelLeft[pl.fuel] -= pl.burn
      cap += pl.capacity
    }
  }
  return Math.min(cap, p.network.length)
}

/** Run the chosen plants for `player`: burn their fuel, count cities powered (capped at
    network size), earn the payout, advance order; after the last player refill + new round
    (or end the game if the city target was reached). */
export function powerCities(s: State, player: number, plantChoices: number[]): State {
  if (s.phase !== 'bureau' || s.winner != null || s.turn !== player) return s
  const out = clone(s)
  const p = out.players[player]

  // Burn fuel for the chosen plants that can actually run; accumulate capacity.
  let capacity = 0
  for (const id of plantChoices) {
    const pl = p.plants.find(x => x.id === id)
    if (!pl) continue
    if (pl.fuel === 'wind') { capacity += pl.capacity; continue }
    if (p.res[pl.fuel] >= pl.burn) {
      p.res[pl.fuel] -= pl.burn
      capacity += pl.capacity
    }
  }
  const powered = Math.min(capacity, p.network.length)
  p.powered = powered
  const earn = payout(powered)
  p.money += earn
  out.log = push(out.log, player === 0 ? 'you' : 'ai',
    `${p.name} powered ${powered} ${powered === 1 ? 'city' : 'cities'} → +${earn} Elektro.`)

  out.done[player] = true
  advanceBureau(out)
  return out
}

function startBureauPhase(s: State): void {
  s.phase = 'bureau'
  s.order = computeOrder(s.players, 'bureau')
  s.orderIdx = 0
  s.turn = s.order[0]
  s.done = s.players.map(() => false)
}

function advanceBureau(s: State): void {
  for (let step = 1; step <= s.order.length; step++) {
    const idx = (s.orderIdx + step) % s.order.length
    const pl = s.order[idx]
    if (!s.done[pl]) { s.orderIdx = idx; s.turn = pl; return }
  }
  endRound(s)
}

// ---------- ROUND / REFILL ----------

function refillMarket(s: State): void {
  // Keep the cheapest plants face up: pull from deck until market is full, then sort.
  while (s.market.length < MARKET_SIZE && s.deck.length > 0) {
    // pull the cheapest remaining deck plant into the market
    let cheapest = 0
    for (let i = 1; i < s.deck.length; i++) if (s.deck[i].cost < s.deck[cheapest].cost) cheapest = i
    s.market.push(s.deck.splice(cheapest, 1)[0])
  }
  s.market.sort((a, b) => a.cost - b.cost)
}

/** End-of-round bookkeeping: refill plant market + resource supply, check end trigger,
    or start the next round at the auction phase. */
export function endRound(s: State): void {
  // Refill resource supply a bit (regeneration), capped at SUPPLY_CAP.
  const regen: Record<ResourceId, number> = { coal: 5, oil: 4, garbage: 3, uranium: 2 }
  for (const r of RESOURCES) {
    s.supply[r] = Math.min(SUPPLY_CAP[r], s.supply[r] + regen[r])
  }
  refillMarket(s)

  // End trigger: a player reached the city target.
  const triggered = s.players.find(p => p.network.length >= CITY_TARGET)
  if (triggered) {
    finishGame(s)
    return
  }

  s.round += 1
  s.phase = 'auction'
  s.order = computeOrder(s.players, 'auction')
  s.orderIdx = 0
  s.turn = s.order[0]
  s.done = s.players.map(() => false)
}

function finishGame(s: State): void {
  s.phase = 'over'
  // Winner = most cities POWERED (each player powers maximally with current plants+fuel),
  // tie -> most money. Use a best-effort power count (run all plants).
  const scores = s.players.map(p => bestPowered(p))
  const a = scores[0], b = scores[1]
  let w: number
  if (a !== b) w = a > b ? 0 : 1
  else w = s.players[0].money >= s.players[1].money ? 0 : 1
  s.winner = w
  // Record final powered counts for display.
  for (let i = 0; i < s.players.length; i++) s.players[i].powered = scores[i]
  const wp = s.players[w]
  s.log = push(s.log, 'sys',
    `Final — You powered ${a}, ${s.players[1].name} ${b}. ${wp.name} win${w === 0 ? '' : 's'}!`)
}

/** Best cities a player could power running ALL their plants with current fuel. */
export function bestPowered(p: Player): number {
  const ids = p.plants.map(pl => pl.id)
  return poweredFrom(p, ids)
}

// ---------- scoring ----------

export function scorePlayer(p: Player): number {
  // Network-building game: score is cities powered (then money as tiebreak weight).
  return bestPowered(p) * 1000 + p.money
}

export const winner = (s: State): number | null => s.winner

// ---------- labels ----------

export function fuelLabel(f: FuelId): string {
  return f
}

export function cityName(s: State, id: string): string {
  return s.cities.find(c => c.id === id)?.name ?? id
}

// ---------- AI (greedy) ----------

/** AI picks the best market plant to buy: highest capacity-per-cost it can afford while
    keeping money in reserve, only if it has room (<3 plants) or the plant strictly
    upgrades its weakest plant. Returns the market index or null to pass. */
function aiPickPlant(s: State, player: number): number | null {
  const p = s.players[player]
  const reserve = 12 + p.network.length * 4    // keep cash for fuel + building
  let bestIdx: number | null = null
  let bestVal = 0
  for (let i = 0; i < s.market.length; i++) {
    const plant = s.market[i]
    if (p.money - plant.cost < reserve) continue
    if (p.plants.length >= 3) {
      // Only replace if this plant beats our weakest plant's capacity.
      const weakest = p.plants.reduce((m, x) => (x.capacity < m.capacity ? x : m), p.plants[0])
      if (plant.capacity <= weakest.capacity) continue
    }
    // Efficiency: capacity per cost, with a bonus for free (wind) fuel.
    const eff = plant.capacity / plant.cost + (plant.fuel === 'wind' ? 0.15 : 0)
    if (eff > bestVal) { bestVal = eff; bestIdx = i }
  }
  // Buy aggressively early (need at least one plant); later only if it clearly helps.
  if (p.plants.length === 0) {
    // Must get a plant — pick cheapest affordable with best capacity.
    let idx: number | null = null, best = -1
    for (let i = 0; i < s.market.length; i++) {
      const plant = s.market[i]
      if (p.money < plant.cost) continue
      const v = plant.capacity * 10 - plant.cost
      if (v > best) { best = v; idx = i }
    }
    return idx
  }
  return bestIdx
}

/** AI buys fuel for the plants it owns, up to what it can run, within budget. Returns a
    list of {type, qty} purchases (one per call we do the single most-needed buy). */
function aiPickFuel(s: State, player: number): { type: ResourceId; qty: number } | null {
  const p = s.players[player]
  const reserve = 8 + p.network.length * 3
  // For each resource a plant uses, top up to one full run's burn (2 runs of buffer).
  let bestType: ResourceId | null = null
  let bestNeed = 0
  for (const r of RESOURCES) {
    let want = 0
    for (const pl of p.plants) if (pl.fuel === r) want += pl.burn
    const need = want - p.res[r]
    if (need > bestNeed && s.supply[r] > 0) {
      // affordable?
      const cost = resourceBuyCost(r, s.supply[r], Math.min(need, s.supply[r]))
      if (p.money - cost >= reserve) { bestNeed = need; bestType = r }
    }
  }
  if (bestType == null) return null
  const qty = Math.min(bestNeed, s.supply[bestType], fuelCapacityFor(p, bestType) - p.res[bestType])
  if (qty <= 0) return null
  return { type: bestType, qty }
}

/** AI picks the cheapest buildable city to expand its network. */
function aiPickCity(s: State, player: number): string | null {
  const p = s.players[player]
  const reserve = 6
  let bestId: string | null = null
  let bestCost = Infinity
  for (const c of s.cities) {
    if (!canBuildCity(s, player, c.id)) continue
    const cost = buildCost(s, player, c.id)!
    if (p.money - cost < reserve && p.network.length > 0) continue
    if (cost < bestCost) { bestCost = cost; bestId = c.id }
  }
  return bestId
}

/** Run the AI's action for the CURRENT phase as a SINGLE sub-step (so the UI tick advances
    each call and never stalls). Player 0 sub-steps are never driven here (guarded). */
export function aiTurn(s: State): State {
  if (s.winner != null) return s
  if (s.turn !== 1) return s
  const player = 1

  if (s.phase === 'auction') {
    const idx = aiPickPlant(s, player)
    if (idx != null && canBuyPlant(s, player, idx)) return buyPlant(s, player, idx)
    return passAuction(s, player)
  }

  if (s.phase === 'resources') {
    const buy = aiPickFuel(s, player)
    if (buy && canBuyResource(s, player, buy.type, buy.qty)) return buyResource(s, player, buy.type, buy.qty)
    return endResources(s, player)
  }

  if (s.phase === 'build') {
    const city = aiPickCity(s, player)
    if (city && canBuildCity(s, player, city)) return buildCity(s, player, city)
    return endBuild(s, player)
  }

  if (s.phase === 'bureau') {
    // Power maximally: run every plant.
    const ids = s.players[player].plants.map(pl => pl.id)
    return powerCities(s, player, ids)
  }

  return s
}
