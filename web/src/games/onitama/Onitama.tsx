/* ONITAMA — UI (built for this codebase). A stone 5x5 board on the framework shell, with the
   five move cards drawn as little 5x5 pattern grids. Pick one of your two cards, a piece, then a
   highlighted destination. The used card swaps to the middle. Win by capturing the enemy Master
   or landing your Master on their temple arch.

   Solo: opponent is an alpha-beta minimax AI (driven by useGameSession's AI fill). Online: the
   game is seat-relative — your side, cards, banners and panels are derived from mySeat, and the
   board flips so your pieces are nearest you when you sit at the top seat. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { onitamaAdapter } from './net'
import * as ON from './logic'
import type { Side, Card, Move } from './logic'

const { N } = ON
const SIDE: Side[] = ['you', 'ai'] // seat 0 -> bottom (Blue), seat 1 -> top (Red)

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#2a2320" stroke="#7c5a3a" strokeWidth="1.5" />
    <path d="M24 9 L34 18 L31 18 L31 33 L17 33 L17 18 L14 18 Z" fill="#c8a86a" stroke="#8a6a3a" strokeWidth="0.8" />
    <rect x="21" y="22" width="6" height="11" fill="#2a2320" />
    <circle cx="24" cy="14" r="1.6" fill="#e7d0a0" />
  </svg>
)

// Render a single card as a 5x5 pattern grid (centre = the moving piece, dots = its offsets).
// When `mirror` is set (top-seat player), the offsets are negated so they read from your view.
function CardGrid({ card, mirror }: { card: Card; mirror?: boolean }) {
  const set = useMemo(() => {
    const m = mirror ? -1 : 1
    return new Set(card.moves.map(([dr, dc]) => (2 + dr * m) * 5 + (2 + dc * m)))
  }, [card, mirror])
  const cells = []
  for (let i = 0; i < 25; i++) {
    const isCentre = i === 12
    const isMove = set.has(i)
    cells.push(
      <div key={i} className={'cg-cell' + (isCentre ? ' centre' : '') + (isMove ? ' move' : '')} />,
    )
  }
  return <div className="card-grid">{cells}</div>
}

function CardView({
  name, mirror, selectable, selected, onClick, faded,
}: { name: string; mirror?: boolean; selectable?: boolean; selected?: boolean; onClick?: () => void; faded?: boolean }) {
  const card = ON.cardByName(name)
  return (
    <div
      className={'mcard' + (selectable ? ' selectable' : '') + (selected ? ' selected' : '') + (faded ? ' faded' : '')}
      onClick={selectable ? onClick : undefined}
    >
      <div className="mcard-name">{name}</div>
      <CardGrid card={card} mirror={mirror} />
    </div>
  )
}

export function Onitama() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(onitamaAdapter)
  const [showRules, setShowRules] = useState(false)
  const [selCard, setSelCard] = useState<string | null>(null)
  const [selPiece, setSelPiece] = useState<number | null>(null)

  const mySide = SIDE[mySeat]            // your colour this match
  const oppSide: Side = mySide === 'you' ? 'ai' : 'you'
  const flip = mySeat !== 0              // top-seat player views the board upside-down
  const oppName = net.online ? 'Opponent' : 'Rival'

  function newGame() {
    netNew(); setShowRules(false); setSelCard(null); setSelPiece(null)
  }
  function deselect() { setSelCard(null); setSelPiece(null) }

  const yourTurn = !s.winner && isMyTurn

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => (showRules ? setShowRules(false) : deselect()) })

  // All of your legal moves this turn, and the subset matching the current card+piece selection.
  const myMoves = useMemo<Move[]>(() => (yourTurn ? ON.legalMoves(s, mySide) : []), [yourTurn, s, mySide])
  const mustPass = yourTurn && myMoves.length === 0

  const destSet = useMemo(() => {
    const m = new Map<number, Move>()
    if (selCard && selPiece != null) {
      for (const mv of myMoves) if (mv.card === selCard && mv.from === selPiece) m.set(mv.to, mv)
    }
    return m
  }, [selCard, selPiece, myMoves])

  // Pieces you could move with the currently selected card.
  const movablePieces = useMemo(() => {
    const set = new Set<number>()
    if (selCard) for (const mv of myMoves) if (mv.card === selCard) set.add(mv.from)
    return set
  }, [selCard, myMoves])

  function pickCard(name: string) {
    if (!yourTurn) return
    setSelCard(name); setSelPiece(null)
  }
  function clickSquare(i: number) {
    if (!yourTurn) return
    const dest = destSet.get(i)
    if (dest) { dispatch({ card: dest.card, from: dest.from, to: dest.to }); deselect(); return }
    const p = s.board[i]
    if (selCard && p && p.side === mySide && movablePieces.has(i)) { setSelPiece(i) }
  }
  // Passing still swaps a card; the host honours a pass intent only when no legal move exists.
  function doPass() { if (mustPass) { dispatch({ pass: true }); deselect() } }

  let banner = '', bk = ''
  if (s.winner === mySide) { bk = 'win'; banner = 'You win — the rival falls' }
  else if (s.winner === oppSide) { bk = 'lose'; banner = `${oppName} wins` }
  else if (mustPass) { bk = 'you'; banner = 'No legal move — exchange a card' }
  else if (yourTurn) { bk = 'you'; banner = selCard ? (selPiece != null ? 'Pick a destination' : 'Pick a piece') : 'Your turn — choose a card' }
  else { bk = 'foe'; banner = net.online ? `${oppName} is choosing…` : 'The rival is contemplating…' }

  // Render order: flip top-to-bottom AND left-to-right so the local player's back row is nearest.
  const order = flip ? Array.from({ length: N * N }, (_, k) => N * N - 1 - k) : Array.from({ length: N * N }, (_, k) => k)

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Onitama · way of the wind"
        title="Onitama"
        subtitle="cards dictate every move — capture the Master or storm the temple arch"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="5 × 5"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="on-play">
          {/* Opponent (top) cards */}
          <div className="cardrow foe-row">
            {s.hands[oppSide].map(name => <CardView key={name} name={name} mirror={oppSide === 'ai'} faded={!yourTurn} />)}
          </div>

          <div className="on-mid">
            <div className="on-board">
              {order.map((i) => {
                const p = s.board[i]
                const r = (i / N) | 0, c = i % N
                const isYouTemple = i === ON.YOU_TEMPLE
                const isAiTemple = i === ON.AI_TEMPLE
                // temple class is relative to side, not seat: AI_TEMPLE belongs to the 'ai' side.
                const isMyTemple = (mySide === 'you' && isYouTemple) || (mySide === 'ai' && isAiTemple)
                const isOppTemple = (oppSide === 'you' && isYouTemple) || (oppSide === 'ai' && isAiTemple)
                const isDest = destSet.has(i)
                const isSel = selPiece === i
                const isLastFrom = s.last?.from === i
                const isLastTo = s.last?.to === i
                const movable = yourTurn && selCard != null && movablePieces.has(i) && p?.side === mySide
                return (
                  <div
                    key={i}
                    className={
                      'on-cell' +
                      ((r + c) % 2 ? ' alt' : '') +
                      (isOppTemple ? ' temple-ai' : '') +
                      (isMyTemple ? ' temple-you' : '') +
                      (isLastFrom ? ' last-from' : '') +
                      (isLastTo ? ' last-to' : '') +
                      (movable ? ' movable' : '') +
                      (isDest ? ' dest' : '')
                    }
                    onClick={() => clickSquare(i)}
                  >
                    {(isAiTemple || isYouTemple) && <div className="arch" />}
                    {p && (
                      <div className={'piece ' + (p.side === mySide ? 'you' : 'ai') + ' ' + p.kind + (isSel ? ' sel' : '')}>
                        {p.kind === 'master'
                          ? <span className="crown">♔</span>
                          : <span className="pip" />}
                      </div>
                    )}
                    {isDest && !p && <div className="dest-dot" />}
                  </div>
                )
              })}
            </div>

            {/* Your (bottom) cards + the middle card */}
            <div className="cardrow you-row">
              {s.hands[mySide].map(name => (
                <CardView
                  key={name}
                  name={name}
                  mirror={mySide === 'ai'}
                  selectable={yourTurn && !mustPass}
                  selected={selCard === name}
                  onClick={() => pickCard(name)}
                />
              ))}
            </div>
          </div>

          <div className="side">
            <div className="panel">
              <OnlineBar net={net} />
            </div>
            <div className="panel turnpanel">
              <div className="panel-l">To move</div>
              <div className={'turnwho ' + (s.winner ? 'over' : yourTurn ? 'you' : 'ai')}>
                {s.winner
                  ? (s.winner === mySide ? 'You won' : `${oppName} won`)
                  : yourTurn ? 'You' : oppName}
              </div>
              <div className="midwrap">
                <div className="panel-l">Middle card (next swap)</div>
                <CardView name={s.middle} mirror={mySide === 'ai'} />
              </div>
              {mustPass && <button className="passbtn" onClick={doPass}>Exchange card (pass)</button>}
            </div>
            <div className="panel logbox">
              {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
            </div>
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={s.winner === mySide} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, oppName, onNew }: { won: boolean; oppName: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Way of the master' : `${oppName} prevails`}
      title={won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>{won
          ? 'The temple holds. Your students moved as one and the rival Master fell.'
          : 'The rival read the wind better this time. Reshuffle the cards and try again.'}</p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Onitama" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>Blue</b> (bottom) and move first. Each side holds <b>two move cards</b>; a fifth card sits in the <b>middle</b>. A card shows, as a little grid, the squares a piece may step to (the centre dot is the piece). The rival's cards are <i>mirrored</i> for their direction.</p>
        <p>On your turn, click a card, click one of your pieces, then click a highlighted square to move there — landing on a rival piece <b>captures</b> it. The card you used <b>swaps to the middle</b>, and you take the card that was there.</p>
        <p>Win two ways: <b>capture the rival Master</b> (Way of the Stone), or move your <b>Master onto the rival's temple arch</b> — the marked centre of their back row (Way of the Stream). If you have <i>no legal move</i> you must still exchange a card.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
