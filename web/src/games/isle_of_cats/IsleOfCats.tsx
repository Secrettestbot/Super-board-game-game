/* THE ISLE OF CATS — UI. Each player fills their OWN 6x6 boat (baskets + printed color rooms)
   with polyomino CAT tiles drafted from a shared 4-tile market. You are player 0; the AI is
   player 1. Drafting is free: pick a cat, rotate/flip, then click your boat to place it.
   The AI drafts+places greedily on its own turn; the driver re-arms on a tick that changes on
   every AI action (market length + boat fill + log length). */

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as G from './logic'
import type { State, CatTile, Boat, ScoreBreakdown } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#0d1d24" stroke="#2f5560" strokeWidth="1.5" />
    {/* boat hull */}
    <path d="M9 30 L39 30 L34 39 L14 39 Z" fill="#5a4632" stroke="#7a6042" strokeWidth="1" />
    {/* cat */}
    <circle cx="24" cy="20" r="7" fill="#e8915a" />
    <path d="M18 16 L20 11 L22 15 Z M30 16 L28 11 L26 15 Z" fill="#e8915a" />
    <circle cx="21.5" cy="20" r="1" fill="#241803" />
    <circle cx="26.5" cy="20" r="1" fill="#241803" />
  </svg>
)

const CAT_VARS = ['--cat-orange', '--cat-teal', '--cat-gold', '--cat-plum', '--cat-blue', '--cat-sage']
function catVar(color: number): string { return `var(${CAT_VARS[color % CAT_VARS.length]})` }
const COLOR_NAMES = ['Orange', 'Teal', 'Gold', 'Plum', 'Blue', 'Sage']

/** Render a small preview of a cat shape (oriented). */
function ShapeMini({ shape, color, cell = 13 }: { shape: G.Shape; color: number; cell?: number }) {
  const maxR = Math.max(...shape.map(c => c[0]))
  const maxC = Math.max(...shape.map(c => c[1]))
  const filled = new Set(shape.map(([r, c]) => r * 100 + c))
  const rows = []
  for (let r = 0; r <= maxR; r++) {
    const cols = []
    for (let c = 0; c <= maxC; c++) {
      const on = filled.has(r * 100 + c)
      cols.push(
        <span key={c} className={'ic-mini' + (on ? ' on' : '')}
          style={{ width: cell, height: cell, background: on ? catVar(color) : 'transparent' }} />,
      )
    }
    rows.push(<div key={r} className="ic-mini-row">{cols}</div>)
  }
  return <div className="ic-mini-grid">{rows}</div>
}

export function IsleOfCats() {
  const [s, setS] = useState<State>(() => G.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [selTile, setSelTile] = useState<number | null>(null)
  const [orient, setOrient] = useState(0)
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null)

  function newGame() {
    setS(G.makeGame())
    setShowRules(false); setSelTile(null); setOrient(0); setHover(null)
  }

  const yourTurn = s.winner === null && s.turn === 0
  const aiActive = s.winner === null && s.turn === 1
  // tick changes on EVERY AI action so consecutive AI turns re-arm the driver
  const aiTick = `${s.market.length}-${s.boats[1].filter(c => c.cat !== -1).length}-${s.log.length}-${s.turn}`
  useAITurn(aiActive, () => setS(prev => G.aiTurn(prev)), { delayMs: 520, tick: aiTick })

  const selectedTile: CatTile | null = selTile !== null ? (s.market.find(t => t.id === selTile) ?? null) : null
  const selOrients = useMemo(() => selectedTile ? G.orientations(selectedTile.shape) : [], [selectedTile])
  const selShape = selectedTile ? selOrients[orient % Math.max(1, selOrients.length)] : null

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (selTile !== null) { setSelTile(null); setHover(null) } else setShowRules(false) },
    extra: (e) => {
      if (!yourTurn) return false
      if ((e.key === 'r' || e.key === 'R') && selectedTile) {
        setOrient(o => (o + 1) % selOrients.length); return true
      }
      if ((e.key === 'f' || e.key === 'F') && selectedTile) {
        // flipping just advances through orientations (they already include flips)
        setOrient(o => (o + Math.max(1, Math.floor(selOrients.length / 2))) % selOrients.length); return true
      }
      return false
    },
  })

  // preview cells for the hovered anchor (only when a valid placement)
  const previewCells = useMemo(() => {
    if (!yourTurn || !selectedTile || !selShape || !hover) return null
    if (G.canPlace(s.boats[0], selShape, hover.r, hover.c)) {
      return new Set(G.cellsFor(selShape, hover.r, hover.c) ?? [])
    }
    return null
  }, [yourTurn, selectedTile, selShape, hover, s])

  function selectTile(t: CatTile) {
    if (!yourTurn) return
    if (!G.fitsSomewhere(s.boats[0], t.shape)) return
    setSelTile(t.id); setOrient(0); setHover(null)
  }

  function clickBoatCell(r: number, c: number) {
    if (!yourTurn || !selectedTile || !selShape) return
    if (!G.canPlace(s.boats[0], selShape, r, c)) return
    const cells = G.cellsFor(selShape, r, c)
    if (cells === null) return
    const id = selectedTile.id
    setSelTile(null); setHover(null)
    setS(prev => G.placeCat(prev, 0, id, cells))
  }

  // banner
  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = `You win — ${s.scores?.[0]} to ${s.scores?.[1]}!` }
  else if (s.winner === 1) { bk = 'lose'; banner = `The AI wins — ${s.scores?.[1]} to ${s.scores?.[0]}.` }
  else if (s.winner === -1) { bk = ''; banner = `A draw — ${s.scores?.[0]} apiece.` }
  else if (yourTurn) {
    bk = 'you'
    banner = selectedTile ? 'Rotate (R) then click your boat to place the cat' : 'Your turn — draft a cat from the market'
  } else { bk = 'foe'; banner = 'The AI is loading its boat…' }

  const youSc = useMemo(() => G.scoreBoat(s.boats[0]), [s.boats])
  const aiSc = useMemo(() => G.scoreBoat(s.boats[1]), [s.boats])

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="The Isle of Cats · cat drafting"
        title="The Isle of Cats"
        subtitle="draft polyomino cats into your 6×6 boat — biggest color families & matched rooms win, but every empty square costs you"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`You ${youSc.total} · AI ${aiSc.total}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>R · rotate &nbsp; F · flip &nbsp; N · new</>}
      >
        <div className="ic-wrap">
          <div className="ic-main">
            {/* YOUR BOAT */}
            <div className={'ic-boatbox' + (yourTurn ? ' active' : '')}>
              <div className="ic-bhead">
                <span className="ic-pawn you" /> Your Boat
                <span className="ic-stat score">{youSc.total} pts</span>
                <span className="ic-stat">{youSc.holes} holes</span>
              </div>
              <BoatGrid
                boat={s.boats[0]}
                preview={previewCells}
                previewColor={selectedTile?.color ?? 0}
                interactive={yourTurn && selectedTile !== null}
                onHover={(r, c) => setHover({ r, c })}
                onLeave={() => setHover(null)}
                onClick={clickBoatCell}
              />
              <ScorePanel sc={youSc} />
            </div>

            {/* MARKET */}
            <div className="ic-market">
              <div className="ic-mhead">Cat Market — draft one</div>
              <div className="ic-tiles">
                {s.market.map((t) => {
                  const fits = yourTurn && G.fitsSomewhere(s.boats[0], t.shape)
                  const sel = selTile === t.id
                  return (
                    <div key={t.id}
                      className={'ic-tile' + (fits ? ' draftable' : '') + (sel ? ' sel' : '') + (!fits && yourTurn ? ' dim' : '')}
                      onClick={() => selectTile(t)}>
                      <div className="ic-tile-name">{COLOR_NAMES[t.color]}</div>
                      <ShapeMini shape={t.shape} color={t.color} />
                    </div>
                  )
                })}
                {s.market.length === 0 && <div className="ic-hint">market empty</div>}
              </div>

              {yourTurn && selectedTile && (
                <div className="ic-actions">
                  <div className="ic-orient">
                    <span className="ic-olabel">facing</span>
                    {selShape && <ShapeMini shape={selShape} color={selectedTile.color} cell={11} />}
                  </div>
                  <button className="ic-btn" onClick={() => setOrient(o => (o + 1) % selOrients.length)}>Rotate (R)</button>
                  <button className="ic-btn ghost" onClick={() => { setSelTile(null); setHover(null) }}>Cancel</button>
                </div>
              )}
              {yourTurn && !selectedTile && <div className="ic-hint">click a cat above to start placing</div>}
              {!yourTurn && s.winner === null && <div className="ic-hint">watching the AI…</div>}

              <div className="panel ic-log">
                {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
              </div>
            </div>

            {/* AI BOAT */}
            <div className={'ic-boatbox' + (aiActive ? ' active' : '')}>
              <div className="ic-bhead">
                <span className="ic-pawn ai" /> AI Boat
                <span className="ic-stat score">{aiSc.total} pts</span>
                <span className="ic-stat">{aiSc.holes} holes</span>
              </div>
              <BoatGrid boat={s.boats[1]} preview={null} previewColor={0} interactive={false} />
              <ScorePanel sc={aiSc} />
            </div>
          </div>
        </div>
      </GameShell>

      {s.winner !== null && <ResultModal winner={s.winner} scores={s.scores} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function BoatGrid({
  boat, preview, previewColor, interactive, onHover, onLeave, onClick,
}: {
  boat: Boat
  preview: Set<number> | null
  previewColor: number
  interactive: boolean
  onHover?: (r: number, c: number) => void
  onLeave?: () => void
  onClick?: (r: number, c: number) => void
}) {
  return (
    <div className={'ic-boat' + (interactive ? ' interactive' : '')} onMouseLeave={onLeave}>
      {boat.map((cell, idx) => {
        const r = Math.floor(idx / G.BOAT_N), c = idx % G.BOAT_N
        const filled = cell.cat !== -1
        const isPreview = preview?.has(idx)
        const matched = cell.room !== -1 && cell.cat === cell.room
        const style: CSSProperties = {}
        if (cell.room !== -1) (style as Record<string, string>)['--room-tint'] = catVar(cell.room)
        if (filled) style.background = catVar(cell.cat)
        else if (isPreview) style.background = catVar(previewColor)
        const cls = 'ic-cell'
          + (cell.basket ? ' basket' : '')
          + (cell.room !== -1 ? ' room' : '')
          + (matched ? ' matched' : '')
          + (filled ? ' filled cat-' + cell.cat : '')
          + (isPreview ? ' preview' : '')
        return (
          <div key={idx}
            className={cls}
            style={style}
            onMouseEnter={interactive ? () => onHover?.(r, c) : undefined}
            onClick={interactive ? () => onClick?.(r, c) : undefined}
          />
        )
      })}
    </div>
  )
}

function ScorePanel({ sc }: { sc: ScoreBreakdown }) {
  return (
    <div className="ic-score">
      <div className="ic-score-row">
        <span>color families</span><span className="v">{sc.groupTotal}</span>
      </div>
      <div className="ic-colordots">
        {sc.colorSizes.map((size, i) => (
          <span key={i} className="ic-cdot" title={`${COLOR_NAMES[i]} largest ${size}`}>
            <i style={{ background: catVar(i) }} />{size}
          </span>
        ))}
      </div>
      <div className="ic-score-row">
        <span>matched rooms</span><span className="v">+{sc.roomBonus}</span>
      </div>
      <div className="ic-score-row">
        <span>holes (×−1)</span><span className="v">{sc.holePenalty}</span>
      </div>
      <div className="ic-score-row total">
        <span>TOTAL</span><span className="v">{sc.total}</span>
      </div>
    </div>
  )
}

function ResultModal({ winner, scores, onNew }: { winner: G.Player | -1; scores: [number, number] | null; onNew: () => void }) {
  const won = winner === 0
  const draw = winner === -1
  return (
    <Modal
      eyebrow={draw ? 'Even keel' : won ? 'Full boat' : 'Out-purred'}
      title={draw ? 'Draw' : won ? 'You Win' : 'AI Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Sail again</button>}
    >
      <div className="ic-finalsc">
        <span className="you">You {scores?.[0]}</span>
        <span className="sep">vs</span>
        <span className="foe">AI {scores?.[1]}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="The Isle of Cats" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Set sail</button>}>
      <div className="modal-body">
        <p>You and the AI each fill your own <b>6×6 boat</b>. Some squares are pre-printed <b>baskets</b> (🧺) that must stay <i>uncovered</i>, and some are printed colored <b>rooms</b> that want a matching-color cat.</p>
        <p>On your turn, <b>draft one cat</b> from the shared market and <b>place</b> it on empty, non-basket squares of your boat (any rotation/flip, no overlap). The market refills from the bag until it runs out.</p>
        <p><b>Scoring</b> when no one can place: your <b>largest connected group of each color</b> scores by size (1→1, 2→3, 3→6, 4→10, 5→15…); each <b>room square covered by its color</b> is <b>+3</b>; and every uncovered non-basket square is a <b>hole</b> worth <b>−1</b>. Highest total wins.</p>
        <p><b>Keys:</b> <kbd>R</kbd> rotate · <kbd>F</kbd> flip · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel/close.</p>
      </div>
    </Modal>
  )
}
