/* STAR REALMS — pure logic (2-player deckbuilding duel; immutable-ish, no DOM).
   You (player 0) vs the AI (player 1). Each player starts at 50 AUTHORITY with a 10-card
   personal deck (8 Scout + 2 Viper). On your turn you play your whole hand, accumulating
   TRADE (gold) and COMBAT (damage), buy cards from a shared 5-card TRADE ROW (or the
   always-available Explorer), then spend Combat on the opponent's bases / authority.
   Ships go to discard at end of turn; bases stay in play. Reduce a foe to 0 to win.

   Randomness is injectable/guarded for deterministic tests: pass a seed to makeGame() and
   all shuffles use a seeded PRNG carried on the state. */

export type Player = 0 | 1
export type Faction = 'trade' | 'blob' | 'star' | 'machine' | 'neutral'
export type CardType = 'ship' | 'base'

export interface CardDef {
  key: string
  name: string
  faction: Faction
  type: CardType
  cost: number            // trade cost to buy (0 for starters)
  defense?: number        // bases only
  outpost?: boolean       // bases only — must be destroyed before face damage
  // primary (always) effects
  trade?: number
  combat?: number
  authority?: number
  draw?: number
  // ally effects (apply if 2+ of this faction played this turn)
  allyTrade?: number
  allyCombat?: number
  allyAuthority?: number
  allyDraw?: number
  blurb: string
}

// ---- card catalogue ----------------------------------------------------------
export const CARDS: Record<string, CardDef> = {
  scout:   { key: 'scout',   name: 'Scout',   faction: 'neutral', type: 'ship', cost: 0, trade: 1,  blurb: '+1 Trade' },
  viper:   { key: 'viper',   name: 'Viper',   faction: 'neutral', type: 'ship', cost: 0, combat: 1, blurb: '+1 Combat' },
  explorer:{ key: 'explorer',name: 'Explorer',faction: 'neutral', type: 'ship', cost: 2, trade: 2,  blurb: '+2 Trade · scrap for +2 Combat' },

  // Trade Federation — authority & trade
  fed_cutter:  { key: 'fed_cutter',  name: 'Federation Shuttle', faction: 'trade', type: 'ship', cost: 2, trade: 2, authority: 4, allyCombat: 4, blurb: '+2 Trade, +4 Authority · ally +4 Combat' },
  fed_corvette:{ key: 'fed_corvette',name: 'Cutter',             faction: 'trade', type: 'ship', cost: 3, trade: 2, combat: 1, allyDraw: 1, blurb: '+2 Trade, +1 Combat · ally draw 1' },
  fed_trade_bot:{key: 'fed_trade_bot',name: 'Trade Bot',         faction: 'trade', type: 'ship', cost: 1, trade: 1, authority: 1, allyCombat: 2, blurb: '+1 Trade, +1 Authority · ally +2 Combat' },
  fed_outpost: { key: 'fed_outpost', name: 'Trading Post',       faction: 'trade', type: 'base', cost: 3, defense: 4, outpost: true, trade: 1, allyCombat: 1, blurb: 'Outpost (4) · +1 Trade · ally +1 Combat' },
  fed_bank:    { key: 'fed_bank',    name: 'Defense Center',      faction: 'trade', type: 'base', cost: 5, defense: 5, outpost: true, authority: 3, allyCombat: 2, blurb: 'Outpost (5) · +3 Authority · ally +2 Combat' },

  // Blob — combat & scrap
  blob_fighter:{ key: 'blob_fighter',name: 'Blob Fighter',       faction: 'blob', type: 'ship', cost: 1, combat: 3, allyDraw: 1, blurb: '+3 Combat · ally draw 1' },
  blob_ravager:{ key: 'blob_ravager',name: 'Ravager',            faction: 'blob', type: 'ship', cost: 4, combat: 6, allyDraw: 1, blurb: '+6 Combat · ally draw 1' },
  blob_destroyer:{key:'blob_destroyer',name:'Blob Destroyer',    faction: 'blob', type: 'ship', cost: 4, combat: 6, allyCombat: 0, allyDraw: 0, blurb: '+6 Combat' },
  blob_wheel:  { key: 'blob_wheel',  name: 'Battle Pod',         faction: 'blob', type: 'ship', cost: 2, combat: 4, allyCombat: 2, blurb: '+4 Combat · ally +2 Combat' },
  blob_world:  { key: 'blob_world',  name: 'Blob Wheel',         faction: 'blob', type: 'base', cost: 3, defense: 5, outpost: false, combat: 1, allyTrade: 3, blurb: 'Base (5) · +1 Combat · ally +3 Trade' },

  // Star Empire — combat & draw
  star_corvette:{key: 'star_corvette',name: 'Imperial Fighter',  faction: 'star', type: 'ship', cost: 1, combat: 2, draw: 1, allyCombat: 2, blurb: '+2 Combat, draw 1 · ally +2 Combat' },
  star_frigate: {key: 'star_frigate', name: 'Imperial Frigate',  faction: 'star', type: 'ship', cost: 3, combat: 4, draw: 1, allyCombat: 2, blurb: '+4 Combat, draw 1 · ally +2 Combat' },
  star_cruiser: {key: 'star_cruiser', name: 'Survey Ship',       faction: 'star', type: 'ship', cost: 3, trade: 1, draw: 1, allyCombat: 2, blurb: '+1 Trade, draw 1 · ally +2 Combat' },
  star_battle:  {key: 'star_battle',  name: 'Battlecruiser',     faction: 'star', type: 'ship', cost: 6, combat: 5, draw: 1, allyDraw: 1, blurb: '+5 Combat, draw 1 · ally draw 1' },
  star_outpost: {key: 'star_outpost', name: 'Recycling Station', faction: 'star', type: 'base', cost: 4, defense: 4, outpost: true, trade: 1, allyCombat: 0, blurb: 'Outpost (4) · +1 Trade' },
  star_base:    {key: 'star_base',    name: 'Imperial Palace',   faction: 'star', type: 'base', cost: 6, defense: 6, outpost: true, combat: 2, allyDraw: 1, blurb: 'Outpost (6) · +2 Combat · ally draw 1' },

  // Machine Cult — scrap & heal
  mech_drone:  { key: 'mech_drone',  name: 'Trade Bot Mk II',    faction: 'machine', type: 'ship', cost: 1, combat: 2, authority: 1, allyAuthority: 2, blurb: '+2 Combat, +1 Authority · ally +2 Authority' },
  mech_patrol: { key: 'mech_patrol', name: 'Patrol Mech',        faction: 'machine', type: 'ship', cost: 4, trade: 3, combat: 5, allyCombat: 0, blurb: '+3 Trade or fight: +3 Trade, +5 Combat' },
  mech_repair: { key: 'mech_repair', name: 'Repair Bot',         faction: 'machine', type: 'ship', cost: 2, authority: 3, combat: 1, allyAuthority: 2, blurb: '+1 Combat, +3 Authority · ally +2 Authority' },
  mech_forge:  { key: 'mech_forge',  name: 'Stealth Needle',     faction: 'machine', type: 'ship', cost: 4, combat: 4, draw: 1, allyAuthority: 2, blurb: '+4 Combat, draw 1 · ally +2 Authority' },
  mech_base:   { key: 'mech_base',   name: 'Machine Base',       faction: 'machine', type: 'base', cost: 5, defense: 6, outpost: true, combat: 3, allyAuthority: 3, blurb: 'Outpost (6) · +3 Combat · ally +3 Authority' },
  mech_wall:   { key: 'mech_wall',   name: 'Junkyard',           faction: 'machine', type: 'base', cost: 3, defense: 5, outpost: false, authority: 2, allyCombat: 2, blurb: 'Base (5) · +2 Authority · ally +2 Combat' },
}

export const FACTION_NAME: Record<Faction, string> = {
  trade: 'Trade Federation', blob: 'Blob', star: 'Star Empire', machine: 'Machine Cult', neutral: 'Unaligned',
}

// The trade deck composition (keys, with counts). ~36 cards across the 4 factions + bases.
const TRADE_DECK_COMPOSITION: Array<[string, number]> = [
  ['fed_cutter', 2], ['fed_corvette', 2], ['fed_trade_bot', 2], ['fed_outpost', 1], ['fed_bank', 1],
  ['blob_fighter', 3], ['blob_ravager', 1], ['blob_destroyer', 1], ['blob_wheel', 2], ['blob_world', 1],
  ['star_corvette', 3], ['star_frigate', 2], ['star_cruiser', 2], ['star_battle', 1], ['star_outpost', 1], ['star_base', 1],
  ['mech_drone', 2], ['mech_patrol', 1], ['mech_repair', 2], ['mech_forge', 1], ['mech_base', 1], ['mech_wall', 1],
]

export const START_AUTHORITY = 50
export const TRADE_ROW_SIZE = 5
export const HAND_SIZE = 5

// ---- instance model ----------------------------------------------------------
let CARD_UID = 1
export interface CardInst { id: number; key: string }
function inst(key: string): CardInst { return { id: CARD_UID++, key } }
export const def = (c: CardInst): CardDef => CARDS[c.key]

export interface PlayerState {
  authority: number
  deck: CardInst[]        // draw pile (top = last element)
  hand: CardInst[]
  discard: CardInst[]
  inPlay: CardInst[]      // ships + bases played this turn / bases persisting
  bases: CardInst[]       // bases currently in play (persist across turns)
}

export interface LogEntry { t: string; x: string }   // t: 'you'|'ai'|'sys'

export interface StarRealmsState {
  players: [PlayerState, PlayerState]
  tradeDeck: CardInst[]
  tradeRow: (CardInst | null)[]
  explorerCount: number
  turn: Player
  trade: number           // current player's trade pool this turn
  combat: number          // current player's combat pool this turn
  playedFactions: Record<Faction, number>   // counts of factions played this turn (incl. bases)
  firstTurn: boolean      // player 0's very first turn (smaller draw)
  winner: Player | null
  rng: number             // seeded PRNG state; carried & advanced
  seeded: boolean
  log: LogEntry[]
  actions: number         // monotonic action counter for UI tick
}

// ---- seeded RNG (mulberry32) -------------------------------------------------
function nextRand(s: StarRealmsState): number {
  if (!s.seeded) return Math.random()
  let t = (s.rng + 0x6d2b79f5) | 0
  s.rng = t
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function shuffle<T>(a: T[], s: StarRealmsState): T[] {
  const r = a.slice()
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand(s) * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

// ---- construction ------------------------------------------------------------
function starterDeck(): CardInst[] {
  const d: CardInst[] = []
  for (let i = 0; i < 8; i++) d.push(inst('scout'))
  for (let i = 0; i < 2; i++) d.push(inst('viper'))
  return d
}

function freshPlayer(): PlayerState {
  return { authority: START_AUTHORITY, deck: [], hand: [], discard: [], inPlay: [], bases: [] }
}

function buildTradeDeck(): CardInst[] {
  const d: CardInst[] = []
  for (const [key, n] of TRADE_DECK_COMPOSITION) for (let i = 0; i < n; i++) d.push(inst(key))
  return d
}

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-40)
}

export function makeGame(seed?: number): StarRealmsState {
  CARD_UID = 1
  const s: StarRealmsState = {
    players: [freshPlayer(), freshPlayer()],
    tradeDeck: [],
    tradeRow: [],
    explorerCount: 10,
    turn: 0,
    trade: 0,
    combat: 0,
    playedFactions: emptyFactions(),
    firstTurn: true,
    winner: null,
    rng: (seed ?? 0) | 0,
    seeded: seed != null,
    log: [],
    actions: 0,
  }
  // shuffle each starter deck and draw an opening hand
  for (const p of [0, 1] as Player[]) {
    s.players[p].deck = shuffle(starterDeck(), s)
  }
  s.tradeDeck = shuffle(buildTradeDeck(), s)
  s.tradeRow = []
  for (let i = 0; i < TRADE_ROW_SIZE; i++) s.tradeRow.push(s.tradeDeck.pop() ?? null)
  // initial hands: both draw 5 at rest; the active player's hand is set by startTurn
  drawN(s.players[1], HAND_SIZE, s)   // AI hand at rest (will redraw on its turn anyway)
  s.players[1].hand = []
  // player 0 begins
  startTurn(s)
  s.log = push(s.log, 'sys', 'Battle for the realms. Reduce the foe from 50 Authority to 0.')
  return s
}

function emptyFactions(): Record<Faction, number> {
  return { trade: 0, blob: 0, star: 0, machine: 0, neutral: 0 }
}

// ---- deck mechanics ----------------------------------------------------------
function drawN(p: PlayerState, n: number, s: StarRealmsState) {
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) {
      if (p.discard.length === 0) break   // nothing left to draw
      p.deck = shuffle(p.discard, s)
      p.discard = []
    }
    const c = p.deck.pop()
    if (c) p.hand.push(c)
  }
}

// ---- turn lifecycle ----------------------------------------------------------
// startTurn: refill the trade row, reset pools, draw the active player's hand.
export function startTurn(s: StarRealmsState): StarRealmsState {
  if (s.winner != null) return s
  refillRow(s)
  s.trade = 0
  s.combat = 0
  s.playedFactions = emptyFactions()
  const p = s.players[s.turn]
  // draw hand FIRST — player 0's very first turn draws 3 (optional small first hand)
  const drawCount = (s.turn === 0 && s.firstTurn) ? 3 : HAND_SIZE
  p.hand = []
  p.inPlay = []
  drawN(p, drawCount, s)
  // bases remain in play across turns; (re)apply their persistent "always" + ally effects now.
  // We replay each base through playOne so faction counts and ally bonuses resolve consistently.
  const standingBases = p.bases.slice()
  p.bases = []                 // playCard re-registers them
  for (const b of standingBases) {
    p.inPlay.push(b)
    p.bases.push(b)
    playOne(s, b)
  }
  return s
}

function refillRow(s: StarRealmsState) {
  for (let i = 0; i < TRADE_ROW_SIZE; i++) {
    if (s.tradeRow[i] == null) {
      s.tradeRow[i] = s.tradeDeck.pop() ?? null
    }
  }
}

// Apply a card's "always" effects, plus ally effects when 2+ of its faction are in play this turn.
function applyCardEffects(s: StarRealmsState, c: CardInst, p: PlayerState) {
  const d = def(c)
  if (d.trade) s.trade += d.trade
  if (d.combat) s.combat += d.combat
  if (d.authority) p.authority += d.authority
  if (d.draw) drawN(p, d.draw, s)
  // ally check: faction count (already includes this card) >= 2
  const fc = s.playedFactions[d.faction] ?? 0
  if (d.faction !== 'neutral' && fc >= 2) {
    if (d.allyTrade) s.trade += d.allyTrade
    if (d.allyCombat) s.combat += d.allyCombat
    if (d.allyAuthority) p.authority += d.allyAuthority
    if (d.allyDraw) drawN(p, d.allyDraw, s)
  }
}

// Re-scan in-play cards and (re)apply ally bonuses that only now qualify. Because ally bonuses
// depend on faction counts that grow as cards are played, we recompute ally deltas incrementally:
// when a card is played we bump its faction count, then if a SECOND card of that faction triggers,
// the earlier card's ally bonus should also fire. To keep it deterministic and simple we apply
// the just-played card's effects (incl. ally if count>=2) AND, when count becomes exactly 2, also
// grant the ally bonus of the previously-played same-faction in-play cards.
function playOne(s: StarRealmsState, c: CardInst): boolean {
  const p = s.players[s.turn]
  const d = def(c)
  const before = s.playedFactions[d.faction] ?? 0
  s.playedFactions[d.faction] = before + 1
  // apply this card
  applyCardEffects(s, c, p)
  // when this is the 2nd of its faction, retroactively grant ally bonus to same-faction cards
  // already in play this turn (excluding this one and excluding the base re-trigger duplicates).
  if (d.faction !== 'neutral' && before + 1 === 2) {
    for (const other of p.inPlay) {
      if (other.id === c.id) continue
      const od = def(other)
      if (od.faction !== d.faction) continue
      if (od.allyTrade) s.trade += od.allyTrade
      if (od.allyCombat) s.combat += od.allyCombat
      if (od.allyAuthority) p.authority += od.allyAuthority
      if (od.allyDraw) drawN(p, od.allyDraw, s)
    }
  }
  return true
}

// Play a single card from hand (by id).
export function playCard(s: StarRealmsState, cardId: number): StarRealmsState {
  if (s.winner != null) return s
  const p = s.players[s.turn]
  const idx = p.hand.findIndex(c => c.id === cardId)
  if (idx < 0) return s
  const c = p.hand[idx]
  p.hand.splice(idx, 1)
  p.inPlay.push(c)
  const d = def(c)
  if (d.type === 'base' && !p.bases.some(b => b.id === c.id)) p.bases.push(c)
  playOne(s, c)
  s.actions++
  s.log = push(s.log, tag(s.turn), `${who(s.turn)} play${s.turn === 0 ? '' : 's'} ${d.name}.`)
  return s
}

// Play every card in hand.
export function playAll(s: StarRealmsState): StarRealmsState {
  if (s.winner != null) return s
  const p = s.players[s.turn]
  while (p.hand.length > 0) {
    playCard(s, p.hand[0].id)
  }
  return s
}

// ---- buying ------------------------------------------------------------------
export function buyCard(s: StarRealmsState, target: number | 'explorer'): StarRealmsState {
  if (s.winner != null) return s
  const p = s.players[s.turn]
  if (target === 'explorer') {
    if (s.explorerCount <= 0) return s
    const cost = CARDS.explorer.cost
    if (s.trade < cost) return s
    s.trade -= cost
    s.explorerCount--
    p.discard.push(inst('explorer'))
    s.actions++
    s.log = push(s.log, tag(s.turn), `${who(s.turn)} buy${s.turn === 0 ? '' : 's'} an Explorer.`)
    return s
  }
  const c = s.tradeRow[target]
  if (c == null) return s
  const d = def(c)
  if (s.trade < d.cost) return s
  s.trade -= d.cost
  s.tradeRow[target] = null
  p.discard.push(c)
  refillRow(s)
  s.actions++
  s.log = push(s.log, tag(s.turn), `${who(s.turn)} buy${s.turn === 0 ? '' : 's'} ${d.name} (${d.cost}).`)
  return s
}

// ---- combat ------------------------------------------------------------------
// target: 'face' | base card id (number). Outposts must be cleared before face damage.
export function attack(s: StarRealmsState, target: 'face' | number): StarRealmsState {
  if (s.winner != null) return s
  const me = s.turn
  const foe: Player = (me === 0 ? 1 : 0)
  const opp = s.players[foe]
  if (target === 'face') {
    // cannot hit face while an outpost stands
    if (opp.bases.some(b => def(b).outpost)) return s
    if (s.combat <= 0) return s
    const dmg = s.combat
    opp.authority -= dmg
    s.combat = 0
    s.actions++
    s.log = push(s.log, tag(me), `${who(me)} deal${me === 0 ? '' : 's'} ${dmg} to ${who(foe)}'s Authority.`)
    if (opp.authority <= 0) {
      opp.authority = Math.max(0, opp.authority)
      s.winner = me
      s.log = push(s.log, tag(me), `${who(me)} win${me === 0 ? '' : 's'} the duel!`)
    }
    return s
  }
  // attacking a base
  const bIdx = opp.bases.findIndex(b => b.id === target)
  if (bIdx < 0) return s
  const base = opp.bases[bIdx]
  const bd = def(base)
  // if there are outposts, only outposts may be targeted
  if (opp.bases.some(b => def(b).outpost) && !bd.outpost) return s
  const dfn = bd.defense ?? 0
  if (s.combat < dfn) return s
  s.combat -= dfn
  opp.bases.splice(bIdx, 1)
  opp.discard.push(base)
  s.actions++
  s.log = push(s.log, tag(me), `${who(me)} destroy${me === 0 ? '' : 's'} ${who(foe)}'s ${bd.name}.`)
  return s
}

// ---- end turn ----------------------------------------------------------------
export function endTurn(s: StarRealmsState): StarRealmsState {
  if (s.winner != null) return s
  const me = s.turn
  const p = s.players[me]
  // ships in play go to discard; bases stay
  const baseIds = new Set(p.bases.map(b => b.id))
  for (const c of p.inPlay) {
    if (!baseIds.has(c.id)) p.discard.push(c)
  }
  // any remaining unplayed hand cards also go to discard (standard Star Realms)
  for (const c of p.hand) p.discard.push(c)
  p.hand = []
  p.inPlay = p.bases.slice()
  if (me === 0) s.firstTurn = false
  s.turn = (me === 0 ? 1 : 0)
  s.actions++
  startTurn(s)
  return s
}

// ---- AI ----------------------------------------------------------------------
// Greedy value heuristic for buying.
function buyValue(d: CardDef): number {
  let v = 0
  v += (d.combat ?? 0) * 1.0
  v += (d.trade ?? 0) * 1.1
  v += (d.authority ?? 0) * 0.4
  v += (d.draw ?? 0) * 2.0
  v += (d.allyCombat ?? 0) * 0.4
  v += (d.allyTrade ?? 0) * 0.4
  v += (d.allyDraw ?? 0) * 0.8
  v += (d.allyAuthority ?? 0) * 0.2
  if (d.type === 'base') v += (d.defense ?? 0) * 0.5 + (d.outpost ? 1.5 : 0)
  // efficiency vs cost
  return v - d.cost * 0.15
}

// The AI plays its whole turn: play all cards, buy greedily until trade exhausted,
// then attack outposts and face. Returns mutated state (single call).
export function aiTurn(s: StarRealmsState): StarRealmsState {
  if (s.winner != null || s.turn !== 1) return s
  const me: Player = 1
  const foe: Player = 0
  // 1) play all cards
  playAll(s)
  if (s.winner != null) return s
  // 2) buy greedily: repeatedly pick the best affordable card by value
  let guard = 0
  while (guard++ < 30) {
    let best = -Infinity
    let bestTarget: number | 'explorer' | null = null
    for (let i = 0; i < s.tradeRow.length; i++) {
      const c = s.tradeRow[i]
      if (c == null) continue
      const d = def(c)
      if (d.cost > s.trade) continue
      const val = buyValue(d)
      if (val > best) { best = val; bestTarget = i }
    }
    // explorer option
    if (s.explorerCount > 0 && CARDS.explorer.cost <= s.trade) {
      const val = buyValue(CARDS.explorer)
      if (val > best) { best = val; bestTarget = 'explorer' }
    }
    if (bestTarget == null) break
    buyCard(s, bestTarget)
  }
  // 3) attack: clear opponent outposts first, then face
  let aguard = 0
  while (aguard++ < 20 && s.combat > 0) {
    const opp = s.players[foe]
    const outposts = opp.bases.filter(b => def(b).outpost)
    if (outposts.length > 0) {
      // destroy the cheapest-defense outpost we can afford
      const affordable = outposts.filter(b => (def(b).defense ?? 0) <= s.combat)
        .sort((a, b) => (def(a).defense ?? 0) - (def(b).defense ?? 0))
      if (affordable.length === 0) break   // can't break the outpost; combat wasted
      attack(s, affordable[0].id)
      continue
    }
    // no outposts: optionally smash a non-outpost base if cheap, else hit face
    const otherBases = opp.bases.filter(b => !def(b).outpost && (def(b).defense ?? 0) <= s.combat)
    if (otherBases.length > 0 && s.combat > 10) {
      attack(s, otherBases[0].id)
      continue
    }
    attack(s, 'face')
    break
  }
  if (s.winner != null) return s
  // 4) end turn (hands back to you)
  endTurn(s)
  return s
}

// ---- helpers / queries -------------------------------------------------------
export function winner(s: StarRealmsState): Player | null { return s.winner }
const who = (p: Player) => (p === 0 ? 'You' : 'The AI')
const tag = (p: Player) => (p === 0 ? 'you' : 'ai')

// total cards a player owns (for test accounting)
export function totalCards(p: PlayerState): number {
  return p.deck.length + p.hand.length + p.discard.length + p.inPlay.filter(c => def(c).type !== 'base').length + p.bases.length
}

// whether the current player can still hit face (no enemy outpost standing)
export function faceOpen(s: StarRealmsState): boolean {
  const foe: Player = (s.turn === 0 ? 1 : 0)
  return !s.players[foe].bases.some(b => def(b).outpost)
}
