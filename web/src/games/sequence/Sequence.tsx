/* SEQUENCE — UI (built for this codebase). A 10x10 card board, your seven-card hand, and a
   chip-placement duel. Click a hand card → its legal cells light up → click a cell to drop
   (or, with a one-eyed jack, to remove an opponent chip). First to two sequences wins.

   Online-capable: useGameSession runs the authoritative logic (host) or renders a redacted
   per-seat view (guest) and drives the AI for any empty seat — so we DELETE useAITurn here.
   Everything is seat-relative: your hand/side/scores come from `mySeat`, `isMyTurn` gates
   play, and when net.online opponents read as "Opponent" / "Player N" instead of "Rival". */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { sequenceAdapter } from './net'
import * as S from './logic'
import type { Card, Player } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#10232b" stroke="#1f4a55" strokeWidth="1.5" />
    <rect x="9" y="10" width="13" height="19" rx="2.5" fill="#f3f7f5" stroke="#cdd8d3" strokeWidth="0.8" transform="rotate(-8 15 19)" />
    <rect x="24" y="12" width="13" height="19" rx="2.5" fill="#f3f7f5" stroke="#cdd8d3" strokeWidth="0.8" transform="rotate(7 30 21)" />
    <circle cx="19" cy="34" r="4.6" fill="#37d6a9" stroke="#1d8e6f" strokeWidth="1" />
    <circle cx="30" cy="36" r="4.6" fill="#ff6b8a" stroke="#c33a59" strokeWidth="1" />
  </svg>
)

const SUIT_GLYPH: Record<S.Suit, string> = { C: '♣', D: '♦', H: '♥', S: '♠' }

function jackKind(c: Card): 'two' | 'one' | null {
  if (!S.isJack(c)) return null
  return S.isTwoEyedJack(c) ? 'two' : 'one'
}

function CardFace({ card, small }: { card: Card; small?: boolean }) {
  const red = S.RED_SUITS.has(card.suit)
  const jk = jackKind(card)
  return (
    <span className={'cardface' + (red ? ' red' : '') + (small ? ' sm' : '')}>
      {jk ? (
        <span className="jacklbl">{jk === 'two' ? '☆☆' : '☆'}</span>
      ) : null}
      <span className="rank">{card.rank}</span>
      <span className="suit">{SUIT_GLYPH[card.suit]}</span>
    </span>
  )
}

export function Sequence() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(sequenceAdapter)
  const [sel, setSel] = useState<number | null>(null) // selected hand index
  const [showRules, setShowRules] = useState(false)

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  const me = mySeat as Player
  const foe: Player = me === 0 ? 1 : 0
  const gameOver = s.winner != null || s.draw
  const yourTurn = !gameOver && isMyTurn
  const oppName = net.online ? `Player ${foe + 1}` : 'Rival'

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setSel(null); setShowRules(false) },
  })

  const hand = s.hands[me]
  const selCard = sel != null ? hand[sel] : null
  const legal = yourTurn && selCard ? new Set(S.legalCellsForCard(s, selCard, me)) : new Set<number>()
  const oneEyedSelected = selCard != null && S.isOneEyedJack(selCard)

  function clickHand(i: number) {
    if (!yourTurn) return
    const card = hand[i]
    if (S.isDeadCard(s, card)) { setSel(null); return } // swap not exposed online; deselect
    setSel(prev => (prev === i ? null : i))
  }

  function clickCell(i: number) {
    if (!yourTurn || selCard == null) return
    if (!legal.has(i)) return
    dispatch({ kind: 'play', cardId: S.cardKey(selCard), cell: i })
    setSel(null)
  }

  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = 'You win — two sequences complete!' }
  else if (s.winner === foe) { bk = 'lose'; banner = `${oppName} completed two sequences` }
  else if (s.draw) { bk = ''; banner = 'A draw — the deck ran out with no winner' }
  else if (yourTurn) {
    bk = 'you'
    banner = selCard == null ? 'Your turn — pick a card from your hand'
      : oneEyedSelected ? 'One-eyed jack — click a highlighted opponent chip to remove it'
      : S.isTwoEyedJack(selCard) ? 'Wild jack — click any highlighted empty cell'
      : 'Click a highlighted cell to drop your chip'
  } else { bk = 'foe'; banner = net.online ? `${oppName} is to move…` : 'The rival is thinking…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Sequence · cards & chips"
        title="Sequence"
        subtitle="play a card, claim its cell, draw — line up five chips, complete two sequences, and beat the rival to the board"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`You ${s.sequences[me]}/2 · ${oppName} ${s.sequences[foe]}/2 · deck ${s.deck.length}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click card · click cell &nbsp; N · new</>}
      >
        <div className="sq-wrap">
          <div className={'sq-board' + (selCard ? ' selecting' : '')}>
            {s.layout.map((cell, i) => {
              const owner = s.chips[i]
              const isLegal = legal.has(i)
              const locked = s.locked[i]
              const isLast = s.last === i
              const cls = ['sq-cell']
              if (cell.free) cls.push('free')
              if (isLegal) cls.push(oneEyedSelected ? 'targetable' : 'legal')
              if (isLast) cls.push('last')
              return (
                <div
                  key={i}
                  className={cls.join(' ')}
                  onClick={isLegal ? () => clickCell(i) : undefined}
                >
                  {cell.free === true
                    ? <span className="freemark">✦</span>
                    : <CardFace card={cell.card} small />}
                  {owner != null && (
                    <span className={'chip' + (owner === me ? ' you' : ' foe') + (locked ? ' locked' : '')} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <OnlineBar net={net} />

          <div className="panel sq-score">
            <div className={'sq-row' + (yourTurn ? ' on' : '')}>
              <span className="sq-dot you" />
              <span className="sq-who">You</span>
              <span className="sq-seq">{s.sequences[me]}<i>/2</i></span>
            </div>
            <div className={'sq-row' + (s.turn === foe && s.winner == null && !s.draw ? ' on' : '')}>
              <span className="sq-dot foe" />
              <span className="sq-who">{oppName}</span>
              <span className="sq-seq">{s.sequences[foe]}<i>/2</i></span>
            </div>
            <div className="sq-deck">draw deck: {s.deck.length} cards</div>
          </div>

          <div className="panel sq-handpanel">
            <div className="sq-handlbl">your hand</div>
            <div className="sq-hand">
              {hand.map((card, i) => {
                const dead = S.isDeadCard(s, card)
                return (
                  <button
                    key={i}
                    className={'sq-card' + (sel === i ? ' sel' : '') + (dead ? ' dead' : '')}
                    disabled={!yourTurn}
                    onClick={() => clickHand(i)}
                    title={dead ? 'dead card' : ''}
                  >
                    <CardFace card={card} />
                    {dead && <span className="deadflag">dead</span>}
                  </button>
                )
              })}
            </div>
            <div className="sq-hint">
              {selCard
                ? (oneEyedSelected ? 'pick an opponent chip to remove' : 'pick a highlighted cell')
                : 'select a card to see its legal cells'}
            </div>
          </div>

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => (
              <div key={i} className={'log-line ' + l.t}>{l.x}</div>
            ))}
          </div>
        </div>
      </GameShell>

      {gameOver && <ResultModal won={s.winner === me} draw={s.draw} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, draw, oppName, onNew }: { won: boolean; draw: boolean; oppName: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={draw ? 'Stalemate' : won ? 'Sequences locked' : 'Outplayed'}
      title={draw ? 'Draw' : won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        {draw
          ? <span>No more moves — neither side reached two sequences</span>
          : won
            ? <span className="you">Two sequences on the board</span>
            : <span className="foe">{oppName} lined up two first</span>}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Sequence" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Deal me in</button>}>
      <div className="modal-body">
        <p>The board shows a <b>10x10 grid of cards</b>. Every non-Jack card appears on <b>two</b> cells; the <b>four corners are free</b> and count for both players.</p>
        <p>On your turn: <b>click a card</b> in your hand to light up its matching empty cells, then <b>click a cell</b> to drop your chip. You draw a fresh card automatically.</p>
        <p><b>Jacks are special.</b> Two-eyed jacks (<i>clubs &amp; diamonds</i>) are <b>wild</b> — place your chip on any empty cell. One-eyed jacks (<i>hearts &amp; spades</i>) <b>remove</b> one opponent chip that isn't already part of a finished sequence.</p>
        <p>A <b>sequence</b> is <b>five chips in a row</b> — horizontal, vertical, or diagonal (corners count as your color). The first player to complete <b>two sequences wins</b>.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
