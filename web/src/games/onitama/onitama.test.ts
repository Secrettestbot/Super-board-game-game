import { describe, it, expect } from 'vitest'
import * as ON from './logic'
import type { OnitamaState, Side, Piece } from './logic'

// Pure logic test: no DOM. Validates setup, plays full games vs the real AI, and checks the
// win + card-mirroring rules. `npm test` runs this alongside every other game's test.

const { N } = ON

function pieces(s: OnitamaState, side: Side): number {
  return s.board.filter(p => p && p.side === side).length
}
function masters(s: OnitamaState, side: Side): number {
  return s.board.filter(p => p && p.side === side && p.kind === 'master').length
}

describe('onitama setup', () => {
  it('makeGame() is a valid 5x5 start: 5 pieces per side (1 master + 4 students on back rows), 2 cards each + 1 middle', () => {
    const s = ON.makeGame()
    expect(s.board).toHaveLength(N * N)
    expect(pieces(s, 'you')).toBe(5)
    expect(pieces(s, 'ai')).toBe(5)
    expect(masters(s, 'you')).toBe(1)
    expect(masters(s, 'ai')).toBe(1)

    // back rows fully occupied with the master on the centre square
    for (let c = 0; c < N; c++) {
      const top = s.board[c] as Piece
      const bot = s.board[(N - 1) * N + c] as Piece
      expect(top.side).toBe('ai')
      expect(bot.side).toBe('you')
      expect(top.kind).toBe(c === 2 ? 'master' : 'student')
      expect(bot.kind).toBe(c === 2 ? 'master' : 'student')
    }
    // middle three rows empty
    for (let i = N; i < (N - 1) * N; i++) expect(s.board[i]).toBeNull()

    expect(s.hands.you).toHaveLength(2)
    expect(s.hands.ai).toHaveLength(2)
    expect(typeof s.middle).toBe('string')
    // all 5 dealt cards distinct
    const all = [...s.hands.you, ...s.hands.ai, s.middle]
    expect(new Set(all).size).toBe(5)
    expect(s.turn).toBe('you')
    expect(s.winner).toBeNull()
  })
})

describe('onitama full games', () => {
  it('plays several full games to completion without throwing, honoring invariants', () => {
    for (let game = 0; game < 8; game++) {
      let s = ON.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 300) {
        if (s.turn === 'you') {
          const moves = ON.legalMoves(s, 'you')
          if (moves.length === 0) {
            s = ON.passTurn(s, 'you')
          } else {
            s = ON.applyMove(s, 'you', moves[(Math.random() * moves.length) | 0])
          }
        } else {
          s = ON.aiMove(s)
        }
        // invariants every ply
        expect(pieces(s, 'you')).toBeLessThanOrEqual(5)
        expect(pieces(s, 'ai')).toBeLessThanOrEqual(5)
        expect(s.hands.you).toHaveLength(2)
        expect(s.hands.ai).toHaveLength(2)
        // hands + middle always remain a 5-card set drawn from the deck
        const distinct = new Set([...s.hands.you, ...s.hands.ai, s.middle])
        expect(distinct.size).toBe(5)
      }
      expect(s.winner === 'you' || s.winner === 'ai').toBe(true)
      expect(s.turn).toBeNull()
    }
  })
})

describe('onitama rules', () => {
  it('capturing the enemy master ends the game (Way of the Stone)', () => {
    // Build a position where a YOU student can step onto the AI master via the Crab card.
    const board: (Piece | null)[] = new Array(N * N).fill(null)
    const idx = (r: number, c: number) => r * N + c
    board[idx(0, 2)] = { side: 'ai', kind: 'master' }     // AI master at top centre
    board[idx(1, 2)] = { side: 'you', kind: 'student' }   // YOU student just below it
    board[idx(4, 2)] = { side: 'you', kind: 'master' }    // YOU master at home
    const s: OnitamaState = {
      board,
      hands: { you: ['Crab', 'Tiger'], ai: ['Monkey', 'Boar'] },
      middle: 'Elephant',
      turn: 'you', winner: null, last: null, log: [],
    }
    // Crab includes forward [-1,0]; from (1,2) that lands on (0,2) capturing the master.
    const moves = ON.legalMoves(s, 'you')
    const kill = moves.find(m => m.to === idx(0, 2) && m.capture === 'master')
    expect(kill).toBeTruthy()
    const after = ON.applyMove(s, 'you', kill!)
    expect(after.winner).toBe('you')
  })

  it('moving your master onto the enemy temple wins (Way of the Stream)', () => {
    const board: (Piece | null)[] = new Array(N * N).fill(null)
    const idx = (r: number, c: number) => r * N + c
    board[idx(0, 2)] = { side: 'ai', kind: 'master' } // sits on its own square? move it away
    board[idx(0, 0)] = { side: 'ai', kind: 'master' } // AI master elsewhere
    board[idx(0, 2)] = null
    board[idx(1, 2)] = { side: 'you', kind: 'master' } // YOU master one step below the AI temple (0,2)
    const s: OnitamaState = {
      board,
      hands: { you: ['Crab', 'Tiger'], ai: ['Monkey', 'Boar'] },
      middle: 'Elephant',
      turn: 'you', winner: null, last: null, log: [],
    }
    const moves = ON.legalMoves(s, 'you')
    const stream = moves.find(m => m.to === ON.AI_TEMPLE && m.from === idx(1, 2))
    expect(stream).toBeTruthy()
    const after = ON.applyMove(s, 'you', stream!)
    expect(after.winner).toBe('you')
  })

  it('card mirroring: the top (ai) effective offsets are the negation of the bottom (you) offsets', () => {
    for (const card of ON.CARDS) {
      const youOff = ON.effectiveOffsets(card, 'you')
      const aiOff = ON.effectiveOffsets(card, 'ai')
      expect(aiOff).toHaveLength(youOff.length)
      for (let i = 0; i < youOff.length; i++) {
        expect(aiOff[i][0]).toBe(-youOff[i][0])
        expect(aiOff[i][1]).toBe(-youOff[i][1])
      }
    }
  })
})
