/* COLORETTO — logic (built for this codebase, not ported).
   2-player colour-card press-your-luck. A 63-card deck of 7 colours (9 each) plus a few
   "+2" bonus cards and a single "last round" marker near the bottom. Each round there are
   3 row slots, each holding up to 3 cards. On your turn you DRAW the top card and place it
   onto a non-full row, OR TAKE a row (collect its cards into your tableau, sit out the rest
   of the round). A round ends when both players have taken a row; new rows are dealt and play
   continues. When the "last round" marker surfaces while drawing, the current round is the
   last. Scoring: each player's 3 best colours score positively (triangular: 1,3,6,10,15,21
   capped), the rest negatively, +2 cards add flat. Highest total wins. */

export const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'] as const
export type Color = typeof COLORS[number]
export const ROWS = 3        // row slots per round
export const ROW_CAP = 3     // cards per row
export const PER_COLOR = 9
export const BONUS_PLUS2 = 3 // number of "+2" cards
export type Player = 'you' | 'ai'

// A card is either a colour, a flat "+2" bonus, or the "last round" marker.
export type Card =
  | { kind: 'color'; color: Color }
  | { kind: 'plus2' }
  | { kind: 'last' }

export interface LogEntry { t: string; x: string }

export interface Tableau {
  colors: Record<Color, number>
  plus2: number
}

export interface ColorettoState {
  deck: Card[]                 // top of deck = end of array
  rows: Card[][]               // ROWS slots, each up to ROW_CAP cards
  taken: boolean[]            // which row slots have been claimed this round
  done: Record<Player, boolean> // has this player taken a row this round
  tableau: Record<Player, Tableau>
  turn: Player | null
  lastRound: boolean          // the "last round" marker has surfaced
  // pending: 'you' just drew this card and must place it onto a row
  pending: Card | null
  winner: Player | 'draw' | null
  scores: Record<Player, number> | null
  log: LogEntry[]
}

function emptyTableau(): Tableau {
  const colors = {} as Record<Color, number>
  for (const c of COLORS) colors[c] = 0
  return { colors, plus2: 0 }
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

// ===== deck =====
export function buildDeck(): Card[] {
  const cards: Card[] = []
  for (const color of COLORS) for (let i = 0; i < PER_COLOR; i++) cards.push({ kind: 'color', color })
  for (let i = 0; i < BONUS_PLUS2; i++) cards.push({ kind: 'plus2' })
  // shuffle (Fisher–Yates)
  for (let i = cards.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  // place the "last round" marker near the bottom of the deck (drawn last few cards).
  // top of deck is end of the array, so the bottom is index 0..few.
  const pos = Math.min(cards.length, 3 + ((Math.random() * 3) | 0))
  cards.splice(pos, 0, { kind: 'last' })
  return cards
}

export function makeGame(): ColorettoState {
  return {
    deck: buildDeck(),
    rows: Array.from({ length: ROWS }, () => []),
    taken: new Array(ROWS).fill(false),
    done: { you: false, ai: false },
    tableau: { you: emptyTableau(), ai: emptyTableau() },
    turn: 'you',
    lastRound: false,
    pending: null,
    winner: null,
    scores: null,
    log: [{ t: 'sys', x: 'Draw a card onto a row, or take a row and sit out the round. Best 3 colours score; the rest cost you.' }],
  }
}

// ===== scoring =====
// triangular value: nth card adds n, capped so the 6th+ card adds nothing beyond 21.
export function triScore(n: number): number {
  const cap = Math.min(n, 6)
  return (cap * (cap + 1)) / 2  // 1->1,2->3,3->6,4->10,5->15,6->21, and >=6 stays 21
}

// score a single tableau: 3 best colours positive, the rest negative, +2 flat.
export function scoreTableau(t: Tableau): number {
  const vals = COLORS.map(c => triScore(t.colors[c])).filter(v => v > 0)
  vals.sort((a, b) => b - a)
  let total = 0
  vals.forEach((v, i) => { total += i < 3 ? v : -v })
  total += t.plus2 * 2
  return total
}

// ===== helpers =====
export function rowOpen(s: ColorettoState, r: number): boolean {
  return !s.taken[r] && s.rows[r].length < ROW_CAP
}
export function rowTakeable(s: ColorettoState, r: number): boolean {
  return !s.taken[r] && s.rows[r].length > 0
}
function describe(card: Card): string {
  return card.kind === 'color' ? card.color : card.kind === 'plus2' ? '+2' : 'last-round'
}

function other(p: Player): Player { return p === 'you' ? 'ai' : 'you' }

// add the cards of a row into a tableau
function collect(t: Tableau, cards: Card[]): Tableau {
  const colors = { ...t.colors }
  let plus2 = t.plus2
  for (const c of cards) {
    if (c.kind === 'color') colors[c.color]++
    else if (c.kind === 'plus2') plus2++
  }
  return { colors, plus2 }
}

// advance to the next active player, or end the round / game.
function advance(s: ColorettoState, log: LogEntry[]): ColorettoState {
  // if both players are done this round, the round is over.
  if (s.done.you && s.done.ai) {
    if (s.lastRound) return finish(s, log)
    // new round: reset rows + done flags
    return Object.assign({}, s, {
      rows: Array.from({ length: ROWS }, () => []),
      taken: new Array(ROWS).fill(false),
      done: { you: false, ai: false },
      pending: null,
      turn: 'you' as Player,
      log: push(log, 'sys', 'New round — fresh rows dealt.'),
    })
  }
  // hand to the next player who hasn't taken a row yet
  const next = s.done.you ? 'ai' : s.done.ai ? 'you' : other(s.turn as Player)
  let ns = Object.assign({}, s, { turn: next, pending: null, log })
  // if that player has no legal action (deck empty AND no row to take), they're stuck —
  // mark them done for the round so play can resolve. This guarantees termination.
  if (!legalDraw(ns, next) && legalTakeRows(ns, next).length === 0) {
    const done = Object.assign({}, ns.done, { [next]: true })
    const log2 = push(ns.log, 'sys', `${next === 'you' ? 'You have' : 'Rival has'} no move — passing.`)
    return advance(Object.assign({}, ns, { done }), log2)
  }
  return ns
}

function finish(s: ColorettoState, log: LogEntry[]): ColorettoState {
  const you = scoreTableau(s.tableau.you)
  const ai = scoreTableau(s.tableau.ai)
  const winner: Player | 'draw' = you === ai ? 'draw' : you > ai ? 'you' : 'ai'
  const msg = winner === 'draw'
    ? `Dead heat — ${you} to ${ai}.`
    : `${winner === 'you' ? 'You win' : 'Rival wins'} ${Math.max(you, ai)} to ${Math.min(you, ai)}.`
  return Object.assign({}, s, {
    turn: null, pending: null, winner, scores: { you, ai },
    log: push(log, winner === 'you' ? 'you' : 'ai', msg),
  })
}

// ===== actions =====

// DRAW the top card. For a colour/+2 it becomes `pending` and must be placed (player picks
// a row). The "last round" marker is consumed immediately, flagging the final round.
export function draw(s: ColorettoState, who: Player): ColorettoState {
  if (s.winner || s.turn !== who || s.pending || s.done[who]) return s
  if (!s.deck.length) return s
  // ensure there's at least one open row to place onto; if not, drawing is illegal.
  const deck = s.deck.slice()
  const card = deck.pop() as Card
  let log = s.log
  // skip-resolve the last-round marker
  if (card.kind === 'last') {
    log = push(log, 'sys', 'The last-round marker has surfaced — this is the final round!')
    const ns = Object.assign({}, s, { deck, lastRound: true })
    // having flagged the last round, the player still owes an action: draw again.
    return draw(ns, who)
  }
  log = push(log, who, `${who === 'you' ? 'You' : 'Rival'} drew ${describe(card)}.`)
  return Object.assign({}, s, { deck, pending: card, log })
}

// place the pending card onto an open row, ending the player's turn.
export function place(s: ColorettoState, r: number, who: Player): ColorettoState {
  if (s.winner || s.turn !== who || !s.pending) return s
  if (!rowOpen(s, r)) return s
  const rows = s.rows.map((row, i) => i === r ? row.concat([s.pending as Card]) : row)
  const log = push(s.log, who, `${who === 'you' ? 'You' : 'Rival'} placed ${describe(s.pending)} on row ${r + 1}.`)
  const ns = Object.assign({}, s, { rows, pending: null })
  return advance(ns, log)
}

// TAKE a row: collect its cards, mark the player done for this round.
export function take(s: ColorettoState, r: number, who: Player): ColorettoState {
  if (s.winner || s.turn !== who || s.pending || s.done[who]) return s
  if (!rowTakeable(s, r)) return s
  const cards = s.rows[r]
  const tableau = Object.assign({}, s.tableau, { [who]: collect(s.tableau[who], cards) })
  const taken = s.taken.slice(); taken[r] = true
  const done = Object.assign({}, s.done, { [who]: true })
  const rows = s.rows.map((row, i) => i === r ? [] : row)
  const log = push(s.log, who, `${who === 'you' ? 'You' : 'Rival'} took row ${r + 1} (${cards.length} card${cards.length === 1 ? '' : 's'}).`)
  const ns = Object.assign({}, s, { rows, taken, done, tableau })
  return advance(ns, log)
}

// what actions are legal for `who` right now
export function legalDraw(s: ColorettoState, who: Player): boolean {
  return !s.winner && s.turn === who && !s.pending && !s.done[who] && s.deck.length > 0 &&
    s.rows.some((_, r) => rowOpen(s, r))
}
export function legalTakeRows(s: ColorettoState, who: Player): number[] {
  if (s.winner || s.turn !== who || s.pending || s.done[who]) return []
  const out: number[] = []
  for (let r = 0; r < ROWS; r++) if (rowTakeable(s, r)) out.push(r)
  return out
}
export function placeRows(s: ColorettoState, who: Player): number[] {
  if (s.winner || s.turn !== who || !s.pending) return []
  const out: number[] = []
  for (let r = 0; r < ROWS; r++) if (rowOpen(s, r)) out.push(r)
  return out
}

// ===== AI =====
// marginal value to a tableau of adding a set of cards: scoreTableau(after) - before.
function marginalValue(t: Tableau, cards: Card[]): number {
  return scoreTableau(collect(t, cards)) - scoreTableau(t)
}

// the AI's whole turn: decide TAKE vs DRAW, then place greedily.
export function aiStep(s: ColorettoState): ColorettoState {
  if (s.winner || s.turn !== 'ai') return s
  const me: Player = 'ai'

  // resolve a pending card the AI already drew (place it)
  if (s.pending) return aiPlace(s)
  if (s.done.ai) return s // shouldn't happen — advance() skips done players

  const takeable = legalTakeRows(s, me)
  const canDraw = legalDraw(s, me)

  // evaluate each takeable row by marginal value to my tableau.
  let bestTake = -Infinity, bestRow = -1
  for (const r of takeable) {
    const v = marginalValue(s.tableau.ai, s.rows[r])
    if (v > bestTake) { bestTake = v; bestRow = r }
  }

  // decide. Take if it's clearly good, or if we can't draw, or if rows are getting full
  // (forced soon) and the best row is non-negative.
  const rowsFilling = s.rows.filter((row, r) => !s.taken[r] && row.length >= ROW_CAP).length
  const opponentDone = s.done.you

  if (!canDraw && bestRow >= 0) return take(s, bestRow, me)
  if (bestRow >= 0 && (bestTake >= 5 || (!canDraw))) return take(s, bestRow, me)
  if (bestRow >= 0 && opponentDone && bestTake >= 1) return take(s, bestRow, me)
  if (bestRow >= 0 && rowsFilling >= 1 && bestTake >= 1) return take(s, bestRow, me)

  if (canDraw) return draw(s, me)
  if (bestRow >= 0) return take(s, bestRow, me)
  return s
}

// AI placement of its pending card: bait the opponent / avoid helping them; otherwise dump
// onto a thin row, preferring rows where the card is useless to the opponent.
function aiPlace(s: ColorettoState): ColorettoState {
  const me: Player = 'ai', card = s.pending as Card
  const rows = placeRows(s, me)
  if (!rows.length) {
    // no open row — fall back to taking the best takeable row (shouldn't normally occur)
    const tk = legalTakeRows(s, me)
    if (tk.length) return take(s, tk[0], me)
    return s
  }
  // value of putting this card onto each row, judged by how much it would help the OPPONENT
  // if they took it (we want to minimise that), tie-broken toward thinner rows.
  let bestRow = rows[0], bestScore = Infinity
  for (const r of rows) {
    const oppGain = marginalValue(s.tableau.you, s.rows[r].concat([card]))
    const myGain = marginalValue(s.tableau.ai, s.rows[r].concat([card]))
    // prefer rows that help the opponent least; if a row helps ME (a colour I want), keep it
    // thin so I can still take it — bias by myGain too.
    const thin = s.rows[r].length
    const score = oppGain * 1.0 - myGain * 0.6 + thin * 0.25
    if (score < bestScore) { bestScore = score; bestRow = r }
  }
  return place(s, bestRow, me)
}
