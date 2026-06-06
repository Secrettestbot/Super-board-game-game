/* LOST CITIES — logic (built for this codebase, not ported).
   A 2-player expedition game. A 60-card deck of 5 coloured suits; each suit has number cards
   2..10 plus three handshake/wager cards (W). You and the rival each hold 8 cards and own 5
   expedition columns (one per colour); 5 discard piles are shared. A turn = PLAY a card to one
   of your expeditions (strictly ascending; wagers before any number) OR DISCARD it to its
   colour pile; then DRAW from the deck or the top of a discard pile. Game ends when the deck
   empties. Each started expedition scores: (sum of numbers − 20) × (1 + wagers), +20 if it
   has 8+ cards. Higher total wins. Immutable, no DOM. */

export const COLOURS = ['Y', 'B', 'W', 'G', 'R'] as const
export type Colour = typeof COLOURS[number]
export type Player = 'you' | 'ai'

// A card: wager cards have value 0, number cards 2..10.
export interface Card { id: number; colour: Colour; value: number } // value 0 = wager
export const isWager = (c: Card) => c.value === 0

export interface LogEntry { t: string; x: string }

export interface LostCitiesState {
  deck: Card[]                                   // draw pile (top = end of array)
  hands: Record<Player, Card[]>                  // 8 cards each (until deck runs dry)
  expeditions: Record<Player, Record<Colour, Card[]>>  // your started expeditions
  discards: Record<Colour, Card[]>               // shared, top = end of array
  turn: Player | null
  phase: 'play' | 'draw'                         // play a card, then draw
  you: Player
  winner: Player | 'draw' | null
  log: LogEntry[]
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }
const emptyCols = (): Record<Colour, Card[]> => ({ Y: [], B: [], W: [], G: [], R: [] })

export function buildDeck(): Card[] {
  const deck: Card[] = []
  let id = 0
  for (const colour of COLOURS) {
    for (let v = 2; v <= 10; v++) deck.push({ id: id++, colour, value: v })
    for (let k = 0; k < 3; k++) deck.push({ id: id++, colour, value: 0 })
  }
  return deck
}

function shuffle<T>(a: T[]): T[] {
  const arr = a.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function makeGame(): LostCitiesState {
  const full = shuffle(buildDeck())
  const youHand = full.slice(0, 8)
  const aiHand = full.slice(8, 16)
  const deck = full.slice(16)
  return {
    deck,
    hands: { you: youHand, ai: aiHand },
    expeditions: { you: emptyCols(), ai: emptyCols() },
    discards: emptyCols(),
    turn: 'you',
    phase: 'play',
    you: 'you',
    winner: null,
    log: [{ t: 'sys', x: 'Mount expeditions in ascending order. Each one costs 20 to start; wagers multiply. Highest total wins.' }],
  }
}

// ===== Rules =====

// Top number card already laid on an expedition (ignoring wagers, which are always below).
export function topNumber(col: Card[]): number {
  let top = 0
  for (const c of col) if (!isWager(c) && c.value > top) top = c.value
  return top
}

// Can `card` legally be placed onto expedition `col`?
export function canPlay(col: Card[], card: Card): boolean {
  if (isWager(card)) {
    // wagers must come before any numbered card of that colour
    return col.every(isWager)
  }
  const top = topNumber(col)
  return card.value > top // strictly ascending; first number can be anything >= 2 > 0
}

export function colCount(s: LostCitiesState, p: Player): number {
  let n = 0
  for (const c of COLOURS) n += s.expeditions[p][c].length
  return n
}

// Score one expedition column. Empty (unstarted) => 0.
export function scoreColumn(col: Card[]): number {
  if (col.length === 0) return 0
  let wagers = 0, sum = 0
  for (const c of col) { if (isWager(c)) wagers++; else sum += c.value }
  let score = (sum - 20) * (1 + wagers)
  if (col.length >= 8) score += 20
  return score
}

export function score(s: LostCitiesState, p: Player): number {
  let total = 0
  for (const c of COLOURS) total += scoreColumn(s.expeditions[p][c])
  return total
}

export function colourScores(s: LostCitiesState, p: Player): Record<Colour, number> {
  const out = emptyCols() as unknown as Record<Colour, number>
  for (const c of COLOURS) out[c] = scoreColumn(s.expeditions[p][c])
  return out
}

const NAME = (p: Player) => p === 'you' ? 'You' : 'The rival'
const COLNAME: Record<Colour, string> = { Y: 'Yellow', B: 'Blue', W: 'White', G: 'Green', R: 'Red' }
function label(c: Card) { return isWager(c) ? `${COLNAME[c.colour]} wager` : `${COLNAME[c.colour]} ${c.value}` }

function endIfDone(s: LostCitiesState, log: LogEntry[]): LostCitiesState {
  if (s.deck.length > 0) return Object.assign({}, s, { log })
  const ys = score(s, 'you'), as = score(s, 'ai')
  const winner: Player | 'draw' = ys === as ? 'draw' : ys > as ? 'you' : 'ai'
  const msg = winner === 'draw'
    ? `The deck is spent — a dead heat at ${ys}.`
    : `The deck is spent — ${winner === 'you' ? 'you win' : 'the rival wins'} ${Math.max(ys, as)} to ${Math.min(ys, as)}.`
  return Object.assign({}, s, { turn: null, phase: 'play', winner, log: push(log, winner === 'you' ? 'you' : 'ai', msg) })
}

// ===== Actions ===== (all return a new state; illegal => unchanged)

function removeFromHand(hand: Card[], id: number): Card[] { return hand.filter(c => c.id !== id) }

export function playCard(s: LostCitiesState, p: Player, id: number): LostCitiesState {
  if (s.winner || s.turn !== p || s.phase !== 'play') return s
  const card = s.hands[p].find(c => c.id === id)
  if (!card) return s
  const col = s.expeditions[p][card.colour]
  if (!canPlay(col, card)) return s
  const expeditions = Object.assign({}, s.expeditions, {
    [p]: Object.assign({}, s.expeditions[p], { [card.colour]: col.concat([card]) }),
  })
  const hands = Object.assign({}, s.hands, { [p]: removeFromHand(s.hands[p], id) })
  const log = push(s.log, p === 'you' ? 'you' : 'ai', `${NAME(p)} mounted ${label(card)}.`)
  return Object.assign({}, s, { expeditions, hands, phase: 'draw', log })
}

export function discardCard(s: LostCitiesState, p: Player, id: number): LostCitiesState {
  if (s.winner || s.turn !== p || s.phase !== 'play') return s
  const card = s.hands[p].find(c => c.id === id)
  if (!card) return s
  const discards = Object.assign({}, s.discards, { [card.colour]: s.discards[card.colour].concat([card]) })
  const hands = Object.assign({}, s.hands, { [p]: removeFromHand(s.hands[p], id) })
  const log = push(s.log, p === 'you' ? 'you' : 'ai', `${NAME(p)} discarded ${label(card)}.`)
  return Object.assign({}, s, { discards, hands, phase: 'draw', log })
}

export function drawDeck(s: LostCitiesState, p: Player): LostCitiesState {
  if (s.winner || s.turn !== p || s.phase !== 'draw') return s
  if (s.deck.length === 0) return s
  const deck = s.deck.slice()
  const card = deck.pop()!
  const hands = Object.assign({}, s.hands, { [p]: s.hands[p].concat([card]) })
  const log = push(s.log, 'sys', `${NAME(p)} drew from the deck.`)
  const next = other(p)
  const t = Object.assign({}, s, { deck, hands, turn: next, phase: 'play' as const })
  return endIfDone(t, log)
}

export function drawDiscard(s: LostCitiesState, p: Player, colour: Colour): LostCitiesState {
  if (s.winner || s.turn !== p || s.phase !== 'draw') return s
  const pile = s.discards[colour]
  if (pile.length === 0) return s
  const np = pile.slice()
  const card = np.pop()!
  const discards = Object.assign({}, s.discards, { [colour]: np })
  const hands = Object.assign({}, s.hands, { [p]: s.hands[p].concat([card]) })
  const log = push(s.log, 'sys', `${NAME(p)} took ${label(card)} from the discards.`)
  const next = other(p)
  const t = Object.assign({}, s, { discards, hands, turn: next, phase: 'play' as const })
  return endIfDone(t, log)
}

const other = (p: Player): Player => p === 'you' ? 'ai' : 'you'

// ===== AI: greedy expected-value heuristic =====
// Commits to expeditions only when they project to score (>= ~20 of numbers so the −20 pays);
// plays ascending efficiently; uses wagers only where the expedition already looks strong;
// discards the least-wanted card, preferring not to hand the opponent a useful card;
// draws a useful discard if it clearly helps, else from the deck.

// Potential remaining value a colour can still earn from this hand if committed.
function colourPotential(hand: Card[], colour: Colour, existing: Card[]): { numbers: number; wagers: number; sum: number } {
  const top = topNumber(existing)
  let numbers = 0, wagers = 0, sum = 0
  for (const c of hand) {
    if (c.colour !== colour) continue
    if (isWager(c)) { if (existing.every(isWager)) { wagers++ } }
    else if (c.value > top) { numbers++; sum += c.value }
  }
  return { numbers, wagers, sum }
}

// Is it worthwhile (EV-positive-ish) to be in this expedition?
function worthwhile(s: LostCitiesState, p: Player, colour: Colour): boolean {
  const existing = s.expeditions[p][colour]
  const here = existing.reduce((a, c) => a + c.value, 0)
  const pot = colourPotential(s.hands[p], colour, existing)
  // total numbers we can plausibly lay (already-laid + still-in-hand)
  const projected = here + pot.sum
  // need to clear the 20 entry cost — be a touch more forgiving once already committed
  if (existing.length > 0) return projected >= 18
  return projected >= 20
}

interface Move {
  kind: 'play' | 'discard'
  id: number
  colour: Colour
  value: number
}

export function aiTurn(s: LostCitiesState): LostCitiesState {
  if (s.winner || s.turn !== 'ai' || s.phase !== 'play') return s
  const p: Player = 'ai'
  const hand = s.hands[p]

  // ---- choose the play/discard ----
  const playMoves: { id: number; gain: number; card: Card }[] = []
  for (const card of hand) {
    const col = s.expeditions[p][card.colour]
    if (!canPlay(col, card)) continue
    if (!worthwhile(s, p, card.colour)) continue
    // gain estimate: a wager only counts if the expedition is strong; a number adds its value.
    let gain: number
    if (isWager(card)) {
      const pot = colourPotential(hand, card.colour, col)
      const here = col.reduce((a, c) => a + c.value, 0)
      gain = (here + pot.sum) >= 24 ? 8 : -2  // wagers only when strong
    } else {
      gain = card.value
    }
    playMoves.push({ id: card.id, gain, card })
  }

  let acted: LostCitiesState
  if (playMoves.length) {
    playMoves.sort((a, b) => b.gain - a.gain)
    const best = playMoves[0]
    if (best.gain > 0) {
      acted = playCard(s, p, best.id)
    } else {
      acted = discardLeast(s, p)
    }
  } else {
    acted = discardLeast(s, p)
  }
  if (acted === s) {
    // nothing playable AND discardLeast somehow no-op'd — discard first card as fallback
    if (hand.length) acted = discardCard(s, p, hand[0].id)
  }
  if (acted.phase !== 'draw') return acted // safety

  // ---- choose the draw ----
  // Take a useful discard only if it advances/strengthens a worthwhile expedition cheaply.
  let bestColour: Colour | null = null, bestVal = 0
  for (const colour of COLOURS) {
    const pile = acted.discards[colour]
    if (!pile.length) continue
    const top = pile[pile.length - 1]
    const col = acted.expeditions[p][colour]
    if (!canPlay(col, top)) continue
    if (!worthwhile(acted, p, colour)) continue
    const v = isWager(top) ? 3 : top.value
    if (v > bestVal) { bestVal = v; bestColour = colour }
  }
  if (bestColour && bestVal >= 6) return drawDiscard(acted, p, bestColour)
  return drawDeck(acted, p)
}

function discardLeast(s: LostCitiesState, p: Player): LostCitiesState {
  const hand = s.hands[p]
  if (!hand.length) return s
  // prefer discarding a card that the opponent is least likely to want:
  // pick the lowest number card of a colour we can't profitably pursue; wagers last.
  const ranked = hand.slice().sort((a, b) => discardScore(s, p, a) - discardScore(s, p, b))
  return discardCard(s, p, ranked[0].id)
}

// Lower = better to discard.
function discardScore(s: LostCitiesState, p: Player, card: Card): number {
  // wagers are valuable to keep -> high score (discard last)
  if (isWager(card)) return 100
  const col = s.expeditions[p][card.colour]
  const playable = canPlay(col, card)
  const want = worthwhile(s, p, card.colour)
  let v = card.value
  if (playable && want) v += 50          // don't throw away cards we want
  // throwing a high card the opponent might use is slightly worse
  return v
}
