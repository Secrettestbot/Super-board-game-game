/* SKULL KING — UI. Seat-relative + online-capable via useGameSession(skullKingAdapter).
 *
 * The adapter COLLAPSES the logic's mechanical phases (trickEnd -> collect, roundEnd ->
 * deal next), so the networked state is only ever 'bid' / 'play' / 'gameOver'. To keep the
 * old trick-reveal pause, this component reconstructs it LOCALLY: when a fresh completed
 * trick appears (s.lastTrick changes), it freezes that trick on the felt for ~1.1s before
 * showing the cleared table. This is pure presentation; the hook drives all real state and
 * the AI for empty seats. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { skullKingAdapter } from './net'
import * as SK from './logic'
import type { Card as TCard, Kind, Player, Suit, SkullKingState } from './logic'

const SPECIAL: Record<string, { name: string; mono: string }> = {
  pirate: { name: "Pirate", mono: "P" },
  mermaid: { name: "Mermaid", mono: "M" },
  skullking: { name: "Skull King", mono: "SK" },
  escape: { name: "Escape", mono: "E" },
}
const SUIT_SHAPE: Record<Suit, string> = { parrot: "", chest: " sq", map: " di", roger: "" }
const KIND_ORDER: Record<Kind, number> = { escape: 0, suit: 1, mermaid: 2, pirate: 3, skullking: 4 }
const SUIT_ORDER: Record<Suit, number> = { parrot: 0, chest: 1, map: 2, roger: 3 }

function sortHand(hand: TCard[]): TCard[] {
  return hand.slice().sort((a, b) => {
    const ka = a.kind === "suit" ? [1, SUIT_ORDER[a.suit!], a.rank!] : [KIND_ORDER[a.kind], 0, 0]
    const kb = b.kind === "suit" ? [1, SUIT_ORDER[b.suit!], b.rank!] : [KIND_ORDER[b.kind], 0, 0]
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]
  })
}

function Card({ card, onClick, className, illegal }: { card: TCard; onClick?: () => void; className?: string; illegal?: boolean }) {
  const cls = ["card", className || ""]
  if (card.kind === "suit") {
    cls.push("suit-" + card.suit)
    if (illegal) cls.push("illegal")
    return (
      <div className={cls.join(" ")} onClick={onClick}>
        <div className="corner"><span className="rank">{card.rank}</span><span className={"pip s-" + card.suit}></span></div>
        <div className="center-emblem"><div className={"emblem-pip s-" + card.suit + SUIT_SHAPE[card.suit!]}></div></div>
        <div className="corner br"><span className="rank">{card.rank}</span><span className={"pip s-" + card.suit}></span></div>
      </div>
    )
  }
  const info = SPECIAL[card.kind]
  cls.push("special", "k-" + card.kind)
  if (illegal) cls.push("illegal")
  return (
    <div className={cls.join(" ")} onClick={onClick}>
      <div className="special-body">
        <div className="medallion">{info.mono}</div>
        <div className="special-name">{info.name}</div>
      </div>
    </div>
  )
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#11141a" stroke="#2c5566" strokeWidth="1.5" />
    <circle cx="24" cy="21" r="9" fill="#e9cd7e" stroke="#b88a25" strokeWidth="1.3" />
    <circle cx="20.5" cy="20" r="2.1" fill="#11141a" />
    <circle cx="27.5" cy="20" r="2.1" fill="#11141a" />
    <path d="M22 25.5 L24 28 L26 25.5" fill="none" stroke="#11141a" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 33 L33 33 M18 36 L30 36" stroke="#d8a93f" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

export function SkullKing() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(skullKingAdapter)
  const [bidSel, setBidSel] = useState<number | null>(null)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  // Seat-relative identity. seat 0 = 'you', seat 1 = 'ai' in the logic.
  const me: Player = mySeat === 0 ? 'you' : 'ai'
  const foe: Player = me === 'you' ? 'ai' : 'you'
  const meName = 'You'
  const foeName = net.online ? 'Opponent' : 'The Rival'
  const foeShort = net.online ? 'Opponent' : 'Rival'

  function newGame() { netNew(); setBidSel(null); setShowRules(false); setReveal(null) }

  // ----- local trick-reveal animation -----------------------------------------
  // The adapter collapses trickEnd, so completed tricks arrive already cleared (s.trick
  // empty, s.lastTrick set). We replay the just-finished trick on the felt for a beat.
  const [reveal, setReveal] = useState<{ cards: SK.TrickCard[]; winnerPlayer: Player; key: string } | null>(null)
  const lastSeen = useRef<string>('')
  useEffect(() => {
    const lt = s.lastTrick
    const key = lt ? `${s.round}:${lt.winnerPlayer}:${lt.cards.length}:${lt.bonus}:${s.tricksWon.you}:${s.tricksWon.ai}` : ''
    if (lt && key !== lastSeen.current) {
      lastSeen.current = key
      setReveal({ cards: lt.cards, winnerPlayer: lt.winnerPlayer, key })
      const id = setTimeout(() => setReveal(r => (r && r.key === key ? null : r)), 1080)
      return () => clearTimeout(id)
    }
    if (!lt) lastSeen.current = ''
  }, [s.lastTrick, s.round, s.tricksWon.you, s.tricksWon.ai])

  useEffect(() => { setBidSel(null) }, [s.round, s.phase])
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const over = s.winner != null
  const myTurnPlay = s.phase === 'play' && isMyTurn && !over && !reveal
  const myTurnBid = s.phase === 'bid' && isMyTurn && !over
  const legal = myTurnPlay ? SK.legalPlays(s.hands[me], s.trick) : []
  const legalIds = new Set(legal.map(c => c.id))

  function clickHandCard(c: TCard) {
    if (!myTurnPlay || !legalIds.has(c.id)) return
    dispatch({ kind: 'play', cardId: c.id })
  }
  function confirmBid() { if (bidSel != null && myTurnBid) dispatch({ kind: 'bid', n: bidSel }) }

  // ----- result relative to mySeat --------------------------------------------
  const myScore = me === 'you' ? s.scores.you : s.scores.ai
  const foeScore = me === 'you' ? s.scores.ai : s.scores.you
  const myWon = s.winner === me
  const foeWon = s.winner === foe

  // ===== banner =====
  let banner: string, bk = ""
  if (over) {
    if (myWon) { bk = "win"; banner = "You hold the richest log — you win" }
    else if (foeWon) { bk = "lose"; banner = `${foeShort} out-plundered you` }
    else { bk = ""; banner = "Even spoils — a dead heat" }
  } else if (reveal) {
    const w = reveal.winnerPlayer
    bk = w === me ? "you" : "foe"
    banner = `${w === me ? "You take" : `${foeShort} takes`} the trick`
  } else if (s.phase === "bid") {
    bk = "you"
    banner = myTurnBid ? `Wager your tricks for round ${s.round}` : `${foeShort} is wagering…`
  } else if (myTurnPlay) {
    bk = "you"; banner = s.trick.length === 0 ? "Your turn — lead a card" : "Your turn — follow"
  } else { bk = "foe"; banner = `${foeShort} is choosing…` }

  // ===== felt content =====
  function FeltContent() {
    if (s.phase === "bid") {
      return <div className="felt-hint" style={{ fontSize: 14 }}>Both captains seal their wagers…</div>
    }
    // a frozen, just-finished trick (local reveal) or the live trick
    const showTrick = reveal ? reveal.cards : s.trick
    if (showTrick.length === 0) {
      const leaderIsMe = s.leader === me
      return <div className="felt-hint">{leaderIsMe ? "You lead this trick" : `${foeShort} leads this trick`}</div>
    }
    const winnerPlayer = reveal ? reveal.winnerPlayer : null
    return (
      <div className="trick-area">
        {showTrick.map((tk, i) => {
          const isWin = winnerPlayer != null && tk.player === winnerPlayer
          const who = tk.player === me ? meName : foeShort
          return (
            <div key={tk.card.id + '-' + i} className={"trick-slot" + (isWin ? " win" : "")}>
              <Card card={tk.card} className="played-in" />
              <span className="slot-who">{who}{isWin ? " · won" : ""}</span>
            </div>
          )
        })}
        {!reveal && s.trick.length === 1 && s.phase === "play" && (
          <div className="trick-slot">
            <div className="empty-slot"></div>
            <span className="slot-who">{s.turn === me ? meName : foeShort}</span>
          </div>
        )}
      </div>
    )
  }

  const hand = sortHand(s.hands[me])
  const foeHandCount = s.hands[foe].length

  function madeClass(player: Player) {
    if (s.bids[player] == null) return ""
    const made = s.bids[player] === s.tricksWon[player]
    if (over) return made ? "made" : "miss"
    return ""
  }

  // seat-relative bid/trick/score accessors
  const myBid = s.bids[me]
  const foeBid = s.bids[foe]
  const myTricks = s.tricksWon[me]
  const foeTricks = s.tricksWon[foe]

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Skull King · bid & plunder"
        title="Skull King"
        subtitle="wager the tricks you'll seize, then sail your hand to hit the number exactly"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Round ${s.round} / 10`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="tablecol">
          <div className="oppstrip">
            <div className="opp-id">
              <span className="opp-name">{foeName}</span>
              <span className="opp-meta">{foeHandCount} card{foeHandCount === 1 ? "" : "s"} in hand</span>
            </div>
            <div className="opp-hand">
              {Array.from({ length: foeHandCount }, (_, i) => <div className="cardback" key={i}></div>)}
            </div>
            <div className="opp-tag">
              <div className="opp-stat foe"><b>{foeBid == null ? "—" : foeBid}</b><span>bid</span></div>
              <div className="opp-stat foe"><b>{foeTricks}</b><span>won</span></div>
              <div className="opp-stat foe"><b>{foeScore}</b><span>score</span></div>
            </div>
          </div>

          <div className="felt">{FeltContent()}</div>

          <div className="handrow">
            <div className="hand-label">
              <span className="hl-name">Your Hand</span>
              <span className="hl-hint">{myTurnPlay ? (s.trick.length ? "follow suit if you can — specials are always legal" : "lead any card") : s.phase === "bid" ? "study your hand, then wager" : "—"}</span>
              <span className="hl-stat">bid {myBid == null ? "—" : myBid} · won {myTricks} · {myScore} pts</span>
            </div>
            <div className={"hand-cards" + (myTurnPlay ? "" : " locked")}>
              {hand.length === 0
                ? <div className="felt-hint" style={{ padding: "30px 0" }}>Hand played out.</div>
                : hand.map(c => {
                  const playable = myTurnPlay && legalIds.has(c.id)
                  const illegal = myTurnPlay && !legalIds.has(c.id)
                  return <Card key={c.id} card={c} className={playable ? "playable" : ""} illegal={illegal}
                    onClick={playable ? () => clickHandCard(c) : undefined} />
                })}
            </div>
          </div>
        </div>

        <div className="side">
          <OnlineBar net={net} />

          {s.phase === "bid" && myTurnBid ? (
            <div className="panel bidbox">
              <div className="bid-prompt">How many tricks will you take in <b>round {s.round}</b>?</div>
              <div className="bid-grid">
                {Array.from({ length: s.round + 1 }, (_, i) => (
                  <button key={i} className={"bid-chip" + (bidSel === i ? " sel" : "")} onClick={() => setBidSel(i)}>{i}</button>
                ))}
              </div>
              <button className="bid-confirm" disabled={bidSel == null} onClick={confirmBid}>
                {bidSel == null ? "Choose a wager" : `Wager ${bidSel} trick${bidSel === 1 ? "" : "s"}`}
              </button>
            </div>
          ) : (
            <div className="panel bidbox">
              <div className="panel-l">This round</div>
              <div className="bid-status">
                <div className="bid-stat you">
                  <div className="bs-who">{meName}</div>
                  <div className="bs-val"><span className={madeClass(me)}>{myTricks}</span> / {myBid == null ? "—" : myBid}</div>
                  <div className="bs-sub">won / bid</div>
                </div>
                <div className="bid-stat foe">
                  <div className="bs-who">{foeShort}</div>
                  <div className="bs-val"><span className={madeClass(foe)}>{foeTricks}</span> / {foeBid == null ? "—" : foeBid}</div>
                  <div className="bs-sub">won / bid</div>
                </div>
              </div>
            </div>
          )}

          <div className="panel scoreboard">
            <div className="sb-tot">
              <div className="sbt you"><div className="who">{meName}</div><div className="pts">{myScore}</div></div>
              <div className="sbt foe"><div className="who">{foeShort}</div><div className="pts">{foeScore}</div></div>
            </div>
            <div className="sb-head"><span>R</span><span>{meName}</span><span>{foeShort}</span></div>
            <div className="sb-rows">
              {s.roundLog.length === 0 && <div className="sb-row"><span className="rd">—</span><span className="sb-cell">no rounds yet</span><span></span></div>}
              {s.roundLog.map(r => {
                const mine = me === 'you' ? r.you : r.ai
                const theirs = me === 'you' ? r.ai : r.you
                return (
                  <div className="sb-row" key={r.round}>
                    <span className="rd">{r.round}</span>
                    <span className="sb-cell"><span className="bt">{mine.tricks}/{mine.bid}</span><span className={"dl " + (mine.delta >= 0 ? "pos" : "neg")}>{mine.delta >= 0 ? "+" : ""}{mine.delta}</span></span>
                    <span className="sb-cell"><span className="bt">{theirs.tricks}/{theirs.bid}</span><span className={"dl " + (theirs.delta >= 0 ? "pos" : "neg")}>{theirs.delta >= 0 ? "+" : ""}{theirs.delta}</span></span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.length === 0 && <div className="log-line sys">The deck is cut. Make your first wager.</div>}
            {s.log.map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {over && <WinModal myScore={myScore} foeScore={foeScore} myWon={myWon} tie={s.winner === 'tie'} foeShort={foeShort} meName={meName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function WinModal({ myScore, foeScore, myWon, tie, foeShort, meName, onNew }: {
  myScore: number; foeScore: number; myWon: boolean; tie: boolean; foeShort: string; meName: string; onNew: () => void
}) {
  return (
    <Modal
      eyebrow={tie ? "Split the bounty" : myWon ? "Captain of captains" : "Sent to the brig"}
      title={tie ? "A Dead Heat" : myWon ? "You Win" : `${foeShort} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Sail again</button>}
    >
      <div className="finalsc"><span className="fs you">{meName} {myScore}</span><span className="fs foe">{foeShort} {foeScore}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Skull King" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Set sail</button>}>
      <div className="modal-body">
        <p>Ten rounds. In round <i>R</i> you're each dealt <i>R</i> cards. First, <b>wager</b> exactly how many tricks you'll win. Then play out every trick.</p>
        <p><b>Following:</b> you must follow the led suit if you hold it — but a <i>special</i> card (Pirate, Mermaid, Skull King, Escape) may be played at any time.</p>
        <div className="rules-legend">
          <div className="rl-item"><span className="rl-swatch" style={{ background: "var(--parrot)" }}></span>Parrot, Chest, Map — number suits 1–14</div>
          <div className="rl-item"><span className="rl-swatch" style={{ background: "var(--roger)" }}></span>Jolly Roger — black trump, beats colours</div>
          <div className="rl-item"><span className="rl-swatch" style={{ background: "var(--escape)" }}></span>Escape — always loses the trick</div>
          <div className="rl-item"><span className="rl-swatch" style={{ background: "var(--mermaid)" }}></span>Mermaid — beats suits &amp; the Skull King</div>
          <div className="rl-item"><span className="rl-swatch" style={{ background: "var(--pirate)" }}></span>Pirate — beats all suits &amp; mermaids</div>
          <div className="rl-item"><span className="rl-swatch" style={{ background: "var(--sk)" }}></span>Skull King — beats pirates (mermaid sinks him)</div>
        </div>
        <p><b>Scoring:</b> hit your bid for <i>20 × tricks</i>. Miss it and lose <i>10</i> per trick over or under. A bid of <i>0</i> scores <i>±10 × the round number</i>.</p>
        <p><b>Bounty</b> (only if you hit your bid): each captured <i>14</i> is +10 (+20 for the black 14); the Skull King nets <i>+30</i> per pirate he takes; a mermaid that lands the Skull King earns <i>+40</i>.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
