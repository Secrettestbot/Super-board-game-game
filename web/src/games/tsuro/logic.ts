/* TSURO — "The Game of the Path" (built for this codebase, not ported).
   A 6x6 board. Each cell, once a tile is placed, exposes 8 PORTS numbered 0..7
   clockwise from the top-left:

        0   1
      7         2
      6         3
        5   4

   Top edge = ports 0,1 · right edge = 2,3 · bottom edge = 4,5 · left edge = 6,7.
   A TILE wires those 8 ports into 4 internal PATHS — a perfect matching of the 8
   ports into 4 disjoint pairs. ROTATION by 90° advances every port index by +2 (mod 8).

   A stone lives at a port on the EDGE of an empty cell, facing INTO that cell. On a
   turn the current player places one of their hand tiles (with a chosen rotation) on
   the empty cell directly in front of their stone; every stone then FOLLOWS the paths
   it now touches, hopping cell→cell until it lands on an empty cell's edge or is driven
   off the board border (eliminated). Last stone on the board wins. */

export const N = 6

export type Player = 'you' | 'foe'
export interface LogEntry { t: string; x: string }

// A tile: paths[p] = the port that port p connects to (an involution with no fixed points).
export type Tile = number[]

export interface Stone {
  who: Player
  cell: number   // cell the stone faces INTO (the empty cell ahead of it)
  port: number   // which port of that cell it sits on (0..7), facing inward
  alive: boolean
}

export interface TsuroState {
  placed: (Tile | null)[]       // length 36; the tile wired into each cell, or null
  stones: Stone[]               // both players' stones
  hands: Record<Player, Tile[]> // up to 3 tiles each
  deck: Tile[]
  turn: Player | null
  you: Player
  winner: Player | 'draw' | null
  last: number | null           // last cell a tile was placed on
  log: LogEntry[]
}

// ---- geometry ----------------------------------------------------------------
const idx = (r: number, c: number) => r * N + c
const rowOf = (cell: number) => Math.floor(cell / N)
const colOf = (cell: number) => cell % N

// The cell sharing the edge a given port faces, and the port a stone arrives ON in
// that neighbour. Returns null if the port faces off the board border.
export function step(cell: number, port: number): { cell: number; port: number } | null {
  const r = rowOf(cell), c = colOf(cell)
  switch (port) {
    case 0: return r > 0 ? { cell: idx(r - 1, c), port: 5 } : null   // top-left  -> below-left of cell above
    case 1: return r > 0 ? { cell: idx(r - 1, c), port: 4 } : null
    case 2: return c < N - 1 ? { cell: idx(r, c + 1), port: 7 } : null // right-top -> left-top of cell right
    case 3: return c < N - 1 ? { cell: idx(r, c + 1), port: 6 } : null
    case 4: return r < N - 1 ? { cell: idx(r + 1, c), port: 1 } : null // bottom-right -> top-right of cell below
    case 5: return r < N - 1 ? { cell: idx(r + 1, c), port: 0 } : null
    case 6: return c > 0 ? { cell: idx(r, c - 1), port: 3 } : null     // left-bottom -> right-bottom of cell left
    case 7: return c > 0 ? { cell: idx(r, c - 1), port: 2 } : null
    default: return null
  }
}

// ---- tiles -------------------------------------------------------------------
export function rotateTile(tile: Tile, quarters: number): Tile {
  const q = ((quarters % 4) + 4) % 4
  const shift = (q * 2) % 8
  const out = new Array(8)
  for (let p = 0; p < 8; p++) {
    const np = (p + shift) % 8
    out[np] = (tile[p] + shift) % 8
  }
  return out
}

export function isValidTile(tile: Tile): boolean {
  if (!Array.isArray(tile) || tile.length !== 8) return false
  for (let p = 0; p < 8; p++) {
    const q = tile[p]
    if (!Number.isInteger(q) || q < 0 || q > 7) return false
    if (q === p) return false           // no port connects to itself
    if (tile[q] !== p) return false     // must be a symmetric matching
  }
  return true
}

function tileKey(tile: Tile): string {
  // canonical key over rotations so the deck holds visually distinct tiles
  let best: string | null = null
  for (let q = 0; q < 4; q++) {
    const k = rotateTile(tile, q).join('')
    if (best === null || k < best) best = k
  }
  return best as string
}

function randomMatching(): Tile {
  const ports = [0, 1, 2, 3, 4, 5, 6, 7]
  for (let i = ports.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[ports[i], ports[j]] = [ports[j], ports[i]]
  }
  const tile = new Array(8)
  for (let i = 0; i < 8; i += 2) {
    const a = ports[i], b = ports[i + 1]
    tile[a] = b; tile[b] = a
  }
  return tile
}

// A full Tsuro deck is 35 distinct tiles (up to rotation). Generate that many.
export function makeDeck(count = 35): Tile[] {
  const seen = new Set<string>()
  const deck: Tile[] = []
  let guard = 0
  while (deck.length < count && guard++ < 5000) {
    const t = randomMatching()
    const k = tileKey(t)
    if (seen.has(k)) continue
    seen.add(k)
    deck.push(t)
  }
  shuffle(deck)
  return deck
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

// ---- setup -------------------------------------------------------------------
// Pick two distinct starting stones on border ports facing inward.
function borderStarts(): { cell: number; port: number }[] {
  const out: { cell: number; port: number }[] = []
  for (let c = 0; c < N; c++) { out.push({ cell: idx(0, c), port: 0 }); out.push({ cell: idx(0, c), port: 1 }) }      // top, facing in
  for (let r = 0; r < N; r++) { out.push({ cell: idx(r, N - 1), port: 2 }); out.push({ cell: idx(r, N - 1), port: 3 }) } // right
  for (let c = 0; c < N; c++) { out.push({ cell: idx(N - 1, c), port: 4 }); out.push({ cell: idx(N - 1, c), port: 5 }) } // bottom
  for (let r = 0; r < N; r++) { out.push({ cell: idx(r, 0), port: 6 }); out.push({ cell: idx(r, 0), port: 7 }) }      // left
  return out
}

export function makeGame(): TsuroState {
  const deck = makeDeck()
  const starts = shuffle(borderStarts())
  const a = starts[0]
  // second start far enough that they don't immediately occupy the same cell
  let b = starts[1]
  for (const cand of starts.slice(1)) { if (cand.cell !== a.cell) { b = cand; break } }

  const stones: Stone[] = [
    { who: 'you', cell: a.cell, port: a.port, alive: true },
    { who: 'foe', cell: b.cell, port: b.port, alive: true },
  ]
  const hands: Record<Player, Tile[]> = { you: [], foe: [] }
  for (let i = 0; i < 3; i++) { hands.you.push(deck.pop()!); hands.foe.push(deck.pop()!) }

  return {
    placed: new Array(N * N).fill(null),
    stones,
    hands,
    deck,
    turn: 'you',
    you: 'you',
    winner: null,
    last: null,
    log: [{ t: 'sys', x: 'Place a path tile in front of your stone. Follow the path. Last dragon on the board wins.' }],
  }
}

// ---- movement ----------------------------------------------------------------
// From a stone sitting at (cell, port) facing into `cell`, follow placed tiles until
// it lands on an empty cell's edge (return {cell,port}) or is driven off (return null).
export function follow(placed: (Tile | null)[], cell: number, port: number): { cell: number; port: number } | null {
  let cur = { cell, port }
  let guard = 0
  while (guard++ < 500) {
    const tile = placed[cur.cell]
    if (!tile) return cur                 // rests on the edge of an empty cell
    const exitPort = tile[cur.port]       // traverse the tile to its exit port
    const nxt = step(cur.cell, exitPort)  // cross into the neighbouring cell
    if (!nxt) return null                 // exits the board border -> eliminated
    cur = nxt
  }
  return null
}

// ---- legal placement ---------------------------------------------------------
// The forced target cell for a player's stone (the empty cell directly ahead).
export function frontCell(s: TsuroState, who: Player): number | null {
  const st = s.stones.find(x => x.who === who && x.alive)
  if (!st) return null
  return s.placed[st.cell] ? null : st.cell   // already covered shouldn't happen mid-turn
}

// Apply a hand tile (already rotated) onto the current player's forced cell, then
// advance every stone that touches a newly-wired path. Returns the next state.
export function place(s: TsuroState, handIndex: number, rotation: number): TsuroState {
  if (s.winner || !s.turn) return s
  const who = s.turn
  const st = s.stones.find(x => x.who === who && x.alive)
  if (!st) return s
  const target = st.cell
  if (s.placed[target]) return s
  const hand = s.hands[who]
  if (handIndex < 0 || handIndex >= hand.length) return s

  const tile = rotateTile(hand[handIndex], rotation)
  const placed = s.placed.slice()
  placed[target] = tile

  // advance all alive stones; recompute resting positions
  const stones = s.stones.map(x => ({ ...x }))
  let log = s.log
  for (const stn of stones) {
    if (!stn.alive) continue
    const dest = follow(placed, stn.cell, stn.port)
    if (!dest) {
      stn.alive = false
      log = push(log, stn.who === s.you ? 'you' : 'ai', `${stn.who === s.you ? 'Your' : "The rival's"} dragon ran off the board.`)
    } else {
      stn.cell = dest.cell; stn.port = dest.port
    }
  }

  // refill the placing player's hand
  const deck = s.deck.slice()
  const hands: Record<Player, Tile[]> = { you: s.hands.you.slice(), foe: s.hands.foe.slice() }
  hands[who] = hands[who].slice(); hands[who].splice(handIndex, 1)
  if (deck.length) hands[who].push(deck.pop()!)

  const r = rowOf(target), c = colOf(target)
  log = push(log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You' : 'Rival'} laid a tile at ${'ABCDEF'[c]}${r + 1}.`)

  let next: Player | null = who === 'you' ? 'foe' : 'you'
  let winner: Player | 'draw' | null = null

  const youAlive = stones.find(x => x.who === 'you')!.alive
  const foeAlive = stones.find(x => x.who === 'foe')!.alive
  if (!youAlive && !foeAlive) { winner = 'draw'; next = null }
  else if (!youAlive) { winner = 'foe'; next = null }
  else if (!foeAlive) { winner = 'you'; next = null }
  else {
    // The next player must be able to lay a tile on the empty cell ahead. If that cell is
    // already covered, or they have no tiles left to play, they can't move — they're stuck
    // and lose (the other dragon holds the board). Keeps every game finite.
    const nextStone = stones.find(x => x.who === next)!
    const stuck = !!placed[nextStone.cell] || hands[next!].length === 0
    if (stuck) {
      nextStone.alive = false
      winner = next === 'you' ? 'foe' : 'you'
      next = null
    }
  }

  if (winner) {
    const youWon = winner === s.you
    const msg = winner === 'draw' ? 'Both dragons fell together — a draw.' : `${youWon ? 'You win' : 'The rival wins'} — last dragon standing.`
    log = push(log, winner === 'draw' ? 'sys' : (youWon ? 'you' : 'ai'), msg)
  }

  return { ...s, placed, stones, hands, deck, turn: next, last: target, winner, log }
}

// ---- AI ----------------------------------------------------------------------
// Simulate placing (handIndex, rotation): returns whether the AI's own stone survives,
// plus a survival score = open exits the stone can still reach (more = better).
function survivalScore(placed: (Tile | null)[], cell: number, port: number): number {
  // count how many of the 8 ports of the resting cell could lead to a non-off exit
  // as a rough "future options" proxy; higher = the stone has more room.
  if (cell < 0) return 0
  let open = 0
  for (let p = 0; p < 8; p++) {
    const nxt = step(cell, p)
    if (nxt) open++
  }
  return open
}

interface AICand { handIndex: number; rotation: number; safe: boolean; selfScore: number; foeOff: boolean }

function evaluate(s: TsuroState, handIndex: number, rotation: number): AICand {
  const me: Player = 'foe'
  const st = s.stones.find(x => x.who === me && x.alive)!
  const target = st.cell
  const tile = rotateTile(s.hands[me][handIndex], rotation)
  const placed = s.placed.slice(); placed[target] = tile

  const myDest = follow(placed, st.cell, st.port)
  const safe = myDest !== null
  const selfScore = myDest ? survivalScore(placed, myDest.cell, myDest.port) : -1

  const foe = s.stones.find(x => x.who === 'you' && x.alive)
  let foeOff = false
  if (foe) { const fd = follow(placed, foe.cell, foe.port); foeOff = fd === null }

  return { handIndex, rotation, safe, selfScore, foeOff }
}

export function aiMove(s: TsuroState): TsuroState {
  if (s.winner || s.turn !== 'foe') return s
  const hand = s.hands.foe
  if (!hand.length) return s

  const cands: AICand[] = []
  for (let h = 0; h < hand.length; h++) {
    for (let rot = 0; rot < 4; rot++) cands.push(evaluate(s, h, rot))
  }

  // Prefer: safe moves; among safe, ones that drive the opponent off; then most own options.
  const safe = cands.filter(c => c.safe)
  const pool = safe.length ? safe : cands  // never self-eliminate if a safe move exists

  pool.sort((a, b) => {
    if (a.foeOff !== b.foeOff) return a.foeOff ? -1 : 1   // win if you can
    if (a.selfScore !== b.selfScore) return b.selfScore - a.selfScore
    return 0
  })

  // randomise among equally-best to keep games varied
  const top = pool[0]
  const best = pool.filter(c => c.foeOff === top.foeOff && c.selfScore === top.selfScore)
  const choice = best[(Math.random() * best.length) | 0]
  return place(s, choice.handIndex, choice.rotation)
}
