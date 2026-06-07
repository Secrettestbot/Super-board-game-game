/* GIN RUMMY — UI (built for this codebase). A speakeasy card table: you vs a
   heuristic AI, or a friend online. Your sorted hand highlights melds vs deadwood;
   stock + discard piles sit center; draw / discard / knock / gin controls live in the
   side rail.

   Online-capable via useGameSession(ginRummyAdapter): the hook drives the AI for any
   empty seat (no local useAITurn) and, when online, redacts the opponent's private
   hand and the face-down stock so they never reach you. Everything below is rendered
   relative to mySeat — "your" hand, score, deadwood and the result banner are always
   yours, and the other side is the rival (the "Opponent" when online). The host deals
   each next hand via a {kind:'next'} intent. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { ginRummyAdapter } from './net'
import * as G from './logic'
import type { GinState, Card, Meld, Who } from './logic'

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
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(ginRummyAdapter)

  // Seat-relative sides: seat 0 = the 'you' side, seat 1 = the 'ai' side.
  const me: Who = mySeat === 0 ? 'you' : 'ai'
  const opp: Who = me === 'you' ? 'ai' : 'you'
  const myHand = me === 'you' ? s.you : s.ai
  const oppHand = me === 'you' ? s.ai : s.you
  const myScore = s.scores[me]
  const oppScore = s.scores[opp]
  const oppLabel = net.online ? 'Opponent' : 'Rival'

  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setSel(null); setShowRules(false) }
  function continueRound() { dispatch({ kind: 'next' }); setSel(null) }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  const roundEnded = s.phase === 'roundOver' || s.phase === 'gameOver'
  const yourTurn = s.winner == null && !roundEnded && isMyTurn

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => { setShowRules(false); setSel(null) },
    extra: (e) => {
      if (!yourTurn) return false
      if (s.phase === 'draw') {
        if (e.key === 's' || e.key === 'S') { doDraw('stock'); return true }
        if (e.key === 'd' || e.key === 'D') { if (G.topDiscard(s)) doDraw('discard'); return true }
      }
      return false
    },
  })

  const meldInfo = G.bestMelds(myHand)
  const dead = meldInfo.deadwoodValue
  const handFull = myHand.length === G.HAND_SIZE

  function doDraw(from: 'stock' | 'discard') {
    if (!yourTurn || s.phase !== 'draw') return
    dispatch({ kind: 'draw', source: from })
    setSel(null)
  }
  function doDiscard(knock: boolean) {
    if (!yourTurn || s.phase !== 'discard' || sel == null) return
    const previewDeadVal = G.deadwoodOf(myHand.filter((c) => c.id !== sel))
    if (knock) dispatch({ kind: previewDeadVal === 0 ? 'gin' : 'knock', cardId: sel })
    else dispatch({ kind: 'discard', cardId: sel })
    setSel(null)
  }

  // When holding 11 cards (discard phase), preview deadwood if we drop the selected card.
  let previewDead: number | null = null
  let previewGin = false
  if (s.phase === 'discard' && yourTurn && sel != null) {
    const rest = myHand.filter((c) => c.id !== sel)
    previewDead = G.deadwoodOf(rest)
    previewGin = previewDead === 0
  }
  const previewKnock = previewDead != null && previewDead <= 10

  // round result, relative to my seat
  const r = s.round
  const iScored = r?.scorer === me
  const oppScored = r != null && r.scorer === opp
  const iKnocked = r?.by === me

  // banner
  let banner = '', bk = ''
  if (s.winner === me) { bk = 'win'; banner = `You win the match ${myScore}–${oppScore}!` }
  else if (s.winner === opp) { bk = 'lose'; banner = `${oppLabel} wins the match ${oppScore}–${myScore}.` }
  else if (s.phase === 'roundOver' && r) {
    bk = iScored ? 'win' : oppScored ? 'lose' : ''
    banner = roundBanner(r, me, oppLabel)
  } else if (yourTurn) {
    bk = 'you'
    banner = s.phase === 'draw' ? 'Your turn — draw from stock or discard' : `Discard a card${dead <= 10 ? ' · or knock' : ''}`
  } else { bk = 'foe'; banner = net.online ? `Waiting for the ${oppLabel.toLowerCase()}…` : 'The rival is playing their turn…' }

  const top = G.topDiscard(s)
  const organized = organize(myHand)
  const myDeadForResult = me === 'you' ? r?.youDead : r?.aiDead
  const oppDeadForResult = me === 'you' ? r?.aiDead : r?.youDead

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Gin Rummy · sets & runs"
        title="Gin Rummy"
        subtitle="meld your hand into sets and runs, shed the deadwood, and knock before the rival — first to 100 takes the night"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`You ${myScore} · ${oppLabel} ${oppScore} — race to ${G.TARGET}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>s · stock &nbsp; d · discard &nbsp; N · new</>}
      >
        <div className="gr-table">
          {/* opponent */}
          <div className="gr-seat foe">
            <div className="gr-seat-label"><span className="gr-dot foe" /> {oppLabel}<span className="gr-meta">{oppHand.length} cards</span></div>
            <div className="gr-hand foe">
              {oppHand.map((c, i) => (
                <div key={c.id >= 0 ? c.id : 'h' + i} className="gr-slot" style={{ ['--i' as any]: i }}>
                  <CardView card={c} faceUp={roundEnded && c.id >= 0} small />
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
          <div className="panel">
            <OnlineBar net={net} />
          </div>

          {/* scoreboard */}
          <div className="panel gr-score">
            <div className={'gr-srow' + (yourTurn ? ' on' : '')}>
              <span className="gr-dot you" /><span className="gr-sname">You</span>
              <span className="gr-spts">{myScore}</span>
            </div>
            <div className={'gr-srow' + (s.winner == null && !roundEnded && !isMyTurn ? ' on' : '')}>
              <span className="gr-dot foe" /><span className="gr-sname">{oppLabel}</span>
              <span className="gr-spts">{oppScore}</span>
            </div>
            <div className="gr-target">first to {G.TARGET}</div>
          </div>

          {/* control */}
          <div className="panel gr-control">
            {s.phase === 'roundOver' && (
              net.online && mySeat !== 0
                ? <div className="gr-hint">Waiting for the host to deal the next hand…</div>
                : <button className="gr-btn primary wide" onClick={s.winner ? newGame : continueRound}>
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

            {!yourTurn && s.winner == null && !roundEnded && (
              <div className="gr-hint">{net.online ? `The ${oppLabel.toLowerCase()} is deciding…` : 'The rival is deciding…'}</div>
            )}
          </div>

          {/* log */}
          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {roundEnded && r && (
        <RoundModal
          s={s}
          r={r}
          won={s.winner === me}
          matchOver={s.winner != null}
          iKnocked={iKnocked}
          iScored={iScored}
          myScore={myScore}
          oppScore={oppScore}
          myDead={myDeadForResult ?? 0}
          oppDead={oppDeadForResult ?? 0}
          oppLabel={oppLabel}
          canContinue={!(net.online && mySeat !== 0)}
          onContinue={s.winner ? newGame : continueRound}
        />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function roundBanner(r: NonNullable<GinState['round']>, me: Who, oppLabel: string): string {
  if (r.kind === 'wash') return 'Stock exhausted — the hand washes. Deal again.'
  const who = r.by === me ? 'You' : oppLabel
  if (r.kind === 'gin') return `${who} went gin — +${r.points}.`
  if (r.kind === 'undercut') {
    const sc = r.scorer === me ? 'You' : oppLabel
    return `Undercut! ${sc} score +${r.points}.`
  }
  const sc = r.scorer === me ? 'You' : oppLabel
  return `${who} knocked — ${sc} score +${r.points}.`
}

function RoundModal({
  s, r, won, matchOver, iKnocked, iScored, myScore, oppScore, myDead, oppDead, oppLabel, canContinue, onContinue,
}: {
  s: GinState
  r: NonNullable<GinState['round']>
  won: boolean
  matchOver: boolean
  iKnocked: boolean
  iScored: boolean
  myScore: number
  oppScore: number
  myDead: number
  oppDead: number
  oppLabel: string
  canContinue: boolean
  onContinue: () => void
}) {
  void s; void iScored
  const title = matchOver ? (won ? 'You Win the Match' : `${oppLabel} Wins`) : roundTitle(r, iKnocked, oppLabel)
  const eyebrow = matchOver ? (won ? 'Cleaned them out' : 'Out of chips') : r.kind === 'wash' ? 'No score' : 'Hand over'
  return (
    <Modal
      eyebrow={eyebrow}
      title={title}
      closeOnOverlay={!matchOver && canContinue}
      onClose={matchOver || !canContinue ? undefined : onContinue}
      actions={canContinue
        ? <button className="btn-modal" onClick={onContinue}>{matchOver ? 'Play again' : 'Next hand'}</button>
        : undefined}
    >
      <div className="modal-body">
        <div className="gr-result-grid">
          <div className="gr-rcol">
            <div className="gr-rname you">You</div>
            <div className="gr-rdead">deadwood {myDead}</div>
          </div>
          <div className="gr-rvs">{r.points >= 0 ? `+${r.points}` : r.points}</div>
          <div className="gr-rcol">
            <div className="gr-rname foe">{oppLabel}</div>
            <div className="gr-rdead">deadwood {oppDead}</div>
          </div>
        </div>
        <div className="gr-rscore">Match: <b className="you">{myScore}</b> — <b className="foe">{oppScore}</b> (to {G.TARGET})</div>
        {r.layoffs.length > 0 && (
          <div className="gr-rlay">Laid off: {r.layoffs.map((c) => G.cardLabel(c)).join('  ')}</div>
        )}
        {!canContinue && <div className="gr-rlay">Waiting for the host to deal the next hand…</div>}
      </div>
    </Modal>
  )
}
function roundTitle(r: NonNullable<GinState['round']>, iKnocked: boolean, oppLabel: string): string {
  if (r.kind === 'gin') return iKnocked ? 'Gin!' : `${oppLabel} Gin`
  if (r.kind === 'undercut') return 'Undercut'
  if (r.kind === 'wash') return 'Wash'
  return iKnocked ? 'You Knocked' : `${oppLabel} Knocked`
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
