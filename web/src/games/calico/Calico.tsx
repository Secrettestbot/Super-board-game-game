/* CALICO — UI (built for this codebase). A cozy quilt-building duel on the framework shell.
   You fill your own 5×5 hex quilt; the AI fills its own. Place a patch from your 2-tile hand
   onto an empty hex, then the hand refills from the shared market. Group colors for buttons
   and surround the design goals correctly. Highest score when both quilts are full wins.

   The AI places one patch per turn (its board fills over many turns), so its driver re-arms
   on s.step (the useAITurn tick), not just the turn flip. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as C from './logic'
import type { CalicoState, Player, Patch, Board } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#3a2e22" stroke="#61503c" strokeWidth="1.5" />
    <rect x="9" y="9" width="13" height="13" rx="3" fill="#d96a7e" />
    <rect x="26" y="9" width="13" height="13" rx="3" fill="#e8a14b" />
    <rect x="9" y="26" width="13" height="13" rx="3" fill="#4fa6a6" />
    <rect x="26" y="26" width="13" height="13" rx="3" fill="#6f7fc4" />
    <circle cx="24" cy="24" r="4.2" fill="#f6c279" stroke="#b9761f" strokeWidth="1.4" />
  </svg>
)

/** Pattern glyphs, indexed 0..5 to match C.PATTERNS. */
const GLYPHS = ['●', '▦', '❧', '★', '✚', '❉']

/** Pixel position of an axial hex for absolute layout (pointy-top). Uses CSS vars hw/hh. */
function hexPos(q: number, r: number, hw: number, hh: number) {
  return { left: hw * q + hw * 0.5 * r, top: hh * 0.75 * r }
}

const HW = 78, HH = HW * 1.1547 // matches max --hw; board scales via CSS, layout via these px
// We position with a self-consistent unit then let the container shrink — using fixed px
// here keeps the React math simple; CSS clamps the actual hex size to fit smaller screens
// by scaling the whole grid with transform.

function patchClass(p: Patch | null): string {
  return p == null ? '' : ' c' + p.color + ' patch'
}

export function Calico() {
  const [s, setS] = useState<CalicoState>(() => C.makeGame())
  const [sel, setSel] = useState<number>(0) // selected hand index
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(C.makeGame()); setSel(0); setShowRules(false) }

  // The AI places one patch per turn over many turns — re-arm on s.step.
  useAITurn(s.winner == null && s.turn === 1, () => setS(p => C.aiTurn(p)), { delayMs: 480, tick: s.step })

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (s.winner != null || s.turn !== 0) return false
      if (e.key === '1') { setSel(0); return true }
      if (e.key === '2') { setSel(1); return true }
      return false
    },
  })

  const yourTurn = s.winner == null && s.turn === 0
  const sc0 = C.scoreBoard(s.boards[0])
  const sc1 = C.scoreBoard(s.boards[1])
  const goals0 = C.goalResults(s.boards[0])

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = `You win — ${s.scores[0]} to ${s.scores[1]}!` }
  else if (s.winner === 1) { bk = 'lose'; banner = `Rival wins — ${s.scores[1]} to ${s.scores[0]}` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — pick a hand tile, then place it on an empty hex' }
  else { bk = 'foe'; banner = 'The rival is stitching their quilt…' }

  function place(hex: { q: number; r: number }) {
    if (!yourTurn) return
    if (s.hands[0][sel] == null) return
    const next = C.placeTile(s, 0, sel, hex)
    setS(next)
    // keep selection valid (hand may have shifted); default back to 0
    setSel(0)
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Calico · patchwork quilts"
        title="Calico"
        subtitle="stitch a cozy quilt — cluster colors into buttons and ring the design goals just right before your quilt fills"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>You {sc0.total} · Rival {sc1.total}</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click hex · place &nbsp; 1/2 · pick &nbsp; N · new</>}
      >
        <div className="cal-wrap">
          <div className="cal-board">
            <Quilt board={s.boards[0]} interactive={yourTurn} onPlace={place} previewColor={yourTurn ? s.hands[0][sel]?.color ?? null : null} />
          </div>
        </div>

        <div className="side">
          <div className="panel cal-score">
            <div className={'cal-srow' + (yourTurn ? ' on' : '')}>
              <span className="cal-swatch you" />
              <span className="cal-who">You</span>
              <span className="cal-total">{sc0.total}</span>
            </div>
            <div className="cal-break">buttons {sc0.buttons} · goals {sc0.goals}</div>
            <div className={'cal-srow' + (s.turn === 1 && s.winner == null ? ' on' : '')}>
              <span className="cal-swatch foe" />
              <span className="cal-who">Rival</span>
              <span className="cal-total">{sc1.total}</span>
            </div>
            <div className="cal-break">buttons {sc1.buttons} · goals {sc1.goals}</div>
          </div>

          <div className="panel cal-hand-wrap">
            <div className="cal-pl">your hand — click a tile to select</div>
            <div className="cal-tiles">
              {s.hands[0].map((t, i) => (
                <div key={i}
                  className={'cal-tile c' + t.color + (sel === i ? ' sel' : '')}
                  onClick={() => yourTurn && setSel(i)}>
                  <span className="cal-glyph">{GLYPHS[t.pattern]}</span>
                </div>
              ))}
              {s.hands[0].length === 0 && <div className="cal-hint">no tiles</div>}
            </div>
            <div className="cal-pl">market (refills your hand)</div>
            <div className="cal-tiles">
              {s.market.map((t, i) => (
                <div key={i} className={'cal-tile market c' + t.color}>
                  <span className="cal-glyph">{GLYPHS[t.pattern]}</span>
                </div>
              ))}
            </div>
            <div className="cal-hint">
              {yourTurn ? 'select a tile, then click an empty hex on your quilt' : 'watching the rival stitch…'}
            </div>
          </div>

          <div className="panel cal-goals">
            <div className="cal-glabel">design goals (your quilt)</div>
            {goals0.map((g, i) => (
              <div key={i} className={'cal-goal-row' + (g.satisfied ? ' met' : '')}>
                <span className="pts">{g.def.points}</span>
                <span>{g.def.label}{g.satisfied ? ' ✓' : ''}</span>
              </div>
            ))}
          </div>

          <div className="panel cal-mini">
            <div className="cal-glabel">rival's quilt</div>
            <MiniQuilt board={s.boards[1]} />
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal winner={s.winner} you={s.scores[0]} foe={s.scores[1]} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

/** The full interactive quilt for a board. */
function Quilt({ board, interactive, onPlace, previewColor }: {
  board: Board; interactive: boolean; onPlace: (h: { q: number; r: number }) => void; previewColor: number | null
}) {
  const goals = C.goalResults(board)
  const goalMet = new Map(goals.map(g => [C.hexKey(g.hex.q, g.hex.r), g.satisfied]))
  // grid container size
  const maxX = HW * (C.SIZE - 1) + HW * 0.5 * (C.SIZE - 1) + HW
  const maxY = HH * 0.75 * (C.SIZE - 1) + HH
  return (
    <div className="cal-grid" style={{ width: maxX, height: maxY }}>
      {C.allHexKeys().map(k => {
        const { q, r } = C.parseHex(k)
        const cell = board[k]
        const pos = hexPos(q, r, HW, HH)
        if (cell.goal != null) {
          const def = C.GOAL_DEFS[cell.goal]
          const met = goalMet.get(k) === true
          return (
            <div key={k} className={'cal-hex goal cal-goal' + (met ? ' met' : '')}
              style={{ left: pos.left, top: pos.top }} title={def.label}>
              <span className="cal-goal-pts">{def.points}</span>
            </div>
          )
        }
        const filled = cell.patch != null
        const placeable = interactive && !cell.fixed && !filled
        return (
          <div key={k}
            className={'cal-hex' + patchClass(cell.patch) + (cell.fixed ? ' fixed' : '') + (placeable ? ' placeable' : '')}
            style={{ left: pos.left, top: pos.top }}
            onClick={placeable ? () => onPlace({ q, r }) : undefined}
            title={filled ? `${C.COLORS[cell.patch!.color]} / ${C.PATTERNS[cell.patch!.pattern]}` : 'empty'}>
            {filled && <span className="cal-glyph">{GLYPHS[cell.patch!.pattern]}</span>}
            {placeable && previewColor != null && <span className="cal-glyph" style={{ opacity: 0.25 }}>{'·'}</span>}
          </div>
        )
      })}
    </div>
  )
}

/** Compact read-only quilt for the opponent summary. */
function MiniQuilt({ board }: { board: Board }) {
  const mw = 16, mh = 18.5
  const maxX = mw * (C.SIZE - 1) + mw * 0.5 * (C.SIZE - 1) + mw
  const maxY = mh * 0.75 * (C.SIZE - 1) + mh
  return (
    <div className="cal-mini-grid" style={{ width: maxX, height: maxY }}>
      {C.allHexKeys().map(k => {
        const { q, r } = C.parseHex(k)
        const cell = board[k]
        const left = mw * q + mw * 0.5 * r
        const top = mh * 0.75 * r
        const cls = cell.goal != null ? ' goal' : cell.patch != null ? ' c' + cell.patch.color : ''
        return <div key={k} className={'cal-mini-hex' + cls} style={{ left, top }} />
      })}
    </div>
  )
}

function ResultModal({ winner, you, foe, onNew }: { winner: Player; you: number; foe: number; onNew: () => void }) {
  const won = winner === 0
  return (
    <Modal
      eyebrow={won ? 'Beautifully stitched' : 'A tidy rival quilt'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You {you}</span>
        <span className="foe">Rival {foe}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Calico" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Start stitching</button>}>
      <div className="modal-body">
        <p>Fill your own <b>hex quilt</b> with colored, patterned patches. Some edge hexes come <b>pre-printed</b> (ringed) and three interior hexes are <b>design goals</b> (striped) that you build around.</p>
        <p>On your turn, <b>select</b> one of your two hand tiles and <b>click an empty hex</b> to place it. Your hand then refills from the shared <b>market</b> of three.</p>
        <p><b>Color buttons:</b> every connected group of <b>3 or more same-color</b> patches earns a button worth <b>3 points</b>.</p>
        <p><b>Design goals:</b> each goal hex scores its value when all <b>6 surrounding</b> hexes are filled in the required arrangement — <i>6 unique colors</i> (10), <i>two triples 3+3</i> (7), or <i>three pairs 2+2+2</i> (8).</p>
        <p>When both quilts are full, the <b>highest total wins</b>.</p>
        <p><b>Keys:</b> <kbd>1</kbd>/<kbd>2</kbd> pick tile · click to place · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
