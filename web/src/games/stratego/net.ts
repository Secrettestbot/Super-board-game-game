/* STRATEGO — netplay adapter. Maps stratego's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. 2 seats: the board encodes ownership directly as the
 * Player value, so seat 0 == player 0 (bottom army) and seat 1 == player 1 (top army).
 *
 * HIDDEN INFO: a piece's RANK is private to its owner until combat reveals it. Each seat
 * sees its OWN pieces in full and the opponent's pieces' POSITION + COLOR only — the
 * opponent's un-revealed ranks are masked to a sentinel (-1) so they never cross the wire.
 * Ranks that became public (a piece `revealed` in combat, the per-piece `captured` list,
 * and the last-combat `reveal` summary) stay visible to both sides. The AI's `belief`
 * distribution (host-only reasoning about seat 0's hidden ranks) is dropped from every
 * redacted view so it cannot leak rank information either. The leak test in
 * stratego.net.test.ts guards this.
 *
 * SETUP phase: before play, each player privately deploys their 16-piece army onto their
 * own back two rows. The net layer is turn-based, so the adapter carries adapter-private
 * bookkeeping on the state: `_phase` ('setup' | 'play') and `_placed` (which seats have
 * confirmed a layout). seatToMove walks the seats that still owe a setup (seat 0 first,
 * then 1); once both are in we drop the bookkeeping and play begins with seat 0. The real
 * logic.ts `makeGame` random-places both armies, which we keep as the AI / default layout —
 * a human `setup` intent overwrites only that seat's own two rows.
 */

import * as ST from './logic'
import type { StrategoState, Player, Piece, Cell, Belief } from './logic'
import type { GameAdapter } from '../../net/protocol'

const N = ST.N
const idx = (r: number, c: number) => r * N + c

/** Sentinel rank for an opponent piece whose true rank `seat` is not allowed to see. */
export const RANK_HIDDEN = -1

/** A single placed piece in a setup layout: which cell and what rank sits there. */
export interface PlacedPiece { cell: number; rank: number }
/** Intents: privately deploy your army during setup, or move/strike during play. */
export type StrategoIntent =
  | { kind: 'setup'; layout: PlacedPiece[] }
  | { kind: 'move'; from: number; to: number }

type Phase = 'setup' | 'play'
export interface StrategoNetState extends StrategoState {
  _phase?: Phase
  _placed?: [boolean, boolean]
}

// The two back rows each seat deploys onto (matches logic's placeArmy: seat 1 top rows 0&1,
// seat 0 bottom rows 6&7).
const SEAT_ROWS: Record<number, [number, number]> = { 0: [6, 7], 1: [0, 1] }

function phaseOf(s: StrategoNetState): Phase {
  return s._phase ?? 'play'
}
function placedOf(s: StrategoNetState): [boolean, boolean] {
  return s._placed ?? [true, true]
}

/** Lowest seat (0,1) that still owes a setup, or null if both are in. */
function nextPlacer(s: StrategoNetState): number | null {
  const p = placedOf(s)
  for (let seat = 0; seat < 2; seat++) if (!p[seat]) return seat
  return null
}

/** The 16 cells a seat is allowed to deploy onto (its two back rows). */
function homeCells(seat: number): number[] {
  const rows = SEAT_ROWS[seat]
  const out: number[] = []
  for (const r of rows) for (let c = 0; c < N; c++) out.push(idx(r, c))
  return out
}

// A fresh game with both seats still to deploy; armies default to logic's random layout.
function freshSetup(): StrategoNetState {
  const base = ST.makeGame() as StrategoNetState
  return Object.assign({}, base, { _phase: 'setup' as Phase, _placed: [false, false] as [boolean, boolean] })
}

/** The exact multiset of rank values a legal army must contain (logic's ARMY). */
function armyMultiset(): Map<number, number> {
  const m = new Map<number, number>()
  for (const r of ST.ARMY) m.set(r, (m.get(r) ?? 0) + 1)
  return m
}

/**
 * Validate a setup layout for `seat`: exactly the ARMY composition, every cell on the
 * seat's own home rows, no duplicate cells. Returns the placed Piece list (with fresh ids
 * for seat 0 so the AI belief map keys stay valid) or null if illegal.
 */
function legalLayout(seat: number, layout: PlacedPiece[]): Map<number, number> | null {
  if (!Array.isArray(layout) || layout.length !== ST.ARMY.length) return null
  const home = new Set(homeCells(seat))
  const want = armyMultiset()
  const got = new Map<number, number>()
  const usedCells = new Set<number>()
  const placement = new Map<number, number>() // cell -> rank
  for (const p of layout) {
    if (!p || typeof p.cell !== 'number' || typeof p.rank !== 'number') return null
    if (!home.has(p.cell)) return null
    if (usedCells.has(p.cell)) return null
    usedCells.add(p.cell)
    got.set(p.rank, (got.get(p.rank) ?? 0) + 1)
    placement.set(p.cell, p.rank)
  }
  if (got.size !== want.size) return null
  for (const [rank, n] of want) if (got.get(rank) !== n) return null
  return placement
}

/** Replace `seat`'s home rows with a validated layout and mark it deployed. */
function recordSetup(s: StrategoNetState, seat: number, placement: Map<number, number>): StrategoNetState {
  const board = s.board.slice()
  // strip any existing pieces of this seat from the whole board (default random army)
  for (let i = 0; i < board.length; i++) {
    const c = board[i]
    if (ST.isPiece(c) && c.owner === seat) board[i] = null
  }
  // seat-0 ids must be > seat-1 ids only by construction here; just assign fresh unique ids
  // by scanning the max existing id so belief keys (seat 0) stay distinct.
  let nextId = 1
  for (const c of board) if (ST.isPiece(c)) nextId = Math.max(nextId, c.id + 1)
  for (const [cell, rank] of placement) {
    board[cell] = { rank, owner: seat as Player, revealed: false, moved: false, id: nextId++ }
  }

  const placed = placedOf(s).slice() as [boolean, boolean]
  placed[seat] = true

  // Rebuild the AI belief over every seat-0 piece (its ids may have changed).
  const belief: Record<number, Belief> = {}
  const weights: Record<number, number> = {}
  for (const r of ST.ARMY) weights[r] = (weights[r] ?? 0) + 1
  for (const c of board) if (ST.isPiece(c) && c.owner === 0) belief[c.id] = { weights: { ...weights } }

  const next = Object.assign({}, s, { board, belief, _placed: placed }) as StrategoNetState
  if (nextPlacer(next) == null) {
    const out = Object.assign({}, next, { turn: 0 as Player }) as StrategoNetState
    delete out._placed
    delete out._phase
    return out
  }
  return next
}

/** Confirm a seat's currently-on-board (default random) army as its deployment. */
function confirmExisting(s: StrategoNetState, seat: number): StrategoNetState {
  const placement = new Map<number, number>()
  for (let i = 0; i < s.board.length; i++) {
    const c = s.board[i]
    if (ST.isPiece(c) && c.owner === seat) placement.set(i, c.rank)
  }
  return recordSetup(s, seat, placement)
}

// ---- adapter ------------------------------------------------------------------------
export const strategoAdapter: GameAdapter<StrategoNetState, StrategoIntent> = {
  makeGame: () => freshSetup(),
  numSeats: () => 2,

  seatToMove: s => {
    if (s.winner != null) return null
    if (phaseOf(s) === 'setup') return nextPlacer(s)
    return s.turn
  },

  isOver: s => s.winner != null,

  applyIntent: (s, seat, intent) => {
    if (s.winner != null) return s
    if (phaseOf(s) === 'setup') {
      if (intent.kind !== 'setup') return s
      if (nextPlacer(s) !== seat) return s // not this seat's turn to deploy / already in
      const placement = legalLayout(seat, intent.layout)
      if (!placement) return s
      return recordSetup(s, seat, placement)
    }
    // play
    if (intent.kind !== 'move') return s
    if (s.turn !== seat) return s
    // ST.move validates legality itself and returns s unchanged for an illegal move.
    return ST.move(s, seat as Player, intent.from, intent.to) as StrategoNetState
  },

  aiStep: (s, seat) => {
    if (phaseOf(s) === 'setup') {
      if (nextPlacer(s) !== seat) return s
      // logic's makeGame already random-placed this seat's army; confirm it as-is.
      return confirmExisting(s, seat)
    }
    if (s.turn !== 1) return s
    // The existing AI reasons only from revealed ranks + its belief model (never the
    // opponent's hidden ranks), exactly as required.
    return ST.aiMove(s) as StrategoNetState
  },

  // Changes on EVERY transition: a setup flips a _placed entry / the phase; a move bumps
  // the captured count and flips the turn (or sets a winner). `last` pins the moved cells.
  tickKey: s => {
    const ph = phaseOf(s)
    const placed = placedOf(s).filter(Boolean).length
    const last = s.last ? `${s.last.from}-${s.last.to}` : 'x'
    return `${ph}-${placed}-${s.captured.length}-${last}-${s.turn ?? 'x'}-${s.winner ?? ''}`
  },

  // Hidden info: mask the rank of every OPPONENT piece that is not yet revealed, and drop
  // the host's AI belief map. Position + color (owner) stay visible; revealed pieces keep
  // their rank; the public `captured` list and `reveal` summary are untouched.
  redactFor: (s, seat) => {
    const board: Cell[] = s.board.map(c => {
      if (!ST.isPiece(c)) return c
      if (c.owner === seat || c.revealed) return c
      const masked: Piece = { ...c, rank: RANK_HIDDEN }
      return masked
    })
    return Object.assign({}, s, { board, belief: {} as Record<number, Belief> }) as StrategoNetState
  },
}
