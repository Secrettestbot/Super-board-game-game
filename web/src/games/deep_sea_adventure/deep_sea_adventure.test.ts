import { describe, it, expect } from 'vitest'
import * as D from './logic'
import type { DeepSeaState } from './logic'

// helper: put the current diver at a position with a known load/direction, in 'choose'
function placed(s: DeepSeaState, seat: number, opts: Partial<D.Diver>): DeepSeaState {
  const divers = s.divers.map(d => (d.seat === seat ? Object.assign({}, d, opts) : d))
  return Object.assign({}, s, { divers, turn: seat })
}

describe('deep sea adventure logic', () => {
  it('air decreases by the diver carried-treasure count each turn', () => {
    let s = D.makeGame(undefined, 1)
    // give player 0 three treasures, then tick the turn's air
    s = placed(s, 0, { carrying: [5, 6, 7] })
    const before = s.air
    s = D.startTurnAirTick(s)
    expect(s.air).toBe(before - 3)
    // a diver carrying nothing costs no air
    let t = D.makeGame(undefined, 2)
    const air0 = t.air
    t = D.startTurnAirTick(t)
    expect(t.air).toBe(air0)
  })

  it('movement = dice sum minus treasures carried (min 0), skipping occupied spaces', () => {
    let s = D.makeGame(undefined, 3)
    // diver 0 at sub, carrying 2, chose down; roll 3+3=6 → net 4 spaces down
    s = placed(s, 0, { pos: 0, carrying: [4, 5], direction: 'down' })
    s = Object.assign({}, s, { chose: true, phase: 'choose' })
    s = D.applyMove(s, [3, 3])
    expect(s.divers[0].pos).toBe(4) // 6 - 2 = 4

    // load larger than roll → min 0 (no movement)
    let h = D.makeGame(undefined, 4)
    h = placed(h, 0, { pos: 2, carrying: [1, 1, 1, 1, 1, 1, 1], direction: 'down' })
    h = Object.assign({}, h, { chose: true, phase: 'choose' })
    h = D.applyMove(h, [1, 1]) // 2 - 7 < 0 → 0
    expect(h.divers[0].pos).toBe(2)

    // skipping: occupy the tile directly ahead; the diver steps OVER it without cost
    let k = D.makeGame(undefined, 5)
    // diver 1 sits on tile 3; diver 0 at tile 2 carrying 0, rolls 1+1=2 down
    k = Object.assign({}, k, {
      divers: k.divers.map(d =>
        d.seat === 0 ? Object.assign({}, d, { pos: 2, direction: 'down' as D.Dir })
        : d.seat === 1 ? Object.assign({}, d, { pos: 3 }) : d),
      turn: 0, chose: true, phase: 'choose',
    })
    // wants 2 real spaces from tile 2; tile 3 is occupied → skipped for free → real
    // steps land on tiles 4 then 5, so the diver ends on tile 5 (passed over 3).
    k = D.applyMove(k, [1, 1])
    expect(k.divers[0].pos).toBe(5)
  })

  it("can't reverse direction twice in a round", () => {
    let s = D.makeGame(undefined, 6)
    s = placed(s, 0, { pos: 5, direction: 'down' })
    s = Object.assign({}, s, { phase: 'choose', chose: false })
    // turn up
    s = D.chooseDirection(s, 'up')
    expect(s.divers[0].direction).toBe('up')
    expect(s.divers[0].turned).toBe(true)
    // attempt to turn back down → blocked
    s = D.chooseDirection(s, 'down')
    expect(s.divers[0].direction).toBe('up') // unchanged
  })

  it('picking up takes the tile (leaves blank), dropping leaves it', () => {
    let s = D.makeGame(undefined, 7)
    // find a real treasure tile index (1) and stand on it after a move
    const idx = 1
    const val = s.path[idx].value
    s = placed(s, 0, { pos: idx, carrying: [] })
    s = Object.assign({}, s, { phase: 'rolled', dice: [1, 1] })
    s = D.pickUp(s)
    expect(s.divers[0].carrying).toContain(val)
    expect(D.isBlank(s.path[idx])).toBe(true)

    // now drop on a blank space
    let t = D.makeGame(undefined, 8)
    t = placed(t, 0, { pos: 1, carrying: [9] })
    // blank out the tile underfoot so drop is legal
    t = Object.assign({}, t, {
      path: t.path.map((tile, i) => (i === 1 ? { level: -1, value: -1, stack: [] } : tile)),
      phase: 'rolled', dice: [1, 1],
    })
    t = D.drop(t)
    expect(t.divers[0].carrying.length).toBe(0)
    expect(t.path[1].value).toBe(9) // dropped treasure now sits there
    expect(D.isBlank(t.path[1])).toBe(false)
  })

  it('end-of-round: divers not back lose carried treasure, returned divers bank points', () => {
    let s = D.makeGame(undefined, 9)
    s = Object.assign({}, s, {
      air: 0,
      divers: s.divers.map(d =>
        d.seat === 0 ? Object.assign({}, d, { returned: true, carrying: [5, 6], pos: 0 })
        : d.seat === 1 ? Object.assign({}, d, { returned: false, carrying: [7, 8, 9], pos: 4 })
        : Object.assign({}, d, { returned: true, carrying: [], pos: 0 })),
    })
    s = D.endRound(s)
    // player 0 banked 11; player 1 lost all carried
    expect(s.divers[0].banked).toBe(11)
    expect(s.divers[1].banked).toBe(0)
    expect(s.divers[1].carrying.length).toBe(0)
    // lost treasure re-laid at the deep end as a stack
    const stacked = s.path.filter(t => t.stack.length > 0)
    expect(stacked.length).toBeGreaterThan(0)
    expect(D.sumValues(stacked.flatMap(t => t.stack))).toBe(7 + 8 + 9)
    // advanced to round 2 with refilled air
    expect(s.round).toBe(2)
    expect(s.air).toBe(D.START_AIR)
  })

  it('plays exactly 3 rounds then declares the most-points winner', () => {
    let s = D.makeGame(undefined, 9)
    // force three quick round-ends by draining air each time
    for (let r = 1; r <= D.N_ROUNDS; r++) {
      expect(s.round).toBe(r)
      // give player 0 a guaranteed bank so a winner is well-defined
      s = Object.assign({}, s, {
        air: 0,
        divers: s.divers.map(d =>
          d.seat === 0 ? Object.assign({}, d, { returned: true, carrying: [10], pos: 0 }) : d),
      })
      s = D.endRound(s)
    }
    expect(s.phase).toBe('over')
    expect(s.winner).toBe(0)
    expect(D.score(s, 0)).toBe(30)
  })

  it('deterministic AI self-play reaches a valid winner under a guard cap with no throws', () => {
    let s: DeepSeaState = D.makeGame(undefined, 424242)
    let guard = 0
    expect(() => {
      while (s.phase !== 'over' && guard < 100000) {
        guard++
        if (s.turn === 0) {
          // human plays the same brain as the AI for the self-play
          if (s.phase === 'choose' && !s.chose) {
            // dive while there's air margin, else surface
            const d = s.divers[0]
            const dir = d.turned || s.air <= d.pos + d.carrying.length + 2 ? 'up' : 'down'
            s = D.chooseDirection(s, dir as D.Dir)
          } else if (s.phase === 'choose' && s.chose) {
            s = D.move(s)
          } else if (s.phase === 'rolled') {
            s = D.pass(s)
          } else {
            // shouldn't happen, but break out safely
            break
          }
        } else {
          s = D.aiStep(s)
        }
      }
    }).not.toThrow()
    expect(s.phase).toBe('over')
    expect(guard).toBeLessThan(100000)
    expect(s.winner != null).toBe(true)
    expect([0, 1, 2]).toContain(s.winner)
    expect(s.round).toBe(D.N_ROUNDS)
  })

  it('aiTurn advances play and never throws across a full round', () => {
    let s: DeepSeaState = D.makeGame(undefined, 77)
    let guard = 0
    expect(() => {
      while (s.phase !== 'over' && guard < 100000) {
        guard++
        if (s.turn === 0) {
          if (s.phase === 'choose' && !s.chose) s = D.chooseDirection(s, 'up')
          else if (s.phase === 'choose') s = D.move(s)
          else if (s.phase === 'rolled') s = D.pass(s)
          else break
        } else {
          s = D.aiTurn(s)
        }
      }
    }).not.toThrow()
    expect(s.phase).toBe('over')
    expect([0, 1, 2]).toContain(s.winner)
  })
})
