import { describe, it, expect } from 'vitest'
import {
  makeGame, legalMoves, moveHiker, buyPark, endSeason, aiTurn, aiBuy,
  bothFinished, playerFinished, finalScore,
  TRAILHEAD, END, TRAIL_LEN, SEASONS,
  type ParksState, type Player,
} from './logic'

function findGainSite(s: ParksState): number {
  const i = s.trail.findIndex(t => t.kind === 'gain')
  return i
}

describe('parks logic', () => {
  it('makes a deterministic game with a full trail, market, and trailhead hikers', () => {
    const a = makeGame({ seed: 7 })
    const b = makeGame({ seed: 7 })
    expect(a.trail.length).toBe(TRAIL_LEN)
    expect(a.market.length).toBe(3)
    expect(a.season).toBe(1)
    expect(a.turn).toBe(0)
    expect(a.winner).toBe(null)
    // hikers start at the trailhead (position -1, NOT a falsy 0 trap)
    expect(a.players[0].hikers).toEqual([TRAILHEAD, TRAILHEAD])
    expect(a.players[1].hikers).toEqual([TRAILHEAD, TRAILHEAD])
    // deterministic
    expect(a.trail.map(t => t.label)).toEqual(b.trail.map(t => t.label))
    expect(a.market.map(c => c.name)).toEqual(b.market.map(c => c.name))
  })

  it('a hiker may only move forward to an unoccupied site', () => {
    const s = makeGame({ seed: 3 })
    const moves = legalMoves(s, 0)
    // from the trailhead every trail site 0..7 plus END is reachable
    const sitesForHiker0 = moves.filter(m => m.hiker === 0).map(m => m.site).sort((x, y) => x - y)
    expect(sitesForHiker0).toEqual([0, 1, 2, 3, 4, 5, 6, 7, END])
    // move hiker 0 to site 3
    const s2 = moveHiker(s, 0, 0, 3)
    expect(s2.players[0].hikers[0]).toBe(3)
    // it is now player 1's turn; player 1 cannot move onto occupied site 3
    expect(s2.turn).toBe(1)
    const occ = legalMoves(s2, 1).filter(m => m.site !== END).map(m => m.site)
    expect(occ).not.toContain(3)
    // backward moves are illegal: hiker 0 at site 3 has no legal site < 3
    const back = legalMoves(s2, 0).filter(m => m.hiker === 0 && m.site < 3 && m.site !== END)
    expect(back.length).toBe(0)
  })

  it('taking a site grants its resources', () => {
    const s = makeGame({ seed: 11 })
    const gi = findGainSite(s)
    expect(gi).toBeGreaterThanOrEqual(0)
    const before = s.players[0].pool
    const totalBefore = before.sun + before.mountain + before.forest + before.water
    const s2 = moveHiker(s, 0, 0, gi)
    const after = s2.players[0].pool
    const totalAfter = after.sun + after.mountain + after.forest + after.water
    expect(totalAfter).toBeGreaterThan(totalBefore)
  })

  it('season ends when both hikers reach the end of the trail', () => {
    const s = makeGame({ seed: 5 })
    // drive player 0 both hikers to END; alternate so turns pass legally
    let g = s
    g = moveHiker(g, 0, 0, END)   // p0 hiker0 finishes; turn -> p1
    g = moveHiker(g, 1, 0, END)   // p1 hiker0 finishes; turn -> p0
    g = moveHiker(g, 0, 1, END)   // p0 finished (both at END) -> doneSeason
    expect(playerFinished(g.players[0])).toBe(true)
    expect(g.players[0].doneSeason).toBe(true)
    expect(bothFinished(g)).toBe(false)
    g = moveHiker(g, 1, 1, END)   // p1 finished too
    expect(bothFinished(g)).toBe(true)
  })

  it('buying a park deducts resources and adds VP', () => {
    let s = makeGame({ seed: 2 })
    const card = s.market[0]
    // hand-grant exactly the cost to player 0
    s = {
      ...s,
      players: [
        { ...s.players[0], pool: { ...card.cost } },
        s.players[1],
      ],
    }
    const vpBefore = s.players[0].vp
    const s2 = buyPark(s, 0, card.id)
    expect(s2.players[0].vp).toBe(vpBefore + card.vp)
    // pool fully spent
    const pool = s2.players[0].pool
    expect(pool.sun + pool.mountain + pool.forest + pool.water).toBe(0)
    // card left the market, market refilled to 3
    expect(s2.market.find(c => c.id === card.id)).toBeUndefined()
    expect(s2.market.length).toBe(3)
    expect(s2.players[0].parks.length).toBe(1)
  })

  it('cannot buy a park you cannot afford', () => {
    const s = makeGame({ seed: 9 })
    // fresh player has empty pool; pick a market card with a nonzero cost
    const card = s.market.find(c => c.cost.sun + c.cost.mountain + c.cost.forest + c.cost.water > 0)!
    expect(() => buyPark(s, 0, card.id)).toThrow()
  })

  it('advances through 4 seasons and ends with a valid winner', () => {
    let s = makeGame({ seed: 4 })
    let guard = 0
    while (s.winner == null && guard++ < 2000) {
      if (bothFinished(s)) {
        s = endSeason(s)
        continue
      }
      // move whoever's turn it is straight to END (simplest legal play)
      const p = s.turn
      if (s.players[p].doneSeason) {
        // safety: if it's a finished player's turn, just push both to END for the other
        const other: Player = p === 0 ? 1 : 0
        const h: 0 | 1 = s.players[other].hikers[0] !== END ? 0 : 1
        s = moveHiker(s, other, h, END)
        continue
      }
      const h: 0 | 1 = s.players[p].hikers[0] !== END ? 0 : 1
      s = moveHiker(s, p, h, END)
    }
    expect(guard).toBeLessThan(2000)
    expect(s.winner === 0 || s.winner === 1 || s.winner === 'tie').toBe(true)
    expect(s.season).toBe(SEASONS)
  })

  it('self-plays a full game (greedy human + AI) to a valid winner with no throws', () => {
    let s = makeGame({ seed: 21 })
    let guard = 0
    expect(() => {
      while (s.winner == null && guard++ < 5000) {
        if (bothFinished(s)) {
          s = aiBuy(s, 1)
          s = aiBuy(s, 0) // let human side grab a park too if affordable
          s = endSeason(s)
          continue
        }
        if (s.turn === 1) {
          s = aiTurn(s)
          continue
        }
        // human player 0: greedy-ish — take the highest-scoring legal move via a simple heuristic
        const moves = legalMoves(s, 0)
        // prefer a non-END move if available
        const real = moves.filter(m => m.site !== END)
        const m = real.length > 0 ? real[0] : moves[0]
        s = moveHiker(s, 0, m.hiker, m.site)
      }
    }).not.toThrow()
    expect(guard).toBeLessThan(5000)
    expect(s.winner === 0 || s.winner === 1 || s.winner === 'tie').toBe(true)
    // every season was played
    expect(s.season).toBe(SEASONS)
    // final scores are sane numbers
    expect(Number.isFinite(finalScore(s.players[0]))).toBe(true)
    expect(Number.isFinite(finalScore(s.players[1]))).toBe(true)
  })
})
