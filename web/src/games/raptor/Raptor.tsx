/* RAPTOR — UI (built for this codebase). An 11x9 lab-garden grid. YOU command the raptors
   (mother + babies); the AI commands the scientists. Each round you pick a card 1..9 and reveal;
   the scientists reveal simultaneously. The LOWER number acts first (a small special), the HIGHER
   number takes the full action with movement = its number. Babies escape off an edge; the mother
   eats adjacent scientists; scientists capture adjacent babies or put the mother to sleep.

   Flow: phase 'reveal' (you choose + reveal, AI picks its card), then phase 'resolve' (both cards
   shown, resolution runs on a tick), then back to 'reveal'. The AI driver re-arms on s.turn. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as R from './logic'
import type { State, Player } from './logic'

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
  const [s, setS] = useState<State>(() => R.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(R.makeGame()); setSel(null); setShowRules(false) }

  // When it's the resolve phase, run the round resolution on a tick (re-arm on s.turn).
  useAITurn(s.winner == null && s.phase === 'resolve', () => setS(p => R.resolveRound(p)), { delayMs: 850, tick: s.turn })

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  function reveal() {
    if (s.winner != null || s.phase !== 'reveal' || sel == null) return
    const aiCard = R.aiChooseCard(s)
    setS(R.revealCards(s, sel, aiCard))
    setSel(null)
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (s.winner != null || s.phase !== 'reveal') return false
      const n = Number(e.key)
      if (n >= 1 && n <= 9 && s.hands[0].includes(n)) { setSel(n); return true }
      if (e.key === 'Enter' && sel != null) { reveal(); return true }
      return false
    },
  })

  const yourTurn = s.winner == null && s.phase === 'reveal'
  const lh = R.lowerHigher(s)

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'The raptors win — the hunt is yours!' }
  else if (s.winner === 1) { bk = 'lose'; banner = 'The scientists win — the pack is contained' }
  else if (s.phase === 'resolve') { bk = 'foe'; banner = 'Cards revealed — resolving the round…' }
  else { bk = 'you'; banner = sel == null ? 'Choose an action card to reveal' : `Reveal ${sel} against the scientists` }

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

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Raptor · asymmetric hunt"
        title="Raptor"
        subtitle="lead the mother and her babies past a team of scientists — escape the edge, or eat your way free"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Round ${s.round} · ${onBoardBabies} babies loose`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>1-9 · pick &nbsp; ⏎ · reveal &nbsp; N · new</>}
      >
        <div className="rp-wrap">
          <div className="rp-board">{cells}</div>
        </div>

        <div className="rp-side">
          <div className="panel rp-score">
            <div className={'rp-row' + (yourTurn ? ' on' : '')}>
              <span className="rp-dot you" />
              <span className="rp-who">You · Raptors</span>
              <span className="rp-obj">esc {s.babiesEscaped}/3 · eat {s.scientistsEaten}/3</span>
            </div>
            <div className={'rp-row' + (s.phase === 'resolve' && s.winner == null ? ' on' : '')}>
              <span className="rp-dot foe" />
              <span className="rp-who">AI · Scientists</span>
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
              <div className={'rp-revcard you' + (lh && lh.high === 0 ? ' high' : '')}>
                <span className="v">{s.revealed[0] != null ? s.revealed[0] : '·'}</span>
                <span className="w">you</span>
              </div>
              <span className="rp-vs">vs</span>
              <div className={'rp-revcard foe' + (lh && lh.high === 1 ? ' high' : '')}>
                <span className="v">{s.revealed[1] != null ? s.revealed[1] : '·'}</span>
                <span className="w">sci</span>
              </div>
            </div>
            {s.phase === 'resolve' && lh && (
              <div className="rp-resolve-note">
                Lower (<b>{lh.lowCard}</b>) takes the special; higher (<b>{lh.highCard}</b>) acts with {lh.highCard} points.
              </div>
            )}
            {s.phase === 'reveal' && s.winner == null && (
              <div className="rp-resolve-note">Play HIGH to power your move — but the low card always acts first.</div>
            )}
          </div>

          <div className="panel">
            <div className="rp-hand-l">your hand</div>
            <div className="rp-hand">
              {R.freshOrder(s.hands[0]).map(n => {
                const have = s.hands[0].includes(n)
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
              <button className="rp-btn" disabled={!yourTurn || sel == null} onClick={reveal}>Reveal</button>
            </div>
            <div className="rp-hint">
              {s.winner != null ? 'game over — new game to play again'
                : s.phase === 'resolve' ? 'watching the round play out…'
                : 'pick a card 1-9, then reveal against the scientists'}
            </div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal winner={s.winner} state={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ winner, state, onNew }: { winner: Player; state: State; onNew: () => void }) {
  const won = winner === 0
  return (
    <Modal
      eyebrow={won ? 'The pack runs free' : 'Containment achieved'}
      title={won ? 'Raptors Win' : 'Scientists Win'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        {won
          ? <span className="you">{state.babiesEscaped >= 3 ? `${state.babiesEscaped} babies escaped the garden` : `the mother ate ${state.scientistsEaten} scientists`}</span>
          : <span className="foe">{state.motherAsleep ? 'the mother was put to sleep' : `all ${state.babiesCaptured} babies were captured`}</span>}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Raptor" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin the hunt</button>}>
      <div className="modal-body">
        <p>You command the <b>raptors</b>: one strong <b>mother</b> 🦖 who can <b>eat</b> adjacent scientists, and four fast, fragile <b>babies</b> 🥚 who want to <b>escape</b> off any board edge. The AI commands a team of <b>scientists</b> 🥽.</p>
        <p>Each round <b>both sides reveal one card</b> numbered 1–9 at the same time. The side with the <b>lower</b> number acts first but only gets a small <b>special</b> step; the side with the <b>higher</b> number performs the full action with <b>movement points = its number</b>. So play <b>high</b> to power a big move — but remember the low card still moves first.</p>
        <p><b>You win</b> if <b>3 babies escape</b> off an edge, or the mother <b>eats 3 scientists</b>.</p>
        <p>The <b>scientists win</b> if they <b>capture every baby</b> (a scientist adjacent to a baby sleeps it) or put the <b>mother to sleep</b> (two scientists adjacent to her).</p>
        <p><b>Keys:</b> <kbd>1-9</kbd> pick a card · <kbd>Enter</kbd> reveal · <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
