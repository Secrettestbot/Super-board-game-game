/* CRYPTID — hex-map deduction (logic, built for this codebase).
   A rectangular 9x6 = 54-hex map. Each hex has a TERRAIN (forest/desert/water/mountain/swamp)
   and some hexes carry a STRUCTURE (stone or shack) in one of 3 colors (white/blue/green).
   The cryptid hides on the ONE hex satisfying ALL players' secret clues.

   Two players: you (0) + AI (1). Each holds one secret clue. On your turn you ASK an opponent
   about a hex (they place a disc=fits or cube=doesn't-fit per their clue), or SEARCH a hex
   (every player confirms -> win; else penalty cube + turn ends).

   Coordinates: axial-ish offset on a pointy/flat rect grid. We use "odd-r" offset (rows, cols)
   and convert to cube coords for true hex distance. Generation is deterministic from a seed and
   guarantees a UNIQUE cryptid hex. NO React/DOM here. */

export type Terrain = 'forest' | 'desert' | 'water' | 'mountain' | 'swamp'
export const TERRAINS: Terrain[] = ['forest', 'desert', 'water', 'mountain', 'swamp']

export type StructKind = 'stone' | 'shack'
export type StructColor = 'white' | 'blue' | 'green'
export const STRUCT_COLORS: StructColor[] = ['white', 'blue', 'green']

export interface Structure { kind: StructKind; color: StructColor }
export interface Hex { terrain: Terrain; structure: Structure | null }

export type Player = 0 | 1
export type Marker = 'disc' | 'cube' // per player per hex

// ---- Clue types (the simplified-but-real clue set) ----
export type Clue =
  | { type: 'within1Terrain'; terrain: Terrain }            // within ONE space of terrain X
  | { type: 'twoTerrains'; a: Terrain; b: Terrain }         // on one of two terrain types
  | { type: 'within2Color'; color: StructColor }            // within TWO spaces of a colored structure
  | { type: 'within3Kind'; kind: StructKind }               // within THREE spaces of a stone/shack

export const COLS = 9
export const ROWS = 6
export const NHEX = COLS * ROWS

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface CryptidState {
  map: Hex[]                     // length NHEX, index = r*COLS + c
  clues: [Clue, Clue]            // clues[0] = you, clues[1] = AI
  cryptid: number                // the true hex index (unique solution)
  // markers[player][hex] = 'disc' | 'cube' | undefined — what `player` has revealed about that hex
  markers: [Record<number, Marker>, Record<number, Marker>]
  turn: Player
  winner: Player | null
  seed: number
  log: LogEntry[]
}

// ===== Hex geometry (odd-r offset -> cube) =====
export const idx = (r: number, c: number) => r * COLS + c
export const rowOf = (i: number) => Math.floor(i / COLS)
export const colOf = (i: number) => i % COLS

function offsetToCube(r: number, c: number): [number, number, number] {
  // odd-r: shift odd rows
  const x = c - (r - (r & 1)) / 2
  const z = r
  const y = -x - z
  return [x, y, z]
}

export function hexDistance(a: number, b: number): number {
  const [ax, ay, az] = offsetToCube(rowOf(a), colOf(a))
  const [bx, by, bz] = offsetToCube(rowOf(b), colOf(b))
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz))
}

// Hexes within distance d of `center` (inclusive), clamped to the board.
export function hexesWithin(center: number, d: number): number[] {
  const out: number[] = []
  for (let i = 0; i < NHEX; i++) if (hexDistance(center, i) <= d) out.push(i)
  return out
}

// ===== Clue evaluation =====
export function clueFits(clue: Clue, hex: number, map: Hex[]): boolean {
  switch (clue.type) {
    case 'twoTerrains':
      return map[hex].terrain === clue.a || map[hex].terrain === clue.b
    case 'within1Terrain': {
      for (let i = 0; i < NHEX; i++)
        if (map[i].terrain === clue.terrain && hexDistance(hex, i) <= 1) return true
      return false
    }
    case 'within2Color': {
      for (let i = 0; i < NHEX; i++) {
        const s = map[i].structure
        if (s && s.color === clue.color && hexDistance(hex, i) <= 2) return true
      }
      return false
    }
    case 'within3Kind': {
      for (let i = 0; i < NHEX; i++) {
        const s = map[i].structure
        if (s && s.kind === clue.kind && hexDistance(hex, i) <= 3) return true
      }
      return false
    }
  }
}

export function clueText(clue: Clue): string {
  switch (clue.type) {
    case 'within1Terrain': return `within one space of ${clue.terrain}`
    case 'twoTerrains': return `on ${clue.a} or ${clue.b}`
    case 'within2Color': return `within two spaces of a ${clue.color} structure`
    case 'within3Kind': return `within three spaces of a ${clue.kind === 'stone' ? 'standing stone' : 'shack'}`
  }
}

// ===== Deterministic PRNG (mulberry32) =====
function mulberry32(seed: number) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Enumerate every possible clue (used both for generation and for AI deduction).
export function allClues(): Clue[] {
  const out: Clue[] = []
  for (const t of TERRAINS) out.push({ type: 'within1Terrain', terrain: t })
  for (let i = 0; i < TERRAINS.length; i++)
    for (let j = i + 1; j < TERRAINS.length; j++)
      out.push({ type: 'twoTerrains', a: TERRAINS[i], b: TERRAINS[j] })
  for (const c of STRUCT_COLORS) out.push({ type: 'within2Color', color: c })
  out.push({ type: 'within3Kind', kind: 'stone' })
  out.push({ type: 'within3Kind', kind: 'shack' })
  return out
}

// Set of hexes that satisfy a clue on a given map.
function satisfyingSet(clue: Clue, map: Hex[]): Set<number> {
  const s = new Set<number>()
  for (let i = 0; i < NHEX; i++) if (clueFits(clue, i, map)) s.add(i)
  return s
}

function genMap(rng: () => number): Hex[] {
  const map: Hex[] = []
  for (let i = 0; i < NHEX; i++) {
    const terrain = TERRAINS[(rng() * TERRAINS.length) | 0]
    map.push({ terrain, structure: null })
  }
  // Place 6 structures on distinct hexes (2 of each color, mix of kinds).
  const placed = new Set<number>()
  const wanted: Structure[] = [
    { kind: 'stone', color: 'white' }, { kind: 'shack', color: 'white' },
    { kind: 'stone', color: 'blue' }, { kind: 'shack', color: 'blue' },
    { kind: 'stone', color: 'green' }, { kind: 'shack', color: 'green' },
  ]
  for (const st of wanted) {
    let h = -1, guard = 0
    do { h = (rng() * NHEX) | 0; guard++ } while (placed.has(h) && guard < 500)
    placed.add(h)
    map[h] = { terrain: map[h].terrain, structure: st }
  }
  return map
}

// ===== Game generation with a GUARANTEED unique solution =====
export function makeGame(optionalSeed?: number): CryptidState {
  let seed = optionalSeed != null ? optionalSeed >>> 0 : (Math.random() * 0xffffffff) >>> 0

  // Search seeds until a map + clue pair yields exactly one common satisfying hex.
  for (let attempt = 0; attempt < 4000; attempt++) {
    const s = (seed + attempt) >>> 0
    const rng = mulberry32(s)
    const map = genMap(rng)
    const clues = allClues()
    // Precompute satisfying sets.
    const sets = clues.map((cl) => satisfyingSet(cl, map))

    // Try random clue pairs; accept the first whose intersection is exactly one hex,
    // and where each clue alone leaves a reasonably sized set (so the puzzle is non-degenerate).
    const order: number[] = clues.map((_, i) => i)
    // Fisher-Yates shuffle of pair candidates using rng for determinism.
    for (let i = order.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    for (let ai = 0; ai < order.length; ai++) {
      const a = order[ai]
      if (sets[a].size < 6 || sets[a].size > NHEX - 4) continue
      for (let bi = 0; bi < order.length; bi++) {
        const b = order[bi]
        if (a === b) continue
        if (sets[b].size < 6 || sets[b].size > NHEX - 4) continue
        // intersection
        let common = -1, count = 0
        for (const h of sets[a]) {
          if (sets[b].has(h)) { common = h; count++; if (count > 1) break }
        }
        if (count === 1) {
          return {
            map,
            clues: [clues[a], clues[b]],
            cryptid: common,
            markers: [{}, {}],
            turn: 0,
            winner: null,
            seed: s,
            log: [{ t: 'sys', x: 'A cryptid hides on exactly one hex. Deduce the rival’s clue and find it.' }],
          }
        }
      }
    }
  }
  // Extremely unlikely fallback — should never hit with the seed search above.
  throw new Error('cryptid: failed to generate a unique-solution map')
}

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-24)
}

const other = (p: Player): Player => (p === 0 ? 1 : 0)

// ===== Candidate filtering =====
// Hexes still consistent with everything `forPlayer` knows: their own clue + all revealed markers.
// A disc on hex h by player p means "h fits p's clue"; a cube means "h does NOT fit p's clue".
// `forPlayer`'s own clue is fully known to them, so we filter by it directly too.
export function candidateHexes(s: CryptidState, forPlayer: Player): number[] {
  const out: number[] = []
  const ownClue = s.clues[forPlayer]
  for (let h = 0; h < NHEX; h++) {
    // Must fit the player's own clue.
    if (!clueFits(ownClue, h, s.map)) continue
    // Must be consistent with every revealed marker (both players').
    let ok = true
    for (let p = 0 as Player; p <= 1; p = (p + 1) as Player) {
      const m = s.markers[p][h]
      if (m === 'cube') { ok = false; break }   // someone said this hex does NOT fit their clue
      // a disc is positive info; consistent by definition. No contradiction possible.
    }
    if (ok) out.push(h)
  }
  return out
}

// AI's deduction: the set of opponent clues (player 0 = you) still consistent with revealed markers,
// AND the resulting candidate cryptid hexes given the AI's own clue. Exposed for the AI + tests.
export function consistentOpponentClues(s: CryptidState, me: Player): Clue[] {
  const opp = other(me)
  const myMarks = s.markers[opp] // what the opponent (player `opp`) revealed about their OWN clue
  const out: Clue[] = []
  for (const cl of allClues()) {
    let ok = true
    for (const k in myMarks) {
      const h = Number(k)
      const mark = myMarks[h]
      const fits = clueFits(cl, h, s.map)
      if (mark === 'disc' && !fits) { ok = false; break }
      if (mark === 'cube' && fits) { ok = false; break }
    }
    if (ok) out.push(cl)
  }
  return out
}

// ===== Actions =====
// ASK: asker asks targetPlayer about `hex`. Target reveals a disc (fits their clue) or cube (no).
export function ask(s: CryptidState, asker: Player, targetPlayer: Player, hex: number): CryptidState {
  if (s.winner != null) return s
  if (s.turn !== asker) return s
  if (asker === targetPlayer) return s
  if (s.markers[targetPlayer][hex] != null) return s // already answered for this hex
  const fits = clueFits(s.clues[targetPlayer], hex, s.map)
  const markers: CryptidState['markers'] = [{ ...s.markers[0] }, { ...s.markers[1] }]
  markers[targetPlayer][hex] = fits ? 'disc' : 'cube'
  const who = asker === 0 ? 'You' : 'Rival'
  const tgt = targetPlayer === 0 ? 'you' : 'the rival'
  const log = push(s.log, asker === 0 ? 'you' : 'ai',
    `${who} asked ${tgt} about ${coord(hex)} — ${fits ? 'disc (fits)' : 'cube (no)'}.`)
  return { ...s, markers, turn: other(asker), log }
}

// SEARCH: player guesses the cryptid hex. If it fits BOTH clues -> win; else penalty cube + turn ends.
export function search(s: CryptidState, player: Player, hex: number): CryptidState {
  if (s.winner != null) return s
  if (s.turn !== player) return s
  const fitsAll = clueFits(s.clues[0], hex, s.map) && clueFits(s.clues[1], hex, s.map)
  const markers: CryptidState['markers'] = [{ ...s.markers[0] }, { ...s.markers[1] }]
  if (fitsAll) {
    // Every player's clue confirmed — reveal discs.
    markers[0][hex] = 'disc'
    markers[1][hex] = 'disc'
    const who = player === 0 ? 'You' : 'Rival'
    const log = push(s.log, player === 0 ? 'you' : 'ai', `${who} searched ${coord(hex)} — the cryptid is found! ${who} win${player === 0 ? '' : 's'}.`)
    return { ...s, markers, winner: player, turn: player, log }
  }
  // Failed search: the non-fitting clue owner places a cube; turn ends.
  const failOwner: Player = !clueFits(s.clues[0], hex, s.map) ? 0 : 1
  markers[failOwner][hex] = 'cube'
  const who = player === 0 ? 'You' : 'Rival'
  const log = push(s.log, player === 0 ? 'you' : 'ai', `${who} searched ${coord(hex)} — no cryptid. A cube is placed.`)
  return { ...s, markers, turn: other(player), log }
}

export function coord(hex: number): string {
  return `${'ABCDEFGHI'[colOf(hex)]}${rowOf(hex) + 1}`
}

// ===== AI =====
/* The AI (player 1) maintains:
   - consistentOpponentClues: which of your clues are still possible given your revealed markers.
   - candidate hexes: hexes fitting its own clue AND not eliminated by any cube.
   It SEARCHES when it can prove a unique cryptid (every consistent opponent clue agrees the same
   single hex is the answer), else ASKS the hex that best narrows your possible clue set. */
export function aiTurn(s: CryptidState): CryptidState {
  const me: Player = 1
  if (s.winner != null || s.turn !== me) return s

  const oppClues = consistentOpponentClues(s, me)
  // Candidate cryptid hexes from the AI's knowledge: fit my clue, not cube-eliminated by me,
  // and consistent with at least one possible opponent clue. For a *certain* solution, the hex
  // must satisfy EVERY possible opponent clue (so the answer is forced regardless of which it is).
  const myCand = candidateHexes(s, me) // fits my clue + no cube anywhere

  // A hex is a guaranteed cryptid if it fits my clue and ALL remaining opponent clues agree it fits.
  const forced: number[] = []
  for (const h of myCand) {
    let allFit = true
    for (const cl of oppClues) { if (!clueFits(cl, h, s.map)) { allFit = false; break } }
    if (allFit) forced.push(h)
  }

  // If exactly one hex is forced to be the cryptid, search it (certain win).
  if (forced.length === 1) return search(s, me, forced[0])

  // Otherwise, ASK to narrow down YOUR clue. Pick the hex whose disc/cube answer most evenly
  // splits the remaining opponent-clue set (max information), among hexes you haven't answered.
  let bestHex = -1, bestScore = -Infinity
  for (let h = 0; h < NHEX; h++) {
    if (s.markers[0][h] != null) continue // you already answered this hex
    let yes = 0, no = 0
    for (const cl of oppClues) { if (clueFits(cl, h, s.map)) yes++; else no++ }
    if (yes === 0 || no === 0) continue // no information
    const score = Math.min(yes, no) - Math.abs(yes - no) * 0.0001
    if (score > bestScore) { bestScore = score; bestHex = h }
  }

  if (bestHex >= 0) return ask(s, me, 0, bestHex)

  // No informative ask left. Fall back: search the most likely candidate (forced first, else myCand).
  const target = forced.length ? forced[0] : (myCand.length ? myCand[0] : s.cryptid)
  return search(s, me, target)
}

export const winner = (s: CryptidState): Player | null => s.winner
