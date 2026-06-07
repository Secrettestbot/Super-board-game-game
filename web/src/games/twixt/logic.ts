/* TWIXT — the connection game (pure logic, built for this codebase).
   A 12x12 grid of holes. The four CORNER holes are unused. YOU (player 0) own the TOP and
   BOTTOM border rows and win by linking them top↔bottom; you may place in the top/bottom rows
   (not the corners) and the interior, never the left/right side columns. The AI (player 1) owns
   the LEFT and RIGHT border columns and wins by linking them left↔right; it may place in the
   side columns + interior, never the top/bottom rows.

   After a peg is placed we AUTO-ADD a LINK between it and every existing same-owner peg a
   knight's-move away (the 8 knight offsets) — UNLESS that link would CROSS an existing link
   (yours or the opponent's). A win is an unbroken chain of linked pegs joining the player's two
   borders, found by BFS over that player's own links.

   No React / no DOM here. */

export const N = 12

export type Owner = 0 | 1            // 0 = You (top/bottom) · 1 = AI (left/right)

export interface Link {
  owner: Owner
  a: number                          // hole index endpoint
  b: number                          // hole index endpoint
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface State {
  pegs: (Owner | null)[]             // length N*N, owner per hole or null when empty
  links: Link[]
  turn: Owner | null                 // whose turn, null when the game is over
  you: Owner                         // always 0 here, kept explicit
  winner: Owner | null
  last: number | null                // last placed hole (for highlight)
  win: number[]                      // connecting chain of holes on a win
  log: LogEntry[]
}

export const idx = (r: number, c: number) => r * N + c
export const rowOf = (i: number) => Math.floor(i / N)
export const colOf = (i: number) => i % N

const KNIGHT: [number, number][] = [
  [1, 2], [2, 1], [-1, 2], [-2, 1],
  [1, -2], [2, -1], [-1, -2], [-2, -1],
]

const other = (o: Owner): Owner => (o === 0 ? 1 : 0)

function isCorner(i: number): boolean {
  const r = rowOf(i), c = colOf(i)
  return (r === 0 || r === N - 1) && (c === 0 || c === N - 1)
}

/* A hole is legal for a player when it is empty, not a corner, and not inside the OPPONENT's
   border lines. You (0) may never place in the side columns; the AI (1) may never place in the
   top/bottom rows. */
export function isLegalHole(s: State, player: Owner, i: number): boolean {
  if (i < 0 || i >= N * N) return false
  if (s.pegs[i] != null) return false
  if (isCorner(i)) return false
  const r = rowOf(i), c = colOf(i)
  if (player === 0) {
    // forbidden: opponent's borders = left/right columns
    if (c === 0 || c === N - 1) return false
  } else {
    // forbidden: opponent's borders = top/bottom rows
    if (r === 0 || r === N - 1) return false
  }
  return true
}

export function legalHoles(s: State, player: Owner): number[] {
  const out: number[] = []
  for (let i = 0; i < N * N; i++) if (isLegalHole(s, player, i)) out.push(i)
  return out
}

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-24)
}

export function makeGame(): State {
  return {
    pegs: new Array(N * N).fill(null),
    links: [],
    turn: 0,
    you: 0,
    winner: null,
    last: null,
    win: [],
    log: [{ t: 'sys', x: 'You are Coral — link the TOP and BOTTOM rows. The rival (Teal) links LEFT and RIGHT.' }],
  }
}

/* ===== Segment crossing geometry =====
   Each link is a segment between two hole CENTRES (use (col, row) as (x, y)). Two links cross
   when their open segments properly intersect. Links that merely share an endpoint do NOT cross
   (legal in TwixT). We use the orientation / sign-of-cross-product test, and treat shared
   endpoints and pure collinear-overlap-through-a-shared-grid-point as non-crossing. */

function pt(i: number): [number, number] { return [colOf(i), rowOf(i)] }

function cross(ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number {
  // (a-o) x (b-o)
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox)
}

/* True if segment (a1,a2) and (b1,b2) properly cross. a1..b2 are hole indices. Shared endpoints
   are NOT a crossing. */
export function linksCross(a1: number, a2: number, b1: number, b2: number): boolean {
  // Shared endpoint → not a crossing.
  if (a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2) return false

  const [p1x, p1y] = pt(a1)
  const [p2x, p2y] = pt(a2)
  const [q1x, q1y] = pt(b1)
  const [q2x, q2y] = pt(b2)

  const d1 = cross(q1x, q1y, q2x, q2y, p1x, p1y)
  const d2 = cross(q1x, q1y, q2x, q2y, p2x, p2y)
  const d3 = cross(p1x, p1y, p2x, p2y, q1x, q1y)
  const d4 = cross(p1x, p1y, p2x, p2y, q2x, q2y)

  // Proper crossing: each segment straddles the line of the other.
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  // Collinear-overlap cases: with distinct knight links on a lattice these only arise as
  // touching/overlapping that shares no grid point we care about; treat the on-segment endpoint
  // case as a crossing only when an endpoint of one lies strictly inside the other.
  if (d1 === 0 && onSeg(q1x, q1y, q2x, q2y, p1x, p1y)) return true
  if (d2 === 0 && onSeg(q1x, q1y, q2x, q2y, p2x, p2y)) return true
  if (d3 === 0 && onSeg(p1x, p1y, p2x, p2y, q1x, q1y)) return true
  if (d4 === 0 && onSeg(p1x, p1y, p2x, p2y, q2x, q2y)) return true
  return false
}

// Is (px,py) strictly between segment endpoints (s..e), given it is collinear?
function onSeg(sx: number, sy: number, ex: number, ey: number, px: number, py: number): boolean {
  if (px <= Math.min(sx, ex) || px >= Math.max(sx, ex)) {
    if (sx !== ex) return false
  }
  if (py <= Math.min(sy, ey) || py >= Math.max(sy, ey)) {
    if (sy !== ey) return false
  }
  // strictly inside the bounding box and not equal to an endpoint
  const inX = px > Math.min(sx, ex) && px < Math.max(sx, ex)
  const inY = py > Math.min(sy, ey) && py < Math.max(sy, ey)
  if (sx === ex) return inY               // vertical
  if (sy === ey) return inX               // horizontal
  return inX && inY
}

// Would adding link (na,nb) cross ANY existing link in the list?
function crossesAny(links: Link[], na: number, nb: number): boolean {
  for (const l of links) {
    if (linksCross(na, nb, l.a, l.b)) return true
  }
  return false
}

/* Place a peg for `player` at hole `i` (must be the current turn and legal). Auto-adds every
   non-crossing knight link to existing same-owner pegs. Returns a new state. */
export function place(s: State, player: Owner, i: number): State {
  if (s.winner != null || s.turn !== player) return s
  if (!isLegalHole(s, player, i)) return s

  const pegs = s.pegs.slice()
  pegs[i] = player
  const links = s.links.slice()

  const r = rowOf(i), c = colOf(i)
  for (const [dr, dc] of KNIGHT) {
    const nr = r + dr, nc = c + dc
    if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue
    const j = idx(nr, nc)
    if (pegs[j] !== player) continue          // only link to same-owner pegs
    if (crossesAny(links, i, j)) continue      // skip links that would cross
    links.push({ owner: player, a: i, b: j })
  }

  const coord = `${'ABCDEFGHIJKL'[c]}${r + 1}`
  let log = push(s.log, player === s.you ? 'you' : 'ai',
    `${player === s.you ? 'You' : 'Rival'} placed at ${coord}.`)

  const chain = findWin(pegs, links, player)
  if (chain) {
    const youWon = player === s.you
    log = push(log, youWon ? 'you' : 'ai',
      youWon ? 'You link your borders — you win!' : 'Rival links its borders — rival wins.')
    return { ...s, pegs, links, turn: null, winner: player, last: i, win: chain, log }
  }

  return { ...s, pegs, links, turn: other(player), last: i, win: [], log }
}

/* ===== Connection BFS =====
   Build an adjacency map from this player's links only, then BFS from every peg sitting on the
   player's "start" border to any peg on the "goal" border. Returns the chain or null. */

// Pegs of `who` that lie on its start border: You = top row (r==0), AI = left column (c==0).
function startBorderPegs(pegs: (Owner | null)[], who: Owner): number[] {
  const out: number[] = []
  for (let i = 0; i < N * N; i++) {
    if (pegs[i] !== who) continue
    if (who === 0 ? rowOf(i) === 0 : colOf(i) === 0) out.push(i)
  }
  return out
}

function onGoalBorder(who: Owner, i: number): boolean {
  return who === 0 ? rowOf(i) === N - 1 : colOf(i) === N - 1
}

export function findWin(pegs: (Owner | null)[], links: Link[], who: Owner): number[] | null {
  const adj = new Map<number, number[]>()
  for (const l of links) {
    if (l.owner !== who) continue
    if (!adj.has(l.a)) adj.set(l.a, [])
    if (!adj.has(l.b)) adj.set(l.b, [])
    adj.get(l.a)!.push(l.b)
    adj.get(l.b)!.push(l.a)
  }
  const seen = new Set<number>()
  const prev = new Map<number, number>()
  const q: number[] = []
  for (const i of startBorderPegs(pegs, who)) { seen.add(i); q.push(i) }
  let head = 0, goal = -1
  while (head < q.length) {
    const i = q[head++]
    if (onGoalBorder(who, i)) { goal = i; break }
    for (const j of adj.get(i) ?? []) {
      if (!seen.has(j)) { seen.add(j); prev.set(j, i); q.push(j) }
    }
  }
  if (goal < 0) return null
  const path: number[] = []
  for (let cur = goal; cur !== -1; cur = prev.get(cur) ?? -1) {
    path.push(cur)
    if (!prev.has(cur)) break
  }
  return path
}

export function isConnected(s: State, player: Owner): boolean {
  return findWin(s.pegs, s.links, player) !== null
}

/* ===== AI (player 1, links left↔right) =====
   A connection-distance heuristic. For a player, run a 0-1-style BFS where being on one of your
   own pegs is "free" to traverse (cost 0 via your links + cost to hop to a useful empty hole),
   and we approximate remaining work by the number of empty holes still needed to bridge. We keep
   it simple and fast: score each candidate empty hole by how much it reduces our own
   connection-distance while not helping (and ideally hurting) the opponent. */

// Manhattan-ish column span heuristic for the AI: distance of a configuration toward left↔right.
// We use a peg-graph + virtual border BFS measuring the min number of extra pegs (knight hops)
// to bridge the two borders, where placing on an empty legal hole costs 1 and traversing an
// existing same-owner link costs 0.
function connectionCost(pegs: (Owner | null)[], links: Link[], who: Owner): number {
  // Node = hole index. We allow movement either along an existing same-owner link (cost 0) OR a
  // knight hop to a hole that is empty-and-legal-for `who` or already a `who` peg (cost 1 if we
  // must "create" the peg, i.e. the target is empty). Opponent pegs block.
  const opp = other(who)
  const linkAdj = new Map<number, number[]>()
  for (const l of links) {
    if (l.owner !== who) continue
    if (!linkAdj.has(l.a)) linkAdj.set(l.a, [])
    if (!linkAdj.has(l.b)) linkAdj.set(l.b, [])
    linkAdj.get(l.a)!.push(l.b)
    linkAdj.get(l.b)!.push(l.a)
  }
  const passable = (i: number): boolean => pegs[i] !== opp        // not blocked by opponent
  const dist = new Array(N * N).fill(Infinity)
  // 0-1 BFS deque
  const deque: number[] = []
  // seed: start-border holes that are passable. Cost 0 if already our peg, else 1 to place.
  for (let i = 0; i < N * N; i++) {
    const onStart = who === 0 ? rowOf(i) === 0 : colOf(i) === 0
    if (!onStart) continue
    if (isCorner(i)) continue
    if (!passable(i)) continue
    const w = pegs[i] === who ? 0 : 1
    if (w < dist[i]) { dist[i] = w; if (w === 0) deque.unshift(i); else deque.push(i) }
  }
  let best = Infinity
  while (deque.length) {
    const i = deque.shift()!
    const d = dist[i]
    if (d > dist[i]) continue
    if (onGoalBorder(who, i)) { if (d < best) best = d; continue }
    // 0-cost: existing same-owner links
    for (const j of linkAdj.get(i) ?? []) {
      if (!passable(j)) continue
      if (d < dist[j]) { dist[j] = d; deque.unshift(j) }
    }
    // knight hops: only meaningful if a link could be added (it would not cross). We approximate
    // by ignoring crossing here for speed — the cost estimate stays admissible enough to guide.
    const r = rowOf(i), c = colOf(i)
    for (const [dr, dc] of KNIGHT) {
      const nr = r + dr, nc = c + dc
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue
      const j = idx(nr, nc)
      if (!passable(j)) continue
      if (pegs[j] !== who && !isHolePlaceable(pegs, who, j)) continue
      const step = pegs[j] === who ? 0 : 1
      const nd = d + step
      if (nd < dist[j]) { dist[j] = nd; if (step === 0) deque.unshift(j); else deque.push(j) }
    }
  }
  return best
}

// Could `who` legally place a peg at empty hole i? (peg-array variant of isLegalHole, no State.)
function isHolePlaceable(pegs: (Owner | null)[], who: Owner, i: number): boolean {
  if (pegs[i] != null) return false
  if (isCorner(i)) return false
  const r = rowOf(i), c = colOf(i)
  if (who === 0) return c !== 0 && c !== N - 1
  return r !== 0 && r !== N - 1
}

/* AI turn: player 1. Checks an immediate win, blocks the opponent's immediate win, else picks the
   legal hole that best improves (opp connection cost − own connection cost). */
export function aiTurn(s: State): State {
  if (s.winner != null || s.turn !== 1) return s
  const me: Owner = 1, opp: Owner = 0
  const legal = legalHoles(s, me)
  if (!legal.length) return s

  // 1) Immediate win.
  for (const i of legal) {
    const t = simPlace(s, me, i)
    if (findWin(t.pegs, t.links, me)) return place(s, me, i)
  }
  // 2) Block opponent's immediate win: if the opponent could win next at hole k, and we can take
  //    k (it must be legal for us too), do it.
  const oppLegal = legalHoles(s, opp)
  for (const k of oppLegal) {
    const t = simPlace(s, opp, k)
    if (findWin(t.pegs, t.links, opp) && isLegalHole(s, me, k)) {
      return place(s, me, k)
    }
  }

  // 3) Heuristic: maximise oppCost - myCost after our move.
  let bestV = -Infinity
  const scored: { i: number; v: number }[] = []
  for (const i of legal) {
    const t = simPlace(s, me, i)
    const myC = connectionCost(t.pegs, t.links, me)
    const opC = connectionCost(t.pegs, t.links, opp)
    const v = (opC === Infinity ? 50 : opC) - (myC === Infinity ? 50 : myC) + Math.random() * 0.01
    scored.push({ i, v })
    if (v > bestV) bestV = v
  }
  const top = scored.filter(o => o.v >= bestV - 1e-9).map(o => o.i)
  const choice = top.length ? top[(Math.random() * top.length) | 0] : legal[0]
  return place(s, me, choice)
}

// Lightweight placement used only for evaluation (adds non-crossing knight links, no logging/win
// short-circuit needed beyond pegs+links).
function simPlace(s: State, player: Owner, i: number): { pegs: (Owner | null)[]; links: Link[] } {
  const pegs = s.pegs.slice()
  pegs[i] = player
  const links = s.links.slice()
  const r = rowOf(i), c = colOf(i)
  for (const [dr, dc] of KNIGHT) {
    const nr = r + dr, nc = c + dc
    if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue
    const j = idx(nr, nc)
    if (pegs[j] !== player) continue
    if (crossesAny(links, i, j)) continue
    links.push({ owner: player, a: i, b: j })
  }
  return { pegs, links }
}
