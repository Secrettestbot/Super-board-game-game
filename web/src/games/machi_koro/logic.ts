/* MACHI KORO — dice city-building engine (built for this codebase).

   3 players: you (0) + two greedy AIs (1, 2). Each turn a player rolls 1 die
   (or 2 once their Train Station is built), earns income from triggered
   establishments by color rule, then builds ONE establishment or landmark (or
   passes). First to build all 4 landmarks wins.

   Color rules:
     BLUE   (primary)   — activate on ANY player's roll; bank pays the owner.
     GREEN  (secondary) — activate only on the roller's own turn; bank pays.
     RED    (restaurant)— activate on ANOTHER player's roll; that roller pays the owner.
     PURPLE (major)     — activate only on the roller's own turn; take from opponents.

   Logic is pure / DOM-free. Randomness in rollDice() is injectable for tests.            */

export type Color = 'blue' | 'green' | 'red' | 'purple'

export interface CardDef {
  id: string
  name: string
  color: Color
  cost: number
  /** Activation roll values (the totals that trigger this card). */
  rolls: number[]
  /** Base coins this card yields when it activates (semantics depend on color). */
  yield: number
  short: string
  desc: string
}

export type LandmarkId = 'train' | 'mall' | 'park' | 'radio'

export interface LandmarkDef {
  id: LandmarkId
  name: string
  cost: number
  short: string
  desc: string
}

export interface Player {
  id: number
  name: string
  coins: number
  /** cardId -> count owned. */
  est: Record<string, number>
  /** landmarkId -> built? */
  landmarks: Record<LandmarkId, boolean>
}

export type Phase = 'roll' | 'build' | 'over'

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface State {
  players: Player[]
  /** cardId -> remaining count in the shared supply. */
  supply: Record<string, number>
  turn: number          // index into players whose turn it is
  phase: Phase
  dice: number[]        // last dice rolled (1 or 2 values)
  roll: number          // sum of dice
  doubles: boolean      // were the two dice a double?
  extraTurn: boolean    // does the active player get another turn (amusement park)?
  rerolled: boolean     // has the radio-tower reroll been used this turn?
  incomeDone: boolean   // has income been resolved for the current roll?
  winner: number | null
  log: LogEntry[]
}

// ---- Card catalogue (trimmed base set, core colors covered) ----
export const CARDS: CardDef[] = [
  { id: 'wheat',     name: 'Wheat Field',        color: 'blue',   cost: 1, rolls: [1],        yield: 1, short: '🌾', desc: 'Get 1 coin from the bank, on anyone\'s turn.' },
  { id: 'ranch',     name: 'Ranch',              color: 'blue',   cost: 1, rolls: [2],        yield: 1, short: '🐄', desc: 'Get 1 coin from the bank, on anyone\'s turn.' },
  { id: 'forest',    name: 'Forest',             color: 'blue',   cost: 3, rolls: [5],        yield: 1, short: '🌲', desc: 'Get 1 coin from the bank, on anyone\'s turn.' },
  { id: 'mine',      name: 'Mine',               color: 'blue',   cost: 6, rolls: [9],        yield: 5, short: '⛏️', desc: 'Get 5 coins from the bank, on anyone\'s turn.' },
  { id: 'apple',     name: 'Apple Orchard',      color: 'blue',   cost: 3, rolls: [10],       yield: 3, short: '🍎', desc: 'Get 3 coins from the bank, on anyone\'s turn.' },

  { id: 'bakery',    name: 'Bakery',             color: 'green',  cost: 1, rolls: [2, 3],     yield: 1, short: '🍞', desc: 'Get 1 coin from the bank, on your turn only.' },
  { id: 'store',     name: 'Convenience Store',  color: 'green',  cost: 2, rolls: [4],        yield: 3, short: '🏪', desc: 'Get 3 coins from the bank, on your turn only.' },
  { id: 'cheese',    name: 'Cheese Factory',     color: 'green',  cost: 5, rolls: [7],        yield: 3, short: '🧀', desc: 'Get 3 coins per Ranch (🐄) you own, on your turn.' },
  { id: 'furniture', name: 'Furniture Factory',  color: 'green',  cost: 3, rolls: [8],        yield: 3, short: '🪑', desc: 'Get 3 coins per Forest/Mine (⛏️🌲) you own, on your turn.' },
  { id: 'market',    name: 'Fruit & Veg Market', color: 'green',  cost: 2, rolls: [11, 12],   yield: 2, short: '🥕', desc: 'Get 2 coins per Wheat/Apple field you own, on your turn.' },

  { id: 'cafe',      name: 'Cafe',               color: 'red',    cost: 2, rolls: [3],        yield: 1, short: '☕', desc: 'Take 1 coin from the roller, on their turn.' },
  { id: 'diner',     name: 'Family Restaurant',  color: 'red',    cost: 3, rolls: [9, 10],    yield: 2, short: '🍽️', desc: 'Take 2 coins from the roller, on their turn.' },

  { id: 'stadium',   name: 'Stadium',            color: 'purple', cost: 6, rolls: [6],        yield: 2, short: '🏟️', desc: 'Take 2 coins from EVERY opponent, on your turn.' },
  { id: 'tv',        name: 'TV Station',         color: 'purple', cost: 7, rolls: [6],        yield: 5, short: '📺', desc: 'Take 5 coins from ONE opponent, on your turn.' },
]

export const CARD: Record<string, CardDef> = Object.fromEntries(CARDS.map(c => [c.id, c]))

export const LANDMARKS: LandmarkDef[] = [
  { id: 'train', name: 'Train Station',  cost: 4,  short: '🚉', desc: 'Roll one or two dice on your turn.' },
  { id: 'mall',  name: 'Shopping Mall',  cost: 10, short: '🏬', desc: '+1 coin to each of your green/red yields.' },
  { id: 'park',  name: 'Amusement Park', cost: 16, short: '🎡', desc: 'Take another turn if you roll doubles.' },
  { id: 'radio', name: 'Radio Tower',    cost: 22, short: '📡', desc: 'Once per turn you may re-roll the dice.' },
]

export const LANDMARK: Record<LandmarkId, LandmarkDef> = Object.fromEntries(
  LANDMARKS.map(l => [l.id, l]),
) as Record<LandmarkId, LandmarkDef>

// cards available in the supply (count of each)
const SUPPLY_IDS = CARDS.map(c => c.id)
const SUPPLY_COUNT = 6

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-30)
}

function clone(s: State): State {
  return {
    players: s.players.map(p => ({
      ...p,
      est: { ...p.est },
      landmarks: { ...p.landmarks },
    })),
    supply: { ...s.supply },
    turn: s.turn,
    phase: s.phase,
    dice: s.dice.slice(),
    roll: s.roll,
    doubles: s.doubles,
    extraTurn: s.extraTurn,
    rerolled: s.rerolled,
    incomeDone: s.incomeDone,
    winner: s.winner,
    log: s.log.slice(),
  }
}

function newPlayer(id: number, name: string): Player {
  return {
    id,
    name,
    coins: 3,
    est: { wheat: 1, bakery: 1 },
    landmarks: { train: false, mall: false, park: false, radio: false },
  }
}

export function makeGame(): State {
  const supply: Record<string, number> = {}
  for (const id of SUPPLY_IDS) supply[id] = SUPPLY_COUNT
  return {
    players: [newPlayer(0, 'You'), newPlayer(1, 'Rival East'), newPlayer(2, 'Rival West')],
    supply,
    turn: 0,
    phase: 'roll',
    dice: [],
    roll: 0,
    doubles: false,
    extraTurn: false,
    rerolled: false,
    incomeDone: false,
    winner: null,
    log: [{ t: 'sys', x: 'Roll, earn, build. First to raise all four landmarks wins the town.' }],
  }
}

export function allLandmarks(p: Player): boolean {
  return LANDMARKS.every(l => p.landmarks[l.id])
}

export function landmarksBuilt(p: Player): number {
  return LANDMARKS.filter(l => p.landmarks[l.id]).length
}

/** Roll `count` dice (1, or 2 once Train Station is built). Sets the dice and moves to
    the build phase; income is NOT applied here so Radio Tower can re-roll cleanly — call
    resolveIncome() / applyIncome() next. `rand` is injectable for deterministic tests. */
export function rollDice(s: State, count: number, rand: () => number = Math.random): State {
  if (s.phase !== 'roll' || s.winner != null) return s
  const p0 = s.players[s.turn]
  const n = count === 2 && p0.landmarks.train ? 2 : 1
  const dice: number[] = []
  for (let i = 0; i < n; i++) dice.push(1 + Math.floor(rand() * 6))
  const sum = dice.reduce((a, b) => a + b, 0)
  const doubles = n === 2 && dice[0] === dice[1]
  const out = clone(s)
  out.dice = dice
  out.roll = sum
  out.doubles = doubles
  out.incomeDone = false
  out.phase = 'build'
  const p = out.players[out.turn]
  out.log = push(out.log, p.id === 0 ? 'you' : 'ai',
    `${p.name} rolled ${dice.join(' + ')} = ${sum}.`)
  return out
}

/** Apply income for the current roll (idempotent: only fires once). Resolves the colors
    in order red → blue → green → purple and sets the amusement-park extra-turn flag. */
export function applyIncome(s: State): State {
  if (s.phase !== 'build' || s.incomeDone || s.winner != null) return s
  const out = clone(s)
  resolveIncomeInPlace(out, out.roll, out.turn)
  out.incomeDone = true
  const p = out.players[out.turn]
  out.extraTurn = out.doubles && p.landmarks.park
  return out
}

/** Re-roll once per turn (Radio Tower). Only legal before income has been applied. */
export function reroll(s: State, count: number, rand: () => number = Math.random): State {
  if (s.phase !== 'build' || s.winner != null || s.rerolled || s.incomeDone) return s
  const p = s.players[s.turn]
  if (!p.landmarks.radio) return s
  const pre = clone(s)
  pre.phase = 'roll'
  const out = rollDice(pre, count, rand)
  out.rerolled = true
  out.log = push(out.log, p.id === 0 ? 'you' : 'ai', `${p.name} used the Radio Tower to re-roll.`)
  return out
}

/** Pure income resolution that returns a NEW state (does not mutate). */
export function resolveIncome(s: State, roll: number, roller: number): State {
  const out = clone(s)
  resolveIncomeInPlace(out, roll, roller)
  return out
}

function resolveIncomeInPlace(s: State, roll: number, roller: number): void {
  const players = s.players
  const rp = players[roller]

  // 1) RED — restaurants of OTHER players take from the roller (highest landmark? base
  //    Machi Koro resolves red before the roller's own cards; order: red, blue, green, purple).
  for (let i = 0; i < players.length; i++) {
    if (i === roller) continue
    const owner = players[i]
    for (const c of CARDS) {
      if (c.color !== 'red') continue
      const cnt = owner.est[c.id] ?? 0
      if (cnt === 0 || !c.rolls.includes(roll)) continue
      const mallBonus = owner.landmarks.mall ? 1 : 0
      const per = c.yield + mallBonus
      const want = per * cnt
      const take = Math.min(want, rp.coins)
      if (take > 0) {
        rp.coins -= take
        owner.coins += take
        s.log = push(s.log, owner.id === 0 ? 'you' : 'ai',
          `${owner.name}'s ${c.name} took ${take} from ${rp.name}.`)
      }
    }
  }

  // 2) BLUE — primary industry, activates for EVERY owner on any roll, paid by bank.
  for (const owner of players) {
    for (const c of CARDS) {
      if (c.color !== 'blue') continue
      const cnt = owner.est[c.id] ?? 0
      if (cnt === 0 || !c.rolls.includes(roll)) continue
      const gain = c.yield * cnt
      owner.coins += gain
      s.log = push(s.log, owner.id === 0 ? 'you' : 'ai',
        `${owner.name}'s ${c.name} earned ${gain}.`)
    }
  }

  // 3) GREEN — secondary, only the roller, paid by bank. Some scale off owned cards.
  for (const c of CARDS) {
    if (c.color !== 'green') continue
    const cnt = rp.est[c.id] ?? 0
    if (cnt === 0 || !c.rolls.includes(roll)) continue
    const mallBonus = rp.landmarks.mall ? 1 : 0
    let gain = 0
    if (c.id === 'cheese') {
      const ranches = rp.est['ranch'] ?? 0
      gain = c.yield * ranches * cnt + (mallBonus ? cnt : 0)
    } else if (c.id === 'furniture') {
      const gears = (rp.est['forest'] ?? 0) + (rp.est['mine'] ?? 0)
      gain = c.yield * gears * cnt + (mallBonus ? cnt : 0)
    } else if (c.id === 'market') {
      const fields = (rp.est['wheat'] ?? 0) + (rp.est['apple'] ?? 0)
      gain = c.yield * fields * cnt + (mallBonus ? cnt : 0)
    } else {
      gain = (c.yield + mallBonus) * cnt
    }
    if (gain > 0) {
      rp.coins += gain
      s.log = push(s.log, rp.id === 0 ? 'you' : 'ai',
        `${rp.name}'s ${c.name} earned ${gain}.`)
    }
  }

  // 4) PURPLE — major, only the roller, takes from opponents.
  for (const c of CARDS) {
    if (c.color !== 'purple') continue
    const cnt = rp.est[c.id] ?? 0
    if (cnt === 0 || !c.rolls.includes(roll)) continue
    if (c.id === 'stadium') {
      for (let i = 0; i < players.length; i++) {
        if (i === roller) continue
        const opp = players[i]
        const take = Math.min(c.yield, opp.coins)
        if (take > 0) { opp.coins -= take; rp.coins += take }
      }
      s.log = push(s.log, rp.id === 0 ? 'you' : 'ai', `${rp.name}'s Stadium collected from all opponents.`)
    } else if (c.id === 'tv') {
      // take from the richest opponent
      let best = -1, bestCoins = -1
      for (let i = 0; i < players.length; i++) {
        if (i === roller) continue
        if (players[i].coins > bestCoins) { bestCoins = players[i].coins; best = i }
      }
      if (best >= 0) {
        const opp = players[best]
        const take = Math.min(c.yield, opp.coins)
        if (take > 0) { opp.coins -= take; rp.coins += take }
        s.log = push(s.log, rp.id === 0 ? 'you' : 'ai', `${rp.name}'s TV Station took ${take} from ${opp.name}.`)
      }
    }
  }
}

/** Buy an establishment from the supply, OR build a landmark. Deducts coins. */
export function buy(s: State, player: number, id: string): State {
  if (s.winner != null) return s
  const out = clone(s)
  const p = out.players[player]

  // landmark?
  const lm = LANDMARKS.find(l => l.id === id)
  if (lm) {
    if (p.landmarks[lm.id] || p.coins < lm.cost) return s
    p.coins -= lm.cost
    p.landmarks[lm.id] = true
    out.log = push(out.log, p.id === 0 ? 'you' : 'ai', `${p.name} built ${lm.name}!`)
    if (allLandmarks(p)) {
      out.winner = player
      out.phase = 'over'
      out.log = push(out.log, p.id === 0 ? 'you' : 'ai', `${p.name} completed all four landmarks — ${p.name} wins!`)
    }
    return out
  }

  // establishment
  const card = CARD[id]
  if (!card) return s
  if ((out.supply[id] ?? 0) <= 0 || p.coins < card.cost) return s
  p.coins -= card.cost
  out.supply[id] = out.supply[id] - 1
  p.est[id] = (p.est[id] ?? 0) + 1
  out.log = push(out.log, p.id === 0 ? 'you' : 'ai', `${p.name} bought ${card.name}.`)
  return out
}

/** End the active player's build phase and advance (handling the doubles extra turn). */
export function endTurn(s: State): State {
  if (s.winner != null) return s
  const out = clone(s)
  if (out.extraTurn) {
    // same player rolls again (amusement park)
    out.phase = 'roll'
    out.extraTurn = false
    out.doubles = false
    out.rerolled = false
    out.dice = []
    out.roll = 0
    const p = out.players[out.turn]
    out.log = push(out.log, p.id === 0 ? 'you' : 'ai', `${p.name} rolled doubles — extra turn!`)
    return out
  }
  out.turn = (out.turn + 1) % out.players.length
  out.phase = 'roll'
  out.doubles = false
  out.rerolled = false
  out.dice = []
  out.roll = 0
  return out
}

// ---------- AI ----------

/** Does the AI prefer rolling 2 dice? Once it owns high-number engines, yes. */
function aiWantsTwoDice(p: Player): boolean {
  if (!p.landmarks.train) return false
  // count income weighted to high rolls (>=7)
  let high = 0, low = 0
  for (const c of CARDS) {
    const cnt = p.est[c.id] ?? 0
    if (cnt === 0) continue
    const max = Math.max(...c.rolls)
    if (max >= 7) high += cnt
    else low += cnt
  }
  return high >= low
}

/** AI buy priority: progress to landmarks when affordable, else income engines that
    match its dice strategy. Returns the id to buy, or null to pass. */
function aiPick(s: State, player: number): string | null {
  const p = s.players[player]
  const two = aiWantsTwoDice(p) || p.landmarks.train

  // 1) Build the cheapest unbuilt landmark we can currently afford (fastest path to win).
  const affordableLm = LANDMARKS
    .filter(l => !p.landmarks[l.id] && p.coins >= l.cost)
    .sort((a, b) => a.cost - b.cost)
  // Always grab Train Station early; otherwise grab a landmark if we can.
  if (affordableLm.length) {
    // If we're close to a key engine and short, we still favor the landmark to win.
    return affordableLm[0].id
  }

  // 2) Otherwise buy an income engine matching strategy. Target rolls by strategy.
  const wantHigh = two
  const candidates = CARDS
    .filter(c => (s.supply[c.id] ?? 0) > 0 && p.coins >= c.cost)
    .filter(c => c.color !== 'red' || true) // allow reds too
    .map(c => {
      const max = Math.max(...c.rolls)
      const onStrategy = wantHigh ? max >= 7 : max <= 6
      // score: prefer on-strategy, then raw yield, then cheaper
      let score = (onStrategy ? 100 : 0) + c.yield * 8 - c.cost
      // mild boost for purple/red engines that disrupt opponents
      if (c.color === 'purple') score += 6
      if (c.color === 'green') score += 3
      return { id: c.id, score }
    })
    .sort((a, b) => b.score - a.score)

  if (candidates.length && candidates[0].score > 0) return candidates[0].id

  // 3) Save up (pass) if nothing worthwhile.
  return null
}

/** Run a single AI player's full turn: roll → (income already applied) → build → endTurn.
    Returns the resulting state. Loops over its own extra (doubles) turns until done. */
export function aiTurn(s: State, rand: () => number = Math.random): State {
  let out = s
  if (out.winner != null) return out
  const player = out.turn
  if (out.players[player].id === 0) return out // safety: only AI players

  // guard against runaway extra-turn loops
  let guard = 0
  while (out.winner == null && out.turn === player && guard < 50) {
    guard++
    const p = out.players[player]
    if (out.phase === 'roll') {
      const count = aiWantsTwoDice(p) ? 2 : 1
      out = rollDice(out, count, rand)
      out = applyIncome(out)
      continue
    }
    if (out.phase === 'build') {
      const pick = aiPick(out, player)
      if (pick != null) out = buy(out, player, pick)
      if (out.winner != null) break
      out = endTurn(out)
      // if endTurn kept the same player (extra turn), loop continues with phase 'roll'
      if (out.turn !== player) break
    }
  }
  return out
}

export const winner = (s: State): number | null => s.winner
