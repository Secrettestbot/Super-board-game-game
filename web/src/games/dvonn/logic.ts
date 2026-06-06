/* DVONN — pure logic (built for this codebase, not ported).

   Board: a 7x7 axial-coordinate rhombus = 49 connected hex cells (the prompt's
   allowed "clean ~49-cell hex field"). Cell index = r*W + c, r,c in 0..6. Hex
   adjacency uses axial directions: (+1,0),(-1,0),(0,+1),(0,-1),(+1,-1),(-1,+1) —
   six neighbours, clamped to the board, so it is one connected component.

   Pieces: 3 red DVONN pieces + 23 white (you) + 23 black (ai) = 49, fills the board.

   PHASE 1 (placement): the 3 red pieces are placed first (alternating, but colour
   is always red), then players alternate placing their own pieces (you white, ai
   black) until every cell holds exactly one piece.

   PHASE 2 (movement): each cell holds a STACK (bottom..top). The TOP piece's colour
   controls the stack. On your turn move a stack you control in one of the 6 straight
   hex directions a number of cells EXACTLY equal to the stack's HEIGHT, landing ON
   TOP of another (occupied) stack — never onto an empty cell, and you may not move a
   stack that is completely surrounded (no empty neighbour). After every move, any
   stack not connected (through chains of occupied neighbours) to a cell holding a red
   DVONN piece is REMOVED. Players who cannot move pass; when neither can move the game
   ends. SCORE: pieces in stacks you control (top is your colour). Most pieces wins. */

export const W = 7
export const H = 7
export const NCELLS = W * H

export type Color = 'w' | 'b' | 'r'   // white(you) · black(ai) · red(DVONN)
export type Player = 0 | 1            // 0 = you (white) · 1 = ai (black)
export type Piece = { color: Color }
export type Stack = Piece[]           // bottom..top; null cell = empty
export type Phase = 'place' | 'move' | 'done'

export interface Move { from: number; to: number }
export interface LogEntry { t: string; x: string }

export interface DvonnState {
  board: (Stack | null)[]   // length NCELLS; null = empty
  phase: Phase
  turn: Player              // whose action it is
  // placement counters
  redLeft: number           // red DVONN pieces still to place
  place: [number, number]   // white-left, black-left to place in phase 1
  // movement
  winner: Player | null     // set when phase === 'done'
  passed: [boolean, boolean] // did each player just pass (both => game over)
  last: Move | null
  log: LogEntry[]
  tick: number              // monotonic counter — drives the AI useAITurn re-arm
}

export const idx = (r: number, c: number) => r * W + c
const inB = (r: number, c: number) => r >= 0 && r < H && c >= 0 && c < W

// six axial hex directions
const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
] as const

export function neighbors(i: number): number[] {
  const r = Math.floor(i / W), c = i % W
  const out: number[] = []
  for (const [dr, dc] of DIRS) {
    const nr = r + dr, nc = c + dc
    if (inB(nr, nc)) out.push(idx(nr, nc))
  }
  return out
}

const other = (p: Player): Player => (p === 0 ? 1 : 0)
export const colorOf = (p: Player): Color => (p === 0 ? 'w' : 'b')
const top = (st: Stack): Color => st[st.length - 1].color
export const stackHasRed = (st: Stack): boolean => st.some(pc => pc.color === 'r')
export const controllerOf = (st: Stack): Player | null => {
  const t = top(st)
  return t === 'w' ? 0 : t === 'b' ? 1 : null
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-26) }
const COL = 'ABCDEFG'
export const sq = (i: number) => `${COL[i % W]}${Math.floor(i / W) + 1}`

export function makeGame(): DvonnState {
  return {
    board: new Array(NCELLS).fill(null),
    phase: 'place',
    turn: 0,
    redLeft: 3,
    place: [23, 23],
    winner: null,
    passed: [false, false],
    last: null,
    log: [{ t: 'sys', x: 'Placement: the 3 red DVONN pieces go down first, then you and the rival fill the board.' }],
    tick: 0,
  }
}

// ----- PHASE 1: placement -----

export function legalPlacements(s: DvonnState): number[] {
  if (s.phase !== 'place') return []
  const out: number[] = []
  for (let i = 0; i < NCELLS; i++) if (s.board[i] == null) out.push(i)
  return out
}

// What colour the current action places (red while redLeft>0, else the turn's colour).
export function placingColor(s: DvonnState): Color {
  return s.redLeft > 0 ? 'r' : colorOf(s.turn)
}

export function placePiece(s: DvonnState, cell: number): DvonnState {
  if (s.phase !== 'place' || cell < 0 || cell >= NCELLS || s.board[cell] != null) return s
  const board = s.board.slice()
  const color = placingColor(s)
  board[cell] = [{ color }]
  let redLeft = s.redLeft
  const place: [number, number] = [s.place[0], s.place[1]]
  let turn = s.turn
  if (color === 'r') {
    redLeft -= 1
  } else {
    place[s.turn] -= 1
    turn = other(s.turn)
  }
  // After reds are gone, the very first own-piece placer is player 0 (white).
  if (s.redLeft > 0 && redLeft === 0) turn = 0
  const filled = board.every(v => v != null)
  const log = push(s.log, color === 'r' ? 'sys' : (color === 'w' ? 'you' : 'ai'),
    `${color === 'r' ? 'A red DVONN piece' : color === 'w' ? 'You' : 'Rival'} placed at ${sq(cell)}.`)
  let phase: Phase = 'place'
  if (filled) { phase = 'move'; turn = 0 }
  const next: DvonnState = {
    ...s, board, redLeft, place, turn, phase, last: null,
    passed: [false, false],
    log: phase === 'move' ? push(log, 'sys', 'Board full — movement begins. You move first.') : log,
    tick: s.tick + 1,
  }
  return next
}

// ----- PHASE 2: movement -----

// straight-line cell `height` steps in direction d from `from`; -1 if it leaves the board.
function lineTarget(from: number, d: readonly [number, number], height: number): number {
  let r = Math.floor(from / W), c = from % W
  for (let k = 0; k < height; k++) { r += d[0]; c += d[1]; if (!inB(r, c)) return -1 }
  return idx(r, c)
}

// True if cell i is the bottom of a single-cell island (all 6 directions immediately
// off-board or empty) — such a height-1 piece truly cannot reach an occupied cell at
// its move distance. We don't pre-gate on "empty neighbour": a stack is only blocked
// when NO legal landing exists, which the per-direction scan below already enforces.
function isIsolated(board: (Stack | null)[], i: number): boolean {
  for (const j of neighbors(i)) if (board[j] != null) return false
  return true
}

export function legalMoves(s: DvonnState, player: Player): Move[] {
  if (s.phase !== 'move') return []
  const out: Move[] = []
  for (let i = 0; i < NCELLS; i++) {
    const st = s.board[i]
    if (st == null) continue
    if (controllerOf(st) !== player) continue
    if (isIsolated(s.board, i)) continue          // a stack with no occupied neighbour at all is stranded
    const h = st.length
    for (const d of DIRS) {
      const to = lineTarget(i, d, h)
      if (to < 0) continue
      if (s.board[to] == null) continue           // must land ON an occupied stack
      out.push({ from: i, to })
    }
  }
  return out
}

// Remove every stack not connected (via occupied-neighbour chains) to a red DVONN cell.
function removeDisconnected(board: (Stack | null)[]): { board: (Stack | null)[]; removed: number } {
  const keep = new Array<boolean>(NCELLS).fill(false)
  const q: number[] = []
  for (let i = 0; i < NCELLS; i++) {
    const st = board[i]
    if (st != null && stackHasRed(st)) { keep[i] = true; q.push(i) }
  }
  let head = 0
  while (head < q.length) {
    const i = q[head++]
    for (const j of neighbors(i)) {
      if (!keep[j] && board[j] != null) { keep[j] = true; q.push(j) }
    }
  }
  const nb = board.slice()
  let removed = 0
  for (let i = 0; i < NCELLS; i++) {
    if (nb[i] != null && !keep[i]) { nb[i] = null; removed++ }
  }
  return { board: nb, removed }
}

export function applyMove(s: DvonnState, from: number, to: number): DvonnState {
  if (s.phase !== 'move') return s
  const src = s.board[from], dst = s.board[to]
  if (src == null || dst == null) return s
  // validate it's a legal move for the controller
  const player = controllerOf(src)
  if (player == null) return s
  if (!legalMoves(s, player).some(m => m.from === from && m.to === to)) return s

  let board = s.board.slice()
  board[to] = dst.concat(src)   // src lands on top of dst
  board[from] = null
  const res = removeDisconnected(board)
  board = res.board

  const mover = player
  let log = push(s.log, mover === 0 ? 'you' : 'ai',
    `${mover === 0 ? 'You' : 'Rival'} moved ${sq(from)} → ${sq(to)} (h${src.length}).`)
  if (res.removed > 0) log = push(log, 'sys', `${res.removed} stack${res.removed > 1 ? 's' : ''} cut off from the DVONN pieces and removed.`)

  // hand turn to the opponent; resolve passes / game over below
  return resolveTurn({ ...s, board, last: { from, to }, log, passed: [false, false], tick: s.tick + 1 }, other(mover))
}

// Advance the turn to `next`, skipping a player who cannot move; end the game when
// neither can move.
function resolveTurn(s: DvonnState, next: Player): DvonnState {
  const canNext = legalMoves(s, next).length > 0
  if (canNext) return { ...s, turn: next }
  const canOther = legalMoves(s, other(next)).length > 0
  if (canOther) {
    // `next` must pass; control returns to the other player
    const log = push(s.log, 'sys', `${next === 0 ? 'You have' : 'Rival has'} no legal move — pass.`)
    return { ...s, turn: other(next), passed: [false, false], log }
  }
  // neither can move — game over
  return finish(s)
}

function finish(s: DvonnState): DvonnState {
  const you = controlledCount(s, 0), foe = controlledCount(s, 1)
  const winner: Player | null = you === foe ? null : you > foe ? 0 : 1
  const log = push(s.log, winner === 0 ? 'you' : winner === 1 ? 'ai' : 'sys',
    winner == null ? `Game over — tie ${you}–${foe}.`
      : winner === 0 ? `Game over — you win ${you}–${foe}!`
      : `Game over — rival wins ${foe}–${you}.`)
  return { ...s, phase: 'done', winner, log }
}

export function controlledCount(s: DvonnState, player: Player): number {
  let n = 0
  for (const st of s.board) {
    if (st != null && controllerOf(st) === player) n += st.length
  }
  return n
}

// who wins right now (null = tie / not decided)
export function winnerOf(s: DvonnState): Player | null {
  const you = controlledCount(s, 0), foe = controlledCount(s, 1)
  return you === foe ? null : you > foe ? 0 : 1
}

// ----- AI -----

// Heuristic score of a board from the AI's (player 1) perspective.
function evalBoard(s: DvonnState): number {
  const me = controlledCount(s, 1), you = controlledCount(s, 0)
  let mobMe = 0, mobYou = 0, tallMe = 0
  for (let i = 0; i < NCELLS; i++) {
    const st = s.board[i]
    if (st == null) continue
    const ctl = controllerOf(st)
    if (ctl === 1) { tallMe += st.length * st.length }
  }
  mobMe = legalMoves(s, 1).length
  mobYou = legalMoves(s, 0).length
  return (me - you) * 10 + tallMe * 0.4 + mobMe * 0.5 - mobYou * 0.5
}

// AI takes ONE placement (phase 1) or ONE move (phase 2). Always bumps tick.
export function aiTurn(s: DvonnState): DvonnState {
  if (s.winner != null) return s
  if (s.phase === 'place') {
    // Only act when it's actually the AI's placement turn AND a black piece is due,
    // OR a red piece is due on the AI's slot. Caller gates on turn === 1.
    const cells = legalPlacements(s)
    if (!cells.length) return s
    const color = placingColor(s)
    let best = cells[0], bestV = -Infinity
    for (const cell of cells) {
      // prefer cells adjacent to red pieces / central, and (for own pieces) cluster
      let v = 0
      const r = Math.floor(cell / W), c = cell % W
      v -= (Math.abs(r - 3) + Math.abs(c - 3))            // central
      for (const j of neighbors(cell)) {
        const st = s.board[j]
        if (st != null && stackHasRed(st)) v += color === 'r' ? 1 : 3
      }
      v += Math.random() * 0.5
      if (v > bestV) { bestV = v; best = cell }
    }
    return placePiece(s, best)
  }
  if (s.phase === 'move') {
    if (s.turn !== 1) return s
    const moves = legalMoves(s, 1)
    if (!moves.length) return resolveTurn(s, 1)   // shouldn't happen (turn gating), but safe
    let best = moves[0], bestV = -Infinity
    for (const m of moves) {
      const after = applyMove(s, m.from, m.to)
      const v = evalBoard(after) + Math.random() * 0.3
      if (v > bestV) { bestV = v; best = m }
    }
    return applyMove(s, best.from, best.to)
  }
  return s
}

// Apply one human placement or move helper (used by UI). For movement, the UI calls
// applyMove directly. Provided here for symmetry / tests.
export function step(s: DvonnState, cellOrMove: number | Move): DvonnState {
  if (s.phase === 'place' && typeof cellOrMove === 'number') return placePiece(s, cellOrMove)
  if (s.phase === 'move' && typeof cellOrMove !== 'number') return applyMove(s, cellOrMove.from, cellOrMove.to)
  return s
}
