/* EUCHRE — UI. 4-player partnership trick-taking. Online-capable via
   useGameSession(euchreAdapter): the hook drives the AI for every empty seat (no local
   useAITurn) and, when online, redacts other seats' private hands so they never reach you.

   Everything below is rendered relative to mySeat: YOUR hand is s.hands[mySeat], your
   partner is the seat across, your team is SEAT_TEAM[mySeat], and the four table positions
   are rotated so you always sit at the bottom. isMyTurn gates the calling and playing
   controls. When net.online the other players are shown as "Opponent" / "Player N" rather
   than the local names (You/West/North/East). Solo play is unchanged. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { euchreAdapter } from './net'
import * as E from './logic'
import type { Card as ECard, EuchreState, Suit } from './logic'

const NAMES = E.NAMES
const SEATCLS = ['eu-you', 'eu-west', 'eu-north', 'eu-east']

function Card({ c, size, faded, dim, onClick }: {
  c: ECard; size?: string; faded?: boolean; dim?: boolean; onClick?: () => void
}) {
  const cls = ['card', E.isRed(c.suit) ? 'red' : 'black']
  if (size) cls.push(size)
  if (faded) cls.push('faded')
  if (dim) cls.push('dim')
  return (
    <div className={cls.join(' ')} onClick={onClick}>
      <span className="c-rank">{E.rankLabel(c.rank)}</span>
      <span className="c-suit">{E.SUIT_GLYPH[c.suit]}</span>
    </div>
  )
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#27160e" stroke="#7a4a2c" strokeWidth="1.5" />
    <rect x="13" y="9" width="22" height="30" rx="4" fill="#f4ead2" stroke="#7a4a2c" strokeWidth="1.2" />
    <path d="M24 16 l4 5 -4 5 -4 -5 Z" fill="#c2412f" />
    <text x="24" y="35" textAnchor="middle" fontSize="9" fontFamily="serif" fontWeight="700" fill="#1c130d">J</text>
  </svg>
)

const SUIT_OPTS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']

export function Euchre() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(euchreAdapter)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setShowRules(false) }

  // Seat-relative naming. Online, other players are anonymised; your own seat is "You".
  function seatLabel(p: number): string {
    if (p === mySeat) return 'You'
    if (net.online) return p === partner ? 'Partner' : 'Opponent'
    return NAMES[p]
  }
  const partner = (mySeat + 2) % 4
  const myTeam = E.SEAT_TEAM[mySeat]
  const oppTeam = myTeam === 0 ? 1 : 0

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const trump = s.trump
  const yourCallTurn = s.winner == null && isMyTurn && (s.phase === 'round1' || s.phase === 'round2')
  const yourPlayTurn = s.winner == null && isMyTurn && s.phase === 'playing'
  const myHand = s.hands[mySeat] ?? []
  const legal = yourPlayTurn && trump != null
    ? new Set(E.legalPlays(myHand, s.trick, trump).map(c => c.id))
    : new Set<number>()

  function playYou(c: ECard) { if (yourPlayTurn && legal.has(c.id)) dispatch({ kind: 'play', cardId: c.id }) }

  // which trick to show: live trick, else the last completed trick
  const shown = s.trick.length ? { cards: s.trick, winner: null as number | null } : s.lastTrick
  function seatCard(p: number) { return shown ? (shown.cards.find(e => e.player === p) || null) : null }

  // banner — relative to your team
  let banner: string, bk = ''
  if (s.winner != null) {
    bk = s.winner === myTeam ? 'win' : 'lose'
    banner = s.winner === myTeam ? 'You win the game!' : 'Opponents win the game.'
  } else if (s.phase === 'handover') { bk = ''; banner = 'Hand over — deal the next' }
  else if (yourCallTurn) { bk = 'you'; banner = s.phase === 'round1' ? 'Order it up, or pass?' : 'Name trump, or pass?' }
  else if (yourPlayTurn) { bk = 'you'; banner = s.trick.length ? 'Your turn — follow suit' : 'Your turn — lead' }
  else if (s.phase === 'round1' || s.phase === 'round2') { bk = 'foe'; banner = `${seatLabel(s.turn!)} is deciding…` }
  else if (s.turn != null) { bk = 'foe'; banner = `${seatLabel(s.turn)} is playing…` }
  else { bk = ''; banner = 'Dealing…' }

  const turnedDown = s.phase === 'round2' && s.upcard ? s.upcard.suit : null

  // Rotate the four positions so the local player sits at the bottom (pos 0). posOf maps a
  // real seat to a screen slot relative to mySeat: you=bottom(0), left(1), top(2), right(3).
  function slotSeat(slot: number): number { return (mySeat + slot) % 4 }

  function EuSeat({ p }: { p: number }) {
    const c = seatCard(p)
    const isWinner = shown != null && shown.winner === p
    const satOut = s.alone && s.aloneSeat === p
    const isMaker = s.maker === p
    return (
      <div className={'seat ' + SEATCLS[(p - mySeat + 4) % 4] + (s.turn === p && s.winner == null ? ' active' : '') + (satOut ? ' satout' : '')}>
        <div className="seat-top">
          <span className="seat-name">{seatLabel(p)}</span>
          <span className="seat-meta">
            {isMaker && <span className="maker-tag">maker</span>}
            <span className="seat-cards">{s.hands[p].length}🂠</span>
          </span>
        </div>
        <div className="seat-tricks">tricks: <b>{s.tricksWon[p]}</b></div>
        <div className="seat-play">
          {satOut ? <span className="satout-tag">sitting out</span>
            : c ? <Card c={c.card} size="play" faded={shown!.winner != null && !isWinner} />
            : <div className="play-empty" />}
          {isWinner && <span className="won-tag">won</span>}
        </div>
      </div>
    )
  }

  const oppName = net.online ? 'Opponents' : 'West & East'
  const myTeamName = net.online ? 'You & Partner' : 'You & North'

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Euchre · partnership trick-taking"
        title="Euchre"
        subtitle="you & partner vs the opponents — call the right bower, take three tricks"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={
          <span className="score-line">
            <span className="sc you">You&nbsp;{s.scores[myTeam]}</span>
            <span className="sc-vs">·</span>
            <span className="sc foe">Them&nbsp;{s.scores[oppTeam]}</span>
            <span className="sc-to">to 10</span>
          </span>
        }
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="playcol">
          {/* trump indicator strip */}
          <div className="trumpbar">
            {trump != null ? (
              <div className="trump-on">
                <span className="tb-label">Trump</span>
                <span className={'trump-glyph ' + (E.isRed(trump) ? 'red' : 'black')}>{E.SUIT_GLYPH[trump]}</span>
                <span className="trump-name">{E.suitName(trump)}</span>
                {s.maker != null && <span className="tb-maker">· {seatLabel(s.maker)} called{s.alone ? ' (alone)' : ''}</span>}
              </div>
            ) : (
              <div className="trump-off">
                <span className="tb-label">Upcard</span>
                {s.upcard ? <Card c={s.upcard} size="mini" /> : <span className="tb-dim">turned down</span>}
                <span className="tb-phase">{s.phase === 'round1' ? 'Round 1 · order it up?' : 'Round 2 · name a suit'}</span>
              </div>
            )}
            <div className="dealer-chip">Dealer: {seatLabel(s.dealer)}</div>
          </div>

          {/* table: rotated so YOU are at the bottom. Slots: 1=left, 2=top, 3=right. */}
          <div className="tablewrap">
            <div className="tbl-top"><EuSeat p={slotSeat(2)} /></div>
            <div className="tbl-mid">
              <div className="tbl-side"><EuSeat p={slotSeat(1)} /></div>
              <div className="trick-center">
                <div className="tc-label">{shown ? (s.trick.length ? 'current trick' : 'last trick') : 'awaiting play'}</div>
                <div className="tc-grid">
                  {[2, 1, 3, 0].map(slot => {
                    const p = slotSeat(slot)
                    const e = seatCard(p)
                    const win = shown != null && shown.winner === p
                    const sat = s.alone && s.aloneSeat === p
                    return (
                      <div key={p} className={'tc-slot pos-' + slot + (win ? ' win' : '')}>
                        {sat ? <div className="play-empty out" />
                          : e ? <Card c={e.card} size="play" faded={shown!.winner != null && !win} />
                          : <div className="play-empty" />}
                        <span className="tc-who">{seatLabel(p)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="tbl-side"><EuSeat p={slotSeat(3)} /></div>
            </div>
            <div className="tbl-bot-spacer" />
          </div>

          {/* your hand + call controls */}
          <div className="youzone">
            <div className="youhead">
              <span className="yh-name">You</span>
              <span className="yh-tricks">tricks won: <b>{s.tricksWon[mySeat]}</b></span>
              {s.maker === mySeat && <span className="maker-tag">you are maker{s.alone ? ' · alone' : ''}</span>}
            </div>

            {yourCallTurn && (
              <div className="callbar">
                {s.phase === 'round1' && s.upcard ? (
                  <>
                    <span className="cb-prompt">Order up {E.suitName(s.upcard.suit)} {E.SUIT_GLYPH[s.upcard.suit]}?</span>
                    <button className="cb-btn order" onClick={() => dispatch({ kind: 'orderUp', alone: false })}>Order up</button>
                    <button className="cb-btn alone" onClick={() => dispatch({ kind: 'orderUp', alone: true })}>Alone</button>
                    <button className="cb-btn pass" onClick={() => dispatch({ kind: 'pass' })}>Pass</button>
                  </>
                ) : (
                  <>
                    <span className="cb-prompt">Name trump{turnedDown ? ` (not ${E.suitName(turnedDown)})` : ''}:</span>
                    {SUIT_OPTS.filter(su => su !== turnedDown).map(su => (
                      <span key={su} className="cb-suitgrp">
                        <button className={'cb-suit ' + (E.isRed(su) ? 'red' : 'black')} onClick={() => dispatch({ kind: 'callSuit', suit: su, alone: false })}>
                          {E.SUIT_GLYPH[su]}
                        </button>
                        <button className="cb-mini" title={`Call ${E.suitName(su)} alone`} onClick={() => dispatch({ kind: 'callSuit', suit: su, alone: true })}>alone</button>
                      </span>
                    ))}
                    <button className="cb-btn pass" onClick={() => dispatch({ kind: 'pass' })}>Pass</button>
                  </>
                )}
              </div>
            )}

            <div className="hand">
              {E.sortHand(myHand, trump).map(c => {
                const isLegal = legal.has(c.id)
                const dim = yourPlayTurn && !isLegal
                const isTrump = trump != null && E.effectiveSuit(c, trump) === trump
                return (
                  <div key={c.id} className={'handcard' + (isTrump ? ' istrump' : '')}>
                    <Card c={c} size="hand" dim={dim} onClick={yourPlayTurn && isLegal ? () => playYou(c) : undefined} />
                    {isTrump && <span className="trump-pip" />}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="side">
          <OnlineBar net={net} />
          <div className="panel scorepanel">
            <div className="panel-l">Match · first to 10</div>
            <div className="sp-rows">
              <div className="sp-row you"><span className="sp-team">{myTeamName}</span><span className="sp-val">{s.scores[myTeam]}</span></div>
              <div className="sp-row foe"><span className="sp-team">{oppName}</span><span className="sp-val">{s.scores[oppTeam]}</span></div>
            </div>
            {s.handResult && s.phase !== 'gameover' && (
              <div className="sp-last">{s.handResult.text}</div>
            )}
          </div>
          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.phase === 'handover' && s.winner == null && (
        <Modal
          eyebrow="Hand complete"
          title={s.handResult ? handTitle(s.handResult, myTeam) : 'Next hand'}
          closeOnOverlay={false}
          actions={
            isMyTurn
              ? <button className="btn-modal" onClick={() => dispatch({ kind: 'nextHand' })}>Deal next hand →</button>
              : <span className="btn-modal" aria-disabled>Waiting for host…</span>
          }
        >
          <div className="finalsc">
            {s.handResult?.text}
            <div className="fs-score">You {s.scores[myTeam]} · Them {s.scores[oppTeam]}</div>
          </div>
        </Modal>
      )}

      {s.winner != null && (
        <Modal
          eyebrow={s.winner === myTeam ? 'Victory' : 'Defeat'}
          title={s.winner === myTeam ? 'You Win!' : 'Opponents Win'}
          closeOnOverlay={false}
          actions={<button className="btn-modal" onClick={newGame}>New game</button>}
        >
          <div className="finalsc">
            Final score — You {s.scores[myTeam]} · Them {s.scores[oppTeam]}
            <div className="fs-score">{s.winner === myTeam ? 'Your partnership reached 10 first.' : 'Better luck next deal.'}</div>
          </div>
        </Modal>
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function handTitle(r: E.HandResult, myTeam: number): string {
  if (r.makerTricks >= 3) {
    if (r.makerTricks === 5) return r.alone ? 'Alone Sweep!' : 'March!'
    return r.scoringTeam === myTeam ? 'You made it' : 'They made it'
  }
  return r.scoringTeam === myTeam ? 'You euchred them!' : 'You got euchred'
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Euchre" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Deal me in</button>}>
      <div className="modal-body">
        <p>A 4-player <b>partnership</b> trick-taker with a 24-card deck (9–A). You sit with your <i>partner</i> across the table; the other two are the opponents.</p>
        <p>An <b>upcard</b> is turned up. In <b>round 1</b> each player may <i>order it up</i> (its suit becomes trump and the dealer takes it), or pass. If all pass, <b>round 2</b> lets each player <i>name any other suit</i> — and the dealer must call (stick-the-dealer).</p>
        <p>The calling team are the <b>makers</b> and must win <b>3+ tricks</b>. The <b>Right Bower</b> (Jack of trump) is the highest card; the <b>Left Bower</b> (Jack of the same colour) is the second-highest and <i>counts as trump</i>.</p>
        <p><b>Scoring:</b> makers take 3–4 = 1 pt, all 5 (march) = 2, alone + all 5 = 4. Euchred (makers fail) gives defenders 2. First to <b>10</b> wins.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
