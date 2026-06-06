/* SANTORINI — UI (built for this codebase). A sunlit Aegean island: a 5x5 plaza of
   white-block buildings and blue domes, azure vs terracotta workers, vs an alpha-beta AI.
   Select a worker -> climb (≤1 up) -> build. Reach level 3 to win. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as ST from './logic'
import type { SantoriniState, Side } from './logic'

const { N } = ST

type Phase = { kind: 'idle' } | { kind: 'move'; wi: number } | { kind: 'build'; wi: number; to: number }

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1f6f93" stroke="#3aa0c4" strokeWidth="1.5" />
    <rect x="11" y="24" width="11" height="15" rx="1.5" fill="#f4efe6" stroke="#cdc3b0" strokeWidth="0.6" />
    <rect x="24" y="18" width="11" height="21" rx="1.5" fill="#fbf7ef" stroke="#cdc3b0" strokeWidth="0.6" />
    <path d="M24 18 a5.5 5.5 0 0 1 11 0 Z" fill="#2c8ec4" stroke="#1f6f93" strokeWidth="0.6" />
  </svg>
)

export function Santorini() {
  const [s, setS] = useState<SantoriniState>(() => ST.makeGame())
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(ST.makeGame()); setPhase({ kind: 'idle' }); setShowRules(false) }

  useAITurn(!s.winner && s.turn === 'ai', () => setS(p => ST.aiMove(p)), { delayMs: 520 })
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setPhase({ kind: 'idle' }) },
  })

  const yourTurn = !s.winner && s.turn === 'you'

  // highlighted cells for the active phase
  const moveCells = useMemo(() => {
    if (!yourTurn || phase.kind !== 'move') return new Set<number>()
    return new Set(ST.legalMoves(s, phase.wi))
  }, [yourTurn, phase, s])

  const buildCells = useMemo(() => {
    if (!yourTurn || phase.kind !== 'build') return new Set<number>()
    const workers = s.workers.map((x, k) => k === phase.wi ? { side: x.side, pos: phase.to } : x)
    return new Set(ST.legalBuilds(s.levels, workers, phase.to))
  }, [yourTurn, phase, s])

  // ghost worker position while in the build phase (worker already "moved")
  const ghost = phase.kind === 'build' ? phase.to : -1
  const ghostFrom = phase.kind === 'build' ? s.workers[phase.wi].pos : -1

  function clickCell(i: number) {
    if (!yourTurn) return
    if (phase.kind === 'idle' || phase.kind === 'move') {
      const w = ST.workerAt(s, i)
      if (w && w.side === 'you') {
        const wi = s.workers.indexOf(w)
        setPhase({ kind: 'move', wi })
        return
      }
      if (phase.kind === 'move' && moveCells.has(i)) {
        // landing on level 3 is an instant win — applyTurn handles build=-1
        if (s.levels[i] === 3) { setS(ST.applyTurn(s, phase.wi, i, -1, 'you')); setPhase({ kind: 'idle' }); return }
        setPhase({ kind: 'build', wi: phase.wi, to: i })
        return
      }
      return
    }
    if (phase.kind === 'build') {
      if (buildCells.has(i)) {
        setS(ST.applyTurn(s, phase.wi, phase.to, i, 'you'))
        setPhase({ kind: 'idle' })
      }
    }
  }

  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = 'You reach the summit — you win' }
  else if (s.winner === 'ai') { bk = 'lose'; banner = 'The rival reaches the summit — you lose' }
  else if (!yourTurn) { bk = 'foe'; banner = 'The rival is plotting…' }
  else if (phase.kind === 'move') { bk = 'you'; banner = 'Choose where to climb' }
  else if (phase.kind === 'build') { bk = 'you'; banner = 'Choose where to build' }
  else { bk = 'you'; banner = 'Select a worker to move' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Santorini · climb the cyclades"
        title="Santorini"
        subtitle="move up one level then build — first worker to stand on a level-3 roof wins"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="5 × 5"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="sn-wrap">
          <div className="sn-board">
            {s.levels.map((lvl, i) => {
              const w = ST.workerAt(s, i)
              const showWorker = w && i !== ghostFrom            // hide the worker we lifted in build phase
              const cls = 'sn-cell'
                + (moveCells.has(i) ? ' move' : '')
                + (buildCells.has(i) ? ' build' : '')
                + (phase.kind === 'move' && w && w.side === 'you' && i === s.workers[phase.wi].pos ? ' sel' : '')
                + (s.last === i ? ' last' : '')
              return (
                <div key={i} className={cls} onClick={() => clickCell(i)}>
                  <Tower level={lvl} />
                  {showWorker && <Figure side={w!.side} />}
                  {i === ghost && <Figure side="you" ghost />}
                  {moveCells.has(i) && <div className="sn-hint">{lvl === 3 ? '★' : (s.levels[i] || 0)}</div>}
                  {buildCells.has(i) && <div className="sn-plus">+</div>}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel players">
            <Player side="you" label="You · Azure" on={s.turn === 'you' && !s.winner} s={s} />
            <Player side="ai" label="Rival · Terracotta" on={s.turn === 'ai' && !s.winner} s={s} />
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function Tower({ level }: { level: number }) {
  // stacked blocks for tiers 1..3, dome at 4
  return (
    <div className="sn-tower" data-lvl={level}>
      {level >= 1 && <div className="blk b1" />}
      {level >= 2 && <div className="blk b2" />}
      {level >= 3 && <div className="blk b3" />}
      {level >= 4 && <div className="dome" />}
    </div>
  )
}

function Figure({ side, ghost }: { side: Side; ghost?: boolean }) {
  return (
    <svg className={'sn-fig ' + side + (ghost ? ' ghost' : '')} viewBox="0 0 24 32" aria-hidden="true">
      <circle cx="12" cy="7" r="5" />
      <path d="M5 30 C5 19 19 19 19 30 Z" />
    </svg>
  )
}

function Player({ side, label, on, s }: { side: Side; label: string; on: boolean; s: SantoriniState }) {
  const heights = s.workers.filter(w => w.side === side).map(w => s.levels[w.pos])
  return (
    <div className={'pl ' + side + (on ? ' on' : '')}>
      <svg className={'pl-fig ' + side} viewBox="0 0 24 32" aria-hidden="true">
        <circle cx="12" cy="7" r="5" /><path d="M5 30 C5 19 19 19 19 30 Z" />
      </svg>
      <span className="pl-name">{label}</span>
      <span className="pl-h">{heights.sort((a, b) => b - a).map((h, i) => <span key={i} className="pl-chip" data-h={h}>{h}</span>)}</span>
    </div>
  )
}

function ResultModal({ s, onNew }: { s: SantoriniState; onNew: () => void }) {
  const won = s.winner === 'you'
  return (
    <Modal
      eyebrow={won ? 'Summit reached' : 'Out-climbed'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalmsg">{won ? 'Your worker stands atop a third-level roof, crowned by the Aegean sun.' : 'The rival reached the rooftops first — or boxed your workers in.'}</div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Santorini" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Each side commands <b>two workers</b> on a 5×5 plaza. On your turn, <b>select a worker</b>, <b>move</b> it to an adjacent square, then <b>build</b> on an adjacent square.</p>
        <p>You may step <b>down</b> any number of levels, but <b>up by at most one</b>. You cannot enter an occupied square or a square capped by a <i>dome</i>.</p>
        <p>After moving, the same worker raises a neighbouring building by one level. A level-3 building becomes a <i>dome</i> — impassable.</p>
        <p><b>You win</b> the instant a worker steps onto a <b>level-3</b> roof. You <b>lose</b> if neither of your workers can make a legal move.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
