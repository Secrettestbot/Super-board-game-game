/* PHOTOSYNTHESIS — UI (built for this codebase). A hexagon of light-and-shadow on the
   framework shell, vs a greedy AI. Grow trees, dodge shadows to bank light, then collect
   large trees off the high-value rings before the sun's three revolutions end. The AI takes
   several actions per turn and across many rounds, so its driver re-arms on s.step. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as P from './logic'
import type { State, Action, Player, Size } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#1f3320" stroke="#2f5132" strokeWidth="1.5" />
    <circle cx="36" cy="12" r="5" fill="#ffd25a" stroke="#e0962a" strokeWidth="1" />
    <rect x="22" y="30" width="4" height="10" rx="1.5" fill="#7a4a26" />
    <path d="M24 10 L33 30 L15 30 Z" fill="#4fa85a" stroke="#2f7a3a" strokeWidth="1" />
    <path d="M24 18 L30 33 L18 33 Z" fill="#67c46f" stroke="#2f7a3a" strokeWidth="1" />
  </svg>
)

// --- pointy-top axial → pixel layout ---
const HEX = 30 // hex "size" (center → corner)
const SQ3 = Math.sqrt(3)
function px(q: number, r: number): { x: number; y: number } {
  return { x: HEX * SQ3 * (q + r / 2), y: HEX * 1.5 * r }
}
// pointy-top hex corner path (flat sides left/right, points up/down)
function hexPath(cx: number, cy: number, size: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 180) * (60 * i - 90)
    pts.push((cx + size * Math.cos(ang)).toFixed(2) + ',' + (cy + size * Math.sin(ang)).toFixed(2))
  }
  return 'M' + pts.join(' L') + 'Z'
}

const RING_FILL = ['ring-c', 'ring-i', 'ring-m', 'ring-o']

function Tree({ owner, size, x, y, shaded }: { owner: Player; size: Size; x: number; y: number; shaded: boolean }) {
  const cls = 'tree ' + (owner === 0 ? 'you' : 'foe') + (shaded ? ' shaded' : '')
  if (size === P.SEED) {
    return <g className={cls}><circle cx={x} cy={y} r={4.5} className="tree-fill" /></g>
  }
  // canopy radius by size
  const rad = size === P.SMALL ? 7 : size === P.MEDIUM ? 10 : 13
  const trunkH = size === P.SMALL ? 6 : size === P.MEDIUM ? 9 : 12
  return (
    <g className={cls}>
      <rect x={x - 1.6} y={y} width={3.2} height={trunkH} rx={1.2} className="trunk" />
      <path d={hexPath(x, y - rad * 0.2, rad)} className="tree-fill" />
      {size === P.LARGE && <circle cx={x} cy={y - rad * 0.2} r={rad * 0.42} className="tree-core" />}
    </g>
  )
}

export function Photosynthesis() {
  const [s, setS] = useState<State>(() => P.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<string | null>(null) // selected cell key for plant-from / action focus
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(P.makeGame()); setSel(null); setShowRules(false) }

  // The AI takes several actions per turn and across rounds → re-arm on s.step.
  useAITurn(s.phase !== 'over' && s.turn === 1, () => setS(p => P.aiTurn(p)), { delayMs: 460, tick: s.step })
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  const yourTurn = s.phase !== 'over' && s.turn === 0
  const shaded = P.computeShadows(s)
  const acts = yourTurn ? P.legalActions(s, 0) : []
  const myLight = s.players[0].lightPoints

  // Action sets keyed for quick lookup of what a cell can do this turn.
  const growKeys = new Set(acts.filter(a => a.type === 'grow').map(a => P.key((a as any).q, (a as any).r)))
  const collectKeys = new Set(acts.filter(a => a.type === 'collect').map(a => P.key((a as any).q, (a as any).r)))
  const plantActs = acts.filter(a => a.type === 'plant') as Extract<Action, { type: 'plant' }>[]
  const plantKeys = new Set(plantActs.map(a => P.key(a.q, a.r)))

  function doAction(a: Action) { setS(P.applyAction(s, a)); setSel(null) }
  function endTurn() { setS(P.applyAction(s, { type: 'end' })); setSel(null) }

  function onCellClick(k: string) {
    if (!yourTurn) return
    const c = s.board[k]
    if (c.tree != null && c.tree.owner === 0) {
      if (collectKeys.has(k)) { doAction({ type: 'collect', q: c.q, r: c.r }); return }
      if (growKeys.has(k)) { doAction({ type: 'grow', q: c.q, r: c.r }); return }
      // selecting a small+ tree to plant from
      if (c.tree.size >= P.SMALL) { setSel(sel === k ? null : k); return }
    }
    if (c.tree == null && plantKeys.has(k)) {
      // pick a plant action targeting this cell (any valid seeder, or the selected one)
      const fromSel = sel != null ? plantActs.find(a => P.key(a.q, a.r) === k && a.from === sel) : undefined
      const a = fromSel ?? plantActs.find(x => P.key(x.q, x.r) === k)
      if (a != null) doAction(a)
    }
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
    extra: (e) => {
      if (s.phase === 'over' || s.turn !== 0) return false
      if (e.key === ' ' || e.key === 'Enter') { endTurn(); return true }
      return false
    },
  })

  // banner
  let banner: string, bk = ''
  if (s.phase === 'over') {
    if (s.winner === 0) { bk = 'win'; banner = 'You win — ' + s.players[0].vp + ' to ' + s.players[1].vp + ' VP' }
    else { bk = 'lose'; banner = 'The rival wins — ' + s.players[1].vp + ' to ' + s.players[0].vp + ' VP' }
  } else if (yourTurn) {
    bk = 'you'
    const has = acts.some(a => a.type !== 'end')
    banner = has ? 'Your turn — spend light, then end (space)' : 'No light to spend — end your turn (space)'
  } else { bk = 'foe'; banner = 'The rival tends their grove…' }

  // sun position around the board for the indicator
  const sunDir = P.DIRS[s.sun]
  const sunPt = px(sunDir.q * 4.4, sunDir.r * 4.4)

  const myTrees = P.treeCounts(s, 0)
  const foeTrees = P.treeCounts(s, 1)
  const rev = Math.min(P.REVOLUTIONS, Math.floor((s.round - 1) / 6) + 1)

  const W = HEX * SQ3 * 7.6, Hh = HEX * 7.6
  const cx = W / 2, cy = Hh / 2

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Photosynthesis · light & shadow"
        title="Photosynthesis"
        subtitle="grow a forest in the rotating sun — out of the shadows, into the light, and harvest the richest rings before dusk"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Round ${s.round}/${P.ROUNDS_TOTAL} · Rev ${rev}/${P.REVOLUTIONS}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click · act &nbsp; space · end turn &nbsp; N · new</>}
      >
        <div className="ps-wrap">
          <div className="ps-boardbox">
            <svg className="ps-svg" viewBox={`${-cx} ${-cy} ${W} ${Hh}`} role="img" aria-label="forest board">
              {/* sun rays direction tint */}
              <defs>
                <radialGradient id="sunglow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#ffe89a" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#ffd25a" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* cells */}
              {Object.keys(s.board).map(k => {
                const c = s.board[k]
                const { x, y } = px(c.q, c.r)
                const isShadow = c.tree == null
                  ? cellInShadow(s, c.q, c.r)
                  : shaded.has(k)
                const isPlant = yourTurn && c.tree == null && plantKeys.has(k)
                const isGrow = yourTurn && growKeys.has(k)
                const isCollect = yourTurn && collectKeys.has(k)
                const selFrom = sel === k
                const cls = ['ps-hex', RING_FILL[c.ring],
                  isShadow ? 'shadow' : '',
                  isPlant ? 'plant-ok' : '', isGrow ? 'grow-ok' : '', isCollect ? 'collect-ok' : '',
                  selFrom ? 'sel' : ''].filter(Boolean).join(' ')
                return (
                  <g key={k} className="ps-cellgrp" onClick={() => onCellClick(k)}>
                    <path d={hexPath(x, y, HEX - 1.4)} className={cls} />
                    {c.tree != null && <Tree owner={c.tree.owner} size={c.tree.size} x={x} y={y} shaded={shaded.has(k)} />}
                  </g>
                )
              })}

              {/* sun indicator */}
              <g className="ps-sun" transform={`translate(${sunPt.x} ${sunPt.y})`}>
                <circle r={34} fill="url(#sunglow)" />
                <circle r={13} className="sun-core" />
                {Array.from({ length: 8 }, (_, i) => {
                  const a = (Math.PI / 4) * i
                  return <line key={i} x1={Math.cos(a) * 16} y1={Math.sin(a) * 16} x2={Math.cos(a) * 23} y2={Math.sin(a) * 23} className="sun-ray" />
                })}
              </g>
            </svg>
          </div>

          <div className="side">
            <div className="panel ps-score">
              <div className={'ps-prow' + (yourTurn ? ' on' : '')}>
                <span className="ps-pawn you" />
                <span className="ps-who">You</span>
                <span className="ps-vp">{s.players[0].vp} <small>VP</small></span>
              </div>
              <div className="ps-stat">
                <span className="ps-light">☀ {myLight} light</span>
                <span className="ps-inv">{invStr(myTrees)}</span>
              </div>
              <div className={'ps-prow' + (s.turn === 1 && s.phase !== 'over' ? ' on' : '')}>
                <span className="ps-pawn foe" />
                <span className="ps-who">Rival</span>
                <span className="ps-vp">{s.players[1].vp} <small>VP</small></span>
              </div>
              <div className="ps-stat">
                <span className="ps-light">☀ {s.players[1].lightPoints} light</span>
                <span className="ps-inv">{invStr(foeTrees)}</span>
              </div>
            </div>

            <div className="panel ps-control">
              <div className="panel-l">spend light</div>
              <div className="ps-actbtns">
                <button className="ps-btn" disabled={!yourTurn} onClick={() => setSel(null)} title="click a small/medium/large tree, then an adjacent empty cell">
                  Plant <span className="ps-cost">{P.PLANT_COST}☀</span>
                </button>
                <button className="ps-btn" disabled={!yourTurn} title="click one of your trees to grow it">
                  Grow <span className="ps-cost">1–3☀</span>
                </button>
                <button className="ps-btn" disabled={!yourTurn} title="click a large tree to harvest it">
                  Collect <span className="ps-cost">{P.COLLECT_COST}☀</span>
                </button>
              </div>
              <button className="ps-btn end" disabled={!yourTurn} onClick={endTurn}>End turn ▸</button>
              <div className="ps-hint">
                {yourTurn
                  ? (sel != null ? 'Now click a glowing empty cell to plant a seed.' : 'Click a highlighted tree or cell. Trees in shadow earn no light.')
                  : s.phase === 'over' ? 'The sun has set.' : 'Watching the rival…'}
              </div>
            </div>

            <div className="panel ps-rings">
              <div className="panel-l">ring VP remaining (top = next)</div>
              {P.RING_NAMES.map((name, i) => (
                <div key={i} className="ps-ringrow">
                  <span className={'ps-ringdot ' + RING_FILL[i]} />
                  <span className="ps-ringname">{name}</span>
                  <span className="ps-ringvals">{s.vpTiles[i].length ? s.vpTiles[i].join(' ') : '—'}</span>
                </div>
              ))}
            </div>

            <div className="panel logbox" ref={logRef}>
              {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
            </div>
          </div>
        </div>
      </GameShell>

      {s.phase === 'over' && s.winner != null && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function invStr(t: [number, number, number, number]): string {
  return `${t[0]}🌱 ${t[1]}● ${t[2]}●● ${t[3]}●●●`
}

/** Whether an EMPTY cell sits in shadow (for visual dimming) — covered by any caster. */
function cellInShadow(s: State, q: number, r: number): boolean {
  const map = P.computeShadowMap(s)
  return (map[P.key(q, r)] ?? 0) > 0
}

function ResultModal({ s, onNew }: { s: State; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? 'The forest thrives' : 'Out-grown'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Plant again</button>}
    >
      <div className="modal-body" style={{ textAlign: 'center' }}>
        <p>
          <b className={won ? 'ps-final-you' : ''}>You {s.players[0].vp} VP</b>
          {'  ·  '}
          <b className={!won ? 'ps-final-foe' : ''}>Rival {s.players[1].vp} VP</b>
        </p>
        <p>{won ? 'Your canopy caught the most sun and crowned the richest rings.' : 'The rival harvested the richest rings before you. Try guarding the center.'}</p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Photosynthesis" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Grow on</button>}>
      <div className="modal-body">
        <p>Grow a forest on a <b>hexagon of four rings</b> — center, inner, middle, outer. The <b>sun</b> sits on one edge and <b>rotates one step each round</b>; it makes <b>three full revolutions</b> ({P.ROUNDS_TOTAL} rounds), then most <b>VP wins</b>.</p>
        <p>Each round, every tree <i>not in shadow</i> collects <b>light = its size</b> (small 1, medium 2, large 3; seeds 0). A tree casts a <b>shadow</b> away from the sun as long as its size, and a tree is <b>shaded</b> if a <i>same-or-larger</i> tree's shadow covers it.</p>
        <p>Spend light to <b>Plant</b> a seed beside one of your small+ trees (1☀), <b>Grow</b> a tree up a size (1/2/3☀), or <b>Collect</b> a large tree (4☀) — removing it to score that ring's <b>VP tile</b>. Tiles deplete highest-first, so the <b>center</b> ring is richest.</p>
        <p><b>Play:</b> click a glowing tree to grow or harvest it, or click a tree then a glowing empty cell to plant. <kbd>Space</kbd> ends your turn.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> end turn · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
