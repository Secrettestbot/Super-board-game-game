/* ONITAMA — logic + AI (built for this codebase, not ported).
   5x5 board. You are the BOTTOM side (Blue), the AI is the TOP side (Red). Each side has a
   MASTER (centre of the back row) and 4 STUDENTS. Movement is dictated by CARDS: each card is a
   set of (dr,dc) offsets from the mover's perspective. For the bottom player "forward" is up
   (negative row); the top player uses the SAME card MIRRORED (negate dr & dc). On your turn you
   pick one of your 2 cards, a piece, and a destination; the used card goes to the MIDDLE and you
   take the card that was there. If you have no legal move you must still swap a card (a pass).
   Win by capturing the enemy Master (Way of the Stone) or landing your Master on the enemy's
   temple — the centre of their back row (Way of the Stream). The AI is alpha-beta minimax. */

export const N = 5
export type Side = 'you' | 'ai'        // bottom = you, top = ai
export type Kind = 'master' | 'student'
export interface Piece { side: Side; kind: Kind }
export type Cell = Piece | null
export interface LogEntry { t: string; x: string }

// A move card: name + offsets from the mover's perspective (dr<0 == forward for bottom player).
export interface Card { name: string; moves: [number, number][] }

export interface Move {
  card: string                 // card name used
  from: number                 // source index
  to: number                   // destination index
  capture: Kind | null         // what was captured, if anything
}

export interface OnitamaState {
  board: Cell[]                // length 25, index = r*5 + c
  hands: { you: string[]; ai: string[] }  // each holds exactly 2 card names
  middle: string              // the neutral middle card name
  turn: Side | null
  winner: Side | null
  last: { from: number; to: number } | null
  log: LogEntry[]
}

const idx = (r: number, c: number) => r * N + c
const inBounds = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N
const other = (s: Side): Side => (s === 'you' ? 'ai' : 'you')

// Temples: bottom player's temple = bottom-row centre (you start Master there);
// the enemy temple a YOU master must reach is the TOP-row centre, and vice-versa.
export const YOU_TEMPLE = idx(N - 1, 2)   // 22 — bottom centre (your home / ai's target)
export const AI_TEMPLE = idx(0, 2)        // 2  — top centre (ai's home / your target)

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

// ===== Move-card definitions (classic Onitama set) =====
// Offsets are from the BOTTOM player's perspective: dr = -1 is one step forward (up).
export const CARDS: Card[] = [
  { name: 'Tiger', moves: [[-2, 0], [1, 0]] },
  { name: 'Crab', moves: [[-1, 0], [0, -2], [0, 2]] },
  { name: 'Monkey', moves: [[-1, -1], [-1, 1], [1, -1], [1, 1]] },
  { name: 'Crane', moves: [[-1, 0], [1, -1], [1, 1]] },
  { name: 'Dragon', moves: [[-1, -2], [-1, 2], [1, -1], [1, 1]] },
  { name: 'Elephant', moves: [[-1, -1], [-1, 1], [0, -1], [0, 1]] },
  { name: 'Mantis', moves: [[-1, -1], [-1, 1], [1, 0]] },
  { name: 'Boar', moves: [[-1, 0], [0, -1], [0, 1]] },
  { name: 'Frog', moves: [[-1, -1], [0, -2], [1, 1]] },
  { name: 'Goose', moves: [[-1, -1], [0, -1], [0, 1], [1, 1]] },
  { name: 'Horse', moves: [[-1, 0], [0, -1], [1, 0]] },
  { name: 'Eel', moves: [[-1, -1], [0, 1], [1, -1]] },
  { name: 'Rabbit', moves: [[-1, 1], [0, 2], [1, -1]] },
  { name: 'Rooster', moves: [[-1, 1], [0, -1], [0, 1], [1, -1]] },
  { name: 'Ox', moves: [[-1, 0], [0, 1], [1, 0]] },
  { name: 'Cobra', moves: [[-1, 1], [0, -1], [1, 1]] },
]

const CARD_BY_NAME = new Map(CARDS.map(c => [c.name, c]))
export function cardByName(name: string): Card { return CARD_BY_NAME.get(name)! }

/** A card's offsets as the given side actually moves them. The TOP player (ai) mirrors. */
export function effectiveOffsets(card: Card, side: Side): [number, number][] {
  if (side === 'you') return card.moves
  return card.moves.map(([dr, dc]) => [-dr, -dc] as [number, number])
}

function shuffle<T>(a: T[]): T[] {
  const out = a.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function makeGame(): OnitamaState {
  const board: Cell[] = new Array(N * N).fill(null)
  // Top row = ai back row (r=0); bottom row = you back row (r=4). Master on centre.
  for (let c = 0; c < N; c++) {
    board[idx(0, c)] = { side: 'ai', kind: c === 2 ? 'master' : 'student' }
    board[idx(N - 1, c)] = { side: 'you', kind: c === 2 ? 'master' : 'student' }
  }
  const deck = shuffle(CARDS.map(c => c.name)).slice(0, 5)
  return {
    board,
    hands: { you: [deck[0], deck[1]], ai: [deck[2], deck[3]] },
    middle: deck[4],
    turn: 'you',           // bottom player goes first
    winner: null,
    last: null,
    log: [{ t: 'sys', x: 'You are Blue and move first. Use a card to move; the used card swaps to the middle.' }],
  }
}

/** All legal moves for `side` with the cards currently in their hand. */
export function legalMoves(s: OnitamaState, side: Side): Move[] {
  const out: Move[] = []
  const hand = s.hands[side]
  for (let i = 0; i < N * N; i++) {
    const p = s.board[i]
    if (!p || p.side !== side) continue
    const r = (i / N) | 0, c = i % N
    for (const cardName of hand) {
      const card = cardByName(cardName)
      for (const [dr, dc] of effectiveOffsets(card, side)) {
        const nr = r + dr, nc = c + dc
        if (!inBounds(nr, nc)) continue
        const dest = s.board[idx(nr, nc)]
        if (dest && dest.side === side) continue   // own piece blocks
        out.push({ card: cardName, from: i, to: idx(nr, nc), capture: dest ? dest.kind : null })
      }
    }
  }
  return out
}

function swapCard(hand: string[], used: string, middle: string): { hand: string[]; middle: string } {
  const nh = hand.slice()
  const pos = nh.indexOf(used)
  nh[pos] = middle
  return { hand: nh, middle: used }
}

function winnerAfter(board: Cell[], mover: Side, m: Move): Side | null {
  // Way of the Stone: captured the enemy master.
  if (m.capture === 'master') return mover
  // Way of the Stream: a master landed on the enemy temple.
  const moved = board[m.to]
  if (moved && moved.kind === 'master') {
    const target = mover === 'you' ? AI_TEMPLE : YOU_TEMPLE
    if (m.to === target) return mover
  }
  return null
}

/** Apply a move for `side`. Used card swaps to the middle. Returns a new state. */
export function applyMove(s: OnitamaState, side: Side, m: Move): OnitamaState {
  if (s.winner || s.turn !== side) return s
  const board = s.board.slice()
  const piece = board[m.from]!
  board[m.to] = piece
  board[m.from] = null
  const sw = swapCard(s.hands[side], m.card, s.middle)
  const hands = { ...s.hands, [side]: sw.hand }
  const winner = winnerAfter(board, side, m)

  const who = side === 'you' ? 'You' : 'Rival'
  const capTxt = m.capture ? `, captured a ${m.capture === 'master' ? 'Master' : 'Student'}` : ''
  let log = push(s.log, side === 'you' ? 'you' : 'ai', `${who} played ${m.card}${capTxt}.`)

  if (winner) {
    const reason = m.capture === 'master' ? 'the Way of the Stone' : 'the Way of the Stream'
    log = push(log, winner === 'you' ? 'you' : 'ai', `${winner === 'you' ? 'You win' : 'Rival wins'} by ${reason}.`)
    return { ...s, board, hands, middle: sw.middle, turn: null, winner, last: { from: m.from, to: m.to }, log }
  }
  return { ...s, board, hands, middle: sw.middle, turn: other(side), last: { from: m.from, to: m.to }, log }
}

/** Pass when no legal move exists: you must still exchange a card with the middle. */
export function passTurn(s: OnitamaState, side: Side): OnitamaState {
  if (s.winner || s.turn !== side) return s
  // Exchange the first card in hand for the middle (rule: a pass still swaps a card).
  const sw = swapCard(s.hands[side], s.hands[side][0], s.middle)
  const hands = { ...s.hands, [side]: sw.hand }
  const who = side === 'you' ? 'You' : 'Rival'
  const log = push(s.log, 'sys', `${who} had no legal move — exchanged ${sw.middle} with the middle.`)
  return { ...s, hands, middle: sw.middle, turn: other(side), log }
}

/** Convenience used by the UI/tests: advance the side to move, passing if it must. */
export function step(s: OnitamaState, side: Side, m: Move): OnitamaState {
  return applyMove(s, side, m)
}

// ===== AI: alpha-beta minimax over (card, piece, destination) =====

function findMaster(board: Cell[], side: Side): number {
  for (let i = 0; i < N * N; i++) { const p = board[i]; if (p && p.side === side && p.kind === 'master') return i }
  return -1
}

function applyForSearch(board: Cell[], m: Move): Cell[] {
  const nb = board.slice()
  nb[m.to] = nb[m.from]
  nb[m.from] = null
  return nb
}

// moves available to `side` given an explicit hand (used during search where hands change).
function movesFor(board: Cell[], side: Side, hand: string[]): Move[] {
  const out: Move[] = []
  for (let i = 0; i < N * N; i++) {
    const p = board[i]
    if (!p || p.side !== side) continue
    const r = (i / N) | 0, c = i % N
    for (const cardName of hand) {
      const card = cardByName(cardName)
      for (const [dr, dc] of effectiveOffsets(card, side)) {
        const nr = r + dr, nc = c + dc
        if (!inBounds(nr, nc)) continue
        const dest = board[idx(nr, nc)]
        if (dest && dest.side === side) continue
        out.push({ card: cardName, from: i, to: idx(nr, nc), capture: dest ? dest.kind : null })
      }
    }
  }
  return out
}

const WIN = 100000

function evalBoard(board: Cell[], me: Side): number {
  const opp = other(me)
  const myMaster = findMaster(board, me)
  const opMaster = findMaster(board, opp)
  if (opMaster < 0) return WIN
  if (myMaster < 0) return -WIN

  let score = 0
  // material: count students
  let myStu = 0, opStu = 0
  for (const p of board) {
    if (!p || p.kind !== 'student') continue
    if (p.side === me) myStu++; else opStu++
  }
  score += (myStu - opStu) * 100

  // proximity of my master to the enemy temple (Way of the Stream pressure)
  const myTarget = me === 'you' ? AI_TEMPLE : YOU_TEMPLE
  const opTarget = opp === 'you' ? AI_TEMPLE : YOU_TEMPLE
  const dist = (a: number, b: number) => Math.abs(((a / N) | 0) - ((b / N) | 0)) + Math.abs((a % N) - (b % N))
  score += (8 - dist(myMaster, myTarget)) * 6
  score -= (8 - dist(opMaster, opTarget)) * 6

  // master safety: prefer my master off the centre column edges; slight central control bonus
  const centreBonus = (i: number) => {
    const r = (i / N) | 0, c = i % N
    return 2 - (Math.abs(r - 2) + Math.abs(c - 2)) * 0.3
  }
  for (let i = 0; i < N * N; i++) {
    const p = board[i]
    if (!p || p.kind !== 'student') continue
    score += (p.side === me ? 1 : -1) * centreBonus(i)
  }
  return score
}

function search(
  board: Cell[],
  hands: { you: string[]; ai: string[] },
  middle: string,
  toMove: Side,
  me: Side,
  depth: number,
  alpha: number,
  beta: number,
): number {
  // terminal check by missing master is handled in eval; depth 0 -> static eval
  if (Math.abs(evalBoard(board, me)) >= WIN) return evalBoard(board, me)
  if (depth === 0) return evalBoard(board, me)

  const moves = movesFor(board, toMove, hands[toMove])
  if (!moves.length) {
    // must pass: swap first card with the middle, hand back to opponent
    const used = hands[toMove][0]
    const nh = hands[toMove].slice(); nh[nh.indexOf(used)] = middle
    const nHands = { ...hands, [toMove]: nh }
    return search(board, nHands, used, other(toMove), me, depth - 1, alpha, beta)
  }

  const maximizing = toMove === me
  let best = maximizing ? -Infinity : Infinity
  for (const m of moves) {
    const nb = applyForSearch(board, m)
    // immediate-win shortcut
    const w = winnerAfter(nb, toMove, m)
    let val: number
    if (w) {
      val = w === me ? WIN - (10 - depth) : -WIN + (10 - depth)
    } else {
      const used = m.card
      const nh = hands[toMove].slice(); nh[nh.indexOf(used)] = middle
      const nHands = { ...hands, [toMove]: nh }
      val = search(nb, nHands, used, other(toMove), me, depth - 1, alpha, beta)
    }
    if (maximizing) {
      if (val > best) best = val
      if (best > alpha) alpha = best
    } else {
      if (val < best) best = val
      if (best < beta) beta = best
    }
    if (alpha >= beta) break
  }
  return best
}

export function aiMove(s: OnitamaState): OnitamaState {
  if (s.winner || s.turn !== 'ai') return s
  const me: Side = 'ai'
  const moves = legalMoves(s, me)
  if (!moves.length) return passTurn(s, me)

  const DEPTH = 4
  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of moves) {
    const nb = applyForSearch(s.board, m)
    const w = winnerAfter(nb, me, m)
    let v: number
    if (w) {
      v = WIN
    } else {
      const nh = s.hands.ai.slice(); nh[nh.indexOf(m.card)] = s.middle
      v = search(nb, { ...s.hands, ai: nh }, m.card, 'you', me, DEPTH - 1, -Infinity, Infinity)
    }
    scored.push({ m, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.m)
  const choice = top[(Math.random() * top.length) | 0]
  return applyMove(s, me, choice)
}

// Test/UI helper: piece counts per side.
export function counts(board: Cell[]): { you: number; ai: number } {
  let you = 0, ai = 0
  for (const p of board) { if (!p) continue; if (p.side === 'you') you++; else ai++ }
  return { you, ai }
}
