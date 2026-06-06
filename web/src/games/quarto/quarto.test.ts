import { describe, it, expect } from 'vitest'
import * as Q from './logic'

// Pure logic test, no DOM. Verifies the initial state, line-win detection on constructed
// boards, and plays several full games to completion (human random, AI via aiMove) asserting
// termination + invariants. `npm test` runs this alongside every other game's test.

describe('quarto logic', () => {
  it('makeGame() yields an empty board, a full 16-piece pool minus the handed piece, and a handed piece', () => {
    const s = Q.makeGame()
    expect(s.board).toHaveLength(Q.NCELL)
    expect(s.board.every(c => c === null)).toBe(true)
    expect(s.pool).toHaveLength(Q.NPIECE)
    // exactly one piece has been pulled from the pool — the one in hand
    expect(s.pool.filter(Boolean)).toHaveLength(Q.NPIECE - 1)
    expect(s.hand).not.toBeNull()
    expect(s.pool[s.hand as number]).toBe(false)
    expect(s.turn).toBe('you')
    expect(s.winner).toBeNull()
  })

  it('detects a line whose four pieces share a trait, and rejects one that shares none', () => {
    // Four pieces all TALL (bit 0 set): 0b0001, 0b0011, 0b0101, 0b1001 => 1,3,5,9
    const sharing: Q.Cell[] = new Array(Q.NCELL).fill(null)
    sharing[0] = 1; sharing[1] = 3; sharing[2] = 5; sharing[3] = 9   // top row, all tall
    const line = Q.winningLine(sharing)
    expect(line).not.toBeNull()
    expect(line).toEqual([0, 1, 2, 3])

    // A row that shares NO trait: pick four pieces with no common bit value across all four.
    // 0b0000(0), 0b0111(7), 0b1011(11), 0b1101(13):
    //   AND = 0  -> no all-1 trait. OR = 1111 -> no all-0 trait. So no shared value.
    const none: Q.Cell[] = new Array(Q.NCELL).fill(null)
    none[0] = 0; none[1] = 7; none[2] = 11; none[3] = 13
    expect(Q.winningLine(none)).toBeNull()
  })

  it('a diagonal sharing a trait is also detected', () => {
    // all DARK (bit 1): pieces with bit 2 set -> 2,3,6,7 placed on the main diagonal (0,5,10,15)
    const b: Q.Cell[] = new Array(Q.NCELL).fill(null)
    b[0] = 2; b[5] = 3; b[10] = 6; b[15] = 7
    const line = Q.winningLine(b)
    expect(line).toEqual([0, 5, 10, 15])
  })

  // aiMove runs a deep minimax (Quarto's give-a-piece branching is large), so a couple of
  // full self-play games is plenty to exercise the engine. Give it a generous per-test
  // timeout so CPU contention from the parallel suite can't trip a false failure.
  it('plays several full games to completion with no throws and consistent counts', () => {
    const rng = (n: number) => (Math.random() * n) | 0
    for (let game = 0; game < 2; game++) {
      let s = Q.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 200) {
        // invariant: pieces on board + pieces in pool + (1 if a piece is currently handed) === 16
        const onBoard = s.board.filter(c => c !== null).length
        const inPool = s.pool.filter(Boolean).length
        const handed = s.hand !== null ? 1 : 0
        expect(onBoard + inPool + handed).toBe(Q.NPIECE)

        if (s.turn === 'you') {
          if (s.hand !== null) {
            // place the handed piece on a random empty cell
            const empties = Q.emptyCells(s.board)
            s = Q.place(s, empties[rng(empties.length)])
          } else {
            // hand a random remaining piece
            const pool = Q.poolPieces(s.pool)
            s = Q.hand(s, pool[rng(pool.length)])
          }
        } else {
          s = Q.aiMove(s)
        }
      }
      // game terminated within the cap
      expect(s.winner).not.toBeNull()
      expect(['you', 'ai', 'draw']).toContain(s.winner)
      if (s.winner === 'draw') {
        // a draw means a full board with no winning line
        expect(s.board.every(c => c !== null)).toBe(true)
        expect(Q.winningLine(s.board)).toBeNull()
      } else {
        // a win means a real shared line exists on the board
        expect(Q.winningLine(s.board)).not.toBeNull()
        expect(s.line).not.toBeNull()
      }
    }
  }, 40000)

  it('the AI never hands the human a piece that wins immediately when a safe piece exists', () => {
    // Construct a position where the AI must hand: three tall pieces in a row, one empty cell,
    // and both safe and unsafe pieces left in the pool.
    let s = Q.makeGame()
    // reset to a controlled state
    const board: Q.Cell[] = new Array(Q.NCELL).fill(null)
    // 1(0001), 7(0111), 9(1001) share EXACTLY one attribute (bit0/"tall") — no other bit is
    // common — so only a tall piece completes the open row at cell 3.
    board[0] = 1; board[1] = 7; board[2] = 9
    const pool: boolean[] = new Array(Q.NPIECE).fill(false)
    pool[3] = true   // 0b0011 tall -> completes the tall line at cell 3 -> UNSAFE
    pool[0] = true   // 0b0000 short -> breaks the only shared attribute -> SAFE
    s = Object.assign({}, s, {
      board, pool, hand: null, turn: 'ai', winner: null, line: null, last: 2, log: s.log,
    }) as Q.QuartoState
    const after = Q.aiMove(s)
    // AI should have handed a piece (turn now human's) and it must NOT be the immediately-winning 7
    expect(after.hand).not.toBeNull()
    const handed = after.hand as number
    // verify the handed piece cannot immediately win for the human
    const empties = Q.emptyCells(after.board)
    const wins = empties.some(cell => {
      const nb = after.board.slice(); nb[cell] = handed
      return Q.winningLine(nb) !== null
    })
    expect(wins).toBe(false)
  })
})
