/* TINY TOWNS — solo logic.
   Ported from design/examples/builder_tiny_towns/tinytowns_logic.jsx; the IIFE +
   window.TinyLogic global became ESM exports and a TinyState type. Pattern matching and
   scoring are unchanged. This is a solitaire game — no AI opponent.

   4x4 town. Each turn a resource is named at random; you must place it on an empty square.
   When a building's exact resource pattern appears (any rotation/reflection), you may build:
   remove those resources and place the building on one of the pattern's squares. Empty
   squares cost -1 at the end. Build a high-scoring little town. */

export type Res = 'wood' | 'brick' | 'glass' | 'wheat' | 'stone'
export type BuildingKey = 'cottage' | 'farm' | 'well' | 'chapel' | 'tavern'
export type Cell = { t: 'r'; r: Res } | { t: 'b'; b: BuildingKey } | null

export interface Score {
  total: number
  breakdown: Record<string, number>
  bcount: Record<string, number>
  empties: number
}
export interface TinyState {
  grid: Cell[]
  resource: Res | null
  queue: unknown[]
  status: 'playing' | 'over'
  score: Score | null
  turn: number
  log: unknown[]
}

export const N = 4
export const RES: Res[] = ["wood", "brick", "glass", "wheat", "stone"]
export const RES_SHORT: Record<Res, string> = { wood: "Wd", brick: "Bk", glass: "Gl", wheat: "Wh", stone: "St" }

// buildings: pattern = [[dr,dc,res],...]
export const BUILDINGS: Record<BuildingKey, { name: string; pattern: [number, number, Res][]; desc: string }> = {
  cottage: { name: "Cottage", pattern: [[0, 0, "wheat"], [0, 1, "glass"], [1, 1, "brick"]], desc: "3 points each." },
  farm: { name: "Farm", pattern: [[0, 0, "wheat"], [0, 1, "wheat"], [1, 0, "wood"], [1, 1, "wood"]], desc: "4 points each." },
  well: { name: "Well", pattern: [[0, 0, "wood"], [0, 1, "stone"]], desc: "1 per adjacent Cottage." },
  chapel: { name: "Chapel", pattern: [[0, 0, "glass"], [0, 1, "glass"], [1, 0, "stone"]], desc: "1 per Cottage in town." },
  tavern: { name: "Tavern", pattern: [[0, 0, "brick"], [0, 1, "brick"], [0, 2, "brick"]], desc: "Set: 2 / 5 / 9 / 14 / 20." },
}
export const TAVERN_SCORE = [0, 2, 5, 9, 14, 20]

// generate 8 orientations of a pattern, normalized & deduped
function orientations(pat: [number, number, Res][]) {
  const outs: [number, number, Res][][] = [], seen = new Set<string>()
  let cur = pat.map(c => [c[0], c[1], c[2]] as [number, number, Res])
  for (let refl = 0; refl < 2; refl++) {
    for (let rot = 0; rot < 4; rot++) {
      const minR = Math.min(...cur.map(c => c[0])), minC = Math.min(...cur.map(c => c[1]))
      const norm = cur.map(c => [c[0] - minR, c[1] - minC, c[2]] as [number, number, Res]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
      const sig = norm.map(c => c.join(",")).join(";")
      if (!seen.has(sig)) { seen.add(sig); outs.push(norm) }
      cur = cur.map(c => [c[1], -c[0], c[2]] as [number, number, Res]) // rotate 90
    }
    cur = cur.map(c => [c[0], -c[1], c[2]] as [number, number, Res]) // reflect
  }
  return outs
}
const ORI: Record<string, [number, number, Res][][]> = {}
for (const k in BUILDINGS) ORI[k] = orientations(BUILDINGS[k as BuildingKey].pattern)

export function makeGame(): TinyState {
  const g: TinyState = {
    grid: new Array(N * N).fill(null),
    resource: null, queue: [], status: "playing", score: null, turn: 0, log: [],
  }
  return drawResource(g)
}
function drawResource(g: TinyState): TinyState {
  const empties = g.grid.filter(x => x === null).length
  if (empties === 0) {
    // grid full — only end if nothing can be built to free a square
    if (buildableKeys(g.grid).length === 0) return Object.assign({}, g, { resource: null, status: "over", score: scoreTown(g.grid) })
    return Object.assign({}, g, { resource: null })
  }
  const r = RES[(Math.random() * RES.length) | 0]
  return Object.assign({}, g, { resource: r })
}

export function place(g: TinyState, cell: number): TinyState {
  if (g.status !== "playing" || !g.resource || g.grid[cell] !== null) return g
  const grid = g.grid.slice(); grid[cell] = { t: "r", r: g.resource }
  let g2 = Object.assign({}, g, { grid, resource: null, turn: g.turn + 1 })
  return drawResource(g2) // name next resource (or end if full)
}

// find all buildable placements for building key on current grid
export function matches(grid: Cell[], key: string): number[][] {
  const groups: number[][] = []
  for (const ori of ORI[key]) {
    const maxR = Math.max(...ori.map(c => c[0])), maxC = Math.max(...ori.map(c => c[1]))
    for (let R = 0; R + maxR < N; R++) for (let C = 0; C + maxC < N; C++) {
      let ok = true; const cells: number[] = []
      for (const [dr, dc, res] of ori) { const i = (R + dr) * N + (C + dc); const v = grid[i]; if (!v || v.t !== "r" || v.r !== res) { ok = false; break } cells.push(i) }
      if (ok) groups.push(cells)
    }
  }
  return groups
}
export function buildableKeys(grid: Cell[]): string[] { return Object.keys(BUILDINGS).filter(k => matches(grid, k).length > 0) }

// build `key`, placing the building on `targetCell` (must belong to a matching group)
export function build(g: TinyState, key: BuildingKey, targetCell: number): TinyState {
  if (g.status !== "playing") return g
  const groups = matches(g.grid, key)
  const group = groups.find(cells => cells.includes(targetCell)) || groups[0]
  if (!group) return g
  const tc = group.includes(targetCell) ? targetCell : group[0]
  const grid = g.grid.slice()
  for (const i of group) grid[i] = null
  grid[tc] = { t: "b", b: key }
  let g2 = Object.assign({}, g, { grid })
  if (!g2.resource && g2.status === "playing") g2 = drawResource(g2)
  return g2
}

export function endTown(g: TinyState): TinyState { return Object.assign({}, g, { status: "over", score: scoreTown(g.grid) }) }

export function adjacent(i: number): number[] { const r = Math.floor(i / N), c = i % N, out: number[] = []; if (r > 0) out.push(i - N); if (r < N - 1) out.push(i + N); if (c > 0) out.push(i - 1); if (c < N - 1) out.push(i + 1); return out }

export function scoreTown(grid: Cell[]): Score {
  const bcount: Record<string, number> = {}; for (const k in BUILDINGS) bcount[k] = 0
  const cells = grid.map((v, i) => ({ v, i }))
  for (const { v } of cells) if (v && v.t === "b") bcount[v.b]++
  let pts = 0; const breakdown: Record<string, number> = {}
  breakdown.cottage = bcount.cottage * 3; pts += breakdown.cottage
  breakdown.farm = bcount.farm * 4; pts += breakdown.farm
  breakdown.chapel = bcount.chapel * bcount.cottage; pts += breakdown.chapel
  let wellPts = 0
  for (const { v, i } of cells) if (v && v.t === "b" && v.b === "well") for (const j of adjacent(i)) { const w = grid[j]; if (w && w.t === "b" && w.b === "cottage") wellPts++ }
  breakdown.well = wellPts; pts += wellPts
  breakdown.tavern = TAVERN_SCORE[Math.min(bcount.tavern, 5)]; pts += breakdown.tavern
  const empties = grid.filter(x => x === null).length
  breakdown.empty = -empties; pts += -empties
  return { total: pts, breakdown, bcount, empties }
}
