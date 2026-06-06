/* SHOBU — UI (built for this codebase). Four 4x4 boards in a 2x2 grid; your two HOME boards
   (bottom row) are marked. Two-step turn: pick a PASSIVE move on a home board (click a stone,
   then a glowing destination), then a MATCHING aggressive move (same dir+dist) on an
   opposite-shade board. Pushed stones shove one space; shoved off the edge = captured. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as SH from './logic'
import type { ShobuState, PassiveMove, AggressiveMove } from './logic'

const { SIZE, BOARD_LIGHT, HOME, DIR_NAMES, rowOf, colOf } = SH

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="20" height="20" rx="3" fill="#e7ddc4" />
    <rect x="25" y="3" width="20" height="20" rx="3" fill="#3a2f4f" />
    <rect x="3" y="25" width="20" height="20" rx="3" fill="#3a2f4f" />
    <rect x="25" y="25" width="20" height="20" rx="3" fill="#e7ddc4" />
    <circle cx="9" cy="9" r="3" fill="#3fb6d6" />
    <circle cx="39" cy="39" r="3" fill="#3fb6d6" />
    <circle cx="17" cy="17" r="3" fill="#e8714e" />
    <circle cx="31" cy="9" r="3" fill="#e8714e" />
  </svg>
)

// A passive-move selection in progress.
interface Sel { board: number; from: number | null }

export function Shobu() {
  const [s, setS] = useState<ShobuState>(() => SH.makeGame(0))
  const [sel, setSel] = useState<Sel>({ board: -1, from: null })
  const [aggFrom, setAggFrom] = useState<number | null>(null)  // chosen aggressive origin
  const [showRules, setShowRules] = useState(false)
  // AI sub-step counter so useAITurn re-arms between its passive + aggressive resolution.
  const [aiTick, setAiTick] = useState(0)

  function newGame() {
    setS(SH.makeGame(0)); setSel({ board: -1, from: null }); setAggFrom(null); setShowRules(false)
  }
  function resetSel() { setSel({ board: -1, from: null }); setAggFrom(null) }

  const aiActive = !s.winner && s.turn === 1
  useAITurn(aiActive, () => { setS(p => SH.aiTurn(p)); setAiTick(t => t + 1) }, { delayMs: 560, tick: aiTick })
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); resetSel() },
  })

  const yourTurn = !s.winner && s.turn === 0

  // ---- passive-phase: destinations for the currently selected stone ----
  const passiveTargets = useMemo(() => {
    const m = new Map<number, PassiveMove>()  // dest cell -> move
    if (!yourTurn || s.phase !== 'passive' || sel.from == null) return m
    for (const pm of SH.passiveMoves(s, 0)) {
      if (pm.board === sel.board && pm.from === sel.from) m.set(pm.to, pm)
    }
    return m
  }, [yourTurn, s, sel])

  // cells on home boards that have at least one legal passive (selectable stones)
  const selectableStones = useMemo(() => {
    const set = new Set<string>()  // `${board}:${cell}`
    if (!yourTurn || s.phase !== 'passive') return set
    for (const pm of SH.passiveMoves(s, 0)) set.add(`${pm.board}:${pm.from}`)
    return set
  }, [yourTurn, s])

  // ---- aggressive-phase: legal aggressive moves matching the pending passive ----
  const aggMoves = useMemo<AggressiveMove[]>(() => {
    if (!yourTurn || s.phase !== 'aggressive' || s.pending == null) return []
    return SH.aggressiveMoves(s, s.pending, 0)
  }, [yourTurn, s])

  const aggOrigins = useMemo(() => {
    const set = new Set<string>()
    for (const am of aggMoves) set.add(`${am.board}:${am.from}`)
    return set
  }, [aggMoves])

  // destinations for the chosen aggressive origin
  const aggTargets = useMemo(() => {
    const m = new Map<string, AggressiveMove>()  // `${board}:${to}` -> move
    if (aggFrom == null) return m
    for (const am of aggMoves) if (am.from === aggFrom) m.set(`${am.board}:${am.to}`, am)
    return m
  }, [aggMoves, aggFrom])

  function clickCell(board: number, cell: number) {
    if (!yourTurn) return
    if (s.phase === 'passive') {
      if (!HOME[0].includes(board)) { resetSel(); return }
      // clicking a passive destination commits the passive move
      if (sel.from != null && sel.board === board && passiveTargets.has(cell)) {
        setS(SH.applyPassive(s, passiveTargets.get(cell)!))
        setSel({ board: -1, from: null })
        return
      }
      // select / reselect a stone
      if (selectableStones.has(`${board}:${cell}`)) setSel({ board, from: cell })
      else resetSel()
    } else {
      // aggressive phase
      const key = `${board}:${cell}`
      // clicking a target destination commits the aggressive move
      if (aggFrom != null && aggTargets.has(key)) {
        setS(SH.applyAggressive(s, aggTargets.get(key)!))
        setAggFrom(null)
        return
      }
      // choose / reselect an aggressive origin
      if (aggOrigins.has(key)) setAggFrom(cell)
      else setAggFrom(null)
    }
  }

  function cancelPassive() {
    // back out of the chosen passive — re-derive a fresh game state isn't possible (passive
    // already applied), so we offer cancel only before commit. Here just clear selection.
    resetSel()
  }

  // ---- banner ----
  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'You cleared a board — you win!' }
  else if (s.winner === 1) { bk = 'lose'; banner = 'The rival cleared a board — you lose' }
  else if (!yourTurn) { bk = 'foe'; banner = 'The rival is thinking…' }
  else if (s.phase === 'passive') { bk = 'you'; banner = sel.from == null ? 'Your turn — pick a passive move on a home board' : 'Choose where it slides (1–2 spaces)' }
  else { bk = 'you'; banner = aggFrom == null ? `Aggressive: ${DIR_NAMES[s.pending!.dir]}×${s.pending!.dist} on a ${BOARD_LIGHT[s.pending!.board] ? 'dark' : 'light'} board` : 'Choose the push destination' }

  const lastBoard = s.last?.board ?? -1
  const lastCells = new Set(s.last?.cells ?? [])

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Shobu · push &amp; clear"
        title="Shobu"
        subtitle="a passive move then a matching aggressive push — clear a rival off any board to win"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={s.phase === 'aggressive' && !s.winner && yourTurn ? `passive set · ${DIR_NAMES[s.pending!.dir]}×${s.pending!.dist}` : 'four boards'}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="sb-wrap">
          <div className="sb-grid">
            {[0, 1, 2, 3].map(bi => {
              const light = BOARD_LIGHT[bi]
              const home = HOME[0].includes(bi)
              const isAggSide = s.phase === 'aggressive' && yourTurn && s.pending != null && SH.aggressiveBoardsFor(s.pending.board).includes(bi)
              return (
                <div key={bi} className={'sb-board ' + (light ? 'light' : 'dark') + (home ? ' home' : '') + (isAggSide ? ' aggside' : '')}>
                  <div className="sb-bm">{home ? 'your home' : 'rival home'} · {light ? 'light' : 'dark'}</div>
                  <div className="sb-cells">
                    {Array.from({ length: SIZE * SIZE }, (_, ci) => {
                      const v = s.boards[bi][ci]
                      const r = rowOf(ci), c = colOf(ci)
                      const isPassiveSel = s.phase === 'passive' && sel.board === bi && sel.from === ci
                      const isPassiveTgt = s.phase === 'passive' && sel.board === bi && passiveTargets.has(ci)
                      const isSelectable = s.phase === 'passive' && selectableStones.has(`${bi}:${ci}`)
                      const isAggSel = s.phase === 'aggressive' && aggFrom === ci && aggOrigins.has(`${bi}:${ci}`)
                      const isAggOrigin = s.phase === 'aggressive' && aggOrigins.has(`${bi}:${ci}`)
                      const isAggTgt = aggTargets.has(`${bi}:${ci}`)
                      const isLast = lastBoard === bi && lastCells.has(ci)
                      const cls = ['sb-cell', (r + c) % 2 === 0 ? 'a' : 'b']
                      if (isPassiveTgt || isAggTgt) cls.push('target')
                      if (isLast) cls.push('last')
                      return (
                        <div key={ci} className={cls.join(' ')} onClick={() => clickCell(bi, ci)}>
                          {(isPassiveTgt || isAggTgt) && <span className="sb-hint" />}
                          {v != null && (
                            <span className={
                              'sb-stone p' + v +
                              (isPassiveSel || isAggSel ? ' sel' : '') +
                              ((isSelectable && v === 0) || (isAggOrigin && v === 0) ? ' live' : '') +
                              (isLast ? ' lastm' : '')
                            } />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel scoreboard">
            <div className={'sc you' + (s.turn === 0 && !s.winner ? ' on' : '')}>
              <span className="sc-stone p0" /><span className="sc-name">You · Blue</span>
              <span className="sc-n">{s.off[1]}</span>
            </div>
            <div className={'sc foe' + (s.turn === 1 && !s.winner ? ' on' : '')}>
              <span className="sc-stone p1" /><span className="sc-name">Rival · Coral</span>
              <span className="sc-n">{s.off[0]}</span>
            </div>
            <div className="sc-cap">stones pushed off · clear a board to win</div>
          </div>

          <div className="panel mincount">
            <div className="mc-title">stones per board (you / rival)</div>
            <div className="mc-grid">
              {[0, 1, 2, 3].map(bi => (
                <div key={bi} className={'mc-cell ' + (BOARD_LIGHT[bi] ? 'light' : 'dark')}>
                  <span className="mc-n you">{SH.countOn(s.boards[bi], 0)}</span>
                  <span className="mc-sep">/</span>
                  <span className="mc-n foe">{SH.countOn(s.boards[bi], 1)}</span>
                </div>
              ))}
            </div>
          </div>

          {s.phase === 'aggressive' && yourTurn && (
            <button className="sb-cancel" onClick={cancelPassive} disabled={aggFrom == null}>clear aggressive pick</button>
          )}

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: ShobuState; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? 'Board cleared' : 'Outpushed'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You pushed off {s.off[1]}</span><span className="foe">Rival pushed off {s.off[0]}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Shobu" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Four 4×4 boards sit in a 2×2 grid, alternating <b>light</b> and <b>dark</b>. The bottom two are <b>your home</b>; the top two are the rival's.</p>
        <p>Each turn you make <b>two</b> moves sharing the <b>same direction &amp; distance</b> (1 or 2):</p>
        <p><b>Passive</b> — slide one of your stones on a <i>home</i> board. It can't push and can't pass through or land on any stone.</p>
        <p><b>Aggressive</b> — the same direction &amp; distance, on a board of the <i>opposite shade</i>. It may push <b>one</b> rival stone (never two in a row, never your own). A stone shoved off the edge is <b>removed</b>.</p>
        <p>Pick a passive move that has a legal aggressive match. <b>Clear all four</b> of the rival's stones off any one board to win.</p>
        <p><b>Play:</b> click a glowing stone, then a glowing square (passive), then an aggressive stone + square. <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
    </Modal>
  )
}
