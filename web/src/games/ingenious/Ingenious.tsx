/* INGENIOUS — hex tile-laying with six colour tracks (UI, built for this codebase).

   An SVG hexagon of pointy-top hex cells. You hold a rack of 6 domino tiles; click a tile to select
   it, click a board cell, then an adjacent cell to lay the two ends. Press R to flip which end goes
   where. Each placement scores into your six colour tracks; your final score is your LOWEST track,
   so spread your colours. The greedy rival pumps its weakest colours. INGENIOUS (a colour reaching
   18) grants an extra turn. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as ING from './logic'
import type { IngState, Color } from './logic'

const { SIDE, NCOLORS, MAXTRACK, COLOR_NAMES, COORDS } = ING

// pixel layout for pointy-top hexes in axial coords
const HEX = 22 // "size" (center to corner)
const W = Math.sqrt(3) * HEX // hex width
const H = 2 * HEX // hex height
function pixel(q: number, r: number): { x: number; y: number } {
  const x = W * (q + r / 2)
  const y = (H * 3) / 4 * r
  return { x, y }
}
// bounds of the whole hexagon
const PTS = COORDS.map((c) => pixel(c.q, c.r))
const MINX = Math.min(...PTS.map((p) => p.x)) - W
const MAXX = Math.max(...PTS.map((p) => p.x)) + W
const MINY = Math.min(...PTS.map((p) => p.y)) - H
const MAXY = Math.max(...PTS.map((p) => p.y)) + H
const VBW = MAXX - MINX
const VBH = MAXY - MINY

function hexCorners(cx: number, cy: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 180) * (60 * i - 90) // pointy-top
    pts.push(`${(cx + HEX * Math.cos(ang)).toFixed(2)},${(cy + HEX * Math.sin(ang)).toFixed(2)}`)
  }
  return pts.join(' ')
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1a1530" stroke="#352a55" strokeWidth="1.5" />
    <polygon points="18,12 26,16.5 26,25.5 18,30 10,25.5 10,16.5" fill="#e0556b" opacity="0.92" />
    <polygon points="30,18 38,22.5 38,31.5 30,36 22,31.5 22,22.5" fill="#4aa3e0" opacity="0.92" />
  </svg>
)

const FILL = ['var(--c-red)', 'var(--c-orange)', 'var(--c-yellow)', 'var(--c-green)', 'var(--c-blue)', 'var(--c-purple)']

interface Sel {
  tileIndex: number
  flip: boolean // which end goes to the first-clicked cell
}

export function Ingenious() {
  const [s, setS] = useState<IngState>(() => ING.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<Sel | null>(null)
  const [firstCell, setFirstCell] = useState<number | null>(null)

  function newGame() {
    setS(ING.makeGame())
    setShowRules(false)
    setSel(null)
    setFirstCell(null)
  }

  // AI may take consecutive (extra) turns; tick on s.moves so each AI action re-arms the timer.
  useAITurn(s.winner == null && s.turn === 1, () => setS((p) => ING.aiTurn(p)), { delayMs: 650, tick: s.moves })

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => {
      setShowRules(false)
      setFirstCell(null)
    },
    extra: (e) => {
      if ((e.key === 'r' || e.key === 'R') && sel) {
        setSel({ ...sel, flip: !sel.flip })
        return true
      }
      return false
    },
  })

  const yourTurn = s.winner == null && s.turn === 0

  function clickTile(i: number) {
    if (!yourTurn) return
    if (sel && sel.tileIndex === i) setSel(null)
    else setSel({ tileIndex: i, flip: false })
    setFirstCell(null)
  }

  function clickCell(i: number) {
    if (!yourTurn || sel == null) return
    if (s.board[i] != null) return
    if (firstCell == null) {
      setFirstCell(i)
      return
    }
    if (i === firstCell) {
      setFirstCell(null)
      return
    }
    // must be adjacent
    if (!ING.neighbors(firstCell).includes(i)) {
      setFirstCell(i) // restart selection at the new cell
      return
    }
    const tile = s.racks[0][sel.tileIndex]
    // flip decides which end lands on firstCell
    const cellForA = sel.flip ? i : firstCell
    const cellForB = sel.flip ? firstCell : i
    void tile
    const ns = ING.placeTile(s, 0, sel.tileIndex, cellForA, cellForB)
    if (ns !== s) {
      setS(ns)
      setSel(null)
      setFirstCell(null)
    }
  }

  const lastSet = new Set(s.last)
  const youLow = ING.lowestTrack(s.tracks[0])
  const foeLow = ING.lowestTrack(s.tracks[1])

  let banner: string
  let bk = ''
  if (s.winner === 0) {
    bk = 'win'
    banner = `You win — your lowest track is ${youLow} vs ${foeLow}`
  } else if (s.winner === 1) {
    bk = 'lose'
    banner = `The rival wins — its lowest track is ${foeLow} vs ${youLow}`
  } else if (yourTurn) {
    bk = 'you'
    banner = sel == null ? 'Your turn — pick a tile from your rack' : firstCell == null ? 'Click a cell for the first end' : 'Click an adjacent cell (R flips)'
  } else {
    bk = 'foe'
    banner = 'The rival is thinking…'
  }

  // preview of where ends would land
  const previewA = sel && firstCell != null ? (sel.flip ? -2 : firstCell) : -1
  const previewB = sel && firstCell != null ? (sel.flip ? firstCell : -2) : -1
  void previewA
  void previewB

  const tilesLeft = s.bag.length

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Ingenious · balance six colours"
        title="Ingenious"
        subtitle="lay domino tiles, score colour lines — your score is your lowest of six tracks"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Bag ${tilesLeft}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>R · flip &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="ig-wrap">
          <svg
            className="ig-board"
            viewBox={`${MINX} ${MINY} ${VBW} ${VBH}`}
            role="img"
            aria-label="Ingenious board"
          >
            {COORDS.map((c, i) => {
              const p = pixel(c.q, c.r)
              const v = s.board[i]
              const isLast = lastSet.has(i)
              const isFirst = firstCell === i
              const adjOk =
                sel != null && firstCell != null && ING.neighbors(firstCell).includes(i) && v == null
              const cls =
                'ig-cell' +
                (v == null ? ' empty' : ' filled') +
                (isLast ? ' last' : '') +
                (isFirst ? ' picked' : '') +
                (adjOk ? ' target' : '') +
                (yourTurn && sel != null && v == null ? ' clickable' : '')
              return (
                <g key={i} className={cls} onClick={() => clickCell(i)}>
                  <polygon className="ig-hex" points={hexCorners(p.x, p.y)} />
                  {v != null && (
                    <circle className="ig-sym" cx={p.x} cy={p.y} r={HEX * 0.52} fill={FILL[v]} />
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        <div className="ig-side">
          <div className="ig-panel">
            <div className="ig-ptitle">Score tracks</div>
            <TrackBlock label="You" cls="you" tracks={s.tracks[0]} active={yourTurn} low={youLow} />
            <TrackBlock label="Rival" cls="foe" tracks={s.tracks[1]} active={s.turn === 1 && s.winner == null} low={foeLow} />
          </div>

          <div className="ig-panel ig-rack">
            <div className="ig-ptitle">Your rack</div>
            <div className="ig-tiles">
              {s.racks[0].map((t, i) => (
                <button
                  key={i}
                  className={'ig-tile' + (sel?.tileIndex === i ? ' on' : '')}
                  onClick={() => clickTile(i)}
                  disabled={!yourTurn}
                  aria-label={`Tile ${COLOR_NAMES[t.a]} + ${COLOR_NAMES[t.b]}`}
                >
                  <span className="ig-end" style={{ background: FILL[sel?.tileIndex === i && sel.flip ? t.b : t.a] }} />
                  <span className="ig-end" style={{ background: FILL[sel?.tileIndex === i && sel.flip ? t.a : t.b] }} />
                </button>
              ))}
              {s.racks[0].length === 0 && <div className="ig-empty-rack">— empty —</div>}
            </div>
          </div>

          <div className="ig-panel ig-logbox">
            {s.log.slice().reverse().map((l, i) => (
              <div key={i} className={'ig-log ' + l.t}>{l.x}</div>
            ))}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} youLow={youLow} foeLow={foeLow} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function TrackBlock({
  label,
  cls,
  tracks,
  active,
  low,
}: {
  label: string
  cls: string
  tracks: number[]
  active: boolean
  low: number
}) {
  return (
    <div className={'ig-tracks ' + cls + (active ? ' active' : '')}>
      <div className="ig-tlabel">
        <b>{label}</b>
        <span className="ig-low">low {low}</span>
      </div>
      {Array.from({ length: NCOLORS }, (_, c) => {
        const v = tracks[c as Color]
        const isLow = v === low
        return (
          <div key={c} className={'ig-track' + (isLow ? ' lowest' : '')}>
            <span className="ig-dot" style={{ background: FILL[c] }} />
            <span className="ig-bar">
              <span className="ig-fill" style={{ width: `${(v / MAXTRACK) * 100}%`, background: FILL[c] }} />
            </span>
            <span className="ig-val">{v}</span>
          </div>
        )
      })}
    </div>
  )
}

function ResultModal({ s, youLow, foeLow, onNew }: { s: IngState; youLow: number; foeLow: number; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? 'Colours balanced' : 'Out-balanced'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="ig-final">
        <div className={'ig-fcol ' + (won ? 'you' : '')}>
          <span className="ig-fname">You</span>
          <span className="ig-fscore">{youLow}</span>
          <span className="ig-fsub">lowest track</span>
        </div>
        <div className="ig-fvs">vs</div>
        <div className={'ig-fcol ' + (!won ? 'foe' : '')}>
          <span className="ig-fname">Rival</span>
          <span className="ig-fscore">{foeLow}</span>
          <span className="ig-fsub">lowest track</span>
        </div>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      eyebrow="How to play"
      title="Ingenious"
      onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}
    >
      <div className="modal-body">
        <p>
          Place domino-shaped tiles — two adjacent hexes, each with a coloured symbol — onto the hex board. Pick a tile from your <b>rack</b>, click a cell for its first end, then an <b>adjacent</b> cell for the second. Press <kbd>R</kbd> to flip which end goes where.
        </p>
        <p>
          Each end <b>scores</b> its colour by counting consecutive same-colour symbols outward in the five directions that don't point at its partner, adding to your matching <b>colour track</b> (0–18).
        </p>
        <p>
          Complete a colour to <b>18</b> — that's <i>INGENIOUS</i> — and you take an extra turn at once.
        </p>
        <p>
          Your final score is your <b>lowest</b> colour track, so balance all six. Higher lowest-track wins; ties break on the next-lowest.
        </p>
        <p><b>Keys:</b> <kbd>R</kbd> flip · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel.</p>
        <p className="ig-rsmall">A hexagon of side {SIDE}; {COLOR_NAMES.join(' · ')}.</p>
      </div>
    </Modal>
  )
}
