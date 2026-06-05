/* BLACKJACK — UI (built for this codebase). Casino felt table on the framework shell:
   your hand + the dealer's hand (one card hidden until you stand), a side panel with
   chip balance, current bet and a hand log. The dealer's automatic draws are driven by
   useAITurn so cards appear one at a time; HIT / STAND / DOUBLE plus Deal, with keys. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as BJ from './logic'
import type { BlackjackState, Card } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#0f5132" stroke="#1d7a4c" strokeWidth="1.5" />
    <rect x="11" y="9" width="20" height="28" rx="3.5" fill="#f6f2e7" stroke="#b8b29c" strokeWidth="0.8" transform="rotate(-12 21 23)" />
    <rect x="17" y="11" width="20" height="28" rx="3.5" fill="#f6f2e7" stroke="#b8b29c" strokeWidth="0.8" transform="rotate(10 27 25)" />
    <text x="22" y="31" fontFamily="Oswald, sans-serif" fontSize="15" fontWeight="700" fill="#c5392f" transform="rotate(10 27 25)">A</text>
    <text x="33" y="28" fontFamily="Oswald, sans-serif" fontSize="9" fontWeight="700" fill="#1c211b" transform="rotate(10 27 25)">♠</text>
  </svg>
)

function CardView({ card, faceDown }: { card?: Card; faceDown?: boolean }) {
  if (faceDown || !card) return <div className="card back" aria-label="face-down card" />
  const red = BJ.isRed(card.s)
  return (
    <div className={'card' + (red ? ' red' : '')}>
      <span className="card-corner tl"><b>{BJ.rankLabel(card.r)}</b><i>{BJ.suitGlyph(card.s)}</i></span>
      <span className="card-pip">{BJ.suitGlyph(card.s)}</span>
      <span className="card-corner br"><b>{BJ.rankLabel(card.r)}</b><i>{BJ.suitGlyph(card.s)}</i></span>
    </div>
  )
}

function valueLabel(cards: Card[]): string {
  if (!cards.length) return '—'
  const { total, soft } = BJ.handValue(cards)
  return soft && total <= 21 ? `${total - 10}/${total}` : `${total}`
}

export function Blackjack() {
  const [s, setS] = useState<BlackjackState>(() => BJ.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  function newGame() { setS(BJ.makeGame()); setShowRules(false); setDismissed(false) }
  function deal() { if (s.chips >= BJ.BET) { setS(p => BJ.deal(p)); setDismissed(false) } }
  function hit() { if (s.phase === 'player') setS(p => BJ.hit(p)) }
  function stand() { if (s.phase === 'player') setS(p => BJ.stand(p)) }
  function double() { if (s.phase === 'player' && !s.acted && s.chips >= s.bet * 2) setS(p => BJ.double(p)) }

  // Dealer draws one card per tick so the cards appear one at a time.
  useAITurn(BJ.dealerActive(s), () => setS(p => BJ.dealerStep(p)), { delayMs: 620, tick: s.dealer.length + s.phase })
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); if (s.phase === 'over') setDismissed(true) },
    extra: (e) => {
      const k = e.key.toLowerCase()
      if (s.phase === 'player') {
        if (k === 'h') { hit(); return true }
        if (k === 's') { stand(); return true }
        if (k === 'd') { double(); return true }
      }
      if (k === ' ' && (s.phase === 'idle' || s.phase === 'over')) { e.preventDefault(); deal(); return true }
      return false
    },
  })

  const playerTurn = s.phase === 'player'
  const canDouble = playerTurn && !s.acted && s.chips >= s.bet * 2
  const broke = s.phase === 'over' && s.chips < BJ.BET
  const showHole = s.hole && s.phase === 'player' && !s.result

  let banner = '', bk = ''
  if (s.phase === 'idle') { banner = 'Press Deal to play a hand'; bk = '' }
  else if (s.phase === 'dealer') { banner = 'Dealer plays…'; bk = 'foe' }
  else if (s.phase === 'player') { banner = `Your move — ${valueLabel(s.player)}`; bk = 'you' }
  else if (s.result === 'blackjack') { banner = 'Blackjack! Pays 3:2'; bk = 'win' }
  else if (s.result === 'win') { banner = 'You win the hand'; bk = 'win' }
  else if (s.result === 'lose') { banner = 'Dealer wins'; bk = 'lose' }
  else if (s.result === 'push') { banner = 'Push — bet returned'; bk = '' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Blackjack · hit or stand"
        title="Blackjack"
        subtitle="beat the dealer to 21 without busting — naturals pay three to two"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        newLabel="Reset Bank"
        modeLeft="Dealer hits to 17"
        banner={banner}
        bannerClass={bk}
        modeRight={<>H · hit &nbsp; S · stand &nbsp; D · double</>}
      >
        <div className="bj-table">
          <div className="bj-hand dealer">
            <div className="bj-hand-head">
              <span className="bj-who">Dealer</span>
              <span className="bj-tot">{showHole ? '?' : valueLabel(s.dealer)}</span>
            </div>
            <div className="bj-cards">
              {s.dealer.length === 0 && <div className="card empty" />}
              {s.dealer.map((c, i) => (
                <CardView key={i} card={c} faceDown={i === 1 && showHole} />
              ))}
            </div>
          </div>

          <div className="bj-rail"><span>BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON 17</span></div>

          <div className="bj-hand player">
            <div className="bj-hand-head">
              <span className="bj-who">You{s.doubled ? ' · doubled' : ''}</span>
              <span className="bj-tot">{valueLabel(s.player)}</span>
            </div>
            <div className="bj-cards">
              {s.player.length === 0 && <div className="card empty" />}
              {s.player.map((c, i) => <CardView key={i} card={c} />)}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel bank">
            <div className="bank-row chips"><span className="bank-l">Chips</span><span className="bank-v">{s.chips}</span></div>
            <div className="bank-row"><span className="bank-l">Bet</span><span className="bank-v bet">{s.phase === 'idle' || s.phase === 'over' ? BJ.BET : s.bet}</span></div>
          </div>

          <div className="panel actions">
            {s.phase === 'player' ? (
              <>
                <button className="act hit" onClick={hit}>Hit</button>
                <button className="act stand" onClick={stand}>Stand</button>
                <button className="act dbl" onClick={double} disabled={!canDouble}>Double</button>
              </>
            ) : (
              <button className="act deal" onClick={deal} disabled={broke}>
                {broke ? 'Out of chips' : s.phase === 'dealer' ? 'Dealing…' : 'Deal'}
              </button>
            )}
          </div>

          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {broke && !dismissed && <GameOverModal chips={s.chips} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function GameOverModal({ chips, onNew }: { chips: number; onNew: () => void }) {
  return (
    <Modal
      eyebrow="The bank takes all"
      title="Out of Chips"
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Buy back in</button>}
    >
      <div className="modal-body">
        <p>You're down to <b>{chips}</b> chips — not enough for the {BJ.BET}-chip minimum. Reset your bank to {BJ.START_CHIPS} and try again.</p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Blackjack" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Deal me in</button>}>
      <div className="modal-body">
        <p>Get closer to <b>21</b> than the dealer without going over. Cards <b>2–10</b> are face value, <b>J/Q/K</b> count 10, and an <b>Ace</b> is 11 unless that busts you, then 1.</p>
        <p>You see both your cards; the dealer shows one and hides the other. <b>Hit</b> to draw, <b>Stand</b> to hold, or <b>Double</b> on your first action to double the bet and take exactly one more card. Go over 21 and you <i>bust</i>.</p>
        <p>When you stand, the dealer reveals and <b>draws to 17</b>, standing on all 17. Higher total wins, ties <b>push</b>, and a dealer bust wins for you. A two-card 21 is a <b>blackjack</b> and pays <b>3:2</b>.</p>
        <p><b>Keys:</b> <kbd>H</kbd> hit · <kbd>S</kbd> stand · <kbd>D</kbd> double · <kbd>Space</kbd> deal · <kbd>N</kbd> reset · <kbd>?</kbd> rules.</p>
      </div>
    </Modal>
  )
}
