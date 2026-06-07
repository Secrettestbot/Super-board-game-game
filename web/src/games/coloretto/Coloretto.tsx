/* COLORETTO — UI (built for this codebase). A bright, friendly colour-card game on the
   shared framework shell, vs a greedy heuristic AI. On your turn: DRAW the top card then
   click a row to place it, or TAKE a row to collect its cards and sit out the round. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { colorettoAdapter } from './net'
import * as CL from './logic'
import type { Card, Color, Player, Tableau } from './logic'

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

const SEAT_PLAYER: Player[] = ['you', 'ai']

export function Coloretto() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(colorettoAdapter)
  const me: Player = SEAT_PLAYER[mySeat] ?? 'you'
  const opp: Player = me === 'you' ? 'ai' : 'you'
  const [showRules, setShowRules] = useState(false)
  const [mode, setMode] = useState<'idle' | 'flipping' | 'taking'>('idle')

  function newGame() { netNew(); setShowRules(false); setMode('idle') }

  const yourTurn = !s.winner && isMyTurn && !s.done[me]
  const canFlip = CL.legalDraw(s, me)
  const takeRows = useMemo(() => new Set(CL.legalTakeRows(s, me)), [s, me])

  // "Flip" is atomic: you pick a row, the host draws the top card and places it there.
  // Eligible rows are the open (not-full, not-taken) ones; legalDraw guarantees >=1 exists.
  const flipTargets = useMemo(
    () => new Set(canFlip ? s.rows.map((_, r) => r).filter(r => CL.rowOpen(s, r)) : []),
    [s, canFlip],
  )
  const activeMode = mode

  function clickRow(r: number) {
    if (!yourTurn) return
    if (activeMode === 'flipping' && flipTargets.has(r)) { dispatch({ kind: 'flip', column: r }); setMode('idle'); return }
    if (activeMode === 'taking' && takeRows.has(r)) { dispatch({ kind: 'take', column: r }); setMode('idle'); return }
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setMode('idle') },
    extra: (e) => {
      if (!yourTurn) return
      if (e.key === 'd' || e.key === 'D' || e.key === 'f' || e.key === 'F') { if (canFlip) setMode(m => m === 'flipping' ? 'idle' : 'flipping'); return true }
      if (e.key === 't' || e.key === 'T') { if (takeRows.size) setMode(m => m === 'taking' ? 'idle' : 'taking'); return true }
      return false
    },
  })

  const yourScore = CL.scoreTableau(s.tableau[me])
  const oppScore = CL.scoreTableau(s.tableau[opp])
  const oppName = net.online ? 'Opponent' : 'Rival'

  const myWin = s.winner === me
  const oppWin = s.winner === opp

  let banner: string, bk = ''
  if (myWin) { bk = 'win'; banner = `You win — ${yourScore} to ${oppScore}` }
  else if (oppWin) { bk = 'lose'; banner = `${oppName} wins — ${oppScore} to ${yourScore}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${yourScore}–${oppScore}` }
  else if (s.done[me] && isMyTurn) { bk = 'foe'; banner = 'You sat out — waiting for the round to end…' }
  else if (activeMode === 'flipping') { bk = 'you'; banner = 'Flip onto a row — click an open row' }
  else if (activeMode === 'taking') { bk = 'you'; banner = 'Take a row — click a stack to collect it' }
  else if (yourTurn) { bk = 'you'; banner = 'Your move — Flip a card or Take a row' }
  else { bk = 'foe'; banner = `${oppName} is ${net.online ? 'deciding' : 'thinking'}…` }

  const youSitting = s.done[me] && !s.winner
  const oppSitting = s.done[opp] && !s.winner

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
        modeRight={<>F · flip &nbsp; T · take &nbsp; N · new</>}
      >
        <div className="cl-wrap">
          <div className="cl-pending">
            <div className="cl-actions">
              <button className={'cl-btn draw' + (activeMode === 'flipping' ? ' armed' : '')} disabled={!canFlip || !yourTurn} onClick={() => setMode(m => m === 'flipping' ? 'idle' : 'flipping')}>
                {activeMode === 'flipping' ? 'Pick a row…' : 'Flip a card'}
              </button>
              <button className={'cl-btn take' + (activeMode === 'taking' ? ' armed' : '')} disabled={takeRows.size === 0 || !yourTurn} onClick={() => setMode(m => m === 'taking' ? 'idle' : 'taking')}>
                {activeMode === 'taking' ? 'Pick a row…' : 'Take a row'}
              </button>
            </div>
          </div>

          <div className="cl-rows">
            {s.rows.map((row, r) => {
              const hl = (activeMode === 'flipping' && flipTargets.has(r)) || (activeMode === 'taking' && takeRows.has(r))
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
          <div className="panel"><OnlineBar net={net} /></div>
          <TableauPanel name="You" who="you" t={s.tableau[me]} score={yourScore} on={yourTurn} sitting={youSitting} />
          <TableauPanel name={oppName} who="ai" t={s.tableau[opp]} score={oppScore} on={!s.winner && s.turn === opp} sitting={oppSitting} />
          <div className="panel deckbox">
            <span className="deck-l">Deck</span>
            <span className="deck-n">{s.deck.length}</span>
            <span className={'deck-flag' + (s.lastRound ? ' on' : '')}>{s.lastRound ? '★ last round' : 'last-round card in deck'}</span>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={myWin} draw={s.winner === 'draw'} oppName={oppName} you={yourScore} opp={oppScore} onNew={newGame} />}
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

function ResultModal({ won, draw, oppName, you, opp, onNew }: { won: boolean; draw: boolean; oppName: string; you: number; opp: number; onNew: () => void }) {
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : won ? 'Best palette' : 'Out-coloured'}
      title={draw ? 'A Tie' : won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {you}</span><span className="foe">{oppName} {opp}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Coloretto" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>On your turn do <b>one</b> of two things: <b>Flip</b> — pick a row that isn't full (rows hold up to three cards) and the top card is turned face-up onto it, or <b>Take</b> a row — collect all its cards into your tableau and <i>sit out</i> the rest of the round.</p>
        <p>A round ends once both players have taken a row; fresh rows are dealt and play continues. When the <b>last-round</b> marker surfaces in the deck, the current round is the final one.</p>
        <p><b>Scoring:</b> your <b>three best colours score positively</b>, every other colour <b>counts against you</b>. For <i>n</i> cards of a colour the value is 1, 3, 6, 10, 15, then 21 (capped). Each <b>+2</b> card adds two flat. Highest total wins.</p>
        <p><b>Keys:</b> <kbd>F</kbd> flip · <kbd>T</kbd> take · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel.</p>
      </div>
    </Modal>
  )
}
