/* RADLANDS — pure logic (2-player post-apocalyptic tableau combat; no DOM).
   You (player 0) vs the AI (player 1). Each player defends 3 CAMPS. In front of each
   camp are up to 2 PERSON slots (slot 0 = back / nearest camp, slot 1 = front / nearest
   enemy). A card is PROTECTED if there is another of your cards IN FRONT of it (closer to
   the enemy) in the same column — i.e. a camp is protected by any person in its column,
   and a back person is protected by a front person. Only the FRONT (unprotected) card of
   an enemy column is a legal Damage target.

   Resource is WATER: 3 per turn. On your turn: draw a card, then spend water to PLAY a
   person, USE an ability (Damage / Injure / Restore / Water / Draw / Raid), or play an
   EVENT (delayed card on a queue that fires after N turns). Destroy all 3 enemy camps to win.

   Randomness is seeded and carried on state for deterministic tests. */

export type Player = 0 | 1

export type AbilityKind = 'damage' | 'injure' | 'restore' | 'water' | 'draw' | 'raid'

export interface CardDef {
  key: string
  name: string
  kind: 'person' | 'event' | 'camp'
  cost: number             // water cost to PLAY (person/event)
  ability?: AbilityKind    // person/camp ability
  abilityCost?: number     // water cost to USE the ability
  // event-specific
  delay?: number           // turns before it fires (0 = next turn slot 0)
  eventEffect?: AbilityKind
  // camp-specific
  health?: number          // camp starting health
  blurb: string
}

// ---- card catalogue ----------------------------------------------------------
export const CARDS: Record<string, CardDef> = {
  // people
  scout:    { key: 'scout',    name: 'Scout',     kind: 'person', cost: 1, ability: 'water',   abilityCost: 0, blurb: 'Play 1 · ability: +1 Water' },
  raider:   { key: 'raider',   name: 'Raider',    kind: 'person', cost: 1, ability: 'damage',  abilityCost: 2, blurb: 'Play 1 · Damage (2W)' },
  gunner:   { key: 'gunner',   name: 'Gunner',    kind: 'person', cost: 2, ability: 'damage',  abilityCost: 1, blurb: 'Play 2 · Damage (1W)' },
  medic:    { key: 'medic',    name: 'Medic',     kind: 'person', cost: 2, ability: 'restore', abilityCost: 1, blurb: 'Play 2 · Restore (1W)' },
  cutter:   { key: 'cutter',   name: 'Cutter',    kind: 'person', cost: 2, ability: 'injure',  abilityCost: 1, blurb: 'Play 2 · Injure (1W)' },
  runner:   { key: 'runner',   name: 'Runner',    kind: 'person', cost: 1, ability: 'draw',    abilityCost: 1, blurb: 'Play 1 · Draw (1W)' },
  vanguard: { key: 'vanguard', name: 'Vanguard',  kind: 'person', cost: 3, ability: 'damage',  abilityCost: 1, blurb: 'Play 3 · Damage (1W)' },
  // events
  ev_strike:{ key: 'ev_strike',name: 'Air Strike', kind: 'event', cost: 2, delay: 1, eventEffect: 'damage',  blurb: 'Event (1) · Damage when it fires' },
  ev_raid:  { key: 'ev_raid',  name: 'Bombard',     kind: 'event', cost: 1, delay: 0, eventEffect: 'damage',  blurb: 'Event (0) · Damage next turn' },
  ev_bank:  { key: 'ev_bank',  name: 'Cache',       kind: 'event', cost: 1, delay: 1, eventEffect: 'draw',    blurb: 'Event (1) · Draw when it fires' },
  // camps
  c_garage:   { key: 'c_garage',   name: 'Garage',     kind: 'camp', cost: 0, health: 3, ability: 'water',  abilityCost: 0, blurb: 'Camp (3) · +1 Water' },
  c_bunker:   { key: 'c_bunker',   name: 'Bunker',     kind: 'camp', cost: 0, health: 4, blurb: 'Camp (4) · sturdy' },
  c_outpost:  { key: 'c_outpost',  name: 'Outpost',    kind: 'camp', cost: 0, health: 3, ability: 'damage', abilityCost: 2, blurb: 'Camp (3) · Damage (2W)' },
  c_arsenal:  { key: 'c_arsenal',  name: 'Arsenal',    kind: 'camp', cost: 0, health: 3, ability: 'draw',   abilityCost: 1, blurb: 'Camp (3) · Draw (1W)' },
  c_workshop: { key: 'c_workshop', name: 'Workshop',   kind: 'camp', cost: 0, health: 3, ability: 'restore',abilityCost: 1, blurb: 'Camp (3) · Restore (1W)' },
}

export function def(key: string): CardDef { return CARDS[key] }

// ---- instances ---------------------------------------------------------------
export interface PersonInst {
  id: number
  key: string
  damaged: boolean   // injured (one hit). Another hit destroys.
  ready: boolean     // can use ability this turn (entered play -> not ready until next turn)
}

export interface CampInst {
  id: number
  key: string
  health: number       // remaining health
  maxHealth: number
  destroyed: boolean
  used: boolean        // ability used this turn (reset at start of turn)
}

export interface Column {
  camp: CampInst
  // slot 0 = back (nearest camp), slot 1 = front (nearest enemy). null = empty.
  people: [PersonInst | null, PersonInst | null]
}

export interface QueuedEvent {
  id: number
  key: string
  countdown: number   // fires when it reaches 0 at start of owner's turn
}

export interface PlayerState {
  columns: [Column, Column, Column]
  deck: string[]
  hand: string[]
  discard: string[]
  water: number
  events: QueuedEvent[]
}

export interface RadlandsState {
  players: [PlayerState, PlayerState]
  turn: Player
  winner: Player | null
  rng: number
  nextId: number
  log: { t: string; x: string }[]
  actions: number      // monotonic counter — every mutating action bumps this (AI tick)
  round: number        // increments each time play returns to player 0 — drives escalation
}

// ---- seeded RNG --------------------------------------------------------------
function rnd(s: RadlandsState): number {
  // mulberry32-ish
  s.rng = (s.rng + 0x6d2b79f5) | 0
  let t = s.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function shuffle<T>(s: RadlandsState, arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(s) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function log(s: RadlandsState, t: string, x: string) {
  s.log.push({ t, x })
  if (s.log.length > 60) s.log.shift()
}

// ---- deck composition --------------------------------------------------------
const DEFAULT_DECK: string[] = [
  'scout', 'scout', 'raider', 'raider', 'gunner', 'gunner', 'medic',
  'cutter', 'runner', 'runner', 'vanguard', 'vanguard',
  'ev_strike', 'ev_raid', 'ev_bank', 'gunner', 'raider', 'medic',
]
const CAMP_POOL = ['c_garage', 'c_bunker', 'c_outpost', 'c_arsenal', 'c_workshop']

function newColumn(s: RadlandsState, campKey: string): Column {
  const d = def(campKey)
  const h = d.health ?? 3
  return {
    camp: { id: s.nextId++, key: campKey, health: h, maxHealth: h, destroyed: false, used: false },
    people: [null, null],
  }
}

function makePlayer(s: RadlandsState, camps: string[], deckKeys: string[]): PlayerState {
  const p: PlayerState = {
    columns: [newColumn(s, camps[0]), newColumn(s, camps[1]), newColumn(s, camps[2])],
    deck: deckKeys.slice(),
    hand: [],
    discard: [],
    water: 0,
    events: [],
  }
  return p
}

/** makeGame — optional explicit deck (array of card keys) and seed for deterministic play. */
export function makeGame(optionalDeck?: string[], seed = 12345): RadlandsState {
  const s: RadlandsState = {
    players: [null as unknown as PlayerState, null as unknown as PlayerState],
    turn: 0,
    winner: null,
    rng: seed >>> 0,
    nextId: 1,
    log: [],
    actions: 0,
    round: 0,
  }
  const baseDeck = optionalDeck && optionalDeck.length ? optionalDeck : DEFAULT_DECK
  // each player gets a shuffled copy of the deck and a fixed set of camps
  const deck0 = optionalDeck && optionalDeck.length ? optionalDeck.slice() : shuffle(s, baseDeck)
  const deck1 = optionalDeck && optionalDeck.length ? optionalDeck.slice() : shuffle(s, baseDeck)
  const camps0: string[] = ['c_outpost', 'c_garage', 'c_bunker']
  const camps1: string[] = ['c_outpost', 'c_arsenal', 'c_bunker']
  s.players[0] = makePlayer(s, camps0, deck0)
  s.players[1] = makePlayer(s, camps1, deck1)

  // opening hands
  for (let i = 0; i < 4; i++) { drawOne(s, 0); drawOne(s, 1) }
  // start of player 0's first turn
  beginTurn(s, 0)
  return s
}

// ---- draw / deck -------------------------------------------------------------
function drawOne(s: RadlandsState, pl: Player) {
  const p = s.players[pl]
  if (p.deck.length === 0) {
    if (p.discard.length === 0) return // nothing to draw
    p.deck = shuffle(s, p.discard)
    p.discard = []
  }
  const c = p.deck.shift()
  if (c != null) p.hand.push(c)
}

// ---- turn lifecycle ----------------------------------------------------------
function beginTurn(s: RadlandsState, pl: Player) {
  const p = s.players[pl]
  // ready all people, reset camp ability use
  for (const col of p.columns) {
    for (const pr of col.people) if (pr) pr.ready = true
    col.camp.used = false
  }
  // resolve events that are due (countdown 0)
  resolveEvents(s, pl)
  // water: base 3, with a slow escalation each round so games can't deadlock forever
  // (a Radlands-flavoured "the wasteland grows desperate" pressure). Capped.
  p.water = 3 + Math.min(9, Math.floor(s.round / 4))
  // draw a card at start of turn
  drawOne(s, pl)
}

/** resolveEvents — fire any of the player's events whose countdown reached 0, then
    decrement the rest. Called at the start of that player's turn. */
export function resolveEvents(s: RadlandsState, pl: Player) {
  const p = s.players[pl]
  const remaining: QueuedEvent[] = []
  for (const ev of p.events) {
    if (ev.countdown <= 0) {
      fireEvent(s, pl, ev)
    } else {
      remaining.push(ev)
    }
  }
  // decrement survivors for next turn
  for (const ev of remaining) ev.countdown -= 1
  p.events = remaining
}

function fireEvent(s: RadlandsState, pl: Player, ev: QueuedEvent) {
  const d = def(ev.key)
  const effect = d.eventEffect
  const foe: Player = pl === 0 ? 1 : 0
  s.players[pl].discard.push(ev.key)
  if (effect === 'damage') {
    // auto-target: first unprotected front card across enemy columns
    const tgt = autoDamageTarget(s, foe)
    if (tgt) { applyDamage(s, foe, tgt.column, tgt.slot); log(s, pl === 0 ? 'you' : 'foe', `${d.name} fires — Damage`) }
  } else if (effect === 'draw') {
    drawOne(s, pl); log(s, pl === 0 ? 'you' : 'foe', `${d.name} fires — Draw`)
  }
}

/** endTurn — pass priority to the other player and begin their turn. */
export function endTurn(s: RadlandsState) {
  if (s.winner != null) return
  const other: Player = s.turn === 0 ? 1 : 0
  s.turn = other
  s.actions++
  if (other === 0) s.round++
  beginTurn(s, other)
  checkWin(s)
}

// ---- protection --------------------------------------------------------------
/** isProtected — a person at (column, slot) is protected if there is one of the SAME
    player's cards in front of it (closer to the enemy) in that column. With 2 slots:
    slot 0 (back) is protected by a person in slot 1 (front); slot 1 (front) is never
    protected. (Camps use isCampProtected.) */
export function isProtected(s: RadlandsState, pl: Player, column: number, slot: number): boolean {
  const col = s.players[pl].columns[column]
  if (col == null) return false
  if (slot === 1) return false           // front person — nothing in front
  // slot 0 (back): protected if a front person exists
  return col.people[1] != null
}

function isCampProtected(col: Column): boolean {
  // camp is protected if ANY person stands in front of it
  return col.people[0] != null || col.people[1] != null
}

/** The single legal Damage target for an enemy column: the frontmost (unprotected)
    person, or the camp if the column has no people. Returns null if column gone. */
function columnFrontTarget(col: Column): { kind: 'person' | 'camp'; slot: number } | null {
  if (col.people[1] != null) return { kind: 'person', slot: 1 }
  if (col.people[0] != null) return { kind: 'person', slot: 0 }
  if (!col.camp.destroyed) return { kind: 'camp', slot: -1 }
  return null
}

function autoDamageTarget(s: RadlandsState, foe: Player): { column: number; slot: number } | null {
  const p = s.players[foe]
  // prefer hitting a person; else a camp
  for (let c = 0; c < 3; c++) {
    const t = columnFrontTarget(p.columns[c])
    if (t && t.kind === 'person') return { column: c, slot: t.slot }
  }
  for (let c = 0; c < 3; c++) {
    const t = columnFrontTarget(p.columns[c])
    if (t && t.kind === 'camp') return { column: c, slot: -1 }
  }
  return null
}

// ---- damage application ------------------------------------------------------
/** Apply one Damage to (column, slot) of player `pl`. slot -1 = the camp.
    Persons: damaged->destroyed; healthy->damaged. Camps: lose 1 health -> destroyed at 0. */
function applyDamage(s: RadlandsState, pl: Player, column: number, slot: number) {
  const col = s.players[pl].columns[column]
  if (col == null) return
  if (slot === -1) {
    if (col.camp.destroyed) return
    col.camp.health -= 1
    if (col.camp.health <= 0) { col.camp.health = 0; col.camp.destroyed = true }
    return
  }
  const pr = col.people[slot]
  if (pr == null) return
  if (pr.damaged) {
    // destroy
    s.players[pl].discard.push(pr.key)
    col.people[slot] = null
  } else {
    pr.damaged = true
  }
}

function applyInjure(s: RadlandsState, pl: Player, column: number, slot: number) {
  // injure only hits people; same as a damage hit on a person
  const col = s.players[pl].columns[column]
  if (col == null) return
  const pr = col.people[slot]
  if (pr == null) return
  if (pr.damaged) { s.players[pl].discard.push(pr.key); col.people[slot] = null }
  else pr.damaged = true
}

function applyRestore(s: RadlandsState, pl: Player, column: number, slot: number) {
  const col = s.players[pl].columns[column]
  if (col == null) return
  if (slot === -1) {
    if (!col.camp.destroyed && col.camp.health < col.camp.maxHealth) col.camp.health += 1
    return
  }
  const pr = col.people[slot]
  if (pr && pr.damaged) pr.damaged = false
}

// ---- target validity ---------------------------------------------------------
export interface AbilityTarget {
  player: Player        // owner of the targeted card
  column: number
  slot: number          // -1 = camp
}

/** Is (target) a legal target for ability `kind` used by player `actor`? */
function validTarget(s: RadlandsState, actor: Player, kind: AbilityKind, t: AbilityTarget): boolean {
  const foe: Player = actor === 0 ? 1 : 0
  const col = s.players[t.player].columns[t.column]
  if (col == null) return false
  if (kind === 'damage') {
    if (t.player !== foe) return false
    const front = columnFrontTarget(col)
    if (front == null) return false
    if (front.kind === 'camp') return t.slot === -1
    return t.slot === front.slot
  }
  if (kind === 'injure') {
    if (t.player !== foe) return false
    // injure also can only legally hit the front/unprotected person
    const front = columnFrontTarget(col)
    if (front == null || front.kind !== 'person') return false
    return t.slot === front.slot
  }
  if (kind === 'restore') {
    if (t.player !== actor) return false
    if (t.slot === -1) return !col.camp.destroyed && col.camp.health < col.camp.maxHealth
    const pr = col.people[t.slot]
    return pr != null && pr.damaged
  }
  return false
}

// ---- ability source ----------------------------------------------------------
export interface AbilitySource {
  player: Player
  column: number
  slot: number          // -1 = camp ability
}

function sourceCard(s: RadlandsState, src: AbilitySource): { def: CardDef; ready: boolean } | null {
  const col = s.players[src.player].columns[src.column]
  if (col == null) return null
  if (src.slot === -1) {
    if (col.camp.destroyed || !col.camp.key) return null
    const d = def(col.camp.key)
    if (!d.ability) return null
    return { def: d, ready: !col.camp.used } // once per turn
  }
  const pr = col.people[src.slot]
  if (pr == null) return null
  const d = def(pr.key)
  if (!d.ability) return null
  return { def: d, ready: pr.ready }
}

// ---- public actions ----------------------------------------------------------
/** playPerson — play a person card from hand into (column, slot). Costs water. */
export function playPerson(s: RadlandsState, pl: Player, cardId: string, column: number, slot: number): boolean {
  if (s.winner != null || s.turn !== pl) return false
  const p = s.players[pl]
  const d = def(cardId)
  if (!d || d.kind !== 'person') return false
  if (!p.hand.includes(cardId)) return false
  const col = p.columns[column]
  if (col == null) return false
  if (slot !== 0 && slot !== 1) return false
  if (col.people[slot] != null) return false
  if (p.water < d.cost) return false
  // place
  p.water -= d.cost
  p.hand.splice(p.hand.indexOf(cardId), 1)
  col.people[slot] = { id: s.nextId++, key: cardId, damaged: false, ready: false }
  s.actions++
  log(s, pl === 0 ? 'you' : 'foe', `${pl === 0 ? 'You' : 'AI'} played ${d.name}`)
  return true
}

/** useAbility — use the ability of a source card against a target. Costs water. */
export function useAbility(s: RadlandsState, pl: Player, source: AbilitySource, target: AbilityTarget | null): boolean {
  if (s.winner != null || s.turn !== pl) return false
  if (source.player !== pl) return false
  const sc = sourceCard(s, source)
  if (sc == null) return false
  if (!sc.ready) return false
  const kind = sc.def.ability!
  const cost = sc.def.abilityCost ?? 0
  const p = s.players[pl]
  if (p.water < cost) return false

  if (kind === 'water') {
    p.water -= cost; p.water += 1
  } else if (kind === 'draw') {
    p.water -= cost; drawOne(s, pl)
  } else if (kind === 'raid') {
    p.water -= cost; drawOne(s, pl)
  } else if (kind === 'damage' || kind === 'injure' || kind === 'restore') {
    if (target == null || !validTarget(s, pl, kind, target)) return false
    p.water -= cost
    if (kind === 'damage') applyDamage(s, target.player, target.column, target.slot)
    else if (kind === 'injure') applyInjure(s, target.player, target.column, target.slot)
    else applyRestore(s, target.player, target.column, target.slot)
  } else {
    return false
  }
  // mark source spent for the turn
  if (source.slot !== -1) {
    const pr = p.columns[source.column].people[source.slot]
    if (pr) pr.ready = false
  } else {
    p.columns[source.column].camp.used = true
  }
  s.actions++
  log(s, pl === 0 ? 'you' : 'foe', `${sc.def.name}: ${kind}`)
  checkWin(s)
  return true
}

/** playEvent — queue an event card from hand onto the player's event track. */
export function playEvent(s: RadlandsState, pl: Player, cardId: string): boolean {
  if (s.winner != null || s.turn !== pl) return false
  const p = s.players[pl]
  const d = def(cardId)
  if (!d || d.kind !== 'event') return false
  if (!p.hand.includes(cardId)) return false
  if (p.water < d.cost) return false
  if (p.events.length >= 3) return false
  p.water -= d.cost
  p.hand.splice(p.hand.indexOf(cardId), 1)
  p.events.push({ id: s.nextId++, key: cardId, countdown: d.delay ?? 1 })
  s.actions++
  log(s, pl === 0 ? 'you' : 'foe', `${pl === 0 ? 'You' : 'AI'} queued ${d.name}`)
  return true
}

// ---- win check ---------------------------------------------------------------
function checkWin(s: RadlandsState) {
  if (s.winner != null) return
  for (let pl = 0 as Player; pl <= 1; pl = (pl + 1) as Player) {
    const allDead = s.players[pl].columns.every(c => c.camp.destroyed)
    if (allDead) { s.winner = (pl === 0 ? 1 : 0) as Player; return }
  }
}

/** winner — returns 0/1 if a player has lost all 3 camps, else null. */
export function winner(s: RadlandsState): Player | null {
  return s.winner
}

// ---- legal actions (for AI / UI hints) ---------------------------------------
export type LegalAction =
  | { type: 'play'; cardId: string; column: number; slot: number; cost: number }
  | { type: 'ability'; source: AbilitySource; target: AbilityTarget | null; kind: AbilityKind; cost: number }
  | { type: 'event'; cardId: string; cost: number }
  | { type: 'end' }

export function legalActions(s: RadlandsState, pl: Player): LegalAction[] {
  const out: LegalAction[] = []
  if (s.winner != null || s.turn !== pl) return out
  const p = s.players[pl]
  // plays
  for (const cardId of new Set(p.hand)) {
    const d = def(cardId)
    if (d.kind === 'person' && p.water >= d.cost) {
      for (let c = 0; c < 3; c++) {
        for (let sl = 0; sl < 2; sl++) {
          if (p.columns[c].people[sl] == null) out.push({ type: 'play', cardId, column: c, slot: sl, cost: d.cost })
        }
      }
    } else if (d.kind === 'event' && p.water >= d.cost && p.events.length < 3) {
      out.push({ type: 'event', cardId, cost: d.cost })
    }
  }
  // abilities
  for (let c = 0; c < 3; c++) {
    const col = p.columns[c]
    // camp ability
    if (!col.camp.destroyed && !col.camp.used) {
      const cd = def(col.camp.key)
      if (cd.ability) {
        const cost = cd.abilityCost ?? 0
        if (p.water >= cost) pushAbility(s, pl, { player: pl, column: c, slot: -1 }, cd.ability, out, cost)
      }
    }
    for (let sl = 0; sl < 2; sl++) {
      const pr = col.people[sl]
      if (pr && pr.ready) {
        const d = def(pr.key)
        if (d.ability) {
          const cost = d.abilityCost ?? 0
          if (p.water >= cost) pushAbility(s, pl, { player: pl, column: c, slot: sl }, d.ability, out, cost)
        }
      }
    }
  }
  out.push({ type: 'end' })
  return out
}

function pushAbility(s: RadlandsState, pl: Player, src: AbilitySource, kind: AbilityKind, out: LegalAction[], cost: number) {
  const foe: Player = pl === 0 ? 1 : 0
  if (kind === 'water' || kind === 'draw' || kind === 'raid') {
    out.push({ type: 'ability', source: src, target: null, kind, cost })
    return
  }
  if (kind === 'damage' || kind === 'injure') {
    for (let c = 0; c < 3; c++) {
      const t: AbilityTarget = { player: foe, column: c, slot: frontSlot(s, foe, c) }
      if (validTarget(s, pl, kind, t)) out.push({ type: 'ability', source: src, target: t, kind, cost })
    }
  } else if (kind === 'restore') {
    for (let c = 0; c < 3; c++) {
      // camp
      const tc: AbilityTarget = { player: pl, column: c, slot: -1 }
      if (validTarget(s, pl, kind, tc)) out.push({ type: 'ability', source: src, target: tc, kind, cost })
      for (let sl = 0; sl < 2; sl++) {
        const tp: AbilityTarget = { player: pl, column: c, slot: sl }
        if (validTarget(s, pl, kind, tp)) out.push({ type: 'ability', source: src, target: tp, kind, cost })
      }
    }
  }
}

function frontSlot(s: RadlandsState, pl: Player, column: number): number {
  const t = columnFrontTarget(s.players[pl].columns[column])
  if (t == null) return -2 // no valid
  return t.kind === 'camp' ? -1 : t.slot
}

// ---- AI ----------------------------------------------------------------------
/** aiStep — perform ONE sub-action for the AI and bump actions. Returns true if it acted
    (UI re-arms the timer via the bumped `actions` counter); returns false when it has
    nothing left and ends the turn. Used so the AI's multi-action turn animates step by step. */
export function aiStep(s: RadlandsState): boolean {
  const pl: Player = 1
  if (s.winner != null || s.turn !== pl) return false
  const acts = legalActions(s, pl).filter(a => a.type !== 'end')
  if (acts.length === 0) { endTurn(s); return true }
  const a = chooseAi(s, acts)
  if (a == null) { endTurn(s); return true }
  if (a.type === 'play') playPerson(s, pl, a.cardId, a.column, a.slot)
  else if (a.type === 'event') playEvent(s, pl, a.cardId)
  else if (a.type === 'ability') useAbility(s, pl, a.source, a.target)
  return true
}

/** aiTurn — run the AI's whole turn at once (used by tests / self-play). */
export function aiTurn(s: RadlandsState) {
  let guard = 0
  while (s.turn === 1 && s.winner == null && guard < 60) {
    const acted = aiStep(s)
    if (!acted) break
    guard++
  }
  // ensure turn actually ends
  if (s.turn === 1 && s.winner == null) endTurn(s)
}

function chooseAi(s: RadlandsState, acts: LegalAction[]): LegalAction | null {
  const pl: Player = 1
  const foe: Player = 0
  // 1) finishing / pressure: Damage that destroys a camp or clears a person
  const damages = acts.filter(a => a.type === 'ability' && a.kind === 'damage') as Extract<LegalAction, { type: 'ability' }>[]
  // prefer a damage that kills an exposed camp
  for (const d of damages) {
    if (d.target && d.target.slot === -1) {
      const col = s.players[foe].columns[d.target.column]
      if (col.camp.health <= 1) return d // lethal-ish to a camp
    }
  }
  // prefer damaging a person that's already injured (kills it)
  for (const d of damages) {
    if (d.target && d.target.slot >= 0) {
      const pr = s.players[foe].columns[d.target.column].people[d.target.slot]
      if (pr && pr.damaged) return d
    }
  }
  // 2) play a person to build board (front slot to protect a back later, or fill)
  const plays = acts.filter(a => a.type === 'play') as Extract<LegalAction, { type: 'play' }>[]
  // count current people
  const myPeople = s.players[pl].columns.reduce((n, c) => n + (c.people[0] ? 1 : 0) + (c.people[1] ? 1 : 0), 0)
  if (myPeople < 3 && plays.length) {
    // pick the highest-cost affordable person, preferring front slot for protection
    const sorted = plays.slice().sort((a, b) => (def(b.cardId).cost - def(a.cardId).cost) || (b.slot - a.slot))
    return sorted[0]
  }
  // 3) any damage at all (chip camps / kill people)
  if (damages.length) return damages[0]
  // 4) water / draw economy if cheap and water available
  const econ = acts.find(a => a.type === 'ability' && (a.kind === 'water' || a.kind === 'draw'))
  if (econ && s.players[pl].water >= 2) return econ
  // 5) event
  const ev = acts.find(a => a.type === 'event')
  if (ev) return ev
  // 6) play whatever
  if (plays.length) return plays[0]
  // 7) injure / restore
  const other = acts.find(a => a.type === 'ability')
  if (other) return other
  return null
}
