/* WINGSPAN (card engine) — simplified 2-player engine-builder.

   You (0) vs a greedy AI (1). Each player has a personal board with three HABITAT
   rows, each holding up to a fixed number of placed birds left-to-right:
     FOREST    — GAIN FOOD action (food scales with birds already in the row)
     GRASSLAND — LAY EGGS action (eggs scale with birds already in the row)
     WETLAND   — DRAW CARDS action (cards scale with birds already in the row)

   Resources are collapsed to generic FOOD tokens, plus EGGS (laid onto birds, up to
   each bird's capacity) and BIRD CARDS in hand.

   On your turn you take ONE of four actions by spending an action cube:
     PLAY A BIRD  — pay its food cost (+1 egg per bird already in that row's column
                    beyond the first, the classic Wingspan "egg tax") and place it
                    in the leftmost open slot of its habitat.
     GAIN FOOD    — gain (1 + birds in forest) food + trigger forest powers L→R.
     LAY EGGS     — lay (1 + birds in grassland) eggs onto your birds + grassland powers.
     DRAW CARDS   — draw (1 + birds in wetland) cards + trigger wetland powers.

   Powers (when the bird's habitat action is taken, left-to-right):
     'food'  +1 food
     'egg'   +1 egg onto this bird (respecting capacity)
     'draw'  +1 card
     null    no power

   The game runs a fixed number of TURNS each (each turn = one action cube). With
   TURNS_EACH cubes apiece the game is strictly bounded. SCORING = sum of bird point
   values + eggs sitting on birds + cached/leftover food (1 pt per 3 food).

   Pure / DOM-free. The deck is shuffled with an injectable RNG; tests pass a fixed deck. */

export type Habitat = 'forest' | 'grassland' | 'wetland'
export type Power = 'food' | 'egg' | 'draw' | null

export const HABITATS: Habitat[] = ['forest', 'grassland', 'wetland']
export const ROW_SIZE = 5
export const TURNS_EACH = 8
export const TRAY_SIZE = 3

export interface BirdDef {
  id: string
  name: string
  habitat: Habitat
  cost: number          // food cost to play
  points: number        // victory points
  capacity: number      // max eggs that can sit on it
  power: Power
  short: string         // emoji glyph
}

/** A bird placed in a habitat row, carrying its laid eggs. */
export interface PlacedBird {
  defId: string
  eggs: number
}

export interface Player {
  id: number
  name: string
  rows: Record<Habitat, PlacedBird[]>
  food: number
  hand: string[]        // bird def ids in hand
  cubesLeft: number
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface State {
  players: Player[]
  deck: string[]        // draw pile of bird def ids (top = end)
  tray: string[]        // face-up bird cards anyone may draw
  turn: number          // whose turn (0 or 1)
  round: number         // informational: turns taken so far / 2 + 1
  scores: number[]
  winner: number | null // 0, 1, or -1 for a tie
  log: LogEntry[]
}

// ---------------- Bird catalogue (trimmed set, ~6 per habitat) ----------------
export const BIRDS: BirdDef[] = [
  // FOREST — cheaper, food-leaning powers
  { id: 'robin',     name: 'American Robin',  habitat: 'forest',    cost: 1, points: 2, capacity: 4, power: 'food', short: '🐦' },
  { id: 'jay',       name: 'Blue Jay',        habitat: 'forest',    cost: 2, points: 3, capacity: 3, power: 'food', short: '🐤' },
  { id: 'wood',      name: 'Woodpecker',      habitat: 'forest',    cost: 2, points: 2, capacity: 2, power: 'draw', short: '🪶' },
  { id: 'owl',       name: 'Great Horned Owl',habitat: 'forest',    cost: 3, points: 5, capacity: 2, power: 'food', short: '🦉' },
  { id: 'cardinal',  name: 'Cardinal',        habitat: 'forest',    cost: 1, points: 1, capacity: 5, power: 'egg',  short: '🐲' },
  { id: 'hawk',      name: 'Red-tailed Hawk', habitat: 'forest',    cost: 4, points: 6, capacity: 2, power: null,   short: '🦅' },

  // GRASSLAND — egg-leaning, big capacities
  { id: 'sparrow',   name: 'House Sparrow',   habitat: 'grassland', cost: 1, points: 1, capacity: 5, power: 'egg',  short: '🐧' },
  { id: 'quail',     name: 'California Quail',habitat: 'grassland', cost: 2, points: 2, capacity: 4, power: 'egg',  short: '🐔' },
  { id: 'turkey',    name: 'Wild Turkey',     habitat: 'grassland', cost: 3, points: 5, capacity: 6, power: null,   short: '🦃' },
  { id: 'meadow',    name: 'Meadowlark',      habitat: 'grassland', cost: 2, points: 3, capacity: 3, power: 'food', short: '🐥' },
  { id: 'pheasant',  name: 'Ring-necked Pheasant', habitat: 'grassland', cost: 4, points: 6, capacity: 4, power: null, short: '🐦‍⬛' },
  { id: 'killdeer',  name: 'Killdeer',        habitat: 'grassland', cost: 1, points: 2, capacity: 3, power: 'draw', short: '🕊️' },

  // WETLAND — draw-leaning, point-dense
  { id: 'duck',      name: 'Mallard Duck',    habitat: 'wetland',   cost: 1, points: 2, capacity: 3, power: 'draw', short: '🦆' },
  { id: 'heron',     name: 'Great Blue Heron',habitat: 'wetland',   cost: 3, points: 5, capacity: 2, power: 'draw', short: '🦩' },
  { id: 'swan',      name: 'Trumpeter Swan',  habitat: 'wetland',   cost: 4, points: 6, capacity: 3, power: null,   short: '🦢' },
  { id: 'pelican',   name: 'Pelican',         habitat: 'wetland',   cost: 2, points: 3, capacity: 2, power: 'food', short: '🐦' },
  { id: 'goose',     name: 'Canada Goose',    habitat: 'wetland',   cost: 2, points: 2, capacity: 4, power: 'egg',  short: '🪿' },
  { id: 'kingfisher',name: 'Kingfisher',      habitat: 'wetland',   cost: 1, points: 1, capacity: 4, power: 'draw', short: '🐦' },
]

export const BIRD: Record<string, BirdDef> = Object.fromEntries(BIRDS.map(b => [b.id, b]))

// ---------------- helpers ----------------

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-40)
}

function clonePlayer(p: Player): Player {
  return {
    id: p.id,
    name: p.name,
    rows: {
      forest: p.rows.forest.map(b => ({ ...b })),
      grassland: p.rows.grassland.map(b => ({ ...b })),
      wetland: p.rows.wetland.map(b => ({ ...b })),
    },
    food: p.food,
    hand: p.hand.slice(),
    cubesLeft: p.cubesLeft,
  }
}

function clone(s: State): State {
  return {
    players: s.players.map(clonePlayer),
    deck: s.deck.slice(),
    tray: s.tray.slice(),
    turn: s.turn,
    round: s.round,
    scores: s.scores.slice(),
    winner: s.winner,
    log: s.log.slice(),
  }
}

/** Number of birds in a habitat row. */
export function rowCount(p: Player, h: Habitat): number {
  return p.rows[h].length
}

/** Amount produced by a habitat action: 1 + birds already present (engine scaling). */
export function produce(p: Player, h: Habitat): number {
  return 1 + rowCount(p, h)
}

/** Egg "tax" to play a bird into a habitat: birds beyond the first cost 1 egg each
    (drawn from eggs already sitting on your birds). Returns the eggs required. */
export function eggCost(p: Player, h: Habitat): number {
  return Math.max(0, rowCount(p, h) - (ROW_SIZE - 2))
}

/** Total eggs sitting on a player's birds (the pool an egg-tax can be paid from). */
export function totalEggs(p: Player): number {
  let n = 0
  for (const h of HABITATS) for (const b of p.rows[h]) n += b.eggs
  return n
}

/** Remove `n` eggs from a player's birds (rightmost first). Mutates in place. */
function spendEggs(p: Player, n: number): void {
  let need = n
  for (const h of HABITATS) {
    const row = p.rows[h]
    for (let i = row.length - 1; i >= 0 && need > 0; i--) {
      const take = Math.min(row[i].eggs, need)
      row[i].eggs -= take
      need -= take
    }
  }
}

/** Lay up to `n` eggs across a player's birds, respecting per-bird capacity.
    Fills left-to-right, topping each bird before moving on. Returns eggs actually laid. */
function layEggsOnBirds(p: Player, n: number): number {
  let laid = 0
  for (const h of HABITATS) {
    for (const b of p.rows[h]) {
      const cap = BIRD[b.defId].capacity
      const room = cap - b.eggs
      if (room <= 0) continue
      const add = Math.min(room, n - laid)
      b.eggs += add
      laid += add
      if (laid >= n) return laid
    }
  }
  return laid
}

/** Total remaining egg capacity across a player's birds. */
export function eggRoom(p: Player): number {
  let room = 0
  for (const h of HABITATS) for (const b of p.rows[h]) room += BIRD[b.defId].capacity - b.eggs
  return room
}

function drawFromDeck(s: State, p: Player, n: number): number {
  let drawn = 0
  for (let i = 0; i < n; i++) {
    const id = s.deck.pop()
    if (id == null) break
    p.hand.push(id)
    drawn++
  }
  return drawn
}

// ---------------- setup ----------------

/** Fisher–Yates with an injectable RNG. */
function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function newPlayer(id: number, name: string): Player {
  return {
    id,
    name,
    rows: { forest: [], grassland: [], wetland: [] },
    food: 0,
    hand: [],
    cubesLeft: TURNS_EACH,
  }
}

/** Build a fresh game. Pass `deck` (an explicit list of bird ids, top = end) for
    deterministic tests; otherwise the catalogue (3 copies each) is shuffled. */
export function makeGame(deck?: string[], rand: () => number = Math.random): State {
  let pile: string[]
  if (deck) {
    pile = deck.slice()
  } else {
    const base: string[] = []
    for (const b of BIRDS) for (let k = 0; k < 3; k++) base.push(b.id)
    pile = shuffle(base, rand)
  }

  const s: State = {
    players: [newPlayer(0, 'You'), newPlayer(1, 'Rival')],
    deck: pile,
    tray: [],
    turn: 0,
    round: 1,
    scores: [0, 0],
    winner: null,
    log: [{ t: 'sys', x: 'Build your engine: play birds, gain food, lay eggs, draw cards. Most points after 8 turns each wins.' }],
  }

  // Deal a starting hand of 4 cards each and food 2 each.
  for (const p of s.players) {
    drawFromDeck(s, p, 4)
    p.food = 2
  }
  // Fill the face-up tray.
  refillTray(s)
  return s
}

function refillTray(s: State): void {
  while (s.tray.length < TRAY_SIZE) {
    const id = s.deck.pop()
    if (id == null) break
    s.tray.push(id)
  }
}

// ---------------- actions ----------------

export type ActionKind = 'play' | 'food' | 'eggs' | 'draw'

export interface LegalAction {
  kind: ActionKind
  /** for 'play': the bird id to play and its habitat. */
  cardId?: string
  habitat?: Habitat
}

/** All legal actions for `player` right now. GAIN FOOD / LAY EGGS / DRAW are always
    available (so there is never a deadlock); PLAY requires an affordable, fitting bird. */
export function legalActions(s: State, player: number): LegalAction[] {
  const out: LegalAction[] = []
  if (s.winner != null) return out
  if (s.turn !== player) return out
  const p = s.players[player]
  if (p.cubesLeft <= 0) return out

  for (const cardId of p.hand) {
    const def = BIRD[cardId]
    if (!def) continue
    const h = def.habitat
    if (rowCount(p, h) >= ROW_SIZE) continue
    if (p.food < def.cost) continue
    if (totalEggs(p) < eggCost(p, h)) continue
    out.push({ kind: 'play', cardId, habitat: h })
  }
  out.push({ kind: 'food' })
  out.push({ kind: 'eggs' })
  out.push({ kind: 'draw' })
  return out
}

function spendCubeAndAdvance(s: State, player: number): void {
  const p = s.players[player]
  p.cubesLeft -= 1
  // advance turn to the other player if they still have cubes; else to whoever does.
  const other = 1 - player
  if (s.players[other].cubesLeft > 0) s.turn = other
  else if (p.cubesLeft > 0) s.turn = player
  // round is informational
  const taken = (TURNS_EACH - s.players[0].cubesLeft) + (TURNS_EACH - s.players[1].cubesLeft)
  s.round = Math.floor(taken / 2) + 1
  checkEnd(s)
}

function checkEnd(s: State): void {
  if (s.winner != null) return
  if (s.players[0].cubesLeft <= 0 && s.players[1].cubesLeft <= 0) {
    s.scores = [scorePlayer(s, 0), scorePlayer(s, 1)]
    if (s.scores[0] > s.scores[1]) s.winner = 0
    else if (s.scores[1] > s.scores[0]) s.winner = 1
    else s.winner = -1
    s.log = push(s.log, 'sys', `Final — You ${s.scores[0]} · Rival ${s.scores[1]}.`)
  }
}

/** Play a bird from hand into its habitat, paying food cost + egg tax. */
export function playBird(s: State, player: number, cardId: string, habitat: Habitat): State {
  if (s.winner != null || s.turn !== player) return s
  const p0 = s.players[player]
  if (p0.cubesLeft <= 0) return s
  const def = BIRD[cardId]
  if (!def || def.habitat !== habitat) return s
  const hi = p0.hand.indexOf(cardId)
  if (hi < 0) return s
  if (rowCount(p0, habitat) >= ROW_SIZE) return s
  if (p0.food < def.cost) return s
  const tax = eggCost(p0, habitat)
  if (totalEggs(p0) < tax) return s

  const out = clone(s)
  const p = out.players[player]
  p.hand.splice(p.hand.indexOf(cardId), 1)
  p.food -= def.cost
  if (tax > 0) spendEggs(p, tax)
  p.rows[habitat].push({ defId: cardId, eggs: 0 })
  out.log = push(out.log, player === 0 ? 'you' : 'ai',
    `${p.name} played ${def.name} into the ${habitat}${tax > 0 ? ` (paid ${tax} egg${tax > 1 ? 's' : ''})` : ''}.`)
  spendCubeAndAdvance(out, player)
  return out
}

/** Trigger powers in a habitat row, left-to-right, for the given action type. */
function triggerPowers(s: State, p: Player, h: Habitat): void {
  let bonusFood = 0
  let bonusDraw = 0
  for (const b of p.rows[h]) {
    const pw = BIRD[b.defId].power
    if (pw === 'food') bonusFood++
    else if (pw === 'draw') bonusDraw++
    else if (pw === 'egg') {
      const cap = BIRD[b.defId].capacity
      if (b.eggs < cap) b.eggs++
    }
  }
  if (bonusFood > 0) p.food += bonusFood
  if (bonusDraw > 0) drawFromDeck(s, p, bonusDraw)
}

/** GAIN FOOD (forest): +produce(forest) food, then forest powers. */
export function gainFood(s: State, player: number): State {
  if (s.winner != null || s.turn !== player) return s
  const p0 = s.players[player]
  if (p0.cubesLeft <= 0) return s
  const out = clone(s)
  const p = out.players[player]
  const gained = produce(p, 'forest')
  p.food += gained
  triggerPowers(out, p, 'forest')
  out.log = push(out.log, player === 0 ? 'you' : 'ai', `${p.name} gained ${gained} food in the forest.`)
  spendCubeAndAdvance(out, player)
  return out
}

/** LAY EGGS (grassland): lay produce(grassland) eggs across birds (capacity-limited),
    then grassland powers. */
export function layEggs(s: State, player: number): State {
  if (s.winner != null || s.turn !== player) return s
  const p0 = s.players[player]
  if (p0.cubesLeft <= 0) return s
  const out = clone(s)
  const p = out.players[player]
  const n = produce(p, 'grassland')
  const laid = layEggsOnBirds(p, n)
  triggerPowers(out, p, 'grassland')
  out.log = push(out.log, player === 0 ? 'you' : 'ai', `${p.name} laid ${laid} egg${laid === 1 ? '' : 's'} in the grassland.`)
  spendCubeAndAdvance(out, player)
  return out
}

/** DRAW CARDS (wetland): draw produce(wetland) cards (from tray first, then deck),
    then wetland powers. */
export function drawCards(s: State, player: number): State {
  if (s.winner != null || s.turn !== player) return s
  const p0 = s.players[player]
  if (p0.cubesLeft <= 0) return s
  const out = clone(s)
  const p = out.players[player]
  const n = produce(p, 'wetland')
  let drawn = 0
  // draw from tray first (best available), refilling as we go, then deck
  for (let i = 0; i < n; i++) {
    if (out.tray.length > 0) {
      // pick the highest-point tray card for a slight "face-up choice" feel
      let best = 0
      for (let k = 1; k < out.tray.length; k++) {
        if (BIRD[out.tray[k]].points > BIRD[out.tray[best]].points) best = k
      }
      const id = out.tray.splice(best, 1)[0]
      p.hand.push(id)
      refillTray(out)
      drawn++
    } else {
      const got = drawFromDeck(out, p, 1)
      if (got === 0) break
      drawn++
    }
  }
  triggerPowers(out, p, 'wetland')
  out.log = push(out.log, player === 0 ? 'you' : 'ai', `${p.name} drew ${drawn} card${drawn === 1 ? '' : 's'} in the wetland.`)
  spendCubeAndAdvance(out, player)
  return out
}

// ---------------- scoring ----------------

/** Bird points + eggs sitting on birds + cached food (1 pt / 3 leftover food). */
export function scorePlayer(s: State, player: number): number {
  const p = s.players[player]
  let pts = 0
  for (const h of HABITATS) {
    for (const b of p.rows[h]) {
      pts += BIRD[b.defId].points
      pts += b.eggs
    }
  }
  pts += Math.floor(p.food / 3)
  return pts
}

// ---------------- AI ----------------

/** Marginal value of each candidate action; greedy AI runs the engine and plays
    valuable affordable birds. */
function actionScore(s: State, player: number, a: LegalAction): number {
  const p = s.players[player]
  if (a.kind === 'play' && a.cardId) {
    const def = BIRD[a.cardId]
    // value = points + future power utility - cost pressure; favor high points, cheap.
    let v = def.points * 3 + 2
    if (def.power === 'egg') v += 2
    else if (def.power === 'food') v += 1.5
    else if (def.power === 'draw') v += 1
    v += def.capacity * 0.4
    v -= def.cost * 1.2
    v -= eggCost(p, def.habitat) * 1.5
    // small bias: don't dump the whole food stock early if it leaves nothing
    return v
  }
  if (a.kind === 'food') {
    // food fuels future birds; valuable when we hold playable-if-fed birds.
    const gain = produce(p, 'forest')
    let v = gain * 1.4
    // bonus if we have unaffordable birds in hand that this could unlock
    const maxCost = p.hand.reduce((m, id) => Math.max(m, BIRD[id] ? BIRD[id].cost : 0), 0)
    if (p.food < maxCost) v += 2
    return v
  }
  if (a.kind === 'eggs') {
    const want = produce(p, 'grassland')
    const room = eggRoom(p)
    if (room <= 0) return -5
    // eggs are direct points (1 each) + enable future plays' egg tax.
    return Math.min(want, room) * 1.6
  }
  if (a.kind === 'draw') {
    const want = produce(p, 'wetland')
    // drawing only useful while we have room to play more birds & turns left.
    let v = want * 1.1
    if (p.hand.length >= 6) v -= 2
    return v
  }
  return 0
}

/** Pick and apply the AI's single best action for this turn. Returns the new state. */
export function aiTurn(s: State): State {
  if (s.winner != null) return s
  const player = s.turn
  if (player !== 1) return s // safety: only drives the Rival
  if (s.players[player].cubesLeft <= 0) return s

  const acts = legalActions(s, player)
  if (acts.length === 0) return s

  let best = acts[0]
  let bestScore = -Infinity
  for (const a of acts) {
    const sc = actionScore(s, player, a)
    if (sc > bestScore) { bestScore = sc; best = a }
  }

  if (best.kind === 'play' && best.cardId && best.habitat) return playBird(s, player, best.cardId, best.habitat)
  if (best.kind === 'food') return gainFood(s, player)
  if (best.kind === 'eggs') return layEggs(s, player)
  return drawCards(s, player)
}

export const winner = (s: State): number | null => s.winner
