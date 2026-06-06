import { describe, it, expect } from 'vitest'
import * as BL from './logic'
import type { Card, BattleLineState, Seat } from './logic'

// Pure-logic tests (no DOM). Builds known trios for formation ranking, exercises the play cap
// and the claim "opponent can't beat it" proof, checks both win conditions, then self-plays a
// full game to a valid winner (or clean cap) with card conservation.

const card = (id: number, colour: BL.Colour, value: number): Card => ({ id, colour, value })

describe('battle line — formations', () => {
  it('ranks wedge > phalanx > battalion > skirmish > host on known trios', () => {
    const wedge = [card(0, 'R', 4), card(1, 'R', 5), card(2, 'R', 6)]      // straight flush
    const phalanx = [card(3, 'R', 7), card(4, 'G', 7), card(5, 'B', 7)]    // trips
    const battalion = [card(6, 'B', 2), card(7, 'B', 5), card(8, 'B', 9)]  // flush
    const skirmish = [card(9, 'R', 4), card(10, 'G', 5), card(11, 'B', 6)] // straight
    const host = [card(12, 'R', 2), card(13, 'G', 5), card(14, 'B', 9)]    // nothing

    expect(BL.formationCategory(wedge)).toBe(5)
    expect(BL.formationCategory(phalanx)).toBe(4)
    expect(BL.formationCategory(battalion)).toBe(3)
    expect(BL.formationCategory(skirmish)).toBe(2)
    expect(BL.formationCategory(host)).toBe(1)

    const order = [wedge, phalanx, battalion, skirmish, host].map(BL.formationRank)
    for (let i = 0; i < order.length - 1; i++) {
      expect(BL.compareRank(order[i], order[i + 1])).toBeGreaterThan(0)
    }
  })

  it('breaks ties by sum within the same category', () => {
    const lowHost = [card(0, 'R', 1), card(1, 'G', 2), card(2, 'B', 3)] // host, sum 6 (but run? 1,2,3 -> skirmish)
    const a = [card(0, 'R', 2), card(1, 'G', 4), card(2, 'B', 9)]       // host sum 15
    const b = [card(3, 'R', 2), card(4, 'G', 4), card(5, 'B', 6)]       // host sum 12
    expect(BL.formationCategory(a)).toBe(1)
    expect(BL.formationCategory(b)).toBe(1)
    expect(BL.compareRank(BL.formationRank(a), BL.formationRank(b))).toBeGreaterThan(0)
    // sanity: a 1-2-3 of mixed colours is a skirmish, not a host
    expect(BL.formationCategory(lowHost)).toBe(2)
  })
})

describe('battle line — plays & cap', () => {
  it('respects the 3-per-side flag cap and rejects illegal plays', () => {
    let s = BL.makeGame(BL.buildDeck())
    // Give seat 0 a controlled hand by directly placing — use playCard from the dealt hand.
    const seat: Seat = 0
    const hand0 = s.hands[seat].slice()
    // Play three cards from the hand to flag 0.
    s = BL.playCard(s, seat, hand0[0], 0)
    s = BL.drawCard(s, 0)           // pass to seat 1
    // seat 1 plays somewhere, pass back
    const aiMove = s.hands[1][0]
    s = BL.playCard(s, 1, aiMove, 5)
    s = BL.drawCard(s, 1)
    // seat 0 again
    s = BL.playCard(s, 0, s.hands[0][0], 0)
    s = BL.drawCard(s, 0)
    s = BL.playCard(s, 1, s.hands[1][0], 5)
    s = BL.drawCard(s, 1)
    s = BL.playCard(s, 0, s.hands[0][0], 0)
    expect(s.flags[0].you.length).toBe(3)
    // Side now full — a fourth play is rejected (and it isn't our turn / wrong phase anyway).
    const before = s
    s = BL.playCard(s, 0, s.hands[0][0], 0)
    expect(s).toBe(before)
    expect(BL.legalPlays(before, 0)).not.toContain(0)
  })
})

// Helper: build a state with a single contested flag by hand, leaving deck/hands controlled.
function staged(flagSetup: (f: BL.Flag) => void): BattleLineState {
  const s = BL.makeGame(BL.buildDeck())
  const f = s.flags[3]
  flagSetup(f)
  return s
}

describe('battle line — claiming', () => {
  it('claims when both sides complete and ours is stronger', () => {
    const s = staged(f => {
      f.you = [card(100, 'R', 8), card(101, 'R', 9), card(102, 'R', 10)] // wedge
      f.foe = [card(103, 'B', 3), card(104, 'B', 6), card(105, 'B', 9)]  // battalion
      f.completed = { you: 1, foe: 2 }
    })
    expect(BL.canClaim(s, 3, 0)).toBe(true)
    expect(BL.canClaim(s, 3, 1)).toBe(false)
  })

  it('proves the opponent cannot beat a complete formation with unseen cards', () => {
    // Our formation is the top wedge R 8-9-10. The opponent (incomplete) literally cannot beat a
    // category-5 / sum-27 formation: max wedge is 8-9-10 in any colour = sum 27, which ties not
    // beats, and they haven't completed -> we still win. So claim allowed.
    const s = staged(f => {
      f.you = [card(170, 'R', 8), card(171, 'R', 9), card(172, 'R', 10)]
      f.foe = [card(180, 'B', 1)] // incomplete
      f.completed = { you: 5, foe: null }
    })
    expect(BL.canClaim(s, 3, 0)).toBe(true)
  })

  it('forbids a premature claim when the opponent could still beat us', () => {
    // Our formation is a weak host; opponent has one card and could draw a winning formation.
    const s = staged(f => {
      f.you = [card(190, 'R', 1), card(191, 'G', 2), card(192, 'B', 4)] // not 1-2-3 (no 3) -> host? 1,2,4 host
      f.foe = []
      f.completed = { you: 6, foe: null }
    })
    expect(BL.formationCategory(s.flags[3].you)).toBe(1)
    expect(BL.canClaim(s, 3, 0)).toBe(false)
  })
})

describe('battle line — winning', () => {
  it('wins on 3 ADJACENT flags', () => {
    let s = BL.makeGame(BL.buildDeck())
    s = { ...s, flags: s.flags.map((f, i) => (i >= 2 && i <= 4 ? { ...f, claimedBy: 0 as Seat } : f)) }
    s = BL.checkWin(s)
    expect(s.winner).toBe(0)
  })

  it('does NOT win on 3 non-adjacent flags, but DOES on 5 total', () => {
    let s = BL.makeGame(BL.buildDeck())
    // claim flags 0,2,4,6 (non-adjacent) -> 4 total, no breakthrough, no win
    s = { ...s, flags: s.flags.map((f, i) => ([0, 2, 4, 6].includes(i) ? { ...f, claimedBy: 1 as Seat } : f)) }
    s = BL.checkWin(s)
    expect(s.winner).toBeNull()
    // add an 8th -> 5 total, win (8 is not adjacent to 6 since 7 is open)
    s = { ...s, flags: s.flags.map((f, i) => (i === 8 ? { ...f, claimedBy: 1 as Seat } : f)) }
    s = BL.checkWin(s)
    expect(s.winner).toBe(1)
  })
})

describe('battle line — self play', () => {
  it('plays a full game to a valid winner (or clean cap) with no throws and 60-card conservation', () => {
    let s = BL.makeGame()
    let guard = 0
    const CAP = 4000

    function totalCards(st: BattleLineState): number {
      let n = st.deck.length + st.hands[0].length + st.hands[1].length
      for (const f of st.flags) n += f.you.length + f.foe.length
      return n
    }
    expect(totalCards(s)).toBe(60)

    while (s.winner == null && guard < CAP) {
      guard++
      if (s.turn === 1) {
        s = BL.aiTurn(s)
        continue
      }
      // seat 0 (human) — drive with a simple greedy policy.
      if (s.phase === 'play') {
        // Claim anything claimable first.
        let claimed = false
        for (let i = 0; i < s.flags.length; i++) {
          if (s.flags[i].claimedBy == null && BL.canClaim(s, i, 0)) {
            s = BL.claimFlag(s, i, 0)
            claimed = true
            break
          }
        }
        if (claimed) continue
        const targets = BL.legalPlays(s, 0)
        if (s.hands[0].length > 0 && targets.length > 0) {
          s = BL.playCard(s, 0, s.hands[0][0], targets[0])
        } else {
          s = BL.drawCard(s, 0)
        }
      } else {
        s = BL.drawCard(s, 0)
      }
    }

    expect(guard).toBeLessThan(CAP)
    expect(totalCards(s)).toBe(60)
    // Either a valid seat won, or the game cleanly ran out with no winner — both acceptable.
    if (s.winner != null) {
      expect([0, 1]).toContain(s.winner)
    } else {
      // deck spent & hands empty if no winner emerged
      expect(s.deck.length).toBe(0)
    }
  })
})
