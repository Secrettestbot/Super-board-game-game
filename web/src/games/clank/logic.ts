/* CLANK! — pure logic (simplified 2-player deckbuilding dungeon crawl; no DOM).
   You (player 0) vs the AI (player 1). Each player owns a personal deck of cards that
   produce three resources when played: SKILL (buy cards from the Dungeon Row market),
   SWORDS (fight monsters / clear blocked passages), and BOOTS (move your pawn between
   adjacent rooms on a small dungeon track).

   The DUNGEON is a small linear track of rooms (START=0 → deeper rooms). Deeper rooms
   hold ARTIFACTS worth escalating points. Some passages are BLOCKED and cost swords to
   clear. Buying / playing certain cards produces CLANK (noise cubes). The accumulated
   clank in the bag drives periodic DRAGON ATTACKS: when the dragon strikes, each player
   loses health equal to their clank (their noise level). Descend, grab an artifact, then
   climb back toward START to ESCAPE before dying. Banking deeper artifacts scores more.

   The game ends when a player escapes (reaches START carrying an artifact) or the dragon
   kills everyone. Score = artifact value + gold + card victory points.

   Randomness (deck shuffles + dragon timing) is injectable/guarded via a seeded PRNG so
   tests are deterministic. makeGame(seed?) seeds it; with no seed it falls back to Math.random. */

export type Player = 0 | 1
export type Phase = 'play' | 'over'

// ---- card catalogue ----------------------------------------------------------
export interface CardDef {
  key: string
  name: string
  cost: number        // skill cost to buy from the market (0 for starters)
  skill?: number
  swords?: number
  boots?: number
  clank?: number      // noise generated when this card is PLAYED
  gold?: number       // immediate gold gained when played
  points?: number     // victory points the card is worth at scoring (stays in deck)
  blurb: string
}

export const CARDS: Record<string, CardDef> = {
  // ---- starter deck cards (cost 0, never in market) ----
  stumble:  { key: 'stumble',  name: 'Stumble',     cost: 0, clank: 1,            blurb: '+1 Clank' },
  burgle:   { key: 'burgle',   name: 'Burgle',      cost: 0, skill: 1,            blurb: '+1 Skill' },
  scramble: { key: 'scramble', name: 'Scramble',    cost: 0, skill: 1, boots: 1,  blurb: '+1 Skill, +1 Boot' },
  sidestep: { key: 'sidestep', name: 'Sidestep',    cost: 0, boots: 1,           blurb: '+1 Boot' },

  // ---- market (Dungeon Row) cards ----
  explore:    { key: 'explore',    name: 'Explore',       cost: 3, skill: 2, clank: 1,            blurb: '+2 Skill · +1 Clank' },
  sprint:     { key: 'sprint',     name: 'Sprint',        cost: 2, boots: 2,                       blurb: '+2 Boots' },
  dash:       { key: 'dash',       name: 'Dash',          cost: 4, boots: 3,                       blurb: '+3 Boots' },
  shortsword: { key: 'shortsword', name: 'Short Sword',   cost: 2, swords: 2,                      blurb: '+2 Swords' },
  warhammer:  { key: 'warhammer',  name: 'Warhammer',     cost: 4, swords: 3, clank: 1,            blurb: '+3 Swords · +1 Clank' },
  pickaxe:    { key: 'pickaxe',    name: 'Pickaxe',       cost: 3, swords: 2, gold: 2,             blurb: '+2 Swords · +2 Gold' },
  lockpick:   { key: 'lockpick',   name: 'Lockpicks',     cost: 3, skill: 1, boots: 1,             blurb: '+1 Skill · +1 Boot' },
  treasure:   { key: 'treasure',   name: 'Treasure Hunter', cost: 5, skill: 2, gold: 2, points: 2, blurb: '+2 Skill · +2 Gold · 2 VP' },
  amulet:     { key: 'amulet',     name: 'Amulet',        cost: 6, skill: 2, points: 3,            blurb: '+2 Skill · 3 VP' },
  guard:      { key: 'guard',      name: 'Dungeon Guard', cost: 3, swords: 2, points: 1,           blurb: '+2 Swords · 1 VP' },
  cog:        { key: 'cog',        name: 'Brass Cog',     cost: 2, skill: 1, gold: 1,              blurb: '+1 Skill · +1 Gold' },
}

// keys that are buyable in the market (with rough supply counts)
const MARKET_COMPOSITION: Array<[string, number]> = [
  ['explore', 3], ['sprint', 3], ['dash', 2], ['shortsword', 3], ['warhammer', 2],
  ['pickaxe', 2], ['lockpick', 3], ['treasure', 2], ['amulet', 2], ['guard', 3], ['cog', 3],
]

// ---- dungeon map -------------------------------------------------------------
// A small linear track of rooms. room 0 = START / EXIT. Deeper rooms hold artifacts.
// A "blocked" passage between room i-1 and i costs `swordCost` swords to traverse.
export interface RoomDef {
  id: number
  name: string
  artifact?: number   // artifact victory-point value sitting in this room (undefined = none)
  swordCost: number   // swords to ENTER this room (a blocked/monster passage); 0 = free
}

export const ROOMS: RoomDef[] = [
  { id: 0, name: 'Surface',        swordCost: 0 },
  { id: 1, name: 'Entry Hall',     swordCost: 0 },
  { id: 2, name: 'Old Cellar',     swordCost: 0 },
  { id: 3, name: 'Goblin Warren',  swordCost: 1 },
  { id: 4, name: 'Crystal Cave',   swordCost: 0, artifact: 5 },
  { id: 5, name: 'Flooded Vault',  swordCost: 1 },
  { id: 6, name: 'Bone Pit',       swordCost: 1, artifact: 7 },
  { id: 7, name: 'Dragon Roost',   swordCost: 2, artifact: 10 },
]

export const START_ROOM = 0
export const DEEPEST = ROOMS.length - 1
export const MARKET_SIZE = 4
export const HAND_SIZE = 5
export const START_HEALTH = 10
// the dragon attacks once every DRAGON_INTERVAL completed turns (counting both players)
export const DRAGON_INTERVAL = 3

// ---- instance model ----------------------------------------------------------
let CARD_UID = 1
export interface CardInst { id: number; key: string }
function inst(key: string): CardInst { return { id: CARD_UID++, key } }
export const def = (c: CardInst): CardDef => CARDS[c.key]

export interface PlayerState {
  deck: CardInst[]       // draw pile (top = last element)
  hand: CardInst[]
  discard: CardInst[]
  played: CardInst[]     // cards played this turn (return to discard at end of turn)
  room: number           // current room index in the dungeon
  health: number
  clank: number          // accumulated noise cubes (drives dragon damage)
  gold: number
  artifact: number | null // value of the artifact being carried (null = none)
  artifacts: number[]    // banked artifact values (only count if escaped, but tracked here)
  points: number         // running card victory points (computed in scorePlayer too)
  escaped: boolean
}

export interface LogEntry { t: string; x: string }   // t: 'you'|'ai'|'sys'

export interface ClankState {
  players: [PlayerState, PlayerState]
  rooms: RoomDef[]
  marketDeck: CardInst[]
  market: (CardInst | null)[]   // the Dungeon Row
  turn: Player
  phase: Phase
  // current player's resource pools for the turn (from played cards)
  skill: number
  swords: number
  boots: number
  turnCount: number       // completed turns (both players); used for dragon cadence
  dragonAttacks: number   // how many dragon attacks have happened
  winner: Player | null
  rng: number
  seeded: boolean
  log: LogEntry[]
  actions: number         // monotonic action counter for the UI / AI tick
}

// ---- seeded RNG (mulberry32) -------------------------------------------------
function nextRand(s: ClankState): number {
  if (!s.seeded) return Math.random()
  let t = (s.rng + 0x6d2b79f5) | 0
  s.rng = t
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function shuffle<T>(a: T[], s: ClankState): T[] {
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
  for (let i = 0; i < 4; i++) d.push(inst('burgle'))    // +Skill
  for (let i = 0; i < 2; i++) d.push(inst('sidestep'))  // +Boot
  for (let i = 0; i < 2; i++) d.push(inst('scramble'))  // +Skill +Boot
  for (let i = 0; i < 2; i++) d.push(inst('stumble'))   // +Clank
  return d
}

function freshPlayer(): PlayerState {
  return {
    deck: [], hand: [], discard: [], played: [],
    room: START_ROOM, health: START_HEALTH, clank: 0, gold: 0,
    artifact: null, artifacts: [], points: 0, escaped: false,
  }
}

function buildMarketDeck(): CardInst[] {
  const d: CardInst[] = []
  for (const [key, n] of MARKET_COMPOSITION) for (let i = 0; i < n; i++) d.push(inst(key))
  return d
}

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-40)
}

const who = (p: Player) => (p === 0 ? 'You' : 'The AI')
const tag = (p: Player) => (p === 0 ? 'you' : 'ai')
const verb = (p: Player, s0: string, s1: string) => (p === 0 ? s0 : s1)

export function makeGame(seed?: number): ClankState {
  CARD_UID = 1
  const s: ClankState = {
    players: [freshPlayer(), freshPlayer()],
    rooms: ROOMS.map(r => ({ ...r })),
    marketDeck: [],
    market: [],
    turn: 0,
    phase: 'play',
    skill: 0, swords: 0, boots: 0,
    turnCount: 0,
    dragonAttacks: 0,
    winner: null,
    rng: (seed ?? 0) | 0,
    seeded: seed != null,
    log: [],
    actions: 0,
  }
  for (const p of [0, 1] as Player[]) {
    s.players[p].deck = shuffle(starterDeck(), s)
  }
  s.marketDeck = shuffle(buildMarketDeck(), s)
  for (let i = 0; i < MARKET_SIZE; i++) s.market.push(s.marketDeck.pop() ?? null)
  // both players draw an opening hand
  drawN(s.players[1], HAND_SIZE, s)
  startTurn(s)
  s.log = push(s.log, 'sys', 'Into the dungeon — grab an artifact and escape before the dragon ends you.')
  return s
}

// ---- deck mechanics ----------------------------------------------------------
function drawN(p: PlayerState, n: number, s: ClankState) {
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) {
      if (p.discard.length === 0) break
      p.deck = shuffle(p.discard, s)
      p.discard = []
    }
    const c = p.deck.pop()
    if (c) p.hand.push(c)
  }
}

// ---- turn lifecycle ----------------------------------------------------------
export function startTurn(s: ClankState): ClankState {
  if (s.winner != null) return s
  refillMarket(s)
  s.skill = 0
  s.swords = 0
  s.boots = 0
  const p = s.players[s.turn]
  // if this player already escaped, skip straight to ending their (non-)turn
  p.played = []
  drawN(p, HAND_SIZE, s)
  return s
}

function refillMarket(s: ClankState) {
  for (let i = 0; i < MARKET_SIZE; i++) {
    if (s.market[i] == null) s.market[i] = s.marketDeck.pop() ?? null
  }
}

// ---- playing cards -----------------------------------------------------------
function applyPlay(s: ClankState, c: CardInst) {
  const p = s.players[s.turn]
  const d = def(c)
  if (d.skill) s.skill += d.skill
  if (d.swords) s.swords += d.swords
  if (d.boots) s.boots += d.boots
  if (d.gold) p.gold += d.gold
  if (d.clank) p.clank += d.clank
}

export function playCard(s: ClankState, cardId: number): ClankState {
  if (s.winner != null) return s
  const p = s.players[s.turn]
  const idx = p.hand.findIndex(c => c.id === cardId)
  if (idx < 0) return s
  const c = p.hand[idx]
  p.hand.splice(idx, 1)
  p.played.push(c)
  applyPlay(s, c)
  s.actions++
  s.log = push(s.log, tag(s.turn), `${who(s.turn)} ${verb(s.turn, 'play', 'plays')} ${def(c).name}.`)
  return s
}

// Play (resolve) the whole hand, accumulating all resources.
export function playHand(s: ClankState): ClankState {
  if (s.winner != null) return s
  const p = s.players[s.turn]
  while (p.hand.length > 0) playCard(s, p.hand[0].id)
  return s
}

// alias for the resolve-resources concept (resolving the played hand into pools)
export const resolveResources = playHand

// ---- buying ------------------------------------------------------------------
export function buyCard(s: ClankState, player: Player, marketIndex: number): ClankState {
  if (s.winner != null || s.turn !== player) return s
  const c = s.market[marketIndex]
  if (c == null) return s
  const d = def(c)
  if (s.skill < d.cost) return s
  s.skill -= d.cost
  s.market[marketIndex] = null
  s.players[player].discard.push(c)
  refillMarket(s)
  s.actions++
  s.log = push(s.log, tag(player), `${who(player)} ${verb(player, 'buy', 'buys')} ${d.name} (${d.cost} skill).`)
  return s
}

// ---- movement ----------------------------------------------------------------
// can the player move from their current room to `room` (an adjacent room)?
export function canMove(s: ClankState, player: Player, room: number): boolean {
  const p = s.players[player]
  if (room < START_ROOM || room > DEEPEST) return false
  if (Math.abs(room - p.room) !== 1) return false   // only adjacent rooms
  if (s.boots < 1) return false
  // entering a deeper/blocked room may require swords
  const cost = enterSwordCost(s, p, room)
  if (s.swords < cost) return false
  return true
}

// sword cost to ENTER `room` — only charged when descending into a blocked room.
function enterSwordCost(s: ClankState, p: PlayerState, room: number): number {
  // moving toward the start (room < current) is always free of swords
  if (room <= p.room) return 0
  return s.rooms[room].swordCost
}

export function move(s: ClankState, player: Player, room: number): ClankState {
  if (s.winner != null || s.turn !== player) return s
  if (!canMove(s, player, room)) return s
  const p = s.players[player]
  const cost = enterSwordCost(s, p, room)
  s.boots -= 1
  if (cost > 0) s.swords -= cost
  p.room = room
  s.actions++
  s.log = push(s.log, tag(player),
    `${who(player)} ${verb(player, 'move', 'moves')} to ${s.rooms[room].name}.${cost > 0 ? ` (fought past — ${cost} swords)` : ''}`)
  // escaping: reaching START while carrying an artifact ends the run for that player
  if (room === START_ROOM && p.artifact != null && !p.escaped) {
    p.escaped = true
    s.log = push(s.log, tag(player), `${who(player)} ${verb(player, 'escape', 'escapes')} the dungeon with an artifact!`)
    checkEnd(s)
  }
  return s
}

// ---- fighting ----------------------------------------------------------------
// Spend swords to clear the blocked passage into the next-deeper room ahead of the pawn,
// i.e. pre-pay so a subsequent move is free. We model fight as simply not separate from
// move's sword cost, but expose a fight() that clears the immediate deeper passage's cost
// by spending swords now (handy for the UI/AI). Returns state unchanged if not affordable.
export function fight(s: ClankState, player: Player): ClankState {
  if (s.winner != null || s.turn !== player) return s
  const p = s.players[player]
  const next = p.room + 1
  if (next > DEEPEST) return s
  const cost = s.rooms[next].swordCost
  if (cost <= 0 || s.swords < cost) return s
  // mark the passage cleared for this turn by zeroing its effective cost via a move
  // (we simply perform the descend move which already charges swords)
  if (s.boots < 1) return s
  return move(s, player, next)
}

// ---- grabbing artifacts ------------------------------------------------------
export function grabArtifact(s: ClankState, player: Player): ClankState {
  if (s.winner != null || s.turn !== player) return s
  const p = s.players[player]
  const room = s.rooms[p.room]
  if (room.artifact == null) return s
  if (p.artifact != null) return s   // already carrying one (simplified: carry one at a time)
  p.artifact = room.artifact
  p.points += 0   // artifact value counted in scorePlayer
  // remove the artifact from the room so the opponent can't also take it
  s.rooms[p.room] = { ...room, artifact: undefined }
  s.actions++
  s.log = push(s.log, tag(player), `${who(player)} ${verb(player, 'grab', 'grabs')} an artifact worth ${p.artifact}!`)
  return s
}

// ---- dragon ------------------------------------------------------------------
// The dragon attacks: each non-escaped player loses health equal to their clank (noise).
// Guarded/injectable: pass `force` true to attack regardless of cadence (tests/AI), or
// call shouldDragonAttack() to consult the cadence.
export function shouldDragonAttack(s: ClankState): boolean {
  return s.turnCount > 0 && s.turnCount % DRAGON_INTERVAL === 0
}

export function dragonAttack(s: ClankState, force = false): ClankState {
  if (s.winner != null) return s
  if (!force && !shouldDragonAttack(s)) return s
  s.dragonAttacks++
  let any = false
  for (const pl of [0, 1] as Player[]) {
    const p = s.players[pl]
    if (p.escaped) continue
    const dmg = p.clank
    if (dmg > 0) {
      p.health = Math.max(0, p.health - dmg)
      any = true
      s.log = push(s.log, 'sys', `Dragon attack! ${who(pl)} ${verb(pl, 'lose', 'loses')} ${dmg} health (clank ${p.clank}).`)
    }
  }
  if (!any) s.log = push(s.log, 'sys', 'The dragon stirs — but the dungeon is quiet (no clank).')
  s.actions++
  checkEnd(s)
  return s
}

// ---- end / win ---------------------------------------------------------------
function alive(p: PlayerState): boolean { return p.health > 0 }

function checkEnd(s: ClankState): boolean {
  if (s.winner != null) return true
  const [p0, p1] = s.players
  const dead0 = !alive(p0), dead1 = !alive(p1)

  // both dead → higher score wins (ties → player 0); whoever banked more
  if (dead0 && dead1) {
    const sc0 = scorePlayer(s, 0), sc1 = scorePlayer(s, 1)
    s.winner = sc1 > sc0 ? 1 : 0
    s.phase = 'over'
    s.log = push(s.log, 'sys', `Both adventurers fall. ${who(s.winner)} banked more — ${who(s.winner)} ${verb(s.winner, 'win', 'wins')}.`)
    return true
  }
  // one escaped → the game ends, scores compared (dead non-escapee scores 0 effectively)
  const esc0 = p0.escaped, esc1 = p1.escaped
  if (esc0 || esc1) {
    const sc0 = scorePlayer(s, 0), sc1 = scorePlayer(s, 1)
    s.winner = sc1 > sc0 ? 1 : 0
    s.phase = 'over'
    s.log = push(s.log, 'sys', `${who(s.winner)} ${verb(s.winner, 'win', 'wins')} the expedition (score ${sc0} – ${sc1}).`)
    return true
  }
  // one dead, the other still in the dungeon → the survivor keeps going; if survivor
  // can no longer hope to win we still let play continue; declare winner only if the
  // survivor has no path (handled by escape). If exactly one dead, the other wins by
  // default once they also can't continue — but to keep the game bounded, a single death
  // ends it with the survivor winning if they out-score the corpse.
  if (dead0 || dead1) {
    const survivor: Player = dead0 ? 1 : 0
    const sc0 = scorePlayer(s, 0), sc1 = scorePlayer(s, 1)
    s.winner = sc1 > sc0 ? 1 : (sc0 > sc1 ? 0 : survivor)
    s.phase = 'over'
    s.log = push(s.log, 'sys', `${who(dead0 ? 0 : 1)} ${verb(dead0 ? 0 : 1, 'die', 'dies')}. ${who(s.winner)} ${verb(s.winner, 'win', 'wins')}.`)
    return true
  }
  return false
}

// ---- scoring -----------------------------------------------------------------
// score = carried/banked artifact value + gold + card victory points.
// A player who died WITHOUT escaping forfeits their artifact value (didn't bank it),
// but keeps gold + card points. An escaped player banks everything.
export function scorePlayer(s: ClankState, player: Player): number {
  const p = s.players[player]
  let pts = 0
  // card victory points across the whole deck
  for (const c of allCards(p)) pts += def(c).points ?? 0
  // gold
  pts += p.gold
  // artifact: banked if escaped, else only counts if still alive (carrying it out is pending)
  const banked = p.artifacts.reduce((a, b) => a + b, 0)
  pts += banked
  if (p.artifact != null) {
    if (p.escaped) pts += p.artifact
    else if (alive(p)) pts += p.artifact   // still carrying, still alive → provisional credit
    // dead & not escaped → artifact lost (0)
  }
  return pts
}

function allCards(p: PlayerState): CardInst[] {
  return [...p.deck, ...p.hand, ...p.discard, ...p.played]
}

// ---- end turn ----------------------------------------------------------------
export function endTurn(s: ClankState): ClankState {
  if (s.winner != null) return s
  const me = s.turn
  const p = s.players[me]
  // played cards + any unplayed hand → discard
  for (const c of p.played) p.discard.push(c)
  for (const c of p.hand) p.discard.push(c)
  p.hand = []
  p.played = []

  s.turnCount++
  s.actions++

  // dragon cadence check at the boundary
  if (shouldDragonAttack(s)) dragonAttack(s)
  if (s.winner != null) return s

  // pass to the other player; if they've escaped, skip them and bounce back
  s.turn = (me === 0 ? 1 : 0)
  startTurn(s)
  return s
}

// ---- AI ----------------------------------------------------------------------
// Greedy: buy strong cards, push toward the nearest artifact, grab it, then retreat to
// escape — but bail toward the exit if clank/health makes the dragon lethal.
function buyValue(d: CardDef): number {
  let v = 0
  v += (d.skill ?? 0) * 1.0
  v += (d.swords ?? 0) * 1.1
  v += (d.boots ?? 0) * 1.2
  v += (d.gold ?? 0) * 0.9
  v += (d.points ?? 0) * 1.6
  v -= (d.clank ?? 0) * 0.6
  return v - d.cost * 0.2
}

// The AI plays its WHOLE turn in one call. The driver re-arms via s.actions (the tick).
export function aiTurn(s: ClankState): ClankState {
  if (s.winner != null || s.turn !== 1) return s
  const me: Player = 1
  const p = s.players[me]

  // already escaped: nothing to do but pass.
  if (p.escaped) { endTurn(s); return s }

  // 1) resolve the whole hand into resource pools
  playHand(s)
  if (s.winner != null) return s

  // 2) decide intent: are we in danger? high clank + low health → flee.
  const danger = p.clank >= Math.max(2, p.health - 1)
  const carrying = p.artifact != null

  // grab artifact if standing on one and not carrying
  if (!carrying && s.rooms[p.room].artifact != null) {
    grabArtifact(s, me)
  }
  const nowCarrying = p.artifact != null

  // 3) buy greedily while we still want to invest (don't over-buy when fleeing late)
  let guard = 0
  while (guard++ < 12) {
    let best = -Infinity, bestIdx = -1
    for (let i = 0; i < s.market.length; i++) {
      const c = s.market[i]
      if (c == null) continue
      const d = def(c)
      if (d.cost > s.skill) continue
      const val = buyValue(d)
      if (val > best) { best = val; bestIdx = i }
    }
    if (bestIdx < 0) break
    buyCard(s, me, bestIdx)
  }

  // 4) movement. Target room: if carrying or in danger → head to START (escape);
  //    otherwise → descend toward the nearest remaining artifact.
  let mguard = 0
  while (mguard++ < 20 && s.boots > 0 && s.winner == null) {
    const goingUp = nowCarrying || danger
    if (goingUp) {
      // move toward START (room - 1); free of swords
      if (p.room <= START_ROOM) break
      if (!move(s, me, p.room - 1)) break
      if (s.winner != null) return s
    } else {
      // descend toward the next artifact room
      const target = nextArtifactRoom(s, p.room)
      if (target == null || target <= p.room) break
      const next = p.room + 1
      const cost = s.rooms[next].swordCost
      if (s.swords < cost) break   // can't fight past — stop
      if (!move(s, me, next)) break
      // if we just stepped onto an artifact room, grab it
      if (s.rooms[p.room].artifact != null && p.artifact == null) grabArtifact(s, me)
      if (p.artifact != null) break   // got it — stop descending, retreat next turn
    }
  }
  if (s.winner != null) return s

  // 5) end turn
  endTurn(s)
  return s
}

// nearest deeper room (>= current) that still holds an artifact
function nextArtifactRoom(s: ClankState, from: number): number | null {
  for (let i = from; i <= DEEPEST; i++) {
    if (s.rooms[i].artifact != null) return i
  }
  // none deeper-or-equal still has one; look anywhere deeper
  for (let i = from + 1; i <= DEEPEST; i++) {
    if (s.rooms[i].artifact != null) return i
  }
  return null
}

// ---- queries -----------------------------------------------------------------
export function winner(s: ClankState): Player | null { return s.winner }
