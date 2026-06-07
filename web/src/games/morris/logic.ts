/* NINE MEN'S MORRIS — logic (built for this codebase, not ported).
   The classic 24-point board: three concentric squares joined by midpoint cross-connectors,
   NO diagonals. You are White and place first; the AI is Black and uses alpha-beta search
   (mill formation + the resulting removal modelled as one move). Form a line of three (a MILL)
   to remove one rival man. Reduce the rival to two men, or leave them with no legal move, to win.

   Layout (point indices). x,y on a 6x6 grid (0..6):
       0--------1--------2
       |        |        |
       |  3-----4-----5  |
       |  |     |     |  |
       |  |  6--7--8  |  |
       9--10-11    12-13-14
       |  | 15-16-17  |  |
       |  |     |     |  |
       |  18----19---20  |
       |        |        |
       21-------22-------23
   FLYING: omitted — moving is always to an adjacent empty point, for all phases. */

export type Color = 'w' | 'b'
export type Cell = Color | null
export type Phase = 'place' | 'move' | 'remove'
export interface LogEntry { t: string; x: string }

export const POINTS = 24

// (x,y) render coordinates on a 0..6 grid.
export const LAYOUT: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [3, 0], [6, 0],            // 0,1,2  outer top
  [1, 1], [3, 1], [5, 1],            // 3,4,5  middle top
  [2, 2], [3, 2], [4, 2],            // 6,7,8  inner top
  [0, 3], [1, 3], [2, 3],            // 9,10,11 left (outer,mid,inner)
  [4, 3], [5, 3], [6, 3],            // 12,13,14 right (inner,mid,outer)
  [2, 4], [3, 4], [4, 4],            // 15,16,17 inner bottom
  [1, 5], [3, 5], [5, 5],            // 18,19,20 middle bottom
  [0, 6], [3, 6], [6, 6],            // 21,22,23 outer bottom
]

// adjacency along the three squares + the four cross-connectors (no diagonals).
export const ADJ: ReadonlyArray<ReadonlyArray<number>> = [
  /* 0*/[1, 9],
  /* 1*/[0, 2, 4],
  /* 2*/[1, 14],
  /* 3*/[4, 10],
  /* 4*/[1, 3, 5, 7],
  /* 5*/[4, 13],
  /* 6*/[7, 11],
  /* 7*/[4, 6, 8],
  /* 8*/[7, 12],
  /* 9*/[0, 10, 21],
  /*10*/[3, 9, 11, 18],
  /*11*/[6, 10, 15],
  /*12*/[8, 13, 17],
  /*13*/[5, 12, 14, 20],
  /*14*/[2, 13, 23],
  /*15*/[11, 16],
  /*16*/[15, 17, 19],
  /*17*/[12, 16],
  /*18*/[10, 19],
  /*19*/[16, 18, 20, 22],
  /*20*/[13, 19],
  /*21*/[9, 22],
  /*22*/[19, 21, 23],
  /*23*/[14, 22],
]

// the 16 mills (lines of three).
export const MILLS: ReadonlyArray<readonly [number, number, number]> = [
  // horizontals
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [9, 10, 11], [12, 13, 14],
  [15, 16, 17], [18, 19, 20], [21, 22, 23],
  // verticals
  [0, 9, 21], [3, 10, 18], [6, 11, 15],
  [1, 4, 7], [16, 19, 22],
  [8, 12, 17], [5, 13, 20], [2, 14, 23],
]

// mills passing through each point (precomputed for speed).
const MILLS_AT: number[][] = (() => {
  const m: number[][] = Array.from({ length: POINTS }, () => [])
  MILLS.forEach((mill, mi) => mill.forEach(p => m[p].push(mi)))
  return m
})()

export interface MorrisState {
  board: Cell[]            // length 24
  turn: Color | null
  phase: Phase             // place | move | remove
  you: Color
  hand: { w: number; b: number }   // men still to place
  onBoard: { w: number; b: number }
  sel: number | null       // selected man (move phase) — UI hint, also stored
  moveFrom: number | null  // pending slide origin while resolving a removal
  winner: Color | null
  last: number[]           // points to highlight (last move)
  log: LogEntry[]
}

const other = (c: Color): Color => c === 'w' ? 'b' : 'w'
function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): MorrisState {
  return {
    board: new Array(POINTS).fill(null),
    turn: 'w',
    phase: 'place',
    you: 'w',
    hand: { w: 9, b: 9 },
    onBoard: { w: 0, b: 0 },
    sel: null,
    moveFrom: null,
    winner: null,
    last: [],
    log: [{ t: 'sys', x: 'You are White and place first. Form a line of three to take a rival man.' }],
  }
}

// does placing/landing `who` at point p complete a mill that wasn't already complete?
export function millsClosedBy(board: Cell[], p: number, who: Color): number[] {
  const out: number[] = []
  for (const mi of MILLS_AT[p]) {
    const mill = MILLS[mi]
    if (mill.every(q => board[q] === who)) out.push(mi)
  }
  return out
}

function inAnyMill(board: Cell[], p: number, who: Color): boolean {
  for (const mi of MILLS_AT[p]) if (MILLS[mi].every(q => board[q] === who)) return true
  return false
}

// opponent men that may be removed: those not in a mill, unless ALL are in mills.
export function removable(board: Cell[], victim: Color): number[] {
  const all: number[] = []
  for (let i = 0; i < POINTS; i++) if (board[i] === victim) all.push(i)
  const free = all.filter(i => !inAnyMill(board, i, victim))
  return free.length ? free : all
}

// legal slides for `who` in the move phase: [from, to][]
export function legalSlides(board: Cell[], who: Color): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < POINTS; i++) {
    if (board[i] !== who) continue
    for (const j of ADJ[i]) if (board[j] === null) out.push([i, j])
  }
  return out
}

export function counts(s: MorrisState) {
  return {
    wTotal: s.onBoard.w + s.hand.w,
    bTotal: s.onBoard.b + s.hand.b,
  }
}

function name(s: MorrisState, c: Color) { return c === s.you ? 'You' : 'Rival' }

// after a man is placed/moved by `who`, decide the next phase/turn (or detect a win).
function settle(s: MorrisState, board: Cell[], who: Color, landed: number, log: LogEntry[], hand: { w: number; b: number }, onBoard: { w: number; b: number }, last: number[]): MorrisState {
  const closed = millsClosedBy(board, landed, who)
  const base = { board, hand, onBoard, sel: null, moveFrom: null, last }
  if (closed.length) {
    const victim = other(who)
    const rem = removable(board, victim)
    if (rem.length) {
      return Object.assign({}, s, base, {
        phase: 'remove' as Phase, turn: who, moveFrom: null,
        log: push(log, who === s.you ? 'you' : 'ai', `${name(s, who)} formed a mill — taking a rival man.`),
      })
    }
    // mill but nothing to take (shouldn't normally happen): fall through to handover
  }
  return handover(s, base, other(who), log)
}

// pass the turn to `next`; pick their phase and check for loss (no men to move / reduced to 2).
function handover(s: MorrisState, base: object, next: Color, log: LogEntry[]): MorrisState {
  const st = Object.assign({}, s, base) as MorrisState
  const hand = st.hand, onBoard = st.onBoard
  // loss by attrition (only meaningful once placing is over for the loser)
  if (hand[next] === 0 && onBoard[next] <= 2) {
    return Object.assign({}, st, { turn: null, phase: 'move' as Phase, winner: other(next), log: push(log, 'sys', `${name(s, other(next))} win — ${name(s, next).toLowerCase()} reduced to two men.`) })
  }
  if (hand[next] > 0) {
    return Object.assign({}, st, { turn: next, phase: 'place' as Phase, log })
  }
  // move phase — must have a legal slide
  if (!legalSlides(st.board, next).length) {
    return Object.assign({}, st, { turn: null, phase: 'move' as Phase, winner: other(next), log: push(log, 'sys', `${name(s, other(next))} win — ${name(s, next).toLowerCase()} cannot move.`) })
  }
  return Object.assign({}, st, { turn: next, phase: 'move' as Phase, log })
}

// ---- player actions ----

// PLACE phase: drop a man at empty point p.
export function place(s: MorrisState, p: number, who: Color): MorrisState {
  if (s.winner || s.turn !== who || s.phase !== 'place') return s
  if (s.board[p] !== null || s.hand[who] <= 0) return s
  const board = s.board.slice(); board[p] = who
  const hand = { ...s.hand, [who]: s.hand[who] - 1 }
  const onBoard = { ...s.onBoard, [who]: s.onBoard[who] + 1 }
  const log = push(s.log, who === s.you ? 'you' : 'ai', `${name(s, who)} placed at ${p + 1}.`)
  return settle(s, board, who, p, log, hand, onBoard, [p])
}

// MOVE phase: slide a man from `from` to adjacent empty `to`.
export function slide(s: MorrisState, from: number, to: number, who: Color): MorrisState {
  if (s.winner || s.turn !== who || s.phase !== 'move') return s
  if (s.board[from] !== who || s.board[to] !== null || !ADJ[from].includes(to)) return s
  const board = s.board.slice(); board[from] = null; board[to] = who
  const log = push(s.log, who === s.you ? 'you' : 'ai', `${name(s, who)} moved ${from + 1} → ${to + 1}.`)
  return settle(s, board, who, to, log, s.hand, s.onBoard, [from, to])
}

// REMOVE phase: take rival man at p.
export function remove(s: MorrisState, p: number, who: Color): MorrisState {
  if (s.winner || s.turn !== who || s.phase !== 'remove') return s
  const victim = other(who)
  if (s.board[p] !== victim) return s
  if (!removable(s.board, victim).includes(p)) return s
  const board = s.board.slice(); board[p] = null
  const onBoard = { ...s.onBoard, [victim]: s.onBoard[victim] - 1 }
  const log = push(s.log, who === s.you ? 'you' : 'ai', `${name(s, who)} removed rival man at ${p + 1}.`)
  return handover(s, { board, hand: s.hand, onBoard, sel: null, moveFrom: null, last: [p] }, victim, log)
}

// ===== AI: alpha-beta over the current phase, one call = one full AI turn (incl. removal) =====

interface Sim { board: Cell[]; hand: { w: number; b: number }; onBoard: { w: number; b: number } }

function simState(s: MorrisState): Sim {
  return { board: s.board.slice(), hand: { ...s.hand }, onBoard: { ...s.onBoard } }
}

function phaseOf(sim: Sim, who: Color): Phase {
  return sim.hand[who] > 0 ? 'place' : 'move'
}

function terminalLoss(sim: Sim, who: Color): boolean {
  if (sim.hand[who] === 0 && sim.onBoard[who] <= 2) return true
  if (sim.hand[who] === 0 && !legalSlides(sim.board, who).length) return true
  return false
}

function evalSim(sim: Sim, me: Color): number {
  const opp = other(me)
  const myTot = sim.onBoard[me] + sim.hand[me]
  const opTot = sim.onBoard[opp] + sim.hand[opp]
  if (opTot <= 2 && sim.hand[opp] === 0) return 100000
  if (myTot <= 2 && sim.hand[me] === 0) return -100000
  let score = 0
  score += 110 * (myTot - opTot)               // material
  // completed mills + near-mills (two of mine + an empty)
  let myMills = 0, opMills = 0, myNear = 0, opNear = 0
  for (const mill of MILLS) {
    let mc = 0, oc = 0, ec = 0
    for (const q of mill) { const v = sim.board[q]; if (v === me) mc++; else if (v === opp) oc++; else ec++ }
    if (mc === 3) myMills++
    else if (oc === 3) opMills++
    if (mc === 2 && ec === 1) myNear++
    if (oc === 2 && ec === 1) opNear++
  }
  score += 26 * (myMills - opMills) + 12 * (myNear - opNear)
  // mobility (move phase only matters; cheap to always include)
  score += 6 * (legalSlides(sim.board, me).length - legalSlides(sim.board, opp).length)
  return score
}

// enumerate full turns for `who` from `sim`: each yields a resulting Sim. A turn that
// closes a mill expands into one child per removable rival man (the AI picks the removal).
function genTurns(sim: Sim, who: Color): Sim[] {
  const opp = other(who)
  const out: Sim[] = []
  const apply = (board: Cell[], landed: number, hand: { w: number; b: number }, onBoard: { w: number; b: number }) => {
    const closed = millsClosedBy(board, landed, who)
    if (closed.length) {
      const rem = removable(board, opp)
      if (rem.length) {
        for (const r of rem) {
          const b2 = board.slice(); b2[r] = null
          out.push({ board: b2, hand: { ...hand }, onBoard: { ...onBoard, [opp]: onBoard[opp] - 1 } })
        }
        return
      }
    }
    out.push({ board, hand: { ...hand }, onBoard: { ...onBoard } })
  }
  if (phaseOf(sim, who) === 'place') {
    for (let p = 0; p < POINTS; p++) {
      if (sim.board[p] !== null) continue
      const board = sim.board.slice(); board[p] = who
      apply(board, p, { ...sim.hand, [who]: sim.hand[who] - 1 }, { ...sim.onBoard, [who]: sim.onBoard[who] + 1 })
    }
  } else {
    for (const [from, to] of legalSlides(sim.board, who)) {
      const board = sim.board.slice(); board[from] = null; board[to] = who
      apply(board, to, { ...sim.hand }, { ...sim.onBoard })
    }
  }
  return out
}

function search(sim: Sim, toMove: Color, me: Color, depth: number, alpha: number, beta: number): number {
  if (terminalLoss(sim, toMove)) return toMove === me ? -100000 - depth : 100000 + depth
  if (depth === 0) return evalSim(sim, me)
  const turns = genTurns(sim, toMove)
  if (!turns.length) return toMove === me ? -100000 - depth : 100000 + depth
  if (toMove === me) {
    let best = -Infinity
    for (const t of turns) { best = Math.max(best, search(t, other(toMove), me, depth - 1, alpha, beta)); alpha = Math.max(alpha, best); if (alpha >= beta) break }
    return best
  } else {
    let best = Infinity
    for (const t of turns) { best = Math.min(best, search(t, other(toMove), me, depth - 1, alpha, beta)); beta = Math.min(beta, best); if (alpha >= beta) break }
    return best
  }
}

export const AI_DEPTH = 4

// One call = one complete AI turn: it places/slides and (if a mill formed) removes, all here.
export function aiMove(s: MorrisState, depth: number = AI_DEPTH): MorrisState {
  if (s.winner || !s.turn || s.turn === s.you) return s
  const me = s.turn
  // during placing the branching factor is high — trim depth so it stays fast.
  const placed = s.onBoard.w + s.onBoard.b
  const d = s.hand[me] > 0 ? Math.min(depth, placed < 4 ? 2 : 3) : depth
  const sim = simState(s)
  const turns = genTurns(sim, me)
  if (!turns.length) return s   // shouldn't happen — handover guards losses
  let best = -Infinity
  const scored: { t: Sim; v: number }[] = []
  for (const t of turns) {
    const v = search(t, other(me), me, d - 1, -Infinity, Infinity)
    scored.push({ t, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6)
  const chosen = top[(Math.random() * top.length) | 0].t
  return applyAITurn(s, me, chosen)
}

// Translate a chosen simulated end-state back into the real reducer flow so logging/state stay consistent.
function applyAITurn(s: MorrisState, me: Color, target: Sim): MorrisState {
  const opp = other(me)
  // find what changed vs current board
  let added = -1, removedFrom = -1, takenOpp = -1
  for (let i = 0; i < POINTS; i++) {
    const a = s.board[i], b = target.board[i]
    if (a === b) continue
    if (a === null && b === me) added = i
    else if (a === me && b === null) removedFrom = i
    else if (a === opp && b === null) takenOpp = i
  }
  let next = s
  if (s.hand[me] > 0 && added >= 0) next = place(next, added, me)
  else if (removedFrom >= 0 && added >= 0) next = slide(next, removedFrom, added, me)
  if (next.phase === 'remove' && next.turn === me) {
    // pick the removal the search chose, else any legal one
    const rem = removable(next.board, opp)
    const pick = takenOpp >= 0 && rem.includes(takenOpp) ? takenOpp : rem[(Math.random() * rem.length) | 0]
    next = remove(next, pick, me)
  }
  return next
}
