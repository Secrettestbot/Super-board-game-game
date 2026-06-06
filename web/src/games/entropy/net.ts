/* ENTROPY (Hyle) — netplay adapter. Maps entropy's pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it.
 *
 * Entropy is an asymmetric 2-role game. We map each role to a seat:
 *   seat 0 = CHAOS — places the drawn tile on an empty cell (phase 'chaos').
 *   seat 1 = ORDER — slides one tile rook-style, or passes (phase 'order').
 *
 * The randomly drawn tile (s.drawn) is part of the authoritative state, so a
 * CHAOS intent only carries the destination cell. ORDER intents carry a rook
 * slide {from,to}, or { kind:'pass' } when the player chooses not to move.
 *
 * logic.ts exports CHAOS's full transition (place) and ORDER's AI (aiStep), but
 * the post-ORDER bookkeeping (draw next tile / detect a full board / decide the
 * winner) lives in private helpers. So when a *human* drives ORDER we apply the
 * exported rook primitive and then reproduce that bookkeeping here using the
 * exported building blocks (scoreBoard, emptyCells, freshBag, PAR). When ORDER is
 * an AI seat, the session calls aiStep directly and this code is bypassed.
 *
 * Perfect information overall, so no redactFor is needed.
 */

import * as EN from './logic'
import type { EntropyState, Color, Cell, LogEntry } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** CHAOS places the drawn tile on `cell`. ORDER slides {from→to} or passes. */
export type EntropyIntent =
  | { kind: 'place'; cell: number }
  | { kind: 'move'; from: number; to: number }
  | { kind: 'pass' }

const phaseToSeat = (s: EntropyState): number | null =>
  s.phase === 'chaos' ? 0 : s.phase === 'order' ? 1 : null

const pushLog = (log: LogEntry[], t: string, x: string): LogEntry[] =>
  log.concat([{ t, x }]).slice(-24)

/** Draw a uniformly random tile from the bag (mirrors logic.ts's private drawFrom). */
function drawFrom(bag: Color[]): { tile: Color | null; rest: Color[] } {
  if (!bag.length) return { tile: null, rest: bag }
  const k = (Math.random() * bag.length) | 0
  const rest = bag.slice()
  const tile = rest.splice(k, 1)[0]
  return { tile, rest }
}

/** Reproduce logic.ts's private afterOrder: finish on a full board, else draw next tile. */
function afterOrder(s: EntropyState, board: Cell[], score: number, log: LogEntry[], last: number | null): EntropyState {
  if (s.placed >= EN.N * EN.N || EN.emptyCells(board).length === 0) {
    const winner: 'chaos' | 'order' = score <= EN.PAR ? 'chaos' : 'order'
    const msg = winner === 'chaos'
      ? `Board full. Order scored ${score} ≤ par ${EN.PAR} — Chaos wins.`
      : `Board full. Order scored ${score} > par ${EN.PAR} — Order wins.`
    return Object.assign({}, s, { board, score, phase: 'over' as const, drawn: null, winner, log: pushLog(log, winner === 'chaos' ? 'you' : 'ai', msg) })
  }
  const { tile, rest } = drawFrom(s.bag)
  return Object.assign({}, s, { board, score, bag: rest, drawn: tile, phase: 'chaos' as const, last, log })
}

export const entropyAdapter: GameAdapter<EntropyState, EntropyIntent> = {
  makeGame: () => EN.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner ? null : phaseToSeat(s)),
  isOver: s => s.winner != null || s.phase === 'over',
  applyIntent: (s, seat, i) => {
    if (s.winner || phaseToSeat(s) !== seat) return s
    if (seat === 0) {
      // CHAOS: place the drawn tile on an empty cell. place() self-validates.
      if (i.kind !== 'place') return s
      const next = EN.place(s, i.cell)
      return next === s ? s : next
    }
    // ORDER: slide a tile rook-style, or pass.
    if (i.kind === 'pass') {
      const cur = EN.scoreBoard(s.board)
      const log = pushLog(s.log, 'ai', `Order passed (score holds at ${cur}).`)
      return afterOrder(s, s.board, cur, log, s.last)
    }
    if (i.kind !== 'move') return s
    // Validate the slide against the legal rook destinations.
    if (!s.board[i.from] || !EN.rookDests(s.board, i.from).includes(i.to)) return s
    const board = EN.applyRook(s.board, i.from, i.to)
    const score = EN.scoreBoard(board)
    const fr = Math.floor(i.from / EN.N), fc = i.from % EN.N
    const tr = Math.floor(i.to / EN.N), tc = i.to % EN.N
    const log = pushLog(s.log, 'ai', `Order slid ${'ABCDE'[fc]}${fr + 1}→${'ABCDE'[tc]}${tr + 1} (score ${score}).`)
    return afterOrder(s, board, score, log, i.to)
  },
  aiStep: s => EN.aiStep(s),
  tickKey: s => `${s.placed}-${s.phase}-${s.score}-${s.winner ?? ''}`,
}
