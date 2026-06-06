import { describe, it, expect } from 'vitest'
import {
  feedback,
  isValidWord,
  makeGame,
  guess,
  aiGuess,
  candidatesFor,
  WORD_LIST,
  MAX_GUESSES,
} from './logic'
import type { Color } from './logic'

describe('feedback()', () => {
  it('marks greens, yellows, and greys on a simple case', () => {
    // secret "crane", guess "trace":
    // t -> not in crane -> grey
    // r -> in crane, pos1 of crane is r? crane: c r a n e ; trace: t r a c e
    //   pos0 t grey; pos1 r==r green; pos2 a==a green; pos3 c in crane wrong pos -> yellow;
    //   pos4 e==e green
    expect(feedback('trace', 'crane')).toEqual<Color[]>([
      'grey', 'green', 'green', 'yellow', 'green',
    ])
  })

  it('marks letters not in the word grey', () => {
    // secret "crane", guess "blimp": none of b,l,i,m,p are in crane
    expect(feedback('blimp', 'crane')).toEqual<Color[]>([
      'grey', 'grey', 'grey', 'grey', 'grey',
    ])
  })

  it('handles duplicate guess letters when secret has only one', () => {
    // secret "abide" (one b), guess "babes":
    // a b i d e ... guess: b a b e s
    // pos0 b: secret pos0 is a -> not green; b appears once in secret (pos1), not yet used -> yellow
    // pos1 a: secret pos1 is b -> not green; a in secret(pos0) -> yellow
    // pos2 b: green? secret pos2 is i -> no. b remaining? already consumed by pos0 -> grey
    // pos3 e: secret pos3 is d -> no green; e in secret(pos4) -> yellow
    // pos4 s: not in secret -> grey
    expect(feedback('babes', 'abide')).toEqual<Color[]>([
      'yellow', 'yellow', 'grey', 'yellow', 'grey',
    ])
  })

  it('a duplicate guess letter turns green at the right spot and grey for the surplus', () => {
    // secret "eagle" (two e's), guess "geese": g e e s e
    // secret: e a g l e
    // pos0 g: secret pos0 e -> not green; g in secret(pos2) -> yellow
    // pos1 e: secret pos1 a -> not green; e remaining (two e's) -> yellow
    // pos2 e: secret pos2 g -> not green; e remaining (one left) -> yellow
    // pos3 s: not in secret -> grey
    // pos4 e: secret pos4 e -> green
    // greens assigned first: pos4 e green consumes one e; remaining e count = 1.
    // then yellows L->R: pos1 e -> yellow (consumes last e); pos2 e -> grey (none left)
    expect(feedback('geese', 'eagle')).toEqual<Color[]>([
      'yellow', 'yellow', 'grey', 'grey', 'green',
    ])
  })
})

describe('isValidWord()', () => {
  it('accepts words in the list (case-insensitive)', () => {
    expect(isValidWord(WORD_LIST[0])).toBe(true)
    expect(isValidWord('crane')).toBe(true)
    expect(isValidWord('CRANE')).toBe(true)
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
    const s = makeGame('crane')
    const s2 = guess(s, 0, 'crane')
    expect(s2.winner).toBe(0)
    expect(s2.history[0][0].feedback.every((c) => c === 'green')).toBe(true)
  })

  it('a wrong guess does not win and alternates the turn', () => {
    const s = makeGame('crane')
    expect(s.turn).toBe(0)
    const s2 = guess(s, 0, 'blimp')
    expect(s2.winner).toBe(null)
    expect(s2.turn).toBe(1)
    // out-of-turn guess is a no-op
    expect(guess(s2, 0, 'crane')).toBe(s2)
  })
})

describe('candidatesFor()', () => {
  it('filters the list to words matching all feedback, and keeps the true secret', () => {
    const secret = 'crane'
    const history = [
      { word: 'slate', feedback: feedback('slate', secret) },
      { word: 'brick', feedback: feedback('brick', secret) },
    ]
    const list = candidatesFor(history)
    for (const c of list) {
      expect(feedback('slate', c)).toEqual(history[0].feedback)
      expect(feedback('brick', c)).toEqual(history[1].feedback)
    }
    expect(list).toContain(secret)
    expect(list.length).toBeLessThan(WORD_LIST.length)
  })
})

describe('aiGuess()', () => {
  it('returns a candidate consistent with the AI feedback so far', () => {
    const secret = 'crane'
    let st = makeGame(secret)
    st = { ...st, turn: 1 }
    const g = aiGuess(st)
    expect(g).not.toBe(null)
    expect(WORD_LIST).toContain(g)
  })

  it('only ever proposes words consistent with its own prior feedback', () => {
    const secret = 'plant'
    let st = makeGame(secret)
    st = { ...st, turn: 1 }
    for (let i = 0; i < 5 && st.winner == null; i++) {
      const g = aiGuess(st)
      expect(g).not.toBe(null)
      for (const rec of st.history[1]) {
        expect(feedback(rec.word, g as string)).toEqual(rec.feedback)
      }
      st = guess(st, 1, g as string)
      st = { ...st, turn: 1 } // force the AI to keep going for this unit test
    }
  })
})

describe('self-play termination', () => {
  it('both racers auto-guessing reach a valid result under the cap with no throws', () => {
    let st = makeGame('crane')
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
    // valid outcome: player 0, player 1, or -1 draw
    expect(st.winner === 0 || st.winner === 1 || st.winner === -1).toBe(true)
    expect(safety).toBeLessThanOrEqual(MAX_GUESSES * 2 + 4)
  })

  it('terminates for several deterministic secrets', () => {
    const secrets = ['stare', 'plant', 'block', 'vodka', 'mouse', 'ghost']
    for (const sec of secrets) {
      let st = makeGame(sec)
      let n = 0
      while (st.winner == null && n < MAX_GUESSES * 2 + 4) {
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
