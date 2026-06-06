import { describe, it, expect } from 'vitest'
import {
  makeGame, placeWorker, canPlace, resolvePlacements, feedPhase, buyBuilding,
  aiTurn, scorePlayer, winner, freeSlots,
  RESOURCE_SPACES,
} from './logic'
import type { State, SpaceId } from './logic'

// Force a die face f via 1 + floor(rand()*6): return (f-0.5)/6.
function faces(values: number[]): () => number {
  let i = 0
  return () => {
    const f = values[i % values.length]
    i++
    return (f - 0.5) / 6
  }
}

describe('placement & slot limits', () => {
  it('limited spaces fill up and further placement is illegal', () => {
    let s = makeGame(1)
    // The Field has exactly 1 slot. Player 0 places 1 worker there.
    expect(canPlace(s, 0, 'field', 1)).toBe(true)
    s = placeWorker(s, 0, 'field', 1)
    expect(freeSlots(s, 'field')).toBe(0)
    // It is now player 1's turn; the field is full so player 1 cannot use it.
    expect(s.turn).toBe(1)
    expect(canPlace(s, 1, 'field', 1)).toBe(false)
  })

  it('the hut requires exactly 2 workers', () => {
    const s = makeGame(1)
    expect(canPlace(s, 0, 'hut', 1)).toBe(false)
    expect(canPlace(s, 0, 'hut', 2)).toBe(true)
    expect(canPlace(s, 0, 'hut', 3)).toBe(false)
  })

  it('cannot place more workers than you have left', () => {
    const s = makeGame(1)
    // start with 5 to place; hunting unlimited but 6 > 5 is illegal
    expect(canPlace(s, 0, 'hunting', 6)).toBe(false)
    expect(canPlace(s, 0, 'hunting', 5)).toBe(true)
  })
})

describe('resolving gather spaces', () => {
  it('the quarry yields floor((diceSum + tools) / 5) stone', () => {
    let s = makeGame(1)
    // Put both players' remaining workers somewhere, but we only care about p0 at quarry.
    s.toPlace = [0, 0]
    s.phase = 'resolve'
    s.resolveOrder = [0, 1]
    s.resolveIdx = 0
    s.turn = 0
    // two workers at the quarry, give player 0 a tool (+1)
    s.occ.quarry = [0, 0]
    s.players[0].tools = 1
    // force dice 6,6 -> sum 12 + tool 1 = 13 -> floor(13/5) = 2 stone
    const after = resolvePlacements(s, faces([6, 6]))
    expect(after.players[0].res.stone).toBe(2)
  })

  it('the river uses divisor 6 for gold', () => {
    const def = RESOURCE_SPACES.find(d => d.id === 'river')!
    expect(def.divisor).toBe(6)
    let s = makeGame(1)
    s.toPlace = [0, 0]; s.phase = 'resolve'; s.resolveOrder = [0, 1]; s.resolveIdx = 0; s.turn = 0
    s.occ.river = [0, 0, 0] // 3 dice
    // dice 6,6,6 = 18, /6 = 3 gold
    const after = resolvePlacements(s, faces([6, 6, 6]))
    expect(after.players[0].res.gold).toBe(3)
  })
})

describe('hut grows the tribe', () => {
  it('resolving the hut adds a worker', () => {
    let s = makeGame(1)
    s.toPlace = [0, 0]; s.phase = 'resolve'; s.resolveOrder = [0, 1]; s.resolveIdx = 0; s.turn = 0
    s.occ.hut = [0, 0]
    const before = s.players[0].workers
    const after = resolvePlacements(s, faces([1]))
    expect(after.players[0].workers).toBe(before + 1)
  })
})

describe('feeding', () => {
  it('feeds 1 food per worker and penalizes shortfall in points', () => {
    let s = makeGame(1)
    s.phase = 'feed'; s.turn = 0
    s.players[0].workers = 5
    s.players[0].farm = 0
    s.players[0].food = 3 // can only feed 3 of 5 -> shortfall 2 -> -2 pts
    s.players[0].points = 10
    const after = feedPhase(s, 0)
    expect(after.players[0].food).toBe(0)
    expect(after.players[0].points).toBe(8)
  })

  it('the farm track covers feeding before the food stock', () => {
    let s = makeGame(1)
    s.phase = 'feed'; s.turn = 0
    s.players[0].workers = 5
    s.players[0].farm = 5 // farm covers all 5
    s.players[0].food = 0
    s.players[0].points = 10
    const after = feedPhase(s, 0)
    expect(after.players[0].food).toBe(0)
    expect(after.players[0].points).toBe(10) // no penalty
  })
})

describe('buying a building', () => {
  it('deducts resources and adds points', () => {
    let s = makeGame(1)
    const b = s.market.find(x => x != null)!
    const p = s.players[0]
    // grant exactly the cost
    for (const r of ['wood', 'clay', 'stone', 'gold'] as const) {
      p.res[r] = (b.cost[r] ?? 0)
    }
    const before = p.points
    const after = buyBuilding(s, 0, b.id)
    expect(after.players[0].points).toBe(before + b.points)
    for (const r of ['wood', 'clay', 'stone', 'gold'] as const) {
      expect(after.players[0].res[r]).toBe(0)
    }
    // building removed from market
    expect(after.market.some(x => x != null && x.id === b.id)).toBe(false)
    expect(scorePlayer(after.players[0])).toBe(before + b.points)
  })

  it('cannot buy a building you cannot afford', () => {
    const s = makeGame(1)
    const b = s.market.find(x => x != null)!
    // player has zero resources
    const after = buyBuilding(s, 0, b.id)
    expect(after).toBe(s) // unchanged
  })
})

describe('rounds and end trigger', () => {
  it('a full feed cycle advances the round and refills the market', () => {
    let s = makeGame(1)
    s.phase = 'feed'; s.turn = 0
    s.players[0].food = 99; s.players[1].food = 99
    s = feedPhase(s, 0) // feeds p0, turn -> 1
    expect(s.turn).toBe(1)
    s = feedPhase(s, 1) // feeds p1, end of round
    expect(s.round).toBe(2)
    expect(s.phase).toBe('place')
    expect(s.toPlace).toEqual([s.players[0].workers, s.players[1].workers])
  })
})

describe('ai self-play', () => {
  it('runs to a valid winner under a guard cap with no throws', () => {
    let s: State = makeGame(7)
    const rand = faces([1, 2, 3, 4, 5, 6, 4, 2, 6, 3, 5, 1])
    let guard = 0
    expect(() => {
      while (s.winner == null && guard < 5000) {
        guard++
        if (s.phase === 'place') {
          if (s.turn === 1) {
            s = aiTurn(s, rand)
          } else {
            // player 0 greedy: claim an affordable building, else gather wood, else hunt.
            const left = s.toPlace[0]
            if (left <= 0) { s = aiTurn(s, rand); continue } // safety
            let placed = false
            for (const slot of ['b0', 'b1', 'b2', 'b3'] as SpaceId[]) {
              const idx = ['b0', 'b1', 'b2', 'b3'].indexOf(slot)
              const b = s.market[idx]
              if (b && canPlace(s, 0, slot, 1)) {
                // can we afford? rough check via resources
                const aff = (['wood', 'clay', 'stone', 'gold'] as const)
                  .every(r => s.players[0].res[r] >= (b.cost[r] ?? 0))
                if (aff) { s = placeWorker(s, 0, slot, 1); placed = true; break }
              }
            }
            if (!placed) {
              if (canPlace(s, 0, 'forest', Math.min(left, 3))) s = placeWorker(s, 0, 'forest', Math.min(left, 3))
              else if (canPlace(s, 0, 'hunting', left)) s = placeWorker(s, 0, 'hunting', left)
              else { // dump remaining
                s = placeWorker(s, 0, 'hunting', left)
              }
            }
          }
        } else if (s.phase === 'resolve') {
          s = resolvePlacements(s, rand)
        } else if (s.phase === 'feed') {
          s = feedPhase(s, s.turn)
        }
      }
    }).not.toThrow()

    if (s.winner != null) {
      expect(s.winner === 0 || s.winner === 1).toBe(true)
      expect(s.phase).toBe('over')
      const w = winner(s)
      expect(w).not.toBeNull()
    } else {
      expect(guard).toBe(5000)
    }
  })
})
