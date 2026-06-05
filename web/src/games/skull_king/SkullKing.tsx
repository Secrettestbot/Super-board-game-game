/* SKULL KING — UI.
   Ported from design/examples/trick_skull_king/skull_king.jsx onto the framework shell.
   Exercises a multi-phase flow (bid -> play -> trickEnd -> roundEnd) with two timers:
   the AI play step (useAITurn) and the post-trick reveal pause (a collect timer). */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
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
  const [s, setS] = useState<SkullKingState>(() => SK.makeInitial("you"))
  const [bidSel, setBidSel] = useState<number | null>(null)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(SK.makeInitial("you")); setBidSel(null); setShowRules(false) }

  // AI plays its card on a timer
  useAITurn(s.phase === "play" && s.turn === "ai" && !s.winner, () => setS(p => SK.aiStep(p)), { delayMs: 720, tick: s.trick.length })
  // collect a completed trick after a reveal pause
  useEffect(() => {
    if (s.phase === "trickEnd") {
      const id = setTimeout(() => setS(p => SK.collectTrick(p)), 1080)
      return () => clearTimeout(id)
    }
  }, [s.phase, s.trick])

  useEffect(() => { setBidSel(null) }, [s.round, s.phase])
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = s.phase === "play" && s.turn === "you" && !s.winner
  const legal = yourTurn ? SK.legalPlays(s.hands.you, s.trick) : []
  const legalIds = new Set(legal.map(c => c.id))

  function clickHandCard(c: TCard) {
    if (!yourTurn || !legalIds.has(c.id)) return
    setS(SK.playCard(s, "you", c.id))
  }
  function confirmBid() { if (bidSel != null) setS(SK.submitBid(s, bidSel)) }

  // ===== banner =====
  let banner: string, bk = ""
  if (s.winner) {
    if (s.winner === "you") { bk = "win"; banner = "You hold the richest log — you win" }
    else if (s.winner === "ai") { bk = "lose"; banner = "The rival out-plundered you" }
    else { bk = ""; banner = "Even spoils — a dead heat" }
  } else if (s.phase === "bid") { bk = "you"; banner = `Wager your tricks for round ${s.round}` }
  else if (s.phase === "trickEnd" && s.pending) {
    const w = s.pending.winnerPlayer
    bk = w === "you" ? "you" : "foe"
    banner = `${w === "you" ? "You take" : "Rival takes"} the trick${s.pending.bonus ? ` · +${s.pending.bonus}` : ""}`
  } else if (s.phase === "roundEnd") { bk = ""; banner = `Round ${s.round} complete` }
  else if (yourTurn) { bk = "you"; banner = s.trick.length === 0 ? "Your turn — lead a card" : "Your turn — follow" }
  else { bk = "foe"; banner = "The rival is choosing…" }

  // ===== felt content =====
  function FeltContent() {
    if (s.phase === "bid") {
      return <div className="felt-hint" style={{ fontSize: 14 }}>Both captains seal their wagers…</div>
    }
    if (s.phase === "roundEnd") {
      const last = s.roundLog[s.roundLog.length - 1]
      return (
        <div className="continue-bar" style={{ flexDirection: "column", gap: 14, textAlign: "center" }}>
          <div className="trick-won-badge" style={{ fontSize: 22 }}>Round {last.round} settled</div>
          <div className="cb-text" style={{ fontSize: 14 }}>
            You {last.you.tricks}/{last.you.bid} → <b style={{ color: last.you.delta >= 0 ? "var(--good)" : "var(--warn)" }}>{last.you.delta >= 0 ? "+" : ""}{last.you.delta}</b>
            &nbsp;&nbsp;·&nbsp;&nbsp;
            Rival {last.ai.tricks}/{last.ai.bid} → <b style={{ color: last.ai.delta >= 0 ? "var(--good)" : "var(--warn)" }}>{last.ai.delta >= 0 ? "+" : ""}{last.ai.delta}</b>
          </div>
          <button className="btn-continue" onClick={() => setS(SK.nextRound(s))}>Deal round {s.round + 1}</button>
        </div>
      )
    }
    // play / trickEnd
    if (s.trick.length === 0) {
      return <div className="felt-hint">{s.leader === "you" ? "You lead this trick" : "Rival leads this trick"}</div>
    }
    const winIdx = s.phase === "trickEnd" && s.pending ? s.pending.winnerIdx : -1
    return (
      <div className="trick-area">
        {s.trick.map((tk, i) => (
          <div key={tk.card.id} className={"trick-slot" + (i === winIdx ? " win" : "")}>
            <Card card={tk.card} className="played-in" />
            <span className="slot-who">{tk.player === "you" ? "You" : "Rival"}{i === winIdx ? " · won" : ""}</span>
          </div>
        ))}
        {s.trick.length === 1 && s.phase === "play" && (
          <div className="trick-slot">
            <div className="empty-slot"></div>
            <span className="slot-who">{s.turn === "you" ? "You" : "Rival"}</span>
          </div>
        )}
      </div>
    )
  }

  const hand = sortHand(s.hands.you)

  function madeClass(player: Player) {
    if (s.bids[player] == null) return ""
    const made = s.bids[player] === s.tricksWon[player]
    if (s.phase === "roundEnd" || s.winner) return made ? "made" : "miss"
    return ""
  }

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
              <span className="opp-name">The Rival</span>
              <span className="opp-meta">{s.hands.ai.length} card{s.hands.ai.length === 1 ? "" : "s"} in hand</span>
            </div>
            <div className="opp-hand">
              {s.hands.ai.map((_c, i) => <div className="cardback" key={i}></div>)}
            </div>
            <div className="opp-tag">
              <div className="opp-stat foe"><b>{s.bids.ai == null ? "—" : s.bids.ai}</b><span>bid</span></div>
              <div className="opp-stat foe"><b>{s.tricksWon.ai}</b><span>won</span></div>
              <div className="opp-stat foe"><b>{s.scores.ai}</b><span>score</span></div>
            </div>
          </div>

          <div className="felt">{FeltContent()}</div>

          <div className="handrow">
            <div className="hand-label">
              <span className="hl-name">Your Hand</span>
              <span className="hl-hint">{yourTurn ? (s.trick.length ? "follow suit if you can — specials are always legal" : "lead any card") : s.phase === "bid" ? "study your hand, then wager" : "—"}</span>
              <span className="hl-stat">bid {s.bids.you == null ? "—" : s.bids.you} · won {s.tricksWon.you} · {s.scores.you} pts</span>
            </div>
            <div className={"hand-cards" + (yourTurn ? "" : " locked")}>
              {hand.length === 0
                ? <div className="felt-hint" style={{ padding: "30px 0" }}>Hand played out.</div>
                : hand.map(c => {
                  const playable = yourTurn && legalIds.has(c.id)
                  const illegal = yourTurn && !legalIds.has(c.id)
                  return <Card key={c.id} card={c} className={playable ? "playable" : ""} illegal={illegal}
                    onClick={playable ? () => clickHandCard(c) : undefined} />
                })}
            </div>
          </div>
        </div>

        <div className="side">
          {s.phase === "bid" ? (
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
                  <div className="bs-who">You</div>
                  <div className="bs-val"><span className={madeClass("you")}>{s.tricksWon.you}</span> / {s.bids.you}</div>
                  <div className="bs-sub">won / bid</div>
                </div>
                <div className="bid-stat foe">
                  <div className="bs-who">Rival</div>
                  <div className="bs-val"><span className={madeClass("ai")}>{s.tricksWon.ai}</span> / {s.bids.ai}</div>
                  <div className="bs-sub">won / bid</div>
                </div>
              </div>
            </div>
          )}

          <div className="panel scoreboard">
            <div className="sb-tot">
              <div className="sbt you"><div className="who">You</div><div className="pts">{s.scores.you}</div></div>
              <div className="sbt foe"><div className="who">Rival</div><div className="pts">{s.scores.ai}</div></div>
            </div>
            <div className="sb-head"><span>R</span><span>You</span><span>Rival</span></div>
            <div className="sb-rows">
              {s.roundLog.length === 0 && <div className="sb-row"><span className="rd">—</span><span className="sb-cell">no rounds yet</span><span></span></div>}
              {s.roundLog.map(r => (
                <div className="sb-row" key={r.round}>
                  <span className="rd">{r.round}</span>
                  <span className="sb-cell"><span className="bt">{r.you.tricks}/{r.you.bid}</span><span className={"dl " + (r.you.delta >= 0 ? "pos" : "neg")}>{r.you.delta >= 0 ? "+" : ""}{r.you.delta}</span></span>
                  <span className="sb-cell"><span className="bt">{r.ai.tricks}/{r.ai.bid}</span><span className={"dl " + (r.ai.delta >= 0 ? "pos" : "neg")}>{r.ai.delta >= 0 ? "+" : ""}{r.ai.delta}</span></span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.length === 0 && <div className="log-line sys">The deck is cut. Make your first wager.</div>}
            {s.log.map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <WinModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function WinModal({ s, onNew }: { s: SkullKingState; onNew: () => void }) {
  const won = s.winner === "you", tie = s.winner === "tie"
  return (
    <Modal
      eyebrow={tie ? "Split the bounty" : won ? "Captain of captains" : "Sent to the brig"}
      title={tie ? "A Dead Heat" : won ? "You Win" : "Rival Wins"}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Sail again</button>}
    >
      <div className="finalsc"><span className="fs you">You {s.scores.you}</span><span className="fs foe">Rival {s.scores.ai}</span></div>
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
