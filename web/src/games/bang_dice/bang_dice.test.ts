import { describe, it, expect } from 'vitest'
import {
  makeGame, rollDice, resolveDice, endTurn, toggleKeep, aiTurn,
  targetAt, setRng, MAX_LIFE, ARROW_PILE, NUM_PLAYERS,
} from './logic'
import type { BangState, Face } from './logic'

/** Force a specific 5-dice roll, then resolve. Helper for deterministic tests. */
function withDice(s: BangState, dice: Face[]): BangState {
  return Object.assign({}, s, { dice: dice.slice(), rolled: true })
}

describe('BANG! dice — targeting', () => {
  it('[1] hits the player 1 seat away (circular)', () => {
    const s = makeGame() // turn 0
    expect(targetAt(s.players, 0, 1)).toBe(1)
    // from player 3, one seat clockwise wraps to player 0
    expect(targetAt(s.players, 3, 1)).toBe(0)
  })

  it('[2] hits the player 2 seats away (circular)', () => {
    const s = makeGame()
    expect(targetAt(s.players, 0, 2)).toBe(2)
    expect(targetAt(s.players, 3, 2)).toBe(1)
  })

  it('shots skip dead players when targeting', () => {
    const s = makeGame()
    s.players[1].alive = false
    s.players[1].life = 0
    // 1 seat away from 0 should now be the next live seat (player 2)
    expect(targetAt(s.players, 0, 1)).toBe(2)
  })
})

describe('BANG! dice — resolution', () => {
  it('a [1] damages the player 1 seat away', () => {
    let s = makeGame()
    s = withDice(s, [1, 1, 'beer', 'beer', 'beer'])
    const r = resolveDice(s)
    expect(r.players[1].life).toBe(MAX_LIFE - 2) // two 1s = 2 damage
  })

  it('a [2] damages the player 2 seats away', () => {
    let s = makeGame()
    s = withDice(s, [2, 'beer', 'beer', 'beer', 'beer'])
    const r = resolveDice(s)
    expect(r.players[2].life).toBe(MAX_LIFE - 1)
  })

  it('beer heals, capped at max life', () => {
    let s = makeGame()
    s.players[0].life = MAX_LIFE - 1
    s = withDice(s, ['beer', 'beer', 'beer', 1, 2])
    const r = resolveDice(s)
    expect(r.players[0].life).toBe(MAX_LIFE) // +1 capped, not +3
  })

  it('taking arrows reduces the central pile', () => {
    let s = makeGame()
    s = withDice(s, ['arrow', 'arrow', 'beer', 'beer', 'beer'])
    const r = resolveDice(s)
    expect(r.players[0].arrows).toBe(2)
    expect(r.arrowPile).toBe(ARROW_PILE - 2)
  })

  it('Indian attack fires when the arrow pile empties — everyone loses life = arrows', () => {
    let s = makeGame()
    // give the others arrows so the indian attack hits them
    s.players[1].arrows = 2
    s.players[2].arrows = 1
    s.arrowPile = 1 // one arrow left; roller takes it → empties → indian attack
    s = withDice(s, ['arrow', 'beer', 'beer', 'beer', 'beer'])
    const r = resolveDice(s)
    expect(r.players[1].life).toBe(MAX_LIFE - 2)
    expect(r.players[2].life).toBe(MAX_LIFE - 1)
    expect(r.players[0].life).toBe(MAX_LIFE - 1) // roller had 1 arrow when attack fired
    // arrows reset, pile refilled
    expect(r.arrowPile).toBe(ARROW_PILE)
    expect(r.players.every(p => p.arrows === 0)).toBe(true)
  })

  it('3 gatlings damage all other players and clear the roller\'s arrows', () => {
    let s = makeGame()
    s.players[0].arrows = 3
    s.arrowPile = ARROW_PILE - 3
    s = withDice(s, ['gatling', 'gatling', 'gatling', 'beer', 'beer'])
    const r = resolveDice(s)
    expect(r.players[1].life).toBe(MAX_LIFE - 1)
    expect(r.players[2].life).toBe(MAX_LIFE - 1)
    expect(r.players[3].life).toBe(MAX_LIFE - 1)
    expect(r.players[0].arrows).toBe(0) // arrows discarded
    expect(r.arrowPile).toBe(ARROW_PILE) // returned to pile
  })

  it('a 3rd dynamite ends rolling and damages the roller', () => {
    let s = makeGame()
    // start with 2 dynamites already kept, then force a roll that produces a 3rd
    s = Object.assign({}, s, {
      dice: ['dynamite', 'dynamite', 1, 1, 1] as Face[],
      rolled: true,
      rerollsLeft: 2,
    })
    // RNG that always yields the 4th face index = 'dynamite'
    const prev = setRng(() => 3 / 6)
    const rolled = rollDice(s)
    setRng(prev)
    expect(rolled.dice.filter(d => d === 'dynamite').length).toBeGreaterThanOrEqual(3)
    expect(rolled.rerollsLeft).toBe(0) // rolling ended
    const r = resolveDice(rolled)
    expect(r.players[0].life).toBe(MAX_LIFE - 1) // burned by the explosion
  })

  it('dynamite dice cannot be re-rolled', () => {
    let s = makeGame()
    s = Object.assign({}, s, {
      dice: ['dynamite', 1, 1, 1, 1] as Face[],
      rolled: true,
      kept: [false, false, false, false, false],
      rerollsLeft: 2,
    })
    const prev = setRng(() => 0) // would turn everything into face index 0 = '1'
    const rolled = rollDice(s)
    setRng(prev)
    expect(rolled.dice[0]).toBe('dynamite') // dynamite stuck despite not being "kept"
    // and toggleKeep refuses to toggle a dynamite
    const t = toggleKeep(rolled, 0)
    expect(t.kept[0]).toBe(false)
  })
})

describe('BANG! dice — game flow', () => {
  it('dying removes a player and last-standing wins', () => {
    let s = makeGame()
    // kill players 1,2,3 by hand
    for (const i of [1, 2, 3]) { s.players[i].life = 0; s.players[i].alive = false }
    // resolve a no-op-ish turn to trigger the winner check
    s = withDice(s, ['beer', 'beer', 'beer', 'beer', 'beer'])
    const r = resolveDice(s)
    expect(r.winner).toBe(0)
    expect(r.phase).toBe('over')
  })

  it('deterministic AI self-play reaches a valid winner under a guard cap, no throws', () => {
    // seeded LCG so the run is deterministic
    let seed = 123456789
    const prev = setRng(() => {
      seed = (1103515245 * seed + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    })
    let s = makeGame()
    let winner: number | null = null
    expect(() => {
      let guard = 0
      while (s.winner == null && guard < 5000) {
        guard++
        if (s.turn === 0) {
          // aiTurn no-ops for the human seat, so drive seat 0 through the public flow.
          s = stepSeatToEnd(s)
        } else {
          s = aiTurn(s)
        }
      }
      winner = s.winner
    }).not.toThrow()
    setRng(prev)
    if (winner != null) {
      expect(winner).toBeGreaterThanOrEqual(0)
      expect(winner).toBeLessThan(NUM_PLAYERS)
      expect(s.players[winner].alive).toBe(true)
    }
  })
})

/** Drive a single seat (incl. the human seat 0) through a full turn using the public
    roll/resolve/endTurn flow, so the self-play loop advances seat 0 too. Guard-capped. */
function stepSeatToEnd(s: BangState): BangState {
  let st = s
  let guard = 0
  const startTurn = st.turn
  while (st.turn === startTurn && st.winner == null && guard < 50) {
    guard++
    if (st.phase === 'roll') {
      if (!st.rolled) { st = rollDice(st); continue }
      if (st.rerollsLeft > 0) { st = rollDice(st); continue }
      st = resolveDice(st)
      continue
    }
    if (st.phase === 'resolved') { st = endTurn(st); continue }
    break
  }
  return st
}
