/* STONE AGE — simplified worker-placement engine (DOM-free, pure logic).

   You (player 0) vs one greedy AI (player 1). Each player has a tribe of WORKERS
   (start 5), a stock of FOOD, four RESOURCES (wood, clay, stone, gold), a FARM track
   (passive food income), TOOLS (added to dice rolls), and claimed BUILDINGS (points).

   A ROUND has three phases:
     PLACE   — players alternate placing ALL of their workers onto action spaces,
               respecting slot limits.
     RESOLVE — players' placed workers are resolved in order: gather spaces roll dice
               (yield = floor((diceSum + tools) / divisor)), the hut grows the tribe,
               the toolmaker grants a tool, the field advances the farm, and building
               spaces claim a building (pay resources -> gain points).
     FEED    — each worker must be fed 1 food. The farm covers part; the remainder comes
               from the food stock; any shortfall costs 1 victory point per missing food.

   The game ends when the BUILDING MARKET depletes. Final scoring = points already banked
   (buildings + feeding penalties) + a leftover-resource bonus. Most points wins.

   Randomness (dice) is injectable for deterministic tests.                              */

export type ResourceId = 'wood' | 'clay' | 'stone' | 'gold'

export type SpaceId =
  | 'hunting'
  | 'forest'
  | 'claypit'
  | 'quarry'
  | 'river'
  | 'field'
  | 'hut'
  | 'toolmaker'
  | 'b0' | 'b1' | 'b2' | 'b3'

export type Phase = 'place' | 'resolve' | 'feed' | 'over'

export interface ResourceSpaceDef {
  id: SpaceId
  name: string
  resource: ResourceId
  divisor: number
  slots: number
}

export interface Building {
  id: string
  name: string
  /** Resource cost: resourceId -> count. */
  cost: Partial<Record<ResourceId, number>>
  /** Victory points awarded when claimed. */
  points: number
  short: string
}

export interface Player {
  id: number
  name: string
  workers: number          // total tribe size
  food: number
  farm: number             // passive food income per round
  res: Record<ResourceId, number>
  tools: number            // added to dice sums when gathering
  points: number           // banked victory points (buildings + civ + penalties)
  buildings: string[]      // claimed building ids (for end bonus / display)
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface State {
  players: Player[]
  /** spaceId -> array of player ids occupying it (one entry per worker placed). */
  occ: Record<SpaceId, number[]>
  /** The face-up building market (one building per stack slot, null when claimed/empty). */
  market: (Building | null)[]
  /** Remaining buildings to refill the market from. */
  deck: Building[]
  round: number
  phase: Phase
  turn: number             // whose action it is (placement / resolve / feed driver)
  /** During PLACE: how many workers each player still has to place this round. */
  toPlace: number[]
  /** During RESOLVE: which player resolves next and how far through their spaces. */
  resolveOrder: number[]
  resolveIdx: number
  /** Last dice rolled (for UI display). */
  lastDice: number[]
  lastSpace: SpaceId | null
  winner: number | null
  log: LogEntry[]
}

// ---------- catalogue ----------

export const RESOURCE_SPACES: ResourceSpaceDef[] = [
  { id: 'forest',  name: 'Forest',   resource: 'wood',  divisor: 3, slots: 7 },
  { id: 'claypit', name: 'Clay Pit', resource: 'clay',  divisor: 4, slots: 7 },
  { id: 'quarry',  name: 'Quarry',   resource: 'stone', divisor: 5, slots: 7 },
  { id: 'river',   name: 'River',    resource: 'gold',  divisor: 6, slots: 7 },
]

export const RES_SPACE: Record<string, ResourceSpaceDef> = Object.fromEntries(
  RESOURCE_SPACES.map(s => [s.id, s]),
)

export const RESOURCES: ResourceId[] = ['wood', 'clay', 'stone', 'gold']

/** Relative value of a resource (used for end-game bonus + AI valuation). */
export const RES_VALUE: Record<ResourceId, number> = { wood: 3, clay: 4, stone: 5, gold: 6 }

export const HUNTING: SpaceId = 'hunting'
export const FIELD: SpaceId = 'field'
export const HUT: SpaceId = 'hut'
export const TOOLMAKER: SpaceId = 'toolmaker'
export const BUILDING_SLOTS: SpaceId[] = ['b0', 'b1', 'b2', 'b3']

/** Slot limit per space. Hunting is effectively unlimited; building slots take 1 worker. */
export const SLOTS: Record<SpaceId, number> = {
  hunting: 99,
  forest: 7, claypit: 7, quarry: 7, river: 7,
  field: 1, hut: 2, toolmaker: 1,
  b0: 1, b1: 1, b2: 1, b3: 1,
}

const ALL_SPACES: SpaceId[] = [
  'hunting', 'forest', 'claypit', 'quarry', 'river', 'field', 'hut', 'toolmaker',
  'b0', 'b1', 'b2', 'b3',
]

// The building deck. Costs are tuned so a steady economy can buy them out in a handful
// of rounds (keeps games short). Points roughly scale with cost.
const BUILDING_DECK: Building[] = [
  { id: 'bld1',  name: 'Lean-To',      cost: { wood: 1, clay: 1 },             points: 6,  short: '⛺' },
  { id: 'bld2',  name: 'Clay Hut',     cost: { clay: 2 },                       points: 6,  short: '🛖' },
  { id: 'bld3',  name: 'Wood Lodge',   cost: { wood: 2 },                       points: 6,  short: '🏚️' },
  { id: 'bld4',  name: 'Stone Cairn',  cost: { stone: 2 },                      points: 8,  short: '🗿' },
  { id: 'bld5',  name: 'River Hut',    cost: { wood: 1, gold: 1 },              points: 8,  short: '🏕️' },
  { id: 'bld6',  name: 'Long House',   cost: { wood: 1, clay: 1, stone: 1 },    points: 10, short: '🏘️' },
  { id: 'bld7',  name: 'Stone Hall',   cost: { clay: 1, stone: 1, gold: 1 },    points: 11, short: '🏛️' },
  { id: 'bld8',  name: 'Great Lodge',  cost: { wood: 2, stone: 1 },             points: 11, short: '🏯' },
  { id: 'bld9',  name: 'Gold Shrine',  cost: { stone: 1, gold: 2 },             points: 13, short: '⛩️' },
  { id: 'bld10', name: 'Monument',     cost: { wood: 1, clay: 1, stone: 1, gold: 1 }, points: 14, short: '🗽' },
  { id: 'bld11', name: 'High Temple',  cost: { stone: 2, gold: 1 },             points: 13, short: '🕍' },
  { id: 'bld12', name: 'Mammoth Idol', cost: { wood: 2, clay: 1, gold: 1 },     points: 14, short: '🐘' },
]

/** Lookup of every building by id (for displaying claimed buildings). */
export const BUILDINGS_BY_ID: Record<string, Building> = Object.fromEntries(
  BUILDING_DECK.map(b => [b.id, b]),
)

const MARKET_SIZE = 4

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-40)
}

function clonePlayer(p: Player): Player {
  return { ...p, res: { ...p.res }, buildings: p.buildings.slice() }
}

function clone(s: State): State {
  const occ = {} as Record<SpaceId, number[]>
  for (const k of ALL_SPACES) occ[k] = s.occ[k].slice()
  return {
    players: s.players.map(clonePlayer),
    occ,
    market: s.market.slice(),
    deck: s.deck.slice(),
    round: s.round,
    phase: s.phase,
    turn: s.turn,
    toPlace: s.toPlace.slice(),
    resolveOrder: s.resolveOrder.slice(),
    resolveIdx: s.resolveIdx,
    lastDice: s.lastDice.slice(),
    lastSpace: s.lastSpace,
    winner: s.winner,
    log: s.log.slice(),
  }
}

function newPlayer(id: number, name: string): Player {
  return {
    id, name,
    workers: 5,
    food: 12,
    farm: 0,
    res: { wood: 0, clay: 0, stone: 0, gold: 0 },
    tools: 0,
    points: 0,
    buildings: [],
  }
}

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

export function makeGame(seed?: number): State {
  const ordered = seed == null ? BUILDING_DECK.slice() : shuffle(BUILDING_DECK, seed)
  const market: (Building | null)[] = []
  const deck = ordered.slice()
  for (let i = 0; i < MARKET_SIZE; i++) market.push(deck.shift() ?? null)

  const occ = {} as Record<SpaceId, number[]>
  for (const k of ALL_SPACES) occ[k] = []

  return {
    players: [newPlayer(0, 'You'), newPlayer(1, 'Rival Clan')],
    occ,
    market,
    deck,
    round: 1,
    phase: 'place',
    turn: 0,
    toPlace: [5, 5],
    resolveOrder: [0, 1],
    resolveIdx: 0,
    lastDice: [],
    lastSpace: null,
    winner: null,
    log: [{ t: 'sys', x: 'Place your tribe, gather, build, and feed your people through the ages.' }],
  }
}

// ---------- placement ----------

/** Workers already placed on `space` (any player). */
export function placedOn(s: State, space: SpaceId): number {
  return s.occ[space].length
}

/** Free slots remaining on a space. */
export function freeSlots(s: State, space: SpaceId): number {
  return SLOTS[space] - s.occ[space].length
}

/** Can `player` legally place `count` workers on `space` right now? */
export function canPlace(s: State, player: number, space: SpaceId, count: number): boolean {
  if (s.phase !== 'place' || s.winner != null) return false
  if (s.turn !== player) return false
  if (count <= 0 || count > s.toPlace[player]) return false
  if (freeSlots(s, space) < count) return false
  // The hut requires exactly 2 workers; a building/field/toolmaker take exactly 1.
  if (space === HUT && count !== 2) return false
  if ((space === FIELD || space === TOOLMAKER || BUILDING_SLOTS.includes(space)) && count !== 1) return false
  // Building slot must actually hold a building.
  if (BUILDING_SLOTS.includes(space)) {
    const idx = BUILDING_SLOTS.indexOf(space)
    if (!s.market[idx]) return false
  }
  return true
}

/** Is there ANY legal worker count `player` could place on `space` right now?
    (Used by the UI to decide whether a space is clickable.) */
export function canPlaceAny(s: State, player: number, space: SpaceId): boolean {
  if (space === HUT) return canPlace(s, player, space, 2)
  if (space === FIELD || space === TOOLMAKER || BUILDING_SLOTS.includes(space)) {
    return canPlace(s, player, space, 1)
  }
  // gather / hunting: at least 1
  return canPlace(s, player, space, 1)
}

/** Place `count` of `player`'s workers onto `space`. Advances the placement turn. */
export function placeWorker(s: State, player: number, space: SpaceId, count: number): State {
  if (!canPlace(s, player, space, count)) return s
  const out = clone(s)
  for (let i = 0; i < count; i++) out.occ[space].push(player)
  out.toPlace[player] -= count
  const p = out.players[player]
  out.log = push(out.log, p.id === 0 ? 'you' : 'ai',
    `${p.name} placed ${count} worker${count > 1 ? 's' : ''} on ${spaceName(space, out)}.`)

  // Advance to the next player who still has workers to place; if nobody does, resolve.
  advancePlacement(out)
  return out
}

function spaceName(space: SpaceId, s: State): string {
  if (space === 'hunting') return 'the Hunting Ground'
  if (space === 'field') return 'the Field'
  if (space === 'hut') return 'the Hut'
  if (space === 'toolmaker') return 'the Toolmaker'
  if (BUILDING_SLOTS.includes(space)) {
    const b = s.market[BUILDING_SLOTS.indexOf(space)]
    return b ? b.name : 'a building'
  }
  return RES_SPACE[space]?.name ?? space
}

function advancePlacement(s: State): void {
  const n = s.players.length
  // If a player has no legal placement left (e.g. all slots full but still owes workers),
  // they forfeit the rest (rare in 2p with hunting unlimited; hunting always available).
  for (let step = 1; step <= n; step++) {
    const next = (s.turn + step) % n
    if (s.toPlace[next] > 0) { s.turn = next; return }
  }
  // Everyone placed -> move to resolve.
  if (s.toPlace.every(t => t === 0)) {
    s.phase = 'resolve'
    s.resolveOrder = [0, 1]
    s.resolveIdx = 0
    s.turn = s.resolveOrder[0]
    return
  }
  // Current player still owes workers and is the only one left.
  if (s.toPlace[s.turn] > 0) return
}

// ---------- resolve ----------

function rollN(n: number, rand: () => number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(1 + Math.floor(rand() * 6))
  return out
}

/** Resolve ALL placed workers for the player whose turn it is during the resolve phase.
    Rolls dice for gather spaces, grows the tribe at the hut, grants tools, advances the
    farm, and claims buildings. Advances to the next resolver or to the feed phase. */
export function resolvePlacements(s: State, rand: () => number = Math.random): State {
  if (s.phase !== 'resolve' || s.winner != null) return s
  const out = clone(s)
  const player = out.turn
  const p = out.players[player]
  const lastDice: number[] = []
  let lastSpace: SpaceId | null = null

  // Resource gather spaces.
  for (const def of RESOURCE_SPACES) {
    const mine = out.occ[def.id].filter(x => x === player).length
    if (mine === 0) continue
    const dice = rollN(mine, rand)
    const sum = dice.reduce((a, b) => a + b, 0) + p.tools
    const yld = Math.floor(sum / def.divisor)
    p.res[def.resource] += yld
    lastDice.push(...dice)
    lastSpace = def.id
    out.log = push(out.log, p.id === 0 ? 'you' : 'ai',
      `${p.name} rolled ${sum} at the ${def.name} → ${yld} ${def.resource}.`)
  }

  // Hunting ground -> food. (Uses the food divisor of 2, generous.)
  {
    const mine = out.occ['hunting'].filter(x => x === player).length
    if (mine > 0) {
      const dice = rollN(mine, rand)
      const sum = dice.reduce((a, b) => a + b, 0) + p.tools
      const yld = Math.floor(sum / 2)
      p.food += yld
      lastDice.push(...dice)
      lastSpace = 'hunting'
      out.log = push(out.log, p.id === 0 ? 'you' : 'ai',
        `${p.name} hunted (rolled ${sum}) → ${yld} food.`)
    }
  }

  // Field -> +1 farm (passive food each round).
  if (out.occ['field'].some(x => x === player)) {
    p.farm += 1
    out.log = push(out.log, p.id === 0 ? 'you' : 'ai', `${p.name} expanded the farm (+1 food/round).`)
  }

  // Toolmaker -> +1 tool.
  if (out.occ['toolmaker'].some(x => x === player)) {
    p.tools += 1
    out.log = push(out.log, p.id === 0 ? 'you' : 'ai', `${p.name} crafted a tool (+1 to gather rolls).`)
  }

  // Hut -> +1 worker (love shack).
  if (out.occ['hut'].some(x => x === player)) {
    p.workers += 1
    out.log = push(out.log, p.id === 0 ? 'you' : 'ai', `${p.name}'s tribe grew by 1 worker.`)
  }

  // Buildings -> auto-claim if the player placed a worker there and can afford it.
  for (const slot of BUILDING_SLOTS) {
    if (!out.occ[slot].some(x => x === player)) continue
    const idx = BUILDING_SLOTS.indexOf(slot)
    const b = out.market[idx]
    if (b && canAfford(p, b)) {
      payBuilding(p, b)
      p.buildings.push(b.id)
      p.points += b.points
      out.market[idx] = null
      out.log = push(out.log, p.id === 0 ? 'you' : 'ai', `${p.name} built the ${b.name} (+${b.points} pts).`)
    }
  }

  out.lastDice = lastDice
  out.lastSpace = lastSpace

  // Advance the resolver.
  out.resolveIdx += 1
  if (out.resolveIdx < out.resolveOrder.length) {
    out.turn = out.resolveOrder[out.resolveIdx]
  } else {
    // All resolved -> feed phase.
    out.phase = 'feed'
    out.turn = 0
  }
  return out
}

function canAfford(p: Player, b: Building): boolean {
  for (const r of RESOURCES) {
    const need = b.cost[r] ?? 0
    if (p.res[r] < need) return false
  }
  return true
}

function payBuilding(p: Player, b: Building): void {
  for (const r of RESOURCES) {
    const need = b.cost[r] ?? 0
    p.res[r] -= need
  }
}

/** Explicit building purchase (used by UI/AI when a worker is on the slot). Validates
    affordability; deducts resources and banks points. */
export function buyBuilding(s: State, player: number, buildingId: string): State {
  if (s.winner != null) return s
  const out = clone(s)
  const p = out.players[player]
  const idx = out.market.findIndex(b => b != null && b.id === buildingId)
  if (idx < 0) return s
  const b = out.market[idx]!
  if (!canAfford(p, b)) return s
  payBuilding(p, b)
  p.buildings.push(b.id)
  p.points += b.points
  out.market[idx] = null
  out.log = push(out.log, p.id === 0 ? 'you' : 'ai', `${p.name} built the ${b.name} (+${b.points} pts).`)
  return out
}

// ---------- feeding ----------

/** Feed `player`'s tribe: farm covers some, food stock covers the rest, shortfall costs
    1 point per missing food. Advances to the next player; after the last, refills the
    market and starts a new round (or ends the game). */
export function feedPhase(s: State, player?: number): State {
  if (s.phase !== 'feed' || s.winner != null) return s
  const out = clone(s)
  const pi = player ?? out.turn
  const p = out.players[pi]

  const need = p.workers
  const fromFarm = Math.min(p.farm, need)
  const remaining = need - fromFarm
  const fromStock = Math.min(p.food, remaining)
  p.food -= fromStock
  const shortfall = remaining - fromStock
  if (shortfall > 0) {
    p.points -= shortfall
    out.log = push(out.log, p.id === 0 ? 'you' : 'ai',
      `${p.name} could not feed ${shortfall} worker(s) — lost ${shortfall} pts.`)
  } else {
    out.log = push(out.log, p.id === 0 ? 'you' : 'ai', `${p.name} fed the whole tribe.`)
  }

  // Next player / round transition.
  if (pi + 1 < out.players.length) {
    out.turn = pi + 1
    return out
  }

  // End of round: clear placements, refill market, next round (or end game).
  for (const k of ALL_SPACES) out.occ[k] = []
  for (let i = 0; i < out.market.length; i++) {
    if (out.market[i] == null) out.market[i] = out.deck.shift() ?? null
  }

  const marketEmpty = out.market.every(b => b == null) && out.deck.length === 0
  if (marketEmpty) {
    endGame(out)
    return out
  }

  out.round += 1
  out.phase = 'place'
  out.turn = 0
  out.toPlace = out.players.map(pl => pl.workers)
  out.resolveOrder = [0, 1]
  out.resolveIdx = 0
  out.lastDice = []
  out.lastSpace = null
  return out
}

function endGame(s: State): void {
  // End-game bonus: leftover resources scored at their relative value.
  for (const p of s.players) {
    let bonus = 0
    for (const r of RESOURCES) bonus += p.res[r] * RES_VALUE[r]
    p.points += bonus
    s.log = push(s.log, p.id === 0 ? 'you' : 'ai',
      `${p.name} scored ${bonus} bonus pts from leftover resources.`)
  }
  s.phase = 'over'
  // Winner = most points (player 0 wins ties as the local player).
  const a = s.players[0].points, b = s.players[1].points
  s.winner = a >= b ? 0 : 1
  const w = s.players[s.winner]
  s.log = push(s.log, 'sys', `Final: You ${a} — ${s.players[1].name} ${b}. ${w.name} win${w.id === 0 ? '' : 's'}!`)
}

// ---------- scoring ----------

export function scorePlayer(p: Player): number {
  return p.points
}

export const winner = (s: State): number | null => s.winner

// ---------- AI ----------

/** Greedy AI placement for ONE worker-batch decision. Picks the single best space to
    place workers given current needs (grow early, gather toward an affordable building,
    keep fed). Returns { space, count } or null if it cannot place (shouldn't happen —
    hunting is always open). */
function aiPickPlacement(s: State, player: number): { space: SpaceId; count: number } | null {
  const p = s.players[player]
  const left = s.toPlace[player]
  if (left <= 0) return null

  // 1) Grow the tribe early (rounds 1-3) if the hut is open and we have 2+ workers to place.
  if (s.round <= 3 && left >= 2 && freeSlots(s, HUT) >= 2 && canPlace(s, player, HUT, 2)) {
    return { space: HUT, count: 2 }
  }

  // 2) If a building in the market is affordable AND its slot is open, claim it.
  for (const slot of BUILDING_SLOTS) {
    const idx = BUILDING_SLOTS.indexOf(slot)
    const b = s.market[idx]
    if (b && canAfford(p, b) && canPlace(s, player, slot, 1)) {
      return { space: slot, count: 1 }
    }
  }

  // 3) Grab a tool occasionally (if none yet and toolmaker open).
  if (p.tools < 2 && canPlace(s, player, TOOLMAKER, 1) && s.round <= 4) {
    return { space: TOOLMAKER, count: 1 }
  }

  // 4) Otherwise gather toward the cheapest not-yet-affordable building's missing resource.
  //    Determine which resource we most lack relative to building costs.
  const need: Record<ResourceId, number> = { wood: 0, clay: 0, stone: 0, gold: 0 }
  for (const b of s.market) {
    if (!b) continue
    for (const r of RESOURCES) {
      const deficit = (b.cost[r] ?? 0) - p.res[r]
      if (deficit > 0) need[r] += deficit
    }
  }
  // Pick the resource space with the highest need that has free slots.
  let bestSpace: SpaceId | null = null
  let bestNeed = -1
  for (const def of RESOURCE_SPACES) {
    const n = need[def.resource]
    if (n > bestNeed && canPlace(s, player, def.id, Math.min(left, freeSlots(s, def.id)))) {
      bestNeed = n
      bestSpace = def.id
    }
  }
  if (bestSpace && bestNeed > 0) {
    const cap = Math.min(left, freeSlots(s, bestSpace), 3) // don't dump everything in one pit
    return { space: bestSpace, count: Math.max(1, cap) }
  }

  // 5) Keep fed: hunt with the rest.
  if (canPlace(s, player, HUNTING, Math.min(left, SLOTS.hunting))) {
    return { space: HUNTING, count: left }
  }

  // 6) Fallback: any resource space with room.
  for (const def of RESOURCE_SPACES) {
    const room = freeSlots(s, def.id)
    if (room > 0) {
      const c = Math.min(left, room)
      if (canPlace(s, player, def.id, c)) return { space: def.id, count: c }
    }
  }
  return null
}

/** Run the AI's full action for the CURRENT phase as a single sub-step.
    - place phase: place ONE batch of workers (so the tick advances each call).
    - resolve phase: resolve the AI's placements (buildings auto-claim there).
    - feed phase: feed the AI.
    Player 0's sub-steps are never driven here (guarded). */
export function aiTurn(s: State, rand: () => number = Math.random): State {
  if (s.winner != null) return s

  if (s.phase === 'place') {
    if (s.turn !== 1) return s
    const pick = aiPickPlacement(s, 1)
    if (!pick) {
      // No legal placement — forfeit remaining by dumping into hunting (always open) or
      // zeroing out to avoid a stall.
      const out = clone(s)
      out.toPlace[1] = 0
      advancePlacement(out)
      return out
    }
    return placeWorker(s, 1, pick.space, pick.count)
  }

  if (s.phase === 'resolve') {
    if (s.turn !== 1) return s
    return resolvePlacements(s, rand)
  }

  if (s.phase === 'feed') {
    if (s.turn !== 1) return s
    return feedPhase(s, 1)
  }

  return s
}
