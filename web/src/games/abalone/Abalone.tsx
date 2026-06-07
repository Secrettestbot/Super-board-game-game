/* ABALONE — UI (built for this codebase). A circular wooden board of recessed hex cups
   with glossy black/ivory marbles, on the framework shell, vs an alpha-beta AI.
   Click your marble(s) to build an in-line group of up to 3, then click a direction
   arrow (or a highlighted target cup) to push. Sumito a shorter enemy line off the rim. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { abaloneAdapter } from './net'
import * as AB from './logic'
import type { AbaloneState, Key, Hex, Marble } from './logic'

const { key, parseKey, DIRS, DIR_NAMES } = AB

// ---- pixel layout (flat-top-ish; axial -> x,y) ----
const SIZE = 30                 // hex radius in svg units
const SX = SIZE * 1.5           // column step
const SY = SIZE * Math.sqrt(3)  // row step
function pix(h: Hex): { x: number; y: number } {
  // axial -> pixel; q drives x, and rows shear with q to form the hexagon
  const x = SX * h.q
  const y = SY * (h.r + h.q / 2)
  return { x, y }
}
const CELLS = AB.allCells()
const PTS = CELLS.map(h => ({ h, ...pix(h), k: key(h.q, h.r) }))
const XS = PTS.map(p => p.x), YS = PTS.map(p => p.y)
const MINX = Math.min(...XS) - SIZE, MAXX = Math.max(...XS) + SIZE
const MINY = Math.min(...YS) - SIZE, MAXY = Math.max(...YS) + SIZE
const VW = MAXX - MINX, VH = MAXY - MINY
const CX = (MINX + MAXX) / 2, CY = (MINY + MAXY) / 2
const RBOARD = Math.max(VW, VH) / 2 + SIZE * 0.5

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="21" fill="#5a3a22" stroke="#7a512f" strokeWidth="1.5" />
    <circle cx="24" cy="24" r="14" fill="none" stroke="#3d2715" strokeWidth="1" />
    <circle cx="18" cy="20" r="5" fill="#1b1b1c" stroke="#000" strokeWidth="0.5" />
    <circle cx="30" cy="28" r="5" fill="#efe9da" stroke="#bcb49d" strokeWidth="0.5" />
  </svg>
)

function hexPath(cx: number, cy: number, s: number): string {
  let d = ''
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i)
    const x = cx + s * Math.cos(a), y = cy + s * Math.sin(a)
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2) + ' '
  }
  return d + 'Z'
}

const SEAT: Marble[] = ['b', 'w'] // seat 0 = Black, seat 1 = White

export function Abalone() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(abaloneAdapter)
  const myMarble = SEAT[mySeat]                          // your side
  const oppMarble: Marble = myMarble === 'b' ? 'w' : 'b' // opponent's side
  const [sel, setSel] = useState<Key[]>([])
  const [showRules, setShowRules] = useState(false)

  function newGame() { netNew(); setSel([]); setShowRules(false) }
  function clearSel() { setSel([]) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setShowRules(false); clearSel() } })

  const yourTurn = !s.winner && isMyTurn

  // Which directions are legal for the current selection, and the target cup for each.
  const moveTargets = useMemo(() => {
    const m = new Map<Key, number>()  // target cell key -> dir
    if (!yourTurn || sel.length === 0) return m
    for (let dir = 0; dir < 6; dir++) {
      if (AB.tryMove(s.board, sel, dir, myMarble)) {
        // front cell's destination = nice click target
        const sorted = sel.length === 1 ? sel : sortFront(sel, dir)
        const front = parseKey(sorted[sorted.length - 1])
        const t = { q: front.q + DIRS[dir].q, r: front.r + DIRS[dir].r }
        m.set(key(t.q, t.r), dir)
      }
    }
    return m
  }, [yourTurn, sel, s.board, myMarble])

  function sortFront(cells: Key[], dir: number): Key[] {
    const d = DIRS[dir]
    const proj = (h: Hex) => h.q * d.q + h.r * d.r + (h.q + h.r) * (d.q + d.r)
    return cells.slice().sort((a, b) => proj(parseKey(a)) - proj(parseKey(b)))
  }

  function doMove(dir: number) {
    if (!yourTurn || !AB.tryMove(s.board, sel, dir, myMarble)) return
    dispatch({ cells: sel, dir })
    setSel([])
  }

  function clickCup(k: Key) {
    if (!yourTurn) return
    const v = s.board[k]
    // clicking a legal target cup performs the move
    if (moveTargets.has(k)) { doMove(moveTargets.get(k)!); return }
    if (v === myMarble) {
      // toggle / extend selection
      if (sel.includes(k)) { setSel(sel.filter(c => c !== k)); return }
      const next = sel.concat([k])
      if (next.length > 3) { setSel([k]); return }
      if (next.length === 1 || AB.lineAxis(next) !== -1) setSel(next)
      else setSel([k])  // not in-line with current group -> start fresh
    } else {
      clearSel()
    }
  }

  const selSet = new Set(sel)
  const lastSet = new Set(s.last)

  const oppName = net.online ? 'Opponent' : 'Rival'
  const myWin = s.winner === myMarble
  let banner: string, bk = ''
  if (myWin) { bk = 'win'; banner = 'You win — six rivals off the rim' }
  else if (s.winner) { bk = 'lose'; banner = `${oppName} wins — six of yours gone` }
  else if (yourTurn) { bk = 'you'; banner = sel.length ? `${sel.length} selected — pick a push` : 'Your turn — select marbles' }
  else { bk = 'foe'; banner = net.online ? `${oppName} is thinking…` : 'The rival is thinking…' }

  // arrow buttons: legal dirs for current selection
  const legalDirs = useMemo(() => {
    const set = new Set<number>()
    if (yourTurn) for (let d = 0; d < 6; d++) if (AB.tryMove(s.board, sel, d, myMarble)) set.add(d)
    return set
  }, [yourTurn, sel, s.board, myMarble])

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Abalone · shove &amp; eject"
        title="Abalone"
        subtitle="line up your marbles and sumito the rival off the rim — six off the board wins"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="61 cups"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="ab-wrap">
          <svg className="ab-board" viewBox={`${MINX} ${MINY} ${VW} ${VH}`} role="img">
            <circle cx={CX} cy={CY} r={RBOARD} className="ab-wood" />
            <circle cx={CX} cy={CY} r={RBOARD - 4} className="ab-wood-rim" />
            {PTS.map(p => {
              const v = s.board[p.k]
              const isSel = selSet.has(p.k)
              const isTarget = moveTargets.has(p.k)
              const isLast = lastSet.has(p.k)
              return (
                <g key={p.k} className="ab-cup-g" onClick={() => clickCup(p.k)}>
                  <path d={hexPath(p.x, p.y, SIZE * 0.92)} className={'ab-cup' + (isTarget ? ' target' : '')} />
                  {isTarget && <circle cx={p.x} cy={p.y} r={SIZE * 0.28} className="ab-hint" />}
                  {isLast && !v && <circle cx={p.x} cy={p.y} r={SIZE * 0.55} className="ab-lastmark" />}
                  {v && (
                    <circle cx={p.x} cy={p.y} r={SIZE * 0.72}
                      className={'ab-marble ' + v + (isSel ? ' sel' : '') + (isLast ? ' last' : '')} />
                  )}
                  {v && <circle cx={p.x - SIZE * 0.24} cy={p.y - SIZE * 0.26} r={SIZE * 0.2} className={'ab-gloss ' + v} />}
                </g>
              )
            })}
          </svg>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel scoreboard">
            <div className={'sc ' + myMarble + (s.turn === myMarble && !s.winner ? ' on' : '')}>
              <span className={'sc-marble ' + myMarble} /><span className="sc-name">You · {myMarble === 'b' ? 'Black' : 'White'}</span>
              <span className="sc-n">{s.off[myMarble]}<span className="sc-of">/{AB.WIN_OFF}</span></span>
            </div>
            <div className={'sc ' + oppMarble + (s.turn === oppMarble && !s.winner ? ' on' : '')}>
              <span className={'sc-marble ' + oppMarble} /><span className="sc-name">{oppName} · {oppMarble === 'b' ? 'Black' : 'White'}</span>
              <span className="sc-n">{s.off[oppMarble]}<span className="sc-of">/{AB.WIN_OFF}</span></span>
            </div>
            <div className="sc-cap">marbles pushed off · six loses</div>
          </div>

          <div className="panel ab-controls">
            <div className="ab-pad-l">Push</div>
            <div className="ab-pad">
              {DIRS.map((_, i) => (
                <button key={i} className={'ab-dir d' + i + (legalDirs.has(i) ? '' : ' off')}
                  disabled={!legalDirs.has(i)} onClick={() => doMove(i)} aria-label={DIR_NAMES[i]}>
                  {DIR_NAMES[i]}
                </button>
              ))}
              <button className="ab-clear" onClick={clearSel} disabled={!sel.length}>clear</button>
            </div>
          </div>

          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} myMarble={myMarble} oppMarble={oppMarble} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, myMarble, oppMarble, oppName, onNew }: { s: AbaloneState; myMarble: Marble; oppMarble: Marble; oppName: string; onNew: () => void }) {
  const won = s.winner === myMarble
  return (
    <Modal
      eyebrow={won ? 'Rim master' : 'Shoved off'}
      title={won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {s.off[oppMarble]} off</span><span className="foe">{oppName} {s.off[myMarble]} off</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Abalone" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>Black</b> and move first. Each turn, pick an <b>in-line group</b> of 1, 2 or 3 of your own touching marbles, then push them one hex.</p>
        <p>Push <b>in-line</b> (along the group's axis) into empty space, or <b>broadside</b> (sideways) where every landing cup must be empty.</p>
        <p>A <b>sumito</b> is an in-line push against a <i>shorter</i> enemy line (2-vs-1, 3-vs-1, 3-vs-2). The enemy slides one hex; a marble forced over the rim is <b>ejected</b>. You can't shove an equal/longer line, nor one backed by another marble.</p>
        <p>Drive <b>six</b> of the rival's marbles off the board to win.</p>
        <p><b>Play:</b> click a marble to select, click touching in-line marbles to extend, then click a <kbd>Push</kbd> arrow or a glowing cup. <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
    </Modal>
  )
}
