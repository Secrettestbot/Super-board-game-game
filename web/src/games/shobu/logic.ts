/* SHOBU — logic (built for this codebase, not ported).
   Four 4x4 boards in a 2x2 layout. Boards alternate SHADE (light / dark) like a 2x2 checker:
     board 0 (top-left)  = light      board 1 (top-right) = dark
     board 2 (bot-left)  = dark       board 3 (bot-right) = light
   You are player 0 and own the BOTTOM two boards (2 dark, 3 light) = your HOME.
   The AI is player 1 and owns the TOP two boards (0 light, 1 dark).

   Each board starts with 4 of each player's stones on opposite back rows.
   Each turn you make TWO moves with the SAME direction & distance (1 or 2):
     (1) PASSIVE — move one of YOUR stones on one of YOUR HOME boards. It may NOT push and
         may not pass through / land on any stone.
     (2) AGGRESSIVE — same dir+dist, on a board of the OPPOSITE SHADE to the passive board.
         It MAY push at most ONE opponent stone (not two in a row, never your own); a stone
         pushed off the edge is REMOVED.
   You must pick a passive move that HAS a legal aggressive counterpart.
   WIN: be first to clear ALL FOUR of the opponent's stones off ANY ONE board. */

export type Player = 0 | 1
export type Cell = Player | null
export type Board = Cell[]          // length 16, index = r*4 + c
export type Phase = 'passive' | 'aggressive'

export interface Dir { dr: number; dc: number }

// 8 compass directions
export const DIRS: Dir[] = [
  { dr: -1, dc: 0 },  // N
  { dr: -1, dc: 1 },  // NE
  { dr: 0, dc: 1 },   // E
  { dr: 1, dc: 1 },   // SE
  { dr: 1, dc: 0 },   // S
  { dr: 1, dc: -1 },  // SW
  { dr: 0, dc: -1 },  // W
  { dr: -1, dc: -1 }, // NW
]
export const DIR_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export const SIZE = 4
export const N_CELLS = SIZE * SIZE

// Shade of each board (true = light). 2x2 checker.
export const BOARD_LIGHT: boolean[] = [true, false, false, true]
// Home boards for each player. Player 0 (you) = bottom (2,3); player 1 = top (0,1).
export const HOME: Record<Player, number[]> = { 0: [2, 3], 1: [0, 1] }

export interface PassiveMove {
  board: number     // a home board of the mover
  from: number      // cell index
  dir: number       // index into DIRS
  dist: number      // 1 or 2
  to: number        // destination cell index
}

export interface AggressiveMove {
  board: number     // an opposite-shade board
  from: number
  dir: number
  dist: number
  to: number
  pushed: number | null   // cell index of an opponent stone that gets pushed (or null)
  removed: boolean        // whether the pushed stone leaves the board entirely
}

export interface LogEntry { t: string; x: string }

export interface ShobuState {
  boards: Board[]                 // 4 boards
  turn: Player | null
  you: Player
  phase: Phase
  pending: PassiveMove | null     // chosen passive move awaiting its aggressive counterpart
  winner: Player | null
  off: { 0: number; 1: number }   // stones each player has had pushed off (lifetime, for display)
  last: { board: number; cells: number[] } | null  // highlight cells from the last full turn
  log: LogEntry[]
}

const idx = (r: number, c: number) => r * SIZE + c
export const rowOf = (i: number) => Math.floor(i / SIZE)
export const colOf = (i: number) => i % SIZE
const inB = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE
const other = (p: Player): Player => (p === 0 ? 1 : 0)

function pushLog(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(you: Player = 0): ShobuState {
  const mk = (): Board => {
    const b: Board = new Array(N_CELLS).fill(null)
    // Player 1 (top) back row = row 0; player 0 (bottom) back row = row 3.
    for (let c = 0; c < SIZE; c++) {
      b[idx(0, c)] = 1
      b[idx(SIZE - 1, c)] = 0
    }
    return b
  }
  return {
    boards: [mk(), mk(), mk(), mk()],
    turn: 0,
    you,
    phase: 'passive',
    pending: null,
    winner: null,
    off: { 0: 0, 1: 0 },
    last: null,
    log: [{ t: 'sys', x: 'You are blue (bottom two boards are your home). Each turn: a passive move on a home board, then a matching aggressive move on the other-shade board. Clear all four of a rival’s stones off any board to win.' }],
  }
}

// Count a player's stones on a board.
export function countOn(board: Board, p: Player): number {
  let n = 0
  for (const v of board) if (v === p) n++
  return n
}

// Has anyone cleared a board of the opponent's stones?
// A board with ZERO of player P's stones means P's opponent won (but only if the board
// actually held stones of P to begin with — every board starts with 4 each, and stones are
// never added, so an empty-of-P board is always a genuine clear). We return the WINNER.
export function winnerOf(boards: Board[]): Player | null {
  for (const b of boards) {
    const a = countOn(b, 0)
    const c = countOn(b, 1)
    // A genuine clear: one side has 0 stones while the OTHER side still occupies the board.
    // (Requiring the winner to have presence avoids treating a wholly-empty test board as a win.)
    if (a === 0 && c > 0) return 1
    if (c === 0 && a > 0) return 0
  }
  return null
}

// ---------- PASSIVE move generation ----------
// A passive move slides a stone 1 or 2 in a straight line through EMPTY cells only.
export function passiveMovesOnBoard(board: Board, p: Player, boardIdx: number): PassiveMove[] {
  const out: PassiveMove[] = []
  for (let i = 0; i < N_CELLS; i++) {
    if (board[i] !== p) continue
    const r = rowOf(i), c = colOf(i)
    for (let dir = 0; dir < 8; dir++) {
      const d = DIRS[dir]
      for (let dist = 1; dist <= 2; dist++) {
        const r1 = r + d.dr, c1 = c + d.dc          // intermediate (always checked)
        if (!inB(r1, c1) || board[idx(r1, c1)] !== null) break  // blocked path -> longer dist also blocked
        if (dist === 1) {
          out.push({ board: boardIdx, from: i, dir, dist: 1, to: idx(r1, c1) })
          continue
        }
        const r2 = r + d.dr * 2, c2 = c + d.dc * 2
        if (!inB(r2, c2) || board[idx(r2, c2)] !== null) break
        out.push({ board: boardIdx, from: i, dir, dist: 2, to: idx(r2, c2) })
      }
    }
  }
  return out
}

// All passive moves available to player p across BOTH their home boards (raw, unfiltered).
export function rawPassiveMoves(s: ShobuState, p: Player): PassiveMove[] {
  const out: PassiveMove[] = []
  for (const bi of HOME[p]) out.push(...passiveMovesOnBoard(s.boards[bi], p, bi))
  return out
}

// Boards that are a legal AGGRESSIVE target for a passive on `passiveBoard`:
// any board of the OPPOSITE shade.
export function aggressiveBoardsFor(passiveBoard: number): number[] {
  const wantLight = !BOARD_LIGHT[passiveBoard]
  const out: number[] = []
  for (let b = 0; b < 4; b++) if (BOARD_LIGHT[b] === wantLight) out.push(b)
  return out
}

// ---------- AGGRESSIVE move generation ----------
// Aggressive move: stone of player p moves `dist` in `dir`. It may push at most ONE opponent
// stone. Path rule: stepping over your OWN stone is never allowed; you may meet at most one
// opponent stone in the swept cells, and the cell(s) it would be pushed into must be empty
// (or off-board => removed). No two opponent stones in a line.
export function tryAggressive(board: Board, from: number, dir: number, dist: number, p: Player): AggressiveMove | null {
  const d = DIRS[dir]
  const r = rowOf(from), c = colOf(from)
  if (board[from] !== p) return null
  const opp = other(p)

  // Sweep the cells the stone passes through / lands on.
  let pushedFrom: number | null = null
  for (let step = 1; step <= dist; step++) {
    const rr = r + d.dr * step, cc = c + d.dc * step
    if (!inB(rr, cc)) return null            // our own stone can't leave the board
    const cell = board[idx(rr, cc)]
    if (cell === p) return null              // can't move onto / through our own stone
    if (cell === opp) {
      if (pushedFrom !== null) return null   // two opponent stones in the line -> illegal
      pushedFrom = idx(rr, cc)
    }
  }

  const to = idx(r + d.dr * dist, c + d.dc * dist)
  let removed = false
  if (pushedFrom !== null) {
    // The pushed stone is shoved ONE space beyond the landing square (in the same dir).
    // Determine where it ends up: one cell further than `to` along dir.
    const pr = rowOf(pushedFrom), pc = colOf(pushedFrom)
    // It is shoved one space in the same direction from ITS position is not quite right —
    // in Shobu the whole line shifts: the pushed stone ends one cell ahead of the landing.
    // Equivalently: the opponent stone moves to one cell past `to` along dir.
    const dr2 = rowOf(to) + d.dr, dc2 = colOf(to) + d.dc
    if (!inB(dr2, dc2)) {
      removed = true
    } else {
      if (board[idx(dr2, dc2)] !== null) return null  // can't push a stone into an occupied cell
    }
    void pr; void pc
  }

  return { board: -1, from, dir, dist, to, pushed: pushedFrom, removed }
}

// All aggressive moves matching a chosen passive (same dir+dist) on opposite-shade boards.
export function aggressiveMoves(s: ShobuState, passive: PassiveMove, p: Player): AggressiveMove[] {
  const out: AggressiveMove[] = []
  for (const bi of aggressiveBoardsFor(passive.board)) {
    const board = s.boards[bi]
    for (let i = 0; i < N_CELLS; i++) {
      if (board[i] !== p) continue
      const m = tryAggressive(board, i, passive.dir, passive.dist, p)
      if (m) out.push({ ...m, board: bi })
    }
  }
  return out
}

// Passive moves that actually have at least one legal aggressive counterpart.
export function passiveMoves(s: ShobuState, p: Player = s.turn as Player): PassiveMove[] {
  return rawPassiveMoves(s, p).filter(pm => aggressiveMoves(s, pm, p).length > 0)
}

// ---------- Apply ----------
export function applyPassive(s: ShobuState, m: PassiveMove): ShobuState {
  if (s.winner != null || s.turn == null || s.phase !== 'passive') return s
  const p = s.turn
  // validate
  if (!HOME[p].includes(m.board)) return s
  const ok = passiveMovesOnBoard(s.boards[m.board], p, m.board)
    .some(x => x.from === m.from && x.dir === m.dir && x.dist === m.dist)
  if (!ok) return s
  if (aggressiveMoves(s, m, p).length === 0) return s   // must have an aggressive counterpart

  const boards = s.boards.map(b => b.slice())
  boards[m.board][m.from] = null
  boards[m.board][m.to] = p
  return { ...s, boards, phase: 'aggressive', pending: m }
}

export function applyAggressive(s: ShobuState, m: AggressiveMove): ShobuState {
  if (s.winner != null || s.turn == null || s.phase !== 'aggressive' || s.pending == null) return s
  const p = s.turn
  const pm = s.pending
  // must match pending dir+dist and be on a legal opposite-shade board
  if (m.dir !== pm.dir || m.dist !== pm.dist) return s
  if (!aggressiveBoardsFor(pm.board).includes(m.board)) return s
  const recomputed = tryAggressive(s.boards[m.board], m.from, m.dir, m.dist, p)
  if (!recomputed) return s

  const boards = s.boards.map(b => b.slice())
  const d = DIRS[m.dir]
  const opp = other(p)
  const off = { ...s.off }
  const touched: number[] = [m.from, recomputed.to]

  if (recomputed.pushed != null) {
    boards[m.board][recomputed.pushed] = null
    if (recomputed.removed) {
      off[opp] = off[opp] + 1
    } else {
      const dest = idx(rowOf(recomputed.to) + d.dr, colOf(recomputed.to) + d.dc)
      boards[m.board][dest] = opp
      touched.push(dest)
    }
  }
  boards[m.board][m.from] = null
  boards[m.board][recomputed.to] = p

  const winner = winnerOf(boards)
  const name = p === s.you ? 'You' : 'Rival'
  let log = pushLog(s.log, p === s.you ? 'you' : 'ai',
    `${name} played ${DIR_NAMES[m.dir]}×${m.dist}${recomputed.pushed != null ? (recomputed.removed ? ' — pushed a stone off the board!' : ' — shoved a stone.') : '.'}`)

  if (winner != null) {
    const youWon = winner === s.you
    log = pushLog(log, youWon ? 'you' : 'ai', youWon ? 'You cleared a board — you win!' : 'The rival cleared a board. Rival wins.')
    return { ...s, boards, turn: null, phase: 'passive', pending: null, off, winner, last: { board: m.board, cells: touched }, log }
  }
  return { ...s, boards, turn: other(p), phase: 'passive', pending: null, off, last: { board: m.board, cells: touched }, log }
}

// ---------- Combined moves (for AI / analysis) ----------
export interface CombinedMove { passive: PassiveMove; aggressive: AggressiveMove }

export function legalCombinedMoves(s: ShobuState, p: Player = s.turn as Player): CombinedMove[] {
  const out: CombinedMove[] = []
  for (const pm of rawPassiveMoves(s, p)) {
    for (const am of aggressiveMoves(s, pm, p)) out.push({ passive: pm, aggressive: am })
  }
  return out
}

// ---------- AI ----------
// Heuristic: prefer moves that push opponent stones off a board (especially toward clearing a
// board), avoid leaving our own stones easy to shove off, keep our stones away from edges.
function applyCombinedRaw(s: ShobuState, cm: CombinedMove, p: Player): ShobuState {
  const afterP = applyPassive({ ...s, turn: p, phase: 'passive', pending: null }, cm.passive)
  if (afterP.phase !== 'aggressive') return s
  return applyAggressive(afterP, cm.aggressive)
}

// edge proximity penalty (how close to falling off) for a stone — higher = more exposed
function edgeRisk(i: number): number {
  const r = rowOf(i), c = colOf(i)
  const dr = Math.min(r, SIZE - 1 - r)
  const dc = Math.min(c, SIZE - 1 - c)
  return (1 - dr / 1.5) + (1 - dc / 1.5)   // corners/edges score higher
}

export function evalState(s: ShobuState, me: Player): number {
  const opp = other(me)
  let score = 0
  // closeness to clearing a board: the fewer opponent stones remain on a board, the better.
  for (const b of s.boards) {
    const mine = countOn(b, me)
    const theirs = countOn(b, opp)
    // reward emptying opponent off a board; punish being emptied off one
    score += (4 - theirs) * (4 - theirs) * 6      // accelerating reward as we clear them
    score -= (4 - mine) * (4 - mine) * 6
    if (theirs === 0) score += 100000
    if (mine === 0) score -= 100000
    // material on the board
    score += (mine - theirs) * 10
    // exposure: our stones near edges are at risk; opponent's near edges are good for us
    for (let i = 0; i < N_CELLS; i++) {
      if (b[i] === me) score -= edgeRisk(i) * 2
      else if (b[i] === opp) score += edgeRisk(i) * 2
    }
  }
  // lifetime captures
  score += (s.off[opp] - s.off[me]) * 40
  return score
}

export function aiTurn(s: ShobuState): ShobuState {
  if (s.winner != null || s.turn == null) return s
  const me = s.turn
  const moves = legalCombinedMoves(s, me)
  if (!moves.length) {
    // No legal full turn — pass to opponent (rare). Treat as forfeit of the turn.
    return { ...s, turn: other(me), phase: 'passive', pending: null }
  }
  let best = -Infinity
  let bestMoves: CombinedMove[] = []
  for (const cm of moves) {
    const next = applyCombinedRaw(s, cm, me)
    let v = evalState(next, me)
    // bonus for actually pushing a stone off
    if (cm.aggressive.removed) v += 30
    if (v > best) { best = v; bestMoves = [cm] }
    else if (v === best) bestMoves.push(cm)
  }
  const choice = bestMoves[(Math.random() * bestMoves.length) | 0]
  const afterP = applyPassive(s, choice.passive)
  return applyAggressive(afterP, choice.aggressive)
}
