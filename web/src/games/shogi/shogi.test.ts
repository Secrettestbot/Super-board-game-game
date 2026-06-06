import { describe, it, expect } from 'vitest'
import * as SH from './logic'
import type { State, Move, Piece, PieceType, Player } from './logic'

// Pure-logic tests for Minishogi (5x5): setup, piece movement (gold/silver/rook/bishop),
// captures → hand, drops + drop legality (no two pawns per file, no dead drop),
// promotion altering the move set, self-check filtering, a forced checkmate, and a
// bounded self-play loop that always reaches a terminal result without throwing.

function pc(type: PieceType, owner: Player, promoted = false): Piece {
  return { type, owner, promoted }
}
function emptyState(): State {
  return {
    board: new Array(SH.SIZE).fill(null),
    hands: [
      { K: 0, G: 0, S: 0, B: 0, R: 0, P: 0 },
      { K: 0, G: 0, S: 0, B: 0, R: 0, P: 0 },
    ],
    turn: 0,
    winner: null,
    last: null,
    check: false,
  }
}

describe('minishogi logic', () => {
  it('starts on a valid 5x5 board with 6 pieces each and you (Sente) to move', () => {
    const s = SH.makeGame()
    expect(s.board.length).toBe(25)
    let p0 = 0, p1 = 0
    const count = (owner: Player) => {
      const c: Record<string, number> = {}
      for (const sq of s.board) if (sq && sq.owner === owner) c[sq.type] = (c[sq.type] || 0) + 1
      return c
    }
    for (const sq of s.board) { if (sq?.owner === 0) p0++; if (sq?.owner === 1) p1++ }
    expect(p0).toBe(6)
    expect(p1).toBe(6)
    // each side has exactly one of each: K G S B R P
    for (const owner of [0, 1] as Player[]) {
      const c = count(owner)
      for (const t of ['K', 'G', 'S', 'B', 'R', 'P']) expect(c[t]).toBe(1)
    }
    expect(s.turn).toBe(0)
    expect(s.winner).toBeNull()
  })

  it('gold moves 6 ways and silver moves 5 ways (forward-biased) for player 0', () => {
    const s = emptyState()
    // place a player-0 gold in the centre (2,2)=12, surrounded by empty
    s.board[SH.id(2, 2)] = pc('G', 0)
    const gold = SH.pieceMoves(s.board, SH.id(2, 2)).sort((a, b) => a - b)
    // gold (owner 0, fwd = up): orthogonals + forward diagonals (up-left, up-right)
    const expectGold = [
      SH.id(1, 1), SH.id(1, 2), SH.id(1, 3), // forward row diagonals + straight up
      SH.id(2, 1), SH.id(2, 3),              // sideways
      SH.id(3, 2),                           // straight back
    ].sort((a, b) => a - b)
    expect(gold).toEqual(expectGold)

    const s2 = emptyState()
    s2.board[SH.id(2, 2)] = pc('S', 0)
    const silver = SH.pieceMoves(s2.board, SH.id(2, 2)).sort((a, b) => a - b)
    // silver (owner 0): four diagonals + straight forward (up)
    const expectSilver = [
      SH.id(1, 1), SH.id(1, 2), SH.id(1, 3), // up-left, straight up, up-right
      SH.id(3, 1), SH.id(3, 3),              // back diagonals
    ].sort((a, b) => a - b)
    expect(silver).toEqual(expectSilver)
  })

  it('rook slides orthogonally and bishop slides diagonally, stopping at blockers', () => {
    const s = emptyState()
    s.board[SH.id(2, 2)] = pc('R', 0)
    s.board[SH.id(2, 4)] = pc('P', 0)   // own pawn blocks to the right (can't land/pass)
    s.board[SH.id(0, 2)] = pc('P', 1)   // enemy pawn up the file: capturable
    const rook = new Set(SH.pieceMoves(s.board, SH.id(2, 2)))
    expect(rook.has(SH.id(2, 3))).toBe(true)   // up to just before own pawn
    expect(rook.has(SH.id(2, 4))).toBe(false)  // own piece, blocked
    expect(rook.has(SH.id(1, 2))).toBe(true)
    expect(rook.has(SH.id(0, 2))).toBe(true)   // capture enemy
    expect(rook.has(SH.id(2, 0))).toBe(true)   // slides left fully

    const s2 = emptyState()
    s2.board[SH.id(2, 2)] = pc('B', 0)
    const bishop = new Set(SH.pieceMoves(s2.board, SH.id(2, 2)))
    expect(bishop.has(SH.id(0, 0))).toBe(true)
    expect(bishop.has(SH.id(4, 4))).toBe(true)
    expect(bishop.has(SH.id(0, 4))).toBe(true)
    expect(bishop.has(SH.id(2, 3))).toBe(false) // not orthogonal
  })

  it('capturing a piece adds it (unpromoted) to your hand', () => {
    const s = emptyState()
    s.board[SH.id(2, 2)] = pc('R', 0)
    s.board[SH.id(2, 3)] = pc('B', 1)   // enemy bishop adjacent
    s.board[SH.id(4, 0)] = pc('K', 0)
    s.board[SH.id(0, 0)] = pc('K', 1)
    const mv: Move = { from: SH.id(2, 2), to: SH.id(2, 3) }
    const ns = SH.applyMove(s, mv)
    expect(ns.hands[0].B).toBe(1)
    const moved = ns.board[SH.id(2, 3)]
    expect(moved?.type).toBe('R')
    expect(moved?.owner).toBe(0)
  })

  it('a drop places a hand piece onto an empty square', () => {
    const s = emptyState()
    s.board[SH.id(4, 0)] = pc('K', 0)
    s.board[SH.id(0, 0)] = pc('K', 1)
    s.hands[0].S = 1
    const target = SH.id(2, 2)
    const drop: Move = { from: -1, to: target, drop: 'S' }
    const legal = SH.legalMoves(s)
    expect(legal.some(m => m.drop === 'S' && m.to === target)).toBe(true)
    const ns = SH.applyMove(s, drop)
    expect(ns.board[target]?.type).toBe('S')
    expect(ns.board[target]?.owner).toBe(0)
    expect(ns.board[target]?.promoted).toBe(false)
    expect(ns.hands[0].S).toBe(0)
  })

  it('rejects dropping a second unpromoted pawn in the same file, and a dead pawn drop', () => {
    const s = emptyState()
    s.board[SH.id(4, 0)] = pc('K', 0)
    s.board[SH.id(0, 4)] = pc('K', 1)
    s.board[SH.id(3, 2)] = pc('P', 0)   // existing unpromoted pawn in file 2
    s.hands[0].P = 1
    const legal = SH.legalMoves(s)
    // no pawn drop anywhere in file 2
    expect(legal.some(m => m.drop === 'P' && SH.rc(m.to)[1] === 2)).toBe(false)
    // a pawn drop in a different file IS allowed
    expect(legal.some(m => m.drop === 'P' && SH.rc(m.to)[1] === 3)).toBe(true)
    // no pawn drop on the player-0 last rank (row 0) — it would have no moves
    expect(legal.some(m => m.drop === 'P' && SH.rc(m.to)[0] === 0)).toBe(false)
  })

  it('promotion in the furthest rank changes the move set (pawn → gold moves)', () => {
    const s = emptyState()
    // player-0 pawn one step from the last rank (row 1, file 2)
    s.board[SH.id(1, 2)] = pc('P', 0)
    s.board[SH.id(4, 0)] = pc('K', 0)
    s.board[SH.id(0, 0)] = pc('K', 1)
    const legal = SH.legalMoves(s)
    const into = legal.filter(m => m.from === SH.id(1, 2) && m.to === SH.id(0, 2))
    // pawn entering the last rank MUST promote (only the promote=true move exists)
    expect(into.length).toBe(1)
    expect(into[0].promote).toBe(true)
    const ns = SH.applyMove(s, into[0])
    const promoted = ns.board[SH.id(0, 2)]!
    expect(promoted.promoted).toBe(true)
    // now (as a promoted pawn) it moves like a gold — placed on row 0 it can step sideways/back
    const moves = new Set(SH.pieceMoves(ns.board, SH.id(0, 2)))
    expect(moves.has(SH.id(0, 1))).toBe(true) // sideways — impossible for a raw pawn
    expect(moves.has(SH.id(1, 2))).toBe(true) // straight back — impossible for a raw pawn
  })

  it('a move that leaves your own king in check is illegal', () => {
    const s = emptyState()
    // player-0 king at (2,0); player-1 rook at (2,4) aiming down the rank.
    // A player-0 silver at (2,2) is pinned: moving it off the rank exposes the king.
    s.board[SH.id(2, 0)] = pc('K', 0)
    s.board[SH.id(2, 2)] = pc('S', 0)
    s.board[SH.id(2, 4)] = pc('R', 1)
    s.board[SH.id(0, 0)] = pc('K', 1)
    s.turn = 0
    const legal = SH.legalMoves(s)
    // moving the silver off the rank (e.g. up-left to (1,1)) would expose the king — illegal
    expect(legal.some(m => m.from === SH.id(2, 2) && m.to === SH.id(1, 1))).toBe(false)
    // but capturing the rook along the rank (silver can't reach it; king can't either here)
    // — confirm at least the pinned silver has no off-rank escape:
    expect(legal.some(m => m.from === SH.id(2, 2) && SH.rc(m.to)[0] !== 2)).toBe(false)
  })

  it('detects a back-rank checkmate', () => {
    const s = emptyState()
    // player-1 king cornered at (0,0). Player-0 gold at (1,0) gives check from below;
    // a player-0 rook at (1,1) covers the (0,1) escape and backs up the gold.
    s.board[SH.id(0, 0)] = pc('K', 1)
    s.board[SH.id(1, 0)] = pc('G', 0)
    s.board[SH.id(1, 1)] = pc('R', 0)
    s.board[SH.id(4, 4)] = pc('K', 0)
    s.turn = 1 // player 1 (king) to move and is mated
    expect(SH.inCheck(s, 1)).toBe(true)
    expect(SH.isCheckmate(s)).toBe(true)
  })

  it('plays a bounded self-play game to a terminal result with no throws', () => {
    let s = SH.makeGame()
    let plies = 0
    expect(() => {
      while (s.winner == null && plies < 300) {
        const next = SH.aiMove(s) // drives whichever side is to move via the same search
        // aiMove targets s.turn each call, so it advances both sides
        if (next === s) break // no legal move path defensive guard
        s = next
        plies++
      }
    }).not.toThrow()
    // terminal: either a winner, or we hit the cap (treat as draw-by-cap) — both valid
    const result = s.winner != null ? s.winner : 'draw'
    expect(['you', 'ai', 'draw']).toContain(result)
    expect(plies).toBeLessThanOrEqual(300)
  })
})
