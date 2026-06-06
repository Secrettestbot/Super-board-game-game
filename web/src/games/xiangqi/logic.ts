/* XIANGQI (Chinese Chess) — logic.
   Ported from design/examples/strategy_xiangqi/xiangqi_logic.jsx; the IIFE +
   window.XiangqiLogic global became ESM exports and a XiangqiState type. The pure
   move-generation / search functions are unchanged.

   9 files x 10 ranks of intersections. Red (you) at the bottom, Black (rival) at the
   top; Red moves first. Full rules: chariot, horse (hobbled leg), elephant (river-bound,
   eye block), cannon (jump to capture), advisor & general (palace-bound), soldier
   (sideways past the river), plus the flying-general rule. Checkmate or stalemate the
   general to win. Alpha-beta AI. */

export type Side = 'r' | 'b'
export interface Piece { s: Side; t: string }
export type Board = (Piece | null)[]
export interface Move { from: number; to: number }
export interface LogEntry { t: string; x: string }

export interface XiangqiState {
  board: Board
  turn: Side | null
  you: Side
  winner: Side | null
  last: Move | null
  check: boolean
  moveNo: number
  log: LogEntry[]
}

export const W = 9, H = 10
export const id = (r: number, c: number) => r * W + c
export const rc = (i: number): [number, number] => [Math.floor(i / W), i % W]
const inB = (r: number, c: number) => r >= 0 && r < H && c >= 0 && c < W
export const inPalace = (s: Side, r: number, c: number) => c >= 3 && c <= 5 && (s === "b" ? r <= 2 : r >= 7)

export function makeInitial(): XiangqiState {
  const b: Board = new Array(W * H).fill(null)
  const back = ["R", "H", "E", "A", "K", "A", "E", "H", "R"]
  for (let c = 0; c < W; c++) { b[id(0, c)] = { s: "b", t: back[c] }; b[id(9, c)] = { s: "r", t: back[c] } }
  b[id(2, 1)] = { s: "b", t: "C" }; b[id(2, 7)] = { s: "b", t: "C" }
  b[id(7, 1)] = { s: "r", t: "C" }; b[id(7, 7)] = { s: "r", t: "C" }
  for (const c of [0, 2, 4, 6, 8]) { b[id(3, c)] = { s: "b", t: "S" }; b[id(6, c)] = { s: "r", t: "S" } }
  return { board: b, turn: "r", you: "r", winner: null, last: null, check: false, moveNo: 0, log: [{ t: "sys", x: "Red moves first. Mate the general — mind the cannon and the flying general." }] }
}

const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]]

// pseudo-legal destinations for piece at (r,c)
export function pieceMoves(board: Board, r: number, c: number): number[] {
  const p = board[id(r, c)]; if (!p) return []
  const s = p.s, out: number[] = []
  const add = (nr: number, nc: number) => { if (!inB(nr, nc)) return; const t = board[id(nr, nc)]; if (!t || t.s !== s) out.push(id(nr, nc)) }
  switch (p.t) {
    case "K": for (const [dr, dc] of ORTHO) { const nr = r + dr, nc = c + dc; if (inB(nr, nc) && inPalace(s, nr, nc)) add(nr, nc) } break
    case "A": for (const [dr, dc] of DIAG) { const nr = r + dr, nc = c + dc; if (inB(nr, nc) && inPalace(s, nr, nc)) add(nr, nc) } break
    case "E": for (const [dr, dc] of DIAG) { const nr = r + 2 * dr, nc = c + 2 * dc, mr = r + dr, mc = c + dc; if (!inB(nr, nc)) continue; if (board[id(mr, mc)]) continue; if (s === "b" ? nr > 4 : nr < 5) continue; add(nr, nc) } break
    case "H": {
      const legs = [[-1, 0, [[-2, -1], [-2, 1]]], [1, 0, [[2, -1], [2, 1]]], [0, -1, [[-1, -2], [1, -2]]], [0, 1, [[-1, 2], [1, 2]]]] as const
      for (const [lr, lc, jumps] of legs) { if (board[id(r + lr, c + lc) >= 0 ? id(r + lr, c + lc) : 0] && inB(r + lr, c + lc) && board[id(r + lr, c + lc)]) continue; if (inB(r + lr, c + lc) && board[id(r + lr, c + lc)]) continue; for (const [jr, jc] of jumps) add(r + jr, c + jc) }
      break
    }
    case "R": for (const [dr, dc] of ORTHO) { let nr = r + dr, nc = c + dc; while (inB(nr, nc)) { const t = board[id(nr, nc)]; if (!t) out.push(id(nr, nc)); else { if (t.s !== s) out.push(id(nr, nc)); break } nr += dr; nc += dc } } break
    case "C": for (const [dr, dc] of ORTHO) { let nr = r + dr, nc = c + dc, jumped = false; while (inB(nr, nc)) { const t = board[id(nr, nc)]; if (!jumped) { if (!t) out.push(id(nr, nc)); else jumped = true } else { if (t) { if (t.s !== s) out.push(id(nr, nc)); break } } nr += dr; nc += dc } } break
    case "S": { const fwd = s === "r" ? -1 : 1; add(r + fwd, c); const crossed = s === "r" ? r <= 4 : r >= 5; if (crossed) { add(r, c - 1); add(r, c + 1) } break }
  }
  return out
}

function kingPos(board: Board, s: Side) { for (let i = 0; i < W * H; i++) { const p = board[i]; if (p && p.s === s && p.t === "K") return i } return -1 }
function generalsFacing(board: Board) {
  const rk = kingPos(board, "r"), bk = kingPos(board, "b"); if (rk < 0 || bk < 0) return false
  const [rr, rc2] = rc(rk), [br, bc] = rc(bk); if (rc2 !== bc) return false
  for (let r = Math.min(rr, br) + 1; r < Math.max(rr, br); r++) if (board[id(r, rc2)]) return false
  return true
}
function attacked(board: Board, target: number, bySide: Side) {
  for (let i = 0; i < W * H; i++) { const p = board[i]; if (p && p.s === bySide) { const [r, c] = rc(i); if (pieceMoves(board, r, c).includes(target)) return true } }
  return false
}
export function inCheck(board: Board, s: Side) { const k = kingPos(board, s); if (k < 0) return true; return attacked(board, k, s === "r" ? "b" : "r") || generalsFacing(board) }

function doMove(board: Board, from: number, to: number): Board { const nb = board.slice(); nb[to] = nb[from]; nb[from] = null; return nb }
export function legalMoves(board: Board, s: Side): Move[] {
  const out: Move[] = []
  for (let i = 0; i < W * H; i++) { const p = board[i]; if (p && p.s === s) { const [r, c] = rc(i); for (const to of pieceMoves(board, r, c)) { const nb = doMove(board, i, to); if (!inCheck(nb, s)) out.push({ from: i, to }) } } }
  return out
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-30) }
export function applyMove(s: XiangqiState, from: number, to: number): XiangqiState {
  if (s.winner || s.turn == null) return s
  const p = s.board[from]
  if (!p || p.s !== s.turn) return s
  if (!legalMoves(s.board, s.turn).some(m => m.from === from && m.to === to)) return s
  const cap = s.board[to]
  const board = doMove(s.board, from, to)
  const next: Side = s.turn === "r" ? "b" : "r"
  const moverName = s.turn === s.you ? "You" : "Rival"
  let log = push(s.log, s.turn === s.you ? "you" : "ai", `${moverName} ${cap ? "captured" : "moved"}.`)
  let ns: XiangqiState = Object.assign({}, s, { board, turn: next, last: { from, to }, moveNo: s.moveNo + 1, log, check: false })
  // win check on next player
  const nextMoves = legalMoves(board, next)
  const chk = inCheck(board, next)
  ns.check = chk
  if (nextMoves.length === 0) {
    ns.winner = s.turn; ns.turn = null
    ns.log = push(ns.log, s.turn === s.you ? "you" : "ai", chk ? `Checkmate — ${s.turn === s.you ? "you win" : "rival wins"}.` : `Stalemate — ${s.turn === s.you ? "you win" : "rival wins"}.`)
  } else if (chk) ns.log = push(ns.log, next === s.you ? "you" : "ai", "Check!")
  return ns
}

// ===== AI =====
const VAL: Record<string, number> = { K: 10000, R: 600, C: 300, H: 280, A: 120, E: 120, S: 70 }
function evalBoard(board: Board, me: Side) {
  let sc = 0
  for (let i = 0; i < W * H; i++) { const p = board[i]; if (!p) continue; let v = VAL[p.t]; if (p.t === "S") { const [r] = rc(i); const crossed = p.s === "r" ? r <= 4 : r >= 5; if (crossed) v += 50 } sc += p.s === me ? v : -v }
  return sc
}
function search(board: Board, side: Side, me: Side, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(board, side)
  if (moves.length === 0) return inCheck(board, side) ? (side === me ? -99999 + (4 - depth) : 99999 - (4 - depth)) : 0
  if (depth === 0) return evalBoard(board, me)
  // order: captures first
  moves.sort((a, b) => (board[b.to] ? VAL[board[b.to]!.t] : 0) - (board[a.to] ? VAL[board[a.to]!.t] : 0))
  const opp: Side = side === "r" ? "b" : "r"
  if (side === me) { let best = -1e9; for (const m of moves) { const v = search(doMove(board, m.from, m.to), opp, me, depth - 1, alpha, beta); if (v > best) best = v; if (best > alpha) alpha = best; if (alpha >= beta) break } return best }
  else { let best = 1e9; for (const m of moves) { const v = search(doMove(board, m.from, m.to), opp, me, depth - 1, alpha, beta); if (v < best) best = v; if (best < beta) beta = best; if (alpha >= beta) break } return best }
}
export function aiMove(s: XiangqiState): XiangqiState {
  if (s.winner || s.turn !== "b") return s
  const me: Side = "b", moves = legalMoves(s.board, me)
  if (!moves.length) return s
  moves.sort((a, b) => (s.board[b.to] ? VAL[s.board[b.to]!.t] : 0) - (s.board[a.to] ? VAL[s.board[a.to]!.t] : 0))
  let best = moves[0], bv = -1e9
  for (const m of moves) { const v = search(doMove(s.board, m.from, m.to), "r", me, 2, -1e9, 1e9) + Math.random(); if (v > bv) { bv = v; best = m } }
  return applyMove(s, best.from, best.to)
}
