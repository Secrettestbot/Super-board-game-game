/* LOVE LETTER — UI (2-player adaptation, built for this codebase). A romantic royal court:
   parchment cards with crests and a wax-seal motif, on the framework shell. You draw and play
   one of two cards; the rival's card is hidden unless a Priest reveals it. Side panel holds the
   round-favor tokens, the discard pile, and a running log. First to 4 favors wins.

   ONLINE: seat-relative via useGameSession. "You" is always the local seat (mySeat); the other
   seat is the opponent. Hands/tokens/discards are read from mySeat's perspective; hidden cards
   are redacted by the adapter, so we simply render whatever the view shows (masked deck/hands
   come through as the placeholder value 0). In solo play mySeat is 0 and the rival is the AI. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { loveLetterAdapter } from './net'
import * as LL from './logic'
import type { CardValue } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="9" fill="#5a1530" stroke="#8a2a4b" strokeWidth="1.5" />
    <path d="M8 16 L24 28 L40 16" fill="none" stroke="#f3ddc0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="8" y="14" width="32" height="22" rx="3" fill="none" stroke="#f3ddc0" strokeWidth="2" />
    <circle cx="24" cy="25" r="5" fill="#c0405f" stroke="#f3ddc0" strokeWidth="1" />
  </svg>
)

const GUESS_VALUES: CardValue[] = [2, 3, 4, 5, 6, 7, 8]   // Guard may name any non-Guard card

export function LoveLetter() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(loveLetterAdapter)
  const me = mySeat as 0 | 1
  const foe = (1 - me) as 0 | 1
  const [showRules, setShowRules] = useState(false)
  const [pending, setPending] = useState<CardValue | null>(null)   // a Guard awaiting its guess

  function newGame() { netNew(); setShowRules(false); setPending(null) }

  const yourTurn = s.winner === null && !s.roundOver && isMyTurn
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setShowRules(false); setPending(null) } })

  const legal = useMemo(() => yourTurn ? new Set(LL.legalPlays(s, me)) : new Set<CardValue>(), [yourTurn, s, me])

  function playCard(v: CardValue) {
    if (!yourTurn || !legal.has(v)) return
    if (v === 1 && !s.protected[foe]) { setPending(1); return }    // Guard needs a guess
    dispatch({ kind: 'play', card: v })
  }
  function guess(g: CardValue) { if (pending === 1) { dispatch({ kind: 'play', card: 1, guess: g }); setPending(null) } }
  function nextRound() { dispatch({ kind: 'next' }) }

  const youHand = s.hands[me], foeHand = s.hands[foe]
  // A masked card comes through as the placeholder value 0; only render a real face for >0.
  const foeFaceUp = !s.roundOver && (foeHand[0] as number) > 0 ? (foeHand[0] as CardValue) : null

  const foeLabel = net.online ? 'Opponent' : 'Rival'
  const youWonGame = s.winner === me
  const foeWonGame = s.winner === foe
  const youWonRound = s.roundWinner === me

  let banner: string, bk = ''
  if (youWonGame) { bk = 'win'; banner = 'You win the court — the Princess is yours' }
  else if (foeWonGame) { bk = 'lose'; banner = `${foeLabel} wins the court` }
  else if (s.roundOver) { bk = youWonRound ? 'you' : 'foe'; banner = youWonRound ? 'You take the round' : `${foeLabel} takes the round` }
  else if (pending === 1) { bk = 'you'; banner = `Name the card ${foeLabel.toLowerCase()} holds` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — choose a card to play' }
  else { bk = 'foe'; banner = net.online ? `${foeLabel} considers their move…` : 'The rival considers their move…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Love Letter · win her heart"
        title="Love Letter"
        subtitle="deliver your missive to the Princess — outwit, outlast, and never play her by mistake"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>First to {LL.TARGET_TOKENS} · favor {s.tokens[me]}–{s.tokens[foe]}</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="ll-wrap">
          {/* opponent */}
          <div className="ll-seat foe">
            <div className="ll-seat-label">
              <span className="ll-seal foe" /> {foeLabel}
              {s.out[foe] && <span className="ll-out">out</span>}
              {s.protected[foe] && !s.out[foe] && <span className="ll-prot">protected</span>}
            </div>
            <div className="ll-foe-cards">
              {foeHand.map((_, i) => (
                <div key={i} className={'ll-card back' + (foeFaceUp ? ' flip' : '')}>
                  {foeFaceUp && i === 0
                    ? <CardFace v={foeFaceUp} />
                    : <div className="ll-crest"><span className="ll-seal-big" /></div>}
                </div>
              ))}
              {foeHand.length === 0 && <div className="ll-card empty" />}
            </div>
            {foeFaceUp && <div className="ll-peek">Priest reveals: {LL.cardName(foeFaceUp)}</div>}
          </div>

          <div className="ll-table-line"><span>deck · {s.deck.length}</span></div>

          {/* you */}
          <div className="ll-seat you">
            <div className="ll-you-cards">
              {youHand.map((v, i) => {
                const playable = yourTurn && legal.has(v as CardValue) && pending === null
                return (
                  <button
                    key={i}
                    className={'ll-card face' + (playable ? ' playable' : '') + (!playable && yourTurn ? ' locked' : '')}
                    disabled={!playable}
                    onClick={() => playCard(v as CardValue)}
                  >
                    <CardFace v={v as CardValue} />
                  </button>
                )
              })}
              {youHand.length === 0 && <div className="ll-card empty" />}
            </div>
            <div className="ll-seat-label">
              <span className="ll-seal you" /> You
              {s.out[me] && <span className="ll-out">out</span>}
              {s.protected[me] && !s.out[me] && <span className="ll-prot">protected</span>}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel"><OnlineBar net={net} /></div>

          <div className="panel ll-tokens">
            <div className="panel-l">Favor</div>
            <div className="ll-tok-row">
              <span className="ll-tok-name you">You</span>
              <span className="ll-pips">{pips(s.tokens[me])}</span>
            </div>
            <div className="ll-tok-row">
              <span className="ll-tok-name foe">{foeLabel}</span>
              <span className="ll-pips">{pips(s.tokens[foe])}</span>
            </div>
          </div>

          <div className="panel ll-discard">
            <div className="panel-l">Discard pile</div>
            <div className="ll-disc-grid">
              {s.discards.length === 0 && <span className="ll-disc-empty">no cards yet</span>}
              {s.discards.slice(-12).map((d, i) => (
                <span key={i} className={'ll-chip ' + (d.who === me ? 'you' : 'foe')} title={LL.cardName(d.v)}>
                  <b>{d.v}</b>{LL.cardName(d.v).slice(0, 4)}
                </span>
              ))}
            </div>
          </div>

          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {pending === 1 && (
        <Modal
          eyebrow="The Guard"
          title="Name a card"
          onClose={() => setPending(null)}
          actions={<button className="btn-modal" onClick={() => setPending(null)}>Cancel</button>}
        >
          <div className="modal-body"><p>Guess the card {foeLabel.toLowerCase()} holds. Guess right and they are out — you may not name another Guard.</p></div>
          <div className="ll-guess">
            {GUESS_VALUES.map(v => (
              <button key={v} className="ll-guess-btn" onClick={() => guess(v)}><b>{v}</b>{LL.cardName(v)}</button>
            ))}
          </div>
        </Modal>
      )}

      {s.winner !== null && <ResultModal you={s.tokens[me]} foe={s.tokens[foe]} won={youWonGame} foeLabel={foeLabel} onNew={newGame} />}
      {s.winner === null && s.roundOver && (
        isMyTurn
          ? <RoundModal you={s.tokens[me]} foe={s.tokens[foe]} won={youWonRound} foeLabel={foeLabel} onNext={nextRound} />
          : <RoundWaitModal you={s.tokens[me]} foe={s.tokens[foe]} won={youWonRound} foeLabel={foeLabel} />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function pips(n: number) {
  const out = []
  for (let i = 0; i < LL.TARGET_TOKENS; i++) out.push(<i key={i} className={'ll-pip' + (i < n ? ' lit' : '')} />)
  return out
}

function CardFace({ v }: { v: CardValue }) {
  const info = LL.CARDS[v]
  return (
    <div className="ll-cf">
      <div className="ll-cf-top"><span className="ll-cf-val">{v}</span></div>
      <div className="ll-cf-crest"><span className="ll-seal-big" /></div>
      <div className="ll-cf-name">{info.name}</div>
      <div className="ll-cf-blurb">{info.blurb}</div>
    </div>
  )
}

function ResultModal({ you, foe, won, foeLabel, onNew }: { you: number; foe: number; won: boolean; foeLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'The Princess reads your letter' : 'A rival prevails'}
      title={won ? 'You Win' : `${foeLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Court again</button>}
    >
      <div className="finalsc"><span className="you">You {you}</span><span className="foe">{foeLabel} {foe}</span></div>
    </Modal>
  )
}

function RoundModal({ you, foe, won, foeLabel, onNext }: { you: number; foe: number; won: boolean; foeLabel: string; onNext: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'A favor earned' : 'A favor lost'}
      title={won ? 'You Take the Round' : `${foeLabel} Takes the Round`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNext}>Next round</button>}
    >
      <div className="finalsc"><span className="you">You {you}</span><span className="foe">{foeLabel} {foe}</span></div>
    </Modal>
  )
}

function RoundWaitModal({ you, foe, won, foeLabel }: { you: number; foe: number; won: boolean; foeLabel: string }) {
  return (
    <Modal
      eyebrow={won ? 'A favor earned' : 'A favor lost'}
      title={won ? 'You Take the Round' : `${foeLabel} Takes the Round`}
      closeOnOverlay={false}
      actions={<></>}
    >
      <div className="finalsc"><span className="you">You {you}</span><span className="foe">{foeLabel} {foe}</span></div>
      <div className="modal-body"><p>Waiting for the host to deal the next round…</p></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Love Letter" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Each round, draw the top card so you hold two, then <b>play one</b> and resolve its effect. The round ends when a rival is <i>out</i>, or the deck empties — then the <b>higher card in hand wins</b>. First to {LL.TARGET_TOKENS} favors wins the court.</p>
        <p><b>1 Guard</b> — name a non-Guard card; a correct guess eliminates the rival. <b>2 Priest</b> — see the rival's hand. <b>3 Baron</b> — compare hands; lower is out. <b>4 Handmaid</b> — you are protected until your next turn. <b>5 Prince</b> — a player discards and redraws (the Princess is fatal). <b>6 King</b> — trade hands. <b>7 Countess</b> — must be played with the King or Prince. <b>8 Princess</b> — play or discard her and you are out.</p>
        <p>One card is set aside face-down each round; the face-up cards of the official 2p rules are skipped here.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
