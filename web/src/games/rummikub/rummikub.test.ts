import { describe, it, expect } from 'vitest'
import * as R from './logic'
import type { Tile, State, Player } from './logic'

let _id = 1000
function tile(num: number, color: R.Color | 'joker', joker = false): Tile {
  return { id: _id++, num: joker ? 0 : num, color, joker }
}
function joker(): Tile { return tile(0, 'joker', true) }

describe('isValidMeld', () => {
  it('accepts a valid group (same number, distinct colors)', () => {
    expect(R.isValidMeld([tile(7, 'red'), tile(7, 'blue'), tile(7, 'black')])).toBe(true)
    expect(R.isValidMeld([tile(7, 'red'), tile(7, 'blue'), tile(7, 'black'), tile(7, 'orange')])).toBe(true)
  })

  it('accepts a valid run (consecutive, same color)', () => {
    expect(R.isValidMeld([tile(4, 'blue'), tile(5, 'blue'), tile(6, 'blue')])).toBe(true)
    expect(R.isValidMeld([tile(9, 'black'), tile(10, 'black'), tile(11, 'black'), tile(12, 'black')])).toBe(true)
  })

  it('rejects a same-number same-color group', () => {
    expect(R.isValidMeld([tile(7, 'red'), tile(7, 'red'), tile(7, 'blue')])).toBe(false)
  })

  it('rejects a non-consecutive run', () => {
    expect(R.isValidMeld([tile(4, 'blue'), tile(6, 'blue'), tile(8, 'blue')])).toBe(false)
    // too short
    expect(R.isValidMeld([tile(4, 'blue'), tile(5, 'blue')])).toBe(false)
  })

  it('jokers substitute correctly', () => {
    // joker completes a group
    expect(R.isValidMeld([tile(7, 'red'), tile(7, 'blue'), joker()])).toBe(true)
    // joker fills a run gap
    expect(R.isValidMeld([tile(4, 'blue'), joker(), tile(6, 'blue')])).toBe(true)
    // joker extends a run end
    expect(R.isValidMeld([tile(4, 'blue'), tile(5, 'blue'), joker()])).toBe(true)
    // 5-color group impossible even with joker
    expect(R.isValidMeld([tile(7, 'red'), tile(7, 'blue'), tile(7, 'black'), tile(7, 'orange'), joker()])).toBe(false)
  })

  it('isValidTable checks every meld', () => {
    expect(R.isValidTable([
      [tile(1, 'red'), tile(2, 'red'), tile(3, 'red')],
      [tile(5, 'blue'), tile(5, 'red'), tile(5, 'black')],
    ])).toBe(true)
    expect(R.isValidTable([
      [tile(1, 'red'), tile(2, 'red'), tile(3, 'red')],
      [tile(5, 'blue'), tile(5, 'blue'), tile(5, 'black')], // invalid group
    ])).toBe(false)
  })
})

describe('meld scoring', () => {
  it('scores groups and runs', () => {
    expect(R.meldScore([tile(7, 'red'), tile(7, 'blue'), tile(7, 'black')])).toBe(21)
    expect(R.meldScore([tile(4, 'blue'), tile(5, 'blue'), tile(6, 'blue')])).toBe(15)
  })
  it('scores joker as the tile it represents', () => {
    // group of 7s with joker => 21
    expect(R.meldScore([tile(7, 'red'), tile(7, 'blue'), joker()])).toBe(21)
    // run 4-5-(6 joker) => 15
    expect(R.meldScore([tile(4, 'blue'), tile(5, 'blue'), joker()])).toBe(15)
  })
})

describe('initial-30 rule', () => {
  function setup(): { s: State } {
    // build a deterministic state with controlled racks
    const s = R.makeGame()
    return { s }
  }

  it('blocks a first play under 30', () => {
    const { s } = setup()
    // craft a run worth < 30: 1-2-3 blue = 6
    const a = tile(1, 'blue'), b = tile(2, 'blue'), c = tile(3, 'blue')
    s.racks[0] = [a, b, c, ...s.racks[0].slice(3)]
    const newTable = [[a, b, c]]
    const res = R.play(s, 0, newTable, [a.id, b.id, c.id])
    expect(res).toBeNull()
  })

  it('allows a first play of 30 or more', () => {
    const { s } = setup()
    // group of 11s (33) — distinct colors
    const a = tile(11, 'red'), b = tile(11, 'blue'), c = tile(11, 'black')
    s.racks[0] = [a, b, c, ...s.racks[0].slice(3)]
    const newTable = [[a, b, c]]
    const res = R.play(s, 0, newTable, [a.id, b.id, c.id])
    expect(res).not.toBeNull()
    expect(res!.hasMelded[0]).toBe(true)
    // tiles moved off rack
    expect(res!.racks[0].some((t) => t.id === a.id)).toBe(false)
    expect(res!.table.length).toBe(1)
  })
})

describe('play / win', () => {
  it('emptying the rack wins', () => {
    const s = R.makeGame()
    const a = tile(11, 'red'), b = tile(11, 'blue'), c = tile(11, 'black')
    s.racks[0] = [a, b, c] // exactly 3 tiles
    s.hasMelded = [true, false] // already melded so no 30 gate, but it's 33 anyway
    const res = R.play(s, 0, [[a, b, c]], [a.id, b.id, c.id])
    expect(res).not.toBeNull()
    expect(res!.winner).toBe(0)
    expect(res!.racks[0].length).toBe(0)
    expect(res!.result?.kind).toBe('empty')
  })

  it('play rejects tiles not on the rack', () => {
    const s = R.makeGame()
    const a = tile(11, 'red'), b = tile(11, 'blue'), c = tile(11, 'black')
    // c not added to rack
    s.racks[0] = [a, b, ...s.racks[0].slice(2)]
    s.hasMelded = [true, false]
    const res = R.play(s, 0, [[a, b, c]], [a.id, b.id, c.id])
    expect(res).toBeNull()
  })
})

describe('self-play termination + conservation', () => {
  function countTiles(s: State): number {
    let n = s.racks[0].length + s.racks[1].length + s.bag.length
    for (const m of s.table) n += m.length
    return n
  }

  it('plays a full game to a valid winner under a guard cap, no throws, 106 tiles conserved', () => {
    for (let seed = 1; seed <= 6; seed++) {
      let s = R.makeGame(R.shuffled(R.fullDeck(), seed))
      expect(countTiles(s)).toBe(R.TILE_COUNT)

      let guard = 0
      let consecutivePasses = 0
      expect(() => {
        while (s.winner == null && guard < 2000) {
          guard++
          const player = s.turn as Player
          const before = s.racks[player].length
          const beforeBag = s.bag.length
          // each player uses aiTurn logic (player 1) — emulate player 0 via same engine
          let next: State
          if (player === 1) {
            next = R.aiTurn(s)
          } else {
            // mirror aiTurn for player 0
            next = aiTurnFor(s, 0)
          }
          s = next
          expect(countTiles(s)).toBe(R.TILE_COUNT)
          const after = s.racks[player].length
          const afterBag = s.bag.length
          // detect a pure pass (no rack change, no bag change) → stalemate accumulation
          if (after === before && afterBag === beforeBag) consecutivePasses++
          else consecutivePasses = 0
          if (s.bag.length === 0 && consecutivePasses >= 2 && s.winner == null) {
            s = R.resolveStalemate(s)
            break
          }
        }
      }).not.toThrow()

      // winner must be valid if present
      if (s.winner != null) {
        expect(s.winner === 0 || s.winner === 1).toBe(true)
      }
      expect(countTiles(s)).toBe(R.TILE_COUNT)
    }
  })
})

// helper: run aiTurn logic for an arbitrary player (engine is symmetric)
function aiTurnFor(s: State, player: Player): State {
  if (player === 1) return R.aiTurn(s)
  // temporarily relabel: swap so player 0 is treated as the "AI"
  const swapped: State = {
    ...s,
    racks: [s.racks[1], s.racks[0]],
    hasMelded: [s.hasMelded[1], s.hasMelded[0]],
    turn: 1,
  }
  const out = R.aiTurn(swapped)
  // swap back
  return {
    ...out,
    racks: [out.racks[1], out.racks[0]],
    hasMelded: [out.hasMelded[1], out.hasMelded[0]],
    turn: (out.turn === 1 ? 0 : 1) as Player,
    winner: out.winner == null ? null : ((out.winner === 1 ? 0 : 1) as Player),
    result: out.result
      ? { ...out.result, by: (out.result.by === 1 ? 0 : 1) as Player, youCount: out.result.aiCount, aiCount: out.result.youCount }
      : null,
  }
}
