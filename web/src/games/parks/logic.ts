/* PARKS — pure logic (built for this codebase, not ported).
   A 2-player trail-walking resource/drafting game. A TRAIL of 8 action SITES is laid in a line
   and re-seeded each season. Each player owns TWO HIKERS that start at the trailhead (a virtual
   position -1) and walk FORWARD along the trail. On a turn, a player moves ONE hiker forward any
   number of sites to an UNOCCUPIED site (no two hikers may share a site) and resolves that site's
   ACTION: gain wilderness RESOURCES (sun/mountain/forest/water), take a PHOTO (gain VP + sun),
   draw nothing but use a CANTEEN (gain any one resource), or gain a small mixed bundle. When BOTH
   of a player's hikers reach the END of the trail, that player's season is over and they may BUY
   one PARK card from the market (paying its resource cost for VP). After both players finish, the
   season advances and all hikers reset to the trailhead with a freshly seeded trail. Play 4
   seasons. Final score = VP from parks + photos + leftover-resource end bonus. Most VP wins.
   Immutable-ish (functions return new state), deterministic with an optional seed. No DOM. */

export type Player = 0 | 1
export type Resource = 'sun' | 'mountain' | 'forest' | 'water'
export const RESOURCES: Resource[] = ['sun', 'mountain', 'forest', 'water']

export const TRAIL_LEN = 8
export const SEASONS = 4
export const TRAILHEAD = -1 // hikers begin before site 0
export const END = TRAIL_LEN // a hiker at END has finished the trail

export type Pool = Record<Resource, number>

// A site action. 'gain' grants a fixed bundle; 'photo' grants VP + a sun; 'canteen' grants a
// wild resource (the player's currently-scarcest, chosen at resolve time).
export interface Site {
  id: number
  kind: 'gain' | 'photo' | 'canteen'
  grant: Partial<Pool> // for 'gain': fixed resources; for 'photo': included sun
  photoVP: number      // for 'photo' sites: VP awarded
  label: string
}

export interface ParkCard {
  id: number
  name: string
  cost: Pool      // resource cost to claim
  vp: number      // victory points when claimed
}

export interface LogEntry { t: string; x: string }

export interface PlayerState {
  hikers: [number, number] // each is TRAILHEAD(-1)..END(TRAIL_LEN)
  pool: Pool
  parks: ParkCard[]        // claimed park cards
  photos: number           // count of photos taken
  vp: number               // accumulated victory points (parks + photos)
  doneSeason: boolean      // both hikers reached END this season
}

export interface ParksState {
  trail: Site[]
  market: ParkCard[]       // park cards available to buy
  parkDeck: ParkCard[]     // remaining park cards to refill the market
  players: [PlayerState, PlayerState]
  season: number           // 1..SEASONS
  turn: Player             // whose turn it is
  winner: Player | 'tie' | null
  step: number             // monotonic counter — every state-changing action bumps it
  log: LogEntry[]
}

// ---- small helpers ----

function zeroPool(): Pool { return { sun: 0, mountain: 0, forest: 0, water: 0 } }

function clonePool(p: Pool): Pool { return { sun: p.sun, mountain: p.mountain, forest: p.forest, water: p.water } }

function addPool(into: Pool, add: Partial<Pool>): Pool {
  const out = clonePool(into)
  for (const r of RESOURCES) out[r] += add[r] ?? 0
  return out
}

function canAfford(pool: Pool, cost: Pool): boolean {
  return RESOURCES.every(r => pool[r] >= cost[r])
}

function poolTotal(p: Pool): number { return RESOURCES.reduce((a, r) => a + p[r], 0) }

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-30)
}

// Tiny deterministic PRNG (mulberry32) so setups are reproducible in tests.
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clonePlayer(p: PlayerState): PlayerState {
  return {
    hikers: [p.hikers[0], p.hikers[1]],
    pool: clonePool(p.pool),
    parks: p.parks.slice(),
    photos: p.photos,
    vp: p.vp,
    doneSeason: p.doneSeason,
  }
}

function cloneState(s: ParksState): ParksState {
  return {
    trail: s.trail.slice(),
    market: s.market.slice(),
    parkDeck: s.parkDeck.slice(),
    players: [clonePlayer(s.players[0]), clonePlayer(s.players[1])],
    season: s.season,
    turn: s.turn,
    winner: s.winner,
    step: s.step,
    log: s.log.slice(),
  }
}

// ---- trail + park-card generation ----

// A fixed library of site templates; a season's trail is a shuffled subset.
function siteTemplates(): Omit<Site, 'id'>[] {
  return [
    { kind: 'gain', grant: { sun: 2 }, photoVP: 0, label: 'Sunny Ridge' },
    { kind: 'gain', grant: { mountain: 2 }, photoVP: 0, label: 'Rocky Pass' },
    { kind: 'gain', grant: { forest: 2 }, photoVP: 0, label: 'Pine Grove' },
    { kind: 'gain', grant: { water: 2 }, photoVP: 0, label: 'River Bend' },
    { kind: 'gain', grant: { sun: 1, mountain: 1 }, photoVP: 0, label: 'Highland' },
    { kind: 'gain', grant: { forest: 1, water: 1 }, photoVP: 0, label: 'Wetland' },
    { kind: 'gain', grant: { mountain: 1, forest: 1 }, photoVP: 0, label: 'Woodland' },
    { kind: 'photo', grant: { sun: 1 }, photoVP: 1, label: 'Vista Point' },
    { kind: 'photo', grant: {}, photoVP: 2, label: 'Overlook' },
    { kind: 'canteen', grant: {}, photoVP: 0, label: 'Spring' },
  ]
}

function parkLibrary(): Omit<ParkCard, 'id'>[] {
  return [
    { name: 'Yellowstone', cost: { sun: 1, mountain: 1, forest: 1, water: 1 }, vp: 4 },
    { name: 'Yosemite', cost: { sun: 0, mountain: 2, forest: 1, water: 0 }, vp: 3 },
    { name: 'Glacier', cost: { sun: 0, mountain: 1, forest: 0, water: 2 }, vp: 3 },
    { name: 'Zion', cost: { sun: 2, mountain: 1, forest: 0, water: 0 }, vp: 3 },
    { name: 'Sequoia', cost: { sun: 0, mountain: 0, forest: 3, water: 0 }, vp: 4 },
    { name: 'Acadia', cost: { sun: 1, mountain: 0, forest: 1, water: 2 }, vp: 4 },
    { name: 'Arches', cost: { sun: 3, mountain: 0, forest: 0, water: 0 }, vp: 4 },
    { name: 'Olympic', cost: { sun: 0, mountain: 0, forest: 2, water: 2 }, vp: 5 },
    { name: 'Denali', cost: { sun: 1, mountain: 3, forest: 0, water: 1 }, vp: 6 },
    { name: 'Everglades', cost: { sun: 1, mountain: 0, forest: 1, water: 3 }, vp: 6 },
    { name: 'Bryce', cost: { sun: 2, mountain: 2, forest: 0, water: 0 }, vp: 4 },
    { name: 'Redwood', cost: { sun: 0, mountain: 0, forest: 2, water: 1 }, vp: 3 },
    { name: 'Teton', cost: { sun: 1, mountain: 2, forest: 1, water: 0 }, vp: 4 },
    { name: 'Badlands', cost: { sun: 2, mountain: 1, forest: 0, water: 1 }, vp: 4 },
  ]
}

function seedTrail(rand: () => number, idBase: number): Site[] {
  const templates = siteTemplates()
  // Fisher-Yates shuffle a copy.
  const idx = templates.map((_, i) => i)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  const chosen = idx.slice(0, TRAIL_LEN).map((ti, k) => {
    const t = templates[ti]
    return { id: idBase + k, ...t, grant: { ...t.grant } } as Site
  })
  return chosen
}

export interface SetupOptions {
  seed?: number
}

export function makeGame(setup: SetupOptions = {}): ParksState {
  const seed = setup.seed ?? ((Math.random() * 1e9) | 0)
  const rand = rng(seed)
  // Build & shuffle the park deck.
  const lib = parkLibrary()
  const cards: ParkCard[] = lib.map((c, i) => ({ id: i, name: c.name, cost: clonePool(c.cost), vp: c.vp }))
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  const market = cards.slice(0, 3)
  const parkDeck = cards.slice(3)

  const newPlayer = (): PlayerState => ({
    hikers: [TRAILHEAD, TRAILHEAD],
    pool: zeroPool(),
    parks: [],
    photos: 0,
    vp: 0,
    doneSeason: false,
  })

  return {
    trail: seedTrail(rand, 0),
    market,
    parkDeck,
    players: [newPlayer(), newPlayer()],
    season: 1,
    turn: 0,
    winner: null,
    step: 0,
    log: [{ t: 'sys', x: 'Season 1 — the trail awaits.' }],
  }
}

// ---- queries ----

// True once both of a player's hikers have reached the END of the trail.
export function playerFinished(p: PlayerState): boolean {
  return p.hikers[0] === END && p.hikers[1] === END
}

// Which sites are currently occupied (by EITHER player's hikers). The trailhead and END are
// never "occupied" (multiple hikers may rest there).
function occupiedSites(s: ParksState): Set<number> {
  const occ = new Set<number>()
  for (const pl of s.players) {
    for (const h of pl.hikers) {
      if (h !== TRAILHEAD && h !== END) occ.add(h)
    }
  }
  return occ
}

export interface Move {
  hiker: 0 | 1
  site: number // a real trail index (0..TRAIL_LEN-1), strictly forward of the hiker
}

// Legal moves for `player`: pick one of their (not-yet-finished) hikers and move it forward to an
// unoccupied site. A hiker at TRAILHEAD(-1) may move to any unoccupied site 0..7. Reaching END is
// represented as a move to site === END only when no forward sites are reachable... we instead
// model END as always reachable so hikers can finish. We expose END as a special site target.
export function legalMoves(s: ParksState, player: Player): Move[] {
  const p = s.players[player]
  const occ = occupiedSites(s)
  const moves: Move[] = []
  for (let h = 0 as 0 | 1; h <= 1; h = (h + 1) as 0 | 1) {
    const pos = p.hikers[h]
    if (pos === END) continue // finished hiker can't move
    // forward trail sites
    for (let site = pos + 1; site < TRAIL_LEN; site++) {
      if (!occ.has(site)) moves.push({ hiker: h, site })
    }
    // a hiker may always step off the end (to END) — this is how hikers finish the trail.
    moves.push({ hiker: h, site: END })
  }
  return moves
}

export function legalMovesForHiker(s: ParksState, player: Player, hiker: 0 | 1): number[] {
  return legalMoves(s, player).filter(m => m.hiker === hiker).map(m => m.site)
}

// ---- resolving a site action ----

// Pick the player's currently-scarcest resource (for canteen / wild). Deterministic tie-break by
// RESOURCES order.
function scarcest(pool: Pool): Resource {
  let best: Resource = RESOURCES[0]
  for (const r of RESOURCES) if (pool[r] < pool[best]) best = r
  return best
}

function resolveSite(s: ParksState, player: Player, siteIndex: number): void {
  if (siteIndex === END) return // stepping off the end yields nothing
  const site = s.trail[siteIndex]
  const p = s.players[player]
  if (site.kind === 'gain') {
    p.pool = addPool(p.pool, site.grant)
    s.log = push(s.log, player === 0 ? 'you' : 'foe',
      `${player === 0 ? 'You' : 'AI'} gathered at ${site.label}.`)
  } else if (site.kind === 'photo') {
    p.pool = addPool(p.pool, site.grant)
    p.photos += 1
    p.vp += site.photoVP
    s.log = push(s.log, player === 0 ? 'you' : 'foe',
      `${player === 0 ? 'You' : 'AI'} took a photo at ${site.label} (+${site.photoVP} VP).`)
  } else { // canteen
    const r = scarcest(p.pool)
    p.pool = addPool(p.pool, { [r]: 1 })
    s.log = push(s.log, player === 0 ? 'you' : 'foe',
      `${player === 0 ? 'You' : 'AI'} filled a canteen (+1 ${r}).`)
  }
}

// ---- moving a hiker ----

// Move one hiker forward to `site` (a real index or END) and resolve the action. Returns a NEW
// state. Throws on an illegal move. Advances turn to the other player (or marks the mover's season
// done if both their hikers finished). Does NOT auto-advance the season — call endSeason for that.
export function moveHiker(s: ParksState, player: Player, hikerIndex: 0 | 1, site: number): ParksState {
  if (s.winner != null) throw new Error('game over')
  if (s.turn !== player) throw new Error('not your turn')
  const legal = legalMoves(s, player).some(m => m.hiker === hikerIndex && m.site === site)
  if (!legal) throw new Error('illegal move')

  const ns = cloneState(s)
  ns.players[player].hikers[hikerIndex] = site
  resolveSite(ns, player, site)
  ns.step += 1

  if (playerFinished(ns.players[player])) {
    ns.players[player].doneSeason = true
    ns.log = push(ns.log, player === 0 ? 'you' : 'foe',
      `${player === 0 ? 'You' : 'AI'} reached the end of the trail.`)
  }

  // Pass the turn to whichever player still has a hiker to move this season.
  ns.turn = nextTurn(ns, player)
  return ns
}

// Choose who acts next: the other player if they're not finished, else the same player if they
// still have moves, else leave on whoever (caller should endSeason).
function nextTurn(s: ParksState, justMoved: Player): Player {
  const other = (justMoved === 0 ? 1 : 0) as Player
  if (!s.players[other].doneSeason) return other
  if (!s.players[justMoved].doneSeason) return justMoved
  return justMoved // both done; season should end
}

export function bothFinished(s: ParksState): boolean {
  return s.players[0].doneSeason && s.players[1].doneSeason
}

// ---- buying parks ----

export function canBuyPark(s: ParksState, player: Player, parkId: number): boolean {
  const card = s.market.find(c => c.id === parkId)
  if (card == null) return false
  return canAfford(s.players[player].pool, card.cost)
}

// Buy a park from the market: deduct its cost, add VP, remove from market, refill from the deck.
// Allowed at any time the player can afford it (typically at season-end). Returns NEW state.
export function buyPark(s: ParksState, player: Player, parkId: number): ParksState {
  if (s.winner != null) throw new Error('game over')
  const card = s.market.find(c => c.id === parkId)
  if (card == null) throw new Error('no such park in market')
  const p = s.players[player]
  if (!canAfford(p.pool, card.cost)) throw new Error('cannot afford')

  const ns = cloneState(s)
  const np = ns.players[player]
  np.pool = clonePool(np.pool)
  for (const r of RESOURCES) np.pool[r] -= card.cost[r]
  np.parks = np.parks.concat([card])
  np.vp += card.vp
  ns.market = ns.market.filter(c => c.id !== parkId)
  if (ns.parkDeck.length > 0) {
    ns.market = ns.market.concat([ns.parkDeck[0]])
    ns.parkDeck = ns.parkDeck.slice(1)
  }
  ns.step += 1
  ns.log = push(ns.log, player === 0 ? 'you' : 'foe',
    `${player === 0 ? 'You' : 'AI'} claimed ${card.name} (+${card.vp} VP).`)
  return ns
}

// ---- ending a season ----

// End the current season: both players must have finished. Advances the season counter, reseeds
// the trail, resets hikers to the trailhead. If it was the last season, computes the winner
// (applying end bonuses). Returns NEW state.
export function endSeason(s: ParksState): ParksState {
  if (s.winner != null) return s
  if (!bothFinished(s)) throw new Error('season not over')

  const ns = cloneState(s)
  if (ns.season >= SEASONS) {
    return finishGame(ns)
  }
  ns.season += 1
  // reseed trail deterministically off the season + step.
  const rand = rng((ns.season * 100003) ^ (ns.step * 31 + 7))
  ns.trail = seedTrail(rand, ns.season * 100)
  for (const pl of ns.players) {
    pl.hikers = [TRAILHEAD, TRAILHEAD]
    pl.doneSeason = false
  }
  ns.turn = 0
  ns.step += 1
  ns.log = push(ns.log, 'sys', `Season ${ns.season} — a fresh trail is laid.`)
  return ns
}

// End-of-game scoring: park & photo VP already accumulated; add a leftover-resource bonus
// (1 VP per 3 leftover resources). Set winner.
function endBonus(p: PlayerState): number {
  return Math.floor(poolTotal(p.pool) / 3)
}

export function finalScore(p: PlayerState): number {
  return p.vp + endBonus(p)
}

function finishGame(ns: ParksState): ParksState {
  const a = finalScore(ns.players[0])
  const b = finalScore(ns.players[1])
  ns.winner = a > b ? 0 : b > a ? 1 : 'tie'
  ns.step += 1
  ns.log = push(ns.log, 'sys',
    ns.winner === 'tie' ? `Game over — tied at ${a} VP.`
      : `Game over — ${ns.winner === 0 ? 'You win' : 'AI wins'} ${Math.max(a, b)}–${Math.min(a, b)}.`)
  return ns
}

// ---- AI ----

// Greedy AI: prefer a forward move onto a site that grants resources it needs for the most
// valuable affordable-soon park; otherwise grab photos / the richest gain site; finish hikers when
// no useful sites remain. After moving (when finished) it buys the best park it can afford.
function aiNeed(s: ParksState, player: Player): Pool {
  // Aggregate the shortfall toward the best market park the AI could plausibly reach.
  const p = s.players[player]
  const need = zeroPool()
  // weight by vp; sum required-minus-have across market cards.
  for (const card of s.market) {
    for (const r of RESOURCES) {
      const short = Math.max(0, card.cost[r] - p.pool[r])
      need[r] += short * card.vp
    }
  }
  return need
}

function siteScore(s: ParksState, player: Player, site: Site, need: Pool): number {
  if (site.kind === 'photo') {
    return site.photoVP * 5 + (site.grant.sun ?? 0)
  }
  if (site.kind === 'canteen') {
    return 2
  }
  // gain site: score by how much it covers needed resources, plus a base for raw resources.
  let sc = 0
  for (const r of RESOURCES) {
    const g = site.grant[r] ?? 0
    sc += g * 2 + (need[r] > 0 ? g * 3 : 0)
  }
  return sc
}

// Perform ONE AI action: either move a hiker (resolving its site) or, if the AI just finished its
// season, buy the best affordable park, or end the season when both are done. Always returns a NEW
// state (or the same state if nothing to do / not the AI's turn). Each action bumps `step`.
export function aiTurn(s: ParksState): ParksState {
  if (s.winner != null) return s
  const player: Player = 1

  // If both players finished, end the season (this drives season progression in self-play).
  if (bothFinished(s)) {
    let ns = s
    // AI buys its best affordable park before the season closes, if any.
    ns = aiBuy(ns, player)
    return endSeason(ns)
  }

  if (s.turn !== player) {
    // Not the AI's turn. If the AI is done but the human still moves, nothing for AI to do here.
    return s
  }

  const p = s.players[player]
  if (p.doneSeason) {
    // AI finished but it's somehow its turn; pass.
    const ns = cloneState(s)
    ns.turn = 0
    ns.step += 1
    return ns
  }

  // Choose the best move.
  const moves = legalMoves(s, player)
  const need = aiNeed(s, player)
  let best: Move | null = null
  let bestScore = -Infinity
  for (const m of moves) {
    let sc: number
    if (m.site === END) {
      // Finishing is a fallback: small negative so real sites win, but better than nothing.
      sc = -1
    } else {
      sc = siteScore(s, player, s.trail[m.site], need)
      // Slight penalty for wasting trail distance (prefer nearer good sites).
      sc -= (m.site - Math.max(p.hikers[m.hiker], 0)) * 0.05
    }
    if (sc > bestScore) { bestScore = sc; best = m }
  }
  if (best == null) {
    // No moves at all — shouldn't happen (END always available); finish.
    const ns = cloneState(s)
    ns.turn = 0
    ns.step += 1
    return ns
  }
  let ns = moveHiker(s, player, best.hiker, best.site)
  // If the AI just finished, opportunistically buy a park now too.
  if (ns.players[player].doneSeason) ns = aiBuy(ns, player)
  return ns
}

// AI buys the single best-VP park it can currently afford (if any). Returns NEW or same state.
export function aiBuy(s: ParksState, player: Player): ParksState {
  if (s.winner != null) return s
  let best: ParkCard | null = null
  for (const card of s.market) {
    if (canAfford(s.players[player].pool, card.cost)) {
      if (best == null || card.vp > best.vp) best = card
    }
  }
  if (best == null) return s
  return buyPark(s, player, best.id)
}

// Convenience for self-play tests / human end-of-season: when both players are done, optionally
// buy then advance. Returns NEW state.
export function winner(s: ParksState): Player | 'tie' | null {
  return s.winner
}
