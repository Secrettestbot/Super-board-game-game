/* RAPTOR — pure logic (built for this codebase, an asymmetric 2-player hunt).
   An 11x9 grid. YOU (player 0) command the RAPTORS: one strong MOTHER raptor that can EAT
   adjacent scientists, and several fast, fragile BABY raptors that try to ESCAPE off the
   board edge. The AI (player 1) commands a team of SCIENTISTS who move, and capture babies
   by sleeping them when adjacent, or put the MOTHER to sleep by surrounding/adjacent capture.

   CARDS: both players hold an identical deck of ACTION cards numbered 1..9. Each round BOTH
   reveal one card simultaneously. The player with the LOWER number acts FIRST but only gets
   a small SPECIAL effect (or may pass); the player with the HIGHER number performs that
   card's MAIN action with strength = their number (movement points = the number).

   ASYMMETRIC OBJECTIVES:
     RAPTORS (you) win by  : 3 babies ESCAPE off an edge, OR the mother EATS 3 scientists.
     SCIENTISTS (ai) win by: ALL babies CAPTURED, OR the mother put to SLEEP.

   Player ids 0/1, grid coords 0, and counters 0 are all VALID — never truthiness-test them.
   Use != null / == null and === for player comparisons; empty cells are null. */

export type Player = 0 | 1 // 0 = raptors (you), 1 = scientists (ai)
export type PieceKind = 'mother' | 'baby' | 'scientist'
export type Phase = 'reveal' | 'resolve' | 'gameover'

export interface Piece {
  id: number
  kind: PieceKind
  r: number
  c: number
  alive: boolean // false when captured/eaten/escaped (removed from board)
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface State {
  cols: number
  rows: number
  pieces: Piece[]
  hands: [number[], number[]]   // remaining cards per player
  discards: [number[], number[]]
  revealed: [number | null, number | null] // cards each player has revealed this round
  phase: Phase
  babiesEscaped: number
  babiesCaptured: number
  scientistsEaten: number
  motherAsleep: boolean
  round: number
  turn: number   // monotonic counter — bump on every state-changing action (AI tick)
  winner: Player | null
  log: LogEntry[]
}

export const COLS = 11
export const ROWS = 9
const BABY_COUNT = 4
const SCIENTIST_COUNT = 5
const BABIES_TO_ESCAPE = 3
const SCIENTISTS_TO_EAT = 3

// ---- tiny seeded RNG so makeGame(seed) and the AI are deterministic for tests ----
function mulberry32(seed: number) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-24)
}

const freshHand = (): number[] => [1, 2, 3, 4, 5, 6, 7, 8, 9]

/** The canonical 1..9 ordering, for laying out a hand in fixed slots in the UI. */
export function freshOrder(_hand: number[]): number[] {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9]
}

export const idx = (r: number, c: number) => r * COLS + c
export const inBounds = (s: State, r: number, c: number) => r >= 0 && r < s.rows && c >= 0 && c < s.cols
export const isEdge = (s: State, r: number, c: number) =>
  r === 0 || c === 0 || r === s.rows - 1 || c === s.cols - 1

export function makeGame(seed?: number): State {
  const rng = mulberry32(seed == null ? (Math.random() * 1e9) | 0 : seed)
  const pieces: Piece[] = []
  let id = 0
  // Mother near the centre.
  const mr = (ROWS / 2) | 0
  const mc = (COLS / 2) | 0
  pieces.push({ id: id++, kind: 'mother', r: mr, c: mc, alive: true })
  // Babies spread out a couple of rings from the mother — each already has a fairly short
  // sprint to a different edge, so the escape threat is live and the side is competitive.
  const babySpots: [number, number][] = [
    [1, mc - 3], [1, mc + 3], [ROWS - 2, mc - 3], [ROWS - 2, mc + 3],
  ]
  for (let i = 0; i < BABY_COUNT; i++) {
    const [r, c] = babySpots[i]
    pieces.push({ id: id++, kind: 'baby', r, c, alive: true })
  }
  // Scientists start back along the mid columns — they must chase the scattering babies.
  const sciSpots: [number, number][] = [
    [mr, 1], [mr, COLS - 2], [1, mc], [ROWS - 2, mc], [mr, mc - 3],
  ]
  for (let i = 0; i < SCIENTIST_COUNT; i++) {
    const [r, c] = sciSpots[i]
    pieces.push({ id: id++, kind: 'scientist', r, c, alive: true })
  }
  // Shuffle each hand deterministically (order doesn't change rules but keeps tests stable).
  const shuffle = (arr: number[]) => {
    const a = arr.slice()
    for (let i = a.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  return {
    cols: COLS,
    rows: ROWS,
    pieces,
    hands: [shuffle(freshHand()), shuffle(freshHand())],
    discards: [[], []],
    revealed: [null, null],
    phase: 'reveal',
    babiesEscaped: 0,
    babiesCaptured: 0,
    scientistsEaten: 0,
    motherAsleep: false,
    round: 1,
    turn: 0,
    winner: null,
    log: [{ t: 'sys', x: 'Both sides reveal a card. The lower number acts first (a small special); the higher number takes the full action with strength = its number.' }],
  }
}

// ----- accessors -----
export const mother = (s: State): Piece | undefined => s.pieces.find(p => p.kind === 'mother' && p.alive)
export const babies = (s: State): Piece[] => s.pieces.filter(p => p.kind === 'baby' && p.alive)
export const scientists = (s: State): Piece[] => s.pieces.filter(p => p.kind === 'scientist' && p.alive)
export const pieceAt = (s: State, r: number, c: number): Piece | undefined =>
  s.pieces.find(p => p.alive && p.r === r && p.c === c)
export const adjacent = (a: { r: number; c: number }, b: { r: number; c: number }) =>
  Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1

function totalBabies(s: State): number {
  // babies still on board + already escaped + already captured == BABY_COUNT
  return babies(s).length
}

// ----- win checks -----
export function checkWinner(s: State): Player | null {
  // Raptors (player 0)
  if (s.babiesEscaped >= BABIES_TO_ESCAPE) return 0
  if (s.scientistsEaten >= SCIENTISTS_TO_EAT) return 0
  // Scientists (player 1)
  if (s.motherAsleep) return 1
  if (totalBabies(s) === 0 && s.babiesEscaped < BABIES_TO_ESCAPE) {
    // all babies removed from the board but not enough escaped -> they were captured
    return 1
  }
  return null
}

function settleWinner(s: State): State {
  const w = checkWinner(s)
  if (w == null) return s
  let log = s.log
  if (w === 0) {
    log = push(log, 'you', s.babiesEscaped >= BABIES_TO_ESCAPE
      ? `${BABIES_TO_ESCAPE} babies escaped — the raptors win!`
      : `The mother ate ${SCIENTISTS_TO_EAT} scientists — the raptors win!`)
  } else {
    log = push(log, 'ai', s.motherAsleep
      ? 'The mother is asleep — the scientists win!'
      : 'Every baby has been captured — the scientists win!')
  }
  return { ...s, winner: w, phase: 'gameover', log }
}

// ====================================================================
// CARD REVEAL + RESOLUTION
// ====================================================================

/** Both players reveal a card. Removes the card from each hand into discard. */
export function revealCards(s: State, p0Card: number, p1Card: number): State {
  if (s.winner != null || s.phase !== 'reveal') return s
  if (!s.hands[0].includes(p0Card) || !s.hands[1].includes(p1Card)) return s
  const hands: [number[], number[]] = [
    s.hands[0].filter(x => x !== p0Card),
    s.hands[1].filter(x => x !== p1Card),
  ]
  const log = push(s.log, 'sys', `Reveal — you: ${p0Card}, scientists: ${p1Card}.`)
  return {
    ...s,
    hands,
    revealed: [p0Card, p1Card],
    phase: 'resolve',
    turn: s.turn + 1,
    log,
  }
}

/** Which player has the lower / higher revealed card. Ties: player 0 (raptors) counts as lower. */
export function lowerHigher(s: State): { low: Player; high: Player; lowCard: number; highCard: number } | null {
  const [a, b] = s.revealed
  if (a == null || b == null) return null
  if (a <= b) return { low: 0, high: 1, lowCard: a, highCard: b }
  return { low: 1, high: 0, lowCard: b, highCard: a }
}

/**
 * Resolve the revealed round. The LOWER player takes a small SPECIAL (here: a single-step
 * reposition of one of their pieces, chosen by simple heuristic / passed if no good move),
 * then the HIGHER player performs the MAIN action (movement = their card number) which
 * includes captures / eats / escapes. Then discard, advance the round, refresh empty hands.
 */
export function resolveRound(s: State): State {
  if (s.winner != null || s.phase !== 'resolve') return s
  const lh = lowerHigher(s)
  if (lh == null) return s
  let st = s

  // LOWER player: special — a single repositioning step (magnitude 1) toward their objective.
  st = applyMovement(st, lh.low, 1, /*special*/ true)
  // win could already trigger after the special (rare)
  let w = checkWinner(st)
  if (w == null) {
    // HIGHER player: full action with movement points = their card number.
    st = applyMovement(st, lh.high, lh.highCard, /*special*/ false)
  }

  // Discard revealed, advance round, refill empties.
  const p0Card = s.revealed[0]!
  const p1Card = s.revealed[1]!
  const discards: [number[], number[]] = [
    st.discards[0].concat([p0Card]),
    st.discards[1].concat([p1Card]),
  ]
  let hands = st.hands
  if (st.hands[0].length === 0 || st.hands[1].length === 0) {
    hands = [
      st.hands[0].length === 0 ? freshHand() : st.hands[0],
      st.hands[1].length === 0 ? freshHand() : st.hands[1],
    ]
  }
  st = {
    ...st,
    discards,
    hands,
    revealed: [null, null],
    phase: 'reveal',
    round: st.round + 1,
    turn: st.turn + 1,
  }
  return settleWinner(st)
}

// ====================================================================
// MOVEMENT / CAPTURE / ESCAPE / EAT
// ====================================================================

/**
 * Spend `points` movement among a player's pieces. Raptors (player 0) move their pieces to
 * progress babies toward an edge (escape) and let the mother eat adjacent scientists;
 * scientists (player 1) close in on babies (capture when adjacent) and corner the mother
 * (sleep when adjacent). Deterministic greedy single-piece-per-point stepping.
 */
export function applyMovement(s: State, player: Player, points: number, special: boolean): State {
  if (s.winner != null) return s
  let st = s
  for (let step = 0; step < points; step++) {
    if (checkWinner(st) != null) break
    if (player === 0) st = raptorStep(st, special)
    else st = scientistStep(st, special)
  }
  return st
}

/** Move a piece (mutating a cloned pieces array) to (nr,nc). Caller guarantees legality. */
function moveTo(st: State, p: Piece, nr: number, nc: number): State {
  const pieces = st.pieces.map(q => (q.id === p.id ? { ...q, r: nr, c: nc } : q))
  return { ...st, pieces }
}

function removePiece(st: State, id: number): State {
  return { ...st, pieces: st.pieces.map(q => (q.id === id ? { ...q, alive: false } : q)) }
}

/** Nearest distance from (r,c) to any board edge (0 means already on an edge). */
function edgeDist(s: State, r: number, c: number): number {
  return Math.min(r, c, s.rows - 1 - r, s.cols - 1 - c)
}

/** One raptor movement point. Priority: escape a baby that's on an edge, eat an adjacent
    scientist with the mother, else step the baby closest to an edge toward that edge
    (avoiding scientists), else nudge the mother toward the nearest scientist to threaten. */
function raptorStep(st: State, special: boolean): State {
  // 1) A baby already on an edge escapes immediately.
  for (const b of babies(st)) {
    if (isEdge(st, b.r, b.c)) {
      let s2 = removePiece(st, b.id)
      s2 = { ...s2, babiesEscaped: s2.babiesEscaped + 1, log: push(s2.log, 'you', `A baby escaped off the edge! (${s2.babiesEscaped} escaped)`) }
      return s2
    }
  }
  // 2) Mother eats an adjacent scientist.
  const mom = mother(st)
  if (mom) {
    const target = scientists(st).find(sc => adjacent(mom, sc))
    if (target) {
      let s2 = removePiece(st, target.id)
      s2 = { ...s2, scientistsEaten: s2.scientistsEaten + 1, log: push(s2.log, 'you', `The mother ate a scientist! (${s2.scientistsEaten} eaten)`) }
      return s2
    }
  }
  // 3) Step the baby nearest an edge toward the nearest edge, avoiding scientist-occupied cells.
  const bs = babies(st)
  if (bs.length > 0) {
    let best: Piece | null = null
    let bestDist = Infinity
    for (const b of bs) {
      const d = edgeDist(st, b.r, b.c)
      if (d < bestDist) { bestDist = d; best = b }
    }
    if (best) {
      const moved = stepToward(st, best, nearestEdgeCell(st, best), /*avoidSci*/ true)
      if (moved) return moved
    }
  }
  // 4) Nudge the mother toward the nearest scientist (special or fallback).
  if (mom) {
    const sc = nearestPiece(st, mom, scientists(st))
    if (sc) {
      const moved = stepToward(st, mom, { r: sc.r, c: sc.c }, false)
      if (moved) return moved
    }
  }
  // Nothing useful to do.
  return special ? st : st
}

/** One scientist movement point. Priority: capture an adjacent baby (sleep it), sleep the
    mother if a scientist is adjacent to her AND she's hemmed (>=2 scientists adjacent),
    else advance the scientist nearest a baby toward that baby (corner it). Avoid the mother. */
function scientistStep(st: State, special: boolean): State {
  const scs = scientists(st)
  // 1) Capture an adjacent baby.
  for (const sc of scs) {
    const baby = babies(st).find(b => adjacent(sc, b))
    if (baby) {
      let s2 = removePiece(st, baby.id)
      s2 = { ...s2, babiesCaptured: s2.babiesCaptured + 1, log: push(s2.log, 'ai', `A scientist captured a baby! (${s2.babiesCaptured} captured)`) }
      return s2
    }
  }
  // 2) Sleep the mother: need at least 2 scientists adjacent to her (she's strong).
  const mom = mother(st)
  if (mom) {
    const adj = scs.filter(sc => adjacent(sc, mom))
    if (adj.length >= 2) {
      const s2 = { ...st, motherAsleep: true, log: push(st.log, 'ai', 'The scientists tranquillised the mother — she sleeps!') }
      return s2
    }
  }
  // 3) Advance toward the nearest baby (corner it). Avoid stepping adjacent to the mother
  //    unless that's also adjacent to a baby (so we don't get eaten needlessly).
  const bs = babies(st)
  if (bs.length > 0) {
    // pick the (scientist, baby) pair with smallest distance
    let bestSc: Piece | null = null
    let bestTarget: { r: number; c: number } | null = null
    let bestDist = Infinity
    for (const sc of scs) {
      const b = nearestPiece(st, sc, bs)
      if (!b) continue
      const d = Math.abs(sc.r - b.r) + Math.abs(sc.c - b.c)
      if (d < bestDist) { bestDist = d; bestSc = sc; bestTarget = { r: b.r, c: b.c } }
    }
    if (bestSc && bestTarget) {
      const moved = stepToward(st, bestSc, bestTarget, /*avoidSci*/ false, /*avoidMother*/ true)
      if (moved) return moved
    }
  }
  // 4) Otherwise close on the mother to set up a sleep (only if babies are gone).
  if (mom && scs.length > 0) {
    const sc = nearestPiece(st, mom, scs)
    if (sc) {
      const moved = stepToward(st, sc, { r: mom.r, c: mom.c }, false)
      if (moved) return moved
    }
  }
  return special ? st : st
}

function nearestPiece(s: State, from: { r: number; c: number }, pool: Piece[]): Piece | null {
  let best: Piece | null = null
  let bestD = Infinity
  for (const p of pool) {
    const d = Math.abs(from.r - p.r) + Math.abs(from.c - p.c)
    if (d < bestD) { bestD = d; best = p }
  }
  return best
}

function nearestEdgeCell(s: State, p: Piece): { r: number; c: number } {
  // target the closest point on the nearest edge
  const dl = p.c, dr = s.cols - 1 - p.c, dt = p.r, db = s.rows - 1 - p.r
  const m = Math.min(dl, dr, dt, db)
  if (m === dt) return { r: 0, c: p.c }
  if (m === db) return { r: s.rows - 1, c: p.c }
  if (m === dl) return { r: p.r, c: 0 }
  return { r: p.r, c: s.cols - 1 }
}

/** Step `p` one orthogonal cell toward `target`, choosing the axis with the larger gap.
    Skips cells occupied by another piece; optionally avoids scientist cells / cells
    adjacent to the mother. Returns the new state or null if no legal step exists. */
function stepToward(
  st: State,
  p: Piece,
  target: { r: number; c: number },
  avoidSci: boolean,
  avoidMother = false,
): State | null {
  const dr = Math.sign(target.r - p.r)
  const dc = Math.sign(target.c - p.c)
  const cands: [number, number][] = []
  // Prefer the axis with greater remaining distance.
  const gapR = Math.abs(target.r - p.r)
  const gapC = Math.abs(target.c - p.c)
  if (gapR >= gapC) {
    if (dr !== 0) cands.push([p.r + dr, p.c])
    if (dc !== 0) cands.push([p.r, p.c + dc])
  } else {
    if (dc !== 0) cands.push([p.r, p.c + dc])
    if (dr !== 0) cands.push([p.r + dr, p.c])
  }
  // Allow sidestepping if the direct cell is blocked.
  cands.push([p.r + dr, p.c + dc])
  const mom = mother(st)
  for (const [nr, nc] of cands) {
    if (nr === p.r && nc === p.c) continue
    if (!inBounds(st, nr, nc)) continue
    const occ = pieceAt(st, nr, nc)
    if (occ) {
      if (avoidSci && occ.kind === 'scientist') continue
      // can't stack onto any occupied cell
      continue
    }
    if (avoidMother && mom) {
      // don't voluntarily step next to the mother unless it's our target
      const wouldBeAdj = Math.abs(nr - mom.r) + Math.abs(nc - mom.c) === 1
      const targetIsMom = target.r === mom.r && target.c === mom.c
      if (wouldBeAdj && !targetIsMom) continue
    }
    return moveTo(st, p, nr, nc)
  }
  return null
}

// ====================================================================
// AI (scientists = player 1)
// ====================================================================

/**
 * The AI's card choice for the scientists. Heuristic: the scientists are FAST and want the
 * HIGHER card so they get the big movement to corner/capture babies — so they prefer playing
 * a high card UNLESS babies are already adjacent (then any capture works and they keep value).
 * Adds light determinism off s.turn so self-play varies but is reproducible with a seed.
 */
export function aiChooseCard(s: State): number {
  const hand = s.hands[1]
  if (hand.length === 0) return 1
  // If a scientist is already adjacent to a baby or the mother is hemmable, a low card still
  // lets the special trigger captures — but the higher player gets the big move. Scientists
  // want to OUT-number the raptors, so bias toward the highest available card.
  const sorted = hand.slice().sort((a, b) => b - a)
  // Most of the time take the top card; occasionally take the 2nd to bluff / conserve.
  const pick = (s.turn % 4 === 3 && sorted.length > 1) ? sorted[1] : sorted[0]
  return pick
}

/**
 * Drive the AI for one step. If it's the reveal phase, the AI reveals (needs the human/raptor
 * card too — see Raptor.tsx which supplies player 0's chosen card). For self-play / tests,
 * aiResolve handles BOTH choosing the raptor card heuristically and resolving. Here aiResolve
 * is the test/self-play stepper: it picks both cards, reveals, and resolves one full round.
 */
export function aiResolve(s: State): State {
  if (s.winner != null) return s
  if (s.phase === 'reveal') {
    const p1 = aiChooseCard(s)
    const p0 = raptorChooseCard(s)
    return revealCards(s, p0, p1)
  }
  if (s.phase === 'resolve') {
    return resolveRound(s)
  }
  return s
}

/** A heuristic card choice for the RAPTORS, used by self-play/tests (the human picks in the UI).
    Raptors want the HIGHER card so the babies get the big sprint toward the edge. */
export function raptorChooseCard(s: State): number {
  const hand = s.hands[0]
  if (hand.length === 0) return 1
  const sorted = hand.slice().sort((a, b) => b - a)
  return (s.turn % 5 === 2 && sorted.length > 1) ? sorted[1] : sorted[0]
}

/** Run a full self-play to completion under a guard cap. Returns the final state. */
export function selfPlay(seed: number, cap = 400): State {
  let s = makeGame(seed)
  let guard = 0
  while (s.winner == null && guard < cap) {
    s = aiResolve(s)
    guard++
  }
  return s
}
