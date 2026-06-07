/* THE QUACKS OF QUEDLINBURG — logic (built for this codebase, not ported).
   Push-your-luck bag-building. You (player 0) vs the AI (player 1). Each player owns a
   BAG of ingredient CHIPS and a POT (a spiral track). Each round both draw chips one at a
   time; each chip advances the pot pointer by the chip's VALUE (1/2/4). WHITE chips
   (cherry bombs, values 1/2/3) are dangerous: track the running white total — if it
   EXCEEDS 7 your pot EXPLODES (you bust). You may STOP any time. At round end the space
   reached gives VICTORY POINTS and COINS: if you did not explode you get both, if you
   exploded you get EITHER points OR coins (not both). Spend coins to BUY colored chips
   into your bag. 9 rounds; most VP wins.

   No React / DOM in this module. Randomness for drawing is injectable (a guarded RNG on
   the state) so tests are deterministic. */

export type Color = 'white' | 'orange' | 'green' | 'blue' | 'red' | 'purple'

export interface Chip {
  id: number
  color: Color
  value: number
}

export interface ShopItem {
  id: string
  color: Color
  value: number
  cost: number
  label: string
  effect: string
}

export interface PlayerState {
  seat: number
  name: string
  /** The full bag (every chip the player owns), as a multiset/array of chips. */
  bag: Chip[]
  /** Chips remaining undrawn in the bag THIS round (the live draw pool). */
  pool: Chip[]
  /** Chips drawn this round, in order. */
  drawn: Chip[]
  /** Pot pointer = sum of drawn chip values (the space reached on the track). */
  pos: number
  /** Running total of WHITE chip values drawn this round. */
  whiteTotal: number
  /** Did the pot explode this round? */
  exploded: boolean
  /** Has the player finished drawing this round (stopped or exploded)? */
  done: boolean
  coins: number
  vp: number
}

export type Phase = 'draw' | 'shop' | 'over'

export interface LogEntry { t: string; x: string }

export interface QuacksState {
  players: [PlayerState, PlayerState]
  round: number
  phase: Phase
  /** Whose turn it is to act (0 = you, 1 = AI). In draw phase both must finish. */
  turn: number
  shop: ShopItem[]
  winner: number | null
  /** Monotonic step counter so the AI driver re-arms each sub-step. */
  step: number
  /** RNG state (LCG) — guarded/injectable so draws are deterministic in tests. */
  rng: number
  log: LogEntry[]
}

export const ROUNDS = 9
export const EXPLODE_LIMIT = 7 // white total must EXCEED this to explode

/** The pot track length. Each space n (1-based) is worth VP and coins. */
export const TRACK_LEN = 35

/** Victory points for reaching a given pot position (more = more, capped at track end). */
export function vpForPos(pos: number): number {
  const p = Math.min(pos, TRACK_LEN)
  if (p <= 0) return 0
  // Smooth ramp: roughly pos/3, so deep pots are worth a handful of VP.
  return Math.floor(p / 3)
}

/** Coins earned for reaching a given pot position (1 coin per space, capped). */
export function coinsForPos(pos: number): number {
  return Math.min(Math.max(pos, 0), TRACK_LEN)
}

/** The buyable ingredient shop. Effects are simplified to value/scoring. */
export const SHOP: ShopItem[] = [
  { id: 'orange2', color: 'orange', value: 2, cost: 4, label: 'Pumpkin', effect: 'value 2 — steady advance' },
  { id: 'orange4', color: 'orange', value: 4, cost: 8, label: 'Big Pumpkin', effect: 'value 4 — big advance' },
  { id: 'green1', color: 'green', value: 1, cost: 4, label: 'Mandrake', effect: 'value 1 — +1 bonus VP at round end' },
  { id: 'blue1', color: 'blue', value: 1, cost: 5, label: 'Crow Skull', effect: 'value 1 — draw an extra chip free' },
  { id: 'red2', color: 'red', value: 2, cost: 6, label: 'Toadstool', effect: 'value 2 — +1 coin at round end' },
  { id: 'purple1', color: 'purple', value: 1, cost: 7, label: 'Locoweed', effect: 'value 1 — +2 VP if you do not explode' },
]

let nextChipId = 1
function mkChip(color: Color, value: number): Chip {
  return { id: nextChipId++, color, value }
}

/** Starting bag (classic-ish): a few white cherry bombs + a couple orange + a green. */
function startingBag(): Chip[] {
  return [
    mkChip('white', 1),
    mkChip('white', 1),
    mkChip('white', 1),
    mkChip('white', 2),
    mkChip('white', 3),
    mkChip('orange', 1),
    mkChip('orange', 1),
    mkChip('green', 1),
  ]
}

function mkPlayer(seat: number, name: string): PlayerState {
  const bag = startingBag()
  return {
    seat,
    name,
    bag,
    pool: bag.slice(),
    drawn: [],
    pos: 0,
    whiteTotal: 0,
    exploded: false,
    done: false,
    coins: 0,
    vp: 0,
  }
}

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

export function makeGame(seed?: number): QuacksState {
  nextChipId = 1
  const you = mkPlayer(0, 'You')
  const ai = mkPlayer(1, 'Hex the Witch')
  return {
    players: [you, ai],
    round: 1,
    phase: 'draw',
    turn: 0,
    shop: SHOP,
    winner: null,
    step: 0,
    rng: (seed == null ? ((Math.random() * 1e9) | 0) + 1 : seed) >>> 0 || 1,
    log: [{ t: 'sys', x: 'Brew your potion! Draw chips to fill your pot — but keep white cherry bombs at 7 or under, or it explodes.' }],
  }
}

// ----- RNG (LCG) — deterministic, guarded -----
function nextRng(rng: number): { rng: number; r: number } {
  // Numerical Recipes LCG
  const next = (Math.imul(rng, 1664525) + 1013904223) >>> 0
  return { rng: next, r: next / 0x100000000 }
}

// ----- Reset a player's bag for a fresh round -----
function freshRound(p: PlayerState): PlayerState {
  return {
    ...p,
    pool: p.bag.slice(),
    drawn: [],
    pos: 0,
    whiteTotal: 0,
    exploded: false,
    done: false,
  }
}

/** How many white chips remain in a player's draw pool. */
export function whitesLeft(p: PlayerState): number {
  return p.pool.filter(c => c.color === 'white').length
}

/** Sum of white values still lurking in the pool. */
export function whiteValueLeft(p: PlayerState): number {
  return p.pool.filter(c => c.color === 'white').reduce((a, c) => a + c.value, 0)
}

/**
 * Probability the NEXT single draw pushes the white total over the limit.
 * = (# pool whites whose value would push whiteTotal past EXPLODE_LIMIT) / poolSize.
 */
export function nextDrawBustProb(p: PlayerState): number {
  if (p.pool.length === 0) return 0
  const room = EXPLODE_LIMIT - p.whiteTotal
  const busters = p.pool.filter(c => c.color === 'white' && c.value > room).length
  return busters / p.pool.length
}

/**
 * Draw one chip for a player from the pool. Guarded: no-op if not in draw phase,
 * player already done, or pool empty. Uses the state RNG (deterministic).
 */
export function drawChip(s: QuacksState, player: number): QuacksState {
  if (s.phase !== 'draw') return s
  const p = s.players[player]
  if (p.done || p.pool.length === 0) return s

  const { rng, r } = nextRng(s.rng)
  const idx = Math.floor(r * p.pool.length) % p.pool.length
  const pool = p.pool.slice()
  const [chip] = pool.splice(idx, 1)

  let drawn = p.drawn.concat([chip])
  let pos = p.pos + chip.value
  let whiteTotal = p.whiteTotal
  if (chip.color === 'white') whiteTotal += chip.value

  const who = player === 0 ? 'You' : 'Hex'
  let log = push(s.log, player === 0 ? 'you' : 'foe',
    `${who} drew ${chip.color} ${chip.value}${chip.color === 'white' ? ` (bombs: ${whiteTotal})` : ''}.`)

  let exploded = false
  let done = false
  if (whiteTotal > EXPLODE_LIMIT) {
    exploded = true
    done = true
    log = push(log, 'sys', `${who} POT EXPLODED — bombs hit ${whiteTotal}!`)
  } else if (chip.color === 'blue') {
    // blue = "Crow Skull": draw an extra chip free is reflected by it being cheap to
    // continue; simplified — no forced extra draw needed (the player just keeps going).
  }

  const np: PlayerState = { ...p, pool, drawn, pos, whiteTotal, exploded, done }
  const players = clonePlayers(s.players, player, np)
  return { ...s, players, rng, step: s.step + 1, log }
}

/** Player voluntarily stops drawing this round. */
export function stop(s: QuacksState, player: number): QuacksState {
  if (s.phase !== 'draw') return s
  const p = s.players[player]
  if (p.done) return s
  const who = player === 0 ? 'You' : 'Hex'
  const log = push(s.log, player === 0 ? 'you' : 'foe', `${who} stopped at space ${p.pos}.`)
  const np: PlayerState = { ...p, done: true }
  const players = clonePlayers(s.players, player, np)
  return { ...s, players, step: s.step + 1, log }
}

function clonePlayers(players: [PlayerState, PlayerState], idx: number, np: PlayerState): [PlayerState, PlayerState] {
  return (idx === 0 ? [np, players[1]] : [players[0], np]) as [PlayerState, PlayerState]
}

/** Per-player chip effects applied at scoring (simplified). Returns {vp, coins}. */
function scorePlayer(p: PlayerState): { vp: number; coins: number } {
  let vp = vpForPos(p.pos)
  let coins = coinsForPos(p.pos)
  // chip effects from chips actually DRAWN this round
  for (const c of p.drawn) {
    if (c.color === 'green') vp += 1            // Mandrake: +1 bonus VP
    if (c.color === 'red') coins += 1           // Toadstool: +1 coin
    if (c.color === 'purple' && !p.exploded) vp += 2 // Locoweed: +2 VP if safe
  }
  return { vp, coins }
}

/**
 * Resolve the round for BOTH players: bank VP + coins (explode → points OR coins,
 * the better of the two), advance round / move to shop or end the game.
 */
export function resolveRound(s: QuacksState): QuacksState {
  if (s.phase !== 'draw') return s
  if (!s.players[0].done || !s.players[1].done) return s

  let log = s.log
  const scored = s.players.map((p) => {
    const { vp, coins } = scorePlayer(p)
    let gainVp = vp
    let gainCoins = coins
    if (p.exploded) {
      // EITHER points OR coins (not both) — take whichever is larger in magnitude.
      if (vp >= coins) gainCoins = 0
      else gainVp = 0
    }
    const who = p.seat === 0 ? 'You' : 'Hex'
    log = push(log, p.seat === 0 ? 'you' : 'foe',
      `${who}${p.exploded ? ' (exploded)' : ''} bank +${gainVp} VP, +${gainCoins} coins.`)
    return { ...p, vp: p.vp + gainVp, coins: p.coins + gainCoins }
  }) as [PlayerState, PlayerState]

  const last = s.round >= ROUNDS
  if (last) {
    const [a, b] = scored
    const winner = a.vp === b.vp ? (a.coins >= b.coins ? 0 : 1) : (a.vp > b.vp ? 0 : 1)
    log = push(log, winner === 0 ? 'win' : 'lose',
      winner === 0 ? `You win the brewing contest — ${a.vp} VP!` : `${b.name} wins — ${b.vp} VP.`)
    return { ...s, players: scored, phase: 'over', winner, step: s.step + 1, log }
  }

  log = push(log, 'sys', `Round ${s.round} done — spend coins in the shop, then brew on.`)
  return { ...s, players: scored, phase: 'shop', turn: 0, step: s.step + 1, log }
}

/** Buy a shop chip for a player: deduct coins, add chip to the bag. Guarded. */
export function buyChip(s: QuacksState, player: number, chipId: string): QuacksState {
  if (s.phase !== 'shop') return s
  const item = s.shop.find(i => i.id === chipId)
  if (item == null) return s
  const p = s.players[player]
  if (p.coins < item.cost) return s

  const chip = mkChip(item.color, item.value)
  const np: PlayerState = { ...p, coins: p.coins - item.cost, bag: p.bag.concat([chip]) }
  const players = clonePlayers(s.players, player, np)
  const who = player === 0 ? 'You' : 'Hex'
  const log = push(s.log, player === 0 ? 'you' : 'foe', `${who} bought ${item.label} (${item.value}) for ${item.cost} coins.`)
  return { ...s, players, step: s.step + 1, log }
}

/** End the shop phase: start the next round (fresh bags) for both players. */
export function endShop(s: QuacksState): QuacksState {
  if (s.phase !== 'shop') return s
  const players = [freshRound(s.players[0]), freshRound(s.players[1])] as [PlayerState, PlayerState]
  const log = push(s.log, 'sys', `Round ${s.round + 1} — fill your pots!`)
  return { ...s, players, round: s.round + 1, phase: 'draw', turn: 0, step: s.step + 1, log }
}

// ===================== AI =====================

/**
 * AI draw policy: keep drawing while the chance the next draw busts is acceptably low,
 * and stop once it's made decent progress or risk climbs. Cheap and fast.
 */
function aiShouldStop(p: PlayerState): boolean {
  if (p.pool.length === 0) return true
  const risk = nextDrawBustProb(p)
  // The deeper in the pot we already are, the more we have to lose -> stop sooner.
  // Early on, push through low risk.
  if (risk <= 0) return false
  if (p.pos >= 20) return risk >= 0.18
  if (p.pos >= 12) return risk >= 0.30
  return risk >= 0.45
}

/** AI shop policy: buy the best affordable chip that improves the engine, greedily. */
function aiBuy(s: QuacksState): QuacksState {
  const p = s.players[1]
  // Prefer value/utility per coin; lean toward orange advance + a green for VP.
  const affordable = s.shop.filter(i => i.cost <= p.coins)
  if (affordable.length === 0) return endShop(s)
  // Score: advance value + small scoring bonus, normalized by cost.
  const ranked = affordable
    .map(i => {
      let worth = i.value
      if (i.color === 'green' || i.color === 'purple') worth += 1.2
      if (i.color === 'red') worth += 0.6
      if (i.color === 'white') worth -= 5
      return { i, eff: worth / i.cost }
    })
    .sort((a, b) => b.eff - a.eff)
  const pick = ranked[0].i
  // Only buy if it's a reasonable deal; otherwise stop to save coins (cap one buy/round here).
  return buyChip(s, 1, pick.id)
}

/**
 * One AI sub-step. Handles BOTH phases:
 *  - draw phase, AI not done: draw or stop.
 *  - shop phase: make one purchase (or end shop).
 * Resolves the round when both players are done drawing.
 * Returns the same state if there's nothing for the AI to do (caller stops ticking).
 */
export function aiTurn(s: QuacksState): QuacksState {
  if (s.winner != null) return s

  if (s.phase === 'draw') {
    const ai = s.players[1]
    if (!ai.done) {
      if (aiShouldStop(ai)) return stop(s, 1)
      return drawChip(s, 1)
    }
    // AI is done; if you are too, resolve. Otherwise wait for you (no-op).
    if (s.players[0].done) return resolveRound(s)
    return s
  }

  if (s.phase === 'shop') {
    // AI buys at most a couple chips per round, then ends the shop for both.
    const ai = s.players[1]
    const cheapest = Math.min(...s.shop.map(i => i.cost))
    if (ai.coins >= cheapest && ai.bag.length < 18) {
      return aiBuy(s)
    }
    return endShop(s)
  }

  return s
}

/** Convenience: current winner (or null). */
export function winner(s: QuacksState): number | null {
  return s.winner
}
