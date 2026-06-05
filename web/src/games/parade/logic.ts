/* PARADE — pure logic (built for this codebase, not ported).

   An Alice-in-Wonderland card-shedding game. LOWEST score wins.

   Deck: 66 cards — six colors numbered 0..10 (one of each per color).
   A "parade" line of 6 cards starts face up. Each of the 3 players holds 5 cards.

   On your turn you play 1 card from hand to the END of the parade. Its number N
   makes the FIRST N cards of the parade "safe" (immune). Among the REMAINING cards
   (those past the first N), the played card captures every card that is either the
   SAME COLOR as the played card OR has value <= the played card's value. Captured
   cards go face-down into that player's collected pile (penalty points). Then you
   draw 1 to refill to 5.

   Game-end trigger: a player collects all six colors, OR the deck runs out. Then
   everyone (starting with the next player) plays ONE more turn WITHOUT drawing.
   Finally each player discards down to 2 cards in hand and adds those 2 to their
   collected pile.

   Scoring per color: whoever has the MOST cards of that color (ties for most BOTH
   count as majority) scores 1 point per such card; everyone else scores the FACE
   VALUE of their cards in that color. Sum all -> lowest total wins. */

export const COLORS = ['red', 'blue', 'green', 'purple', 'orange', 'teal'] as const
export type Color = typeof COLORS[number]
export const HAND_SIZE = 5
export const PARADE_START = 6
export const NUM_PLAYERS = 3
export const VALUES = 11 // 0..10

export interface Card {
  id: number      // unique 0..65
  color: Color
  value: number   // 0..10
}

export interface LogEntry { t: string; x: string }

export interface State {
  deck: Card[]                 // face-down draw pile; draw from the END
  parade: Card[]               // face-up line, front (safe end) at index 0
  hands: Card[][]              // per-seat hand
  collected: Card[][]          // per-seat captured pile (penalty cards)
  turn: number | null          // seat to act (0..2); null when game over
  you: number                  // human seat
  phase: 'play' | 'final' | 'over'
  finalRemaining: number       // turns left in the final lap (counts down)
  triggerSeat: number | null   // who tripped the end trigger
  winner: number | null        // winning seat (lowest score); null until over
  log: LogEntry[]
}

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

export function name(seat: number, you: number): string {
  if (seat === you) return 'You'
  return seat === (you + 1) % NUM_PLAYERS ? 'Alice' : 'Hatter'
}

const shuffle = <T,>(a: T[]): T[] => {
  const r = a.slice()
  for (let i = r.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

/** Build the full 66-card deck in a fixed order (color-major, value 0..10). */
export function fullDeck(): Card[] {
  const cards: Card[] = []
  let id = 0
  for (const color of COLORS) {
    for (let v = 0; v < VALUES; v++) cards.push({ id: id++, color, value: v })
  }
  return cards
}

/**
 * Create a new game. Pass an explicit `deck` (already in draw order, draw from END)
 * for deterministic tests; otherwise the full deck is shuffled.
 */
export function makeGame(deck?: Card[]): State {
  const full = deck ? deck.slice() : shuffle(fullDeck())
  // Deal: parade gets PARADE_START cards; each player HAND_SIZE.
  const hands: Card[][] = Array.from({ length: NUM_PLAYERS }, () => [])
  for (let i = 0; i < HAND_SIZE; i++) {
    for (let p = 0; p < NUM_PLAYERS; p++) hands[p].push(full.shift()!)
  }
  const parade: Card[] = []
  for (let i = 0; i < PARADE_START; i++) parade.push(full.shift()!)
  // remaining `full` becomes the deck; we draw from the END.
  return {
    deck: full,
    parade,
    hands,
    collected: Array.from({ length: NUM_PLAYERS }, () => []),
    turn: 0,
    you: 0,
    phase: 'play',
    finalRemaining: 0,
    triggerSeat: null,
    winner: null,
    log: [{ t: 'sys', x: 'The parade begins. Play a card to the end of the line — its number is how many leaders march on untouched.' }],
  }
}

/**
 * Given the current parade and a card about to be played to its END, return the
 * indices (into `parade`) of the cards that would be CAPTURED. The first N cards
 * (N = played.value) are safe; among the rest, capture any with same color OR
 * value <= played.value.
 */
export function capturedIndices(parade: Card[], played: Card): number[] {
  const n = played.value
  const out: number[] = []
  for (let i = n; i < parade.length; i++) {
    const c = parade[i]
    if (c.color === played.color || c.value <= played.value) out.push(i)
  }
  return out
}

/** Pure helper: which cards a play would capture (for AI/UI preview). */
export function previewCapture(s: State, seat: number, handIndex: number): Card[] {
  const card = s.hands[seat]?.[handIndex]
  if (card == null) return []
  return capturedIndices(s.parade, card).map(i => s.parade[i])
}

const distinctColors = (cards: Card[]): number => new Set(cards.map(c => c.color)).size

/** Whether a seat's collected pile already holds all six colors. */
export function hasAllColors(cards: Card[]): boolean {
  return distinctColors(cards) === COLORS.length
}

/**
 * Play a card from `seat`'s hand to the end of the parade, resolve captures, refill,
 * and advance the turn / handle end-trigger + final lap. Returns a new State.
 * Illegal calls (wrong seat, game over, bad index) return the state unchanged.
 */
export function playCard(s: State, seat: number, handIndex: number): State {
  if (s.phase === 'over' || s.winner != null) return s
  if (s.turn !== seat) return s
  const hand = s.hands[seat]
  const card = hand[handIndex]
  if (card == null) return s

  const newHand = hand.slice(0, handIndex).concat(hand.slice(handIndex + 1))
  const capIdx = new Set(capturedIndices(s.parade, card))
  const captured: Card[] = []
  const remainingParade: Card[] = []
  s.parade.forEach((c, i) => {
    if (capIdx.has(i)) captured.push(c)
    else remainingParade.push(c)
  })
  // The played card joins the END of the parade.
  remainingParade.push(card)

  const hands = s.hands.map((h, p) => (p === seat ? newHand : h))
  const collected = s.collected.map((pile, p) => (p === seat ? pile.concat(captured) : pile))

  let log = s.log
  const who = name(seat, s.you)
  if (captured.length) {
    log = push(log, seat === s.you ? 'you' : 'ai', `${who} played the ${card.color} ${card.value} and captured ${captured.length} card${captured.length > 1 ? 's' : ''}.`)
  } else {
    log = push(log, seat === s.you ? 'you' : 'ai', `${who} played the ${card.color} ${card.value} — the parade marches on untouched.`)
  }

  let next: State = Object.assign({}, s, { hands, collected, parade: remainingParade, log })

  // ----- end-of-turn handling -----
  if (next.phase === 'final') {
    // Final lap: no draw. Decrement remaining; when it hits 0, run discard-2 + score.
    const remaining = next.finalRemaining - 1
    if (remaining <= 0) {
      return finishGame(next)
    }
    const turn = (seat + 1) % NUM_PLAYERS
    return Object.assign({}, next, { finalRemaining: remaining, turn })
  }

  // Normal play: refill to HAND_SIZE by drawing from the deck END.
  const deck = next.deck.slice()
  const drewToEmpty = (() => {
    if (next.hands[seat].length < HAND_SIZE && deck.length > 0) {
      const drawn = deck.pop()!
      next.hands[seat] = next.hands[seat].concat([drawn])
    }
    return deck.length === 0
  })()
  next = Object.assign({}, next, { deck })

  // ----- end-trigger checks -----
  const collectedAll = hasAllColors(next.collected[seat])
  if (collectedAll || drewToEmpty) {
    const reason = collectedAll
      ? `${who} has collected all six colours!`
      : 'The deck has run dry.'
    const log2 = push(next.log, 'sys', `${reason} One final lap — no more drawing.`)
    // Final lap: each of the OTHER players takes one turn (NUM_PLAYERS - 1 turns).
    return Object.assign({}, next, {
      phase: 'final',
      finalRemaining: NUM_PLAYERS - 1,
      triggerSeat: seat,
      turn: (seat + 1) % NUM_PLAYERS,
      log: log2,
    })
  }

  const turn = (seat + 1) % NUM_PLAYERS
  return Object.assign({}, next, { turn })
}

/**
 * End of the final lap: each player discards down to 2 cards in hand (the discarded
 * cards JOIN their collected pile), then we score and pick the lowest-total winner.
 */
export function finishGame(s: State): State {
  // Each player keeps 2 in hand, the rest (everything beyond 2) goes to collected.
  // We have no per-player "best discard" rule specified; discard the 2 LOWEST-risk
  // (keep the highest 2 by value to minimise penalty added — but everything added is
  // penalty either way). Simpler & fair: add ALL but the 2 chosen-to-keep. We keep
  // the 2 cards that ADD THE LEAST when scored is ambiguous; standard Parade lets a
  // player choose — here we keep the 2 highest-value cards (so the LOWER values get
  // added as penalty, which is the smaller face cost). This is a fixed, deterministic
  // rule so tests are stable.
  const collected = s.collected.map((pile, p) => {
    const hand = s.hands[p].slice().sort((a, b) => a.value - b.value)
    const toCollect = hand.slice(0, Math.max(0, hand.length - 2)) // all but the 2 highest
    return pile.concat(toCollect)
  })
  const hands = s.hands.map(h => {
    const sorted = h.slice().sort((a, b) => a.value - b.value)
    return sorted.slice(Math.max(0, sorted.length - 2)) // the 2 highest kept (display only)
  })
  const scored = Object.assign({}, s, { collected, hands, phase: 'over' as const, turn: null })
  const sc = scores(scored)
  let winner = 0
  for (let p = 1; p < NUM_PLAYERS; p++) if (sc[p] < sc[winner]) winner = p
  const log = push(scored.log, scored.winner === scored.you ? 'you' : 'ai',
    `Final scores — ${sc.map((v, p) => `${name(p, scored.you)} ${v}`).join(' · ')}. ${name(winner, scored.you)} win${winner === scored.you ? '' : 's'} (lowest).`)
  return Object.assign({}, scored, { winner, log })
}

/**
 * Score the game. For each color, the player(s) with the MOST cards of that color
 * (ties for most all count as majority) score 1 per card in that color; everyone
 * else scores the sum of face values. Returns per-seat totals.
 */
export function scores(s: State): number[] {
  const totals = new Array(NUM_PLAYERS).fill(0)
  for (const color of COLORS) {
    // per-seat: count and face-sum of this color
    const counts = new Array(NUM_PLAYERS).fill(0)
    const faceSum = new Array(NUM_PLAYERS).fill(0)
    for (let p = 0; p < NUM_PLAYERS; p++) {
      for (const c of s.collected[p]) {
        if (c.color === color) { counts[p]++; faceSum[p] += c.value }
      }
    }
    const max = Math.max(...counts)
    // Majority requires holding at least one card (count > 0). If nobody holds the
    // color, max is 0 and no one is penalised.
    for (let p = 0; p < NUM_PLAYERS; p++) {
      if (counts[p] === 0) continue
      if (counts[p] === max) totals[p] += counts[p]      // majority -> 1 each
      else totals[p] += faceSum[p]                        // others -> face value
    }
  }
  return totals
}

/** Per-color breakdown for the UI: counts, whether the seat has majority, and points. */
export function colorBreakdown(s: State, seat: number): { color: Color; count: number; majority: boolean; points: number }[] {
  return COLORS.map(color => {
    const counts = s.collected.map(pile => pile.filter(c => c.color === color).length)
    const faceSum = s.collected[seat].filter(c => c.color === color).reduce((a, c) => a + c.value, 0)
    const count = counts[seat]
    const max = Math.max(...counts)
    const majority = count > 0 && count === max
    const points = count === 0 ? 0 : majority ? count : faceSum
    return { color, count, majority, points }
  })
}

/**
 * AI: choose the hand card that captures the FEWEST penalty points right now, lightly
 * penalising a play that would give the AI a fresh BAD color majority (a majority where
 * its face value would otherwise have been high). Deterministic given the state.
 */
export function aiPick(s: State, seat: number): number {
  const hand = s.hands[seat]
  if (!hand.length) return -1
  let bestIdx = 0
  let bestScore = Infinity
  for (let i = 0; i < hand.length; i++) {
    const card = hand[i]
    const cap = capturedIndices(s.parade, card).map(idx => s.parade[idx])
    // primary cost: total face value of captured cards (penalty weight)
    let cost = cap.reduce((a, c) => a + c.value, 0)
    // plus a small per-card cost so capturing many low cards isn't "free"
    cost += cap.length * 0.6
    // light future-risk term: cards that newly tip a color into a high-value majority
    // for us are mildly worse. Approximate by counting captured cards per color we'd
    // be piling onto an already-owned color.
    const myColorCount: Record<string, number> = {}
    for (const c of s.collected[seat]) myColorCount[c.color] = (myColorCount[c.color] || 0) + 1
    for (const c of cap) {
      const owned = myColorCount[c.color] || 0
      if (owned >= 2) cost += 0.4 // deepening an already-heavy color
    }
    // playing a card removes it from hand; a tiny tiebreak prefers shedding high cards
    // (so they can't be captured later / left to discard), but keep it light.
    cost -= card.value * 0.02
    if (cost < bestScore) { bestScore = cost; bestIdx = i }
  }
  return bestIdx
}

/** Convenience for the UI/tests: have the AI take its full turn. */
export function aiStep(s: State): State {
  if (s.turn == null || s.turn === s.you || s.winner != null || s.phase === 'over') return s
  const seat = s.turn
  const idx = aiPick(s, seat)
  if (idx < 0) return s
  return playCard(s, seat, idx)
}

/** Total cards anywhere — must stay 66 for conservation tests. */
export function totalCards(s: State): number {
  return s.deck.length + s.parade.length +
    s.hands.reduce((a, h) => a + h.length, 0) +
    s.collected.reduce((a, c) => a + c.length, 0)
}
