/* SAGRADA — UI. Two 5x4 stained-glass windows (yours interactive, the AI's revealed),
   a shared draft pool, the private + three public objectives, and live scores. You draft
   a die from the pool then click a highlighted cell to place it. Snake order: P0, P1, P1,
   P0 each round across 10 rounds. The AI drafts several times per game, so its driver
   re-arms on s.step (useAITurn tick). End state is shown by default at game over. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as S from './logic'
import type { SagradaState, Cell, Die, Player, Color } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="9" fill="#1a1426" stroke="#483861" strokeWidth="1.5" />
    <rect x="9" y="9" width="13" height="13" rx="2" fill="#e2453f" />
    <rect x="26" y="9" width="13" height="13" rx="2" fill="#f0c54a" />
    <rect x="9" y="26" width="13" height="13" rx="2" fill="#4d7fe0" />
    <rect x="26" y="26" width="13" height="13" rx="2" fill="#9a63d6" />
    <rect x="20.5" y="20.5" width="7" height="7" rx="1.5" fill="#4fb56b" stroke="#16121f" strokeWidth="1" />
  </svg>
)

// 3x3 pip layout per value.
const PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
}
function DieFace({ d }: { d: Die }) {
  const on = new Set(PIPS[d.value] || [])
  return (
    <div className={'sg-die ' + d.color}>
      {Array.from({ length: 9 }, (_, i) => <span key={i} className={'sg-pip' + (on.has(i) ? '' : ' off')} />)}
    </div>
  )
}

function CellView({
  cell, target, onClick,
}: { cell: Cell; target: boolean; onClick?: () => void }) {
  const cls = ['sg-cell']
  if (cell.reqColor) cls.push('req-' + cell.reqColor)
  if (target) cls.push('target')
  return (
    <div className={cls.join(' ')} onClick={target ? onClick : undefined}>
      {cell.die ? <DieFace d={cell.die} />
        : cell.reqValue != null ? <span className="sg-req-val">{cell.reqValue}</span> : null}
    </div>
  )
}

function Window({
  s, player, isYou, targets, onCell,
}: {
  s: SagradaState; player: Player; isYou: boolean
  targets: Set<number>; onCell?: (i: number) => void
}) {
  const bd = S.scoreWindow(s, player)
  const active = s.winner == null && s.turn === player
  const cls = ['sg-board', isYou ? 'you' : 'foe']
  if (active) cls.push('active')
  return (
    <div className={cls.join(' ')}>
      <div className="sg-board-head">
        <span className="sg-board-who">
          <span className={'sg-pawn ' + (isYou ? 'you' : 'foe')} />
          {isYou ? 'Your window' : 'AI window'}
        </span>
        <span className="sg-board-score">{bd.total} pts</span>
      </div>
      <div className="sg-grid">
        {s.windows[player].map((c, i) => (
          <CellView key={i} cell={c} target={targets.has(i)} onClick={() => onCell?.(i)} />
        ))}
      </div>
      <div className="sg-secret">
        secret colour · <span style={{ color: 'var(--ink-2)' }}>{isYou || s.winner != null ? s.secret[player] : 'hidden'}</span>
      </div>
    </div>
  )
}

export function Sagrada() {
  const [s, setS] = useState<SagradaState>(() => S.makeGame())
  const [sel, setSel] = useState<number | null>(null) // selected draft-pool index (yours)
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(S.makeGame()); setSel(null); setShowRules(false) }

  const yourTurn = s.winner == null && s.turn === 0
  const aiTurn = s.winner == null && s.turn === 1

  // AI drafts many times across the game — re-arm on s.step (the action counter).
  useAITurn(aiTurn, () => setS(p => S.aiTurn(p)), { delayMs: 620, tick: s.step })

  // If it's your turn but you cannot legally place any pooled die, auto-skip after a beat.
  useEffect(() => {
    if (!yourTurn) return
    if (!S.hasLegalMove(s, 0)) {
      const id = setTimeout(() => setS(p => (p.turn === 0 && p.winner == null && !S.hasLegalMove(p, 0)) ? S.skipPick(p, 0) : p), 700)
      return () => clearTimeout(id)
    }
  }, [s, yourTurn])

  // Clear a stale selection if the pool/turn changed.
  useEffect(() => { setSel(null) }, [s.round, s.step])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  // Legal placement targets for the currently selected die (yours).
  const targets = (() => {
    if (!yourTurn || sel == null || sel >= s.pool.length) return new Set<number>()
    return new Set(S.legalPlacements(s.windows[0], s.pool[sel]))
  })()

  function draftDie(i: number) {
    if (!yourTurn) return
    setSel(prev => (prev === i ? null : i))
  }
  function placeAt(cell: number) {
    if (!yourTurn || sel == null) return
    setS(p => S.placeDie(p, 0, sel, cell))
    setSel(null)
  }

  // Banner.
  let banner: string, bk = ''
  if (s.winner != null && s.scores) {
    if (s.winner === 0) { bk = 'win'; banner = `You win — ${s.scores[0]} to ${s.scores[1]}!` }
    else { bk = 'lose'; banner = `The AI wins — ${s.scores[1]} to ${s.scores[0]}.` }
  } else if (yourTurn) {
    bk = 'you'
    banner = !S.hasLegalMove(s, 0) ? 'No legal placement — skipping…'
      : sel == null ? 'Draft a die from the pool' : 'Place it in a highlighted cell'
  } else { bk = 'foe'; banner = 'The AI is drafting…' }

  const youScore = S.scoreWindow(s, 0).total
  const aiScore = S.scoreWindow(s, 1).total

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Sagrada · dice-drafting stained glass"
        title="Sagrada"
        subtitle="draft jewel-toned dice and lead them into your window — match the patterns, never repeat a neighbour's colour or value"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Round ${s.round} / ${S.ROUNDS} · You ${youScore} · AI ${aiScore}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click · draft &amp; place &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="sg-main">
          <div className="sg-pool-wrap">
            <div className="sg-pool-title">Draft pool — round {s.round}</div>
            <div className="sg-pool">
              {s.pool.length === 0 ? <span className="sg-pool-empty">pool empty</span>
                : s.pool.map((d, i) => {
                  const draftable = yourTurn && S.canPlaceAnywhere(s.windows[0], d)
                  return (
                    <div
                      key={i}
                      className={'sg-pool-die' + (draftable ? ' draftable' : '') + (sel === i ? ' sel' : '')}
                      onClick={draftable ? () => draftDie(i) : undefined}
                      title={draftable ? 'draft this die' : 'no legal placement'}
                    >
                      <DieFace d={d} />
                    </div>
                  )
                })}
            </div>
          </div>

          <div className="sg-windows">
            <Window s={s} player={0} isYou targets={targets} onCell={placeAt} />
            <Window s={s} player={1} isYou={false} targets={new Set()} />
          </div>
        </div>

        <div className="side">
          <div className="panel sg-objs">
            <div className="sg-obj-h">Objectives</div>
            <div className="sg-obj priv">
              <div className="sg-obj-name">
                <span className={'sg-swatch ' + s.secret[0]} /> Private · {s.secret[0]}
              </div>
              <div className="sg-obj-desc">Sum the pips of every {s.secret[0]} die in your window.</div>
            </div>
            {s.publics.map(o => (
              <div className="sg-obj" key={o.id}>
                <div className="sg-obj-name">{o.name}</div>
                <div className="sg-obj-desc">{o.desc}</div>
              </div>
            ))}
            <div className="sg-obj-desc" style={{ color: 'var(--warn)' }}>−1 point for every empty cell.</div>
          </div>

          <div className="panel sg-scorebox">
            <div className="sg-srow"><span className={'sg-pawn you'} /><span className="sg-who">You</span><span className="sg-pts">{youScore}</span></div>
            <div className="sg-srow"><span className={'sg-pawn foe'} /><span className="sg-who">AI</span><span className="sg-pts">{aiScore}</span></div>
          </div>

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && s.scores && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal secret={s.secret[0]} onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: SagradaState; onNew: () => void }) {
  const won = s.winner === 0
  const tie = s.scores![0] === s.scores![1]
  const bdY = S.scoreWindow(s, 0)
  const bdA = S.scoreWindow(s, 1)
  function Col({ who, bd, cls }: { who: string; bd: S.ScoreBreakdown; cls: string }) {
    return (
      <div className={'sg-fcol ' + cls}>
        <h4>{who}</h4>
        <div className="sg-fline"><span>Private</span><span>{bd.private}</span></div>
        {bd.publics.map((p, i) => <div className="sg-fline" key={i}><span>{p.name}</span><span>{p.pts}</span></div>)}
        <div className="sg-fline"><span>Empty cells</span><span>−{bd.emptyPenalty}</span></div>
        <div className="sg-fline tot"><span>Total</span><span>{bd.total}</span></div>
      </div>
    )
  }
  return (
    <Modal
      eyebrow={won ? 'Window of light' : tie ? 'Dead heat' : 'Outshone'}
      title={won ? 'You Win' : tie ? 'Tie — You Win' : 'AI Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <div className="sg-final">
          <Col who="You" bd={bdY} cls="you" />
          <Col who="AI" bd={bdA} cls="foe" />
        </div>
      </div>
    </Modal>
  )
}

function RulesModal({ secret, onClose }: { secret: Color; onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Sagrada" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Fill your <b>5×4 window</b> (20 cells) with drafted dice over <b>10 rounds</b>. Each round five dice are rolled into a shared <b>draft pool</b>; you and the AI alternate drafting one die in snake order (You, AI, AI, You) and leading it into your window.</p>
        <p><b>Placement:</b> your first die must touch an <b>edge or corner</b>. Every later die must sit <b>orthogonally adjacent</b> to a placed die and may <i>not</i> touch a die of the <b>same colour</b> or <b>same value</b>. A cell's printed colour tint or engraved value must be matched.</p>
        <p><b>Scoring at the end:</b> your <b>private</b> objective sums the pips of your secret colour (this game: <b>{secret}</b>). Three <b>public</b> objectives (shown in the side panel) reward patterns across both windows. Then <b>−1 per empty cell</b>. Highest total wins; ties go to you.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect/close. Click a pool die, then a highlighted cell to place it.</p>
      </div>
    </Modal>
  )
}
