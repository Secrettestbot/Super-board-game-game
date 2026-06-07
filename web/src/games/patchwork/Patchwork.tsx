/* PATCHWORK — UI. A shared time track with two tokens + income markers, two 9x9 quilts,
   the next-3 buyable patches (cost/time/income), your buttons, and a place-with-rotation
   flow. Seat-relative: you are `mySeat` (0 solo/host, 1 as a guest), the opponent is the
   other seat. Because turns DON'T alternate, the net hook drives any empty seat's AI off a
   tickKey that changes on every action; isMyTurn gates all interaction. */

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { patchworkAdapter } from './net'
import * as P from './logic'
import type { State, Patch, Player } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#3a2a22" stroke="#6b4a36" strokeWidth="1.5" />
    <rect x="9" y="9" width="14" height="14" rx="2" fill="#e08a5a" />
    <rect x="25" y="9" width="14" height="14" rx="2" fill="#7fae8a" />
    <rect x="9" y="25" width="14" height="14" rx="2" fill="#d9b24a" />
    <rect x="25" y="25" width="14" height="14" rx="2" fill="#b56a7e" />
  </svg>
)

// 8-color quilt palette (indices align with patch.color)
const PATCH_COLORS = [
  '#e08a5a', '#7fae8a', '#d9b24a', '#b56a7e',
  '#6f97b8', '#c9774f', '#8e9e5a', '#b07cc0',
]

function patchColor(i: number): string { return PATCH_COLORS[i % PATCH_COLORS.length] }

/** Render a small preview of a patch shape (oriented). */
function ShapeGrid({ shape, color, cell = 13 }: { shape: P.Shape; color: number; cell?: number }) {
  const maxR = Math.max(...shape.map(c => c[0]))
  const maxC = Math.max(...shape.map(c => c[1]))
  const filled = new Set(shape.map(([r, c]) => r * 100 + c))
  const rows = []
  for (let r = 0; r <= maxR; r++) {
    const cols = []
    for (let c = 0; c <= maxC; c++) {
      const on = filled.has(r * 100 + c)
      cols.push(
        <span key={c} className={'pw-mini' + (on ? ' on' : '')}
          style={{ width: cell, height: cell, background: on ? patchColor(color) : 'transparent' }} />,
      )
    }
    rows.push(<div key={r} className="pw-mini-row">{cols}</div>)
  }
  return <div className="pw-mini-grid">{rows}</div>
}

export function Patchwork() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(patchworkAdapter)
  const me = mySeat as Player          // seat 0 or 1 == player index
  const oppSeat = (1 - me) as Player
  const [showRules, setShowRules] = useState(false)
  // placement flow state (human)
  const [selPatch, setSelPatch] = useState<number | null>(null)
  const [orient, setOrient] = useState(0)
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null)

  function newGame() {
    netNew()
    setShowRules(false); setSelPatch(null); setOrient(0); setHover(null)
  }

  const mv = P.toMove(s)
  const yourTurn = s.winner === null && isMyTurn
  const oppActive = s.winner === null && mv === oppSeat
  const oppLabel = net.online ? 'Opponent' : 'AI'

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (selPatch !== null) { setSelPatch(null); setHover(null) } else setShowRules(false) },
    extra: (e) => {
      if (!yourTurn) return false
      if ((e.key === 'r' || e.key === 'R') && selPatch !== null) {
        const patch = P.nextThree(s).find(p => p.id === selPatch)
        if (patch) setOrient(o => (o + 1) % P.orientations(patch.shape).length)
        return true
      }
      if (e.key === ' ') { doAdvance(); return true }
      return false
    },
  })

  const three = useMemo(() => P.nextThree(s), [s])
  const selectedPatch: Patch | null = selPatch !== null ? (three.find(p => p.id === selPatch) ?? null) : null
  const selOrients = selectedPatch ? P.orientations(selectedPatch.shape) : []
  const selShape = selectedPatch ? selOrients[orient % Math.max(1, selOrients.length)] : null

  // preview cells for the hovered anchor (valid placement only)
  const previewCells = useMemo(() => {
    if (!yourTurn || !selectedPatch || !selShape || !hover) return null
    if (P.canPlace(s.players[me].quilt, selShape, hover.r, hover.c)) {
      return new Set(P.cellsFor(selShape, hover.r, hover.c) ?? [])
    }
    return null
  }, [yourTurn, selectedPatch, selShape, hover, s, me])

  function doAdvance() {
    if (!yourTurn) return
    setSelPatch(null); setHover(null)
    dispatch({ kind: 'advance' })
  }

  function selectPatch(p: Patch) {
    if (!yourTurn) return
    if (!P.canBuy(s, me, p.id)) return
    setSelPatch(p.id); setOrient(0); setHover(null)
  }

  function clickQuiltCell(r: number, c: number) {
    if (!yourTurn || !selectedPatch || !selShape) return
    if (!P.canPlace(s.players[me].quilt, selShape, r, c)) return
    const id = selectedPatch.id
    const o = orient % selOrients.length
    setSelPatch(null); setHover(null)
    dispatch({ kind: 'buy', patchId: id, cell: r * P.QN + c, orientation: o })
  }

  // banner (relative to mySeat)
  const myScore = s.scores?.[me]
  const oppScore = s.scores?.[oppSeat]
  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = `You win — ${myScore} to ${oppScore}!` }
  else if (s.winner === oppSeat) { bk = 'lose'; banner = `${oppLabel === 'AI' ? 'The AI' : oppLabel} wins — ${oppScore} to ${myScore}.` }
  else if (s.winner === -1) { bk = ''; banner = `A draw — ${myScore} apiece.` }
  else if (yourTurn) {
    bk = 'you'
    banner = selectedPatch ? 'Rotate (R) then click a quilt square to place' : 'Your turn — buy a patch or advance (Space)'
  } else {
    bk = 'foe'
    banner = net.online ? 'Waiting for your opponent…' : 'The AI is stitching its quilt…'
  }

  const you = s.players[me]
  const ai = s.players[oppSeat]

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Patchwork · quilt building"
        title="Patchwork"
        subtitle="race the time track, buy polyomino patches, and stitch the fullest 9×9 quilt — empty squares cost you"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`You ${P.scoreOf(s, me)} · ${oppLabel} ${P.scoreOf(s, oppSeat)}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · advance &nbsp; R · rotate &nbsp; N · new</>}
      >
        <div className="pw-wrap">
          {/* TIME BOARD (seat-relative: `mv` is 0 when it's your token's turn) */}
          <TimeBoard you={you.pos} ai={ai.pos} mv={mv === null ? null : (mv === me ? 0 : 1)} />

          <div className="pw-main">
            {/* YOUR QUILT */}
            <div className={'pw-quiltbox' + (yourTurn ? ' active' : '')}>
              <div className="pw-qhead">
                <span className="pw-pawn you" /> You
                <span className="pw-stat">◉ {you.buttons}</span>
                <span className="pw-stat">⊞ {P.emptyCells(you.quilt)} empty</span>
                <span className="pw-stat">↑ {you.income} inc</span>
              </div>
              <Quilt
                quilt={you.quilt}
                preview={previewCells}
                previewColor={selectedPatch?.color ?? 0}
                interactive={yourTurn && selectedPatch !== null}
                onHover={(r, c) => setHover({ r, c })}
                onLeave={() => setHover(null)}
                onClick={clickQuiltCell}
              />
            </div>

            {/* MARKET */}
            <div className="pw-market">
              <div className="pw-mhead">Patch Market — next 3</div>
              <div className="pw-patches">
                {three.map((p, i) => {
                  const buyable = yourTurn && P.canBuy(s, me, p.id)
                  const sel = selPatch === p.id
                  return (
                    <div key={p.id}
                      className={'pw-patch' + (buyable ? ' buyable' : '') + (sel ? ' sel' : '') + (!buyable && yourTurn ? ' dim' : '')}
                      onClick={() => selectPatch(p)}>
                      <div className="pw-patch-pos">{i + 1}</div>
                      <ShapeGrid shape={p.shape} color={p.color} />
                      <div className="pw-patch-stats">
                        <span className="pw-cost">◉{p.buttonCost}</span>
                        <span className="pw-time">⏱{p.timeCost}</span>
                        <span className="pw-inc">↑{p.income}</span>
                      </div>
                    </div>
                  )
                })}
                {three.length === 0 && <div className="pw-hint">market empty</div>}
              </div>

              {yourTurn && (
                <div className="pw-actions">
                  {selectedPatch ? (
                    <>
                      <div className="pw-orient">
                        <span className="pw-olabel">orientation</span>
                        {selShape && <ShapeGrid shape={selShape} color={selectedPatch.color} cell={11} />}
                      </div>
                      <button className="pw-btn" onClick={() => {
                        setOrient(o => (o + 1) % selOrients.length)
                      }}>Rotate (R)</button>
                      <button className="pw-btn ghost" onClick={() => { setSelPatch(null); setHover(null) }}>Cancel</button>
                    </>
                  ) : (
                    <button className="pw-btn" onClick={doAdvance}>Advance &amp; take buttons</button>
                  )}
                </div>
              )}
              {!yourTurn && s.winner === null && (
                <div className="pw-hint">{net.online ? 'watching your opponent…' : 'watching the AI…'}</div>
              )}
            </div>

            {/* OPPONENT QUILT */}
            <div className={'pw-quiltbox' + (oppActive ? ' active' : '')}>
              <div className="pw-qhead">
                <span className="pw-pawn ai" /> {oppLabel}
                <span className="pw-stat">◉ {ai.buttons}</span>
                <span className="pw-stat">⊞ {P.emptyCells(ai.quilt)} empty</span>
                <span className="pw-stat">↑ {ai.income} inc</span>
              </div>
              <Quilt quilt={ai.quilt} preview={null} previewColor={0} interactive={false} />
            </div>
          </div>

          <div className="panel pw-online"><OnlineBar net={net} /></div>

          <div className="panel pw-log">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner !== null && (
        <ResultModal won={s.winner === me} draw={s.winner === -1} myScore={myScore} oppScore={oppScore} oppLabel={oppLabel} onNew={newGame} />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function TimeBoard({ you, ai, mv }: { you: number; ai: number; mv: P.Player | null }) {
  const incomeSet = new Set(P.INCOME_SPACES)
  return (
    <div className="pw-time">
      <div className="pw-time-track">
        {Array.from({ length: P.END + 1 }, (_, i) => {
          const isIncome = incomeSet.has(i)
          const isEnd = i === P.END
          const hasYou = you === i
          const hasAi = ai === i
          return (
            <div key={i} className={'pw-tcell' + (isIncome ? ' income' : '') + (isEnd ? ' end' : '')} title={`space ${i}`}>
              {(i % 5 === 0 || isEnd) && <span className="pw-tnum">{i}</span>}
              {(hasYou || hasAi) && (
                <div className="pw-toks">
                  {hasYou && <span className={'pw-tok you' + (mv === 0 ? ' move' : '')} />}
                  {hasAi && <span className={'pw-tok ai' + (mv === 1 ? ' move' : '')} />}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="pw-time-legend"><span className="pw-leg-inc" /> button income · <span className="pw-leg-end" /> finish (53)</div>
    </div>
  )
}

function Quilt({
  quilt, preview, previewColor, interactive, onHover, onLeave, onClick,
}: {
  quilt: number[]
  preview: Set<number> | null
  previewColor: number
  interactive: boolean
  onHover?: (r: number, c: number) => void
  onLeave?: () => void
  onClick?: (r: number, c: number) => void
}) {
  return (
    <div className={'pw-quilt' + (interactive ? ' interactive' : '')} onMouseLeave={onLeave}>
      {Array.from({ length: P.QCELLS }, (_, idx) => {
        const r = Math.floor(idx / P.QN), c = idx % P.QN
        const v = quilt[idx]
        const isPreview = preview?.has(idx)
        const style: CSSProperties = {}
        if (v !== -1) style.background = patchColor(v)
        else if (isPreview) style.background = patchColor(previewColor)
        return (
          <div key={idx}
            className={'pw-cell' + (v !== -1 ? ' filled' : '') + (isPreview ? ' preview' : '')}
            style={style}
            onMouseEnter={interactive ? () => onHover?.(r, c) : undefined}
            onClick={interactive ? () => onClick?.(r, c) : undefined}
          />
        )
      })}
    </div>
  )
}

function ResultModal({ won, draw, myScore, oppScore, oppLabel, onNew }: {
  won: boolean; draw: boolean; myScore?: number; oppScore?: number; oppLabel: string; onNew: () => void
}) {
  return (
    <Modal
      eyebrow={draw ? 'Even stitches' : won ? 'Cozy victory' : 'Out-quilted'}
      title={draw ? 'Draw' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You {myScore}</span>
        <span className="sep">vs</span>
        <span className="foe">{oppLabel} {oppScore}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Patchwork" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Start stitching</button>}>
      <div className="modal-body">
        <p>Both time tokens start at <b>0</b> on a track to <b>53</b>. The player whose token is <b>further back</b> takes the next turn — so you may move <i>several times in a row</i>. On a tie, whoever is <b>on top</b> (moved there most recently) goes.</p>
        <p>On your turn, do <b>one</b>: <b>Advance</b> to just past the opponent and collect that many <b>buttons</b>; or <b>buy</b> one of the next 3 patches you can afford and place on your 9×9 quilt (any rotation/flip, no overlap). Buying costs buttons and advances your token by its time cost.</p>
        <p>Crossing a <b>button-income space</b> pays you buttons equal to the total income printed on the patches in your quilt.</p>
        <p>When both tokens reach 53 the game ends. <b>Score = buttons − 2 × empty squares.</b> Highest wins.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> advance · <kbd>R</kbd> rotate patch · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel/close.</p>
      </div>
    </Modal>
  )
}
