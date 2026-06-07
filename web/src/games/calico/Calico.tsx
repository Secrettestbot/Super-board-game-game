/* CALICO — UI (built for this codebase). A cozy quilt-building duel on the framework shell.
   You fill your own 5×5 hex quilt; your rival fills theirs. Place a patch from your 2-tile
   hand onto an empty hex, then the hand refills from the shared market. Group colors for
   buttons and surround the design goals correctly. Highest score when both quilts are full.

   Online-capable via useGameSession(calicoAdapter): the hook drives the AI for any empty
   seat (no local useAITurn) and, when online, redacts the opponent's private hand so it
   never reaches you. Everything below is rendered relative to mySeat — your quilt, hand,
   score and the result banner are always "yours", and the other seat is the rival. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { calicoAdapter } from './net'
import * as C from './logic'
import type { Patch, Board } from './logic'

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
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(calicoAdapter)
  const oppSeat = 1 - mySeat // 2-player game: the other quilt
  const [sel, setSel] = useState<number>(0) // selected hand index (into YOUR hand)
  const [showRules, setShowRules] = useState(false)

  function newGame() { netNew(); setSel(0); setShowRules(false) }

  const yourTurn = s.winner == null && isMyTurn
  const myHand = s.hands[mySeat] ?? []
  const myBoard = s.boards[mySeat]
  const oppBoard = s.boards[oppSeat]
  const scMine = C.scoreBoard(myBoard)
  const scOpp = C.scoreBoard(oppBoard)
  const goalsMine = C.goalResults(myBoard)
  const oppLabel = net.online ? 'Opponent' : 'Rival'

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === '1') { setSel(0); return true }
      if (e.key === '2') { setSel(1); return true }
      return false
    },
  })

  let banner: string, bk = ''
  if (s.winner === mySeat) { bk = 'win'; banner = `You win — ${scMine.total} to ${scOpp.total}!` }
  else if (s.winner === oppSeat) { bk = 'lose'; banner = `${oppLabel} wins — ${scOpp.total} to ${scMine.total}` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — pick a hand tile, then place it on an empty hex' }
  else { bk = 'foe'; banner = net.online ? 'Waiting for the opponent…' : 'The rival is stitching their quilt…' }

  function place(hex: { q: number; r: number }) {
    if (!yourTurn) return
    if (myHand[sel] == null) return
    dispatch({ handIndex: sel, hex })
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
        modeLeft={<>You {scMine.total} · {oppLabel} {scOpp.total}</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click hex · place &nbsp; 1/2 · pick &nbsp; N · new</>}
      >
        <div className="cal-wrap">
          <div className="cal-board">
            <Quilt board={myBoard} interactive={yourTurn} onPlace={place} previewColor={yourTurn ? myHand[sel]?.color ?? null : null} />
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>

          <div className="panel cal-score">
            <div className={'cal-srow' + (yourTurn ? ' on' : '')}>
              <span className="cal-swatch you" />
              <span className="cal-who">You</span>
              <span className="cal-total">{scMine.total}</span>
            </div>
            <div className="cal-break">buttons {scMine.buttons} · goals {scMine.goals}</div>
            <div className={'cal-srow' + (s.winner == null && !isMyTurn ? ' on' : '')}>
              <span className="cal-swatch foe" />
              <span className="cal-who">{oppLabel}</span>
              <span className="cal-total">{scOpp.total}</span>
            </div>
            <div className="cal-break">buttons {scOpp.buttons} · goals {scOpp.goals}</div>
          </div>

          <div className="panel cal-hand-wrap">
            <div className="cal-pl">your hand — click a tile to select</div>
            <div className="cal-tiles">
              {myHand.map((t, i) => (
                <div key={i}
                  className={'cal-tile c' + t.color + (sel === i ? ' sel' : '')}
                  onClick={() => yourTurn && setSel(i)}>
                  <span className="cal-glyph">{GLYPHS[t.pattern]}</span>
                </div>
              ))}
              {myHand.length === 0 && <div className="cal-hint">no tiles</div>}
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
              {yourTurn ? 'select a tile, then click an empty hex on your quilt' : `watching ${oppLabel.toLowerCase()} stitch…`}
            </div>
          </div>

          <div className="panel cal-goals">
            <div className="cal-glabel">design goals (your quilt)</div>
            {goalsMine.map((g, i) => (
              <div key={i} className={'cal-goal-row' + (g.satisfied ? ' met' : '')}>
                <span className="pts">{g.def.points}</span>
                <span>{g.def.label}{g.satisfied ? ' ✓' : ''}</span>
              </div>
            ))}
          </div>

          <div className="panel cal-mini">
            <div className="cal-glabel">{oppLabel.toLowerCase()}'s quilt</div>
            <MiniQuilt board={oppBoard} />
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={s.winner === mySeat} you={scMine.total} foe={scOpp.total} oppLabel={oppLabel} onNew={newGame} />}
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

function ResultModal({ won, you, foe, oppLabel, onNew }: { won: boolean; you: number; foe: number; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Beautifully stitched' : `A tidy ${oppLabel.toLowerCase()} quilt`}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You {you}</span>
        <span className="foe">{oppLabel} {foe}</span>
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
