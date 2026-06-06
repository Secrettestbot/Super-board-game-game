/* GO — pure logic (built for this codebase). 9x9 Go, You (Black, 0) vs AI (White, 1).
   Chinese / area scoring with komi for White. Captures, suicide prohibition, simple ko.
   NO React/DOM here. Players are 0 (black) and 1 (white). Empty points are null (NOT 0). */

export type Player = 0 | 1            // 0 = Black (you), 1 = White (AI)
export type Cell = Player | null      // null = empty intersection
export type Winner = 'black' | 'white' | 'draw' | null

export interface GoState {
  size: number
  board: Cell[]                 // length size*size, index = r*size + c
  turn: Player                  // whose move it is
  koPoint: number | null        // forbidden point for simple ko, else null
  consecutivePasses: number
  captures: [number, number]    // stones captured BY [black, white]
  last: number | null           // last placed point (for UI), null if pass/none
  winner: Winner
  score: { black: number; white: number } | null
  komi: number
}

export const DEFAULT_KOMI = 5.5

export const other = (p: Player): Player => (p === 0 ? 1 : 0)
export const idx = (size: number, r: number, c: number) => r * size + c

function neighbors(size: number, p: number): number[] {
  const r = Math.floor(p / size), c = p % size
  const out: number[] = []
  if (r > 0) out.push(p - size)
  if (r < size - 1) out.push(p + size)
  if (c > 0) out.push(p - 1)
  if (c < size - 1) out.push(p + 1)
  return out
}

export function makeGame(size = 9, komi = DEFAULT_KOMI): GoState {
  return {
    size,
    board: new Array(size * size).fill(null),
    turn: 0,
    koPoint: null,
    consecutivePasses: 0,
    captures: [0, 0],
    last: null,
    winner: null,
    score: null,
    komi,
  }
}

/** The maximal orthogonally-connected group of same-colour stones containing `point`.
    Returns [] if `point` is empty. */
export function group(board: Cell[], point: number, size = Math.sqrt(board.length) | 0): number[] {
  const color = board[point]
  if (color == null) return []
  const seen = new Set<number>([point])
  const stack = [point]
  while (stack.length) {
    const q = stack.pop()!
    for (const n of neighbors(size, q)) {
      if (!seen.has(n) && board[n] === color) { seen.add(n); stack.push(n) }
    }
  }
  return [...seen]
}

/** Empty points orthogonally adjacent to any stone of the group (its liberties). */
export function liberties(board: Cell[], grp: number[], size = Math.sqrt(board.length) | 0): number[] {
  const libs = new Set<number>()
  for (const p of grp) {
    for (const n of neighbors(size, p)) {
      if (board[n] == null) libs.add(n)
    }
  }
  return [...libs]
}

interface PlaceResult {
  board: Cell[]
  captured: number[]     // points removed (opponent stones)
  koPoint: number | null // simple-ko forbidden point for the responder, or null
}

/** Try to play `player` at `point` on a fresh board copy, resolving captures.
    Returns null if the move is ILLEGAL (occupied, suicide, or recreates ko). */
function tryPlace(board: Cell[], player: Player, point: number, size: number, koPoint: number | null): PlaceResult | null {
  if (board[point] != null) return null
  if (point === koPoint) return null
  const nb = board.slice()
  nb[point] = player
  const opp = other(player)
  // remove any opponent group adjacent to the move that now has zero liberties
  const captured: number[] = []
  const handled = new Set<number>()
  for (const n of neighbors(size, point)) {
    if (nb[n] === opp && !handled.has(n)) {
      const g = group(nb, n, size)
      for (const q of g) handled.add(q)
      if (liberties(nb, g, size).length === 0) {
        for (const q of g) { nb[q] = null; captured.push(q) }
      }
    }
  }
  // suicide check: our own group must have a liberty (captures already resolved)
  const ownGroup = group(nb, point, size)
  if (liberties(nb, ownGroup, size).length === 0) return null
  // simple ko: exactly one stone captured, placed stone is now a lone stone with one liberty
  let ko: number | null = null
  if (captured.length === 1 && ownGroup.length === 1) {
    if (liberties(nb, ownGroup, size).length === 1) ko = captured[0]
  }
  return { board: nb, captured, koPoint: ko }
}

/** All legal moves for the player to move (excludes suicide and the ko point). */
export function legalMoves(s: GoState): number[] {
  const out: number[] = []
  for (let p = 0; p < s.board.length; p++) {
    if (s.board[p] != null) continue
    if (tryPlace(s.board, s.turn, p, s.size, s.koPoint)) out.push(p)
  }
  return out
}

export function isLegal(s: GoState, point: number): boolean {
  if (s.winner != null) return false
  return tryPlace(s.board, s.turn, point, s.size, s.koPoint) != null
}

/** Place a stone for `player` at `point`. If illegal or not their turn, returns `s` unchanged. */
export function place(s: GoState, player: Player, point: number): GoState {
  if (s.winner != null || s.turn !== player) return s
  const res = tryPlace(s.board, player, point, s.size, s.koPoint)
  if (!res) return s
  const captures: [number, number] = [s.captures[0], s.captures[1]]
  captures[player] += res.captured.length
  return {
    ...s,
    board: res.board,
    turn: other(player),
    koPoint: res.koPoint,
    consecutivePasses: 0,
    captures,
    last: point,
  }
}

/** Pass. Two consecutive passes end the game and trigger scoring. */
export function pass(s: GoState): GoState {
  if (s.winner != null) return s
  const passes = s.consecutivePasses + 1
  if (passes >= 2) {
    const sc = areaScore(s)
    const winner: Winner = sc.black > sc.white ? 'black' : sc.white > sc.black ? 'white' : 'draw'
    return { ...s, turn: other(s.turn), koPoint: null, consecutivePasses: passes, last: null, winner, score: sc }
  }
  return { ...s, turn: other(s.turn), koPoint: null, consecutivePasses: passes, last: null }
}

/** Chinese / area score: each player's stones on the board + empty points surrounded
    ONLY by that player's color (territory). Komi is added to White. */
export function areaScore(s: GoState): { black: number; white: number } {
  const { board, size } = s
  let black = 0, white = 0
  for (const v of board) { if (v === 0) black++; else if (v === 1) white++ }
  // flood empty regions; a region scores for a color only if it touches that color only
  const seen = new Set<number>()
  for (let p = 0; p < board.length; p++) {
    if (board[p] != null || seen.has(p)) continue
    const region: number[] = []
    const stack = [p]
    seen.add(p)
    let touchesBlack = false, touchesWhite = false
    while (stack.length) {
      const q = stack.pop()!
      region.push(q)
      for (const n of neighbors(size, q)) {
        const v = board[n]
        if (v == null) { if (!seen.has(n)) { seen.add(n); stack.push(n) } }
        else if (v === 0) touchesBlack = true
        else touchesWhite = true
      }
    }
    if (touchesBlack && !touchesWhite) black += region.length
    else if (touchesWhite && !touchesBlack) white += region.length
  }
  return { black, white: white + s.komi }
}

/** Public scoring helper. */
export function score(s: GoState): { black: number; white: number } {
  return s.score ?? areaScore(s)
}

export function winner(s: GoState): Winner {
  return s.winner
}

// ===== AI: White (player 1). Capture / save / influence heuristic, very fast. =====

// How much a candidate move helps, from White's perspective.
function evaluateMove(s: GoState, point: number): number {
  const me: Player = 1
  const res = tryPlace(s.board, me, point, s.size, s.koPoint)
  if (!res) return -Infinity
  const size = s.size
  let v = 0

  // 1) Captures are great.
  v += res.captured.length * 60

  // 2) Avoid self-atari: prefer moves that keep our resulting group with many liberties.
  const myGrp = group(res.board, point, size)
  const myLibs = liberties(res.board, myGrp, size).length
  if (myLibs === 1) v -= 25            // putting ourselves in atari is bad
  else v += Math.min(myLibs, 4) * 3

  // 3) Save our stones / atari theirs: look at opponent groups adjacent after the move.
  const opp = other(me)
  const checkedOpp = new Set<number>()
  for (const n of neighbors(size, point)) {
    if (res.board[n] === opp && !checkedOpp.has(n)) {
      const g = group(res.board, n, size)
      for (const q of g) checkedOpp.add(q)
      const l = liberties(res.board, g, size).length
      if (l === 1) v += 18 * g.length    // we put them in atari
    }
  }

  // 4) Defend: if BEFORE the move one of our groups adjacent to this empty point was in atari,
  //    playing here may rescue it (the resulting group has > 1 liberty).
  const checkedMine = new Set<number>()
  for (const n of neighbors(size, point)) {
    if (s.board[n] === me && !checkedMine.has(n)) {
      const g = group(s.board, n, size)
      for (const q of g) checkedMine.add(q)
      if (liberties(s.board, g, size).length === 1 && myLibs > 1) v += 22 * g.length
    }
  }

  // 5) Influence: prefer the central 5x5, discourage the very edge / corners early.
  const r = Math.floor(point / size), c = point % size
  const edgeDist = Math.min(r, c, size - 1 - r, size - 1 - c)
  v += edgeDist * 2.2
  if (edgeDist === 0) v -= 3

  // 6) Don't fill our own eyes / pack stones uselessly: penalize playing fully surrounded by own stones.
  let ownAround = 0, emptyAround = 0, deg = 0
  for (const n of neighbors(size, point)) {
    deg++
    if (s.board[n] === me) ownAround++
    else if (s.board[n] == null) emptyAround++
  }
  if (ownAround === deg) v -= 40        // this empty point is one of our own eyes — leave it
  v += emptyAround * 1.0                // small bonus for breathing room

  // tiny noise to vary play
  v += Math.random() * 0.5
  return v
}

/** White's heuristic move. Returns the resulting state. Passes if it has no
    non-eye-filling, useful move (or only self-destructive moves remain). */
export function aiMove(s: GoState): GoState {
  if (s.winner != null || s.turn !== 1) return s
  const moves = legalMoves(s)
  if (moves.length === 0) return pass(s)

  let best = -Infinity
  let bestMove = -1
  for (const m of moves) {
    const v = evaluateMove(s, m)
    if (v > best) { best = v; bestMove = m }
  }

  // If even the best move looks bad (only fills own eyes / self-ataris with nothing gained),
  // pass instead so the game can terminate.
  if (bestMove < 0 || best <= -20) return pass(s)
  return place(s, 1, bestMove)
}
