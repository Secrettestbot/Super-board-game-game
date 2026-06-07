import { describe, it, expect } from 'vitest'
import * as PG from './logic'
import type { PentagoState, Dir } from './logic'

// Pure logic test: no DOM. Validates the initial state, win detection, quadrant rotation,
// and plays several full games (random human turns + the real AI) to a result with a cap,
// asserting termination and that nothing throws. AI depth is modest so this stays fast.

const N = PG.N

describe('pentago logic', () => {
  it('starts on a valid empty 6x6 board, White to place', () => {
    const s = PG.makeGame()
    expect(s.board).toHaveLength(36)
    expect(s.board.every(c => c === null)).toBe(true)
    expect(s.turn).toBe('w')
    expect(s.phase).toBe('place')
    expect(s.you).toBe('w')
    expect(s.winner).toBeNull()
  })

  it('detects a horizontal five-in-a-row (and not a four)', () => {
    const board: PG.Cell[] = new Array(36).fill(null)
    // four in a row on the top row -> no win
    for (let c = 0; c < 4; c++) board[c] = 'w'
    expect(PG.fiveLine(board, 'w')).toBeNull()
    // extend to five -> win, returns those exact cells
    board[4] = 'w'
    const line = PG.fiveLine(board, 'w')
    expect(line).not.toBeNull()
    expect(line).toEqual([0, 1, 2, 3, 4])
    // wrong colour finds nothing
    expect(PG.fiveLine(board, 'b')).toBeNull()
  })

  it('detects a diagonal five-in-a-row crossing quadrant borders', () => {
    const board: PG.Cell[] = new Array(36).fill(null)
    for (let k = 0; k < 5; k++) board[k * N + k] = 'b'   // (0,0)..(4,4)
    const line = PG.fiveLine(board, 'b')
    expect(line).toEqual([0, 7, 14, 21, 28])
  })

  it('rotates a quadrant correctly (clockwise + counter-clockwise are inverses)', () => {
    const board: PG.Cell[] = new Array(36).fill(null)
    // TL quadrant: marble at top-left corner cell (0,0)
    board[0] = 'w'
    // clockwise: (0,0) -> (0,2) i.e. board index 2
    const cw = PG.rotateQuad(board, 0, 'cw')
    expect(cw[0]).toBeNull()
    expect(cw[2]).toBe('w')
    // counter-clockwise of the rotated board restores the original
    const back = PG.rotateQuad(cw, 0, 'ccw')
    expect(back[0]).toBe('w')
    expect(back[2]).toBeNull()

    // a marble in the BR quadrant centre is unmoved by rotation
    const b2: PG.Cell[] = new Array(36).fill(null)
    const centre = 4 * N + 4   // (4,4) = BR centre
    b2[centre] = 'b'
    expect(PG.rotateQuad(b2, 3, 'cw')[centre]).toBe('b')
  })

  it('a player turn = place then rotate; phase tracks the steps', () => {
    let s = PG.makeGame()
    s = PG.place(s, 0, 'w')
    expect(s.phase).toBe('rotate')
    expect(s.pending).toBe(0)
    expect(s.turn).toBe('w')               // still White's turn until rotation
    s = PG.rotate(s, 1, 'cw', 'w')         // rotate TR (does not move our TL marble)
    expect(s.phase).toBe('place')
    expect(s.turn).toBe('b')               // handed to the AI
    expect(s.board[0]).toBe('w')
  })

  it('plays several full games to a winner or draw without throwing', () => {
    for (let game = 0; game < 8; game++) {
      let s: PentagoState = PG.makeGame()
      let guard = 0
      expect(() => {
        while (!s.winner && guard++ < 100) {
          if (s.turn === 'w') {
            // human: place on a random empty cell, then rotate a random quadrant/dir
            const open = s.board.map((c, i) => (c ? -1 : i)).filter(i => i >= 0)
            s = PG.place(s, open[(Math.random() * open.length) | 0], 'w')
            const q = (Math.random() * 4) | 0
            const dir: Dir = Math.random() < 0.5 ? 'cw' : 'ccw'
            s = PG.rotate(s, q, dir, 'w')
          } else {
            s = PG.aiMove(s)               // AI plays its whole two-step turn
          }
        }
      }).not.toThrow()
      expect(guard).toBeLessThan(100)      // always terminates within the cap
      expect(s.winner).not.toBeNull()      // a winner or a draw
    }
  })
})
