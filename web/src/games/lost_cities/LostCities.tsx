/* LOST CITIES — UI (built for this codebase). An adventurer's-journal table on the framework
   shell: five jewel-toned expedition columns per side, parchment cards, shared discards and a
   deck, vs a greedy expected-value AI. Pick a hand card, then Play it to its expedition (only
   legal ones light up) or Discard it; then Draw from the deck or a discard pile. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as LC from './logic'
import type { LostCitiesState, Colour, Card } from './logic'

const { COLOURS } = LC
const COLNAME: Record<Colour, string> = { Y: 'Yellow', B: 'Blue', W: 'White', G: 'Green', R: 'Red' }

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#2a2118" stroke="#6b4f2e" strokeWidth="1.5" />
    <path d="M24 9 L34 30 L14 30 Z" fill="none" stroke="#d8b15a" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="24" cy="22" r="3" fill="#7ec8a0" />
    <path d="M14 36 H34" stroke="#a8801f" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

function cardText(c: Card) { return LC.isWager(c) ? '✦' : String(c.value) }

export function LostCities() {
  const [s, setS] = useState<LostCitiesState>(() => LC.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { setS(LC.makeGame()); setSel(null); setShowRules(false) }

  useAITurn(!s.winner && s.turn === 'ai', () => setS(p => LC.aiTurn(p)), { delayMs: 620, tick: s.phase })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setSel(null); setShowRules(false) } })

  const yourTurn = !s.winner && s.turn === 'you'
  const yourPlay = yourTurn && s.phase === 'play'
  const yourDraw = yourTurn && s.phase === 'draw'

  const selCard = sel != null ? s.hands.you.find(c => c.id === sel) ?? null : null
  const canPlaySel = useMemo(() => {
    if (!yourPlay || !selCard) return false
    return LC.canPlay(s.expeditions.you[selCard.colour], selCard)
  }, [yourPlay, selCard, s.expeditions])

  const yScore = LC.score(s, 'you'), aScore = LC.score(s, 'ai')
  const yCols = LC.colourScores(s, 'you'), aCols = LC.colourScores(s, 'ai')

  function pick(id: number) { if (yourPlay) setSel(prev => prev === id ? null : id) }
  function doPlay() { if (selCard && canPlaySel) { setS(LC.playCard(s, 'you', selCard.id)); setSel(null) } }
  function doDiscard() { if (selCard) { setS(LC.discardCard(s, 'you', selCard.id)); setSel(null) } }
  function takeDeck() { if (yourDraw) setS(LC.drawDeck(s, 'you')) }
  function takeDiscard(colour: Colour) { if (yourDraw && s.discards[colour].length) setS(LC.drawDiscard(s, 'you', colour)) }

  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = `You win — ${yScore} to ${aScore}` }
  else if (s.winner === 'ai') { bk = 'lose'; banner = `The rival wins — ${aScore} to ${yScore}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A dead heat — ${yScore} all` }
  else if (yourPlay) { bk = 'you'; banner = sel != null ? 'Play to its expedition or discard it' : 'Your turn — choose a card from your hand' }
  else if (yourDraw) { bk = 'you'; banner = 'Now draw — the deck or a discard pile' }
  else { bk = 'foe'; banner = 'The rival is plotting a route…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Lost Cities · five expeditions"
        title="Lost Cities"
        subtitle="mount ascending expeditions across five ruins — but each one costs twenty to begin"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${s.deck.length} in deck`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="lc-table">
          {/* Rival expeditions (top, descending toward the middle) */}
          <div className="lc-board lc-foe">
            {COLOURS.map(c => (
              <Column key={c} colour={c} cards={s.expeditions.ai[c]} score={aCols[c]} foe />
            ))}
          </div>

          {/* Shared row: deck + discard piles */}
          <div className="lc-mid">
            <div className={'lc-deck' + (yourDraw ? ' live' : '')} onClick={takeDeck} title="Draw from the deck">
              <span className="lc-deck-n">{s.deck.length}</span>
              <span className="lc-deck-l">deck</span>
            </div>
            <div className="lc-discards">
              {COLOURS.map(c => {
                const pile = s.discards[c]
                const top = pile[pile.length - 1]
                const drawable = yourDraw && pile.length > 0
                return (
                  <div
                    key={c}
                    className={'lc-pile c-' + c + (drawable ? ' live' : '') + (pile.length ? '' : ' empty')}
                    onClick={() => drawable && takeDiscard(c)}
                    title={COLNAME[c] + ' discards'}
                  >
                    {top
                      ? <span className={'lc-card-face' + (LC.isWager(top) ? ' wager' : '')}>{cardText(top)}</span>
                      : <span className="lc-pile-dot" />}
                    {pile.length > 1 && <span className="lc-pile-n">{pile.length}</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Your expeditions */}
          <div className="lc-board lc-you">
            {COLOURS.map(c => {
              const legalTarget = yourPlay && selCard != null && selCard.colour === c && canPlaySel
              return (
                <Column
                  key={c}
                  colour={c}
                  cards={s.expeditions.you[c]}
                  score={yCols[c]}
                  legal={legalTarget}
                  onClick={legalTarget ? doPlay : undefined}
                />
              )
            })}
          </div>

          {/* Your hand */}
          <div className="lc-hand">
            {s.hands.you
              .slice()
              .sort((a, b) => COLOURS.indexOf(a.colour) - COLOURS.indexOf(b.colour) || a.value - b.value)
              .map(card => {
                const playable = yourPlay && LC.canPlay(s.expeditions.you[card.colour], card)
                return (
                  <button
                    key={card.id}
                    className={'lc-card c-' + card.colour + (sel === card.id ? ' sel' : '') + (LC.isWager(card) ? ' wager' : '') + (yourPlay && !playable ? ' dead' : '')}
                    onClick={() => pick(card.id)}
                    disabled={!yourPlay}
                  >
                    <span className="lc-card-v">{cardText(card)}</span>
                    <span className="lc-card-c">{COLNAME[card.colour][0]}</span>
                  </button>
                )
              })}
          </div>

          {/* Action bar */}
          <div className="lc-actions">
            <button className="lc-btn play" disabled={!canPlaySel} onClick={doPlay}>Play expedition</button>
            <button className="lc-btn discard" disabled={!yourPlay || sel == null} onClick={doDiscard}>Discard</button>
            <span className="lc-hint">
              {yourDraw ? 'Click the deck or a discard pile to draw.' : sel == null ? 'Select a card to begin your turn.' : canPlaySel ? 'This card extends an expedition.' : 'This card can only be discarded.'}
            </span>
          </div>
        </div>

        <div className="side">
          <div className="panel scoreboard">
            <ScoreRow name="You" total={yScore} cols={yCols} on={s.turn === 'you' && !s.winner} you />
            <ScoreRow name="Rival" total={aScore} cols={aCols} on={s.turn === 'ai' && !s.winner} />
            <div className="lc-deckline"><span>Deck</span><span>{s.deck.length} cards</span></div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} y={yScore} a={aScore} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function Column({ colour, cards, score, foe, legal, onClick }:
  { colour: Colour; cards: Card[]; score: number; foe?: boolean; legal?: boolean; onClick?: () => void }) {
  const started = cards.length > 0
  return (
    <div className={'lc-col c-' + colour + (foe ? ' foe' : '') + (legal ? ' legal' : '')} onClick={onClick}>
      <div className="lc-col-head">
        <span className="lc-col-name">{COLNAME[colour]}</span>
        <span className={'lc-col-score' + (started ? (score >= 0 ? ' pos' : ' neg') : '')}>{started ? score : '—'}</span>
      </div>
      <div className="lc-col-cards">
        {cards.map((c, i) => (
          <span key={c.id} className={'lc-stack' + (LC.isWager(c) ? ' wager' : '')} style={{ zIndex: i }}>{cardText(c)}</span>
        ))}
        {legal && <span className="lc-drop">＋</span>}
        {!started && !legal && <span className="lc-col-empty">−20 to begin</span>}
      </div>
    </div>
  )
}

function ScoreRow({ name, total, cols, on, you }:
  { name: string; total: number; cols: Record<Colour, number>; on: boolean; you?: boolean }) {
  return (
    <div className={'sc' + (on ? ' on' : '') + (you ? ' you' : ' foe')}>
      <div className="sc-top">
        <span className="sc-name">{name}</span>
        <span className={'sc-n' + (total >= 0 ? ' pos' : ' neg')}>{total}</span>
      </div>
      <div className="sc-cols">
        {COLOURS.map(c => (
          <span key={c} className={'sc-chip c-' + c} title={COLNAME[c]}>{cols[c]}</span>
        ))}
      </div>
    </div>
  )
}

function ResultModal({ s, y, a, onNew }: { s: LostCitiesState; y: number; a: number; onNew: () => void }) {
  const won = s.winner === 'you', draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Evenly matched' : won ? 'Expeditions funded' : 'Out-explored'}
      title={draw ? 'A Dead Heat' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {y}</span><span className="foe">Rival {a}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Lost Cities" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Set out</button>}>
      <div className="modal-body">
        <p>Each turn, <b>play</b> a card onto one of your five expeditions <i>or</i> <b>discard</b> it — then <b>draw</b> a card, from the deck or the top of any discard pile.</p>
        <p>Cards in an expedition must rise in <b>strictly ascending</b> number (you may skip numbers, never go down). <b>Wager</b> cards (<i>✦</i>) must be laid <i>before</i> any number of that colour and <b>multiply</b> its final score.</p>
        <p>Every expedition you begin costs <b>−20</b>. Its score is the sum of its numbers minus 20, times one plus its wagers; an expedition of <b>8+ cards earns +20</b>. Unstarted expeditions score 0.</p>
        <p>The game ends when the <b>deck runs out</b>. The <b>higher total wins</b>.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
