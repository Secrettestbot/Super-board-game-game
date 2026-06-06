/* QWIRKLE — pure logic (built for this codebase, no port, no React/DOM).
   108 tiles = 6 colors × 6 shapes, 3 copies each. Each player holds 6 tiles drawn from a bag.
   On a turn a player places 1+ tiles in a single straight LINE (one row or one column),
   contiguous with existing tiles after the first turn. Every line a placement touches — the
   line being built plus any perpendicular lines — must be a valid Qwirkle line: all tiles
   share EITHER one color (distinct shapes) OR one shape (distinct colors), no duplicate
   color+shape, max 6. Scoring: each line containing a newly placed tile scores 1 per tile;
   a line completed to 6 ("Qwirkle") scores +6 bonus; a tile in two lines scores both.
   Alternatively a player may SWAP any number of tiles, forfeiting the turn. The game ends
   when the bag is empty and a player plays their last tile (+6 bonus). Highest score wins.

   Player 0 = you, player 1 = AI. Coordinates can be 0/negative — the board is a sparse map. */

export const COLORS = ['r', 'o', 'y', 'g', 'b', 'p'] as const
export const SHAPES = ['circle', 'square', 'diamond', 'star', 'clover', 'cross'] as const
export type Color = typeof COLORS[number]
export type Shape = typeof SHAPES[number]
export const HAND_SIZE = 6
export const QWIRKLE = 6

export interface Tile { color: Color; shape: Shape; id: number }
export interface Placement { r: number; c: number; tile: Tile }
export interface LogEntry { t: string; x: string }

/** Sparse board: key = `${r},${c}` -> Tile. */
export type Board = Map<string, Tile>

export interface QState {
  board: Board
  bag: Tile[]
  hands: [Tile[], Tile[]]   // hands[0] = you, hands[1] = ai
  scores: [number, number]
  turn: 0 | 1
  winner: 0 | 1 | 'draw' | null
  last: Placement[]          // tiles placed on the most recent placement turn (for highlight)
  log: LogEntry[]
}

export const key = (r: number, c: number) => `${r},${c}`
export const sameTile = (a: Tile, b: Tile) => a.color === b.color && a.shape === b.shape

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-26) }

// ---- bag construction -------------------------------------------------------

/** The full deterministic 108-tile set (3 copies of each color×shape), ids 0..107. */
export function fullBag(): Tile[] {
  const tiles: Tile[] = []
  let id = 0
  for (const color of COLORS)
    for (const shape of SHAPES)
      for (let k = 0; k < 3; k++) tiles.push({ color, shape, id: id++ })
  return tiles
}

/** Deterministic Mulberry32 shuffle so tests are reproducible. */
function shuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice()
  let s = seed >>> 0
  const rnd = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0
      ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Create a fresh game. Pass an explicit bag for deterministic tests; otherwise random-shuffled. */
export function makeGame(optionalBag?: Tile[]): QState {
  const bag = optionalBag ? optionalBag.slice() : shuffle(fullBag(), (Math.random() * 2 ** 31) | 0)
  const hands: [Tile[], Tile[]] = [[], []]
  for (let i = 0; i < HAND_SIZE; i++) { hands[0].push(bag.shift()!); hands[1].push(bag.shift()!) }
  return {
    board: new Map(),
    bag,
    hands,
    scores: [0, 0],
    turn: 0,
    winner: null,
    last: [],
    log: [{ t: 'sys', x: 'You move first. Build lines of matching color or shape.' }],
  }
}

// ---- line validity ----------------------------------------------------------

/** Is `tiles` a valid Qwirkle line? (all same color w/ distinct shapes, OR all same shape w/
    distinct colors; no duplicate tile; ≤6). A single tile is trivially valid. */
export function isValidLine(tiles: Tile[]): boolean {
  if (tiles.length === 0) return false
  if (tiles.length > QWIRKLE) return false
  // duplicate color+shape?
  for (let i = 0; i < tiles.length; i++)
    for (let j = i + 1; j < tiles.length; j++)
      if (sameTile(tiles[i], tiles[j])) return false
  if (tiles.length === 1) return true
  const allColor = tiles.every(t => t.color === tiles[0].color)
  const allShape = tiles.every(t => t.shape === tiles[0].shape)
  return allColor || allShape
}

/** Walk from (r,c) in direction (dr,dc) collecting contiguous board tiles (excluding the
    start cell). Returns them in outward order. A `extra` map of pending placements is merged. */
function collect(board: Board, extra: Map<string, Tile>, r: number, c: number, dr: number, dc: number): Tile[] {
  const out: Tile[] = []
  let rr = r + dr, cc = c + dc
  for (; ;) {
    const k = key(rr, cc)
    const t = extra.get(k) ?? board.get(k)
    if (!t) break
    out.push(t)
    rr += dr; cc += dc
  }
  return out
}

/** The full line (row or column) through (r,c) including (r,c) itself, given a merged board. */
function lineThrough(merged: Board, r: number, c: number, horizontal: boolean): Tile[] {
  const dr = horizontal ? 0 : 1
  const dc = horizontal ? 1 : 0
  const before = collect(merged, new Map(), r, c, -dr, -dc).reverse()
  const after = collect(merged, new Map(), r, c, dr, dc)
  return [...before, merged.get(key(r, c))!, ...after]
}

export interface LegalResult { ok: boolean; reason?: string }

/** Validate a set of placements against the current board. */
export function isLegalPlacement(board: Board, placements: Placement[]): LegalResult {
  if (placements.length === 0) return { ok: false, reason: 'No tiles placed.' }

  // No two placements on the same cell; none on an occupied cell.
  const cells = new Set<string>()
  for (const p of placements) {
    const k = key(p.r, p.c)
    if (cells.has(k)) return { ok: false, reason: 'Two tiles on one cell.' }
    if (board.has(k)) return { ok: false, reason: 'Cell already occupied.' }
    cells.add(k)
  }
  // No duplicate tile id among placed (can't place the same physical tile twice).
  const ids = new Set<number>()
  for (const p of placements) {
    if (ids.has(p.tile.id)) return { ok: false, reason: 'Same tile placed twice.' }
    ids.add(p.tile.id)
  }

  // All placements share a single row or single column.
  const rows = new Set(placements.map(p => p.r))
  const colsS = new Set(placements.map(p => p.c))
  const horizontal = rows.size === 1
  const vertical = colsS.size === 1
  if (!horizontal && !vertical) return { ok: false, reason: 'Tiles must be in one line.' }
  void vertical

  // Merged view of board + placements.
  const merged: Board = new Map(board)
  for (const p of placements) merged.set(key(p.r, p.c), p.tile)

  const firstMove = board.size === 0

  // Contiguity along the placement axis: the placed cells + any existing tiles between them
  // must form an unbroken segment. For a single placement either axis works (it's one cell).
  const axisHoriz = horizontal
  {
    const along = placements.map(p => (axisHoriz ? p.c : p.r)).sort((a, b) => a - b)
    const fixed = axisHoriz ? placements[0].r : placements[0].c
    for (let v = along[0]; v <= along[along.length - 1]; v++) {
      const k = axisHoriz ? key(fixed, v) : key(v, fixed)
      if (!merged.has(k)) return { ok: false, reason: 'Tiles must be contiguous.' }
    }
  }

  // Connection: after the first move every placement group must touch an existing tile.
  if (!firstMove) {
    let touches = false
    for (const p of placements) {
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const k = key(p.r + dr, p.c + dc)
        if (board.has(k)) { touches = true; break }
      }
      if (touches) break
    }
    if (!touches) return { ok: false, reason: 'Must connect to the board.' }
  } else {
    if (placements.length === 0) return { ok: false, reason: 'No tiles placed.' }
  }

  // Validate every distinct line touched by a placement: the main line + each perpendicular.
  const checked = new Set<string>()
  for (const p of placements) {
    for (const horiz of [true, false]) {
      const line = lineThrough(merged, p.r, p.c, horiz)
      if (line.length < 2) continue
      const fixed = horiz ? p.r : p.c
      const lo = leftmost(merged, p.r, p.c, horiz)
      const hi = lo + line.length - 1
      const sig = `${horiz ? 'h' : 'v'}:${fixed}:${lo}:${hi}`
      if (checked.has(sig)) continue
      checked.add(sig)
      if (!isValidLine(line)) return { ok: false, reason: 'Invalid line — color/shape/duplicate.' }
    }
  }

  return { ok: true }
}

/** Coordinate (col if horiz, else row) of the leftmost/topmost tile in the line through (r,c). */
function leftmost(merged: Board, r: number, c: number, horiz: boolean): number {
  const dr = horiz ? 0 : 1, dc = horiz ? 1 : 0
  let rr = r, cc = c
  for (; ;) {
    const k = key(rr - dr, cc - dc)
    if (!merged.has(k)) break
    rr -= dr; cc -= dc
  }
  return horiz ? cc : rr
}

// ---- scoring ----------------------------------------------------------------

/** Score a (legal) placement against the current board. */
export function scorePlacement(board: Board, placements: Placement[]): number {
  const merged: Board = new Map(board)
  for (const p of placements) merged.set(key(p.r, p.c), p.tile)

  const counted = new Set<string>()
  let score = 0
  for (const p of placements) {
    for (const horiz of [true, false]) {
      const line = lineThrough(merged, p.r, p.c, horiz)
      if (line.length < 2) continue
      const fixed = horiz ? p.r : p.c
      const lo = leftmost(merged, p.r, p.c, horiz)
      const hi = lo + line.length - 1
      const sig = `${horiz ? 'h' : 'v'}:${fixed}:${lo}:${hi}`
      if (counted.has(sig)) continue
      counted.add(sig)
      score += line.length
      if (line.length === QWIRKLE) score += QWIRKLE   // Qwirkle bonus
    }
  }
  // A lone first tile that forms no line still scores 1 point for itself.
  if (placements.length === 1 && score === 0) score = 1
  return score
}

// ---- applying turns ---------------------------------------------------------

function refill(bag: Tile[], hand: Tile[]): void {
  while (hand.length < HAND_SIZE && bag.length > 0) hand.push(bag.shift()!)
}

function decideWinner(s: QState): void {
  if (s.scores[0] > s.scores[1]) s.winner = 0
  else if (s.scores[1] > s.scores[0]) s.winner = 1
  else s.winner = 'draw'
}

function endIfDone(s: QState): void {
  if (s.bag.length === 0 && (s.hands[0].length === 0 || s.hands[1].length === 0)) decideWinner(s)
}

/** Does this player have ANY legal placement with their current hand? */
export function hasMove(s: QState, player: 0 | 1): boolean {
  return bestPlacementFor(s, player) != null
}

/** Apply a placement for the player whose turn it is. Returns a NEW state. Caller must have
    already validated legality (we re-check and no-op on failure). */
export function applyPlacement(s: QState, placements: Placement[]): QState {
  if (s.winner != null) return s
  const player = s.turn
  const legal = isLegalPlacement(s.board, placements)
  if (!legal.ok) return s
  // every placed tile must be in the player's hand
  const hand = s.hands[player].slice()
  for (const p of placements) {
    const i = hand.findIndex(t => t.id === p.tile.id)
    if (i < 0) return s
    hand.splice(i, 1)
  }

  const gained = scorePlacement(s.board, placements)
  const board: Board = new Map(s.board)
  for (const p of placements) board.set(key(p.r, p.c), p.tile)

  const bag = s.bag.slice()
  const emptiedHandBeforeRefill = hand.length === 0 && bag.length === 0
  refill(bag, hand)

  const scores: [number, number] = [s.scores[0], s.scores[1]]
  scores[player] += gained
  // End-of-game bonus: played your last tile with an empty bag.
  let bonusNote = ''
  if (emptiedHandBeforeRefill) { scores[player] += QWIRKLE; bonusNote = ' +6 for going out!' }

  const hands: [Tile[], Tile[]] = player === 0 ? [hand, s.hands[1].slice()] : [s.hands[0].slice(), hand]

  const name = player === 0 ? 'You' : 'Rival'
  const tag = player === 0 ? 'you' : 'ai'
  let log = push(s.log, tag, `${name} placed ${placements.length} tile${placements.length > 1 ? 's' : ''} for ${gained} point${gained === 1 ? '' : 's'}.${bonusNote}`)

  const next: QState = {
    board, bag, hands, scores,
    turn: (player === 0 ? 1 : 0) as 0 | 1,
    winner: null,
    last: placements.slice(),
    log,
  }
  endIfDone(next)
  if (next.winner != null) {
    next.turn = player // freeze
    const w = next.winner
    log = push(log, 'sys',
      w === 'draw' ? 'The bag is empty and a hand is out — a tie!' :
        w === 0 ? 'The bag is empty and you went out — you win!' :
          'The bag is empty and the rival went out — you lose.')
    next.log = log
  }
  return next
}

/** Swap `tileIds` from the current player's hand back into the bag, draw replacements. Forfeits
    the turn. No-op if the bag can't cover the swap (must draw exactly as many as returned, but
    Qwirkle allows swapping up to bag size — here we require bag has at least the swap count). */
export function swap(s: QState, tileIds: number[]): QState {
  if (s.winner != null) return s
  const player = s.turn
  if (tileIds.length === 0) return s
  if (s.bag.length < tileIds.length) return s   // not enough to refill — illegal swap

  const hand = s.hands[player].slice()
  const removed: Tile[] = []
  for (const id of tileIds) {
    const i = hand.findIndex(t => t.id === id)
    if (i < 0) return s
    removed.push(hand[i])
    hand.splice(i, 1)
  }
  // draw replacements first, THEN return removed to bag (so you can't redraw the same tiles)
  const bag = s.bag.slice()
  for (let i = 0; i < removed.length; i++) hand.push(bag.shift()!)
  for (const t of removed) bag.push(t)

  const hands: [Tile[], Tile[]] = player === 0 ? [hand, s.hands[1].slice()] : [s.hands[0].slice(), hand]
  const name = player === 0 ? 'You' : 'Rival'
  const tag = player === 0 ? 'you' : 'ai'
  const log = push(s.log, tag, `${name} swapped ${removed.length} tile${removed.length > 1 ? 's' : ''}.`)

  return {
    board: new Map(s.board), bag, hands,
    scores: [s.scores[0], s.scores[1]],
    turn: (player === 0 ? 1 : 0) as 0 | 1,
    winner: null, last: [], log,
  }
}

export function winner(s: QState): 0 | 1 | 'draw' | null { return s.winner }

// ---- AI: greedy best-scoring placement --------------------------------------

/** Empty cells adjacent to existing board tiles (anchors). For an empty board, the origin. */
function anchorCells(board: Board): { r: number; c: number }[] {
  if (board.size === 0) return [{ r: 0, c: 0 }]
  const seen = new Set<string>()
  const out: { r: number; c: number }[] = []
  for (const k of board.keys()) {
    const [r, c] = k.split(',').map(Number)
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nr = r + dr, nc = c + dc
      const nk = key(nr, nc)
      if (board.has(nk) || seen.has(nk)) continue
      seen.add(nk)
      out.push({ r: nr, c: nc })
    }
  }
  return out
}

/** Best single-tile-on-a-cell options, used as a greedy seed and for multi-tile extension. */
function bestPlacementFor(s: QState, player: 0 | 1): { placements: Placement[]; score: number } | null {
  const board = s.board
  const hand = s.hands[player]
  const anchors = anchorCells(board)

  let best: { placements: Placement[]; score: number } | null = null
  const consider = (placements: Placement[]) => {
    if (!isLegalPlacement(board, placements).ok) return
    const sc = scorePlacement(board, placements)
    if (!best || sc > best.score) best = { placements, score: sc }
  }

  // 1) Every single tile on every anchor.
  const singles: Placement[] = []
  for (const a of anchors) {
    for (const tile of hand) {
      const p: Placement = { r: a.r, c: a.c, tile }
      consider([p])
      if (isLegalPlacement(board, [p]).ok) singles.push(p)
    }
  }

  // 2) Greedily extend the best legal single along each axis with remaining hand tiles.
  //    Cap the breadth so this stays fast.
  const tryExtend = (seed: Placement) => {
    for (const horiz of [true, false]) {
      const used = new Set<number>([seed.tile.id])
      const placements: Placement[] = [seed]
      // extend forward then backward
      for (const dir of [1, -1]) {
        let step = 1
        for (; ;) {
          const r = seed.r + (horiz ? 0 : dir * step)
          const c = seed.c + (horiz ? dir * step : 0)
          if (board.has(key(r, c))) { step++; continue }
          // find a hand tile (unused) that keeps the whole placement legal
          let placed = false
          for (const tile of hand) {
            if (used.has(tile.id)) continue
            const cand = placements.concat([{ r, c, tile }])
            if (isLegalPlacement(board, cand).ok) {
              placements.push({ r, c, tile })
              used.add(tile.id)
              consider(placements.slice())
              placed = true
              break
            }
          }
          if (!placed) break
          step++
        }
      }
    }
  }
  // Try extending from the few best singles (cap to keep it fast).
  const seedPool = singles
    .map(p => ({ p, sc: isLegalPlacement(board, [p]).ok ? scorePlacement(board, [p]) : -1 }))
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 14)
  for (const { p } of seedPool) tryExtend(p)

  return best
}

/** AI takes its whole turn: best greedy placement, else swap its dead tiles, else pass-by-swap. */
export function aiTurn(s: QState): QState {
  if (s.winner != null || s.turn !== 1) return s
  const best = bestPlacementFor(s, 1)
  if (best && best.score > 0) return applyPlacement(s, best.placements)

  // No placement: swap. Prefer swapping the whole hand if the bag allows; else swap what we can.
  const hand = s.hands[1]
  if (s.bag.length > 0) {
    const n = Math.min(hand.length, s.bag.length)
    const ids = hand.slice(0, n).map(t => t.id)
    return swap(s, ids)
  }
  // Bag empty and nothing to place: pass. If the opponent also can't move, the game is stuck —
  // end it on score. Otherwise flip the turn.
  if (!hasMove(s, 0)) {
    const ended: QState = { ...s, last: [], log: push(s.log, 'sys', 'Neither player can move — the game ends.') }
    decideWinner(ended)
    return ended
  }
  const log = push(s.log, 'ai', 'Rival has no move and passes.')
  return { ...s, turn: 0, last: [], log }
}
