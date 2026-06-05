/* COLORETTO — UI (built for this codebase). A bright, friendly colour-card game on the
   shared framework shell, vs a greedy heuristic AI. On your turn: DRAW the top card then
   click a row to place it, or TAKE a row to collect its cards and sit out the round. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as CL from './logic'
import type { ColorettoState, Card, Color, Player, Tableau } from './logic'

const { COLORS, ROWS } = CL

const SWATCH: Record<Color, string> = {
  red: '#ef5350', orange: '#ff9636', yellow: '#ffd24a', green: '#5ec46b',
  blue: '#4aa8ff', purple: '#a479ff', pink: '#ff7ac0',
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="11" fill="#1c2230" stroke="#3a4763" strokeWidth="1.5" />
    <circle cx="18" cy="20" r="9" fill="#5ec46b" />
    <circle cx="30" cy="20" r="9" fill="#4aa8ff" opacity="0.92" />
    <circle cx="24" cy="30" r="9" fill="#ff9636" opacity="0.9" />
    <circle cx="20" cy="18" r="1.7" fill="#1c2230" />
  </svg>
)

function CardChip({ card, big }: { card: Card; big?: boolean }) {
  if (card.kind === 'plus2') return <div className={'cl-card plus2' + (big ? ' big' : '')}>+2</div>
  if (card.kind === 'last') return <div className={'cl-card last' + (big ? ' big' : '')}>★</div>
  return <div className={'cl-card' + (big ? ' big' : '')} style={{ background: SWATCH[card.color] }} />
}

export function Coloretto() {
  const [s, setS] = useState<ColorettoState>(() => CL.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [mode, setMode] = useState<'idle' | 'placing' | 'taking'>('idle')

  function newGame() { setS(CL.makeGame()); setShowRules(false); setMode('idle') }

  // AI plays its whole turn in steps (draw -> place, or take). Re-arm on each sub-step.
  useAITurn(!s.winner && s.turn === 'ai', () => setS(p => CL.aiStep(p)),
    { delayMs: 520, tick: `${s.pending ? 'p' : 'n'}:${s.deck.length}:${s.done.ai}` })

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setMode('idle') },
    extra: (e) => {
      if (s.winner || s.turn !== 'you') return
      if (e.key === 'd' || e.key === 'D') { startDraw(); return true }
      if (e.key === 't' || e.key === 'T') { setMode('taking'); return true }
      return false
    },
  })

  const yourTurn = !s.winner && s.turn === 'you'
  const canDraw = CL.legalDraw(s, 'you')
  const placeRows = useMemo(() => new Set(CL.placeRows(s, 'you')), [s])
  const takeRows = useMemo(() => new Set(CL.legalTakeRows(s, 'you')), [s])

  // when a draw produces a pending card, force "placing" mode
  const placing = !!s.pending && yourTurn
  const activeMode = placing ? 'placing' : mode

  function startDraw() {
    if (!canDraw) return
    setMode('idle')
    setS(p => CL.draw(p, 'you'))
  }

  function clickRow(r: number) {
    if (!yourTurn) return
    if (activeMode === 'placing' && placeRows.has(r)) { setS(p => CL.place(p, r, 'you')); setMode('idle'); return }
    if (activeMode === 'taking' && takeRows.has(r)) { setS(p => CL.take(p, r, 'you')); setMode('idle'); return }
  }

  const yourScore = CL.scoreTableau(s.tableau.you)
  const aiScore = CL.scoreTableau(s.tableau.ai)

  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = `You win — ${yourScore} to ${aiScore}` }
  else if (s.winner === 'ai') { bk = 'lose'; banner = `The rival wins — ${aiScore} to ${yourScore}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${yourScore}–${aiScore}` }
  else if (s.done.you && yourTurn) { bk = 'foe'; banner = 'You sat out — waiting for the round to end…' }
  else if (placing) { bk = 'you'; banner = 'Place your card — click a row' }
  else if (activeMode === 'taking') { bk = 'you'; banner = 'Take a row — click a stack to collect it' }
  else if (yourTurn) { bk = 'you'; banner = 'Your move — Draw a card or Take a row' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  const youSitting = s.done.you && !s.winner
  const aiSitting = s.done.ai && !s.winner

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Coloretto · press your luck"
        title="Coloretto"
        subtitle="grab the colours you want, dodge the ones you don't — your best three score, the rest sting"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={s.lastRound ? 'Final round' : `${s.deck.length} in deck`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>D · draw &nbsp; T · take &nbsp; N · new</>}
      >
        <div className="cl-wrap">
          <div className="cl-pending">
            {placing
              ? <div className="cl-pendcard"><span className="cl-pendlabel">placing</span><CardChip card={s.pending as Card} big /></div>
              : <div className="cl-actions">
                  <button className="cl-btn draw" disabled={!canDraw} onClick={startDraw}>Draw a card</button>
                  <button className={'cl-btn take' + (activeMode === 'taking' ? ' armed' : '')} disabled={takeRows.size === 0} onClick={() => setMode(m => m === 'taking' ? 'idle' : 'taking')}>
                    {activeMode === 'taking' ? 'Pick a row…' : 'Take a row'}
                  </button>
                </div>}
          </div>

          <div className="cl-rows">
            {s.rows.map((row, r) => {
              const hl = (activeMode === 'placing' && placeRows.has(r)) || (activeMode === 'taking' && takeRows.has(r))
              const cls = 'cl-row' + (s.taken[r] ? ' taken' : '') + (hl ? ' hot' : '')
              return (
                <div key={r} className={cls} onClick={() => clickRow(r)}>
                  <span className="cl-rown">{r + 1}</span>
                  <div className="cl-slots">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="cl-slot">{row[i] ? <CardChip card={row[i]} /> : null}</div>
                    ))}
                  </div>
                  {s.taken[r] && <span className="cl-tag">taken</span>}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <TableauPanel name="You" who="you" t={s.tableau.you} score={yourScore} on={yourTurn} sitting={youSitting} />
          <TableauPanel name="Rival" who="ai" t={s.tableau.ai} score={aiScore} on={!s.winner && s.turn === 'ai'} sitting={aiSitting} />
          <div className="panel deckbox">
            <span className="deck-l">Deck</span>
            <span className="deck-n">{s.deck.length}</span>
            <span className={'deck-flag' + (s.lastRound ? ' on' : '')}>{s.lastRound ? '★ last round' : 'last-round card in deck'}</span>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} you={yourScore} ai={aiScore} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function TableauPanel({ name, who, t, score, on, sitting }: { name: string; who: Player; t: Tableau; score: number; on: boolean; sitting: boolean }) {
  // mark the 3 best (positive) colours
  const ranked = COLORS.map(c => ({ c, n: t.colors[c], v: CL.triScore(t.colors[c]) }))
    .filter(x => x.n > 0).sort((a, b) => b.v - a.v)
  const pos = new Set(ranked.slice(0, 3).map(x => x.c))
  return (
    <div className={'panel tableau ' + who + (on ? ' on' : '')}>
      <div className="tab-head">
        <span className="tab-name">{name}</span>
        {sitting && <span className="tab-sit">sitting</span>}
        <span className="tab-score">{score}</span>
      </div>
      <div className="tab-colors">
        {ranked.length === 0 && t.plus2 === 0 && <span className="tab-empty">no cards yet</span>}
        {ranked.map(({ c, n }) => (
          <span key={c} className={'tab-col' + (pos.has(c) ? ' good' : ' bad')}>
            <span className="tab-dot" style={{ background: SWATCH[c] }} />
            <span className="tab-cn">{n}</span>
          </span>
        ))}
        {t.plus2 > 0 && <span className="tab-col plus"><span className="tab-dot p2">+2</span><span className="tab-cn">×{t.plus2}</span></span>}
      </div>
    </div>
  )
}

function ResultModal({ s, you, ai, onNew }: { s: ColorettoState; you: number; ai: number; onNew: () => void }) {
  const won = s.winner === 'you', draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : won ? 'Best palette' : 'Out-coloured'}
      title={draw ? 'A Tie' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {you}</span><span className="foe">Rival {ai}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Coloretto" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>On your turn do <b>one</b> of two things: <b>Draw</b> the top card and place it onto any row that isn't full (rows hold up to three cards), or <b>Take</b> a row — collect all its cards into your tableau and <i>sit out</i> the rest of the round.</p>
        <p>A round ends once both players have taken a row; fresh rows are dealt and play continues. When the <b>last-round</b> marker surfaces in the deck, the current round is the final one.</p>
        <p><b>Scoring:</b> your <b>three best colours score positively</b>, every other colour <b>counts against you</b>. For <i>n</i> cards of a colour the value is 1, 3, 6, 10, 15, then 21 (capped). Each <b>+2</b> card adds two flat. Highest total wins.</p>
        <p><b>Keys:</b> <kbd>D</kbd> draw · <kbd>T</kbd> take · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel.</p>
      </div>
    </Modal>
  )
}
