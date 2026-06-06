/* POINT SALAD — UI. A fresh-market card-drafting set-collection game on the shared shell,
   you (player 0) vs two greedy-heuristic AI players. On your turn take EITHER one point card
   from the top of a pile, OR two veg cards from the market. The board shows the 3 piles with
   their top criterion, the 6-card veg market, your collection (veg tally + point cards), a
   live score estimate, and the two rivals' collections. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as PS from './logic'
import type { PointSaladState, Veg } from './logic'

const { VEG, CRITERIA_BY_ID, N_PILES } = PS

const VEG_LABEL: Record<Veg, string> = {
  pepper: 'Pepper', lettuce: 'Lettuce', carrot: 'Carrot',
  cabbage: 'Cabbage', onion: 'Onion', tomato: 'Tomato',
}
const VEG_GLYPH: Record<Veg, string> = {
  pepper: '🫑', lettuce: '🥬', carrot: '🥕', cabbage: '🥗', onion: '🧅', tomato: '🍅',
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="11" fill="#15281a" stroke="#2f5b3a" strokeWidth="1.5" />
    <circle cx="18" cy="19" r="8" fill="#e2504a" />
    <circle cx="30" cy="21" r="8" fill="#62b85a" opacity="0.95" />
    <circle cx="23" cy="31" r="8" fill="#f0a83a" opacity="0.95" />
    <circle cx="20" cy="17" r="1.6" fill="#15281a" />
  </svg>
)

function VegChip({ v, n }: { v: Veg; n?: number }) {
  return (
    <span className={'ps-veg ' + v}>
      <span className="ps-veg-g" aria-hidden>{VEG_GLYPH[v]}</span>
      <span className="ps-veg-l">{VEG_LABEL[v]}</span>
      {n != null && <span className="ps-veg-n">{n}</span>}
    </span>
  )
}

function CritLine({ id }: { id: string }) {
  const c = CRITERIA_BY_ID[id]
  return <span className="ps-crit-line">{c ? c.label : id}</span>
}

export function PointSalad() {
  const [s, setS] = useState<PointSaladState>(() => PS.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [pick, setPick] = useState<number[]>([]) // selected market slots (veg take)

  function newGame() { setS(PS.makeGame()); setShowRules(false); setPick([]) }

  const yourTurn = s.winner == null && s.turn === 0
  const aiTurnActive = s.winner == null && s.turn != null && s.turn !== 0

  // TWO AI players take many turns each — tick must change on every AI turn so it re-arms.
  useAITurn(aiTurnActive, () => setS(p => PS.aiTurn(p)),
    { delayMs: 560, tick: `${s.turn}:${PS.cardsLeft(s)}` })

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setPick([]) },
  })

  const scores = useMemo(() => PS.scoreAll(s), [s])
  const cardsLeft = PS.cardsLeft(s)

  function clickPile(p: number) {
    if (!yourTurn || !PS.canTakePoint(s, p)) return
    setPick([])
    setS(prev => PS.takePointCard(prev, p))
  }

  function clickMarket(slot: number) {
    if (!yourTurn || s.market[slot] == null) return
    setPick(prev => {
      if (prev.includes(slot)) return prev.filter(x => x !== slot)
      if (prev.length >= 2) return [prev[1], slot]
      const next = [...prev, slot]
      if (next.length === 2 && PS.canTakeVeg(s, next)) {
        // commit the pair
        setS(p => PS.takeVeg(p, next))
        return []
      }
      return next
    })
  }

  let banner: string, bk = ''
  if (s.winner != null) {
    if (s.winner === 0) { bk = 'win'; banner = `You win — ${scores[0]} points` }
    else { bk = 'lose'; banner = `Player ${s.winner + 1} wins — ${scores[s.winner]} to your ${scores[0]}` }
  } else if (yourTurn) {
    bk = 'you'
    banner = pick.length === 1 ? 'Pick a second veg — or a different action' : 'Your turn — take a point card or two veg'
  } else {
    bk = 'foe'
    banner = `Player ${(s.turn ?? 0) + 1} is choosing…`
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Point Salad · draft & collect"
        title="Point Salad"
        subtitle="grab point cards or pairs of veg from the market — score your criteria over the salad you build"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${cardsLeft} cards left`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click pile / 2 veg &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="ps-board">
          {Array.from({ length: N_PILES }).map((_, p) => {
            const top = PS.pileTop(s, p)
            const canTake = yourTurn && PS.canTakePoint(s, p)
            return (
              <div key={p} className="ps-col">
                <div
                  className={'ps-pile' + (canTake ? ' hot' : '') + (top ? '' : ' empty')}
                  onClick={() => clickPile(p)}
                  role="button"
                >
                  <div className="ps-pile-head">
                    <span className="ps-pile-tag">Pile {p + 1}</span>
                    <span className="ps-pile-n">{s.piles[p].length}</span>
                  </div>
                  {top
                    ? <div className="ps-pile-crit"><CritLine id={top.crit} /></div>
                    : <div className="ps-pile-crit empty">— empty —</div>}
                  {top && <div className="ps-pile-flip">point card · top</div>}
                </div>
                <div className="ps-market">
                  {[0, 1].map(k => {
                    const slot = p * 2 + k
                    const card = s.market[slot]
                    const sel = pick.includes(slot)
                    return (
                      <div
                        key={slot}
                        className={'ps-vegcard' + (card ? ' ' + card.veg : ' empty') + (sel ? ' sel' : '') + (yourTurn && card ? ' live' : '')}
                        onClick={() => clickMarket(slot)}
                        role="button"
                      >
                        {card
                          ? <><span className="ps-vegcard-g" aria-hidden>{VEG_GLYPH[card.veg]}</span><span className="ps-vegcard-l">{VEG_LABEL[card.veg]}</span></>
                          : <span className="ps-vegcard-l dim">empty</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="side">
          <Collection s={s} p={0} name="You" score={scores[0]} active={yourTurn} you />
          <Collection s={s} p={1} name="Player 2" score={scores[1]} active={s.turn === 1 && s.winner == null} />
          <Collection s={s} p={2} name="Player 3" score={scores[2]} active={s.turn === 2 && s.winner == null} />
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} scores={scores} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function Collection({ s, p, name, score, active, you }: {
  s: PointSaladState; p: number; name: string; score: number; active: boolean; you?: boolean
}) {
  const pl = s.players[p]
  const owned = VEG.filter(v => pl.veg[v] > 0)
  return (
    <div className={'panel ps-coll' + (you ? ' you' : ' foe') + (active ? ' on' : '')}>
      <div className="ps-coll-head">
        <span className="ps-coll-name">{name}</span>
        {active && <span className="ps-coll-turn">●</span>}
        <span className="ps-coll-score">{score}</span>
      </div>
      <div className="ps-coll-veg">
        {owned.length === 0
          ? <span className="ps-coll-empty">no veg yet</span>
          : owned.map(v => <VegChip key={v} v={v} n={pl.veg[v]} />)}
      </div>
      <div className="ps-coll-points">
        {pl.points.length === 0
          ? <span className="ps-coll-empty">no point cards</span>
          : pl.points.map((id, i) => <CritLine key={i} id={id} />)}
      </div>
    </div>
  )
}

function ResultModal({ s, scores, onNew }: { s: PointSaladState; scores: number[]; onNew: () => void }) {
  const won = s.winner === 0
  const ranked = scores.map((sc, i) => ({ i, sc })).sort((a, b) => b.sc - a.sc)
  return (
    <Modal
      eyebrow={won ? 'Best salad' : 'Out-drafted'}
      title={won ? 'You Win' : `Player ${(s.winner as number) + 1} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <div className="ps-final">
          {ranked.map(({ i, sc }, r) => (
            <div key={i} className={'ps-final-row' + (i === 0 ? ' you' : '') + (i === s.winner ? ' win' : '')}>
              <span className="ps-final-rank">#{r + 1}</span>
              <span className="ps-final-name">{i === 0 ? 'You' : `Player ${i + 1}`}</span>
              <span className="ps-final-score">{sc}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Point Salad" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Cards are double-sided: one face is a <b>vegetable</b>, the other a <b>scoring criterion</b>. The table has 3 <b>point-card piles</b> (criterion side up) and, below each, a <b>market</b> of two face-up veg cards.</p>
        <p>On your turn do <b>one</b> of two things: take the <b>top point card</b> of a pile, <i>or</i> take <b>two veg cards</b> from the market. Emptied market slots refill from the top of their pile (flipped to the veg side).</p>
        <p>When all cards are gone the game ends. Each player <b>sums their point cards' criteria</b> over the veg they collected — per-veg multipliers, most/fewest of a type, complete sets, even/odd, and more. <b>Most total points wins.</b></p>
        <p>You play against two greedy rivals. <b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel.</p>
      </div>
    </Modal>
  )
}
