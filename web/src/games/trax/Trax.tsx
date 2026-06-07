/* TRAX — UI. An auto-bounded grid of ivory tiles with crisp white + crimson
   tracks. You play WHITE, the AI plays RED. Pick an empty highlighted cell, choose
   a fitting tile orientation, and place it; forced connections resolve themselves.
   Make your white track close a loop or span 8 rows/columns to win. */

import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { traxAdapter, boardOf } from './net'
import * as TX from './logic'
import type { State, Tile, Cell, Color, Placement } from './logic'

const { DIRS } = TX

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#efeade" stroke="#c7bea7" strokeWidth="1.5" />
    <path d="M24 3 V45" fill="none" stroke="#fbfbfa" strokeWidth="3.4" />
    <path d="M3 24 Q24 24 24 3 M45 24 Q24 24 24 45" fill="none" stroke="#d83a37" strokeWidth="3.4" strokeLinecap="round" opacity="0" />
    <path d="M3 24 H45" fill="none" stroke="#d83a37" strokeWidth="3.4" />
  </svg>
)

// edge midpoint within a unit cell (0..1), order N,E,S,W
const EDGE_XY: [number, number][] = [
  [0.5, 0],   // N
  [1, 0.5],   // E
  [0.5, 1],   // S
  [0, 0.5],   // W
]

/** Draw a tile's two color tracks inside a unit cell scaled by `size`.
 * Each track connects edge d to edge links[d]; straight pairs are lines, adjacent
 * pairs are quarter arcs pulled toward the shared corner. */
function TileTracks({ tile, size, ghost, winColor }: {
  tile: Tile; size: number; ghost?: boolean; winColor?: TX.Color | null
}) {
  const seen = new Set<number>()
  const segs: ReactElement[] = []
  for (let d = 0; d < 4; d++) {
    const e = tile.links[d]
    if (seen.has(d) || seen.has(e)) continue
    seen.add(d); seen.add(e)
    const color = tile.edges[d]
    const [ax, ay] = EDGE_XY[d], [bx, by] = EDGE_XY[e]
    let path: string
    if ((d + 2) % 4 === e) {
      // opposite edges -> straight line through center
      path = `M ${ax * size} ${ay * size} L ${bx * size} ${by * size}`
    } else {
      // adjacent edges -> quarter arc; control point at the shared corner
      const corner = sharedCorner(d, e)
      const cx = corner[0] * size, cy = corner[1] * size
      path = `M ${ax * size} ${ay * size} Q ${cx} ${cy} ${bx * size} ${by * size}`
    }
    const cls = 'tx-track ' + color + (ghost ? ' ghost' : '') + (winColor === color ? ' win' : '')
    segs.push(<path key={d} d={path} className={cls} strokeWidth={size * 0.16} />)
  }
  return <>{segs}</>
}

// the corner (0/1, 0/1) shared by two adjacent edge dirs
function sharedCorner(a: number, b: number): [number, number] {
  const set = new Set([a, b])
  if (set.has(0) && set.has(1)) return [1, 0] // N,E -> top-right
  if (set.has(1) && set.has(2)) return [1, 1] // E,S -> bottom-right
  if (set.has(2) && set.has(3)) return [0, 1] // S,W -> bottom-left
  return [0, 0] // W,N -> top-left
}

export function Trax() {
  const { state: raw, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(traxAdapter)
  // The wire flattens State.board to entries; re-hydrate a live-Map state for logic/render.
  const s = useMemo<State>(() => ({ ...raw, board: boardOf(raw) }), [raw])
  const [showRules, setShowRules] = useState(false)
  const [selCell, setSelCell] = useState<Cell | null>(null)
  const [orient, setOrient] = useState(0) // index into the fitting tiles for selCell

  const myColor: Color = mySeat === 0 ? 'W' : 'R'
  const oppColor: Color = mySeat === 0 ? 'R' : 'W'

  function newGame() {
    netNew(); setShowRules(false); setSelCell(null); setOrient(0)
  }

  const yourTurn = s.winner == null && isMyTurn
  const placements = useMemo(() => (yourTurn ? TX.legalPlacements(s) : []), [s, yourTurn])

  // group placements by cell
  const byCell = useMemo(() => {
    const m = new Map<Cell, Placement[]>()
    for (const p of placements) {
      if (!m.has(p.cell)) m.set(p.cell, [])
      m.get(p.cell)!.push(p)
    }
    return m
  }, [placements])

  const fittingTiles = selCell ? (byCell.get(selCell) ?? []) : []
  const safeOrient = fittingTiles.length ? Math.min(orient, fittingTiles.length - 1) : 0

  function selectCell(cell: Cell) {
    if (!yourTurn) return
    if (!byCell.has(cell)) return
    setSelCell(cell); setOrient(0)
  }

  function commit() {
    if (!yourTurn || !selCell) return
    const opts = byCell.get(selCell)
    if (!opts || !opts.length) return
    const pick = opts[safeOrient]
    dispatch({ cell: pick.cell, ti: pick.ti })
    setSelCell(null); setOrient(0)
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSelCell(null) },
    extra: (e) => {
      if (!yourTurn) return false
      if ((e.key === 'r' || e.key === 'R') && fittingTiles.length > 1) {
        setOrient(v => (v + 1) % fittingTiles.length); return true
      }
      if ((e.key === 'Enter' || e.key === ' ') && selCell) { commit(); return true }
      return false
    },
  })

  // ---- bounds: placed tiles + 1-cell frontier margin ----
  const bounds = useMemo(() => {
    let minR = 0, maxR = 0, minC = 0, maxC = 0, first = true
    const note = (r: number, c: number) => {
      if (first) { minR = maxR = r; minC = maxC = c; first = false; return }
      if (r < minR) minR = r; if (r > maxR) maxR = r
      if (c < minC) minC = c; if (c > maxC) maxC = c
    }
    for (const cell of s.board.keys()) { const [r, c] = TX.parse(cell); note(r, c) }
    if (first) { minR = maxR = minC = maxC = 0 }
    // pad by 1 in every direction (frontier room)
    return { minR: minR - 1, maxR: maxR + 1, minC: minC - 1, maxC: maxC + 1 }
  }, [s.board])

  const rows = bounds.maxR - bounds.minR + 1
  const cols = bounds.maxC - bounds.minC + 1
  const SZ = 100
  const W = cols * SZ, H = rows * SZ

  const ghost = useMemo<Tile | null>(() => {
    if (!selCell || !fittingTiles.length) return null
    return fittingTiles[safeOrient].tile
  }, [selCell, fittingTiles, safeOrient])

  const lastCell = useMemo<Cell | null>(() => {
    // most recent logged player placement cell
    for (let i = s.log.length - 1; i >= 0; i--) {
      const m = s.log[i].x.match(/\((-?\d+),(-?\d+)\)/)
      if (m && (s.log[i].who === 0 || s.log[i].who === 1)) return TX.key(Number(m[1]), Number(m[2]))
    }
    return null
  }, [s.log])

  // build cell visuals
  const cells: ReactElement[] = []
  for (let r = bounds.minR; r <= bounds.maxR; r++) {
    for (let c = bounds.minC; c <= bounds.maxC; c++) {
      const cell = TX.key(r, c)
      const tile = s.board.get(cell)
      const x = (c - bounds.minC) * SZ
      const y = (r - bounds.minR) * SZ
      const isLegal = byCell.has(cell)
      const isSel = selCell === cell
      if (tile) {
        cells.push(
          <g key={cell} transform={`translate(${x} ${y})`}>
            <rect x="1" y="1" width={SZ - 2} height={SZ - 2} rx="4" className="tx-tile-bg" />
            <TileTracks tile={tile} size={SZ} winColor={s.winner != null ? s.winColor : null} />
            {lastCell === cell && <rect x="2" y="2" width={SZ - 4} height={SZ - 4} rx="3" className="tx-last" />}
          </g>,
        )
      } else {
        cells.push(
          <g key={cell} transform={`translate(${x} ${y})`}
            onClick={() => isLegal && selectCell(cell)}
            style={{ cursor: isLegal ? 'pointer' : 'default' }}>
            <rect x="1" y="1" width={SZ - 2} height={SZ - 2} rx="4"
              className={isLegal ? 'tx-cell-legal' + (isSel ? ' sel' : '') : 'tx-cell-empty'} />
            {isSel && ghost && <TileTracks tile={ghost} size={SZ} ghost />}
          </g>,
        )
      }
    }
  }

  const myWin = s.winner != null && s.winner === mySeat
  const oppLabel = net.online ? 'Opponent' : 'AI'
  const oppName = oppColor === 'W' ? 'White' : 'Red'
  const myName = myColor === 'W' ? 'White' : 'Red'

  let banner: string, bk = ''
  if (s.winner != null && myWin) { bk = 'win'; banner = `You win — your ${myName.toLowerCase()} track is complete!` }
  else if (s.winner != null) { bk = 'lose'; banner = `${oppName} wins — ${oppLabel} completed its track.` }
  else if (yourTurn) {
    bk = 'you'
    banner = selCell ? 'Choose an orientation, then place' : 'Your turn — pick a highlighted cell'
  } else { bk = 'foe'; banner = net.online ? 'Opponent is plotting their track…' : 'Red is plotting its track…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Trax · connect the track"
        title="Trax"
        subtitle="lay matching tiles on an open grid — close a loop or run your color 8 across to win"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${s.board.size} tiles placed`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>R · rotate &nbsp; ↵ · place &nbsp; N · new</>}
      >
        <div className="tx-wrap">
          <svg className="tx-board" viewBox={`-8 -8 ${W + 16} ${H + 16}`}>
            <rect x={-6} y={-6} width={W + 12} height={H + 12} rx="10" fill="none" />
            {cells}
          </svg>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel tx-turn">
            <div className={'tx-who you' + (yourTurn ? ' on' : '')}>
              <span className={'tx-dot ' + (myColor === 'W' ? 'you' : 'foe')} />
              <span className="tx-name">You · {myName}</span>
              <span className="tx-goal">loop / 8-span</span>
            </div>
            <div className={'tx-who foe' + (!yourTurn && s.winner == null ? ' on' : '')}>
              <span className={'tx-dot ' + (oppColor === 'W' ? 'you' : 'foe')} />
              <span className="tx-name">{oppLabel} · {oppName}</span>
              <span className="tx-goal">loop / 8-span</span>
            </div>
          </div>

          <div className="panel tx-pick">
            <div className="panel-l">
              {selCell ? `Orientation · ${fittingTiles.length} fit` : 'Select a cell'}
            </div>
            {selCell && fittingTiles.length ? (
              <div className="tx-tiles">
                {fittingTiles.map((p, i) => (
                  <button key={i} className={'tx-tile' + (i === safeOrient ? ' sel' : '')}
                    disabled={!yourTurn} onClick={() => setOrient(i)}>
                    <svg viewBox="0 0 60 60" className="tx-tile-svg">
                      <rect x="1" y="1" width="58" height="58" rx="6" className="tx-tile-bg" />
                      <TileTracks tile={p.tile} size={60} />
                    </svg>
                  </button>
                ))}
              </div>
            ) : (
              <div className="tx-hint">
                {yourTurn
                  ? <>Click a <b>highlighted</b> empty cell on the board to see the tiles that fit there.</>
                  : <>Waiting for {oppLabel}…</>}
              </div>
            )}
            <div className="tx-controls">
              <button className="tx-ctl" disabled={!yourTurn || fittingTiles.length < 2}
                onClick={() => setOrient(v => (v + 1) % Math.max(1, fittingTiles.length))}>Rotate ⟳</button>
              <button className="tx-ctl primary" disabled={!yourTurn || !selCell} onClick={commit}>Place</button>
            </div>
          </div>

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => (
              <div key={i} className={'log-line ' + (l.who === 'sys' ? 'sys' : 'p' + l.who)}>{l.x}</div>
            ))}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={myWin} oppName={oppName} online={net.online} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, oppName, online, onNew }: { won: boolean; oppName: string; online: boolean; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Track complete' : 'Outplayed'}
      title={won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>{won
          ? 'Your track closed a loop or ran the full span of the board. The line is yours.'
          : online
            ? 'Your opponent’s track completed first — a loop or an eight-cell run across the board.'
            : 'The red track completed first — a loop or an eight-cell run across the board.'}</p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Trax"
      onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Every tile carries two curved tracks — one <b>white</b>, one <b>red</b> — and each of its four edges is a white or red track-end. There are two tile shapes: a <b>straight</b> tile and a <b>curved</b> elbow.</p>
        <p>Place a tile on any empty cell touching the played area. Track colors must <b>match on every shared edge</b> — white meets white, red meets red. Pick a highlighted cell, then choose a fitting orientation.</p>
        <p>After each move, any empty cell with <b>two same-color track-ends</b> pointing into it is filled automatically — a <i>forced</i> play.</p>
        <p>You are <b>white</b>; the AI is <b>red</b>. Win by making your color form a closed <b>loop</b> or a <b>line spanning 8 rows or 8 columns</b>. A color can only win for the player who owns it.</p>
        <p><b>Keys:</b> <kbd>R</kbd> rotate · <kbd>↵</kbd> place · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
    </Modal>
  )
}
