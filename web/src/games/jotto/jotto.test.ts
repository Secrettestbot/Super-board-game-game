import { describe, it, expect } from 'vitest'
import {
  jots,
  isValidWord,
  makeGame,
  guess,
  aiGuess,
  candidatesConsistentWith,
  WORDS,
  MAX_GUESSES,
} from './logic'

describe('jots()', () => {
  it('counts letters in common, position-independent', () => {
    // "stare" vs "rates": same 5 letters -> 5
    expect(jots('stare', 'rates')).toBe(5)
    // "stone" vs "notes": s,t,o,n,e all shared -> 5
    expect(jots('stone', 'notes')).toBe(5)
  })

  it('returns 0 when there are no letters in common (a real, informative result)', () => {
    // block = b,l,o,c,k ; fight = f,i,g,h,t -> disjoint sets
    expect(jots('block', 'fight')).toBe(0)
  })

  it('an exact match scores 5', () => {
    expect(jots('plate', 'plate')).toBe(5)
  })

  it('partial overlap counts the intersection', () => {
    // crane = c,r,a,n,e ; trace = t,r,a,c,e -> shared r,a,c,e = 4
    expect(jots('crane', 'trace')).toBe(4)
  })
})

describe('isValidWord()', () => {
  it('accepts words in the list', () => {
    expect(isValidWord(WORDS[0])).toBe(true)
    expect(isValidWord('plate')).toBe(true)
    expect(isValidWord('PLATE')).toBe(true) // case-insensitive
  })
  it('rejects non-words and wrong-length input', () => {
    expect(isValidWord('zzzzz')).toBe(false)
    expect(isValidWord('cat')).toBe(false)
    expect(isValidWord('abcdef')).toBe(false)
    expect(isValidWord('')).toBe(false)
  })
})

describe('guess()', () => {
  it('a correct guess sets the winner to the guessing player', () => {
    const s = makeGame(['plate', 'crane'])
    // player 0 guesses opponent (player 1) secret "crane" exactly
    const s2 = guess(s, 0, 'crane')
    expect(s2.winner).toBe(0)
    expect(s2.history[0][s2.history[0].length - 1].jots).toBe(5)
  })

  it('records a 0-jot feedback correctly and does not falsely win', () => {
    const s = makeGame(['plate', 'crown']) // opponent secret = crown? no -> "crown"
    const g = guess(s, 0, 'fight') // fight vs crown share nothing
    expect(g.winner).toBe(null)
    expect(g.history[0][0].jots).toBe(0)
  })

  it('alternates turns and ignores out-of-turn guesses', () => {
    const s = makeGame(['plate', 'crane'])
    expect(s.turn).toBe(0)
    const after = guess(s, 0, 'stone')
    expect(after.turn).toBe(1)
    // player 0 trying to move again is a no-op
    expect(guess(after, 0, 'stone')).toBe(after)
  })
})

describe('candidatesConsistentWith()', () => {
  it('filters the list to words matching all past feedback', () => {
    const secret = 'crane'
    const history = [
      { word: 'plate', jots: jots('plate', secret) },
      { word: 'stone', jots: jots('stone', secret) },
    ]
    const list = candidatesConsistentWith(history)
    // every returned candidate must match all feedback
    for (const c of list) {
      expect(jots(c, 'plate')).toBe(history[0].jots)
      expect(jots(c, 'stone')).toBe(history[1].jots)
    }
    // the true secret must still be a candidate
    expect(list).toContain(secret)
    // narrows below the full set
    expect(list.length).toBeLessThan(WORDS.length)
  })
})

describe('aiGuess()', () => {
  it('returns a candidate consistent with the AI feedback so far', () => {
    const s = makeGame(['crane', 'plate']) // player1 (AI) guesses player0 secret "crane"
    // simulate the AI having made one guess
    let st = s
    st = { ...st, turn: 1 } // make it AI's turn
    const g = aiGuess(st)
    expect(g).not.toBe(null)
    expect(WORDS).toContain(g)
  })

  it('only ever proposes consistent candidates as history grows', () => {
    const secret = 'plate' // player 0 secret; AI guesses this
    let st = makeGame([secret, 'crane'])
    st = { ...st, turn: 1 }
    for (let i = 0; i < 5 && st.winner == null; i++) {
      const g = aiGuess(st)
      expect(g).not.toBe(null)
      // consistent with prior AI history
      for (const rec of st.history[1]) {
        expect(jots(g as string, rec.word)).toBe(rec.jots)
      }
      st = guess(st, 1, g as string)
      st = { ...st, turn: 1 } // force AI to keep going for this unit test
    }
  })
})

describe('self-play termination', () => {
  it('both players auto-guessing reach a valid winner under the cap with no throws', () => {
    // deterministic secrets
    let st = makeGame(['crane', 'plate'])
    let safety = 0
    expect(() => {
      while (st.winner == null && safety < MAX_GUESSES * 2 + 4) {
        safety++
        const player = st.turn
        const g = aiGuess(st)
        expect(g).not.toBe(null)
        st = guess(st, player, g as string)
      }
    }).not.toThrow()
    expect(st.winner).not.toBe(null)
    expect(st.winner === 0 || st.winner === 1).toBe(true)
    expect(safety).toBeLessThan(MAX_GUESSES * 2 + 4)
  })

  it('terminates for several random deterministic seed pairs', () => {
    const pairs: [string, string][] = [
      ['stare', 'plate'],
      ['crane', 'mould'],
      ['fight', 'block'],
      ['water', 'vodka'],
    ]
    for (const p of pairs) {
      let st = makeGame(p)
      let n = 0
      while (st.winner == null && n < 200) {
        n++
        const player = st.turn
        const g = aiGuess(st)
        expect(g).not.toBe(null)
        st = guess(st, player, g as string)
      }
      expect(st.winner).not.toBe(null)
    }
  })
})

