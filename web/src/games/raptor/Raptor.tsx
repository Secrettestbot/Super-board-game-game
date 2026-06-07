/* RAPTOR — UI (built for this codebase). An 11x9 lab-garden grid. Asymmetric two-player:
   one seat commands the RAPTORS (mother + babies), the other the SCIENTISTS. In solo play you
   are the raptors (seat 0) and the AI runs the scientists (seat 1). Online, a guest can take the
   opposite seat and play the scientists against you. Each round you pick a card 1..9 and play it;
   the other side plays one simultaneously (hidden). The LOWER number acts first (a small special),
   the HIGHER number takes the full action with movement = its number.

   The simultaneous reveal is modelled by the net adapter as two sequential hidden plays: when it
   is your turn you pick + play a card; once both sides have played, the round resolves at once.
   The AI driver (host authority) fills any seat that has no human. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { raptorAdapter } from './net'
import * as R from './logic'
import type { State } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#16241b" stroke="#2e4d39" strokeWidth="1.5" />
    <path d="M14 33 q3 -13 12 -16 q-4 6 -2 10 q5 -2 9 1 q-6 1 -7 6 q-2 4 -8 3 z" fill="#ff7a4d" stroke="#c24a23" strokeWidth="1" />
    <circle cx="20" cy="22" r="1.6" fill="#0e1712" />
    <circle cx="34" cy="34" r="3.2" fill="#ffd470" stroke="#c8941f" strokeWidth="1" />
  </svg>
)

function pieceGlyph(kind: R.PieceKind, asleep: boolean): string {
  if (kind === 'mother') return asleep ? '💤' : '🦖'
  if (kind === 'baby') return '🥚'
  return '🥽'
}

export function Raptor() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(raptorAdapter)
  const amRaptors = mySeat === 0 // seat 0 = raptors, seat 1 = scientists
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  const yourTurn = s.winner == null && isMyTurn
  const myHand = s.hands[mySeat]

  function play() {
    if (!yourTurn || sel == null) return
    dispatch({ kind: 'play', cardId: sel })
    setSel(null)
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (!yourTurn) return false
      const n = Number(e.key)
      if (n >= 1 && n <= 9 && myHand.includes(n)) { setSel(n); return true }
      if (e.key === 'Enter' && sel != null) { play(); return true }
      return false
    },
  })

  const lh = R.lowerHigher(s)
  const oppLabel = net.online ? 'Opponent' : 'AI'

  // Result is relative to MY seat.
  const iWon = s.winner != null && s.winner === mySeat
  let banner: string, bk = ''
  if (s.winner != null) {
    bk = iWon ? 'win' : 'lose'
    banner = iWon
      ? (amRaptors ? 'You win — the hunt is yours!' : 'You win — the pack is contained')
      : (amRaptors ? `${oppLabel} wins — the pack is contained` : `${oppLabel} wins — the hunt is theirs`)
  } else if (yourTurn) {
    bk = 'you'
    banner = sel == null ? 'Choose an action card to play' : `Play ${sel} (the other side plays at the same time)`
  } else {
    bk = 'foe'
    banner = net.online ? `${oppLabel} is choosing a card…` : 'The other side is choosing…'
  }

  // grid render
  const cells: React.ReactNode[] = []
  for (let r = 0; r < s.rows; r++) {
    for (let c = 0; c < s.cols; c++) {
      const p = R.pieceAt(s, r, c)
      const edge = R.isEdge(s, r, c)
      const alt = (r + c) % 2 === 1
      cells.push(
        <div key={r * s.cols + c} className={'rp-cell' + (alt ? ' alt' : '') + (edge ? ' edge' : '')}>
          {p && (
            <div className={'rp-piece ' + p.kind + (p.kind === 'mother' && s.motherAsleep ? ' asleep' : '')}>
              {pieceGlyph(p.kind, s.motherAsleep)}
            </div>
          )}
        </div>
      )
    }
  }

  const onBoardBabies = R.babies(s).length
  const raptorLabel = amRaptors ? 'You · Raptors' : `${oppLabel} · Raptors`
  const sciLabel = amRaptors ? `${oppLabel} · Scientists` : 'You · Scientists'

  // My revealed card vs the opponent's: the opponent's parked card is redacted to 0 (hidden)
  // until the round resolves; show a placeholder dot for any non-visible / unset card.
  const myRev = s.revealed[mySeat]
  const oppRev = s.revealed[1 - mySeat]
  const showCard = (v: number | null | undefined) => (v != null && v !== 0 ? v : '·')

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Raptor · asymmetric hunt"
        title="Raptor"
        subtitle={amRaptors
          ? 'lead the mother and her babies past a team of scientists — escape the edge, or eat your way free'
          : 'command the scientists — capture every baby or put the mother to sleep'}
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Round ${s.round} · ${onBoardBabies} babies loose`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>1-9 · pick &nbsp; ⏎ · play &nbsp; N · new</>}
      >
        <div className="rp-wrap">
          <div className="rp-board">{cells}</div>
        </div>

        <div className="rp-side">
          <div className="panel"><OnlineBar net={net} /></div>

          <div className="panel rp-score">
            <div className={'rp-row' + (yourTurn && amRaptors ? ' on' : '')}>
              <span className="rp-dot you" />
              <span className="rp-who">{raptorLabel}</span>
              <span className="rp-obj">esc {s.babiesEscaped}/3 · eat {s.scientistsEaten}/3</span>
            </div>
            <div className={'rp-row' + (yourTurn && !amRaptors ? ' on' : '')}>
              <span className="rp-dot foe" />
              <span className="rp-who">{sciLabel}</span>
              <span className="rp-obj">cap {s.babiesCaptured}/4 · sleep {s.motherAsleep ? '1' : '0'}/1</span>
            </div>
            <div className="rp-goals">
              <div className="rp-goal"><span className="lab">Escaped</span><span className="num">{s.babiesEscaped}</span></div>
              <div className="rp-goal"><span className="lab">Eaten</span><span className="num">{s.scientistsEaten}</span></div>
              <div className="rp-goal"><span className="lab">Captured</span><span className="num foe">{s.babiesCaptured}</span></div>
            </div>
          </div>

          <div className="panel rp-reveal">
            <div className="rp-hand-l">the table</div>
            <div className="rp-reveal-row">
              <div className={'rp-revcard you' + (lh && lh.high === mySeat ? ' high' : '')}>
                <span className="v">{showCard(myRev)}</span>
                <span className="w">you</span>
              </div>
              <span className="rp-vs">vs</span>
              <div className={'rp-revcard foe' + (lh && lh.high === (1 - mySeat) ? ' high' : '')}>
                <span className="v">{showCard(oppRev)}</span>
                <span className="w">{amRaptors ? 'sci' : 'rap'}</span>
              </div>
            </div>
            {s.phase === 'resolve' && lh && (
              <div className="rp-resolve-note">
                Lower (<b>{lh.lowCard}</b>) takes the special; higher (<b>{lh.highCard}</b>) acts with {lh.highCard} points.
              </div>
            )}
            {s.winner == null && s.phase === 'reveal' && (
              <div className="rp-resolve-note">Play HIGH to power your move — but the low card always acts first.</div>
            )}
          </div>

          <div className="panel">
            <div className="rp-hand-l">your hand</div>
            <div className="rp-hand">
              {R.freshOrder(myHand).map(n => {
                const have = myHand.includes(n)
                return (
                  <div
                    key={n}
                    className={'rp-card' + (sel === n ? ' sel' : '') + (!have || !yourTurn ? ' disabled' : '')}
                    onClick={have && yourTurn ? () => setSel(n) : undefined}
                  >{n}</div>
                )
              })}
            </div>
            <div className="rp-actions">
              <button className="rp-btn" disabled={!yourTurn || sel == null} onClick={play}>Play</button>
            </div>
            <div className="rp-hint">
              {s.winner != null ? 'game over — new game to play again'
                : !yourTurn ? 'waiting for the other side…'
                : 'pick a card 1-9, then play it'}
            </div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={iWon} amRaptors={amRaptors} oppLabel={oppLabel} state={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, amRaptors, oppLabel, state, onNew }: { won: boolean; amRaptors: boolean; oppLabel: string; state: State; onNew: () => void }) {
  // Describe what actually happened (raptor-cause vs scientist-cause), then frame as win/loss for me.
  const raptorsWon = state.winner === 0
  const detail = raptorsWon
    ? (state.babiesEscaped >= 3 ? `${state.babiesEscaped} babies escaped the garden` : `the mother ate ${state.scientistsEaten} scientists`)
    : (state.motherAsleep ? 'the mother was put to sleep' : `all ${state.babiesCaptured} babies were captured`)
  const eyebrow = won
    ? (amRaptors ? 'The pack runs free' : 'Containment achieved')
    : (amRaptors ? 'Containment achieved' : 'The pack runs free')
  return (
    <Modal
      eyebrow={eyebrow}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className={won ? 'you' : 'foe'}>{detail}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Raptor" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin the hunt</button>}>
      <div className="modal-body">
        <p>You command the <b>raptors</b>: one strong <b>mother</b> 🦖 who can <b>eat</b> adjacent scientists, and four fast, fragile <b>babies</b> 🥚 who want to <b>escape</b> off any board edge. The other side commands a team of <b>scientists</b> 🥽 (solo: an AI; online: a second player).</p>
        <p>Each round <b>both sides play one card</b> numbered 1–9 from a private hand, at the same time. The side with the <b>lower</b> number acts first but only gets a small <b>special</b> step; the side with the <b>higher</b> number performs the full action with <b>movement points = its number</b>. So play <b>high</b> to power a big move — but remember the low card still moves first.</p>
        <p>The <b>raptors win</b> if <b>3 babies escape</b> off an edge, or the mother <b>eats 3 scientists</b>.</p>
        <p>The <b>scientists win</b> if they <b>capture every baby</b> (a scientist adjacent to a baby sleeps it) or put the <b>mother to sleep</b> (two scientists adjacent to her).</p>
        <p><b>Keys:</b> <kbd>1-9</kbd> pick a card · <kbd>Enter</kbd> play · <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
