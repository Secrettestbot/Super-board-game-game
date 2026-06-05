/* BATTLESHIP — UI (built for this codebase). Two 10x10 sonar grids on the
   framework shell, vs a HUNT/TARGET AI. You fire on the rival's waters; the
   rival fires back on yours. Sink the whole fleet to win. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as BS from './logic'
import type { BattleshipState, Grid, Ship } from './logic'

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

export function Battleship() {
  const [s, setS] = useState<BattleshipState>(() => BS.makeGame())
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(BS.makeGame()); setShowRules(false) }

  useAITurn(!s.winner && s.turn === 'ai', () => setS(p => BS.aiFire(p)), {
    delayMs: 620,
    tick: `${s.shotsFired}-${s.turn}`,
  })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && s.turn === 'you'

  function clickEnemy(i: number) {
    if (yourTurn && !s.enemy.fired[i]) setS(BS.fire(s, i))
  }

  const youSunk = BS.fleetSunkCount(s.enemy) // ships you've sunk
  const aiSunk = BS.fleetSunkCount(s.you)    // ships the rival has sunk

  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = 'Enemy fleet destroyed — you win' }
  else if (s.winner === 'ai') { bk = 'lose'; banner = 'Your fleet is lost — rival wins' }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — fire on the rival waters' }
  else { bk = 'foe'; banner = 'Rival is taking aim…' }

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
          <BoardView
            grid={s.enemy}
            title="Rival Waters"
            side="enemy"
            active={yourTurn}
            onCell={clickEnemy}
          />
          <BoardView
            grid={s.you}
            title="Your Fleet"
            side="own"
            active={false}
            onCell={() => {}}
          />
        </div>

        <div className="side">
          <FleetPanel label="Rival Fleet" grid={s.enemy} hideUnsunk on={yourTurn && !s.winner} />
          <FleetPanel label="Your Fleet" grid={s.you} on={!yourTurn && !s.winner} />
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} youSunk={youSunk} aiSunk={aiSunk} onNew={newGame} />}
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
  return (
    <div className={'panel fleet ' + (on ? 'on' : '')}>
      <div className="panel-l">{label}</div>
      <div className="fleet-list">
        {grid.ships.map(sh => (
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

function ResultModal({ s, youSunk, aiSunk, onNew }: {
  s: BattleshipState; youSunk: number; aiSunk: number; onNew: () => void
}) {
  const won = s.winner === 'you'
  return (
    <Modal
      eyebrow={won ? 'Seas secured' : 'Fleet lost'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You sank {youSunk}</span><span className="foe">Rival sank {aiSunk}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Battleship" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Two fleets are hidden on 10×10 grids. Each side has a <b>Carrier (5)</b>, <b>Battleship (4)</b>, <b>Cruiser (3)</b>, <b>Submarine (3)</b> and <b>Destroyer (2)</b> — placed at random.</p>
        <p>Take turns firing <b>one shot</b>. Click an un-fired cell on the <i>Rival Waters</i> grid: a <b>hit</b> shows a marker, a <b>miss</b> a pale dot. When every cell of a ship is hit, it is <b>sunk</b>.</p>
        <p>First admiral to <b>sink all five</b> of the enemy's ships wins. The rival hunts methodically — once it lands a hit it works the surrounding cells until your ship goes down.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
