/* ZÈRTZ — logic (built for this codebase, not ported).
   A GIPF-project marble-capture game on a SHRINKING hexagonal board of 37 spaces
   (a hexagon of side 4 → axial radius 3: |q|,|r|,|q+r| <= 3). Marbles come from a
   SHARED, NEUTRAL supply in three colours (white / grey / black); they belong to
   no one until captured.

   A turn is exactly ONE of:
     (a) PLACE + REMOVE — place a marble of any available colour on an empty space,
         then remove ONE free EDGE space from the board (an empty space that can slide
         out: empty AND with at least one missing neighbour direction). The board shrinks.
     (b) CAPTURE — if any jump exists you MUST capture instead of placing: a marble
         jumps over an ADJACENT marble into the empty space directly beyond (straight
         hex line); the jumped marble goes to the mover's captured pile. Captures CHAIN
         (the same marble keeps jumping while jumps remain).

   ISOLATION: when removing a space cuts off a region whose every space holds a marble,
   those marbles are captured by the player who caused the isolation.

   WIN: first to a winning SET — 3 of one colour, OR 1 of each of the three colours.

   Player 0 = you, Player 1 = AI. Coords/counts/players can be 0 — never truthiness-test
   them; compare with == null / != null and === 0.  */

export type Color = 'w' | 'g' | 'k'    // white / grey / black
export const COLORS: Color[] = ['w', 'g', 'k']
export type Player = 0 | 1
export interface LogEntry { t: string; x: string }

export type Key = string
export interface Hex { q: number; r: number }

export type Counts = Record<Color, number>
export const zeroCounts = (): Counts => ({ w: 0, g: 0, k: 0 })

export interface ZertzState {
  /** Every space that is still ON the board → marble colour, or null when empty. */
  board: Record<Key, Color | null>
  /** Spaces removed from the board (no longer playable). */
  removed: Record<Key, true>
  /** Shared neutral supply still available to place. */
  supply: Counts
  /** Per-player captured marbles. captured[0] = you, captured[1] = ai. */
  captured: [Counts, Counts]
  turn: Player
  you: Player
  winner: Player | null
  /** Spaces touched by the last action (for highlight). */
  last: Key[]
  log: LogEntry[]
}

export const RADIUS = 3

// Six axial neighbour directions.
export const DIRS: Hex[] = [
  { q: 1, r: 0 }, { q: -1, r: 0 },
  { q: 0, r: 1 }, { q: 0, r: -1 },
  { q: 1, r: -1 }, { q: -1, r: 1 },
]

export const key = (q: number, r: number): Key => q + ',' + r
export const parseKey = (k: Key): Hex => { const [q, r] = k.split(',').map(Number); return { q, r } }
const inHex = (q: number, r: number) => Math.abs(q) <= RADIUS && Math.abs(r) <= RADIUS && Math.abs(q + r) <= RADIUS

/** Every space of the full starting hexagon. */
export function allCells(): Hex[] {
  const out: Hex[] = []
  for (let q = -RADIUS; q <= RADIUS; q++)
    for (let r = -RADIUS; r <= RADIUS; r++)
      if (inHex(q, r)) out.push({ q, r })
  return out
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-30) }

export const colorName = (c: Color): string => c === 'w' ? 'white' : c === 'g' ? 'grey' : 'black'

export function makeGame(): ZertzState {
  const board: Record<Key, Color | null> = {}
  for (const { q, r } of allCells()) board[key(q, r)] = null
  return {
    board,
    removed: {},
    supply: { w: 6, g: 10, k: 10 },
    captured: [zeroCounts(), zeroCounts()],
    turn: 0,
    you: 0,
    winner: null,
    last: [],
    log: [{ t: 'sys', x: 'You move first. Place a marble + slide an edge ring away — or, when a jump is open, you MUST leap to capture. Win a set: 3 of a colour, or 1 of each.' }],
  }
}

/** Is this space still part of the board (not removed)? */
export function onBoard(s: ZertzState, k: Key): boolean {
  return k in s.board && !(k in s.removed)
}

/** Neighbouring spaces that are still on the board. */
export function neighbors(s: ZertzState, k: Key): Key[] {
  const h = parseKey(k)
  const out: Key[] = []
  for (const d of DIRS) {
    const nk = key(h.q + d.q, h.r + d.r)
    if (onBoard(s, nk)) out.push(nk)
  }
  return out
}

/** All live spaces. */
export function liveCells(s: ZertzState): Key[] {
  return Object.keys(s.board).filter(k => onBoard(s, k))
}

export function emptyCells(s: ZertzState): Key[] {
  return liveCells(s).filter(k => s.board[k] == null)
}

/** Any marble still available in the shared supply OR already captured (rule fallback). */
export function availableColors(s: ZertzState): Color[] {
  return COLORS.filter(c => s.supply[c] > 0)
}

/** Is the given marble currently capture-able via a jump by any-coloured marble?  */

/* ───────── Removable (edge) detection ─────────
   A space is removable if it is on the board, EMPTY, and is on the edge — i.e. it has
   at least one of the six hex directions where the neighbour is NOT on the board, so it
   can slide outward. Spaces fully surrounded by live spaces cannot be removed. */
export function removableCells(s: ZertzState): Key[] {
  return emptyCells(s).filter(k => isRemovable(s, k))
}

export function isRemovable(s: ZertzState, k: Key): boolean {
  if (!onBoard(s, k) || s.board[k] != null) return false
  const h = parseKey(k)
  for (const d of DIRS) {
    const nk = key(h.q + d.q, h.r + d.r)
    if (!onBoard(s, nk)) return true   // an open side → can slide out
  }
  return false
}

/* ───────── Captures (jumps) ─────────
   A jump: a marble on `from` leaps over a marble on the adjacent `over` into the empty
   `to` directly beyond, in a straight hex line. Captures are MANDATORY and chain. */
export interface Jump { from: Key; over: Key; to: Key }

export function jumpsFrom(s: ZertzState, from: Key): Jump[] {
  if (s.board[from] == null) return []
  const h = parseKey(from)
  const out: Jump[] = []
  for (const d of DIRS) {
    const over = key(h.q + d.q, h.r + d.r)
    const to = key(h.q + 2 * d.q, h.r + 2 * d.r)
    if (onBoard(s, over) && s.board[over] != null && onBoard(s, to) && s.board[to] == null) {
      out.push({ from, over, to })
    }
  }
  return out
}

/** All single jumps available to `player` (jumps use any marble on the board — they are neutral). */
export function legalCaptures(s: ZertzState, _player: Player): Jump[] {
  const out: Jump[] = []
  for (const k of liveCells(s)) {
    if (s.board[k] != null) out.push(...jumpsFrom(s, k))
  }
  return out
}

/** True when the current player is FORCED to capture (a jump exists). */
export function mustCapture(s: ZertzState): boolean {
  return legalCaptures(s, s.turn).length > 0
}

/* ───────── Place + Remove moves ───────── */
export interface PlaceRemove { color: Color; place: Key; remove: Key | null }

/** All legal place+remove combos (only when no capture is forced). */
export function legalPlaceRemove(s: ZertzState): PlaceRemove[] {
  if (s.winner != null) return []
  if (mustCapture(s)) return []
  const colors = availableColors(s)
  if (colors.length === 0) return []
  const empties = emptyCells(s)
  const out: PlaceRemove[] = []
  for (const place of empties) {
    // after placing, which spaces can still be removed? (the placed one no longer empty)
    const removables = empties.filter(e => e !== place && isRemovable(s, e))
    if (removables.length === 0) {
      // can't remove anything → place with no removal still allowed (board can't shrink)
      for (const c of colors) out.push({ color: c, place, remove: null })
    } else {
      for (const c of colors) for (const rem of removables) out.push({ color: c, place, remove: rem })
    }
  }
  return out
}

/* ───────── Winning-set detection ───────── */
export function hasWinningSet(c: Counts): boolean {
  if (c.w >= 3 || c.g >= 3 || c.k >= 3) return true
  if (c.w >= 1 && c.g >= 1 && c.k >= 1) return true
  return false
}

/* ───────── Isolation capture ─────────
   After a removal, find connected components of live spaces. Any component whose every
   space is FILLED (holds a marble) is isolated — those marbles go to `player`. We never
   touch the component that is still "open" (contains an empty space); if the WHOLE board
   is filled it counts as isolated too (standard rule). Returns the new state. */
export function checkIsolation(s: ZertzState, player: Player): ZertzState {
  const cells = liveCells(s)
  const seen = new Set<Key>()
  let board = s.board
  const captured: [Counts, Counts] = [{ ...s.captured[0] }, { ...s.captured[1] }]
  const grabbed: Key[] = []
  let took = false

  for (const start of cells) {
    if (seen.has(start)) continue
    // flood fill this component
    const comp: Key[] = []
    const stack = [start]
    seen.add(start)
    let allFilled = true
    while (stack.length) {
      const cur = stack.pop()!
      comp.push(cur)
      if (board[cur] == null) allFilled = false
      for (const nb of neighbors(s, cur)) {
        if (!seen.has(nb)) { seen.add(nb); stack.push(nb) }
      }
    }
    // A component is "isolated and captured" only if every space holds a marble.
    if (allFilled && comp.length > 0) {
      if (board === s.board) board = { ...s.board }
      for (const cell of comp) {
        const col = board[cell]
        if (col != null) { captured[player][col]++; grabbed.push(cell); board[cell] = null; took = true }
      }
    }
  }

  if (!took) return s
  return { ...s, board, captured, last: [...s.last, ...grabbed] }
}

/* ───────── Apply: PLACE + REMOVE ───────── */
export function applyPlaceRemove(s: ZertzState, color: Color, place: Key, remove: Key | null): ZertzState {
  if (s.winner != null || s.turn !== s.you && false) { /* allow either player via turn check below */ }
  if (s.winner != null) return s
  if (mustCapture(s)) return s            // capture is forced — this move is illegal
  if (!onBoard(s, place) || s.board[place] != null) return s
  if (s.supply[color] <= 0) return s
  const player = s.turn

  const board = { ...s.board }
  board[place] = color
  const supply = { ...s.supply, [color]: s.supply[color] - 1 }
  const removed = { ...s.removed }
  const last: Key[] = [place]

  let removeValid = false
  if (remove != null) {
    // must still be removable AFTER placing (placed space is now filled, so it can't be the removed one)
    const tmp: ZertzState = { ...s, board, removed }
    if (remove !== place && isRemovable(tmp, remove)) {
      removed[remove] = true
      removeValid = true
      last.push(remove)
    }
  }

  const name = player === s.you ? 'You' : 'Rival'
  let log = push(s.log, player === s.you ? 'you' : 'ai',
    `${name} placed a ${colorName(color)} marble${removeValid ? ' and slid a ring off the edge.' : '.'}`)

  let ns: ZertzState = { ...s, board, supply, removed, last, log }
  // isolation only possible when a ring was actually removed
  if (removeValid) {
    const before = ns.captured[player]
    ns = checkIsolation(ns, player)
    const after = ns.captured[player]
    const gained = (after.w - before.w) + (after.g - before.g) + (after.k - before.k)
    if (gained > 0) ns = { ...ns, log: push(ns.log, player === s.you ? 'you' : 'ai', `${name} isolated and captured ${gained} marble${gained > 1 ? 's' : ''}!`) }
  }

  return finishTurn(ns, player)
}

/* ───────── Apply: CAPTURE (a full chain of one or more jumps) ─────────
   `path` is a sequence of jumps; the first jump's `from` carries the moving marble, and
   each subsequent jump must start from the previous jump's `to`. */
export function applyCapture(s: ZertzState, path: Jump[]): ZertzState {
  if (s.winner != null || path.length === 0) return s
  const player = s.turn
  const board = { ...s.board }
  const captured: [Counts, Counts] = [{ ...s.captured[0] }, { ...s.captured[1] }]
  const touched: Key[] = []
  let cursor: Key | null = null

  for (const j of path) {
    const start = cursor ?? j.from
    if (start !== j.from) return s
    if (board[j.from] == null || board[j.over] == null || board[j.to] != null) return s
    const mover = board[j.from]!
    const eaten = board[j.over]!
    board[j.from] = null
    board[j.over] = null
    board[j.to] = mover
    captured[player][eaten]++
    touched.push(j.from, j.over, j.to)
    cursor = j.to
  }

  const name = player === s.you ? 'You' : 'Rival'
  const n = path.length
  let log = push(s.log, player === s.you ? 'you' : 'ai',
    `${name} leapt and captured ${n} marble${n > 1 ? 's' : ''}.`)

  let ns: ZertzState = { ...s, board, captured, last: touched, log }
  return finishTurn(ns, player)
}

/* Apply ALL forced jumps as one full chain, ALWAYS taking the maximal/first branch.
   Used by the AI helper and convenient for "auto-resolve". Returns the chain taken. */
export function bestChainFrom(s: ZertzState, from: Key): Jump[] {
  // DFS for the longest capture chain starting at `from`.
  let best: Jump[] = []
  const dfs = (st: ZertzState, cur: Key, acc: Jump[]) => {
    const js = jumpsFrom(st, cur)
    if (js.length === 0) { if (acc.length > best.length) best = acc.slice(); return }
    for (const j of js) {
      const nb = { ...st.board }
      const mover = nb[j.from]!
      nb[j.from] = null; nb[j.over] = null; nb[j.to] = mover
      dfs({ ...st, board: nb }, j.to, acc.concat(j))
    }
  }
  dfs(s, from, [])
  return best
}

/** Settle who-wins / whose-turn after an action by `player`. */
function finishTurn(s: ZertzState, player: Player): ZertzState {
  let ns = s
  if (hasWinningSet(ns.captured[player])) {
    const youWon = player === ns.you
    const log = push(ns.log, youWon ? 'you' : 'ai', `${youWon ? 'You win' : 'Rival wins'} — a captured set is complete!`)
    return { ...ns, winner: player, turn: player, log }
  }
  const next: Player = player === 0 ? 1 : 0
  // If the next player has literally no move at all (no captures, no placements), the
  // game is over by exhaustion → whoever holds more captured marbles wins (tie → mover).
  const peek: ZertzState = { ...ns, turn: next }
  if (legalCaptures(peek, next).length === 0 && legalPlaceRemove(peek).length === 0) {
    const w = scoreWinner(ns)
    const log = push(ns.log, 'sys', 'No moves remain — the board is exhausted.')
    return { ...ns, winner: w, turn: w, log }
  }
  return { ...ns, turn: next }
}

export function total(c: Counts): number { return c.w + c.g + c.k }
function scoreWinner(s: ZertzState): Player {
  const a = total(s.captured[0]), b = total(s.captured[1])
  if (a > b) return 0
  if (b > a) return 1
  return s.turn   // tie → the player who just moved
}

/* ───────── AI ─────────
   Heuristic, single turn. Priorities:
     1. If a capture is forced, pick the chain that best advances our set (prefer colours
        we need, longer chains), and resolve the whole chain.
     2. Otherwise place+remove: pick the move that (a) completes/progresses our set via an
        immediate isolation capture, (b) avoids handing the opponent a strong capture,
        (c) keeps a useful colour. Cheap 1-ply look-ahead with light opponent awareness. */
export function aiTurn(s: ZertzState): ZertzState {
  if (s.winner != null) return s
  const me = s.turn

  // 1) Forced captures.
  const caps = legalCaptures(s, me)
  if (caps.length > 0) {
    // Evaluate each starting jump's best chain; choose by captured value toward our set.
    let bestChain: Jump[] = []
    let bestScore = -Infinity
    const starts = new Set(caps.map(j => j.from))
    for (const from of starts) {
      const chain = bestChainFrom(s, from)
      if (chain.length === 0) continue
      const sc = chainScore(s, chain, me)
      if (sc > bestScore) { bestScore = sc; bestChain = chain }
    }
    if (bestChain.length > 0) return applyCapture(s, bestChain)
    // fallback: take first single jump
    return applyCapture(s, [caps[0]])
  }

  // 2) Place + remove.
  const moves = legalPlaceRemove(s)
  if (moves.length === 0) {
    // no move — finish (exhaustion) by passing through finishTurn via a no-op place attempt
    return { ...s, winner: scoreWinner(s), turn: scoreWinner(s) }
  }

  const opp: Player = me === 0 ? 1 : 0
  let best = moves[0]
  let bestVal = -Infinity
  // Cap the branching for speed.
  const sample = moves.length > 220 ? pickSpread(moves, 220) : moves
  for (const m of sample) {
    const after = simPlaceRemove(s, m)
    let v = 0
    // immediate isolation gains for us:
    const gain = total(after.captured[me]) - total(s.captured[me])
    v += gain * 50
    if (hasWinningSet(after.captured[me])) v += 1000
    // bias toward colours we still need for a set
    v += colorNeedBonus(s.captured[me], m.color)
    // don't gift the opponent a big capture next turn
    const oppCaps = legalCaptures({ ...after, turn: opp }, opp)
    let oppBest = 0
    const oppStarts = new Set(oppCaps.map(j => j.from))
    for (const f of oppStarts) oppBest = Math.max(oppBest, bestChainFrom({ ...after, turn: opp }, f).length)
    v -= oppBest * 18
    // mild preference to keep the board flexible (more removable edges left)
    v += removableCells(after).length * 0.1
    // tiny noise to break ties non-deterministically
    v += Math.random() * 0.5
    if (v > bestVal) { bestVal = v; best = m }
  }
  return applyPlaceRemove(s, best.color, best.place, best.remove)
}

function colorNeedBonus(c: Counts, col: Color): number {
  // Placing a colour we hold 2 of (toward a triple) or that progresses 1-of-each is good,
  // but note: PLACING doesn't capture — this only matters via the isolation we might trigger.
  // Reward placing colours we're close to needing so isolations land usefully.
  let b = 0
  if (c[col] === 2) b += 6           // one away from a triple of this colour
  if (c[col] === 0) b += 3           // helps the 1-of-each route
  return b
}

function chainScore(s: ZertzState, chain: Jump[], me: Player): number {
  // simulate to know which colours we'd gain
  const gained = zeroCounts()
  const board = { ...s.board }
  let cur: Key | null = null
  for (const j of chain) {
    const start = cur ?? j.from
    if (board[start] == null || board[j.over] == null) break
    gained[board[j.over]!]++
    board[j.from] = null; board[j.over] = null; board[j.to] = board[start]!
    if (start !== j.from) board[start] = null
    cur = j.to
  }
  const after: Counts = { w: s.captured[me].w + gained.w, g: s.captured[me].g + gained.g, k: s.captured[me].k + gained.k }
  let v = chain.length * 10
  if (hasWinningSet(after)) v += 1000
  // prefer colours that move us toward a set
  for (const col of COLORS) {
    if (gained[col] > 0) {
      if (s.captured[me][col] === 2) v += 30
      if (s.captured[me][col] === 0) v += 8
    }
  }
  return v
}

function simPlaceRemove(s: ZertzState, m: PlaceRemove): ZertzState {
  // like applyPlaceRemove but WITHOUT advancing the turn / win settling (for evaluation).
  const board = { ...s.board }
  board[m.place] = m.color
  const supply = { ...s.supply, [m.color]: s.supply[m.color] - 1 }
  const removed = { ...s.removed }
  let ns: ZertzState = { ...s, board, supply, removed }
  if (m.remove != null && m.remove !== m.place && isRemovable(ns, m.remove)) {
    removed[m.remove] = true
    ns = { ...ns, removed }
    ns = checkIsolation(ns, s.turn)
  }
  return ns
}

function pickSpread<T>(arr: T[], n: number): T[] {
  const out: T[] = []
  const step = arr.length / n
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)])
  return out
}
