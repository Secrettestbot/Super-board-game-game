import { describe, it, expect } from 'vitest'
import * as ING from './logic'
import type { IngState, Tile } from './logic'

const { coordToIndex } = ING

function idx(q: number, r: number): number {
  const v = coordToIndex(q, r)
  if (v == null) throw new Error(`off-board (${q},${r})`)
  return v
}

describe('hex geometry', () => {
  it('builds a side-6 hexagon with 91 cells and the center has 6 neighbours', () => {
    expect(ING.CELLS).toBe(91) // 3*6*5 + 1 = 91 cells for side 6
    const center = idx(0, 0)
    expect(ING.neighbors(center).length).toBe(6)
    // a corner has only 3 neighbours
    const corner = idx(5, 0)
    expect(ING.neighbors(corner).length).toBe(3)
  })

  it('adjacency is symmetric and step() round-trips through the 6 directions', () => {
    const i = idx(0, 0)
    for (let d = 0; d < 6; d++) {
      const j = ING.step(i, d)
      expect(j).not.toBeNull()
      expect(ING.neighbors(j!).includes(i)).toBe(true)
    }
  })
})

describe('placements', () => {
  it('an empty board has many legal 2-cell adjacent placements', () => {
    const s = ING.makeGame()
    const places = ING.legalPlacements(s.board)
    expect(places.length).toBeGreaterThan(100)
    // every placement is two distinct adjacent empty cells
    for (const p of places.slice(0, 20)) {
      expect(p.cellA).not.toBe(p.cellB)
      expect(s.board[p.cellA]).toBeNull()
      expect(s.board[p.cellB]).toBeNull()
      expect(ING.neighbors(p.cellA).includes(p.cellB)).toBe(true)
    }
  })

  it('placeTile sets both symbols on the two cells and consumes the tile', () => {
    // Build a controlled bag: first rack tile is {a:0,b:1} (red,orange).
    const bag: Tile[] = []
    for (let k = 0; k < 16; k++) bag.push({ a: 0, b: 1 })
    const s = ING.makeGame(bag)
    const a = idx(0, 0)
    const b = ING.step(a, 0)! // direction 0 neighbour
    const before = s.racks[0].length
    const s2 = ING.placeTile(s, 0, 0, a, b)
    expect(s2.board[a]).toBe(0)
    expect(s2.board[b]).toBe(1)
    // rack refilled back to 6, tile consumed from bag
    expect(s2.racks[0].length).toBe(before)
    expect(s2).not.toBe(s)
    // original state untouched (pure)
    expect(s.board[a]).toBeNull()
  })

  it('rejects illegal placements (non-adjacent / occupied / wrong turn)', () => {
    const s = ING.makeGame()
    const a = idx(0, 0)
    const far = idx(3, 0) // not adjacent to (0,0)
    expect(ING.placeTile(s, 0, 0, a, far)).toBe(s) // non-adjacent rejected
    expect(ING.placeTile(s, 1, 0, a, ING.step(a, 0)!)).toBe(s) // not player 1's turn
  })
})

describe('line scoring', () => {
  it('counts a single straight line outward from an end', () => {
    // place three reds in a row along direction 0, then score a fresh red end next to them
    const board: ING.Cell[] = new Array(ING.CELLS).fill(null)
    const c0 = idx(0, 0)
    const c1 = ING.step(c0, 0)!
    const c2 = ING.step(c1, 0)!
    board[c0] = 0
    board[c1] = 0
    board[c2] = 0
    // fresh end placed at the cell on the opposite side of c0 (direction 3), red, no partner
    const at = ING.step(c0, 3)! // neighbour in dir 3
    board[at] = 0
    // looking from `at`: in direction 0 we hit c0,c1,c2 = 3 consecutive reds.
    const gain = ING.scoreEnd(board, at, 0, -1)
    expect(gain).toBeGreaterThanOrEqual(3)
  })

  it('skips the direction pointing at the partner end', () => {
    const board: ING.Cell[] = new Array(ING.CELLS).fill(null)
    const a = idx(0, 0)
    const b = ING.step(a, 0)! // partner in direction 0 from a
    board[a] = 2 // yellow
    board[b] = 2
    // place a yellow beyond b so that if a counted direction 0 it would see it — but it must not,
    // because direction 0 points at the partner.
    const beyond = ING.step(b, 0)!
    board[beyond] = 2
    const gain = ING.scoreEnd(board, a, 2, b)
    // direction toward partner is skipped, so the chain through b/beyond is NOT counted from a.
    expect(gain).toBe(0)
  })

  it('scoreLines scores a multi-direction case correctly', () => {
    // Put reds on TWO different outward directions from a fresh end and confirm both add up.
    const board: ING.Cell[] = new Array(ING.CELLS).fill(null)
    const at = idx(0, 0)
    const d1 = ING.step(at, 1)!
    const d1b = ING.step(d1, 1)!
    const d2 = ING.step(at, 4)!
    board[d1] = 3 // green
    board[d1b] = 3
    board[d2] = 3
    board[at] = 3 // the fresh end (single end, no partner)
    const res = ING.scoreLines(board, [{ at, color: 3 }])
    // dir1 contributes 2, dir4 contributes 1 => 3
    expect(res[0].color).toBe(3)
    expect(res[0].gain).toBe(3)
  })
})

describe('ingenious extra turn', () => {
  it('reaching 18 grants the same player another turn', () => {
    // Bag whose first tile for player 0 is a double-red {0,0}. We pre-load the track to 16 and
    // arrange reds so placing scores >=2, hitting 18.
    const bag: Tile[] = []
    for (let k = 0; k < 16; k++) bag.push({ a: 0, b: 0 })
    let s: IngState = ING.makeGame(bag)
    // hand-set the red track near completion
    s = { ...s, tracks: s.tracks.map((t, p) => (p === 0 ? Object.assign(t.slice(), { 0: 16 }) : t.slice())) }
    // lay a run of reds so the placement scores into 18
    const c0 = idx(0, 0)
    const c1 = ING.step(c0, 0)!
    const c2 = ING.step(c1, 0)!
    const board = s.board.slice()
    board[c1] = 0
    board[c2] = 0
    s = { ...s, board }
    const s2 = ING.placeTile(s, 0, 0, c0, ING.step(c0, 3)!)
    expect(s2.tracks[0][0]).toBe(18)
    // extra turn => still player 0's turn (unless game ended, which it shouldn't this early)
    expect(s2.winner).toBeNull()
    expect(s2.turn).toBe(0)
  })
})

describe('final scoring / winner', () => {
  it('final score is the lowest track and winner compares lowest then next-lowest', () => {
    // A's tracks: [5,5,5,5,5,5] lowest=5 ; B: [18,18,18,18,18,1] lowest=1 -> A wins
    const A = [5, 5, 5, 5, 5, 5]
    const B = [18, 18, 18, 18, 18, 1]
    expect(ING.lowestTrack(A)).toBe(5)
    expect(ING.lowestTrack(B)).toBe(1)
    expect(ING.decideWinner([A, B])).toBe(0)

    // tie on lowest, broken by next-lowest: A=[3,3,9] B=[3,7,7] sorted A=[3,3,9] B=[3,7,7]
    const A2 = [3, 3, 9]
    const B2 = [3, 7, 7]
    expect(ING.compareScores(A2, B2)).toBe(-1) // second-lowest 3<7 => B better
    // exact tie -> player 0
    expect(ING.decideWinner([[4, 4, 4], [4, 4, 4]])).toBe(0)
  })
})

describe('self-play', () => {
  it('a full game terminates with a valid winner and no throws', () => {
    let s = ING.makeGame()
    let guard = 0
    while (s.winner == null && guard < 5000) {
      guard++
      if (s.turn === 0) {
        // "you" also play greedily by reusing the AI routine on a swapped-turn view:
        // simplest: pick first legal placement with first tile.
        const places = ING.legalPlacements(s.board)
        if (!places.length || !s.racks[0].length) break
        const p = places[0]
        const before = s.moves
        s = ING.placeTile(s, 0, 0, p.cellA, p.cellB)
        // must make progress or end
        expect(s.moves === before + 1 || s.winner != null).toBe(true)
      } else {
        const before = s.moves
        s = ING.aiTurn(s)
        expect(s.moves === before + 1 || s.winner != null).toBe(true)
      }
    }
    expect(guard).toBeLessThan(5000)
    expect(s.winner != null).toBe(true)
    expect(s.winner === 0 || s.winner === 1).toBe(true)
    // tracks are within bounds
    for (const tr of s.tracks) for (const v of tr) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(ING.MAXTRACK)
    }
  })
})
