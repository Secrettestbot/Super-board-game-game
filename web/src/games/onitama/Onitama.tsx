/* ONITAMA — UI (built for this codebase). A stone 5x5 board on the framework shell, with the
   five move cards drawn as little 5x5 pattern grids. Pick one of your two cards, a piece, then a
   highlighted destination. The used card swaps to the middle. Win by capturing the enemy Master
   or landing your Master on their temple arch. Opponent is an alpha-beta minimax AI. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as ON from './logic'
import type { OnitamaState, Side, Card, Move } from './logic'

const { N } = ON

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#2a2320" stroke="#7c5a3a" strokeWidth="1.5" />
    <path d="M24 9 L34 18 L31 18 L31 33 L17 33 L17 18 L14 18 Z" fill="#c8a86a" stroke="#8a6a3a" strokeWidth="0.8" />
    <rect x="21" y="22" width="6" height="11" fill="#2a2320" />
    <circle cx="24" cy="14" r="1.6" fill="#e7d0a0" />
  </svg>
)

// Render a single card as a 5x5 pattern grid (centre = the moving piece, dots = its offsets).
function CardGrid({ card }: { card: Card }) {
  const set = useMemo(() => new Set(card.moves.map(([dr, dc]) => (2 + dr) * 5 + (2 + dc))), [card])
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
  name, selectable, selected, onClick, faded,
}: { name: string; selectable?: boolean; selected?: boolean; onClick?: () => void; faded?: boolean }) {
  const card = ON.cardByName(name)
  return (
    <div
      className={'mcard' + (selectable ? ' selectable' : '') + (selected ? ' selected' : '') + (faded ? ' faded' : '')}
      onClick={selectable ? onClick : undefined}
    >
      <div className="mcard-name">{name}</div>
      <CardGrid card={card} />
    </div>
  )
}

export function Onitama() {
  const [s, setS] = useState<OnitamaState>(() => ON.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [selCard, setSelCard] = useState<string | null>(null)
  const [selPiece, setSelPiece] = useState<number | null>(null)

  function newGame() {
    setS(ON.makeGame()); setShowRules(false); setSelCard(null); setSelPiece(null)
  }
  function deselect() { setSelCard(null); setSelPiece(null) }

  const yourTurn = !s.winner && s.turn === 'you'

  useAITurn(!s.winner && s.turn === 'ai', () => setS(p => ON.aiMove(p)), { delayMs: 520, tick: s.turn })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => (showRules ? setShowRules(false) : deselect()) })

  // All of your legal moves this turn, and the subset matching the current card+piece selection.
  const myMoves = useMemo<Move[]>(() => (yourTurn ? ON.legalMoves(s, 'you') : []), [yourTurn, s])
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
    if (dest) { setS(ON.applyMove(s, 'you', dest)); deselect(); return }
    const p = s.board[i]
    if (selCard && p && p.side === 'you' && movablePieces.has(i)) { setSelPiece(i) }
  }
  function doPass() { if (mustPass) { setS(ON.passTurn(s, 'you')); deselect() } }

  let banner = '', bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = 'You win — the rival falls' }
  else if (s.winner === 'ai') { bk = 'lose'; banner = 'The rival wins' }
  else if (mustPass) { bk = 'you'; banner = 'No legal move — exchange a card' }
  else if (yourTurn) { bk = 'you'; banner = selCard ? (selPiece != null ? 'Pick a destination' : 'Pick a piece') : 'Your turn — choose a card' }
  else { bk = 'foe'; banner = 'The rival is contemplating…' }

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
            {s.hands.ai.map(name => <CardView key={name} name={name} faded={!yourTurn} />)}
          </div>

          <div className="on-mid">
            <div className="on-board">
              {s.board.map((p, i) => {
                const r = (i / N) | 0, c = i % N
                const isYouTemple = i === ON.YOU_TEMPLE
                const isAiTemple = i === ON.AI_TEMPLE
                const isDest = destSet.has(i)
                const isSel = selPiece === i
                const isLastFrom = s.last?.from === i
                const isLastTo = s.last?.to === i
                const movable = yourTurn && selCard != null && movablePieces.has(i) && p?.side === 'you'
                return (
                  <div
                    key={i}
                    className={
                      'on-cell' +
                      ((r + c) % 2 ? ' alt' : '') +
                      (isAiTemple ? ' temple-ai' : '') +
                      (isYouTemple ? ' temple-you' : '') +
                      (isLastFrom ? ' last-from' : '') +
                      (isLastTo ? ' last-to' : '') +
                      (movable ? ' movable' : '') +
                      (isDest ? ' dest' : '')
                    }
                    onClick={() => clickSquare(i)}
                  >
                    {(isAiTemple || isYouTemple) && <div className="arch" />}
                    {p && (
                      <div className={'piece ' + p.side + ' ' + p.kind + (isSel ? ' sel' : '')}>
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
              {s.hands.you.map(name => (
                <CardView
                  key={name}
                  name={name}
                  selectable={yourTurn && !mustPass}
                  selected={selCard === name}
                  onClick={() => pickCard(name)}
                />
              ))}
            </div>
          </div>

          <div className="side">
            <div className="panel turnpanel">
              <div className="panel-l">To move</div>
              <div className={'turnwho ' + (s.winner ? 'over' : s.turn === 'you' ? 'you' : 'ai')}>
                {s.winner ? (s.winner === 'you' ? 'You won' : 'Rival won') : s.turn === 'you' ? 'You · Blue' : 'Rival · Red'}
              </div>
              <div className="midwrap">
                <div className="panel-l">Middle card (next swap)</div>
                <CardView name={s.middle} />
              </div>
              {mustPass && <button className="passbtn" onClick={doPass}>Exchange card (pass)</button>}
            </div>
            <div className="panel logbox">
              {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
            </div>
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: OnitamaState; onNew: () => void }) {
  const won = s.winner === 'you'
  return (
    <Modal
      eyebrow={won ? 'Way of the master' : 'The rival prevails'}
      title={won ? 'You Win' : 'Rival Wins'}
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
