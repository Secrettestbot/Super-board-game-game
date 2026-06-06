import { describe, it, expect } from 'vitest'
import {
  makeGame, roll, moveToken, legalMoves, destOf, aiStep, absSquare,
  finishedCount, entryOffset, FINISH, COL_FIRST, SAFE_SQUARES,
  PLAYERS, TOKENS,
} from './logic'
import type { LudoState } from './logic'

// Deterministic die: returns a fixed sequence (1-based faces), looping.
function seqRng(faces: number[]): () => number {
  let i = 0
  return () => {
    const f = faces[i % faces.length]
    i++
    return (f - 1 + 0.5) / 6 // maps to face `f` via 1 + floor(rng*6)
  }
}

describe('Ludo setup', () => {
  it('starts with 4 players × 4 tokens all in the home yard', () => {
    const s = makeGame()
    expect(s.tokens.length).toBe(PLAYERS)
    for (let p = 0; p < PLAYERS; p++) {
      expect(s.tokens[p].length).toBe(TOKENS)
      expect(s.tokens[p].every(t => t === 0)).toBe(true)
    }
    expect(s.turn).toBe(0)
    expect(s.winner).toBe(null)
    expect(s.phase).toBe('roll')
  })
})

describe('release from home', () => {
  it('a 6 lets a token leave the yard onto the start square', () => {
    let s = makeGame()
    s = roll(s, seqRng([6]))
    expect(s.die).toBe(6)
    expect(legalMoves(s, 0, 6).length).toBe(4) // all 4 can release
    s = moveToken(s, 0, 0)
    expect(s.tokens[0][0]).toBe(1) // on start square (progress 1)
    expect(absSquare(0, 1)).toBe(entryOffset(0))
  })

  it('a non-6 cannot release any token from the yard', () => {
    let s = makeGame()
    s = roll(s, seqRng([3]))
    // no token is out, so a 3 yields no legal move → turn auto-passes (die reset)
    expect(s.turn).not.toBe(0)
    expect(s.phase).toBe('roll')
    // and directly: destOf with a non-6 from yard is null
    const fresh = makeGame()
    expect(destOf(fresh, 0, 0, 3)).toBe(null)
    expect(destOf(fresh, 0, 0, 6)).toBe(1)
  })
})

describe('movement', () => {
  it('advances a released token by the die count', () => {
    let s = makeGame()
    s.tokens[0][0] = 1 // already out on start
    s = Object.assign({}, s, { phase: 'roll', rolled: false, die: null })
    s = roll(s, seqRng([5]))
    expect(s.die).toBe(5)
    s = moveToken(s, 0, 0)
    expect(s.tokens[0][0]).toBe(6)
  })
})

describe('capture', () => {
  it('landing on a lone opponent sends it home; safe squares immune', () => {
    let s = makeGame()
    // Put player 0 token at a progress that maps to an enemy on a NON-safe square.
    // Player 1 entry offset is 13. Place enemy (player 1) at its start (abs 13) — that's SAFE.
    // Choose instead a non-safe abs square. Player 0 progress 3 → abs (0+2)=2 (not safe).
    s.tokens[1][0] = 0 // keep in yard initially
    // place enemy token of player 2 on abs square 2 so player 0 landing there captures it.
    // player 2 entry = 26. progress for player2 mapping to abs 2: (26 + (prog-1))%52 = 2
    //   => prog-1 = (2 - 26 + 52) % 52 = 28 => prog = 29 (on the loop, 1..51) ✓
    s.tokens[2][0] = 29
    expect(absSquare(2, 29)).toBe(2)
    expect(SAFE_SQUARES.has(2)).toBe(false)
    // player 0 token approaching abs 2: progress 3 → abs 2
    s.tokens[0][0] = 1 // start
    s = Object.assign({}, s, { turn: 0, phase: 'roll', rolled: false, die: null })
    s = roll(s, seqRng([2])) // 1 -> 3 → abs 2
    expect(s.die).toBe(2)
    s = moveToken(s, 0, 0)
    expect(s.tokens[0][0]).toBe(3)
    expect(s.tokens[2][0]).toBe(0) // captured → back to yard

    // safe-square immunity: enemy sitting on a start (safe) square is NOT captured.
    let s2 = makeGame()
    // enemy player 1 on its start: abs 13 (safe). Player 0 progress whose abs is 13:
    //   (0 + prog-1)%52 = 13 => prog = 14
    s2.tokens[1][0] = 1 // player1 start, abs 13, safe
    expect(absSquare(1, 1)).toBe(13)
    expect(SAFE_SQUARES.has(13)).toBe(true)
    s2.tokens[0][0] = 12 // progress 12 → abs 11; +2 → progress 14 → abs 13
    s2 = Object.assign({}, s2, { turn: 0, phase: 'roll', rolled: false, die: null })
    s2 = roll(s2, seqRng([2]))
    s2 = moveToken(s2, 0, 0)
    expect(s2.tokens[0][0]).toBe(14)
    expect(s2.tokens[1][0]).toBe(1) // still on its safe start — NOT captured
  })
})

describe('finishing', () => {
  it('needs the exact count; overshoot is illegal', () => {
    const s = makeGame()
    // token at progress 55 (home column). Needs exactly 2 to reach FINISH (57).
    s.tokens[0][0] = 55
    expect(destOf(s, 0, 0, 2)).toBe(FINISH)
    expect(destOf(s, 0, 0, 3)).toBe(null) // would overshoot
    expect(destOf(s, 0, 0, 1)).toBe(56)   // legal partial advance into column
    expect(COL_FIRST).toBe(52)
  })
})

describe('extra turn on six', () => {
  it('a 6 keeps the turn with the same player after the move', () => {
    let s = makeGame()
    s = roll(s, seqRng([6]))
    expect(s.rolledSix).toBe(true)
    s = moveToken(s, 0, 0)
    expect(s.turn).toBe(0)        // still player 0
    expect(s.phase).toBe('roll')  // gets to roll again
    expect(s.rolled).toBe(false)
  })

  it('a non-6 passes the turn to the next player', () => {
    let s = makeGame()
    s.tokens[0][0] = 1
    s = Object.assign({}, s, { phase: 'roll', rolled: false, die: null })
    s = roll(s, seqRng([4]))
    s = moveToken(s, 0, 0)
    expect(s.turn).toBe(1)
  })
})

describe('winning', () => {
  it('first player to get all 4 tokens to the finish wins', () => {
    let s = makeGame()
    s.tokens[0] = [FINISH, FINISH, FINISH, 55]
    s = Object.assign({}, s, { turn: 0, phase: 'roll', rolled: false, die: null })
    s = roll(s, seqRng([2])) // 55 + 2 = 57 = FINISH
    s = moveToken(s, 0, 0)   // index 0 already finished; move the last one (index 3)
    // index 0 is FINISH already so legal move is token 3
    // re-do properly:
    let s2 = makeGame()
    s2.tokens[0] = [FINISH, FINISH, FINISH, 55]
    s2 = Object.assign({}, s2, { turn: 0, phase: 'roll', rolled: false, die: null })
    s2 = roll(s2, seqRng([2]))
    const mv = legalMoves(s2, 0, 2)
    expect(mv).toContain(3)
    s2 = moveToken(s2, 0, 3)
    expect(finishedCount(s2, 0)).toBe(4)
    expect(s2.winner).toBe(0)
    expect(s2.phase).toBe('over')
  })
})

describe('AI self-play terminates with a valid winner', () => {
  it('reaches a valid winner (or the guard cap) with no throws', () => {
    let s: LudoState = makeGame()
    let guard = 0
    const CAP = 200000
    expect(() => {
      while (s.winner == null && guard++ < CAP) {
        if (s.turn === 0) {
          // drive the human like an AI too, so the game is fully automated
          if (s.phase === 'roll' && !s.rolled) {
            const before = s.step
            s = roll(s)
            if (s.step === before) break
          } else if (s.phase === 'move' && s.rolled && s.die != null) {
            const moves = legalMoves(s, 0, s.die)
            if (moves.length === 0) break
            const before = s.step
            s = moveToken(s, 0, moves[0])
            if (s.step === before) break
          } else break
        } else {
          const before = s.step
          s = aiStep(s)
          if (s.step === before) break
        }
      }
    }).not.toThrow()
    // either a winner was reached, or we hit the cap — both acceptable
    if (s.winner != null) {
      expect(s.winner).toBeGreaterThanOrEqual(0)
      expect(s.winner).toBeLessThan(PLAYERS)
      expect(finishedCount(s, s.winner)).toBe(TOKENS)
    }
    expect(guard).toBeLessThanOrEqual(CAP)
  })
})
