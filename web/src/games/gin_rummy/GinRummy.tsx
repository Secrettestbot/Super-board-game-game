/* GIN RUMMY — UI (built for this codebase). A speakeasy card table: you vs a
   heuristic AI. Your sorted hand highlights melds vs deadwood; stock + discard
   piles sit center; draw / discard / knock / gin controls live in the side rail.
   The AI takes its whole turn (draw THEN discard) in one onStep, so the useAITurn
   tick is just s.step. End state is shown by default via the result modal. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as G from './logic'
import type { GinState, Card, Meld } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#10241b" stroke="#27513c" strokeWidth="1.5" />
    <rect x="13" y="11" width="16" height="22" rx="3" fill="#f3ecd6" stroke="#caa86f" strokeWidth="1" transform="rotate(-9 21 22)" />
    <rect x="19" y="14" width="16" height="22" rx="3" fill="#f3ecd6" stroke="#caa86f" strokeWidth="1" transform="rotate(8 27 25)" />
    <path d="M27 19 l2 4 4 .4 -3 2.8 1 4-4-2.4-4 2.4 1-4-3-2.8 4-.4z" fill="#d8b15a" />
  </svg>
)

/** One playing card. */
function CardView({
  card, faceUp = true, selected, melded, deadwood, dim, onClick, small,
}: {
  card?: Card
  faceUp?: boolean
  selected?: boolean
  melded?: 'set' | 'run' | null
  deadwood?: boolean
  dim?: boolean
  onClick?: () => void
  small?: boolean
}) {
  if (!card || !faceUp) {
    return (
      <div className={'gr-card back' + (small ? ' small' : '') + (dim ? ' dim' : '')}>
        <div className="gr-back-motif" />
      </div>
    )
  }
  const red = G.isRed(card.suit)
  const cls = [
    'gr-card', 'face',
    small ? 'small' : '',
    red ? 'red' : 'black',
    selected ? 'sel' : '',
    melded ? 'meld ' + melded : '',
    deadwood ? 'dead' : '',
    onClick ? 'click' : '',
  ].filter(Boolean).join(' ')
  return (
    <div className={cls} onClick={onClick}>
      <span className="gr-corner tl">{G.RANK_LABEL[card.rank]}<i>{G.SUIT_SYMBOL[card.suit]}</i></span>
      <span className="gr-pip">{G.SUIT_SYMBOL[card.suit]}</span>
      <span className="gr-corner br">{G.RANK_LABEL[card.rank]}<i>{G.SUIT_SYMBOL[card.suit]}</i></span>
    </div>
  )
}

/** Sort a hand so melds cluster and read left→right; deadwood trails by value. */
function organize(hand: Card[]): { card: Card; melded: 'set' | 'run' | null }[] {
  const r = G.bestMelds(hand)
  const tag = new Map<number, 'set' | 'run'>()
  const order: Card[] = []
  for (const m of r.melds) { for (const c of m.cards) tag.set(c.id, m.kind) ; order.push(...sortMeld(m)) }
  const dead = r.deadwoodCards.slice().sort((a, b) => G.cardValue(a) - G.cardValue(b) || a.suit.localeCompare(b.suit))
  order.push(...dead)
  return order.map((c) => ({ card: c, melded: tag.get(c.id) ?? null }))
}
function sortMeld(m: Meld): Card[] {
  if (m.kind === 'run') return m.cards.slice().sort((a, b) => a.rank - b.rank)
  return m.cards.slice()
}

export function GinRummy() {
  const [s, setS] = useState<GinState>(() => G.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(G.makeGame()); setSel(null); setShowRules(false) }
  function continueRound() { setS((p) => G.nextRound(p)); setSel(null) }

  // The AI plays its whole turn in one step; re-arm on s.step.
  const aiActive = s.winner == null && s.turn === 'ai' && s.phase !== 'roundOver' && s.phase !== 'gameOver'
  useAITurn(aiActive, () => setS((p) => G.aiTurn(p)), { delayMs: 720, tick: s.step })

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  const yourTurn = s.winner == null && s.turn === 'you' && s.phase !== 'roundOver' && s.phase !== 'gameOver'

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => { setShowRules(false); setSel(null) },
    extra: (e) => {
      if (!yourTurn) return false
      if (s.phase === 'draw') {
        if (e.key === 's' || e.key === 'S') { setS(G.drawStock(s)); return true }
        if (e.key === 'd' || e.key === 'D') { if (G.topDiscard(s)) setS(G.drawDiscard(s)); return true }
      }
      return false
    },
  })

  const meldInfo = G.bestMelds(s.you)
  const dead = meldInfo.deadwoodValue
  const handFull = s.you.length === G.HAND_SIZE

  function doDraw(from: 'stock' | 'discard') {
    if (!yourTurn || s.phase !== 'draw') return
    setS(from === 'stock' ? G.drawStock(s) : G.drawDiscard(s))
    setSel(null)
  }
  function doDiscard(knock: boolean) {
    if (!yourTurn || s.phase !== 'discard' || sel == null) return
    setS(G.discard(s, sel, knock))
    setSel(null)
  }

  // When holding 11 cards (discard phase), preview deadwood if we drop the selected card.
  let previewDead: number | null = null
  let previewGin = false
  if (s.phase === 'discard' && yourTurn && sel != null) {
    const rest = s.you.filter((c) => c.id !== sel)
    previewDead = G.deadwoodOf(rest)
    previewGin = previewDead === 0
  }
  const previewKnock = previewDead != null && previewDead <= 10

  // banner
  let banner = '', bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = `You win the match ${s.scores.you}–${s.scores.ai}!` }
  else if (s.winner === 'ai') { bk = 'lose'; banner = `The house wins ${s.scores.ai}–${s.scores.you}.` }
  else if (s.phase === 'roundOver' && s.round) {
    bk = s.round.scorer === 'you' ? 'win' : s.round.scorer === 'ai' ? 'lose' : ''
    banner = roundBanner(s)
  } else if (yourTurn) {
    bk = 'you'
    banner = s.phase === 'draw' ? 'Your turn — draw from stock or discard' : `Discard a card${dead <= 10 ? ' · or knock' : ''}`
  } else { bk = 'foe'; banner = 'The rival is playing their turn…' }

  const top = G.topDiscard(s)
  const organized = organize(s.you)

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Gin Rummy · sets & runs"
        title="Gin Rummy"
        subtitle="meld your hand into sets and runs, shed the deadwood, and knock before the rival — first to 100 takes the night"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`You ${s.scores.you} · Rival ${s.scores.ai} — race to ${G.TARGET}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>s · stock &nbsp; d · discard &nbsp; N · new</>}
      >
        <div className="gr-table">
          {/* rival */}
          <div className="gr-seat foe">
            <div className="gr-seat-label"><span className="gr-dot foe" /> Rival<span className="gr-meta">{s.ai.length} cards</span></div>
            <div className="gr-hand foe">
              {s.ai.map((c, i) => (
                <div key={c.id} className="gr-slot" style={{ ['--i' as any]: i }}>
                  <CardView card={c} faceUp={s.winner != null || s.phase === 'roundOver'} small />
                </div>
              ))}
            </div>
          </div>

          {/* center: stock + discard */}
          <div className="gr-center">
            <div className="gr-pile">
              <div className="gr-pile-label">Stock · {s.stock.length}</div>
              <div
                className={'gr-pilecard' + (yourTurn && s.phase === 'draw' && s.stock.length ? ' draw' : '')}
                onClick={() => doDraw('stock')}
              >
                {s.stock.length ? <CardView faceUp={false} /> : <div className="gr-empty">empty</div>}
              </div>
            </div>
            <div className="gr-pile">
              <div className="gr-pile-label">Discard</div>
              <div
                className={'gr-pilecard' + (yourTurn && s.phase === 'draw' && top ? ' draw' : '')}
                onClick={() => doDraw('discard')}
              >
                {top ? <CardView card={top} /> : <div className="gr-empty">empty</div>}
              </div>
            </div>
          </div>

          {/* you */}
          <div className="gr-seat you">
            <div className="gr-seat-label">
              <span className="gr-dot you" /> You
              <span className="gr-meta">
                deadwood <b className={dead === 0 ? 'gin' : dead <= 10 ? 'ok' : 'hi'}>{dead}</b>
                {dead === 0 && handFull ? ' · GIN' : dead <= 10 && handFull ? ' · can knock' : ''}
              </span>
            </div>
            <div className="gr-hand you">
              {organized.map(({ card, melded }, i) => {
                const isSel = sel === card.id
                const selectable = yourTurn && s.phase === 'discard'
                return (
                  <div key={card.id} className="gr-slot" style={{ ['--i' as any]: i }}>
                    <CardView
                      card={card}
                      melded={melded}
                      deadwood={!melded}
                      selected={isSel}
                      onClick={selectable ? () => setSel(isSel ? null : card.id) : undefined}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="side">
          {/* scoreboard */}
          <div className="panel gr-score">
            <div className={'gr-srow' + (yourTurn ? ' on' : '')}>
              <span className="gr-dot you" /><span className="gr-sname">You</span>
              <span className="gr-spts">{s.scores.you}</span>
            </div>
            <div className={'gr-srow' + (s.turn === 'ai' && s.winner == null ? ' on' : '')}>
              <span className="gr-dot foe" /><span className="gr-sname">Rival</span>
              <span className="gr-spts">{s.scores.ai}</span>
            </div>
            <div className="gr-target">first to {G.TARGET}</div>
          </div>

          {/* control */}
          <div className="panel gr-control">
            {s.phase === 'roundOver' && (
              <button className="gr-btn primary wide" onClick={s.winner ? newGame : continueRound}>
                {s.winner ? 'New match' : 'Deal next hand'}
              </button>
            )}

            {yourTurn && s.phase === 'draw' && (
              <>
                <div className="gr-hint">Draw to begin your turn.</div>
                <div className="gr-btnrow">
                  <button className="gr-btn" disabled={!s.stock.length} onClick={() => doDraw('stock')}>Draw stock</button>
                  <button className="gr-btn" disabled={!top} onClick={() => doDraw('discard')}>
                    Take {top ? G.cardLabel(top) : '—'}
                  </button>
                </div>
              </>
            )}

            {yourTurn && s.phase === 'discard' && (
              <>
                <div className="gr-hint">
                  {sel == null
                    ? 'Pick a card to discard.'
                    : previewGin
                      ? <>Drop leaves <b className="gin">GIN</b> — go gin!</>
                      : previewKnock
                        ? <>Drop leaves deadwood <b className="ok">{previewDead}</b> — you may knock.</>
                        : <>Drop leaves deadwood <b className="hi">{previewDead}</b> — too high to knock.</>}
                </div>
                <div className="gr-btnrow">
                  <button className="gr-btn" disabled={sel == null} onClick={() => doDiscard(false)}>Discard</button>
                  <button className="gr-btn knock" disabled={sel == null || !previewKnock} onClick={() => doDiscard(true)}>
                    {previewGin ? 'Gin!' : 'Knock'}
                  </button>
                </div>
              </>
            )}

            {!yourTurn && s.winner == null && s.phase !== 'roundOver' && (
              <div className="gr-hint">The rival is deciding…</div>
            )}
          </div>

          {/* log */}
          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {(s.phase === 'roundOver' || s.winner != null) && s.round && (
        <RoundModal s={s} onContinue={s.winner ? newGame : continueRound} />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function roundBanner(s: GinState): string {
  const r = s.round!
  if (r.kind === 'wash') return 'Stock exhausted — the hand washes. Deal again.'
  const who = r.by === 'you' ? 'You' : 'Rival'
  if (r.kind === 'gin') return `${who} went gin — +${r.points}.`
  if (r.kind === 'undercut') {
    const sc = r.scorer === 'you' ? 'You' : 'Rival'
    return `Undercut! ${sc} score +${r.points}.`
  }
  const sc = r.scorer === 'you' ? 'You' : 'Rival'
  return `${who} knocked — ${sc} score +${r.points}.`
}

function RoundModal({ s, onContinue }: { s: GinState; onContinue: () => void }) {
  const r = s.round!
  const matchOver = s.winner != null
  const youWonMatch = s.winner === 'you'
  const title = matchOver ? (youWonMatch ? 'You Win the Match' : 'The House Wins') : roundTitle(r)
  const eyebrow = matchOver ? (youWonMatch ? 'Cleaned them out' : 'Out of chips') : r.kind === 'wash' ? 'No score' : 'Hand over'
  return (
    <Modal
      eyebrow={eyebrow}
      title={title}
      closeOnOverlay={!matchOver}
      onClose={matchOver ? undefined : onContinue}
      actions={<button className="btn-modal" onClick={onContinue}>{matchOver ? 'Play again' : 'Next hand'}</button>}
    >
      <div className="modal-body">
        <div className="gr-result-grid">
          <div className="gr-rcol">
            <div className="gr-rname you">You</div>
            <div className="gr-rdead">deadwood {r.youDead}</div>
          </div>
          <div className="gr-rvs">{r.points >= 0 ? `+${r.points}` : r.points}</div>
          <div className="gr-rcol">
            <div className="gr-rname foe">Rival</div>
            <div className="gr-rdead">deadwood {r.aiDead}</div>
          </div>
        </div>
        <div className="gr-rscore">Match: <b className="you">{s.scores.you}</b> — <b className="foe">{s.scores.ai}</b> (to {G.TARGET})</div>
        {r.layoffs.length > 0 && (
          <div className="gr-rlay">Laid off: {r.layoffs.map((c) => G.cardLabel(c)).join('  ')}</div>
        )}
      </div>
    </Modal>
  )
}
function roundTitle(r: NonNullable<GinState['round']>): string {
  if (r.kind === 'gin') return r.by === 'you' ? 'Gin!' : 'Rival Gin'
  if (r.kind === 'undercut') return 'Undercut'
  if (r.kind === 'wash') return 'Wash'
  return r.by === 'you' ? 'You Knocked' : 'Rival Knocked'
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Gin Rummy" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Deal me in</button>}>
      <div className="modal-body">
        <p>You hold ten cards. On each turn, <b>draw</b> the top of the stock or the discard pile, then <b>discard</b> one card.</p>
        <p>Form your cards into <b>melds</b>: <i>sets</i> (3–4 of a rank) and <i>runs</i> (3+ in sequence, one suit). Cards in no meld are <b>deadwood</b> — A=1, faces=10, others their pip value.</p>
        <p>When your deadwood after discarding is <b>10 or less</b> you may <b>knock</b>; at <b>0</b> you go <b>gin</b>. On a knock, the rival lays off deadwood onto your melds, then deadwood is compared. Knock for less → score the difference. Rival ties or beats you → <b>undercut</b> (+25). <b>Gin</b> scores their full deadwood +25.</p>
        <p>First to <b>100</b> points across hands wins the match.</p>
        <p><b>Keys:</b> <kbd>S</kbd> draw stock · <kbd>D</kbd> take discard · click a card then <kbd>Discard</kbd>/<kbd>Knock</kbd> · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
