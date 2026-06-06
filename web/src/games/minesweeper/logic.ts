/* MINESWEEPER — logic (solitaire, built for this codebase).
   A grid of cells; each cell is either a MINE or a non-mine that stores the COUNT of
   adjacent mines (0-8). Mines are placed lazily on the FIRST reveal, excluding the
   clicked cell and (where possible) its neighbours, so the first click is always safe
   and opens a region. Revealing a 0-cell flood-fills its connected zero-region and the
   numbered border. Flagged cells can't be revealed. You win when every non-mine cell is
   revealed; you lose the instant you reveal a mine. */

export type Difficulty = 'beginner' | 'intermediate' | 'expert'
export type Status = 'playing' | 'won' | 'lost'

export interface Cell {
  mine: boolean
  count: number      // adjacent mine count (valid for non-mine cells)
  revealed: boolean
  flagged: boolean
}

export interface DiffSpec { id: Difficulty; label: string; rows: number; cols: number; mines: number }

export const DIFFICULTIES: Record<Difficulty, DiffSpec> = {
  beginner:     { id: 'beginner',     label: 'Beginner',     rows: 9,  cols: 9,  mines: 10 },
  intermediate: { id: 'intermediate', label: 'Intermediate', rows: 16, cols: 16, mines: 40 },
  expert:       { id: 'expert',       label: 'Expert',       rows: 16, cols: 30, mines: 99 },
}

export interface MineState {
  grid: Cell[]            // length rows*cols, index = r*cols + c
  rows: number
  cols: number
  mines: number           // total mines on the board
  flags: number           // flags currently placed
  status: Status
  difficulty: Difficulty
  started: boolean        // mines placed yet? (false until first reveal)
  revealedCount: number   // revealed non-flag cells (for win check / convenience)
}

const idx = (cols: number, r: number, c: number) => r * cols + c

function neighbours(rows: number, cols: number, i: number): number[] {
  const r = Math.floor(i / cols), c = i % cols
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue
    const nr = r + dr, nc = c + dc
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(idx(cols, nr, nc))
  }
  return out
}

function emptyCell(): Cell { return { mine: false, count: 0, revealed: false, flagged: false } }

export function makeGame(difficulty: Difficulty = 'beginner'): MineState {
  const spec = DIFFICULTIES[difficulty]
  const grid: Cell[] = []
  for (let i = 0; i < spec.rows * spec.cols; i++) grid.push(emptyCell())
  return {
    grid, rows: spec.rows, cols: spec.cols, mines: spec.mines,
    flags: 0, status: 'playing', difficulty, started: false, revealedCount: 0,
  }
}

/** Place `mines` mines at random, excluding `safe` (the first-clicked cell and its
    neighbours where possible), then compute every non-mine cell's adjacency count. */
function placeMines(grid: Cell[], rows: number, cols: number, mineCount: number, safeCenter: number) {
  const total = rows * cols
  const exclude = new Set<number>([safeCenter, ...neighbours(rows, cols, safeCenter)])
  // If the board is too small to keep all neighbours safe, only protect the clicked cell.
  let candidates = Array.from({ length: total }, (_, i) => i).filter(i => !exclude.has(i))
  if (candidates.length < mineCount) candidates = Array.from({ length: total }, (_, i) => i).filter(i => i !== safeCenter)

  // Fisher-Yates partial shuffle to pick mine positions.
  for (let k = 0; k < mineCount; k++) {
    const j = k + ((Math.random() * (candidates.length - k)) | 0)
    const tmp = candidates[k]; candidates[k] = candidates[j]; candidates[j] = tmp
    grid[candidates[k]].mine = true
  }
  for (let i = 0; i < total; i++) {
    if (grid[i].mine) continue
    let n = 0
    for (const j of neighbours(rows, cols, i)) if (grid[j].mine) n++
    grid[i].count = n
  }
}

/** Recompute adjacency counts for an already-laid-out board (used in tests). */
export function computeCounts(s: MineState): MineState {
  const grid = s.grid.map(c => ({ ...c }))
  for (let i = 0; i < grid.length; i++) {
    if (grid[i].mine) continue
    let n = 0
    for (const j of neighbours(s.rows, s.cols, i)) if (grid[j].mine) n++
    grid[i].count = n
  }
  return { ...s, grid }
}

function revealAllMines(grid: Cell[]) {
  for (const c of grid) if (c.mine) c.revealed = true
}

/** Win when every non-mine cell has been revealed. */
function checkWin(grid: Cell[], mines: number): boolean {
  let hidden = 0
  for (const c of grid) if (!c.revealed) hidden++
  return hidden === mines
}

export function reveal(s: MineState, i: number): MineState {
  if (s.status !== 'playing') return s
  const cell = s.grid[i]
  if (cell.revealed || cell.flagged) return s

  const grid = s.grid.map(c => ({ ...c }))
  let started = s.started, mines = s.mines

  // First reveal: lay out the mines avoiding this cell (and its neighbours).
  if (!started) {
    placeMines(grid, s.rows, s.cols, mines, i)
    started = true
  }

  // Hit a mine -> lose.
  if (grid[i].mine) {
    grid[i].revealed = true
    revealAllMines(grid)
    return { ...s, grid, started, status: 'lost' }
  }

  // Flood-fill: reveal this cell; if it's a 0, expand through connected 0-cells and
  // their numbered border (iterative queue).
  const queue: number[] = [i]
  while (queue.length) {
    const j = queue.pop()!
    const c = grid[j]
    if (c.revealed || c.flagged || c.mine) continue
    c.revealed = true
    if (c.count === 0) {
      for (const nb of neighbours(s.rows, s.cols, j)) {
        const nc = grid[nb]
        if (!nc.revealed && !nc.flagged && !nc.mine) queue.push(nb)
      }
    }
  }

  let revealedCount = 0
  for (const c of grid) if (c.revealed) revealedCount++
  const won = checkWin(grid, mines)
  if (won) revealAllMines(grid)
  return { ...s, grid, started, revealedCount, status: won ? 'won' : 'playing' }
}

/** Toggle a flag on a hidden cell. Revealed cells and finished games are ignored. */
export function toggleFlag(s: MineState, i: number): MineState {
  if (s.status !== 'playing') return s
  const cell = s.grid[i]
  if (cell.revealed) return s
  const grid = s.grid.map(c => ({ ...c }))
  grid[i].flagged = !grid[i].flagged
  const flags = s.flags + (grid[i].flagged ? 1 : -1)
  return { ...s, grid, flags }
}

/** Mines remaining = total mines minus flags placed (can go negative if over-flagged). */
export function minesRemaining(s: MineState): number { return s.mines - s.flags }
