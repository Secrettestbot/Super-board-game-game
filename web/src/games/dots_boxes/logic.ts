/* DOTS AND BOXES — logic (built for this codebase, not ported).
   A 4x4 grid of BOXES => 5x5 dots. Edges run between adjacent dots: a row of horizontal
   edges above/below each box-row, and columns of vertical edges left/right of each box.
   Players alternate drawing one un-drawn edge. Completing the 4th side of a box claims it
   AND grants another move. When all edges are drawn, whoever owns more boxes wins.
   You ('you') move first; the AI ('ai') plays a greedy safe-move strategy. */

export const SIZE = 4            // boxes per side
export const DOTS = SIZE + 1     // dots per side (5)

export type Player = 'you' | 'ai'
export type Owner = Player | null
export interface LogEntry { t: string; x: string }

// Edge ids are strings. Horizontal edge above box-row r at col c: `h-${r}-${c}` for r in 0..SIZE, c in 0..SIZE-1.
// Vertical edge left of box col c in row r: `v-${r}-${c}` for r in 0..SIZE-1, c in 0..SIZE.
export type EdgeId = string

export interface DotsState {
  edges: Record<EdgeId, Player>   // drawn edges -> who drew them
  owners: Owner[]                 // length SIZE*SIZE, box index r*SIZE+c
  turn: Player | null
  you: Player
  winner: Player | 'draw' | null
  last: EdgeId | null
  moves: number                   // total edges drawn (drives AI tick)
  log: LogEntry[]
}

const boxIdx = (r: number, c: number) => r * SIZE + c

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

// ---- edge enumeration ----
export function allEdges(): EdgeId[] {
  const out: EdgeId[] = []
  for (let r = 0; r <= SIZE; r++) for (let c = 0; c < SIZE; c++) out.push(`h-${r}-${c}`)
  for (let r = 0; r < SIZE; r++) for (let c = 0; c <= SIZE; c++) out.push(`v-${r}-${c}`)
  return out
}

// The (up to 4) edge ids that bound the box at (r, c).
export function boxEdges(r: number, c: number): EdgeId[] {
  return [`h-${r}-${c}`, `h-${r + 1}-${c}`, `v-${r}-${c}`, `v-${r}-${c + 1}`]
}

// Boxes touched by an edge: a horizontal edge touches the box above and below; vertical, left and right.
function boxesOfEdge(id: EdgeId): [number, number][] {
  const [kind, rs, cs] = id.split('-')
  const r = +rs, c = +cs
  const out: [number, number][] = []
  if (kind === 'h') {
    if (r - 1 >= 0) out.push([r - 1, c])
    if (r < SIZE) out.push([r, c])
  } else {
    if (c - 1 >= 0) out.push([r, c - 1])
    if (c < SIZE) out.push([r, c])
  }
  return out
}

function sidesDrawn(edges: Record<EdgeId, Player>, r: number, c: number): number {
  let n = 0
  for (const e of boxEdges(r, c)) if (edges[e]) n++
  return n
}

export function counts(owners: Owner[]): { you: number; ai: number } {
  let you = 0, ai = 0
  for (const o of owners) { if (o === 'you') you++; else if (o === 'ai') ai++ }
  return { you, ai }
}

export function makeGame(): DotsState {
  return {
    edges: {},
    owners: new Array(SIZE * SIZE).fill(null),
    turn: 'you',
    you: 'you',
    winner: null,
    last: null,
    moves: 0,
    log: [{ t: 'sys', x: 'Draw edges between dots. Close the 4th side of a box to claim it and go again. Most boxes wins.' }],
  }
}

const cellName = (r: number, c: number) => `${'ABCD'[c]}${r + 1}`

function finish(s: DotsState, edges: Record<EdgeId, Player>, owners: Owner[], log: LogEntry[], last: EdgeId): DotsState {
  const { you, ai } = counts(owners)
  const winner: Player | 'draw' = you === ai ? 'draw' : you > ai ? 'you' : 'ai'
  const msg = winner === 'draw'
    ? `All squares filled — an even split ${you}–${ai}.`
    : `${winner === 'you' ? 'You win' : 'Rival wins'} ${Math.max(you, ai)}–${Math.min(you, ai)}.`
  return Object.assign({}, s, { edges, owners, turn: null, winner, last, log: push(log, winner === 'you' ? 'you' : 'ai', msg) })
}

// Draw one edge for `who`. Claims completed boxes and grants another turn on a claim.
export function drawEdge(s: DotsState, id: EdgeId, who: Player): DotsState {
  if (s.winner || s.turn !== who) return s
  if (s.edges[id]) return s
  const edges = Object.assign({}, s.edges, { [id]: who })
  const owners = s.owners.slice()
  let claimed = 0
  const names: string[] = []
  for (const [r, c] of boxesOfEdge(id)) {
    if (owners[boxIdx(r, c)] == null && sidesDrawn(edges, r, c) === 4) {
      owners[boxIdx(r, c)] = who
      claimed++
      names.push(cellName(r, c))
    }
  }
  const moves = s.moves + 1
  const who_s = who === 'you' ? 'You' : 'Rival'
  let log = claimed
    ? push(s.log, who === 'you' ? 'you' : 'ai', `${who_s} closed ${names.join(', ')} — go again.`)
    : push(s.log, who === 'you' ? 'you' : 'ai', `${who_s} drew an edge.`)

  if (moves >= allEdges().length) return finish(Object.assign({}, s, { moves }), edges, owners, log, id)

  // Completing a box grants another move to the SAME player; otherwise pass the turn.
  const next: Player = claimed ? who : (who === 'you' ? 'ai' : 'you')
  return Object.assign({}, s, { edges, owners, turn: next, last: id, moves, log })
}

// ===== AI =====
function undrawn(edges: Record<EdgeId, Player>): EdgeId[] {
  return allEdges().filter(e => !edges[e])
}

// Edges that, if drawn now, immediately complete at least one box.
function completingEdges(edges: Record<EdgeId, Player>, owners: Owner[], cand: EdgeId[]): EdgeId[] {
  return cand.filter(id => {
    for (const [r, c] of boxesOfEdge(id)) {
      if (owners[boxIdx(r, c)] == null && sidesDrawn(edges, r, c) === 3) return true
    }
    return false
  })
}

// A "safe" edge is one that doesn't bring any touched box to 3 sides (i.e. doesn't gift a box next turn).
function isSafe(edges: Record<EdgeId, Player>, owners: Owner[], id: EdgeId): boolean {
  const after = Object.assign({}, edges, { [id]: 'you' as Player })
  for (const [r, c] of boxesOfEdge(id)) {
    if (owners[boxIdx(r, c)] == null && sidesDrawn(after, r, c) === 3) return false
  }
  return true
}

// How many boxes the opponent could immediately complete after we play `id` (give-away cost proxy).
function giveawayCost(edges: Record<EdgeId, Player>, owners: Owner[], id: EdgeId): number {
  const after = Object.assign({}, edges, { [id]: 'ai' as Player })
  const rest = undrawn(after)
  let worst = 0
  for (const e of rest) {
    let gain = 0
    for (const [r, c] of boxesOfEdge(e)) {
      if (owners[boxIdx(r, c)] == null && sidesDrawn(after, r, c) === 3) gain++
    }
    if (gain > worst) worst = gain
  }
  return worst
}

const pick = <T,>(arr: T[]): T => arr[(Math.random() * arr.length) | 0]

export function aiMove(s: DotsState): DotsState {
  if (s.winner || s.turn !== 'ai') return s
  const cand = undrawn(s.edges)
  if (!cand.length) return s

  // (1) Take any free box.
  const completing = completingEdges(s.edges, s.owners, cand)
  if (completing.length) return drawEdge(s, pick(completing), 'ai')

  // (2) Prefer a safe edge that doesn't create a 3-sided box.
  const safe = cand.filter(id => isSafe(s.edges, s.owners, id))
  if (safe.length) return drawEdge(s, pick(safe), 'ai')

  // (3) Everything gives something away — pick the edge that gifts the fewest boxes.
  let best = Infinity
  const scored = cand.map(id => { const v = giveawayCost(s.edges, s.owners, id); if (v < best) best = v; return { id, v } })
  const least = scored.filter(o => o.v === best).map(o => o.id)
  return drawEdge(s, pick(least), 'ai')
}
