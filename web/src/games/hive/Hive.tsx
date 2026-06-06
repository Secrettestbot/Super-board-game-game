/* HIVE — UI (built for this codebase). An open hex field (no board) where you and a heuristic
   AI build an interlocking hive of insect tiles. Select a hand tile to PLACE or a placed piece to
   MOVE; legal targets light up. Win by completely surrounding the rival's queen. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as H from './logic'
import type { HiveState, PieceType, Player, Hex } from './logic'

const GLYPH: Record<PieceType, string> = { Q: '♛', S: '✷', B: '❖', G: '❀', A: '✤' }
const LABEL: Record<PieceType, string> = { Q: 'Queen', S: 'Spider', B: 'Beetle', G: 'Hopper', A: 'Ant' }

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#1c1407" stroke="#4a3712" strokeWidth="1.5" />
    <polygon points="24,8 35,14.3 35,26.7 24,33 13,26.7 13,14.3" fill="none" stroke="#e9a92e" strokeWidth="2" strokeLinejoin="round" />
    <polygon points="24,15 30,18.4 30,25.1 24,28.5 18,25.1 18,18.4" fill="#e9a92e" />
    <text x="24" y="26" textAnchor="middle" fontSize="11" fill="#1c1407" fontWeight="700">{'♛'}</text>
  </svg>
)

// pointy-top axial -> pixel. size = circumradius.
const SIZE = 30
function px(q: number, r: number): [number, number] {
  const x = SIZE * Math.sqrt(3) * (q + r / 2)
  const y = SIZE * 1.5 * r
  return [x, y]
}

export function Hive() {
  const [s, setS] = useState<HiveState>(() => H.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<{ kind: 'hand'; type: PieceType } | { kind: 'piece'; from: Hex } | null>(null)

  function newGame() { setS(H.makeGame()); setSel(null); setShowRules(false) }

  useAITurn(s.winner == null && s.turn === 1, () => setS(p => H.aiTurn(p)), { delayMs: 650, tick: s.last })
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setSel(null); setShowRules(false) },
  })

  const yourTurn = s.winner == null && s.turn === 0
  const you: Player = 0

  // compute legal targets for the current selection
  let targets: Hex[] = []
  if (yourTurn && sel) {
    if (sel.kind === 'hand') targets = H.legalPlacements(s, you)
    else targets = H.legalMoves(s, sel.from)
  }
  const targetSet = new Set(targets)

  function pickHand(t: PieceType) {
    if (!yourTurn) return
    const types = H.placeableTypes(s, you)
    if (!types.includes(t)) return
    setSel(sel && sel.kind === 'hand' && sel.type === t ? null : { kind: 'hand', type: t })
  }
  function pickPiece(h: Hex) {
    if (!yourTurn) return
    const top = H.topPiece(s, h)
    if (!top || top.owner !== you) return
    if (!H.queenPlaced(s, you)) return
    setSel(sel && sel.kind === 'piece' && sel.from === h ? null : { kind: 'piece', from: h })
  }
  function playTarget(h: Hex) {
    if (!yourTurn || !sel || !targetSet.has(h)) return
    if (sel.kind === 'hand') setS(H.applyMove(s, { kind: 'place', type: sel.type, to: h }))
    else setS(H.applyMove(s, { kind: 'move', type: H.topPiece(s, sel.from)!.type, from: sel.from, to: h }))
    setSel(null)
  }

  // ---- geometry: gather every hex to render (occupied + current targets) ----
  const renderHexes = new Set<Hex>(H.allHexes(s))
  for (const t of targets) renderHexes.add(t)
  if (renderHexes.size === 0) renderHexes.add(H.key(0, 0))

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  const placed: { h: Hex; x: number; y: number }[] = []
  for (const h of renderHexes) {
    const [q, r] = H.parse(h)
    const [x, y] = px(q, r)
    placed.push({ h, x, y })
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  const pad = SIZE * 1.6
  const W = maxX - minX + pad * 2
  const Hgt = maxY - minY + pad * 2
  const offX = pad - minX, offY = pad - minY

  // hex polygon (pointy-top) in local cell coords, width = sqrt(3)*SIZE, height = 2*SIZE
  const hw = Math.sqrt(3) * SIZE, hh = 2 * SIZE
  const hexPoly = `polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)`

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'You surrounded the rival queen — you win!' }
  else if (s.winner === 1) { bk = 'lose'; banner = 'Your queen is surrounded — you lose' }
  else if (s.winner === 'draw') { bk = 'lose'; banner = 'Both queens surrounded — a draw' }
  else if (yourTurn) {
    bk = 'you'
    const mustQ = H.placeableTypes(s, you).length === 1 && H.placeableTypes(s, you)[0] === 'Q' && !H.queenPlaced(s, you)
    banner = mustQ ? 'You must place your Queen this turn'
      : sel ? 'Choose a highlighted hex' : 'Your turn — place a tile or move a piece'
  } else { bk = 'foe'; banner = 'The rival is plotting…' }

  const myHand = s.hands[you]
  const placeable = new Set(H.placeableTypes(s, you))
  const enemySurround = (() => {
    let q: Hex | null = null
    for (const h of H.allHexes(s)) for (const pc of s.cells[h]) if (pc.owner === 1 && pc.type === 'Q') q = h
    if (!q) return null
    let n = 0; for (const nb of H.neighbors(q)) if (H.occupied(s, nb)) n++
    return n
  })()
  const mySurround = (() => {
    let q: Hex | null = null
    for (const h of H.allHexes(s)) for (const pc of s.cells[h]) if (pc.owner === 0 && pc.type === 'Q') q = h
    if (!q) return null
    let n = 0; for (const nb of H.neighbors(q)) if (H.occupied(s, nb)) n++
    return n
  })()

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Hive · surround the queen"
        title="Hive"
        subtitle="build an interlocking swarm of insect tiles on the open field — completely encircle the rival's queen bee to win"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>
          Your Q: {mySurround == null ? '—' : `${mySurround}/6`} &nbsp;·&nbsp; Rival Q: {enemySurround == null ? '—' : `${enemySurround}/6`}
        </>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click · select &nbsp; Esc · cancel &nbsp; N · new</>}
      >
        <div className="hv-wrap">
          <div className="hv-field" style={{ width: W, height: Hgt }}>
            {placed.map(({ h, x, y }) => {
              const top = H.topPiece(s, h)
              const isTarget = targetSet.has(h)
              const stack = s.cells[h] || []
              const selectedHere = sel && sel.kind === 'piece' && sel.from === h
              const cls = ['hv-cell']
              if (!top) cls.push('empty')
              if (isTarget) cls.push('target')
              if (selectedHere) cls.push('sel')
              if (s.last === h) cls.push('last')
              const ownCls = top ? (top.owner === 0 ? 'you' : 'foe') : ''
              return (
                <div
                  key={h}
                  className={cls.join(' ')}
                  style={{ left: x + offX - hw / 2, top: y + offY - hh / 2, width: hw, height: hh }}
                  onClick={() => { if (isTarget) playTarget(h); else if (top) pickPiece(h) }}
                >
                  <span className="hv-hex" style={{ clipPath: hexPoly }} />
                  {top && (
                    <span className={'hv-tile ' + ownCls + ' t-' + top.type} style={{ clipPath: hexPoly }}>
                      {stack.length > 1 && <span className="hv-stack">{stack.length}</span>}
                      <span className="hv-glyph">{GLYPH[top.type]}</span>
                    </span>
                  )}
                  {isTarget && <span className="hv-dot" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel hv-status">
            <div className={'hv-pl' + (yourTurn ? ' on' : '')}>
              <span className="hv-chip you" />
              <span className="hv-who"><b>You</b><i>amber swarm</i></span>
            </div>
            <div className={'hv-pl' + (s.turn === 1 && s.winner == null ? ' on' : '')}>
              <span className="hv-chip foe" />
              <span className="hv-who"><b>Rival</b><i>charcoal swarm</i></span>
            </div>
          </div>

          <div className="panel hv-hand">
            <div className="panel-l">your hand</div>
            <div className="hv-tiles">
              {H.TYPES.map(t => {
                const n = myHand[t]
                const can = yourTurn && placeable.has(t) && n > 0
                const isSel = sel && sel.kind === 'hand' && sel.type === t
                return (
                  <button
                    key={t}
                    className={'hv-handtile you t-' + t + (isSel ? ' sel' : '') + (can ? '' : ' off')}
                    disabled={!can}
                    onClick={() => pickHand(t)}
                    title={H.TYPE_NAME[t]}
                  >
                    <span className="hv-glyph">{GLYPH[t]}</span>
                    <span className="hv-hl">{LABEL[t]}</span>
                    <span className="hv-hn">{n}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal winner={s.winner} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ winner, onNew }: { winner: Player | 'draw'; onNew: () => void }) {
  const won = winner === 0
  const draw = winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Stalemate' : won ? 'Queen encircled' : 'Queen lost'}
      title={draw ? 'Draw' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        {draw ? <span className="foe">Both queens surrounded at once</span>
          : won ? <span className="you">The rival's queen is fully surrounded</span>
            : <span className="foe">Your queen is fully surrounded</span>}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Hive" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Each turn, <b>place</b> a new tile from your hand <i>or</i> <b>move</b> one already on the field. There is no board — the hive grows on an open hex grid. A placed tile must touch <b>your own</b> tiles and <b>no rival</b> tile (except the very first of each side).</p>
        <p>Your <b>Queen {'♛'}</b> must be placed by your 4th turn, and you can only start moving pieces once she is down.</p>
        <p><b>Queen</b> slides 1 · <b>Spider {'✷'}</b> slides exactly 3 · <b>Ant {'✤'}</b> slides any distance · <b>Grasshopper {'❀'}</b> jumps a straight line over pieces · <b>Beetle {'❖'}</b> steps 1 and can climb on top of a stack.</p>
        <p>The hive must stay <b>connected</b> at all times, and pieces can't squeeze through a one-tile gap. <b>Win</b> by occupying all six hexes around the rival's queen.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
    </Modal>
  )
}
