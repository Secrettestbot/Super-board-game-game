/* SEVEN WONDERS DUEL — pure logic (built for this codebase, not ported).
   A 2-player card-drafting civilization game: you (player 0) vs a greedy AI (player 1).

   Three AGES (0,1,2). Each age lays out a fixed PYRAMID of ~20 cards; some are
   face-down and only ACCESSIBLE cards (not covered by any card in the row below)
   may be drafted. On your turn you take ONE accessible card and either BUILD it
   (pay its resource cost from your production; missing resources are BOUGHT with
   coins at a market rate), DISCARD it for coins, or feed it to a WONDER (pay the
   wonder's cost, gain its effect).

   Win checks (in order): MILITARY supremacy (shared pawn reaches a capital),
   SCIENCE supremacy (6 distinct science symbols), else after Age III the most
   victory points. Resolution + all helpers are pure; deterministic setup is
   available for tests via makeGame({ noShuffle: true }).

   NO React/DOM.
*/

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type Resource = 'wood' | 'clay' | 'stone' | 'glass' | 'papyrus'
export const RESOURCES: Resource[] = ['wood', 'clay', 'stone', 'glass', 'papyrus']

export type Color = 'brown' | 'grey' | 'blue' | 'green' | 'yellow' | 'red' | 'purple'

/** The 6 distinct science symbols. Collecting all six = instant win. */
export type Science = 'wheel' | 'tablet' | 'gear' | 'compass' | 'pen' | 'mortar'
export const SCIENCES: Science[] = ['wheel', 'tablet', 'gear', 'compass', 'pen', 'mortar']

export type Cost = Partial<Record<Resource, number>>

export interface Card {
  id: string
  age: 0 | 1 | 2
  name: string
  color: Color
  cost: Cost
  /** Coin cost (yellow/markets sometimes have a coin price; usually 0). */
  coinCost?: number
  /** Resources this card produces (brown/grey). */
  produces?: Partial<Record<Resource, number>>
  /** Raw victory points (blue, purple base). */
  vp?: number
  /** Coins gained immediately on build (yellow). */
  coins?: number
  /** Military strength added to your side (red). */
  military?: number
  /** Science symbol granted (green). */
  science?: Science
  /** Guild scoring: VP per the opponent's count of a given color, end of game. */
  guildPer?: { color: Color; vp: number }
}

/** A slot in the age pyramid layout. */
export interface Slot {
  /** Index into this age's card list, or null if this physical slot is empty/taken. */
  cardId: string | null
  /** Face up (visible) or face down. Face-down cards flip when they become accessible. */
  faceUp: boolean
  /** Row in the pyramid (0 = top). */
  row: number
  /** Indices (into pyramid) of slots in the row below that cover this one. */
  covers: number[]
}

export interface Wonder {
  id: string
  name: string
  cost: Cost
  vp?: number
  coins?: number
  military?: number
  /** A wonder that grants an immediate extra turn (simplified: just a flag, not used for VP). */
  built: boolean
}

export interface PlayerState {
  /** Resources produced per turn (permanent, from brown/grey cards). */
  production: Record<Resource, number>
  coins: number
  /** Cards built, grouped/counted by color. */
  cardsByColor: Record<Color, number>
  /** Distinct science symbols collected (a set as a count map). */
  science: Record<Science, number>
  /** Progress tokens earned (from completing science pairs). Each = +3 VP here. */
  progressTokens: number
  /** Sum of raw VP from blue/purple cards + wonders. */
  vp: number
  /** Total military strength produced (red cards + wonders). */
  military: number
  wonders: Wonder[]
  /** Guild cards built (scored at end). */
  guilds: Card[]
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface SWDState {
  age: 0 | 1 | 2
  /** The current age's pyramid layout. */
  pyramid: Slot[]
  /** Lookup of all cards by id (across all ages, for reference). */
  cards: Record<string, Card>
  players: [PlayerState, PlayerState]
  /** Military pawn position: 0 = center. Positive = toward AI capital (you winning),
   *  negative = toward your capital (AI winning). Reaching +/-MILITARY_MAX = supremacy. */
  military: number
  /** Discard pile (cards discarded for coins). */
  discard: string[]
  turn: 0 | 1
  /** null = ongoing. */
  winner: 0 | 1 | null
  /** How the game ended (for the result banner). */
  winBy: 'military' | 'science' | 'civilian' | null
  /** Monotonic counter — bumped every applied action so the AI driver re-arms. */
  step: number
  log: LogEntry[]
}

export const MILITARY_MAX = 9 // pawn reaching +/-9 = capital captured
export const DISCARD_BASE_COINS = 2
export const BUY_RATE = 2 // coins per missing resource unit
export const PROGRESS_VP = 3

// ----------------------------------------------------------------------------
// Card data (trimmed but flavourful set; ~20 cards laid out per age)
// ----------------------------------------------------------------------------

function card(c: Card): Card { return c }

/* AGE I — cheap resources, basic VP, early military/science. */
const AGE1: Card[] = [
  card({ id: 'a1-lumber', age: 0, name: 'Lumber Yard', color: 'brown', cost: {}, produces: { wood: 1 } }),
  card({ id: 'a1-clay', age: 0, name: 'Clay Pit', color: 'brown', cost: {}, produces: { clay: 1 } }),
  card({ id: 'a1-quarry', age: 0, name: 'Stone Pit', color: 'brown', cost: {}, produces: { stone: 1 } }),
  card({ id: 'a1-wood2', age: 0, name: 'Sawmill', color: 'brown', cost: {}, coinCost: 1, produces: { wood: 1 } }),
  card({ id: 'a1-clay2', age: 0, name: 'Brickyard', color: 'brown', cost: {}, coinCost: 1, produces: { clay: 1 } }),
  card({ id: 'a1-glass', age: 0, name: 'Glassworks', color: 'grey', cost: {}, coinCost: 1, produces: { glass: 1 } }),
  card({ id: 'a1-press', age: 0, name: 'Press', color: 'grey', cost: {}, coinCost: 1, produces: { papyrus: 1 } }),
  card({ id: 'a1-baths', age: 0, name: 'Baths', color: 'blue', cost: { stone: 1 }, vp: 3 }),
  card({ id: 'a1-altar', age: 0, name: 'Altar', color: 'blue', cost: {}, vp: 3 }),
  card({ id: 'a1-theater', age: 0, name: 'Theater', color: 'blue', cost: {}, vp: 3 }),
  card({ id: 'a1-pharm', age: 0, name: 'Pharmacist', color: 'green', cost: { glass: 1 }, science: 'mortar' }),
  card({ id: 'a1-scrip', age: 0, name: 'Scriptorium', color: 'green', cost: { papyrus: 1 }, science: 'tablet' }),
  card({ id: 'a1-work', age: 0, name: 'Workshop', color: 'green', cost: { papyrus: 1 }, vp: 1, science: 'compass' }),
  card({ id: 'a1-apoth', age: 0, name: 'Apothecary', color: 'green', cost: { glass: 1 }, vp: 1, science: 'wheel' }),
  card({ id: 'a1-tavern', age: 0, name: 'Tavern', color: 'yellow', cost: {}, coins: 4 }),
  card({ id: 'a1-stable', age: 0, name: 'Stable', color: 'red', cost: { wood: 1 }, military: 1 }),
  card({ id: 'a1-garrison', age: 0, name: 'Garrison', color: 'red', cost: { clay: 1 }, military: 1 }),
  card({ id: 'a1-palisade', age: 0, name: 'Palisade', color: 'red', cost: {}, coinCost: 2, military: 1 }),
  card({ id: 'a1-guard', age: 0, name: 'Guard Tower', color: 'red', cost: { clay: 1 }, military: 1 }),
  card({ id: 'a1-market', age: 0, name: 'Trade Post', color: 'yellow', cost: {}, coins: 3 }),
]

/* AGE II — stronger production, blue VP, more science + military. */
const AGE2: Card[] = [
  card({ id: 'a2-sawmill', age: 1, name: 'Timber Mill', color: 'brown', cost: {}, coinCost: 2, produces: { wood: 2 } }),
  card({ id: 'a2-brick', age: 1, name: 'Brick Foundry', color: 'brown', cost: {}, coinCost: 2, produces: { clay: 2 } }),
  card({ id: 'a2-stone', age: 1, name: 'Masonry', color: 'brown', cost: {}, coinCost: 2, produces: { stone: 2 } }),
  card({ id: 'a2-glass', age: 1, name: 'Glassblower', color: 'grey', cost: {}, coinCost: 2, produces: { glass: 1 } }),
  card({ id: 'a2-press', age: 1, name: 'Printworks', color: 'grey', cost: {}, coinCost: 2, produces: { papyrus: 1 } }),
  card({ id: 'a2-courthouse', age: 1, name: 'Courthouse', color: 'blue', cost: { wood: 1, glass: 1 }, vp: 5 }),
  card({ id: 'a2-temple', age: 1, name: 'Temple', color: 'blue', cost: { wood: 1, papyrus: 1 }, vp: 4 }),
  card({ id: 'a2-statue', age: 1, name: 'Statue', color: 'blue', cost: { clay: 2 }, vp: 4 }),
  card({ id: 'a2-aqueduct', age: 1, name: 'Aqueduct', color: 'blue', cost: { stone: 3 }, vp: 5 }),
  card({ id: 'a2-disp', age: 1, name: 'Dispensary', color: 'green', cost: { clay: 2 }, science: 'mortar' }),
  card({ id: 'a2-lab', age: 1, name: 'Laboratory', color: 'green', cost: { wood: 1, glass: 1 }, science: 'gear' }),
  card({ id: 'a2-library', age: 1, name: 'Library', color: 'green', cost: { stone: 1, papyrus: 1 }, vp: 2, science: 'pen' }),
  card({ id: 'a2-school', age: 1, name: 'School', color: 'green', cost: { wood: 1, papyrus: 1 }, vp: 1, science: 'wheel' }),
  card({ id: 'a2-caravan', age: 1, name: 'Caravansery', color: 'yellow', cost: { glass: 1 }, coins: 5 }),
  card({ id: 'a2-forum', age: 1, name: 'Forum', color: 'yellow', cost: { clay: 1 }, coins: 4, vp: 1 }),
  card({ id: 'a2-walls', age: 1, name: 'City Walls', color: 'red', cost: { stone: 1 }, military: 2 }),
  card({ id: 'a2-barracks', age: 1, name: 'Barracks', color: 'red', cost: { clay: 1 }, military: 1 }),
  card({ id: 'a2-arch', age: 1, name: 'Archery Range', color: 'red', cost: { wood: 1, stone: 1 }, military: 2 }),
  card({ id: 'a2-horse', age: 1, name: 'Horse Breeders', color: 'red', cost: { clay: 1, wood: 1 }, military: 1 }),
  card({ id: 'a2-parade', age: 1, name: 'Parade Ground', color: 'red', cost: { clay: 2 }, military: 2 }),
]

/* AGE III — big VP, top science, guilds, decisive military. */
const AGE3: Card[] = [
  card({ id: 'a3-pantheon', age: 2, name: 'Pantheon', color: 'blue', cost: { clay: 2, papyrus: 1 }, vp: 6 }),
  card({ id: 'a3-gardens', age: 2, name: 'Gardens', color: 'blue', cost: { wood: 2, clay: 1 }, vp: 6 }),
  card({ id: 'a3-palace', age: 2, name: 'Palace', color: 'blue', cost: { stone: 1, glass: 2 }, vp: 7 }),
  card({ id: 'a3-senate', age: 2, name: 'Senate', color: 'blue', cost: { stone: 2, papyrus: 1 }, vp: 5 }),
  card({ id: 'a3-townhall', age: 2, name: 'Town Hall', color: 'blue', cost: { stone: 3, glass: 1 }, vp: 7 }),
  card({ id: 'a3-academy', age: 2, name: 'Academy', color: 'green', cost: { wood: 1, glass: 2 }, science: 'gear' }),
  card({ id: 'a3-study', age: 2, name: 'Study', color: 'green', cost: { wood: 2, papyrus: 1 }, science: 'pen' }),
  card({ id: 'a3-univ', age: 2, name: 'University', color: 'green', cost: { clay: 1, glass: 1, papyrus: 1 }, vp: 2, science: 'compass' }),
  card({ id: 'a3-obs', age: 2, name: 'Observatory', color: 'green', cost: { stone: 1, papyrus: 2 }, science: 'tablet' }),
  card({ id: 'a3-arena', age: 2, name: 'Arena', color: 'yellow', cost: { clay: 1, stone: 1 }, coins: 6, vp: 2 }),
  card({ id: 'a3-port', age: 2, name: 'Port', color: 'yellow', cost: { wood: 1, glass: 1 }, coins: 6, vp: 1 }),
  card({ id: 'a3-fort', age: 2, name: 'Fortifications', color: 'red', cost: { stone: 2, clay: 1 }, military: 3 }),
  card({ id: 'a3-siege', age: 2, name: 'Siege Workshop', color: 'red', cost: { wood: 2, clay: 1 }, military: 3 }),
  card({ id: 'a3-circus', age: 2, name: 'Circus', color: 'red', cost: { clay: 2, stone: 1 }, military: 2 }),
  card({ id: 'a3-academy2', age: 2, name: 'Arsenal', color: 'red', cost: { wood: 3 }, military: 3 }),
  card({ id: 'a3-merch-g', age: 2, name: 'Merchants Guild', color: 'purple', cost: { clay: 1, wood: 1, glass: 1 }, guildPer: { color: 'yellow', vp: 1 } }),
  card({ id: 'a3-mag-g', age: 2, name: 'Magistrates Guild', color: 'purple', cost: { wood: 1, stone: 1, papyrus: 1 }, guildPer: { color: 'blue', vp: 1 } }),
  card({ id: 'a3-build-g', age: 2, name: 'Builders Guild', color: 'purple', cost: { stone: 2, glass: 1 }, guildPer: { color: 'brown', vp: 1 } }),
  card({ id: 'a3-sci-g', age: 2, name: 'Scientists Guild', color: 'purple', cost: { clay: 2, papyrus: 1 }, guildPer: { color: 'green', vp: 1 } }),
  card({ id: 'a3-tac-g', age: 2, name: 'Tacticians Guild', color: 'purple', cost: { stone: 1, clay: 1, papyrus: 1 }, guildPer: { color: 'red', vp: 1 } }),
]

const ALL_CARDS = [...AGE1, ...AGE2, ...AGE3]

// ----------------------------------------------------------------------------
// Wonders (simplified set; each player gets 4)
// ----------------------------------------------------------------------------

function wonder(w: Omit<Wonder, 'built'>): Wonder { return { ...w, built: false } }

const WONDER_POOL: Omit<Wonder, 'built'>[] = [
  { id: 'w-pyramids', name: 'The Pyramids', cost: { stone: 3 }, vp: 9 },
  { id: 'w-colossus', name: 'The Colossus', cost: { clay: 3 }, military: 2, vp: 3 },
  { id: 'w-library', name: 'Great Library', cost: { wood: 3, glass: 1 }, vp: 4, coins: 0 },
  { id: 'w-mauso', name: 'The Mausoleum', cost: { clay: 2, glass: 2 }, vp: 2, coins: 6 },
  { id: 'w-temple', name: 'Temple of Artemis', cost: { wood: 1, stone: 1, papyrus: 1 }, coins: 12 },
  { id: 'w-circus', name: 'Circus Maximus', cost: { stone: 2, glass: 1 }, military: 1, vp: 3 },
  { id: 'w-zeus', name: 'Statue of Zeus', cost: { wood: 1, clay: 1, papyrus: 1 }, military: 2, vp: 3 },
  { id: 'w-gardens', name: 'Hanging Gardens', cost: { wood: 2, glass: 1 }, vp: 5, coins: 3 },
]

// ----------------------------------------------------------------------------
// Pyramid layouts (per age). Rows of slots; a slot is "covered" by the two slots
// directly below it. Only uncovered slots are accessible. Standard alternating
// face-up / face-down pattern. We build pyramids that consume exactly 20 cards.
// ----------------------------------------------------------------------------

/** Row sizes for each age's pyramid (sums to 20). Triangular-ish layouts. */
const ROW_SIZES: number[][] = [
  [2, 3, 4, 5, 6],       // Age I: 20
  [6, 5, 4, 3, 2],       // Age II: 20 (inverted)
  [2, 3, 4, 2, 4, 3, 2], // Age III: 20 (pyramid with a pinch — but keep coverage simple below)
]

/**
 * Build a pyramid for an age: assign cards to slots and compute coverage.
 * Coverage rule: a slot in row r at position i is covered by the slots in row r+1
 * whose horizontal span overlaps it. We use the classic 7WD scheme where each
 * upper card rests on the two cards beneath it. For simplicity and correctness we
 * compute coverage by horizontal overlap between rows.
 */
function buildPyramid(cards: Card[], rowSizes: number[]): Slot[] {
  const slots: Slot[] = []
  const rowStart: number[] = []
  let idx = 0
  for (let r = 0; r < rowSizes.length; r++) {
    rowStart.push(idx)
    for (let i = 0; i < rowSizes[r]; i++) {
      slots.push({
        cardId: cards[idx] ? cards[idx].id : null,
        // Alternate face-up rows; even rows face up, odd rows face down (will flip when exposed).
        faceUp: r % 2 === 0,
        row: r,
        covers: [],
      })
      idx++
    }
  }
  // Compute coverage by horizontal centre overlap between adjacent rows.
  for (let r = 0; r < rowSizes.length - 1; r++) {
    const upStart = rowStart[r]
    const upCount = rowSizes[r]
    const downStart = rowStart[r + 1]
    const downCount = rowSizes[r + 1]
    for (let i = 0; i < upCount; i++) {
      const upCentre = (i + 0.5) / upCount
      const covers: number[] = []
      for (let j = 0; j < downCount; j++) {
        const downCentre = (j + 0.5) / downCount
        // A lower card covers an upper card if their centres are within ~1 lower-card width.
        if (Math.abs(downCentre - upCentre) < (1 / downCount) * 0.75 + 1e-9) {
          covers.push(downStart + j)
        }
      }
      slots[upStart + i].covers = covers
    }
  }
  return slots
}

// ----------------------------------------------------------------------------
// Setup
// ----------------------------------------------------------------------------

export interface Setup {
  rng?: () => number
  noShuffle?: boolean
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

function zeroRes(): Record<Resource, number> {
  return { wood: 0, clay: 0, stone: 0, glass: 0, papyrus: 0 }
}
function zeroColors(): Record<Color, number> {
  return { brown: 0, grey: 0, blue: 0, green: 0, yellow: 0, red: 0, purple: 0 }
}
function zeroScience(): Record<Science, number> {
  return { wheel: 0, tablet: 0, gear: 0, compass: 0, pen: 0, mortar: 0 }
}

function emptyPlayer(wonders: Wonder[]): PlayerState {
  return {
    production: zeroRes(),
    coins: 7,
    cardsByColor: zeroColors(),
    science: zeroScience(),
    progressTokens: 0,
    vp: 0,
    military: 0,
    wonders,
    guilds: [],
  }
}

/** Lay out a fresh pyramid for the given age from that age's deck. */
function layoutAge(age: 0 | 1 | 2, rng: () => number, noShuffle: boolean): Slot[] {
  const pool = age === 0 ? AGE1 : age === 1 ? AGE2 : AGE3
  const deck = noShuffle ? pool.slice() : shuffle(pool, rng)
  return buildPyramid(deck, ROW_SIZES[age])
}

export function makeGame(setup: Setup = {}): SWDState {
  const rng = setup.rng ?? Math.random
  const noShuffle = !!setup.noShuffle
  const cards: Record<string, Card> = {}
  for (const c of ALL_CARDS) cards[c.id] = c

  const wpool = noShuffle ? WONDER_POOL.slice() : shuffle(WONDER_POOL, rng)
  const youWonders = wpool.slice(0, 4).map(wonder)
  const aiWonders = wpool.slice(4, 8).map(wonder)

  const s: SWDState = {
    age: 0,
    pyramid: layoutAge(0, rng, noShuffle),
    cards,
    players: [emptyPlayer(youWonders), emptyPlayer(aiWonders)],
    military: 0,
    discard: [],
    turn: 0,
    winner: null,
    winBy: null,
    step: 0,
    log: [{ t: 'sys', x: 'Age I begins. Draft accessible cards — build, discard, or raise a wonder.' }],
  }
  refreshFaceUp(s)
  return s
}

// ----------------------------------------------------------------------------
// Cloning
// ----------------------------------------------------------------------------

function clonePlayer(p: PlayerState): PlayerState {
  return {
    production: { ...p.production },
    coins: p.coins,
    cardsByColor: { ...p.cardsByColor },
    science: { ...p.science },
    progressTokens: p.progressTokens,
    vp: p.vp,
    military: p.military,
    wonders: p.wonders.map((w) => ({ ...w, cost: { ...w.cost } })),
    guilds: p.guilds.slice(),
  }
}

export function clone(s: SWDState): SWDState {
  return {
    age: s.age,
    pyramid: s.pyramid.map((sl) => ({ ...sl, covers: sl.covers.slice() })),
    cards: s.cards, // immutable reference data
    players: [clonePlayer(s.players[0]), clonePlayer(s.players[1])],
    military: s.military,
    discard: s.discard.slice(),
    turn: s.turn,
    winner: s.winner,
    winBy: s.winBy,
    step: s.step,
    log: s.log.slice(),
  }
}

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-24)
}

const who = (p: 0 | 1) => (p === 0 ? 'You' : 'AI')

// ----------------------------------------------------------------------------
// Accessibility
// ----------------------------------------------------------------------------

/** A slot is accessible if it holds a card and none of its covering slots still hold a card. */
function slotAccessible(s: SWDState, slotIdx: number): boolean {
  const sl = s.pyramid[slotIdx]
  if (!sl || sl.cardId == null) return false
  for (const c of sl.covers) {
    if (s.pyramid[c] && s.pyramid[c].cardId != null) return false
  }
  return true
}

/** Flip any now-accessible face-down slot to face up. Mutates s.pyramid. */
function refreshFaceUp(s: SWDState): void {
  for (let i = 0; i < s.pyramid.length; i++) {
    if (s.pyramid[i].cardId != null && slotAccessible(s, i)) s.pyramid[i].faceUp = true
  }
}

/** All cards currently draftable (accessible) in the pyramid. */
export function accessibleCards(s: SWDState): Card[] {
  const out: Card[] = []
  for (let i = 0; i < s.pyramid.length; i++) {
    if (slotAccessible(s, i)) {
      const id = s.pyramid[i].cardId!
      out.push(s.cards[id])
    }
  }
  return out
}

/** The slot index holding a given card id, or -1. */
function slotOf(s: SWDState, cardId: string): number {
  return s.pyramid.findIndex((sl) => sl.cardId === cardId)
}

/** Is this specific card currently accessible? */
export function isAccessible(s: SWDState, cardId: string): boolean {
  const i = slotOf(s, cardId)
  return i >= 0 && slotAccessible(s, i)
}

// ----------------------------------------------------------------------------
// Cost / affordability
// ----------------------------------------------------------------------------

/** Coins the player must spend to cover a resource cost given their production. */
export function coinsToCover(p: PlayerState, cost: Cost): number {
  let coins = 0
  for (const r of RESOURCES) {
    const need = (cost[r] ?? 0) - p.production[r]
    if (need > 0) coins += need * BUY_RATE
  }
  return coins
}

/** Total coins required to acquire a card (resource shortfall * rate + any coin cost). */
export function cardCoinCost(p: PlayerState, card: Card): number {
  return coinsToCover(p, card.cost) + (card.coinCost ?? 0)
}

/** Can the player afford to BUILD this card? */
export function canAfford(s: SWDState, player: 0 | 1, card: Card): boolean {
  const p = s.players[player]
  return p.coins >= cardCoinCost(p, card)
}

/** Can the player afford to build the given wonder using the drafted card? */
export function canAffordWonder(s: SWDState, player: 0 | 1, w: Wonder): boolean {
  if (w.built) return false
  const p = s.players[player]
  return p.coins >= coinsToCover(p, w.cost)
}

// ----------------------------------------------------------------------------
// Science
// ----------------------------------------------------------------------------

/** Number of DISTINCT science symbols a player holds. 6 = instant win. */
export function distinctScience(p: PlayerState): number {
  let n = 0
  for (const sym of SCIENCES) if (p.science[sym] > 0) n++
  return n
}

/** Total science pairs completed (each pair => a progress token). Computed incrementally on gain. */
function symbolPairsAt(count: number): number {
  return Math.floor(count / 2)
}

/** Has anyone reached the 6-distinct-science win? Returns the player or null. */
export function checkScienceWin(s: SWDState): 0 | 1 | null {
  if (distinctScience(s.players[0]) >= 6) return 0
  if (distinctScience(s.players[1]) >= 6) return 1
  return null
}

// ----------------------------------------------------------------------------
// Military
// ----------------------------------------------------------------------------

/**
 * Advance the shared military pawn. `dir` = +1 toward AI capital (you attacking),
 * -1 toward your capital. Returns NEW state with the pawn moved + win check.
 */
export function advanceMilitary(s: SWDState, dir: 1 | -1, amount: number): SWDState {
  const ns = clone(s)
  ns.military += dir * amount
  if (ns.military > MILITARY_MAX) ns.military = MILITARY_MAX
  if (ns.military < -MILITARY_MAX) ns.military = -MILITARY_MAX
  if (ns.military >= MILITARY_MAX) { ns.winner = 0; ns.winBy = 'military' }
  else if (ns.military <= -MILITARY_MAX) { ns.winner = 1; ns.winBy = 'military' }
  return ns
}

/** Re-derive the pawn from total military of both sides (used after a military build). Mutates. */
function applyMilitary(ns: SWDState, player: 0 | 1, added: number): void {
  // Player 0's military pushes pawn toward +MAX (AI capital); player 1's toward -MAX.
  if (added <= 0) return
  ns.military += player === 0 ? added : -added
  if (ns.military > MILITARY_MAX) ns.military = MILITARY_MAX
  if (ns.military < -MILITARY_MAX) ns.military = -MILITARY_MAX
}

// ----------------------------------------------------------------------------
// Drafting actions
// ----------------------------------------------------------------------------

/** Remove a card from the pyramid (it was drafted) and reveal newly-exposed cards. Mutates. */
function takeFromPyramid(ns: SWDState, cardId: string): void {
  const i = slotOf(ns, cardId)
  if (i >= 0) ns.pyramid[i] = { ...ns.pyramid[i], cardId: null }
  refreshFaceUp(ns)
}

/** Apply a built card's effects to the current player. Mutates ns. */
function applyCardEffects(ns: SWDState, player: 0 | 1, card: Card): void {
  const p = ns.players[player]
  p.cardsByColor[card.color]++
  if (card.produces) for (const r of RESOURCES) p.production[r] += card.produces[r] ?? 0
  if (card.vp) p.vp += card.vp
  if (card.coins) p.coins += card.coins
  if (card.military) {
    p.military += card.military
    applyMilitary(ns, player, card.military)
  }
  if (card.science) {
    const before = p.science[card.science]
    p.science[card.science] = before + 1
    // Completing a pair of the SAME symbol grants a progress token.
    const beforeAll = totalScienceSymbols(p) - 1
    if (symbolPairsAt(beforeAll + 1) > symbolPairsAt(beforeAll)) {
      p.progressTokens++
      p.vp += PROGRESS_VP
    }
  }
  if (card.guildPer) p.guilds.push(card)
}

function totalScienceSymbols(p: PlayerState): number {
  let n = 0
  for (const sym of SCIENCES) n += p.science[sym]
  return n
}

/** Pay the coin cost of a build (resource shortfall + coinCost). Mutates. */
function payForCard(ns: SWDState, player: 0 | 1, card: Card): void {
  ns.players[player].coins -= cardCoinCost(ns.players[player], card)
}

/** BUILD a drafted accessible card. Returns NEW state (input unchanged if illegal). */
export function buildCard(s: SWDState, cardId: string): SWDState {
  if (s.winner != null) return s
  if (!isAccessible(s, cardId)) return s
  const card = s.cards[cardId]
  const cur = s.turn
  if (!canAfford(s, cur, card)) return s

  const ns = clone(s)
  payForCard(ns, cur, card)
  applyCardEffects(ns, cur, card)
  takeFromPyramid(ns, cardId)
  ns.log = push(ns.log, cur === 0 ? 'you' : 'ai', `${who(cur)} built ${card.name}.`)
  return finishTurn(ns)
}

/** DISCARD a drafted accessible card for coins. */
export function discardForCoins(s: SWDState, cardId: string): SWDState {
  if (s.winner != null) return s
  if (!isAccessible(s, cardId)) return s
  const cur = s.turn
  const card = s.cards[cardId]
  const ns = clone(s)
  // Discard yields base coins + 1 per yellow card already built (commerce bonus).
  const gain = DISCARD_BASE_COINS + ns.players[cur].cardsByColor.yellow
  ns.players[cur].coins += gain
  ns.discard.push(cardId)
  takeFromPyramid(ns, cardId)
  ns.log = push(ns.log, cur === 0 ? 'you' : 'ai', `${who(cur)} discarded ${card.name} for ${gain} coins.`)
  return finishTurn(ns)
}

/** Use a drafted accessible card to BUILD a wonder. */
export function buildWonder(s: SWDState, cardId: string, wonderId: string): SWDState {
  if (s.winner != null) return s
  if (!isAccessible(s, cardId)) return s
  const cur = s.turn
  const w = s.players[cur].wonders.find((x) => x.id === wonderId)
  if (!w || w.built) return s
  if (!canAffordWonder(s, cur, w)) return s

  const ns = clone(s)
  const p = ns.players[cur]
  p.coins -= coinsToCover(p, w.cost)
  const nw = p.wonders.find((x) => x.id === wonderId)!
  nw.built = true
  if (nw.vp) p.vp += nw.vp
  if (nw.coins) p.coins += nw.coins
  if (nw.military) {
    p.military += nw.military
    applyMilitary(ns, cur, nw.military)
  }
  takeFromPyramid(ns, cardId)
  ns.log = push(ns.log, cur === 0 ? 'you' : 'ai', `${who(cur)} raised ${nw.name}!`)
  return finishTurn(ns)
}

// ----------------------------------------------------------------------------
// Turn flow + age progression + win resolution
// ----------------------------------------------------------------------------

/** True if the current pyramid is fully drafted (no cards remain). */
function ageComplete(s: SWDState): boolean {
  return s.pyramid.every((sl) => sl.cardId == null)
}

/** Resolve win checks (military already applied inline) + advance turn/age. Mutates+returns. */
function finishTurn(ns: SWDState): SWDState {
  ns.step++

  // 1) Military supremacy.
  if (ns.military >= MILITARY_MAX) {
    ns.winner = 0; ns.winBy = 'military'
    ns.log = push(ns.log, 'you', 'You captured the enemy capital — military victory!')
    return ns
  }
  if (ns.military <= -MILITARY_MAX) {
    ns.winner = 1; ns.winBy = 'military'
    ns.log = push(ns.log, 'ai', 'The AI captured your capital — military defeat.')
    return ns
  }

  // 2) Science supremacy.
  const sci = checkScienceWin(ns)
  if (sci != null) {
    ns.winner = sci; ns.winBy = 'science'
    ns.log = push(ns.log, sci === 0 ? 'you' : 'ai', `${who(sci)} mastered all six sciences — scientific victory!`)
    return ns
  }

  // 3) Age complete?
  if (ageComplete(ns)) {
    if (ns.age < 2) {
      const nextAge = (ns.age + 1) as 0 | 1 | 2
      ns.age = nextAge
      ns.pyramid = layoutAge(nextAge, Math.random, false)
      refreshFaceUp(ns)
      ns.log = push(ns.log, 'sys', `Age ${nextAge === 1 ? 'II' : 'III'} begins.`)
      // The player who would have moved next continues (alternate turn anyway).
      ns.turn = ns.turn === 0 ? 1 : 0
      return ns
    }
    // After Age III: civilian victory by VP.
    const w = scoreWinner(ns)
    ns.winner = w
    ns.winBy = 'civilian'
    const sc0 = scoreVP(ns, 0), sc1 = scoreVP(ns, 1)
    ns.log = push(ns.log, w === 0 ? 'you' : 'ai', `Final tally — You ${sc0} · AI ${sc1}.`)
    return ns
  }

  // 4) Normal alternation.
  ns.turn = ns.turn === 0 ? 1 : 0
  return ns
}

/** Compute a player's total victory points (end-of-game civilian scoring). */
export function scoreVP(s: SWDState, player: 0 | 1): number {
  const p = s.players[player]
  const opp = s.players[player === 0 ? 1 : 0]
  let total = p.vp // blue + purple base + wonder VP + progress tokens already folded in
  // Coins -> 1 VP per 3 coins.
  total += Math.floor(p.coins / 3)
  // Guild scoring: VP per opponent's count of a color.
  for (const g of p.guilds) {
    if (g.guildPer) total += opp.cardsByColor[g.guildPer.color] * g.guildPer.vp
  }
  // Military lead bonus at game end (if pawn favours this player but no capture).
  if (player === 0 && s.military > 0) total += Math.min(s.military, MILITARY_MAX - 1)
  if (player === 1 && s.military < 0) total += Math.min(-s.military, MILITARY_MAX - 1)
  return total
}

/** Decide civilian winner by VP (tie -> more coins -> player 0). */
function scoreWinner(s: SWDState): 0 | 1 {
  const a = scoreVP(s, 0), b = scoreVP(s, 1)
  if (a !== b) return a > b ? 0 : 1
  if (s.players[0].coins !== s.players[1].coins) return s.players[0].coins > s.players[1].coins ? 0 : 1
  return 0
}

/** Public winner accessor (mirrors state). */
export function winner(s: SWDState): 0 | 1 | null {
  return s.winner
}

// ----------------------------------------------------------------------------
// AI — greedy heuristic
// ----------------------------------------------------------------------------

interface Move {
  kind: 'build' | 'wonder' | 'discard'
  cardId: string
  wonderId?: string
  score: number
}

/** Heuristic score for the AI (player 1) of building a particular card. */
function aiBuildScore(s: SWDState, card: Card): number {
  const me = s.players[1]
  const you = s.players[0]
  let score = 0

  // Raw VP is good.
  score += (card.vp ?? 0) * 2.5

  // Resource production: valuable early, less so later.
  if (card.produces) {
    let prod = 0
    for (const r of RESOURCES) prod += card.produces[r] ?? 0
    score += prod * (s.age === 0 ? 3 : s.age === 1 ? 2 : 0.8)
  }

  // Coins are mildly useful (enable future buys).
  score += (card.coins ?? 0) * 0.5

  // Military: more urgent the closer the pawn is to OUR capital (military < 0 = AI winning).
  if (card.military) {
    const dangerToUs = Math.max(0, MILITARY_MAX - 1 + s.military) // larger when pawn near our capital? invert
    // When pawn is negative (AI winning) we want to push more; when near +MAX (we're losing) push hard.
    const losing = s.military // positive = you winning => AI threatened
    const urgency = 2 + Math.max(0, losing) * 0.6
    score += card.military * urgency
    void dangerToUs
  }

  // Science: collecting toward distinct-6 win, and pairs (progress tokens).
  if (card.science) {
    const have = me.science[card.science]
    if (have === 0) {
      const distinct = distinctScience(me)
      score += 3 + distinct * 1.5 // each new distinct symbol pushes toward the instant win
      if (distinct >= 4) score += 8 // very close to science victory: prioritise
    } else {
      score += 2 // completes a pair -> progress token (+3 VP)
    }
  }

  // Deny the opponent's science instant-win: if you (player 0) are at 5 distinct, grab it.
  if (card.science && you.science[card.science] === 0 && distinctScience(you) >= 4) {
    score += 6
  }

  // Guilds score late.
  if (card.guildPer) {
    const oppCount = you.cardsByColor[card.guildPer.color]
    score += oppCount * card.guildPer.vp * 1.5 + 1
  }

  // Penalise spending coins (resource shortfall is expensive).
  score -= cardCoinCost(me, card) * 0.4

  return score
}

/** Best wonder the AI could build with a given drafted card; returns score or -Infinity. */
function aiWonderScore(s: SWDState, w: Wonder): number {
  if (!canAffordWonder(s, 1, w)) return -Infinity
  const me = s.players[1]
  let score = (w.vp ?? 0) * 2.2 + (w.coins ?? 0) * 0.4
  if (w.military) {
    const losing = s.military
    score += w.military * (2.5 + Math.max(0, losing) * 0.6)
  }
  score -= coinsToCover(me, w.cost) * 0.4
  // Wonders are scarce — small base bonus to encourage using them on weak cards.
  score += 1.5
  return score
}

/** Compute the AI's best move over all accessible cards. */
function aiBestMove(s: SWDState): Move | null {
  const cards = accessibleCards(s)
  if (cards.length === 0) return null
  let best: Move | null = null

  for (const card of cards) {
    // Option A: build the card (if affordable).
    if (canAfford(s, 1, card)) {
      const sc = aiBuildScore(s, card)
      if (!best || sc > best.score) best = { kind: 'build', cardId: card.id, score: sc }
    }
    // Option B: use it to raise a wonder.
    for (const w of s.players[1].wonders) {
      if (w.built) continue
      const ws = aiWonderScore(s, w)
      if (ws > -Infinity) {
        // Bonus if this card is otherwise unbuildable / low value (good to spend on wonder).
        const buildable = canAfford(s, 1, card)
        const adj = ws + (buildable ? 0 : 1)
        if (!best || adj > best.score) best = { kind: 'wonder', cardId: card.id, wonderId: w.id, score: adj }
      }
    }
    // Option C: discard for coins (fallback value).
    const discGain = DISCARD_BASE_COINS + s.players[1].cardsByColor.yellow
    const discScore = discGain * 0.45 - 1
    if (!best || discScore > best.score) {
      // Prefer to discard the *weakest* card (lowest build score) when discarding.
      best = { kind: 'discard', cardId: card.id, score: discScore }
    }
  }

  // For discards, pick the genuinely weakest accessible card rather than the last-seen.
  if (best && best.kind === 'discard') {
    let worstId = cards[0].id
    let worst = Infinity
    for (const card of cards) {
      // We can always discard; choose lowest potential value to keep good cards from us.
      const v = canAfford(s, 1, card) ? aiBuildScore(s, card) : -2
      if (v < worst) { worst = v; worstId = card.id }
    }
    best = { ...best, cardId: worstId }
  }
  return best
}

/** Execute ONE AI action. Returns a NEW state. Guarantees progress (always drafts a card). */
export function aiTurn(s: SWDState): SWDState {
  if (s.winner != null || s.turn !== 1) return s
  const move = aiBestMove(s)
  if (!move) {
    // No accessible cards (shouldn't happen mid-age) — nudge turn to avoid stall.
    return finishTurn(clone(s))
  }
  if (move.kind === 'build') return buildCard(s, move.cardId)
  if (move.kind === 'wonder' && move.wonderId) return buildWonder(s, move.cardId, move.wonderId)
  return discardForCoins(s, move.cardId)
}
