/* HAVANNAH — the hexagonal connection game (UI). A hexagon of pointy-top hex cells rendered in
   SVG on the framework shell, played against a connection-distance AI. You are Ember (warm) and
   move first; win with a bridge (2 corners), a fork (3 edges), or a ring. Click an empty cell to
   place; the winning structure lights up gold at game end. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as HV from './logic'
import type { State } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#171a23" stroke="#2a2c3b" strokeWidth="1.5" />
    <polygon points="24,7 38,15.5 38,32.5 24,41 10,32.5 10,15.5" fill="none" stroke="#e8743c" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="24" cy="24" r="4.4" fill="#5fa8c4" />
    <circle cx="24" cy="14.5" r="2.6" fill="#e8a13c" />
    <circle cx="32" cy="28.5" r="2.6" fill="#e8a13c" />
    <circle cx="16" cy="28.5" r="2.6" fill="#e8a13c" />
  </svg>
)

// Pointy-top hex pixel geometry. We position by axial (q=x, r=z) for a flat-y arrangement.
const SIZE = 30                     // hex circumradius in svg units
const HEX_W = Math.sqrt(3) * SIZE   // width of a pointy-top hex
const HEX_H = 2 * SIZE

function pixelOf(x: number, z: number): { px: number; py: number } {
  // axial pointy-top: x_pix = size*sqrt3*(q + r/2), y_pix = size*3/2*r
  const px = HEX_W * (x + z / 2)
  const py = (3 / 2) * SIZE * z
  return { px, py }
}

function hexPoints(cx: number, cy: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 180) * (60 * i - 90) // pointy-top: first vertex at top
    pts.push(`${(cx + SIZE * Math.cos(ang)).toFixed(2)},${(cy + SIZE * Math.sin(ang)).toFixed(2)}`)
  }
  return pts.join(' ')
}

export function Havannah() {
  const [s, setS] = useState<State>(() => HV.makeGame(6))
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(HV.makeGame(6)); setShowRules(false) }

  useAITurn(s.winner == null && s.turn === 1, () => setS(p => HV.aiTurn(p)), { delayMs: 480, tick: s.last })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = s.winner == null && s.turn === 0
  const winSet = useMemo(() => new Set(s.winGroup), [s.winGroup])

  // Precompute geometry + bounds for the viewBox.
  const layout = useMemo(() => {
    const items = s.cells.map(k => {
      const { x, z } = HV.cubeOf(k)
      const { px, py } = pixelOf(x, z)
      return { k, px, py }
    })
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const it of items) {
      minX = Math.min(minX, it.px - HEX_W / 2); maxX = Math.max(maxX, it.px + HEX_W / 2)
      minY = Math.min(minY, it.py - HEX_H / 2); maxY = Math.max(maxY, it.py + HEX_H / 2)
    }
    const pad = 6
    return { items, vb: `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}` }
  }, [s.cells])

  function clickCell(k: string) { if (yourTurn && s.board[k] == null) setS(HV.place(s, 0, k)) }

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = winLabel(s, 'You') }
  else if (s.winner === 1) { bk = 'lose'; banner = winLabel(s, 'Frost') }
  else if (HV.legalMoves(s).length === 0) { bk = ''; banner = 'The board is full — a draw' }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — place an ember stone' }
  else { bk = 'foe'; banner = 'Frost is thinking…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Havannah · bridge · fork · ring"
        title="Havannah"
        subtitle="connect two corners, three edges, or close a ring — and stop the rival doing the same"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`side ${s.N} · ${s.cells.length} cells`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="hv-wrap">
          <div className="hv-frame">
            <svg className="hv-svg" viewBox={layout.vb} role="img" aria-label="Havannah board">
              <defs>
                <radialGradient id="emberGrad" cx="36%" cy="30%" r="75%">
                  <stop offset="0%" stopColor="var(--ember-hi)" />
                  <stop offset="55%" stopColor="var(--ember)" />
                  <stop offset="100%" stopColor="var(--ember-d)" />
                </radialGradient>
                <radialGradient id="frostGrad" cx="36%" cy="30%" r="75%">
                  <stop offset="0%" stopColor="var(--frost-hi)" />
                  <stop offset="55%" stopColor="var(--frost)" />
                  <stop offset="100%" stopColor="var(--frost-d)" />
                </radialGradient>
              </defs>
              {layout.items.map(({ k, px, py }) => {
                const v = s.board[k]
                const isCorner = s.corners.has(k)
                const isEdge = s.edges.has(k)
                const cls = 'hv-cell'
                  + (isCorner ? ' corner' : isEdge ? ' edge' : '')
                  + (yourTurn && v == null ? ' playable' : '')
                  + (s.last === k ? ' last' : '')
                  + (winSet.has(k) ? ' win' : '')
                return (
                  <g key={k} className={cls} onClick={() => clickCell(k)}>
                    <polygon className="hv-face" points={hexPoints(px, py)} />
                    {isCorner && <circle className="hv-mark corner" cx={px} cy={py} r={SIZE * 0.16} />}
                    {isEdge && v == null && <circle className="hv-mark edge" cx={px} cy={py} r={SIZE * 0.11} />}
                    {v != null && (
                      <>
                        <circle className={'hv-stone p' + v} cx={px} cy={py} r={SIZE * 0.62} />
                        <circle className="hv-stone-ring" cx={px} cy={py} r={SIZE * 0.62} />
                      </>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        <div className="side">
          <div className="panel players">
            <div className={'pl p0' + (s.turn === 0 && s.winner == null ? ' on' : '')}>
              <span className="pl-stone p0" />
              <span className="pl-txt"><b>You · Ember</b><i>warm · first</i></span>
            </div>
            <div className={'pl p1' + (s.turn === 1 && s.winner == null ? ' on' : '')}>
              <span className="pl-stone p1" />
              <span className="pl-txt"><b>Frost · AI</b><i>cool · second</i></span>
            </div>
          </div>
          <div className="panel goals">
            <div className="goal"><b>Bridge</b><span>link any 2 of the 6 corners</span></div>
            <div className="goal"><b>Fork</b><span>link any 3 of the 6 edges</span></div>
            <div className="goal"><b>Ring</b><span>close a loop around a cell</span></div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function structureWord(t: State['winType']): string {
  return t === 'bridge' ? 'a bridge' : t === 'fork' ? 'a fork' : t === 'ring' ? 'a ring' : 'a structure'
}
function winLabel(s: State, who: string): string {
  return `${who} ${who === 'You' ? 'complete' : 'completes'} ${structureWord(s.winType)} — ${who === 'You' ? 'you win' : 'it wins'}`
}

function ResultModal({ s, onNew }: { s: State; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? structureWord(s.winType) + ' complete' : 'Out-connected'}
      title={won ? 'You Win' : 'Frost Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className={won ? 'you' : 'foe'}>
          {(won ? 'Ember' : 'Frost') + ' completes ' + structureWord(s.winType)}
        </span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Havannah" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>Ember</b> and move first. Click any empty hex to place a stone, then <b>Frost</b> replies. Stones are never captured or moved — you simply alternate placements.</p>
        <p>Win by completing <i>any one</i> structure with a single connected group of your stones:</p>
        <p><b>Bridge</b> — a group linking any <i>two</i> of the six corner cells. <b>Fork</b> — a group touching any <i>three</i> of the six edges (an edge is a border cell between two corners). <b>Ring</b> — a closed loop of your stones surrounding at least one cell (the enclosed cell may be empty or hold either colour).</p>
        <p>If the board fills with no structure it is a <i>draw</i> — rare. <b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
