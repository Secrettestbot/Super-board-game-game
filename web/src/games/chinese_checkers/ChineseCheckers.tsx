/* CHINESE CHECKERS — UI (built for this codebase).
   The classic six-pointed star of holes on the framework shell. You are the teal pegs in
   the SOUTH home racing to the NORTH point; the AI drives the coral pegs the other way.
   Click one of your pegs to see its legal destinations (single steps + full jump chains),
   then click a glowing hole to move there. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { chineseCheckersAdapter } from './net'
import * as CC from './logic'
import type { Move, Player } from './logic'

// ---- pixel layout: project cube coords -> SVG x/y ----
// axial: px = x + z/2 in "column" units, row = z (using y up). We use the standard
// flat-row hex mapping: screenX = (h.x - h.z) ; screenY = -h.y * 1.5 (y grows upward).
const SP = 30          // spacing unit (px) between adjacent column slots
const ROW = 26         // vertical spacing per cube-y row
function project(h: CC.Hole): { px: number; py: number } {
  const px = (h.x - h.z) * (SP / 2)
  const py = -h.y * ROW * (1.5 / 1.5) // h.y up; scale so rows read nicely
  return { px, py: py * 1.0 }
}

const PTS = CC.HOLES.map(project)
const minX = Math.min(...PTS.map(p => p.px))
const maxX = Math.max(...PTS.map(p => p.px))
const minY = Math.min(...PTS.map(p => p.py))
const maxY = Math.max(...PTS.map(p => p.py))
const PAD = 26
const VBW = maxX - minX + PAD * 2
const VBH = maxY - minY + PAD * 2
const COORD = CC.HOLES.map((_, i) => ({ cx: PTS[i].px - minX + PAD, cy: PTS[i].py - minY + PAD }))

const SOUTH = new Set(CC.SOUTH_IDS)
const NORTH = new Set(CC.NORTH_IDS)

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#10221f" stroke="#2f5e57" strokeWidth="1.5" />
    <path d="M24 7 L29 19 L42 19 L31.5 27 L36 39 L24 31 L12 39 L16.5 27 L6 19 L19 19 Z"
      fill="none" stroke="#3fd6bf" strokeWidth="1.4" strokeLinejoin="round" />
    <circle cx="24" cy="13" r="2" fill="#3fd6bf" />
    <circle cx="24" cy="35" r="2" fill="#f0805f" />
  </svg>
)

export function ChineseCheckers() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(chineseCheckersAdapter)
  const me = mySeat as Player          // seat 0 = South/teal, seat 1 = North/coral
  const foe = (me === 0 ? 1 : 0) as Player
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setSel(null) },
  })

  const yourTurn = s.winner == null && isMyTurn

  // moves available for the selected peg -> map of destination id -> full path
  const destPaths = useMemo(() => {
    const m = new Map<number, Move>()
    if (sel != null && yourTurn && s.board[sel] === me) {
      for (const path of CC.movesForPeg(s, sel)) m.set(path[path.length - 1], path)
    }
    return m
  }, [sel, yourTurn, s, me])

  const lastSet = useMemo(() => new Set(s.last ?? []), [s.last])
  const youHaveMove = yourTurn && CC.legalMoves(s, me).length > 0

  function clickHole(id: number) {
    if (!yourTurn) return
    if (s.board[id] === me) { setSel(prev => (prev === id ? null : id)); return }
    if (sel != null && destPaths.has(id)) {
      dispatch({ path: destPaths.get(id)! })
      setSel(null)
    }
  }

  // progress readout: pegs already home in each player's target (relative to mySeat)
  const youHome = CC.TARGET[me].filter(id => s.board[id] === me).length
  const foeHome = CC.TARGET[foe].filter(id => s.board[id] === foe).length

  const foeLabel = net.online ? 'Opponent' : 'Rival'

  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = 'You Win — the star is yours' }
  else if (s.winner === foe) { bk = 'lose'; banner = `${foeLabel} Wins — they filled the point first` }
  else if (yourTurn) {
    bk = 'you'
    banner = sel != null
      ? (destPaths.size ? 'Click a glowing hole to move there' : 'That peg has no move — pick another')
      : 'Your turn — click one of your pegs'
  } else { bk = 'foe'; banner = `${foeLabel} is plotting a jump chain…` }

  const hint = youHaveMove
    ? 'Build a ladder of your own pegs across the board — long jump chains leap the whole field in one move.'
    : (yourTurn ? 'No moves available.' : 'Watch the rival pegs hop the gaps.')

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Chinese Checkers · the star"
        title="Chinese Checkers"
        subtitle="race all ten pegs across the hexagram into the opposite point"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>You {youHome}/10 &nbsp;·&nbsp; {foeLabel} {foeHome}/10</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="cc-wrap">
          <svg className="cc-board" viewBox={`0 0 ${VBW} ${VBH}`} role="img" aria-label="Chinese Checkers star board">
            {/* faint guide lines between adjacent holes */}
            <g className="cc-grid">
              {CC.HOLES.map(h => {
                const a = COORD[h.id]
                return CC.stepNeighbours(h.id).map(n => {
                  if (n <= h.id) return null
                  const b = COORD[n]
                  return <line key={`${h.id}-${n}`} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} />
                })
              })}
            </g>

            {CC.HOLES.map(h => {
              const c = COORD[h.id]
              const occ = s.board[h.id]
              const isDest = destPaths.has(h.id)
              const isSel = sel === h.id
              const inLast = lastSet.has(h.id)
              const homeCls = SOUTH.has(h.id) ? ' south-home' : NORTH.has(h.id) ? ' north-home' : ''
              return (
                <g key={h.id} className={'cc-hole' + (isDest ? ' dest' : '') + (yourTurn && occ === 0 ? ' grab' : '')}
                  onClick={() => clickHole(h.id)} transform={`translate(${c.cx} ${c.cy})`}>
                  <circle className={'cc-slot' + homeCls} r={SP * 0.30} />
                  {inLast && <circle className="cc-last" r={SP * 0.42} />}
                  {occ != null && (
                    <circle className={'cc-peg ' + (occ === me ? 'you' : 'foe') + (isSel ? ' sel' : '')}
                      r={SP * 0.34} />
                  )}
                  {isDest && <circle className="cc-dot" r={SP * 0.16} />}
                </g>
              )
            })}
          </svg>
        </div>

        <div className="side">
          <div className="panel"><OnlineBar net={net} /></div>
          <div className="panel turnbox">
            <div className={'tn you' + (yourTurn ? ' on' : '')}>
              <span className="tn-chip you" />
              <span className="tn-name">You · {me === 0 ? 'Teal' : 'Coral'}</span>
              <span className="tn-tag">{youHome}/10 home</span>
            </div>
            <div className={'tn foe' + (!yourTurn && s.winner == null ? ' on' : '')}>
              <span className="tn-chip foe" />
              <span className="tn-name">{foeLabel} · {foe === 0 ? 'Teal' : 'Coral'}</span>
              <span className="tn-tag">{foeHome}/10 home</span>
            </div>
          </div>
          <div className="panel hintbox"><span className="hint-l">Hint</span>{hint}</div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={s.winner === me} foeLabel={foeLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, foeLabel, onNew }: { won: boolean; foeLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Point filled' : 'Outraced'}
      title={won ? 'You Win' : `${foeLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className={won ? 'you' : 'foe'}>
          {won ? 'All ten pegs reached the far point' : `The ${foeLabel.toLowerCase()} filled the point first`}
        </span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Chinese Checkers" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>The board is a six-pointed <b>star</b> of holes. You own the ten <b>teal</b> pegs in the bottom point; your goal is to move <i>all ten</i> across the star into the <b>opposite (top) point</b>. The rival's coral pegs race the other way.</p>
        <p>On your turn move <b>one peg</b>, in one of two ways:</p>
        <p>• A single <b>step</b> to an adjacent empty hole (six directions), <i>or</i><br />• A <b>jump</b>: hop over a single adjacent peg of <i>any</i> colour into the empty hole directly beyond. You may <b>chain</b> several jumps in one move, turning between hops.</p>
        <p>You can't mix a step and a jump in the same move. The first player whose pegs completely <b>fill the opposite point</b> wins.</p>
        <p>Click a peg to select it, then click a glowing hole to move. <b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
