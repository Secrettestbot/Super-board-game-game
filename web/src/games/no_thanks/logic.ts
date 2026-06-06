/* NO THANKS! — logic (built for this codebase, not ported).
   Deck of number cards 3..35; NINE are removed at random (unseen). Each of two players
   starts with 11 chips. A card is flipped face-up; on your turn you either pay 1 chip onto
   the card to pass ("no thanks") or take the card plus every chip on it, then flip the next.
   Play runs until the deck is empty. Score = sum of taken cards (a run of consecutive numbers
   counts only its LOWEST card) minus your chips. Lowest score wins. */

export type Who = 'you' | 'ai'
export interface LogEntry { t: string; x: string }

export interface NoThanksState {
  deck: number[]          // remaining face-down cards (next flip is deck[deck.length-1])
  card: number | null     // current face-up card
  pot: number             // chips piled on the face-up card
  chips: Record<Who, number>
  taken: Record<Who, number[]>   // each player's collected cards (kept sorted ascending)
  turn: Who | null
  winner: Who | 'tie' | null
  you: Who
  log: LogEntry[]
}

export const LOW = 3, HIGH = 35, REMOVED = 9, START_CHIPS = 11

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

const shuffle = <T,>(a: T[]): T[] => {
  const r = a.slice()
  for (let i = r.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[r[i], r[j]] = [r[j], r[i]] }
  return r
}

export function makeGame(): NoThanksState {
  // full 3..35, remove 9 at random, the rest is the deck (33 - 9 = 24 cards)
  const full: number[] = []
  for (let v = LOW; v <= HIGH; v++) full.push(v)
  const deck = shuffle(full).slice(REMOVED)   // 24 cards left, face-down
  const card = deck.pop()!                     // flip the first card
  const first: Who = Math.random() < 0.5 ? 'you' : 'ai'
  return {
    deck, card, pot: 0,
    chips: { you: START_CHIPS, ai: START_CHIPS },
    taken: { you: [], ai: [] },
    turn: first, winner: null, you: 'you',
    log: [{ t: 'sys', x: `Card flipped — ${card}. ${first === 'you' ? 'You decide first.' : 'The rival decides first.'} Pay a chip to pass, or take it.` }],
  }
}

const other = (w: Who): Who => w === 'you' ? 'ai' : 'you'
const name = (w: Who): string => w === 'you' ? 'You' : 'Rival'

/** Group a sorted ascending hand into runs of consecutive numbers. */
export function runs(cards: number[]): number[][] {
  const sorted = cards.slice().sort((a, b) => a - b)
  const out: number[][] = []
  for (const c of sorted) {
    const last = out[out.length - 1]
    if (last && c === last[last.length - 1] + 1) last.push(c)
    else out.push([c])
  }
  return out
}

/** Run-aware score for one player: sum the LOWEST card of each run, minus chips. */
export function scoreHand(cards: number[], chips: number): number {
  let sum = 0
  for (const run of runs(cards)) sum += run[0]
  return sum - chips
}

export function scores(s: NoThanksState): Record<Who, number> {
  return {
    you: scoreHand(s.taken.you, s.chips.you),
    ai: scoreHand(s.taken.ai, s.chips.ai),
  }
}

function finish(s: NoThanksState, base: Partial<NoThanksState>, log: LogEntry[]): NoThanksState {
  const next = Object.assign({}, s, base, { turn: null, log }) as NoThanksState
  const sc = scores(next)
  const winner: Who | 'tie' = sc.you === sc.ai ? 'tie' : sc.you < sc.ai ? 'you' : 'ai'
  const msg = winner === 'tie'
    ? `Deck empty — a dead tie at ${sc.you}.`
    : `Deck empty — ${winner === 'you' ? 'you win' : 'rival wins'} ${Math.min(sc.you, sc.ai)} to ${Math.max(sc.you, sc.ai)}.`
  return Object.assign({}, next, { winner, log: push(log, winner === 'you' ? 'you' : 'ai', msg) })
}

/** Flip the next card (or end the game if the deck is empty). `holder` keeps the turn. */
function flipNext(s: NoThanksState, base: Partial<NoThanksState>, holder: Who, log: LogEntry[]): NoThanksState {
  const deck = (base.deck ?? s.deck).slice()
  if (!deck.length) return finish(s, Object.assign({}, base, { card: null, pot: 0, deck }), log)
  const card = deck.pop()!
  const l2 = push(log, 'sys', `Next card — ${card}.`)
  return Object.assign({}, s, base, { deck, card, pot: 0, turn: holder, log: l2 }) as NoThanksState
}

/** Pay one chip to pass. Illegal (returns state unchanged) with 0 chips. */
export function pass(s: NoThanksState, who: Who): NoThanksState {
  if (s.winner || s.turn !== who || s.card === null) return s
  if (s.chips[who] <= 0) return s
  const chips = Object.assign({}, s.chips, { [who]: s.chips[who] - 1 })
  const log = push(s.log, who === 'you' ? 'you' : 'ai', `${name(who)} said no thanks — a chip onto ${s.card} (${s.pot + 1} now).`)
  return Object.assign({}, s, { chips, pot: s.pot + 1, turn: other(who), log })
}

/** Take the face-up card plus all chips on it, then flip the next card. */
export function take(s: NoThanksState, who: Who): NoThanksState {
  if (s.winner || s.turn !== who || s.card === null) return s
  const taken = Object.assign({}, s.taken, { [who]: s.taken[who].concat([s.card]).sort((a, b) => a - b) })
  const chips = Object.assign({}, s.chips, { [who]: s.chips[who] + s.pot })
  const log = push(s.log, who === 'you' ? 'you' : 'ai', `${name(who)} took ${s.card}${s.pot ? ` and ${s.pot} chip${s.pot > 1 ? 's' : ''}` : ''}.`)
  return flipNext(s, { taken, chips }, who, log)
}

/** Marginal cost of the current card to `who`: card value minus the pot, but a card that
    extends (or bridges) a run already held is worth only the new low end it creates. */
export function marginalCost(s: NoThanksState, who: Who): number {
  if (s.card === null) return Infinity
  const c = s.card
  const held = new Set(s.taken[who])
  // A card adjacent to one already held adds nothing to the run total (or even lowers it).
  if (held.has(c - 1) || held.has(c + 1)) {
    // connecting below an existing run replaces that run's old low with c → adds c, drops old.
    if (held.has(c + 1) && !held.has(c - 1)) {
      // find the top of the existing run starting at c+1; new low is c, old low was c+1 → net +1 face
      return 1 - s.pot
    }
    // extends above a run, or bridges a gap → adds essentially nothing to the counted score
    return -s.pot
  }
  return c - s.pot
}

/** AI decision: take when the card is cheap (or beneficial), or when it's low on chips and the
    pot makes the card attractive; otherwise pay a chip to pass. */
export function aiStep(s: NoThanksState): NoThanksState {
  if (s.winner || s.turn !== 'ai' || s.card === null) return s
  const me: Who = 'ai'
  const cost = marginalCost(s, me)
  const chips = s.chips[me]

  // Must take if we can't pay.
  if (chips <= 0) return take(s, me)

  // A connecting/cheap card with chips on it is a clear take.
  if (cost <= 0) return take(s, me)

  // The pot grows as opponents pass; once it nearly covers the card it's worth grabbing.
  // Threshold scales down as the AI's chip stack thins (it must conserve chips).
  const threshold = chips <= 3 ? 7 : chips <= 6 ? 5 : 3
  if (cost <= threshold) return take(s, me)

  return pass(s, me)
}
