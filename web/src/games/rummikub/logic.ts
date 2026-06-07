/* RUMMIKUB — pure logic (no React/DOM).
   106 tiles: numbers 1-13 in 4 colors, TWO copies each (104) + 2 jokers.
   Melds: GROUP (3-4 of same number, all different colors) or RUN (3+ consecutive,
   same color). Jokers substitute for any tile. Initial meld must total >=30 from
   tiles coming off your rack. Win: empty your rack first. */

export type Color = 'red' | 'blue' | 'orange' | 'black'
export const COLORS: Color[] = ['red', 'blue', 'orange', 'black']

/** A tile. Jokers have num=0 and color='joker' sentinel via isJoker flag. */
export interface Tile {
  id: number
  num: number // 1..13, or 0 for joker
  color: Color | 'joker'
  joker: boolean
}

/** A meld is an ordered list of tiles (for runs, ascending; for groups, any order).
    Jokers store the value they represent at validation time, but we keep tiles raw
    and re-derive at validation so rearrangement stays honest. */
export type Meld = Tile[]

export type Player = 0 | 1

export interface RoundResult {
  by: Player
  kind: 'empty' | 'bag-empty'
  youCount: number
  aiCount: number
}

export interface LogLine {
  t: 'you' | 'ai' | 'sys'
  x: string
}

export interface State {
  racks: [Tile[], Tile[]] // racks[0] = you, racks[1] = ai
  table: Meld[]
  bag: Tile[]
  hasMelded: [boolean, boolean]
  turn: Player
  winner: Player | null
  result: RoundResult | null
  log: LogLine[]
  step: number // monotonic, bumped every AI action so useAITurn re-arms
}

export const RACK_SIZE = 14
export const INITIAL_MIN = 30
export const TILE_COUNT = 106

/* ------------------------------------------------------------------ deck */

export function fullDeck(): Tile[] {
  const tiles: Tile[] = []
  let id = 0
  for (let copy = 0; copy < 2; copy++) {
    for (const color of COLORS) {
      for (let num = 1; num <= 13; num++) {
        tiles.push({ id: id++, num, color, joker: false })
      }
    }
  }
  tiles.push({ id: id++, num: 0, color: 'joker', joker: true })
  tiles.push({ id: id++, num: 0, color: 'joker', joker: true })
  return tiles
}

/** Deterministic shuffle (mulberry32) so tests can pass a seed-derived deck. */
export function shuffled(deck: Tile[], seed: number): Tile[] {
  const a = deck.slice()
  let s = seed >>> 0
  const rand = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* ------------------------------------------------------------ meld validity */

/** Numeric value of a non-joker tile. */
function val(t: Tile): number { return t.num }

/**
 * Is this ordered list a valid meld? Jokers substitute for any needed tile.
 * GROUP: 3-4 tiles, all the same number, all DIFFERENT colors (jokers fill gaps).
 * RUN:   3+ tiles, same color, consecutive ascending numbers (jokers fill gaps).
 */
export function isValidMeld(tiles: Tile[]): boolean {
  if (tiles.length < 3) return false
  const jokers = tiles.filter((t) => t.joker).length
  const real = tiles.filter((t) => !t.joker)
  if (real.length === 0) return false // a meld of only jokers is ambiguous → reject

  // try as GROUP
  if (validGroup(real, jokers, tiles.length)) return true
  // try as RUN
  if (validRun(real, jokers, tiles.length)) return true
  return false
}

function validGroup(real: Tile[], jokers: number, total: number): boolean {
  if (total < 3 || total > 4) return false
  const num = real[0].num
  if (!real.every((t) => t.num === num)) return false
  const colors = new Set<string>()
  for (const t of real) {
    if (colors.has(t.color)) return false // duplicate color
    colors.add(t.color)
  }
  // remaining distinct colors must be >= jokers needed (each joker is a distinct unused color)
  const remainingColors = COLORS.filter((c) => !colors.has(c)).length
  return jokers <= remainingColors
}

function validRun(real: Tile[], jokers: number, total: number): boolean {
  if (total < 3) return false
  const color = real[0].color
  if (!real.every((t) => t.color === color)) return false
  const nums = real.map(val).sort((a, b) => a - b)
  // no duplicates among real tiles
  for (let i = 1; i < nums.length; i++) if (nums[i] === nums[i - 1]) return false
  const lo = nums[0]
  const hi = nums[nums.length - 1]
  // span must fit within 1..13 with `total` consecutive slots
  const span = hi - lo + 1
  if (span > total) return false // too spread to fill with jokers
  // gaps between real tiles fill with jokers; leftover jokers extend ends
  const innerGaps = span - real.length // missing slots strictly inside the [lo,hi] span
  if (innerGaps > jokers) return false
  const extJokers = jokers - innerGaps
  // total tiles = span + extJokers (extending below lo and/or above hi)
  // must keep within 1..13
  if (span + extJokers !== total) return false
  // there must EXIST a placement of extJokers around [lo,hi] within 1..13
  const room = (lo - 1) + (13 - hi) // slots available below + above
  if (extJokers > room) return false
  return true
}

/** Are ALL table melds valid? */
export function isValidTable(table: Meld[]): boolean {
  return table.every((m) => isValidMeld(m))
}

/* ------------------------------------------------ scoring (initial-30 rule) */

/** Determine the number a joker represents within a (valid) meld, for scoring. */
export function meldScore(meld: Tile[]): number {
  const real = meld.filter((t) => !t.joker)
  const jokers = meld.filter((t) => t.joker).length
  if (jokers === 0) return real.reduce((s, t) => s + t.num, 0)

  // GROUP: every tile equals the group number
  if (real.length > 0 && real.every((t) => t.num === real[0].num) && new Set(real.map((t) => t.color)).size === real.length && meld.length <= 4) {
    const groupNum = real[0].num
    // confirm it could be a group (distinct colors room)
    const remainingColors = COLORS.filter((c) => !real.some((r) => r.color === c)).length
    if (jokers <= remainingColors) return real[0].num * meld.length === 0 ? 0 : groupNum * meld.length
  }
  // RUN: derive the consecutive sequence
  const nums = real.map((t) => t.num).sort((a, b) => a - b)
  const lo = nums[0]
  const hi = nums[nums.length - 1]
  const span = hi - lo + 1
  const innerGaps = span - real.length
  const extJokers = jokers - innerGaps
  // place extension jokers above hi when possible (maximizing keeps things deterministic),
  // else below lo. Compute the actual set of numbers used.
  let start = lo
  let end = hi
  let above = Math.min(extJokers, 13 - hi)
  end += above
  let below = extJokers - above
  start -= below
  let sum = 0
  for (let n = start; n <= end; n++) sum += n
  return sum
}

/** Sum of meld scores. */
export function tableScore(melds: Meld[]): number {
  return melds.reduce((s, m) => s + meldScore(m), 0)
}

/* ----------------------------------------------------------------- game */

export function makeGame(optionalDeck?: Tile[]): State {
  const deck = optionalDeck ? optionalDeck.slice() : shuffled(fullDeck(), 1)
  const rack0 = deck.slice(0, RACK_SIZE)
  const rack1 = deck.slice(RACK_SIZE, RACK_SIZE * 2)
  const bag = deck.slice(RACK_SIZE * 2)
  return {
    racks: [rack0, rack1],
    table: [],
    bag,
    hasMelded: [false, false],
    turn: 0,
    winner: null,
    result: null,
    log: [{ t: 'sys', x: 'Tiles dealt. You go first.' }],
    step: 0,
  }
}

function cloneTiles(ts: Tile[]): Tile[] { return ts.map((t) => ({ ...t })) }
function cloneTable(t: Meld[]): Meld[] { return t.map((m) => cloneTiles(m)) }

/**
 * Attempt a play for `player`: replace the table with `newTable` and remove
 * `tilesUsedFromRack` (tile ids) from their rack. Validates:
 *  - all newTable melds valid,
 *  - the set of tiles on newTable == (oldTable tiles) ∪ (tilesUsedFromRack),
 *  - on the player's FIRST meld, the tiles coming off the rack total >= 30.
 * Returns a new State, or null if illegal (caller keeps old state).
 */
export function play(
  s: State,
  player: Player,
  newTable: Meld[],
  tilesUsedFromRack: number[],
): State | null {
  if (s.winner != null) return null
  // validity of every meld
  if (!isValidTable(newTable)) return null

  const rack = s.racks[player]
  const usedSet = new Set(tilesUsedFromRack)
  // must actually own these tiles
  if (!tilesUsedFromRack.every((id) => rack.some((t) => t.id === id))) return null
  if (usedSet.size !== tilesUsedFromRack.length) return null
  if (tilesUsedFromRack.length === 0) return null

  // conservation: newTable tile-id multiset === oldTable tile-ids + used rack tiles
  const oldIds = new Set<number>()
  for (const m of s.table) for (const t of m) oldIds.add(t.id)
  const newIds: number[] = []
  for (const m of newTable) for (const t of m) newIds.push(t.id)
  if (newIds.length !== oldIds.size + tilesUsedFromRack.length) return null
  const newIdSet = new Set(newIds)
  if (newIdSet.size !== newIds.length) return null // no dupes
  // every old table tile present
  for (const id of oldIds) if (!newIdSet.has(id)) return null
  // every used rack tile present
  for (const id of tilesUsedFromRack) if (!newIdSet.has(id)) return null
  // nothing extra
  for (const id of newIdSet) if (!oldIds.has(id) && !usedSet.has(id)) return null

  // initial-30 rule on first meld
  if (!s.hasMelded[player]) {
    // score only the NEW melds composed of fresh rack tiles. We require the player's
    // first play to not touch existing melds and to total >= 30 from their own tiles.
    // Simplification: first play must consist solely of brand-new melds.
    const oldEmpty = s.table.length === 0
    // every meld on newTable must be either an untouched old meld or fully-new (rack) meld
    let freshScore = 0
    for (const m of newTable) {
      const allFresh = m.every((t) => usedSet.has(t.id))
      const allOld = m.every((t) => oldIds.has(t.id))
      if (!allFresh && !allOld) return null // first meld can't mix into existing melds
      if (allFresh) freshScore += meldScore(m)
    }
    if (!oldEmpty) {
      // allow first meld even if table already has melds, as long as we only ADD fresh melds
    }
    if (freshScore < INITIAL_MIN) return null
  }

  const nextRack = rack.filter((t) => !usedSet.has(t.id))
  const racks: [Tile[], Tile[]] = player === 0
    ? [nextRack, cloneTiles(s.racks[1])]
    : [cloneTiles(s.racks[0]), nextRack]

  const hasMelded: [boolean, boolean] = [s.hasMelded[0], s.hasMelded[1]]
  hasMelded[player] = true

  const winner: Player | null = nextRack.length === 0 ? player : null
  const log = s.log.slice()
  const who = player === 0 ? 'you' : 'ai'
  log.push({
    t: who as 'you' | 'ai',
    x: `${player === 0 ? 'You' : 'AI'} played ${tilesUsedFromRack.length} tile${tilesUsedFromRack.length === 1 ? '' : 's'}.`,
  })

  let result: RoundResult | null = null
  if (winner != null) {
    result = {
      by: winner,
      kind: 'empty',
      youCount: racks[0].length,
      aiCount: racks[1].length,
    }
    log.push({ t: 'sys', x: `${player === 0 ? 'You' : 'AI'} emptied the rack — win!` })
  }

  return {
    racks,
    table: cloneTable(newTable),
    bag: s.bag.slice(),
    hasMelded,
    turn: winner != null ? s.turn : ((player === 0 ? 1 : 0) as Player),
    winner,
    result,
    log,
    step: s.step + 1,
  }
}

/** Draw one tile for `player`. If bag empty and neither can play, resolve. */
export function draw(s: State, player: Player): State {
  if (s.winner != null) return s
  const log = s.log.slice()
  if (s.bag.length === 0) {
    // can't draw — pass. Detect stalemate below in aiTurn / hostFlow; here just pass turn.
    log.push({ t: 'sys', x: `${player === 0 ? 'You' : 'AI'} cannot draw (bag empty) — pass.` })
    return {
      ...s,
      log,
      turn: (player === 0 ? 1 : 0) as Player,
      step: s.step + 1,
    }
  }
  const tile = s.bag[0]
  const bag = s.bag.slice(1)
  const racks: [Tile[], Tile[]] = player === 0
    ? [[...s.racks[0], { ...tile }], cloneTiles(s.racks[1])]
    : [cloneTiles(s.racks[0]), [...s.racks[1], { ...tile }]]
  log.push({ t: player === 0 ? 'you' : 'ai', x: `${player === 0 ? 'You' : 'AI'} drew a tile.` })
  return {
    racks,
    table: cloneTable(s.table),
    bag,
    hasMelded: [s.hasMelded[0], s.hasMelded[1]],
    turn: (player === 0 ? 1 : 0) as Player,
    winner: null,
    result: null,
    log,
    step: s.step + 1,
  }
}

/* -------------------------------------------------- meld-finding (AI / hints) */

/** Group tiles in a rack by color → sorted nums, and by num → colors, for search. */

/**
 * Find a set of disjoint NEW melds from a given pool of tiles (the rack), greedily
 * maximizing the count of tiles used. Returns the melds (tiles) used. Bounded.
 * Jokers are used opportunistically. This is a heuristic, not exhaustive.
 */
export function findMelds(rack: Tile[]): Meld[] {
  const tiles = rack.slice()
  const jokers = tiles.filter((t) => t.joker)
  const reals = tiles.filter((t) => !t.joker)

  // candidate melds (without jokers first) we can find, then try to plug jokers.
  const used = new Set<number>()
  const result: Meld[] = []

  const byColor = new Map<Color, Tile[]>()
  for (const c of COLORS) byColor.set(c, [])
  for (const t of reals) byColor.get(t.color as Color)!.push(t)
  for (const c of COLORS) byColor.get(c)!.sort((a, b) => a.num - b.num)

  // 1) find runs of length >=3 per color (consecutive, no dup nums)
  for (const c of COLORS) {
    const arr = byColor.get(c)!.filter((t) => !used.has(t.id))
    // collapse duplicate numbers: keep one chain at a time
    let i = 0
    while (i < arr.length) {
      // build maximal consecutive run starting at i using available tiles
      const run: Tile[] = [arr[i]]
      let last = arr[i].num
      let j = i + 1
      while (j < arr.length) {
        if (arr[j].num === last + 1) { run.push(arr[j]); last = arr[j].num; j++ }
        else if (arr[j].num === last) { j++ } // skip duplicate copy
        else break
      }
      if (run.length >= 3) {
        for (const t of run) used.add(t.id)
        result.push(run)
        i = j
      } else {
        i++
      }
    }
  }

  // 2) find groups (same number, distinct colors) among remaining
  const byNum = new Map<number, Tile[]>()
  for (const t of reals) {
    if (used.has(t.id)) continue
    if (!byNum.has(t.num)) byNum.set(t.num, [])
    byNum.get(t.num)!.push(t)
  }
  for (const [, group] of byNum) {
    const distinct: Tile[] = []
    const seen = new Set<string>()
    for (const t of group) {
      if (used.has(t.id)) continue
      if (seen.has(t.color)) continue
      seen.add(t.color)
      distinct.push(t)
    }
    if (distinct.length >= 3) {
      for (const t of distinct) used.add(t.id)
      result.push(distinct)
    }
  }

  // 3) use jokers to complete near-melds (pairs into groups/runs) — simple plug
  const freeJokers = jokers.filter((t) => !used.has(t.id))
  let jk = 0
  if (freeJokers.length > 0) {
    // try to extend an existing found meld? Instead: find a near-group (2 distinct colors same num)
    const remNum = new Map<number, Tile[]>()
    for (const t of reals) {
      if (used.has(t.id)) continue
      if (!remNum.has(t.num)) remNum.set(t.num, [])
      remNum.get(t.num)!.push(t)
    }
    for (const [, group] of remNum) {
      if (jk >= freeJokers.length) break
      const distinct: Tile[] = []
      const seen = new Set<string>()
      for (const t of group) {
        if (used.has(t.id) || seen.has(t.color)) continue
        seen.add(t.color); distinct.push(t)
      }
      if (distinct.length === 2) {
        const meld = [...distinct, freeJokers[jk]]
        if (isValidMeld(meld)) {
          for (const t of distinct) used.add(t.id)
          used.add(freeJokers[jk].id)
          result.push(meld)
          jk++
        }
      }
    }
    // near-run: two consecutive same color + joker
    for (const c of COLORS) {
      if (jk >= freeJokers.length) break
      const arr = byColor.get(c)!.filter((t) => !used.has(t.id))
      for (let i = 0; i + 1 < arr.length; i++) {
        if (jk >= freeJokers.length) break
        const a = arr[i], b = arr[i + 1]
        if (used.has(a.id) || used.has(b.id)) continue
        if (b.num === a.num + 2) {
          const meld = [a, freeJokers[jk], b]
          if (isValidMeld(meld)) {
            used.add(a.id); used.add(b.id); used.add(freeJokers[jk].id)
            result.push(meld); jk++
          }
        } else if (b.num === a.num + 1) {
          const meld = [a, b, freeJokers[jk]]
          if (isValidMeld(meld)) {
            used.add(a.id); used.add(b.id); used.add(freeJokers[jk].id)
            result.push(meld); jk++
          }
        }
      }
    }
  }

  return result.filter((m) => isValidMeld(m))
}

/**
 * Try to EXTEND existing table melds with rack tiles (simple, single-tile-at-a-time).
 * Returns { table, used } where used are rack ids placed, or null if none.
 */
export function findExtensions(table: Meld[], rack: Tile[]): { table: Meld[]; used: number[] } | null {
  if (table.length === 0) return null
  const newTable = table.map((m) => m.slice())
  const used: number[] = []
  const avail = rack.filter((t) => !t.joker) // keep extension simple: no jokers
  const placed = new Set<number>()

  for (let mi = 0; mi < newTable.length; mi++) {
    const m = newTable[mi]
    // only extend runs (append/prepend consecutive same color)
    const real = m.filter((t) => !t.joker)
    if (real.length < 2) continue
    const sameColor = real.every((t) => t.color === real[0].color)
    if (!sameColor) {
      // could be a group: add a tile of the missing color & same number if length < 4
      if (m.length < 4 && real.every((t) => t.num === real[0].num)) {
        const num = real[0].num
        const haveColors = new Set(m.filter((t) => !t.joker).map((t) => t.color))
        for (const t of avail) {
          if (placed.has(t.id)) continue
          if (t.num === num && !haveColors.has(t.color)) {
            newTable[mi] = [...m, t]
            used.push(t.id); placed.add(t.id)
            break
          }
        }
      }
      continue
    }
    // run: find min/max real num
    const nums = real.map((t) => t.num)
    let lo = Math.min(...nums)
    let hi = Math.max(...nums)
    const color = real[0].color
    let extended = true
    while (extended) {
      extended = false
      for (const t of avail) {
        if (placed.has(t.id)) continue
        if (t.color === color && t.num === hi + 1 && hi + 1 <= 13) {
          newTable[mi] = [...newTable[mi], t]; used.push(t.id); placed.add(t.id)
          hi++; extended = true; break
        }
        if (t.color === color && t.num === lo - 1 && lo - 1 >= 1) {
          newTable[mi] = [t, ...newTable[mi]]; used.push(t.id); placed.add(t.id)
          lo--; extended = true; break
        }
      }
    }
  }

  if (used.length === 0) return null
  if (!isValidTable(newTable)) return null
  return { table: newTable, used }
}

/**
 * Compute the AI's whole turn: try to play the most tiles possible (respecting the
 * initial-30 rule), else draw. Bounded greedy search. Returns a new State.
 */
export function aiTurn(s: State): State {
  if (s.winner != null) return s
  const player: Player = 1
  if (s.turn !== player) return s
  const rack = s.racks[player]

  // 1) find new melds from rack
  const newMelds = findMelds(rack)

  if (!s.hasMelded[player]) {
    // need >= 30 from fresh tiles in a SINGLE play of brand-new melds
    // pick a subset of newMelds maximizing tiles while score >= 30
    const scored = newMelds.map((m) => ({ m, sc: meldScore(m), n: m.length }))
    // sort by score desc, accumulate
    scored.sort((a, b) => b.sc - a.sc)
    const chosen: Meld[] = []
    let total = 0
    let usedIds: number[] = []
    for (const c of scored) { chosen.push(c.m); total += c.sc; usedIds.push(...c.m.map((t) => t.id)) }
    if (total >= INITIAL_MIN && chosen.length > 0) {
      const newTable = [...s.table.map((m) => m.slice()), ...chosen]
      const res = play(s, player, newTable, usedIds)
      if (res) return res
    }
    // can't meet initial — draw
    return draw(s, player)
  }

  // already melded: combine new melds + extensions, play all we can
  let bestTable: Meld[] | null = null
  let bestUsed: number[] = []

  if (newMelds.length > 0) {
    bestTable = [...s.table.map((m) => m.slice()), ...newMelds]
    bestUsed = newMelds.flatMap((m) => m.map((t) => t.id))
  }

  // extensions (on top of whatever table we have)
  const extBase = bestTable ?? s.table.map((m) => m.slice())
  const remainingRack = rack.filter((t) => !bestUsed.includes(t.id))
  const ext = findExtensions(extBase, remainingRack)
  if (ext) {
    bestTable = ext.table
    bestUsed = [...bestUsed, ...ext.used]
  }

  if (bestTable && bestUsed.length > 0) {
    const res = play(s, player, bestTable, bestUsed)
    if (res) return res
  }

  return draw(s, player)
}

/** Convenience: can `player` make ANY legal play right now? (for stalemate detect) */
export function canPlay(s: State, player: Player): boolean {
  const rack = s.racks[player]
  const newMelds = findMelds(rack)
  if (!s.hasMelded[player]) {
    return newMelds.reduce((sum, m) => sum + meldScore(m), 0) >= INITIAL_MIN && newMelds.length > 0
  }
  if (newMelds.length > 0) return true
  const ext = findExtensions(s.table.map((m) => m.slice()), rack)
  return ext != null
}

/** Resolve a bag-empty stalemate: smaller rack wins (ties → no winner / current). */
export function resolveStalemate(s: State): State {
  const you = s.racks[0].length
  const ai = s.racks[1].length
  let winner: Player | null
  if (you < ai) winner = 0
  else if (ai < you) winner = 1
  else winner = 0 // tie → player 0 by convention
  return {
    ...s,
    winner,
    result: { by: winner, kind: 'bag-empty', youCount: you, aiCount: ai },
    log: [...s.log, { t: 'sys', x: 'Bag empty and no plays — smaller rack wins.' }],
  }
}
