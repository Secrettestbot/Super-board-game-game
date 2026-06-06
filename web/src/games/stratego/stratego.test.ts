import { describe, it, expect } from 'vitest'
import {
  makeGame, legalMoves, move, aiMove, counts,
  isPiece, RANK_BOMB, RANK_FLAG, N,
} from './logic'
import type { StrategoState, Player, Piece } from './logic'

const idx = (r: number, c: number) => r * N + c

// Build a minimal hand-crafted state for combat tests (lakes irrelevant here).
function blank(turn: Player = 0): StrategoState {
  const board = new Array(N * N).fill(null)
  return {
    board, turn, you: 0, winner: null, captured: [], last: null,
    reveal: null, belief: {}, log: [],
  }
}

let nextId = 1
function put(s: StrategoState, i: number, rank: number, owner: Player, moved = false): Piece {
  const p: Piece = { rank, owner, revealed: false, moved, id: nextId++ }
  s.board[i] = p
  return p
}

describe('stratego combat', () => {
  it('a higher rank beats a lower rank; loser removed', () => {
    const s = blank(0)
    put(s, idx(4, 4), 8, 0)        // your Colonel (8)
    put(s, idx(3, 4), 5, 1)        // enemy Lieutenant (5)
    const ns = move(s, 0, idx(4, 4), idx(3, 4))
    const winner = ns.board[idx(3, 4)]
    expect(isPiece(winner) && winner.rank === 8 && winner.owner === 0).toBe(true)
    expect(ns.board[idx(4, 4)]).toBe(null)
    expect(ns.captured.some(c => c.rank === 5 && c.owner === 1)).toBe(true)
  })

  it('equal ranks: both removed', () => {
    const s = blank(0)
    put(s, idx(4, 4), 6, 0)
    put(s, idx(3, 4), 6, 1)
    const ns = move(s, 0, idx(4, 4), idx(3, 4))
    expect(ns.board[idx(4, 4)]).toBe(null)
    expect(ns.board[idx(3, 4)]).toBe(null)
    expect(ns.captured.length).toBe(2)
  })

  it('Spy beats Marshal when the Spy attacks, but loses otherwise', () => {
    // spy attacks marshal -> spy wins
    const s1 = blank(0)
    put(s1, idx(4, 4), 1, 0)       // your Spy
    put(s1, idx(3, 4), 10, 1)      // enemy Marshal
    const a = move(s1, 0, idx(4, 4), idx(3, 4))
    const w = a.board[idx(3, 4)]
    expect(isPiece(w) && w.rank === 1 && w.owner === 0).toBe(true)

    // marshal attacks spy -> marshal wins
    const s2 = blank(1)
    put(s2, idx(3, 4), 10, 1)
    put(s2, idx(4, 4), 1, 0)
    const b = move(s2, 1, idx(3, 4), idx(4, 4))
    const w2 = b.board[idx(4, 4)]
    expect(isPiece(w2) && w2.rank === 10 && w2.owner === 1).toBe(true)
  })

  it('Miner defeats a Bomb; other attackers die to the bomb', () => {
    const s = blank(0)
    put(s, idx(4, 4), 3, 0)            // Miner
    put(s, idx(3, 4), RANK_BOMB, 1)   // Bomb
    const ns = move(s, 0, idx(4, 4), idx(3, 4))
    const w = ns.board[idx(3, 4)]
    expect(isPiece(w) && w.rank === 3 && w.owner === 0).toBe(true)

    const s2 = blank(0)
    put(s2, idx(4, 4), 9, 0)           // General
    put(s2, idx(3, 4), RANK_BOMB, 1)
    const ns2 = move(s2, 0, idx(4, 4), idx(3, 4))
    const bomb = ns2.board[idx(3, 4)]
    expect(isPiece(bomb) && bomb.rank === RANK_BOMB).toBe(true)   // bomb survives
    expect(ns2.board[idx(4, 4)]).toBe(null)                       // attacker gone
  })

  it('a Scout moves multiple squares in a straight line', () => {
    const s = blank(0)
    put(s, idx(4, 0), 2, 0)           // Scout in column 0
    const moves = legalMoves(s, 0)
    // should be able to slide several squares to the right and along the column
    expect(moves.some(m => m.from === idx(4, 0) && m.to === idx(4, 4))).toBe(true)
    expect(moves.some(m => m.from === idx(4, 0) && m.to === idx(7, 0))).toBe(true)
    // a non-scout cannot
    const s2 = blank(0)
    put(s2, idx(4, 0), 5, 0)
    const m2 = legalMoves(s2, 0)
    expect(m2.some(m => m.to === idx(4, 4))).toBe(false)
    expect(m2.some(m => m.to === idx(4, 1))).toBe(true)
  })

  it('lakes block movement and scouts cannot slide through them', () => {
    const s = makeGame({ seed: 7 })
    // lakes are at rows 3 & 4, columns 2 and 5 — assert they exist
    expect(s.board[idx(3, 2)]).toBe('lake')
    expect(s.board[idx(4, 5)]).toBe('lake')
    // a scout placed left of a lake cannot land on or pass the lake square
    const s2 = blank(0)
    s2.board[idx(4, 2)] = 'lake'
    put(s2, idx(4, 0), 2, 0)
    const moves = legalMoves(s2, 0)
    expect(moves.some(m => m.to === idx(4, 2))).toBe(false)   // cannot enter lake
    expect(moves.some(m => m.to === idx(4, 3))).toBe(false)   // cannot pass lake
    expect(moves.some(m => m.to === idx(4, 1))).toBe(true)    // can reach square before lake
  })

  it('capturing the flag wins the game', () => {
    const s = blank(0)
    put(s, idx(4, 4), 7, 0)            // your Major
    put(s, idx(3, 4), RANK_FLAG, 1)   // enemy Flag (give the enemy something else movable too)
    put(s, idx(0, 0), 5, 1)
    const ns = move(s, 0, idx(4, 4), idx(3, 4))
    expect(ns.winner).toBe(0)
    expect(ns.turn).toBe(null)
  })

  it('a player with no movable pieces loses', () => {
    // player 0 has only a bomb + flag (both immobile) -> after AI move, 0 has no moves
    const s = blank(1)
    put(s, idx(7, 7), RANK_FLAG, 0)
    put(s, idx(7, 6), RANK_BOMB, 0)
    put(s, idx(0, 0), 4, 1)           // enemy has a Sergeant to move
    put(s, idx(0, 1), RANK_FLAG, 1)
    expect(legalMoves(s, 0).length).toBe(0)
    const ns = move(s, 1, idx(0, 0), idx(1, 0))
    expect(ns.winner).toBe(1)
  })

  it('bounded self-play terminates without throwing and yields a valid winner', () => {
    for (let game = 0; game < 6; game++) {
      let s = makeGame({ seed: 100 + game })
      let guard = 0
      expect(() => {
        while (s.winner == null && guard < 4000) {
          guard++
          if (s.turn === 0) {
            const ms = legalMoves(s, 0)
            if (!ms.length) break
            const m = ms[guard % ms.length]
            s = move(s, 0, m.from, m.to)
          } else {
            const before = s
            s = aiMove(s)
            if (s === before) break    // AI could not move
          }
        }
      }).not.toThrow()
      // winner, if present, must be a valid player
      if (s.winner != null) expect(s.winner === 0 || s.winner === 1).toBe(true)
      // captured tray entries are well-formed
      for (const c of s.captured) {
        expect(c.owner === 0 || c.owner === 1).toBe(true)
        expect(typeof c.rank).toBe('number')
      }
    }
  })

  it('counts and game setup are consistent (16 pieces each, one flag each)', () => {
    const s = makeGame({ seed: 3 })
    const { you, ai } = counts(s.board)
    expect(you).toBe(16)
    expect(ai).toBe(16)
    let flags0 = 0, flags1 = 0
    for (const c of s.board) {
      if (isPiece(c) && c.rank === RANK_FLAG) { if (c.owner === 0) flags0++; else flags1++ }
    }
    expect(flags0).toBe(1)
    expect(flags1).toBe(1)
  })
})
