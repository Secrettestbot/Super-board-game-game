/* YINSH — logic.
   Ported from design/examples/connection_yinsh/yinsh_logic.jsx; the IIFE + window.YinshLogic
   global became ESM exports and a YinshState type. Move generation, flipping, run detection,
   and the AI are unchanged.

   Hex-shaped board of intersections. Each player has 5 rings. Phase 1: alternate placing 5
   rings. Phase 2: drop a marker inside one of your rings, then slide that ring in a straight
   line — it lands on the first empty point beyond any run of markers it jumps; every marker
   jumped FLIPS. Five of your markers in a row -> remove that run and one of your rings. First
   to remove 3 rings wins. You are White, the rival Black. */

export type Side = 'w' | 'b'
export interface LogEntry { t: string; x: string }
export interface PendingRows { who: Side; runs: string[][] }
export interface YinshState {
  rings: Record<string, Side>
  markers: Record<string, Side>
  phase: 'place' | 'play' | 'over'
  turn: Side | null
  you: Side
  placed: { w: number; b: number }
  score: { w: number; b: number }
  pendingRing: string | null
  pendingRows: PendingRows | null
  removingRing: Side | null
  winner: Side | null
  last: Record<string, string> | null
  log: LogEntry[]
}

const COLS: [number, number][] = [
  [4, 7], [2, 8], [1, 9], [1, 9], [0, 10], [0, 9], [1, 10], [1, 9], [1, 9], [2, 8], [4, 7],
]
const PTS: [number, number][] = []
const PT_SET = new Set<string>()
for (let c = 0; c < 11; c++) { const [a, b] = COLS[c]; for (let r = a; r <= b; r++) { PTS.push([c, r]); PT_SET.add(c + "," + r) } }
export const has = (c: number, r: number) => PT_SET.has(c + "," + r)
export const key = (c: number, r: number) => c + "," + r
export { PTS, COLS }

// six hex directions in this offset system
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]

export function makeGame(): YinshState {
  return {
    rings: {},
    markers: {},
    phase: "place",
    turn: "w", you: "w",
    placed: { w: 0, b: 0 },
    score: { w: 0, b: 0 },
    pendingRing: null,
    pendingRows: null,
    removingRing: null,
    winner: null, last: null,
    log: [{ t: "sys", x: "Place your five rings. Then drop a marker and slide the ring beyond — flipping all it jumps." }],
  }
}

// legal landing points for a ring at (c,r)
export function ringMoves(s: YinshState, c: number, r: number): string[] {
  const out: string[] = []
  for (const [dc, dr] of DIRS) {
    let jumped = false
    let x = c + dc, y = r + dr
    while (has(x, y)) {
      const k = key(x, y)
      if (s.rings[k]) break                       // can't land on / pass a ring
      if (s.markers[k]) { jumped = true; x += dc; y += dr; continue } // jump markers
      // empty
      out.push(k)
      if (jumped) break                            // after jumping, must land on first empty
      x += dc; y += dr
    }
  }
  return out
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-30) }
const other = (p: Side): Side => p === "w" ? "b" : "w"

export function placeRing(s: YinshState, k: string): YinshState {
  if (s.phase !== "place" || s.rings[k] || s.markers[k]) return s
  const rings = Object.assign({}, s.rings, { [k]: s.turn })
  const placed = Object.assign({}, s.placed, { [s.turn!]: s.placed[s.turn!] + 1 })
  let phase = "place", turn = other(s.turn!)
  if (placed.w >= 5 && placed.b >= 5) { phase = "play"; turn = "w" }
  let log = push(s.log, s.turn === s.you ? "you" : "ai", `${s.turn === s.you ? "You" : "Rival"} placed a ring.`)
  return Object.assign({}, s, { rings, placed, phase, turn, last: { place: k }, log })
}

export function dropMarker(s: YinshState, k: string): YinshState {
  if (s.phase !== "play" || s.pendingRing || s.removingRing) return s
  if (s.rings[k] !== s.turn) return s
  const markers = Object.assign({}, s.markers, { [k]: s.turn })
  const rings = Object.assign({}, s.rings); delete rings[k]
  return Object.assign({}, s, { markers, rings, pendingRing: k, last: { drop: k } })
}
export function cancelDrop(s: YinshState): YinshState {
  if (!s.pendingRing) return s
  const k = s.pendingRing
  const markers = Object.assign({}, s.markers); delete markers[k]
  const rings = Object.assign({}, s.rings, { [k]: s.turn })
  return Object.assign({}, s, { markers, rings, pendingRing: null })
}

export function moveRing(s: YinshState, to: string): YinshState {
  if (!s.pendingRing) return s
  const from = s.pendingRing
  const [fc, fr] = from.split(",").map(Number), [tc, tr] = to.split(",").map(Number)
  if (!ringMoves(s, fc, fr).includes(to)) return s
  // flip markers between from and to
  const markers = Object.assign({}, s.markers)
  const dc = Math.sign(tc - fc), dr = Math.sign(tr - fr)
  let x = fc + dc, y = fr + dr
  while (!(x === tc && y === tr)) { const k = key(x, y); if (markers[k]) markers[k] = other(markers[k]); x += dc; y += dr }
  const rings = Object.assign({}, s.rings, { [to]: s.turn })
  let ns = Object.assign({}, s, { markers, rings, pendingRing: null, last: { from, to } })
  let log = push(s.log, s.turn === s.you ? "you" : "ai", `${s.turn === s.you ? "You" : "Rival"} moved a ring.`)
  ns.log = log
  return resolveRows(ns, s.turn!)
}

// find five-in-a-row runs of a colour
export function findRuns(markers: Record<string, Side>, colour: Side): string[][] {
  const runs: string[][] = []
  for (const k of Object.keys(markers)) {
    if (markers[k] !== colour) continue
    const [c, r] = k.split(",").map(Number)
    for (const [dc, dr] of [[1, 0], [0, 1], [1, 1]]) {
      // only start runs (no same-colour marker behind)
      const bk = key(c - dc, r - dr)
      if (markers[bk] === colour) continue
      const run: string[] = []
      let x = c, y = r
      while (markers[key(x, y)] === colour) { run.push(key(x, y)); x += dc; y += dr }
      if (run.length >= 5) runs.push(run)
    }
  }
  return runs.filter(r => r.length >= 5)
}

function resolveRows(s: YinshState, mover: Side): YinshState {
  const myRuns = findRuns(s.markers, mover)
  if (myRuns.length) return Object.assign({}, s, { pendingRows: { who: mover, runs: myRuns }, removingRing: null, turn: mover })
  const oppRuns = findRuns(s.markers, other(mover))
  if (oppRuns.length) return Object.assign({}, s, { pendingRows: { who: other(mover), runs: oppRuns }, turn: other(mover) })
  return Object.assign({}, s, { turn: other(mover) })
}

export function removeRun(s: YinshState, runKeys: string[]): YinshState {
  if (!s.pendingRows) return s
  const who = s.pendingRows.who
  const markers = Object.assign({}, s.markers)
  for (const k of runKeys) delete markers[k]
  let log = push(s.log, who === s.you ? "you" : "ai", `${who === s.you ? "You" : "Rival"} completed a row!`)
  return Object.assign({}, s, { markers, pendingRows: null, removingRing: who, log })
}
export function removeRing(s: YinshState, k: string): YinshState {
  if (!s.removingRing) return s
  const who = s.removingRing
  if (s.rings[k] !== who) return s
  const rings = Object.assign({}, s.rings); delete rings[k]
  const score = Object.assign({}, s.score, { [who]: s.score[who] + 1 })
  let log = push(s.log, who === s.you ? "you" : "ai", `${who === s.you ? "You" : "Rival"} removed a ring (${score[who]}/3).`)
  let ns = Object.assign({}, s, { rings, score, removingRing: null, log })
  if (score[who] >= 3) { ns.winner = who; ns.phase = "over"; ns.turn = null; ns.log = push(ns.log, who === s.you ? "you" : "ai", `${who === s.you ? "You win" : "Rival wins"} — three rings!`); return ns }
  // after scoring, check for further runs then pass turn
  return resolveRows(ns, who === s.turn ? s.turn! : who)
}

// ===== AI =====
function allRingPositions(s: YinshState, who: Side) { return Object.keys(s.rings).filter(k => s.rings[k] === who) }
function evalState(s: YinshState, me: Side) {
  const op = other(me)
  let sc = (s.score[me] - s.score[op]) * 100
  let mm = 0, om = 0; for (const k in s.markers) { if (s.markers[k] === me) mm++; else om++ }
  sc += (mm - om) * 1.0
  return sc
}
function dist(k: string) { const [c, r] = k.split(",").map(Number); return Math.abs(c - 5) + Math.abs(r - 5) }
function aiPlace(s: YinshState): YinshState {
  const empties = PTS.map(([c, r]) => key(c, r)).filter(k => !s.rings[k] && !s.markers[k])
  empties.sort((a, b) => dist(a) - dist(b))
  const pick = empties[Math.min((Math.random() * 4) | 0, empties.length - 1)]
  return placeRing(s, pick)
}

export function aiTurn(s: YinshState): YinshState {
  if (s.winner) return s
  if (s.phase === "place" && s.turn === "b") return aiPlace(s)
  if (s.removingRing === "b") { const rs = allRingPositions(s, "b"); return removeRing(s, rs[(Math.random() * rs.length) | 0]) }
  if (s.pendingRows && s.pendingRows.who === "b") return removeRun(s, s.pendingRows.runs[0])
  if (s.phase === "play" && s.turn === "b" && !s.pendingRing) {
    // pick best (ring, move): greedily maximize markers flipped to mine + progress
    const rings = allRingPositions(s, "b")
    let best: { rk: string; to: string } | null = null, bv = -1e9
    for (const rk of rings) {
      const [c, r] = rk.split(",").map(Number)
      const dropped = dropMarker(s, rk)
      const moves = ringMoves(dropped, c, r)
      for (const to of moves) {
        const after = simMove(dropped, to)
        let v = evalState(after, "b")
        if (findRuns(after.markers, "b").length) v += 60
        v += Math.random() * 2
        if (v > bv) { bv = v; best = { rk, to } }
      }
    }
    if (!best) return Object.assign({}, s, { turn: "w" })
    let st = dropMarker(s, best.rk)
    return moveRing(st, best.to)
  }
  return s
}
function simMove(s: YinshState, to: string): YinshState {
  const from = s.pendingRing!
  const [fc, fr] = from.split(",").map(Number), [tc, tr] = to.split(",").map(Number)
  const markers = Object.assign({}, s.markers)
  const dc = Math.sign(tc - fc), dr = Math.sign(tr - fr)
  let x = fc + dc, y = fr + dr
  while (!(x === tc && y === tr)) { const k = key(x, y); if (markers[k]) markers[k] = other(markers[k]); x += dc; y += dr }
  const rings = Object.assign({}, s.rings, { [to]: s.turn })
  return Object.assign({}, s, { markers, rings, pendingRing: null })
}
