import { describe, it, expect } from 'vitest'
import {
  makeGame, boardLayout, buildLayout, CORNERS, N, SIZE,
  legalCellsForCard, detectSequences, play, removeChip, aiTurn,
  isTwoEyedJack, isOneEyedJack, cellsForCard,
} from './logic'
import type { Card, SeqState, Player } from './logic'

const C = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit })

describe('board layout', () => {
  it('has 96 card cells (48x2) and 4 free corners = 100 total', () => {
    expect(boardLayout.length).toBe(N)
    const free = boardLayout.filter(c => c.free).length
    const cards = boardLayout.filter(c => !c.free).length
    expect(free).toBe(4)
    expect(cards).toBe(96)
  })

  it('places free cells exactly at the four corners', () => {
    for (const corner of CORNERS) expect(boardLayout[corner].free).toBe(true)
    expect(CORNERS).toEqual([0, SIZE - 1, N - SIZE, N - 1])
  })

  it('each non-jack card appears exactly twice on the board', () => {
    const counts = new Map<string, number>()
    for (const cell of buildLayout()) {
      if (cell.free) continue
      expect(cell.card.rank).not.toBe('J')
      const k = cell.card.rank + cell.card.suit
      counts.set(k, (counts.get(k) || 0) + 1)
    }
    expect(counts.size).toBe(48)
    for (const v of counts.values()) expect(v).toBe(2)
  })
})

describe('placement legality', () => {
  it('legalCellsForCard returns the two matching empty cells for a normal card', () => {
    const s = makeGame({ seed: 1 })
    const some = boardLayout.find(c => !c.free)! as { free: false; card: Card }
    const card = some.card
    const both = cellsForCard(card)
    expect(both.length).toBe(2)
    const legal = legalCellsForCard(s, card, 0)
    expect(legal.sort()).toEqual(both.slice().sort())
  })

  it('a two-eyed jack can be placed on ANY empty non-corner cell', () => {
    const s = makeGame({ seed: 2 })
    const jack = C('J', 'D') // diamond = two-eyed
    expect(isTwoEyedJack(jack)).toBe(true)
    const legal = legalCellsForCard(s, jack, 0)
    // 96 card cells all empty at start, corners excluded
    expect(legal.length).toBe(96)
    for (const i of legal) expect(CORNERS.includes(i)).toBe(false)
  })
})

describe('one-eyed jack removal', () => {
  it('removes an opponent chip that is not part of a completed sequence', () => {
    let s = makeGame({ seed: 3 })
    // Put an AI (player 1) chip on a known empty cell manually.
    const target = boardLayout.findIndex(c => !c.free)
    s = { ...s, chips: s.chips.map((c, i) => (i === target ? (1 as Player) : c)) }
    const jack = C('J', 'S') // spade = one-eyed
    expect(isOneEyedJack(jack)).toBe(true)
    // Give player 0 the jack in hand.
    s = { ...s, hands: [s.hands[0].concat([jack]), s.hands[1]] }
    const legal = legalCellsForCard(s, jack, 0)
    expect(legal).toContain(target)
    const after = removeChip(s, 0, jack, target)
    expect(after.chips[target]).toBe(null)
    expect(after.turn).toBe(1) // turn passed
  })

  it('cannot remove a chip locked in a completed sequence', () => {
    let s = makeGame({ seed: 4 })
    const target = boardLayout.findIndex(c => !c.free)
    s = {
      ...s,
      chips: s.chips.map((c, i) => (i === target ? (1 as Player) : c)),
      locked: s.locked.map((l, i) => (i === target ? true : l)),
    }
    const jack = C('J', 'H') // heart = one-eyed
    const legal = legalCellsForCard(s, jack, 0)
    expect(legal).not.toContain(target)
  })
})

describe('sequence detection', () => {
  it('finds a 5-in-a-row that uses a corner cell as wild', () => {
    let s = makeGame({ seed: 5 })
    // Corner 0 is at (0,0). Fill (0,1)..(0,4) with player 0 chips → 5-in-a-row incl corner.
    const chips = s.chips.slice()
    for (let c = 1; c <= 4; c++) chips[c] = 0 as Player
    const runs = detectSequences(chips, 0)
    const usesCorner = runs.some(run => run.includes(0) && run.length === 5)
    expect(usesCorner).toBe(true)
  })

  it('completing two sequences sets the winner', () => {
    let s = makeGame({ seed: 6 })
    // Build two separate horizontal 5-runs of player 0 chips on rows 2 and 4
    // (avoid corners/locked interplay). Place 4 chips, then play the 5th via play().
    const chips = s.chips.slice()
    // Row 2 cells (20..24): chips at 20,21,22,23; we'll fill 24 with a card play.
    for (const i of [20, 21, 22, 23]) chips[i] = 0 as Player
    // Row 4 cells (40..44): chips at 40,41,42,43; 44 via play.
    for (const i of [40, 41, 42, 43]) chips[i] = 0 as Player
    s = { ...s, chips }
    // Card that lands on cell 24:
    const cell24 = boardLayout[24]
    const cell44 = boardLayout[44]
    if (cell24.free || cell44.free) { expect(true).toBe(true); return }
    // Manufacture: give player the two needed cards and clear the matching twin cells so the
    // only legal landing is 24 / 44 respectively isn't required; play() just needs cell legal.
    const card24 = cell24.card
    const card44 = cell44.card
    // ensure twin of 24 is occupied so only 24 is open (not required, but keep clean)
    s = { ...s, hands: [[card24, card44], s.hands[1]], turn: 0 }
    s = play(s, 0, card24, 24)
    // after first sequence player still 0's... turn passed to 1; force back for test
    s = { ...s, turn: 0 }
    s = play(s, 0, card44, 44)
    expect(s.sequences[0]).toBeGreaterThanOrEqual(2)
    expect(s.winner).toBe(0)
  })
})

describe('self-play', () => {
  it('runs a full game to a valid winner (or full board) under a guard cap with no throws', () => {
    let s = makeGame({ seed: 12345 })
    let guard = 0
    expect(() => {
      while (s.winner == null && !s.draw && guard < 2000) {
        guard++
        s = s.turn === 1 ? aiTurn(s) : playerZeroMove(s)
      }
    }).not.toThrow()
    // Terminated well within the cap.
    expect(guard).toBeLessThan(2000)
    // Ended in a valid terminal state: a real winner, or a clean draw (deck exhausted, tied).
    const terminal = s.winner != null || s.draw
    expect(terminal).toBe(true)
    if (s.winner != null) expect([0, 1]).toContain(s.winner)
  })
})

// A minimal legal mover for player 0 used only in self-play: plays the first card with a
// legal cell (prefers completing/placing), removes with a one-eyed jack if that's all, else
// swaps a dead card / passes. Keeps the game advancing deterministically.
function playerZeroMove(s: SeqState): SeqState {
  const me: Player = 0
  const hand = s.hands[me]
  // try a normal/wild placement
  for (const card of hand) {
    if (isOneEyedJack(card)) continue
    const cells = legalCellsForCard(s, card, me)
    if (cells.length > 0) return play(s, me, card, cells[0])
  }
  // one-eyed jack removal
  for (const card of hand) {
    if (!isOneEyedJack(card)) continue
    const cells = legalCellsForCard(s, card, me)
    if (cells.length > 0) return removeChip(s, me, card, cells[0])
  }
  // nothing legal: pass turn by handing to player 1
  return { ...s, turn: 1 as Player }
}
