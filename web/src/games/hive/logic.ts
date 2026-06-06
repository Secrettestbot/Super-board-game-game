/* HIVE — pure logic (built for this codebase).

   Two players (0 = You, 1 = AI) build an interlocking "hive" of hexagonal insect tiles on an
   OPEN axial-hex field (no board). Each side has 11 pieces: 1 QUEEN, 2 SPIDERS, 2 BEETLES,
   3 GRASSHOPPERS, 3 ANTS. On a turn you either PLACE a piece from your hand or MOVE a placed one.

   COORDS — pointy-top axial (q, r). The six neighbour directions are:
     E (+1,0) · W (-1,0) · NE (+1,-1) · SW (-1,+1) · NW (0,-1) · SE (0,+1)
   A hex key is "q,r". A cell holds a STACK of pieces (top piece controls the hex — beetles climb).

   PLACEMENT — a new piece must touch ≥1 of YOUR pieces and touch NO opponent piece (except the
   very first placement of each player). Queen must be down by your 4th turn.

   MOVEMENT (only after your queen is placed) honours TWO global constraints:
     ONE-HIVE  — the hive must stay fully connected; a piece can't leave if removing it splits the
                 hive, and every intermediate sliding step must keep the slider attached to the hive.
     FREEDOM-TO-MOVE — a sliding step from A to B (adjacent ground hexes) is blocked if BOTH hexes
                 shared by A and B are occupied (you can't squeeze through a 1-wide gap).
   Per-piece: QUEEN slides 1 · SPIDER slides exactly 3 (no backtrack) · ANT slides any distance ·
   GRASSHOPPER jumps a straight line over ≥1 contiguous pieces to the first empty hex · BEETLE
   steps 1 and may climb onto a stack (and back down); on top it ignores freedom-to-move/one-hive.

   WIN — a queen with all 6 neighbours occupied is surrounded; that player loses. Both at once = draw.

   NO React / DOM here. */

export type Player = 0 | 1
export type PieceType = 'Q' | 'S' | 'B' | 'G' | 'A'   // Queen Spider Beetle Grasshopper Ant
export interface Piece { owner: Player; type: PieceType }
export type Hex = string                               // "q,r"

export interface Move {
  kind: 'place' | 'move'
  type: PieceType            // piece type involved (for placement: from hand)
  to: Hex
  from?: Hex                 // for moves
}

export interface HiveState {
  cells: Record<Hex, Piece[]>          // hex -> stack (index 0 = bottom, last = top)
  hands: [Record<PieceType, number>, Record<PieceType, number>]
  turn: Player                         // whose turn
  turnNo: [number, number]             // completed turns per player (0-based count of turns taken)
  winner: Player | 'draw' | null
  last: Hex | null                     // last touched hex (for highlight / AI tick)
  log: { t: string; x: string }[]
}

export const TYPES: PieceType[] = ['Q', 'S', 'B', 'G', 'A']
export const TYPE_NAME: Record<PieceType, string> = {
  Q: 'Queen Bee', S: 'Spider', B: 'Beetle', G: 'Grasshopper', A: 'Ant',
}
const FULL_HAND: Record<PieceType, number> = { Q: 1, S: 2, B: 2, G: 3, A: 3 }

// pointy-top axial neighbour offsets, in a fixed rotational order
export const DIRS: [number, number][] = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
]

export const key = (q: number, r: number): Hex => q + ',' + r
export function parse(h: Hex): [number, number] {
  const i = h.indexOf(',')
  return [parseInt(h.slice(0, i), 10), parseInt(h.slice(i + 1), 10)]
}
export function neighbors(h: Hex): Hex[] {
  const [q, r] = parse(h)
  return DIRS.map(([dq, dr]) => key(q + dq, r + dr))
}
export const other = (p: Player): Player => (p === 0 ? 1 : 0)

function clone(s: HiveState): HiveState {
  const cells: Record<Hex, Piece[]> = {}
  for (const k in s.cells) cells[k] = s.cells[k].slice()
  return {
    cells,
    hands: [{ ...s.hands[0] }, { ...s.hands[1] }],
    turn: s.turn,
    turnNo: [s.turnNo[0], s.turnNo[1]],
    winner: s.winner,
    last: s.last,
    log: s.log.slice(-30),
  }
}

export function makeGame(): HiveState {
  return {
    cells: {},
    hands: [{ ...FULL_HAND }, { ...FULL_HAND }],
    turn: 0,
    turnNo: [0, 0],
    winner: null,
    last: null,
    log: [{ t: 'sys', x: 'Place a tile to start the hive. Your Queen must be down by your 4th turn.' }],
  }
}

// --- board queries -------------------------------------------------------

export const occupied = (s: HiveState, h: Hex): boolean => (s.cells[h]?.length ?? 0) > 0
export const stackHeight = (s: HiveState, h: Hex): number => s.cells[h]?.length ?? 0
export function topPiece(s: HiveState, h: Hex): Piece | null {
  const st = s.cells[h]
  return st && st.length ? st[st.length - 1] : null
}
export function allHexes(s: HiveState): Hex[] {
  return Object.keys(s.cells).filter(h => s.cells[h].length > 0)
}

// True if removing all pieces at `omit` would still leave the remaining hive connected.
// (Used for the one-hive rule when a ground piece picks up to move.)
export function isConnectedWithout(s: HiveState, omit: Hex): boolean {
  const hexes = allHexes(s).filter(h => h !== omit)
  if (hexes.length <= 1) return true
  const set = new Set(hexes)
  const start = hexes[0]
  const seen = new Set<Hex>([start])
  const stack = [start]
  while (stack.length) {
    const h = stack.pop()!
    for (const n of neighbors(h)) {
      if (set.has(n) && !seen.has(n)) { seen.add(n); stack.push(n) }
    }
  }
  return seen.size === hexes.length
}

// Whole-hive connectivity given an explicit occupancy set (used to validate slide steps).
function connectedSet(set: Set<Hex>): boolean {
  if (set.size <= 1) return true
  const it = set.values().next().value as Hex
  const seen = new Set<Hex>([it])
  const stack = [it]
  while (stack.length) {
    const h = stack.pop()!
    for (const n of neighbors(h)) if (set.has(n) && !seen.has(n)) { seen.add(n); stack.push(n) }
  }
  return seen.size === set.size
}

// --- freedom-to-move + ground sliding ------------------------------------

// The two hexes shared by adjacent ground hexes a & b (their common neighbours).
function shared(a: Hex, b: Hex): Hex[] {
  const an = new Set(neighbors(a))
  return neighbors(b).filter(h => an.has(h))
}

// Can a ground piece SLIDE from `a` to adjacent empty `b`, given an occupancy set `occ`
// that EXCLUDES the moving piece? Requires: b empty; at least one shared neighbour empty
// (freedom-to-move); and b touches the hive (stays attached) — the slider must keep contact.
function canSlideStep(a: Hex, b: Hex, occ: Set<Hex>): boolean {
  if (occ.has(b)) return false
  const sh = shared(a, b)
  // freedom-to-move: both gateway hexes occupied → blocked
  const blocked = sh.length === 2 && sh.every(h => occ.has(h))
  if (blocked) return false
  // stay attached to the hive: b must touch some occupied hex other than a-as-origin.
  // (a is excluded from occ; require b adjacent to ≥1 occupied hex)
  for (const n of neighbors(b)) if (occ.has(n)) return true
  return false
}

// --- per-piece move generators -------------------------------------------
// Each returns the set of legal destination hexes (one-hive + freedom enforced).

function queenMoves(s: HiveState, from: Hex): Hex[] {
  if (!isConnectedWithout(s, from)) return []
  const occ = new Set(allHexes(s)); occ.delete(from)
  const out: Hex[] = []
  for (const n of neighbors(from)) if (canSlideStep(from, n, occ)) out.push(n)
  return out
}

function antMoves(s: HiveState, from: Hex): Hex[] {
  if (!isConnectedWithout(s, from)) return []
  const occ = new Set(allHexes(s)); occ.delete(from)
  const seen = new Set<Hex>()
  const queue: Hex[] = [from]
  const visited = new Set<Hex>([from])
  while (queue.length) {
    const cur = queue.shift()!
    for (const n of neighbors(cur)) {
      if (visited.has(n)) continue
      if (canSlideStep(cur, n, occ)) {
        visited.add(n); seen.add(n); queue.push(n)
      }
    }
  }
  seen.delete(from)
  return [...seen]
}

function spiderMoves(s: HiveState, from: Hex): Hex[] {
  if (!isConnectedWithout(s, from)) return []
  const occ = new Set(allHexes(s)); occ.delete(from)
  // exactly 3 slide steps, no revisiting (no backtracking along the path)
  const results = new Set<Hex>()
  const walk = (cur: Hex, path: Set<Hex>, depth: number) => {
    if (depth === 3) { results.add(cur); return }
    for (const n of neighbors(cur)) {
      if (path.has(n)) continue
      if (canSlideStep(cur, n, occ)) {
        path.add(n)
        walk(n, path, depth + 1)
        path.delete(n)
      }
    }
  }
  walk(from, new Set([from]), 0)
  results.delete(from)
  return [...results]
}

function grasshopperMoves(s: HiveState, from: Hex): Hex[] {
  if (!isConnectedWithout(s, from)) return []
  const occ = new Set(allHexes(s))   // grasshopper jumps over pieces; from-piece itself irrelevant
  const [q, r] = parse(from)
  const out: Hex[] = []
  for (const [dq, dr] of DIRS) {
    let cq = q + dq, cr = r + dr
    if (!occ.has(key(cq, cr))) continue      // must jump over ≥1 piece immediately
    while (occ.has(key(cq, cr))) { cq += dq; cr += dr }
    out.push(key(cq, cr))                     // first empty hex in line
  }
  return out
}

function beetleMoves(s: HiveState, from: Hex): Hex[] {
  const height = stackHeight(s, from)
  // On top of a stack (height>1) the beetle is part of every neighbour's connectivity, and
  // a stack can never disconnect the hive by leaving (something stays). On the ground, normal
  // one-hive check applies.
  if (height === 1 && !isConnectedWithout(s, from)) return []
  const occ = new Set(allHexes(s)); occ.delete(from)
  const out: Hex[] = []
  for (const n of neighbors(from)) {
    const nh = stackHeight(s, n)
    if (nh > 0) {
      // climb on top — always allowed (no freedom-to-move at height); stays connected
      out.push(n)
    } else {
      // step down to empty ground: freedom-to-move using STACK heights at the gateways.
      // Gateway is blocking only if BOTH gateways are at least as tall as the lower of from/to
      // surfaces. Simplify with ground rule but allow if either gateway is empty OR shorter.
      const sh = shared(from, n)
      const fromSurface = Math.max(height - 1, 0)   // height after lifting beetle would be...
      // freedom-to-move (ground): both gateways occupied blocks unless beetle is descending over them.
      // Use a height-aware gate: blocked if both gateways' top height > max(fromSurface, toSurface=0)
      let blocked = false
      if (sh.length === 2) {
        const g1 = stackHeight(s, sh[0]), g2 = stackHeight(s, sh[1])
        const climbLevel = Math.max(fromSurface, 0)
        if (g1 > climbLevel && g2 > climbLevel) blocked = true
        else if (g1 > 0 && g2 > 0 && fromSurface === 0) blocked = true
      }
      if (blocked) continue
      // stay attached
      let attached = false
      for (const nn of neighbors(n)) if (occ.has(nn) || nn === from) { attached = true; break }
      if (attached) out.push(n)
    }
  }
  return out
}

export function legalMoves(s: HiveState, from: Hex): Hex[] {
  const p = topPiece(s, from)
  if (!p) return []
  if (p.owner !== s.turn) return []
  if (!queenPlaced(s, s.turn)) return []          // can't move until your queen is down
  if (s.winner != null) return []
  switch (p.type) {
    case 'Q': return queenMoves(s, from)
    case 'A': return antMoves(s, from)
    case 'S': return spiderMoves(s, from)
    case 'G': return grasshopperMoves(s, from)
    case 'B': return beetleMoves(s, from)
  }
}

// --- placement -----------------------------------------------------------

export function queenPlaced(s: HiveState, p: Player): boolean {
  for (const h of allHexes(s)) {
    for (const piece of s.cells[h]) if (piece.owner === p && piece.type === 'Q') return true
  }
  return false
}

function piecesOnBoard(s: HiveState, p: Player): number {
  let n = 0
  for (const h of allHexes(s)) for (const pc of s.cells[h]) if (pc.owner === p) n++
  return n
}

// Hexes where player p may PLACE a new tile.
export function legalPlacements(s: HiveState, p: Player): Hex[] {
  if (s.winner != null) return []
  const board = allHexes(s)
  // Opening: very first placement of each player.
  if (piecesOnBoard(s, p) === 0) {
    if (board.length === 0) return [key(0, 0)]
    // player 1's first piece: any empty hex touching the existing (single) hive — touches opponent is OK on opening
    const cand = new Set<Hex>()
    for (const h of board) for (const n of neighbors(h)) if (!occupied(s, n)) cand.add(n)
    return [...cand]
  }
  // Normal: empty hex touching ≥1 own piece and 0 opponent pieces.
  const cand = new Set<Hex>()
  for (const h of board) {
    const top = topPiece(s, h)
    if (top && top.owner === p) for (const n of neighbors(h)) if (!occupied(s, n)) cand.add(n)
  }
  const out: Hex[] = []
  for (const h of cand) {
    let touchesOpp = false
    for (const n of neighbors(h)) {
      const t = topPiece(s, n)
      if (t && t.owner === other(p)) { touchesOpp = true; break }
    }
    if (!touchesOpp) out.push(h)
  }
  return out
}

// Which piece TYPES can player p legally place this turn (queen-by-4 rule).
export function placeableTypes(s: HiveState, p: Player): PieceType[] {
  const hand = s.hands[p]
  const have = TYPES.filter(t => hand[t] > 0)
  // turnNo[p] counts completed turns; this is their (turnNo+1)-th turn.
  const thisTurn = s.turnNo[p] + 1
  if (thisTurn >= 4 && !queenPlaced(s, p) && hand.Q > 0) return ['Q']   // must place queen now
  return have
}

// --- apply ---------------------------------------------------------------

export function isQueenSurrounded(s: HiveState, p: Player): boolean {
  let qh: Hex | null = null
  for (const h of allHexes(s)) {
    for (const piece of s.cells[h]) if (piece.owner === p && piece.type === 'Q') { qh = h }
  }
  if (qh == null) return false
  for (const n of neighbors(qh)) if (!occupied(s, n)) return false
  return true
}

function checkWinner(s: HiveState): Player | 'draw' | null {
  const s0 = isQueenSurrounded(s, 0)
  const s1 = isQueenSurrounded(s, 1)
  if (s0 && s1) return 'draw'
  if (s0) return 1   // player 0's queen surrounded → player 1 wins
  if (s1) return 0
  return null
}

function push(log: HiveState['log'], t: string, x: string) {
  return log.concat([{ t, x }]).slice(-30)
}

export function applyMove(s: HiveState, m: Move): HiveState {
  const ns = clone(s)
  const p = ns.turn
  if (m.kind === 'place') {
    if (!ns.cells[m.to]) ns.cells[m.to] = []
    ns.cells[m.to].push({ owner: p, type: m.type })
    ns.hands[p][m.type] = Math.max(0, ns.hands[p][m.type] - 1)
    ns.log = push(ns.log, p === 0 ? 'you' : 'ai',
      `${p === 0 ? 'You' : 'AI'} placed ${TYPE_NAME[m.type]}`)
  } else {
    const from = m.from!
    const st = ns.cells[from]
    const piece = st.pop()!                       // move the TOP piece
    if (st.length === 0) delete ns.cells[from]
    if (!ns.cells[m.to]) ns.cells[m.to] = []
    ns.cells[m.to].push(piece)
    ns.log = push(ns.log, p === 0 ? 'you' : 'ai',
      `${p === 0 ? 'You' : 'AI'} moved ${TYPE_NAME[piece.type]}`)
  }
  ns.last = m.to
  ns.turnNo[p] = ns.turnNo[p] + 1
  const w = checkWinner(ns)
  if (w != null) {
    ns.winner = w
    ns.log = push(ns.log, 'sys', w === 'draw' ? 'Both queens surrounded — draw.' :
      w === 0 ? 'You surrounded the rival queen — you win!' : 'Your queen is surrounded — you lose.')
  }
  ns.turn = other(p)
  return ns
}

// All legal moves for a player (placements + piece moves).
export function allLegalMoves(s: HiveState, p: Player): Move[] {
  if (s.winner != null) return []
  const out: Move[] = []
  const types = placeableTypes(s, p)
  if (types.length) {
    const spots = legalPlacements(s, p)
    for (const t of types) for (const to of spots) out.push({ kind: 'place', type: t, to })
  }
  if (queenPlaced(s, p)) {
    for (const h of allHexes(s)) {
      const top = topPiece(s, h)
      if (!top || top.owner !== p) continue
      for (const to of legalMoves(s, h)) out.push({ kind: 'move', type: top.type, from: h, to })
    }
  }
  return out
}

// --- AI ------------------------------------------------------------------
// Heuristic: maximise pressure on the enemy queen (fill its neighbours), keep our own queen
// safe, and mobilise. 1-ply greedy with a light static eval; ties broken deterministically.

function enemyQueenHex(s: HiveState, p: Player): Hex | null {
  const e = other(p)
  for (const h of allHexes(s)) for (const pc of s.cells[h]) if (pc.owner === e && pc.type === 'Q') return h
  return null
}
function myQueenHex(s: HiveState, p: Player): Hex | null {
  for (const h of allHexes(s)) for (const pc of s.cells[h]) if (pc.owner === p && pc.type === 'Q') return h
  return null
}
function surroundCount(s: HiveState, qh: Hex | null): number {
  if (!qh) return 0
  let n = 0
  for (const nb of neighbors(qh)) if (occupied(s, nb)) n++
  return n
}

function evalState(s: HiveState, p: Player): number {
  // From p's perspective. Higher = better.
  const w = s.winner
  if (w === p) return 1e6
  if (w === other(p)) return -1e6
  if (w === 'draw') return -1e5
  const eq = enemyQueenHex(s, p)
  const mq = myQueenHex(s, p)
  const enemyPressure = surroundCount(s, eq)      // want HIGH
  const ownPressure = surroundCount(s, mq)        // want LOW
  let score = enemyPressure * 40 - ownPressure * 34
  // mobility: number of our legal moves (cheap proxy — count placeable + a few piece moves)
  // small nudge to develop the queen early & keep pieces free
  score += (queenPlaced(s, p) ? 6 : 0)
  // proximity: reward placing/moving near the enemy queen
  return score
}

export function aiTurn(s: HiveState): HiveState {
  if (s.winner != null || s.turn !== 1) return s
  const p: Player = 1
  const moves = allLegalMoves(s, p)
  if (!moves.length) {
    // no legal move: pass (advance turn) to avoid lock-up
    const ns = clone(s)
    ns.turnNo[p] = ns.turnNo[p] + 1
    ns.turn = other(p)
    ns.log = push(ns.log, 'ai', 'AI has no legal move — passes')
    return ns
  }
  let best = -Infinity
  let bestMove = moves[0]
  for (const m of moves) {
    const after = applyMove(s, m)
    let sc = evalState(after, p)
    // 1-ply look at opponent's best reply pressure on our queen (cheap)
    if (after.winner == null) {
      const eq = enemyQueenHex(after, p)
      // bonus for moves that touch / approach the enemy queen
      if (eq) {
        let adj = false
        for (const nb of neighbors(eq)) if (nb === m.to) adj = true
        if (adj) sc += 12
      }
    }
    // deterministic tie-break: prefer placements early, prefer lexicographically smaller hex
    if (sc > best || (sc === best && m.to < bestMove.to)) { best = sc; bestMove = m }
  }
  return applyMove(s, bestMove)
}

export const winner = (s: HiveState) => s.winner
