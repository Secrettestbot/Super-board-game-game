/* BATTLESHIP — UI. Two 10x10 sonar grids on the framework shell. Solo: vs a
   HUNT/TARGET AI. Online: two admirals, each privately placing a fleet, then firing.
   Seat-relative — your fleet and the waters you fire on are derived from mySeat, so a
   guest sitting in seat 1 plays correctly. Hidden info is enforced by the adapter's
   redactFor: you only ever see hits/misses (and sunk wrecks) on the opponent's grid. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { battleshipAdapter } from './net'
import type { PlacedShip } from './net'
import * as BS from './logic'
import type { Grid, Ship } from './logic'

const { N } = BS
const COLS = 'ABCDEFGHIJ'.split('')
const ROWS = Array.from({ length: N }, (_, i) => i + 1)

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#0c2538" stroke="#1d5a7a" strokeWidth="1.5" />
    <circle cx="24" cy="24" r="15" fill="none" stroke="#2f88b0" strokeWidth="1.4" opacity="0.5" />
    <circle cx="24" cy="24" r="9" fill="none" stroke="#2f88b0" strokeWidth="1.4" opacity="0.7" />
    <circle cx="24" cy="24" r="2.4" fill="#7fd4ff" />
    <line x1="24" y1="24" x2="38" y2="13" stroke="#7fd4ff" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="33" cy="32" r="2.6" fill="#ff5a52" />
  </svg>
)

const idx = (r: number, c: number) => r * N + c

/** Generate a valid random fleet layout (used to seed / re-roll the placement screen). */
function randomLayout(): PlacedShip[] {
  for (let attempt = 0; attempt < 50; attempt++) {
    const occupied = new Set<number>()
    const ships: PlacedShip[] = []
    let ok = true
    for (const spec of BS.FLEET) {
      let placed = false
      let guard = 0
      while (!placed && guard++ < 200) {
        const horiz = Math.random() < 0.5
        const maxR = horiz ? N : N - spec.len
        const maxC = horiz ? N - spec.len : N
        const r = (Math.random() * maxR) | 0
        const c = (Math.random() * maxC) | 0
        const cells: number[] = []
        for (let k = 0; k < spec.len; k++) cells.push(horiz ? idx(r, c + k) : idx(r + k, c))
        if (cells.some(x => occupied.has(x))) continue
        for (const x of cells) occupied.add(x)
        ships.push({ key: spec.key, cells })
        placed = true
      }
      if (!placed) { ok = false; break }
    }
    if (ok) return ships
  }
  return BS.FLEET.map((spec, r) => ({ key: spec.key, cells: Array.from({ length: spec.len }, (_, k) => idx(r, k)) }))
}

export function Battleship() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(battleshipAdapter)

  // Seat-relative grids: your own fleet vs the opponent's waters you fire on.
  const myGrid: Grid = mySeat === 0 ? s.you : s.enemy
  const foeGrid: Grid = mySeat === 0 ? s.enemy : s.you

  const [showRules, setShowRules] = useState(false)
  const [layout, setLayout] = useState<PlacedShip[]>(() => randomLayout())

  const inPlacement = s._phase === 'placement'
  const iNeedToPlace = inPlacement && isMyTurn

  function newGame() {
    netNew()
    setShowRules(false)
    setLayout(randomLayout())
  }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && !inPlacement && isMyTurn

  function clickFoe(i: number) {
    if (yourTurn && !foeGrid.fired[i]) dispatch({ kind: 'fire', cell: i })
  }

  function confirmFleet() {
    dispatch({ kind: 'place', ships: layout })
  }

  // ships sunk: foeGrid sunk = ships YOU sank; myGrid sunk = ships the opponent sank.
  const youSunk = BS.fleetSunkCount(foeGrid)
  const foeSunk = BS.fleetSunkCount(myGrid)

  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const myWin = s.winner != null && ((s.winner === 'you' && mySeat === 0) || (s.winner === 'ai' && mySeat === 1))

  let banner: string, bk = ''
  if (s.winner) { bk = myWin ? 'win' : 'lose'; banner = myWin ? 'Enemy fleet destroyed — you win' : `Your fleet is lost — ${oppLabel.toLowerCase()} wins` }
  else if (inPlacement) {
    if (iNeedToPlace) { bk = 'you'; banner = 'Position your fleet, then confirm' }
    else { bk = 'foe'; banner = `Waiting for ${oppLabel.toLowerCase()} to deploy…` }
  } else if (yourTurn) { bk = 'you'; banner = 'Your turn — fire on the rival waters' }
  else { bk = 'foe'; banner = `${oppLabel} is taking aim…` }

  // Placement preview grid: a pseudo-Grid showing the chosen layout as full ships.
  const previewGrid = useMemo<Grid>(() => {
    const ships: Ship[] = layout.map(p => {
      const spec = BS.FLEET.find(f => f.key === p.key)!
      return { key: p.key, name: spec.name, len: spec.len, cells: p.cells.slice(), hits: 0, sunk: false }
    })
    return { ships, fired: new Array(N * N).fill(false), hit: new Array(N * N).fill(false) }
  }, [layout])

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Battleship · seek &amp; sink"
        title="Battleship"
        subtitle="hunt the rival fleet across the grid — five ships, no quarter"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${youSunk} / 5 sunk`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="bs-boards">
          {iNeedToPlace ? (
            <BoardView grid={previewGrid} title="Deploy Your Fleet" side="own" active onCell={() => {}} />
          ) : (
            <BoardView
              grid={foeGrid}
              title="Rival Waters"
              side="enemy"
              active={yourTurn}
              onCell={clickFoe}
            />
          )}
          <BoardView
            grid={myGrid}
            title="Your Fleet"
            side="own"
            active={false}
            onCell={() => {}}
          />
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          {iNeedToPlace ? (
            <div className="panel fleet on">
              <div className="panel-l">Deployment</div>
              <div className="modal-body" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn-modal" onClick={() => setLayout(randomLayout())}>Randomize</button>
                <button className="btn-modal" onClick={confirmFleet}>Confirm fleet</button>
              </div>
            </div>
          ) : (
            <FleetPanel label="Rival Fleet" grid={foeGrid} hideUnsunk on={yourTurn && !s.winner} />
          )}
          <FleetPanel label="Your Fleet" grid={myGrid} on={!yourTurn && !inPlacement && !s.winner} />
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={myWin} youSunk={youSunk} foeSunk={foeSunk} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function BoardView({ grid, title, side, active, onCell }: {
  grid: Grid; title: string; side: 'enemy' | 'own'; active: boolean; onCell: (i: number) => void
}) {
  // map of index -> ship for own-side rendering & sunk-reveal on enemy side
  const shipAt = new Map<number, Ship>()
  for (const sh of grid.ships) for (const c of sh.cells) shipAt.set(c, sh)

  return (
    <div className="bs-board-wrap">
      <div className={'bs-board-title ' + (active ? 'on' : '')}>{title}</div>
      <div className={'bs-grid ' + side}>
        <div className="bs-corner" />
        {COLS.map(c => <div key={'c' + c} className="bs-coord col">{c}</div>)}
        {ROWS.map((rn, r) => (
          <div key={'row' + r} style={{ display: 'contents' }}>
            <div className="bs-coord row">{rn}</div>
            {COLS.map((_, c) => {
              const i = r * N + c
              const fired = grid.fired[i]
              const hit = grid.hit[i]
              const sh = shipAt.get(i)
              const showShip = side === 'own' ? !!sh : !!(sh && sh.sunk)
              const cls = ['bs-cell']
              if (side === 'enemy' && !fired && active) cls.push('aim')
              if (showShip) cls.push('ship')
              if (sh && sh.sunk) cls.push('sunk')
              if (fired && hit) cls.push('hit')
              if (fired && !hit) cls.push('miss')
              return (
                <div
                  key={i}
                  className={cls.join(' ')}
                  onClick={side === 'enemy' ? () => onCell(i) : undefined}
                >
                  {fired && hit && <span className="bs-mark hit">✦</span>}
                  {fired && !hit && <span className="bs-mark miss" />}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function FleetPanel({ label, grid, hideUnsunk, on }: {
  label: string; grid: Grid; hideUnsunk?: boolean; on?: boolean
}) {
  // With redaction, the opponent's grid only lists ships that are sunk (or partly hit).
  // Fall back to the static FLEET roster so the "Rival Fleet" panel always shows 5 rows.
  const roster = hideUnsunk
    ? BS.FLEET.map(spec => grid.ships.find(s => s.key === spec.key) ?? { key: spec.key, name: spec.name, len: spec.len, cells: [], hits: 0, sunk: false })
    : grid.ships
  return (
    <div className={'panel fleet ' + (on ? 'on' : '')}>
      <div className="panel-l">{label}</div>
      <div className="fleet-list">
        {roster.map(sh => (
          <div key={sh.key} className={'fleet-row ' + (sh.sunk ? 'sunk' : 'alive')}>
            <span className="fleet-name">{hideUnsunk && !sh.sunk ? '???' : sh.name}</span>
            <span className="fleet-pips">
              {Array.from({ length: sh.len }, (_, k) => (
                <span key={k} className={'pip ' + (k < sh.hits ? 'hit' : '')} />
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResultModal({ won, youSunk, foeSunk, oppLabel, onNew }: {
  won: boolean; youSunk: number; foeSunk: number; oppLabel: string; onNew: () => void
}) {
  return (
    <Modal
      eyebrow={won ? 'Seas secured' : 'Fleet lost'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You sank {youSunk}</span><span className="foe">{oppLabel} sank {foeSunk}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Battleship" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Two fleets are hidden on 10×10 grids. Each side has a <b>Carrier (5)</b>, <b>Battleship (4)</b>, <b>Cruiser (3)</b>, <b>Submarine (3)</b> and <b>Destroyer (2)</b>.</p>
        <p><b>Online:</b> each admiral privately deploys a fleet — use <b>Randomize</b> to find a layout, then <b>Confirm fleet</b>. Your opponent never sees where your ships sit, only your hits and misses.</p>
        <p>Take turns firing <b>one shot</b>. Click an un-fired cell on the <i>Rival Waters</i> grid: a <b>hit</b> shows a marker, a <b>miss</b> a pale dot. When every cell of a ship is hit, it is <b>sunk</b>.</p>
        <p>First admiral to <b>sink all five</b> of the enemy's ships wins.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
