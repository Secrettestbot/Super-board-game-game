/* TSURO — UI (built for this codebase). A 6x6 lacquer board on the framework shell.
   Place a painted path tile in front of your dragon; every stone follows the paths;
   last dragon on the board wins. Versus a safe 1-ply survival AI. */

import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as TS from './logic'
import type { TsuroState, Tile, Stone } from './logic'

const { N } = TS

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#171019" stroke="#3a2c44" strokeWidth="1.5" />
    <path d="M10 12 C24 12 24 36 38 36" fill="none" stroke="#d9b3e0" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M10 36 C24 36 24 12 38 12" fill="none" stroke="#b98ad0" strokeWidth="2.2" strokeLinecap="round" opacity="0.6" />
    <circle cx="10" cy="12" r="2.6" fill="#f0d27a" />
    <circle cx="38" cy="36" r="2.6" fill="#9fd6c0" />
  </svg>
)

// ---- port coordinates within a unit cell (0..1) ----
const PORT_XY: [number, number][] = [
  [1 / 3, 0], [2 / 3, 0],   // 0,1 top
  [1, 1 / 3], [1, 2 / 3],   // 2,3 right
  [2 / 3, 1], [1 / 3, 1],   // 4,5 bottom
  [0, 2 / 3], [0, 1 / 3],   // 6,7 left
]

// Draw a tile's 4 paths inside a unit-square cell, scaled by `size`.
function TilePaths({ tile, size, faint }: { tile: Tile; size: number; faint?: boolean }) {
  const seen = new Set<number>()
  const segs: ReactElement[] = []
  for (let p = 0; p < 8; p++) {
    const q = tile[p]
    if (seen.has(p) || seen.has(q)) continue
    seen.add(p); seen.add(q)
    const [ax, ay] = PORT_XY[p], [bx, by] = PORT_XY[q]
    // pull control points toward the cell centre for a flowing curve
    const cx = 0.5, cy = 0.5
    const c1x = ax + (cx - ax) * 0.62, c1y = ay + (cy - ay) * 0.62
    const c2x = bx + (cx - bx) * 0.62, c2y = by + (cy - by) * 0.62
    const d = `M ${ax * size} ${ay * size} C ${c1x * size} ${c1y * size} ${c2x * size} ${c2y * size} ${bx * size} ${by * size}`
    segs.push(<path key={p} d={d} className={'ts-path' + (faint ? ' faint' : '')} />)
  }
  return <>{segs}</>
}

export function Tsuro() {
  const [s, setS] = useState<TsuroState>(() => TS.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState(0)        // selected hand index
  const [rot, setRot] = useState(0)        // chosen rotation (quarters)

  function newGame() { setS(TS.makeGame()); setShowRules(false); setSel(0); setRot(0) }

  const yourTurn = !s.winner && s.turn === 'you'

  useAITurn(!s.winner && s.turn === 'foe', () => setS(p => TS.aiMove(p)), { delayMs: 560 })
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === 'r' || e.key === 'R') { setRot(v => (v + 1) % 4); return true }
      if (e.key === 'Enter' || e.key === ' ') { commit(); return true }
      if (e.key >= '1' && e.key <= '3') { const i = +e.key - 1; if (i < s.hands.you.length) { setSel(i); return true } }
      return false
    },
  })

  function commit() {
    if (!yourTurn) return
    if (sel >= s.hands.you.length) return
    setS(TS.place(s, sel, rot)); setSel(0); setRot(0)
  }

  const yourStone = s.stones.find(x => x.who === 'you')!
  const foeStone = s.stones.find(x => x.who === 'foe')!
  const target = yourTurn ? yourStone.cell : null

  // preview tile (rotated) over the forced cell
  const preview = useMemo<Tile | null>(() => {
    if (!yourTurn || sel >= s.hands.you.length) return null
    return TS.rotateTile(s.hands.you[sel], rot)
  }, [yourTurn, sel, rot, s.hands.you])

  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = 'You win — last dragon on the board' }
  else if (s.winner === 'foe') { bk = 'lose'; banner = 'The rival wins — your dragon fell' }
  else if (s.winner === 'draw') { bk = ''; banner = 'A draw — both dragons fell together' }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — place a path in front of your dragon' }
  else { bk = 'foe'; banner = 'The rival is charting a path…' }

  const survivors = s.stones.filter(x => x.alive).length

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Tsuro · follow the path"
        title="Tsuro"
        subtitle="lay a tile in front of your dragon and ride the painted path — the last dragon on the board wins"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${survivors} on the board`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>R · rotate &nbsp; ↵ · place &nbsp; N · new</>}
      >
        <div className="ts-wrap">
          <Board s={s} target={target} preview={preview} yourStone={yourStone} foeStone={foeStone} />
        </div>

        <div className="side">
          <div className="panel ts-turn">
            <div className={'ts-who you' + (s.turn === 'you' && !s.winner ? ' on' : '') + (yourStone.alive ? '' : ' dead')}>
              <span className="ts-dot you" /><span className="ts-name">Your dragon</span>
              <span className="ts-state">{yourStone.alive ? 'on the board' : 'fallen'}</span>
            </div>
            <div className={'ts-who foe' + (s.turn === 'foe' && !s.winner ? ' on' : '') + (foeStone.alive ? '' : ' dead')}>
              <span className="ts-dot foe" /><span className="ts-name">Rival dragon</span>
              <span className="ts-state">{foeStone.alive ? 'on the board' : 'fallen'}</span>
            </div>
          </div>

          <div className="panel ts-hand">
            <div className="panel-l">Your hand · {s.hands.you.length} tiles</div>
            <div className="ts-tiles">
              {s.hands.you.map((t, i) => {
                const shown = i === sel ? TS.rotateTile(t, rot) : t
                return (
                  <button key={i} className={'ts-tile' + (i === sel ? ' sel' : '')} disabled={!yourTurn}
                    onClick={() => { setSel(i); setRot(0) }}>
                    <svg viewBox="0 0 60 60" className="ts-tile-svg">
                      <rect x="1" y="1" width="58" height="58" rx="6" className="ts-tile-bg" />
                      <TilePaths tile={shown} size={60} />
                    </svg>
                  </button>
                )
              })}
            </div>
            <div className="ts-controls">
              <button className="ts-ctl" disabled={!yourTurn} onClick={() => setRot(v => (v + 1) % 4)}>Rotate ⟳</button>
              <button className="ts-ctl primary" disabled={!yourTurn} onClick={commit}>Place tile</button>
            </div>
          </div>

          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function Board({ s, target, preview, yourStone, foeStone }: {
  s: TsuroState; target: number | null; preview: Tile | null; yourStone: Stone; foeStone: Stone
}) {
  const SZ = 100 // virtual unit per cell in the svg viewBox
  const W = N * SZ
  const cells: ReactElement[] = []
  for (let cell = 0; cell < N * N; cell++) {
    const r = Math.floor(cell / N), c = cell % N
    const tile = s.placed[cell]
    const isTarget = cell === target
    cells.push(
      <g key={cell} transform={`translate(${c * SZ} ${r * SZ})`}>
        <rect x="1" y="1" width={SZ - 2} height={SZ - 2} rx="5"
          className={'ts-cell' + (tile ? ' filled' : '') + (isTarget ? ' target' : '')} />
        {tile && <g><TilePaths tile={tile} size={SZ} /></g>}
        {!tile && preview && isTarget && <g className="ts-preview"><TilePaths tile={preview} size={SZ} faint /></g>}
      </g>,
    )
  }

  function stoneXY(st: Stone) {
    const r = Math.floor(st.cell / N), c = st.cell % N
    const [px, py] = PORT_XY[st.port]
    return { x: (c + px) * SZ, y: (r + py) * SZ }
  }

  return (
    <svg className="ts-board" viewBox={`-6 -6 ${W + 12} ${W + 12}`}>
      <rect x={-4} y={-4} width={W + 8} height={W + 8} rx="10" className="ts-board-bg" />
      {cells}
      {[foeStone, yourStone].map((st) => {
        if (!st.alive) return null
        const { x, y } = stoneXY(st)
        return <circle key={st.who} cx={x} cy={y} r={SZ * 0.14} className={'ts-stone ' + st.who} />
      })}
    </svg>
  )
}

function ResultModal({ s, onNew }: { s: TsuroState; onNew: () => void }) {
  const won = s.winner === 'you', draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Both fell' : won ? 'Path mastered' : 'Driven off'}
      title={draw ? 'A Draw' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>{draw
          ? 'Both dragons rode off the board on the same move — an even ending.'
          : won
            ? 'The rival dragon was driven off the edge. Yours holds the board alone.'
            : 'Your dragon rode off the edge. The rival holds the board.'}</p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Tsuro" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Each dragon sits on the edge of the board. On your turn, pick a path tile from your hand, <b>rotate</b> it, and lay it on the empty cell <b>directly in front of your dragon</b>.</p>
        <p>Every dragon then <b>follows the painted paths</b> — riding from cell to cell wherever the lines lead, until it lands on the edge of an empty cell or rides clean <b>off the board</b>.</p>
        <p>A dragon driven off the edge is <i>eliminated</i>. Be the <b>last dragon on the board</b> to win. If both ride off on the same move, it's a draw.</p>
        <p>The rival never plays a move that would drive its own dragon off if a safe tile exists.</p>
        <p><b>Keys:</b> <kbd>1</kbd>–<kbd>3</kbd> pick tile · <kbd>R</kbd> rotate · <kbd>↵</kbd> place · <kbd>N</kbd> new · <kbd>?</kbd> rules.</p>
      </div>
    </Modal>
  )
}
