/* TAK — pure logic (built for this codebase, not ported).
   2-player road-building stacking game on a 5x5 board. You are player 0, the AI is player 1.

   Each player has a supply of 21 flat/standing STONES + 1 CAPSTONE. A cell holds a STACK of
   pieces (array, bottom-first; the LAST element is the TOP). You control a stack when YOUR
   piece is on top. On your turn you either PLACE one piece from supply on an empty square, or
   MOVE a stack you control: pick up to carryLimit (= board size = 5) pieces off the top, slide
   them in one orthogonal direction, dropping >= 1 piece on each successive square. You may move
   onto a wall only with a LONE capstone, which flattens the wall.

   Piece types: 'flat' (lies flat — roads + stackable), 'wall' (standing — blocks roads, not
   stackable except flattened by a capstone), 'cap' (capstone — roads + flattens a lone wall).

   WIN: a ROAD — a connected chain of YOUR flat/capstone TOP pieces linking two opposite edges
   (top<->bottom or left<->right). If the board fills or a player runs out of pieces, the player
   controlling more flat-topped squares wins (flat count). Falsy-zero care: owner 0 is real, so
   compare owners/players with === and treat empty squares as null. */

export type Owner = 0 | 1
export type PieceType = 'flat' | 'wall' | 'cap'
export interface Piece { owner: Owner; type: PieceType }
/** A square is a stack: array of pieces bottom-first, [] = empty. Top piece = last element. */
export type Stack = Piece[]
export interface Supply { stones: number; capstone: number }
export interface LogEntry { t: string; x: string }

export const SIZE = 5
export const CARRY = SIZE // carry limit equals board size
export const START_STONES = 21
export const START_CAPS = 1

export type Move =
  | { kind: 'place'; at: number; piece: PieceType }
  | { kind: 'move'; from: number; dir: number; drops: number[] } // drops[k] pieces on the k-th square along dir

export interface TakState {
  board: Stack[] // length SIZE*SIZE
  supply: [Supply, Supply] // indexed by owner
  turn: Owner
  moveCount: number // total plies played; increments the AI driver tick
  winner: Owner | 'draw' | null
  winRoad: number[] // squares of the connecting road (for highlight)
  last: number[] // squares touched by the last move
  log: LogEntry[]
}

export const idx = (r: number, c: number) => r * SIZE + c
export const rowOf = (i: number) => Math.floor(i / SIZE)
export const colOf = (i: number) => i % SIZE
const other = (o: Owner): Owner => (o === 0 ? 1 : 0)
const top = (st: Stack): Piece | null => (st.length ? st[st.length - 1] : null)

// Orthogonal directions: 0 up, 1 right, 2 down, 3 left.
const DIRS = [
  { dr: -1, dc: 0 },
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
]
export const DIR_NAME = ['up', 'right', 'down', 'left']

function push(log: LogEntry[], t: string, x: string) {
  return log.concat([{ t, x }]).slice(-24)
}

export function makeGame(): TakState {
  return {
    board: Array.from({ length: SIZE * SIZE }, () => [] as Stack),
    supply: [
      { stones: START_STONES, capstone: START_CAPS },
      { stones: START_STONES, capstone: START_CAPS },
    ],
    turn: 0,
    moveCount: 0,
    winner: null,
    winRoad: [],
    last: [],
    log: [{ t: 'sys', x: 'Place flats, walls and your capstone — link two opposite edges with a road of flats/capstone to win.' }],
  }
}

/** A top piece counts toward a road only if it's a flat or a capstone (not a wall). */
function isRoadTop(p: Piece | null, who: Owner): boolean {
  return p != null && p.owner === who && (p.type === 'flat' || p.type === 'cap')
}

/** True if `who` controls (is on top of) the stack at i. */
export function controls(s: TakState, i: number, who: Owner): boolean {
  const p = top(s.board[i])
  return p != null && p.owner === who
}

/* ===== Road detection =====
   BFS over orthogonally-adjacent squares whose TOP piece is a road piece for `who`. A road
   exists if such a chain links the top row to the bottom row, OR the left column to the right
   column. Returns the connecting path, else null. */
function neighbors4(i: number): number[] {
  const r = rowOf(i), c = colOf(i)
  const out: number[] = []
  for (const { dr, dc } of DIRS) {
    const nr = r + dr, nc = c + dc
    if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) out.push(idx(nr, nc))
  }
  return out
}

function roadOnAxis(board: Stack[], who: Owner, vertical: boolean): number[] | null {
  const startEdge: number[] = []
  for (let k = 0; k < SIZE; k++) startEdge.push(vertical ? idx(0, k) : idx(k, 0))
  const onGoal = (i: number) => (vertical ? rowOf(i) === SIZE - 1 : colOf(i) === SIZE - 1)

  const seen = new Array(SIZE * SIZE).fill(false)
  const prev = new Array<number>(SIZE * SIZE).fill(-1)
  const q: number[] = []
  for (const i of startEdge) if (isRoadTop(top(board[i]), who)) { seen[i] = true; q.push(i) }
  let head = 0, goal = -1
  while (head < q.length) {
    const i = q[head++]
    if (onGoal(i)) { goal = i; break }
    for (const j of neighbors4(i)) {
      if (!seen[j] && isRoadTop(top(board[j]), who)) { seen[j] = true; prev[j] = i; q.push(j) }
    }
  }
  if (goal < 0) return null
  const path: number[] = []
  for (let i = goal; i >= 0; i = prev[i]) path.push(i)
  return path
}

/** Returns the connecting road path for `who` (vertical preferred), or null if none. */
export function roadPath(board: Stack[], who: Owner): number[] | null {
  return roadOnAxis(board, who, true) ?? roadOnAxis(board, who, false)
}

export function hasRoad(s: TakState, who: Owner): boolean {
  return roadPath(s.board, who) != null
}

/** Total pieces a player still has to place. */
function piecesLeft(sup: Supply): number {
  return sup.stones + sup.capstone
}

/** Count flat-topped squares each player controls (for the flat-count tiebreak). */
export function flatCount(s: TakState, who: Owner): number {
  let n = 0
  for (const st of s.board) {
    const p = top(st)
    if (p != null && p.owner === who && p.type === 'flat') n++
  }
  return n
}

/** True when no further placements/fills are possible: board full or a player exhausted. */
export function boardFull(s: TakState): boolean {
  return s.board.every(st => st.length > 0)
}
export function someoneOut(s: TakState): boolean {
  return piecesLeft(s.supply[0]) === 0 || piecesLeft(s.supply[1]) === 0
}

/* ===== Legal move generation ===== */
export function legalMoves(s: TakState): Move[] {
  if (s.winner != null) return []
  const me = s.turn
  const moves: Move[] = []
  const sup = s.supply[me]

  // Placements on empty squares.
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (s.board[i].length === 0) {
      if (sup.stones > 0) { moves.push({ kind: 'place', at: i, piece: 'flat' }); moves.push({ kind: 'place', at: i, piece: 'wall' }) }
      if (sup.capstone > 0) moves.push({ kind: 'place', at: i, piece: 'cap' })
    }
  }

  // Stack moves from controlled squares.
  for (let i = 0; i < SIZE * SIZE; i++) {
    const st = s.board[i]
    if (!controls(s, i, me)) continue
    const maxCarry = Math.min(st.length, CARRY)
    for (let d = 0; d < 4; d++) {
      const { dr, dc } = DIRS[d]
      // How far can we slide, and which squares are blocked?
      // Generate all (take, drop-distribution) combos with each drop >= 1.
      for (let take = 1; take <= maxCarry; take++) {
        const carried = st.slice(st.length - take) // pieces being moved, bottom-first
        const carriesCap = carried[carried.length - 1].type === 'cap' // capstone is always the very top of the carried column
        enumerateDrops(carried, take, (drops) => {
          if (validateSlide(s.board, i, dr, dc, drops, carried, carriesCap)) {
            moves.push({ kind: 'move', from: i, dir: d, drops })
          }
        })
      }
    }
  }
  return moves
}

/** Enumerate ordered compositions of `take` into 1..(take) positive parts (drops per square). */
function enumerateDrops(_carried: Stack, take: number, cb: (drops: number[]) => void) {
  function rec(remaining: number, acc: number[]) {
    if (remaining === 0) { cb(acc.slice()); return }
    for (let d = 1; d <= remaining; d++) { acc.push(d); rec(remaining - d, acc); acc.pop() }
  }
  rec(take, [])
}

/** Check a slide is geometrically legal given the board and the carried column. */
function validateSlide(board: Stack[], from: number, dr: number, dc: number, drops: number[], carried: Stack, carriesCap: boolean): boolean {
  let r = rowOf(from), c = colOf(from)
  for (let k = 0; k < drops.length; k++) {
    r += dr; c += dc
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return false
    const destTop = top(board[idx(r, c)])
    const isLastSquare = k === drops.length - 1
    if (destTop != null) {
      if (destTop.type === 'cap') return false // never stack on a capstone
      if (destTop.type === 'wall') {
        // Can only enter a wall if this is the final square, dropping exactly one piece, a lone capstone.
        if (!isLastSquare) return false
        if (drops[k] !== 1) return false
        if (!carriesCap) return false
        if (carried.length !== 1) return false // lone capstone only
      }
    }
  }
  return true
}

/* ===== Apply a move ===== */
export function applyMove(s: TakState, m: Move): TakState {
  if (s.winner != null) return s
  const me = s.turn
  const board = s.board.map(st => st.slice())
  const supply: [Supply, Supply] = [{ ...s.supply[0] }, { ...s.supply[1] }]
  const touched: number[] = []
  let log = s.log

  if (m.kind === 'place') {
    if (board[m.at].length !== 0) return s
    if (m.piece === 'cap') {
      if (supply[me].capstone <= 0) return s
      supply[me].capstone -= 1
    } else {
      if (supply[me].stones <= 0) return s
      supply[me].stones -= 1
    }
    board[m.at] = [{ owner: me, type: m.piece }]
    touched.push(m.at)
    const label = m.piece === 'flat' ? 'a flat' : m.piece === 'wall' ? 'a wall' : 'the capstone'
    log = push(log, me === 0 ? 'you' : 'ai', `${me === 0 ? 'You' : 'Rival'} placed ${label}.`)
  } else {
    const st = board[m.from]
    const take = m.drops.reduce((a, b) => a + b, 0)
    if (take > st.length || take > CARRY) return s
    const carried = st.slice(st.length - take)
    board[m.from] = st.slice(0, st.length - take)
    touched.push(m.from)
    const carriesCap = carried[carried.length - 1].type === 'cap'
    if (!validateSlide(board, m.from, DIRS[m.dir].dr, DIRS[m.dir].dc, m.drops, carried, carriesCap)) return s
    let r = rowOf(m.from), c = colOf(m.from)
    let ci = 0
    for (let k = 0; k < m.drops.length; k++) {
      r += DIRS[m.dir].dr; c += DIRS[m.dir].dc
      const cell = idx(r, c)
      // Flatten a wall when a lone capstone lands on it.
      const destTop = top(board[cell])
      if (destTop != null && destTop.type === 'wall') {
        board[cell][board[cell].length - 1] = { owner: destTop.owner, type: 'flat' }
      }
      const slice = carried.slice(ci, ci + m.drops[k])
      board[cell] = board[cell].concat(slice)
      ci += m.drops[k]
      touched.push(cell)
    }
    log = push(log, me === 0 ? 'you' : 'ai', `${me === 0 ? 'You' : 'Rival'} moved a stack ${DIR_NAME[m.dir]}.`)
  }

  let next: TakState = {
    ...s,
    board,
    supply,
    turn: other(me),
    moveCount: s.moveCount + 1,
    last: touched,
    log,
  }

  // Win check: a road for the MOVER wins immediately; if both somehow form, the mover's road
  // takes precedence (they completed the move). Then check the opponent.
  const myRoad = roadPath(board, me)
  const opRoad = roadPath(board, other(me))
  if (myRoad) {
    next = { ...next, winner: me, turn: me, winRoad: myRoad, log: push(log, me === 0 ? 'you' : 'ai', `${me === 0 ? 'You complete a road — you win!' : 'Rival completes a road — rival wins.'}`) }
    return next
  }
  if (opRoad) {
    const w = other(me)
    next = { ...next, winner: w, turn: w, winRoad: opRoad, log: push(log, w === 0 ? 'you' : 'ai', `${w === 0 ? 'Your road completes — you win!' : 'Rival road completes — rival wins.'}`) }
    return next
  }

  // Flat-count end if board full or someone ran out of pieces.
  if (boardFull(next) || someoneOut(next)) {
    const f0 = flatCount(next, 0), f1 = flatCount(next, 1)
    const w: Owner | 'draw' = f0 === f1 ? 'draw' : f0 > f1 ? 0 : 1
    next = { ...next, winner: w, winRoad: [], log: push(next.log, w === 'draw' ? 'sys' : w === 0 ? 'you' : 'ai', w === 'draw' ? 'Board full — a tie on flats.' : `Board full — ${w === 0 ? 'you win' : 'rival wins'} on flat count.`) }
  }

  return next
}

/* ===== AI =====
   Road-seeking heuristic with a 1-ply search. For each legal move, evaluate the resulting
   board: a finished road for the AI scores +infinity; otherwise score = (improvement of the
   AI's connection distance) minus (the opponent's connection distance) with small bonuses for
   building flats/capstone road pieces and a penalty for handing the opponent an immediate road.
   Connection distance = a 0-1 BFS: stepping onto an own road-top costs 0, an empty/own
   stackable square costs 1, a blocked square (opponent road piece or any wall) is impassable. */
function connectionDistance(board: Stack[], who: Owner): number {
  const dist = new Array(SIZE * SIZE).fill(Infinity)
  const passCost = (i: number): number => {
    const p = top(board[i])
    if (p == null) return 1 // empty: could place there
    if (p.owner === who && (p.type === 'flat' || p.type === 'cap')) return 0
    if (p.type === 'wall') return Infinity // walls block (either owner)
    if (p.owner === who) return 1 // own wall already handled; own flat handled; fallthrough safety
    return Infinity // opponent flat/cap blocks the path top
  }
  let best = Infinity
  for (let vertical = 0; vertical < 2; vertical++) {
    dist.fill(Infinity)
    const deque: number[] = []
    const startEdge: number[] = []
    for (let k = 0; k < SIZE; k++) startEdge.push(vertical ? idx(0, k) : idx(k, 0))
    const onGoal = (i: number) => (vertical ? rowOf(i) === SIZE - 1 : colOf(i) === SIZE - 1)
    for (const i of startEdge) {
      const w = passCost(i)
      if (w === Infinity) continue
      if (w < dist[i]) { dist[i] = w; w === 0 ? deque.unshift(i) : deque.push(i) }
    }
    while (deque.length) {
      const i = deque.shift()!
      const d = dist[i]
      if (d > dist[i]) continue
      if (onGoal(i)) { if (d < best) best = d; continue }
      for (const j of neighbors4(i)) {
        const w = passCost(j)
        if (w === Infinity) continue
        const nd = d + w
        if (nd < dist[j]) { dist[j] = nd; w === 0 ? deque.unshift(j) : deque.push(j) }
      }
    }
  }
  return best
}

function evaluate(board: Stack[], me: Owner): number {
  const opp = other(me)
  if (roadPath(board, me)) return 1e6
  if (roadPath(board, opp)) return -1e6
  const myD = connectionDistance(board, me)
  const opD = connectionDistance(board, opp)
  // Lower distance is better for me; lower opponent distance is bad.
  let score = (opD - myD) * 10
  // Material: reward our road-capable top pieces, lightly.
  let myTops = 0, opTops = 0
  for (const st of board) {
    const p = top(st)
    if (p == null) continue
    if (p.owner === me && (p.type === 'flat' || p.type === 'cap')) myTops++
    else if (p.owner === opp && (p.type === 'flat' || p.type === 'cap')) opTops++
  }
  score += (myTops - opTops) * 0.5
  return score
}

export function aiBestMove(s: TakState): Move | null {
  if (s.winner != null) return null
  const me = s.turn
  const moves = legalMoves(s)
  if (!moves.length) return null

  let best: Move | null = null
  let bestV = -Infinity
  for (const m of moves) {
    const after = applyMove(s, m)
    // Score from the AI's perspective on the resulting board.
    let v = evaluate(after.board, me)
    if (after.winner === me) v += 5e5
    v += Math.random() * 0.01 // tie-break jitter
    if (v > bestV) { bestV = v; best = m }
  }
  return best
}

/** Apply the AI's chosen move (single-call: one move per turn). */
export function aiTurn(s: TakState): TakState {
  const m = aiBestMove(s)
  if (!m) {
    // No legal move (shouldn't happen unless board is full) — resolve by flat count.
    if (boardFull(s) || someoneOut(s)) {
      const f0 = flatCount(s, 0), f1 = flatCount(s, 1)
      const w: Owner | 'draw' = f0 === f1 ? 'draw' : f0 > f1 ? 0 : 1
      return { ...s, winner: w, winRoad: [] }
    }
    return s
  }
  return applyMove(s, m)
}
