/* QWIRKLE — UI (built for this codebase). A felt table with a sparse tile grid, your six-tile
   rack, a score panel and a swap control, vs a greedy AI. Select a rack tile, click a glowing
   empty cell to stage it, then Place. Or select tiles and Swap. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as Q from './logic'
import type { QState, Tile, Placement } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1d242e" stroke="#3b4757" strokeWidth="1.5" />
    <rect x="9" y="9" width="13" height="13" rx="3" fill="#e0524b" />
    <circle cx="32.5" cy="15.5" r="6.5" fill="#4f8fe0" />
    <rect x="26" y="26" width="13" height="13" rx="3" fill="#e7c948" />
    <path d="M15.5 26 L19 33 L26 33 L20.5 37.5 L22.5 44 L15.5 40 L8.5 44 L10.5 37.5 L5 33 L12 33 Z" fill="#5bbf63" />
  </svg>
)

const cls = (t: Tile) => `t-${t.color}`

function TileFace({ tile, extra = '' }: { tile: Tile; extra?: string }) {
  return (
    <div className={`qw-tile ${cls(tile)} ${extra}`}>
      <div className={`qw-glyph ${tile.shape}`} />
    </div>
  )
}

type Staged = Placement

export function Qwirkle() {
  const [s, setS] = useState<QState>(() => Q.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)      // selected rack tile id
  const [staged, setStaged] = useState<Staged[]>([])        // tiles tentatively placed this turn
  const [swapSel, setSwapSel] = useState<Set<number>>(new Set()) // rack tile ids marked for swap
  const [hint, setHint] = useState('')

  function reset() {
    setSel(null); setStaged([]); setSwapSel(new Set()); setHint('')
  }
  function newGame() { setS(Q.makeGame()); reset(); setShowRules(false) }

  // AI turn (tick changes each AI turn via a move counter so chained turns re-arm the timer).
  const tick = s.log.length
  useAITurn(s.winner == null && s.turn === 1, () => setS(p => Q.aiTurn(p)), { delayMs: 620, tick })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setShowRules(false); reset() } })

  const yourTurn = s.winner == null && s.turn === 0

  // Board bounds (with a 1-cell margin) merged with staged tiles.
  const merged = useMemo(() => {
    const m = new Map(s.board)
    for (const st of staged) m.set(Q.key(st.r, st.c), st.tile)
    return m
  }, [s.board, staged])

  const bounds = useMemo(() => {
    let minR = 0, maxR = 0, minC = 0, maxC = 0, any = false
    for (const k of merged.keys()) {
      const [r, c] = k.split(',').map(Number)
      if (!any) { minR = maxR = r; minC = maxC = c; any = true }
      else { minR = Math.min(minR, r); maxR = Math.max(maxR, r); minC = Math.min(minC, c); maxC = Math.max(maxC, c) }
    }
    if (!any) return { minR: -1, maxR: 1, minC: -1, maxC: 1 }
    return { minR: minR - 1, maxR: maxR + 1, minC: minC - 1, maxC: maxC + 1 }
  }, [merged])

  const stagedIds = useMemo(() => new Set(staged.map(st => st.tile.id)), [staged])

  // Which empty cells are valid drop targets right now (selected tile + already-staged still legal).
  function canDropAt(r: number, c: number): boolean {
    if (sel == null) return false
    if (merged.has(Q.key(r, c))) return false
    const tile = s.hands[0].find(t => t.id === sel)
    if (!tile) return false
    const cand: Placement[] = staged.concat([{ r, c, tile }])
    return Q.isLegalPlacement(s.board, cand).ok
  }

  function clickRack(tile: Tile) {
    if (!yourTurn) return
    if (stagedIds.has(tile.id)) return
    if (swapSel.size > 0) {
      // toggle swap selection
      setSwapSel(prev => {
        const n = new Set(prev)
        if (n.has(tile.id)) n.delete(tile.id); else n.add(tile.id)
        return n
      })
      return
    }
    setSel(prev => prev === tile.id ? null : tile.id)
    setHint('')
  }

  function clickCell(r: number, c: number) {
    if (!yourTurn || sel == null) return
    if (!canDropAt(r, c)) { setHint('That tile cannot go there.'); return }
    const tile = s.hands[0].find(t => t.id === sel)!
    setStaged(prev => prev.concat([{ r, c, tile }]))
    setSel(null); setHint('')
  }

  function recall() { setStaged([]); setSel(null); setHint('') }

  function commitPlace() {
    if (staged.length === 0) return
    const res = Q.isLegalPlacement(s.board, staged)
    if (!res.ok) { setHint(res.reason ?? 'Illegal placement.'); return }
    setS(Q.applyPlacement(s, staged))
    reset()
  }

  function toggleSwapMode() {
    if (swapSel.size > 0) { setSwapSel(new Set()); return }
    // enter swap mode by marking nothing yet; recall any staged
    setStaged([]); setSel(null)
    setSwapSel(new Set([s.hands[0][0]?.id].filter((x): x is number => x != null)))
    setHint('')
  }

  function commitSwap() {
    const ids = [...swapSel]
    if (ids.length === 0) return
    if (s.bag.length < ids.length) { setHint('Not enough tiles in the bag to swap that many.'); return }
    setS(Q.swap(s, ids))
    reset()
  }

  const scoreNow = staged.length > 0 ? Q.scorePlacement(s.board, staged) : 0

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'You win!' }
  else if (s.winner === 1) { bk = 'lose'; banner = 'The rival wins — you lose' }
  else if (s.winner === 'draw') { bk = ''; banner = 'A tie!' }
  else if (yourTurn) { bk = 'you'; banner = staged.length > 0 ? `Placing for ${scoreNow} point${scoreNow === 1 ? '' : 's'}…` : 'Your turn — build a line' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  const rows: number[] = []
  for (let r = bounds.minR; r <= bounds.maxR; r++) rows.push(r)
  const cols: number[] = []
  for (let c = bounds.minC; c <= bounds.maxC; c++) cols.push(c)

  const lastIds = useMemo(() => new Set(s.last.map(p => p.tile.id)), [s.last])
  const inSwap = swapSel.size > 0

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Qwirkle · color & shape"
        title="Qwirkle"
        subtitle="lay tiles in lines that share one color or one shape — longer lines score more, a full six is a Qwirkle"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Bag ${s.bag.length}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="qw-main">
          <div className="qw-boardwrap">
            <div className="qw-grid" style={{ gridTemplateColumns: `repeat(${cols.length}, max-content)` }}>
              {rows.map(r => cols.map(c => {
                const k = Q.key(r, c)
                const t = merged.get(k)
                const isStaged = staged.some(st => st.r === r && st.c === c)
                const drop = yourTurn && sel != null && canDropAt(r, c)
                return (
                  <div
                    key={k}
                    className={`qw-cell ${t ? '' : 'empty'} ${drop ? 'drop' : ''}`}
                    onClick={() => !t && clickCell(r, c)}
                  >
                    {t && <TileFace tile={t} extra={`${isStaged ? 'pending' : ''} ${lastIds.has(t.id) && !isStaged ? 'last' : ''}`} />}
                  </div>
                )
              }))}
            </div>
          </div>

          <div className="qw-rack">
            <span className="qw-rack-label">Your rack</span>
            {s.hands[0].map(tile => {
              const isStaged = stagedIds.has(tile.id)
              const selected = sel === tile.id
              const sw = swapSel.has(tile.id)
              return (
                <div
                  key={tile.id}
                  className={`qw-slot ${selected ? 'sel' : ''} ${isStaged ? 'staged' : ''} ${sw ? 'sel' : ''}`}
                  onClick={() => clickRack(tile)}
                >
                  <TileFace tile={tile} />
                </div>
              )
            })}
          </div>

          <div className="qw-actions">
            {!inSwap ? (
              <>
                <button className="qw-btn go" onClick={commitPlace} disabled={!yourTurn || staged.length === 0}>Place ({staged.length})</button>
                <button className="qw-btn" onClick={recall} disabled={staged.length === 0}>Recall</button>
                <button className="qw-btn" onClick={toggleSwapMode} disabled={!yourTurn || s.bag.length === 0}>Swap…</button>
              </>
            ) : (
              <>
                <button className="qw-btn go" onClick={commitSwap} disabled={swapSel.size === 0}>Confirm swap ({swapSel.size})</button>
                <button className="qw-btn" onClick={() => setSwapSel(new Set())}>Cancel</button>
                <span className="qw-rack-label">Tap rack tiles to choose</span>
              </>
            )}
          </div>
          <div className="qw-hint">{hint}</div>
        </div>

        <div className="side">
          <div className="panel scoreboard">
            <div className={`sc you ${s.turn === 0 && s.winner == null ? 'on' : ''}`}>
              <span className="sc-dot" /><span className="sc-name">You</span><span className="sc-n">{s.scores[0]}</span>
            </div>
            <div className={`sc foe ${s.turn === 1 && s.winner == null ? 'on' : ''}`}>
              <span className="sc-dot" /><span className="sc-name">Rival</span><span className="sc-n">{s.scores[1]}</span>
            </div>
          </div>
          <div className="panel">
            <div className="bagrow"><span>Tiles in bag</span><b>{s.bag.length}</b></div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: QState; onNew: () => void }) {
  const won = s.winner === 0, draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Stalemate' : won ? 'Lines complete' : 'Out-played'}
      title={draw ? 'A Tie' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you"><span className="lbl">You</span>{s.scores[0]}</span>
        <span className="foe"><span className="lbl">Rival</span>{s.scores[1]}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Qwirkle" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Build straight lines of tiles. Every line you touch must share <b>one color</b> (all different shapes) <i>or</i> <b>one shape</b> (all different colors) — never a repeat of the same tile, never longer than six.</p>
        <p><b>Your turn:</b> tap a tile in your rack, then tap a glowing cell to stage it. Place one or more tiles in a single row or column, joined to the board. Hit <b>Place</b> to commit, or <b>Recall</b> to take them back.</p>
        <p>Each line containing a new tile scores <b>1 point per tile</b>; completing a line of six is a <b>Qwirkle</b> for <i>+6 bonus</i>. A tile that builds two lines scores both.</p>
        <p>Stuck? <b>Swap…</b> any tiles back into the bag (this forfeits your turn). The game ends when the bag is empty and someone plays their last tile (<i>+6</i>). Highest score wins.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect/close.</p>
      </div>
    </Modal>
  )
}
