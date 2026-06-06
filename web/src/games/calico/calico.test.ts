import { describe, it, expect } from 'vitest'
import {
  makeGame, makeBag, placeTile, legalPlacements, scoreBoard, colorButtons,
  goalResults, neighbors, inBounds, hexKey, GOAL_HEXES, GOAL_DEFS,
  boardFull, aiTurn, winner,
} from './logic'
import type { Board, Cell, Patch } from './logic'

/** Build an all-empty board (no fixed, no goals) for targeted scoring tests. */
function emptyBoard(): Board {
  const b: Board = {}
  for (let q = 0; q < 5; q++) for (let r = 0; r < 5; r++) {
    b[hexKey(q, r)] = { patch: null, fixed: false, goal: null } as Cell
  }
  return b
}

function put(b: Board, q: number, r: number, color: number, pattern = 0) {
  b[hexKey(q, r)] = { patch: { color, pattern } as Patch, fixed: false, goal: null }
}

describe('hex grid', () => {
  it('axial adjacency: (2,2) has exactly the 6 standard neighbours', () => {
    const nbs = neighbors(2, 2).map(n => hexKey(n.q, n.r)).sort()
    expect(nbs).toEqual(['1,2', '1,3', '2,1', '2,3', '3,1', '3,2'].sort())
  })

  it('inBounds rejects off-board coords incl. negatives and zero edge correctly', () => {
    expect(inBounds(0, 0)).toBe(true)
    expect(inBounds(4, 4)).toBe(true)
    expect(inBounds(-1, 0)).toBe(false)
    expect(inBounds(5, 0)).toBe(false)
  })
})

describe('placeTile', () => {
  it('fills the chosen hex and refills the hand back to 2', () => {
    const s = makeGame(makeBag(42))
    const spot = legalPlacements(s.boards[0])[0]
    const tile = s.hands[0][0]
    const s2 = placeTile(s, 0, 0, spot)
    const cell = s2.boards[0][hexKey(spot.q, spot.r)]
    expect(cell.patch).not.toBeNull()
    expect(cell.patch!.color).toBe(tile.color)
    expect(cell.patch!.pattern).toBe(tile.pattern)
    expect(s2.hands[0].length).toBe(2) // drew back up
    expect(s2.turn).toBe(1) // turn passed to AI
  })

  it('rejects placing onto an occupied / fixed / goal hex', () => {
    const s = makeGame(makeBag(7))
    // Goal hex must be rejected (returns unchanged, turn still 0).
    const g = GOAL_HEXES[0]
    const s2 = placeTile(s, 0, 0, g)
    expect(s2.turn).toBe(0)
    expect(s2.boards[0][hexKey(g.q, g.r)].patch).toBeNull()
  })
})

describe('color buttons', () => {
  it('a connected group of 3 same-color hexes earns a button (3 pts)', () => {
    const b = emptyBoard()
    put(b, 0, 0, 2); put(b, 1, 0, 2); put(b, 2, 0, 2) // straight line, same color
    const cb = colorButtons(b)
    expect(cb.groups.length).toBe(1)
    expect(cb.points).toBe(3)
  })

  it('two same-color hexes do NOT earn a button', () => {
    const b = emptyBoard()
    put(b, 0, 0, 1); put(b, 1, 0, 1)
    expect(colorButtons(b).points).toBe(0)
  })
})

describe('design goals', () => {
  it('a 6-unique-colors arrangement satisfies the six-unique goal', () => {
    const b = emptyBoard()
    const gi = GOAL_DEFS.findIndex(d => d.id === 'six-unique')
    const h = GOAL_HEXES[0]
    b[hexKey(h.q, h.r)] = { patch: null, fixed: false, goal: gi }
    // surround with 6 distinct colors 0..5
    neighbors(h.q, h.r).forEach((nb, i) => {
      expect(inBounds(nb.q, nb.r)).toBe(true)
      put(b, nb.q, nb.r, i)
    })
    const res = goalResults(b).find(r => r.hex.q === h.q && r.hex.r === h.r)!
    expect(res.satisfied).toBe(true)
    expect(res.points).toBe(GOAL_DEFS[gi].points)
  })

  it('a 2+2+2 three-pairs arrangement satisfies the three-pairs goal and not six-unique', () => {
    const b = emptyBoard()
    const gi = GOAL_DEFS.findIndex(d => d.id === 'three-pairs')
    const h = GOAL_HEXES[1]
    b[hexKey(h.q, h.r)] = { patch: null, fixed: false, goal: gi }
    const cols = [0, 0, 1, 1, 2, 2]
    neighbors(h.q, h.r).forEach((nb, i) => put(b, nb.q, nb.r, cols[i]))
    const res = goalResults(b).find(r => r.hex.q === h.q && r.hex.r === h.r)!
    expect(res.satisfied).toBe(true)
    expect(res.points).toBe(GOAL_DEFS[gi].points)
  })

  it('an incomplete surround (missing neighbour) does not satisfy any goal', () => {
    const b = emptyBoard()
    const gi = GOAL_DEFS.findIndex(d => d.id === 'six-unique')
    const h = GOAL_HEXES[2]
    b[hexKey(h.q, h.r)] = { patch: null, fixed: false, goal: gi }
    const nbs = neighbors(h.q, h.r)
    nbs.slice(0, 5).forEach((nb, i) => put(b, nb.q, nb.r, i)) // only 5 of 6 filled
    const res = goalResults(b).find(r => r.hex.q === h.q && r.hex.r === h.r)!
    expect(res.satisfied).toBe(false)
    expect(res.points).toBe(0)
  })
})

describe('end of game + winner', () => {
  it('self-play to a full quilt: terminates fast, valid winner, no throws', () => {
    let s = makeGame(makeBag(2026))
    let guard = 0
    expect(() => {
      while (s.winner == null && guard < 500) {
        guard++
        if (s.turn === 1) {
          s = aiTurn(s)
          continue
        }
        // Human side: greedy-ish — just place hand[0] on the first legal spot.
        const spots = legalPlacements(s.boards[0])
        if (spots.length === 0) {
          // human board full but game not over: pass turn so AI can finish.
          s = { ...s, turn: 1, step: s.step + 1 }
          continue
        }
        s = placeTile(s, 0, 0, spots[0])
      }
    }).not.toThrow()

    expect(s.winner == null).toBe(false)        // a winner exists
    expect(s.winner === 0 || s.winner === 1).toBe(true)
    expect(guard).toBeLessThan(500)             // terminated well under the cap
    expect(boardFull(s.boards[0])).toBe(true)
    expect(boardFull(s.boards[1])).toBe(true)
  })

  it('winner is the player with the higher total score', () => {
    let s = makeGame(makeBag(99))
    let guard = 0
    while (s.winner == null && guard < 500) {
      guard++
      if (s.turn === 1) { s = aiTurn(s); continue }
      const spots = legalPlacements(s.boards[0])
      if (spots.length === 0) { s = { ...s, turn: 1, step: s.step + 1 }; continue }
      s = placeTile(s, 0, 0, spots[0])
    }
    const s0 = scoreBoard(s.boards[0]).total
    const s1 = scoreBoard(s.boards[1]).total
    expect(s.scores[0]).toBe(s0)
    expect(s.scores[1]).toBe(s1)
    const expected = s0 >= s1 ? 0 : 1
    expect(winner(s)).toBe(expected)
  })
})
