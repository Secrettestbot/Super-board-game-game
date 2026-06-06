/* EVERDELL — simplified worker-placement + tableau-building (DOM-free, pure logic).

   You (player 0) vs one greedy AI (player 1). Each player builds a CITY of up to 15
   cards (CONSTRUCTIONS + CRITTERS), holds a HAND of cards, a stock of four RESOURCES
   (TWIG, RESIN, PEBBLE, BERRY), a pool of WORKERS (start 2, gain more across seasons),
   a SEASON (Winter -> Spring -> Summer -> Autumn) and POINTS.

   On your turn you do ONE of:
     PLACE A WORKER on a forest location/basic action to gain resources or cards.
     PLAY A CARD from your hand into your city, paying its resource cost — OR for FREE
       if you already have the matching CONSTRUCTION that "houses" that CRITTER.
     PREPARE FOR THE NEXT SEASON: recall all your workers and gain more workers,
       advancing one season.

   When BOTH players finish AUTUMN (prepare out of Autumn) the game ends. Final score =
   card points + per-card bonus effects. Most points wins.

   The deck is deterministic by default (seed-able) so tests are reproducible.          */

export type ResourceId = 'twig' | 'resin' | 'pebble' | 'berry'

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

export type CardKind = 'construction' | 'critter'

export type LocationId =
  | 'twigs'        // 3 twig (unlimited / basic)
  | 'resins'       // 2 resin
  | 'pebble'       // 1 pebble
  | 'berry'        // 1 berry
  | 'twigResinCard' // 1 twig + 1 resin + 1 card
  | 'berryCard'    // 1 berry + 1 card
  | 'twoCards'     // draw 2 cards
  | 'pebbleCard'   // 1 pebble + 1 card

export interface LocationDef {
  id: LocationId
  name: string
  /** Resource gains awarded when a worker is placed. */
  gain: Partial<Record<ResourceId, number>>
  /** Cards drawn into hand. */
  cards: number
  /** Worker slots; >20 means effectively unlimited (basic forest). */
  slots: number
  short: string
}

export interface CardDef {
  id: string
  name: string
  kind: CardKind
  /** Resource cost to play (paid unless housed free). */
  cost: Partial<Record<ResourceId, number>>
  /** Base victory points. */
  points: number
  /** For a critter: the construction NAME that houses it (play it free). */
  housedBy?: string
  /** For a construction: the critter NAME it houses (flavour / hint). */
  houses?: string
  /** Bonus: +N points per OTHER card in the city of this kind/name when scoring. */
  bonus?: { per: 'construction' | 'critter' | CardKind; points: number }
  short: string
}

export interface Player {
  id: number
  name: string
  city: string[]              // placed card ids (by catalogue id, may repeat)
  hand: string[]              // card ids in hand
  res: Record<ResourceId, number>
  workersTotal: number        // total workers available this season
  workersUsed: number         // workers currently placed
  season: Season
  points: number              // banked base card points (recomputed by scoreCity)
  done: boolean               // has finished Autumn
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface State {
  players: Player[]
  /** locationId -> array of player ids occupying it. */
  occ: Record<LocationId, number[]>
  /** The face-up card market (the "meadow"). */
  meadow: string[]
  /** Draw deck (card ids). */
  deck: string[]
  turn: number                // whose turn it is (0 you / 1 ai)
  winner: number | null
  log: LogEntry[]
}

// ---------- catalogue ----------

export const RESOURCES: ResourceId[] = ['twig', 'resin', 'pebble', 'berry']

export const SEASON_ORDER: Season[] = ['winter', 'spring', 'summer', 'autumn']

/** Relative value of a resource (AI valuation / tie heuristics). */
export const RES_VALUE: Record<ResourceId, number> = { twig: 1, resin: 2, pebble: 3, berry: 2 }

export const LOCATIONS: LocationDef[] = [
  { id: 'twigs',         name: 'Twig Grove',   gain: { twig: 3 },            cards: 0, slots: 99, short: '🪵' },
  { id: 'resins',        name: 'Resin Refuge',  gain: { resin: 2 },           cards: 0, slots: 99, short: '🟠' },
  { id: 'pebble',        name: 'Pebble Quarry', gain: { pebble: 1 },          cards: 0, slots: 1,  short: '⬜' },
  { id: 'berry',         name: 'Berry Bramble', gain: { berry: 1 },           cards: 0, slots: 1,  short: '🫐' },
  { id: 'twigResinCard', name: 'Forest Edge',   gain: { twig: 1, resin: 1 },  cards: 1, slots: 2,  short: '🌲' },
  { id: 'berryCard',     name: 'Sweet Glade',   gain: { berry: 1 },           cards: 1, slots: 2,  short: '🍯' },
  { id: 'twoCards',      name: 'Library',       gain: {},                     cards: 2, slots: 2,  short: '📚' },
  { id: 'pebbleCard',    name: 'Stone Path',    gain: { pebble: 1 },          cards: 1, slots: 1,  short: '🪨' },
]

export const LOCATION_BY_ID: Record<string, LocationDef> = Object.fromEntries(
  LOCATIONS.map(l => [l.id, l]),
)

const ALL_LOCATIONS: LocationId[] = LOCATIONS.map(l => l.id)

/* The card catalogue. Constructions house a paired critter (same flavour). A critter can
   be played FREE if its housing construction is already in the player's city. Costs are
   tuned for short games; points scale with cost. A few cards carry simple scoring bonuses. */
export const CARDS: CardDef[] = [
  // construction / critter pairs
  { id: 'farm',     name: 'Farm',         kind: 'construction', cost: { twig: 2, resin: 1 }, points: 1, houses: 'Husband', short: '🌾' },
  { id: 'husband',  name: 'Husband',      kind: 'critter',      cost: { berry: 2 },          points: 2, housedBy: 'Farm', short: '👨‍🌾' },
  { id: 'inn',      name: 'Inn',          kind: 'construction', cost: { twig: 2, resin: 1 }, points: 2, houses: 'Innkeeper', short: '🏨' },
  { id: 'innkeeper',name: 'Innkeeper',    kind: 'critter',      cost: { berry: 1 },          points: 1, housedBy: 'Inn', short: '🧑‍🍳' },
  { id: 'castle',   name: 'Castle',       kind: 'construction', cost: { twig: 2, resin: 3, pebble: 3 }, points: 4, houses: 'King', bonus: { per: 'construction', points: 1 }, short: '🏰' },
  { id: 'king',     name: 'King',         kind: 'critter',      cost: { berry: 6 },          points: 4, housedBy: 'Castle', bonus: { per: 'critter', points: 1 }, short: '🤴' },
  { id: 'theatre',  name: 'Theatre',      kind: 'construction', cost: { twig: 3, resin: 1, pebble: 1 }, points: 3, houses: 'Bard', short: '🎭' },
  { id: 'bard',     name: 'Bard',         kind: 'critter',      cost: { berry: 3 },          points: 0, housedBy: 'Theatre', bonus: { per: 'critter', points: 1 }, short: '🎶' },
  { id: 'mine',     name: 'Mine',         kind: 'construction', cost: { twig: 1, resin: 1, pebble: 1 }, points: 2, houses: 'Miner', short: '⛏️' },
  { id: 'miner',    name: 'Miner Mole',   kind: 'critter',      cost: { berry: 3 },          points: 2, housedBy: 'Mine', short: '🐭' },
  { id: 'school',   name: 'School',       kind: 'construction', cost: { twig: 2, resin: 2 }, points: 2, houses: 'Teacher', short: '🏫' },
  { id: 'teacher',  name: 'Teacher',      kind: 'critter',      cost: { berry: 2 },          points: 2, housedBy: 'School', short: '🦉' },
  { id: 'chapel',   name: 'Chapel',       kind: 'construction', cost: { twig: 2, resin: 1, pebble: 1 }, points: 2, houses: 'Shepherd', bonus: { per: 'construction', points: 1 }, short: '⛪' },
  { id: 'shepherd', name: 'Shepherd',     kind: 'critter',      cost: { berry: 3 },          points: 1, housedBy: 'Chapel', short: '🐑' },
  // standalone critters (no construction; modest cost)
  { id: 'wanderer', name: 'Wanderer',     kind: 'critter',      cost: { berry: 2 },          points: 1, short: '🚶' },
  { id: 'ranger',   name: 'Ranger',       kind: 'critter',      cost: { berry: 2 },          points: 2, short: '🏹' },
  { id: 'postal',   name: 'Postal Pigeon',kind: 'critter',      cost: { berry: 3 },          points: 3, short: '🐦' },
  // standalone constructions
  { id: 'storehouse', name: 'Storehouse',  kind: 'construction', cost: { twig: 1, resin: 1, pebble: 1 }, points: 2, short: '📦' },
  { id: 'evertree',   name: 'Evertree',    kind: 'construction', cost: { pebble: 3 },        points: 5, bonus: { per: 'construction', points: 1 }, short: '🌳' },
  { id: 'fountain',   name: 'Fountain',    kind: 'construction', cost: { resin: 2, pebble: 1 }, points: 3, short: '⛲' },
]

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map(c => [c.id, c]))

export const CITY_CAP = 15
const HAND_CAP = 8
const MEADOW_SIZE = 5
const START_WORKERS = 2
/** Workers gained when preparing into a new season: spring +1, summer +1, autumn +2. */
const SEASON_WORKER_GAIN: Record<Season, number> = { winter: 0, spring: 1, summer: 1, autumn: 2 }

// ---------- helpers ----------

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-40)
}

function clonePlayer(p: Player): Player {
  return { ...p, city: p.city.slice(), hand: p.hand.slice(), res: { ...p.res } }
}

function clone(s: State): State {
  const occ = {} as Record<LocationId, number[]>
  for (const k of ALL_LOCATIONS) occ[k] = s.occ[k].slice()
  return {
    players: s.players.map(clonePlayer),
    occ,
    meadow: s.meadow.slice(),
    deck: s.deck.slice(),
    turn: s.turn,
    winner: s.winner,
    log: s.log.slice(),
  }
}

// Seeded LCG shuffle so makeGame(seed) is reproducible.
function shuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice()
  let st = (seed >>> 0) || 1
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 0xffffffff }
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildDeck(seed: number | undefined): string[] {
  // ~5 copies of each card -> a big deck that never runs dry in a short game.
  const base: string[] = []
  for (const c of CARDS) for (let i = 0; i < 5; i++) base.push(c.id)
  return seed == null ? base : shuffle(base, seed)
}

function newPlayer(id: number, name: string, season: Season): Player {
  return {
    id, name,
    city: [],
    hand: [],
    res: { twig: 0, resin: 0, pebble: 0, berry: 0 },
    workersTotal: START_WORKERS,
    workersUsed: 0,
    season,
    points: 0,
    done: false,
  }
}

export function makeGame(seed?: number): State {
  const deck = buildDeck(seed)
  const occ = {} as Record<LocationId, number[]>
  for (const k of ALL_LOCATIONS) occ[k] = []

  const players = [newPlayer(0, 'You', 'winter'), newPlayer(1, 'Owl Sage', 'winter')]
  // Opening hand of 5 + a small starting resource stock so turn 1 has options.
  for (const p of players) {
    for (let i = 0; i < 5; i++) { const c = deck.shift(); if (c) p.hand.push(c) }
    p.res.twig = 2; p.res.resin = 1; p.res.berry = 1
  }
  const meadow: string[] = []
  for (let i = 0; i < MEADOW_SIZE; i++) { const c = deck.shift(); if (c) meadow.push(c) }

  return {
    players,
    occ,
    meadow,
    deck,
    turn: 0,
    winner: null,
    log: [{ t: 'sys', x: 'Build your woodland city through the four seasons. Most points wins.' }],
  }
}

// ---------- resource / cost ----------

export function canAfford(p: Player, cost: Partial<Record<ResourceId, number>>): boolean {
  for (const r of RESOURCES) if (p.res[r] < (cost[r] ?? 0)) return false
  return true
}

function payCost(p: Player, cost: Partial<Record<ResourceId, number>>): void {
  for (const r of RESOURCES) p.res[r] -= (cost[r] ?? 0)
}

/** Does the city contain a construction with the given NAME? (for free-critter rule). */
function cityHasConstruction(p: Player, name: string): boolean {
  return p.city.some(id => { const c = CARD_BY_ID[id]; return c && c.kind === 'construction' && c.name === name })
}

/** A critter is housed-free if its housing construction is in the city. */
export function isHousedFree(p: Player, card: CardDef): boolean {
  return card.kind === 'critter' && card.housedBy != null && cityHasConstruction(p, card.housedBy)
}

// ---------- worker placement ----------

export function freeSlots(s: State, loc: LocationId): number {
  return LOCATION_BY_ID[loc].slots - s.occ[loc].length
}

export function workersAvailable(p: Player): number {
  return p.workersTotal - p.workersUsed
}

export function canPlaceWorker(s: State, player: number, loc: LocationId): boolean {
  if (s.winner != null || s.turn !== player) return false
  const p = s.players[player]
  if (p.done) return false
  if (workersAvailable(p) <= 0) return false
  if (freeSlots(s, loc) <= 0) return false
  return true
}

function drawCards(s: State, p: Player, n: number): void {
  for (let i = 0; i < n; i++) {
    if (p.hand.length >= HAND_CAP) break
    const c = s.deck.shift()
    if (c == null) break
    p.hand.push(c)
  }
}

/** Place one of `player`'s workers on `loc`, granting its resources/cards. Passes turn. */
export function placeWorker(s: State, player: number, loc: LocationId): State {
  if (!canPlaceWorker(s, player, loc)) return s
  const out = clone(s)
  const p = out.players[player]
  const def = LOCATION_BY_ID[loc]
  out.occ[loc].push(player)
  p.workersUsed += 1
  for (const r of RESOURCES) if (def.gain[r]) p.res[r] += def.gain[r]!
  if (def.cards > 0) drawCards(out, p, def.cards)
  const gainTxt = describeGain(def)
  out.log = push(out.log, player === 0 ? 'you' : 'ai', `${p.name} worked the ${def.name} (${gainTxt}).`)
  passTurn(out)
  return out
}

function describeGain(def: LocationDef): string {
  const parts: string[] = []
  for (const r of RESOURCES) if (def.gain[r]) parts.push(`+${def.gain[r]} ${r}`)
  if (def.cards) parts.push(`+${def.cards} card${def.cards > 1 ? 's' : ''}`)
  return parts.join(', ') || 'nothing'
}

// ---------- play a card ----------

/** Where can a card be played from — hand or the meadow. We allow both. */
export function canPlayCard(s: State, player: number, cardId: string, fromMeadow = false): boolean {
  if (s.winner != null || s.turn !== player) return false
  const p = s.players[player]
  if (p.done) return false
  if (p.city.length >= CITY_CAP) return false
  const has = fromMeadow ? s.meadow.includes(cardId) : p.hand.includes(cardId)
  if (!has) return false
  const card = CARD_BY_ID[cardId]
  if (!card) return false
  if (isHousedFree(p, card)) return true
  return canAfford(p, card.cost)
}

/** Play `cardId` into `player`'s city (from hand by default), paying its cost OR free via
    its housing construction. Refills the meadow if played from there. Passes the turn. */
export function playCard(s: State, player: number, cardId: string, fromMeadow = false): State {
  if (!canPlayCard(s, player, cardId, fromMeadow)) return s
  const out = clone(s)
  const p = out.players[player]
  const card = CARD_BY_ID[cardId]
  const free = isHousedFree(p, card)
  if (!free) payCost(p, card.cost)
  // remove the played card from its source
  if (fromMeadow) {
    const idx = out.meadow.indexOf(cardId)
    if (idx >= 0) out.meadow.splice(idx, 1)
    const refill = out.deck.shift()
    if (refill != null) out.meadow.push(refill)
  } else {
    const idx = p.hand.indexOf(cardId)
    if (idx >= 0) p.hand.splice(idx, 1)
  }
  p.city.push(cardId)
  out.log = push(out.log, player === 0 ? 'you' : 'ai',
    `${p.name} built ${card.name}${free ? ' (free — housed)' : ''}.`)
  passTurn(out)
  return out
}

// ---------- prepare for next season ----------

/** Recall all of `player`'s workers and advance one season, gaining workers. If they were
    in AUTUMN they are now DONE. When both players are done the game ends. Passes turn. */
export function prepareSeason(s: State, player: number): State {
  if (s.winner != null || s.turn !== player) return s
  const p = s.players[player]
  if (p.done) return s
  const out = clone(s)
  const pp = out.players[player]

  // recall workers from every location
  for (const k of ALL_LOCATIONS) out.occ[k] = out.occ[k].filter(x => x !== player)
  pp.workersUsed = 0

  if (pp.season === 'autumn') {
    pp.done = true
    out.log = push(out.log, player === 0 ? 'you' : 'ai', `${pp.name} finished Autumn — their city is complete.`)
  } else {
    const idx = SEASON_ORDER.indexOf(pp.season)
    const next = SEASON_ORDER[idx + 1]
    pp.workersTotal += SEASON_WORKER_GAIN[next]
    pp.season = next
    // a fresh draw to start the new season
    drawCards(out, pp, 1)
    out.log = push(out.log, player === 0 ? 'you' : 'ai',
      `${pp.name} prepared for ${cap(next)} (+${SEASON_WORKER_GAIN[next]} worker, recalled all).`)
  }

  if (out.players.every(x => x.done)) {
    endGame(out)
    return out
  }
  passTurn(out)
  return out
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1) }

// ---------- turn flow ----------

/** Pass to the next player who is NOT done. If both are done, end the game. */
function passTurn(s: State): void {
  if (s.players.every(p => p.done)) { endGame(s); return }
  const other = s.turn === 0 ? 1 : 0
  if (!s.players[other].done) s.turn = other
  // else keep the current player (the other has finished); they keep going until done.
}

// ---------- scoring ----------

/** Score one city: base card points + bonus effects (per-card-kind). */
export function scoreCity(p: Player): number {
  let total = 0
  let constructions = 0, critters = 0
  for (const id of p.city) {
    const c = CARD_BY_ID[id]
    if (!c) continue
    total += c.points
    if (c.kind === 'construction') constructions++
    else critters++
  }
  // bonus pass: +N per OTHER card of the matching kind (excluding the bonus card itself).
  for (const id of p.city) {
    const c = CARD_BY_ID[id]
    if (!c || !c.bonus) continue
    const kind = c.bonus.per === 'construction' || c.bonus.per === 'critter' ? c.bonus.per : c.bonus.per
    if (kind === 'construction') total += c.bonus.points * Math.max(0, constructions - (c.kind === 'construction' ? 1 : 0))
    else total += c.bonus.points * Math.max(0, critters - (c.kind === 'critter' ? 1 : 0))
  }
  return total
}

function endGame(s: State): void {
  for (const p of s.players) p.points = scoreCity(p)
  const a = s.players[0].points, b = s.players[1].points
  s.winner = a >= b ? 0 : 1
  const w = s.players[s.winner]
  s.log = push(s.log, 'sys', `Final: You ${a} — ${s.players[1].name} ${b}. ${w.name} win${w.id === 0 ? '' : 's'}!`)
}

export const winner = (s: State): number | null => s.winner

// ---------- legal actions ----------

export type Action =
  | { type: 'place'; loc: LocationId }
  | { type: 'play'; cardId: string; fromMeadow: boolean }
  | { type: 'prepare' }

export function legalActions(s: State, player: number): Action[] {
  const acts: Action[] = []
  if (s.winner != null || s.turn !== player || s.players[player].done) return acts
  for (const l of LOCATIONS) if (canPlaceWorker(s, player, l.id)) acts.push({ type: 'place', loc: l.id })
  const p = s.players[player]
  const seenHand = new Set<string>()
  for (const id of p.hand) {
    if (seenHand.has(id)) continue
    seenHand.add(id)
    if (canPlayCard(s, player, id, false)) acts.push({ type: 'play', cardId: id, fromMeadow: false })
  }
  const seenMeadow = new Set<string>()
  for (const id of s.meadow) {
    if (seenMeadow.has(id)) continue
    seenMeadow.add(id)
    if (canPlayCard(s, player, id, true)) acts.push({ type: 'play', cardId: id, fromMeadow: true })
  }
  // Prepare is ALWAYS available (never a deadlock).
  acts.push({ type: 'prepare' })
  return acts
}

// ---------- AI ----------

/** Marginal score a card would add to the city right now (base + its own bonus growth). */
function cardValue(p: Player, card: CardDef): number {
  let v = card.points
  if (card.bonus) {
    const constructions = p.city.filter(id => CARD_BY_ID[id]?.kind === 'construction').length
    const critters = p.city.filter(id => CARD_BY_ID[id]?.kind === 'critter').length
    v += card.bonus.points * (card.bonus.per === 'construction' ? constructions + 1 : critters + 1)
  }
  return v
}

/** Greedy AI: play a free housed critter, else the best affordable card, else gather the
    resource it most needs, else prepare for the next season. Returns the resulting state. */
export function aiTurn(s: State): State {
  if (s.winner != null) return s
  const player = s.turn
  if (player !== 1) return s
  const p = s.players[player]
  if (p.done) return s

  const canBuild = p.city.length < CITY_CAP

  // 1) Best card to play this turn (prioritise FREE housed critters, then value).
  if (canBuild) {
    type Cand = { id: string; fromMeadow: boolean; free: boolean; val: number }
    const cands: Cand[] = []
    const consider = (id: string, fromMeadow: boolean) => {
      if (!canPlayCard(s, player, id, fromMeadow)) return
      const card = CARD_BY_ID[id]
      cands.push({ id, fromMeadow, free: isHousedFree(p, card), val: cardValue(p, card) })
    }
    for (const id of p.hand) consider(id, false)
    for (const id of s.meadow) consider(id, true)
    if (cands.length) {
      cands.sort((a, b) => (Number(b.free) - Number(a.free)) || (b.val - a.val))
      const pick = cands[0]
      // only build now if it's free OR a decent value; otherwise gather toward bigger cards
      if (pick.free || pick.val >= 1) return playCard(s, player, pick.id, pick.fromMeadow)
    }
  }

  // 2) If we still have a worker, gather the resource we most need to afford a hand card.
  if (workersAvailable(p) > 0) {
    const need: Record<ResourceId, number> = { twig: 0, resin: 0, pebble: 0, berry: 0 }
    for (const id of p.hand.concat(s.meadow)) {
      const card = CARD_BY_ID[id]
      if (!card || isHousedFree(p, card)) continue
      for (const r of RESOURCES) {
        const deficit = (card.cost[r] ?? 0) - p.res[r]
        if (deficit > 0) need[r] += deficit
      }
    }
    // choose the location yielding the most-needed resource (and cards as a mild plus).
    let bestLoc: LocationId | null = null
    let bestScore = -1
    for (const l of LOCATIONS) {
      if (freeSlots(s, l.id) <= 0) continue
      let score = l.cards * 0.5
      for (const r of RESOURCES) if (l.gain[r]) score += (l.gain[r]! * (need[r] > 0 ? 2 : 0.4))
      if (score > bestScore) { bestScore = score; bestLoc = l.id }
    }
    if (bestLoc) return placeWorker(s, player, bestLoc)
  }

  // 3) Nothing useful to do this season — prepare for the next.
  return prepareSeason(s, player)
}
