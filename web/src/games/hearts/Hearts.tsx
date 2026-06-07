/* HEARTS — UI. Seat-relative trick-taking on the framework shell.
   Solo: you are seat 0 (South); West, North, East are AI — identical to before. Online:
   useGameSession drives the authority + AI for empty seats, and the local player may be
   ANY seat, so every read is relative to `mySeat`. Your seat always renders at the bottom
   (South); the other three rotate clockwise around the table. isMyTurn gates passing and
   playing; banners and the result are relative to your seat. The old useAITurn driver is
   gone — the hook ticks the AI via the adapter. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { heartsAdapter } from './net'
import * as H from './logic'
import type { Card as TCard, PassDir } from './logic'

interface LogEntry { t: string; x: string }

function CardView({ c, size, faded, dim, sel, win, back, onClick }: {
  c?: { suit: H.Suit; rank: number }; size: string; faded?: boolean; dim?: boolean; sel?: boolean; win?: boolean; back?: boolean; onClick?: () => void
}) {
  if (back || !c) {
    return <div className={['card', size, 'back'].join(' ')} />
  }
  const cls = ['card', size]
  if (H.isRed(c.suit)) cls.push('red')
  if (c.suit === 'S' && c.rank === 12) cls.push('qspade')
  if (faded) cls.push('faded')
  if (dim) cls.push('dim')
  if (sel) cls.push('sel')
  if (win) cls.push('win-card')
  return (
    <div className={cls.join(' ')} onClick={onClick}>
      <span className="crank">{H.rankLabel(c.rank)}</span>
      <span className="csuit">{H.SUIT_SYM[c.suit]}</span>
    </div>
  )
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="11" fill="#0c2719" stroke="#2c603f" strokeWidth="1.5" />
    <path d="M24 16 C22 12 16 12 16 18 C16 23 24 30 24 30 C24 30 32 23 32 18 C32 12 26 12 24 16 Z"
      fill="#d33b4e" stroke="#8e2230" strokeWidth="1" />
  </svg>
)

export function Hearts() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(heartsAdapter)
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number[]>([])      // your selected card ids while passing
  const [log, setLog] = useState<LogEntry[]>(() => [{ t: 'sys', x: openingLine(H.passDirForHand(1)) }])
  const logRef = useRef<HTMLDivElement>(null)
  const prevTrickKey = useRef('')

  function pushLog(entries: LogEntry[]) { setLog(l => l.concat(entries).slice(-60)) }

  // ---- seat-relative naming. Position south=mySeat, then clockwise W,N,E.
  function seatName(seat: number): string {
    if (seat === mySeat) return 'You'
    if (!net.online) return H.NAMES[seat]
    const info = net.seats.find(x => x.seat === seat)
    if (info && info.kind === 'guest') return info.label // "Player N"
    if (info && info.kind === 'ai') return `AI ${seat + 1}`
    return `Player ${seat + 1}`
  }
  // physical table positions are relative offsets from your seat (you sit South)
  const SOUTH = mySeat
  const WEST = (mySeat + 1) % 4
  const NORTH = (mySeat + 2) % 4
  const EAST = (mySeat + 3) % 4

  function newGame() {
    netNew(); setSel([]); setShowRules(false)
    setLog([{ t: 'sys', x: openingLine(H.passDirForHand(1)) }])
    prevTrickKey.current = ''
  }

  // ---- log trick resolutions + hand/game results as state advances
  useEffect(() => {
    if (!s.lastTrick) return
    const key = `${s.handNo}-${s.played}`
    if (key === prevTrickKey.current) return
    prevTrickKey.current = key
    const lt = s.lastTrick
    const pts = lt.cards.reduce((a, e) => a + H.cardPoints(e.card), 0)
    const playedStr = lt.cards.map(e => `${seatName(e.seat)} ${H.cardLabel(e.card)}`).join(', ')
    pushLog([{ t: pts > 0 ? 'pts' : 'ai', x: `${playedStr} — ${seatName(lt.winner)} takes the trick${pts > 0 ? ` (+${pts})` : ''}.` }])
    if (s.played === 13 && (s.phase === 'handover' || s.phase === 'gameover')) {
      const moon = s.handPoints.filter(p => p === 0).length === 1 && s.handPoints.filter(p => p === 26).length === 3
      if (moon) {
        const shooter = s.handPoints.indexOf(0)
        pushLog([{ t: 'moon', x: `🌙 ${seatName(shooter)} shot the moon! Everyone else +26.` }])
      } else {
        pushLog([{ t: 'sys', x: `Hand ${s.handNo} scored: ${s.handPoints.map((p, i) => `${seatName(i)} +${p}`).join(', ')}.` }])
      }
      if (s.phase === 'gameover' && s.winner != null) {
        pushLog([{ t: 'win', x: `Game over — ${seatName(s.winner)} win${s.winner === mySeat ? '' : 's'} with the lowest score (${s.scores[s.winner]}).` }])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.handNo, s.played, s.phase])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
  })

  const over = s.winner != null || s.phase === 'gameover'
  const passingYou = s.phase === 'passing' && isMyTurn
  const yourPlayTurn = s.phase === 'playing' && isMyTurn && !over
  const legalSet = yourPlayTurn ? new Set(H.legalPlays(s, mySeat).map(c => c.id)) : new Set<number>()

  function toggleSel(id: number) {
    if (!passingYou) return
    setSel(cur => cur.includes(id) ? cur.filter(x => x !== id) : cur.length < 3 ? cur.concat(id) : cur)
  }
  function confirmPass() {
    if (sel.length !== 3 || !passingYou) return
    const recv = H.passTarget(mySeat, s.passDir)
    dispatch({ kind: 'pass', cardIds: sel.slice() })
    pushLog([{ t: 'you', x: `You pass 3 cards ${s.passDir} to ${seatName(recv)}.` }])
    setSel([])
  }
  function playYou(c: TCard) {
    if (yourPlayTurn && legalSet.has(c.id)) dispatch({ kind: 'play', cardId: c.id })
  }

  // current trick (or last) for the table center
  const showTrick = s.trick.length ? { cards: s.trick, winner: null as number | null } : s.lastTrick
  function seatCard(p: number) { return showTrick ? (showTrick.cards.find(e => e.seat === p) || null) : null }

  // banner — relative to your seat
  let banner: string, bk = ''
  if (s.phase === 'gameover' && s.winner != null) {
    if (s.winner === mySeat) { bk = 'win'; banner = 'You win!' } else { bk = 'lose'; banner = `${seatName(s.winner)} wins` }
  } else if (s.phase === 'handover') {
    bk = 'foe'; banner = `Hand ${s.handNo} complete`
  } else if (passingYou) {
    bk = 'you'; banner = `Pass 3 cards ${s.passDir} (${sel.length}/3)`
  } else if (s.phase === 'passing') {
    bk = 'foe'; banner = net.online ? 'Waiting for everyone to pass…' : 'Passing…'
  } else if (yourPlayTurn) {
    bk = 'you'; banner = s.trick.length ? 'Your turn — follow suit' : 'Your turn — lead a card'
  } else if (s.turn != null) {
    bk = 'foe'; banner = `${seatName(s.turn)} is playing…`
  } else { banner = '…' }

  const leadScore = Math.min(...s.scores)
  const myHand = H.sortHand(s.hands[mySeat])

  function Plate({ p, area }: { p: number; area: string }) {
    const active = s.phase === 'playing' && s.turn === p && !over
    const suffix = net.online ? '' : (p === 0 ? ' (S)' : ['', ' (W)', ' (N)', ' (E)'][p])
    return (
      <div className={`plate ${area}${p === mySeat ? ' you' : ''}${active ? ' active' : ''}`}>
        <span className="pl-name">{seatName(p)}{suffix}</span>
        <div className="pl-meta">
          <span className="pl-cards">{s.hands[p].length}🂠</span>
          <span className="pl-pts"><span className="lbl">hand </span>{s.handPoints[p]}</span>
        </div>
      </div>
    )
  }

  function TrickSlot({ p, cls }: { p: number; cls: string }) {
    const e = seatCard(p)
    const isWin = showTrick != null && showTrick.winner === p
    return (
      <div className={`tc-slot ${cls}${isWin ? ' win' : ''}`}>
        {e
          ? <CardView c={e.card} size="play" faded={showTrick!.winner != null && !isWin} win={isWin} />
          : <div className="play-empty" />}
        <span className="tc-who">{seatName(p)}</span>
      </div>
    )
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Hearts · trick-taking"
        title="Hearts"
        subtitle="dodge the points — every heart stings and the Queen of Spades bites hardest"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Hand ${s.handNo} · ${s.passDir === 'hold' ? 'no pass' : 'pass ' + s.passDir} · trick ${Math.min(s.played + 1, 13)}/13`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="playcol">
          <div className="table">
            <Plate p={NORTH} area="seat-n" />
            <Plate p={WEST} area="seat-w" />
            <div className="tc trick-center">
              <TrickSlot p={NORTH} cls="tcn" />
              <TrickSlot p={WEST} cls="tcw" />
              <div className="tc-mid">
                <div className="tc-label">{s.trick.length ? 'current trick' : s.lastTrick ? 'last trick' : 'trick'}</div>
                <div className="tc-hint">{s.heartsBroken ? '♥ broken' : '♥ unbroken'}</div>
              </div>
              <TrickSlot p={EAST} cls="tce" />
              <TrickSlot p={SOUTH} cls="tcs" />
            </div>
            <Plate p={EAST} area="seat-e" />
            <Plate p={SOUTH} area="seat-s" />
          </div>

          {passingYou ? (
            <div className="passbar">
              <span className="pb-txt">Select <b>3</b> cards to pass <b>{s.passDir}</b> to <b>{seatName(H.passTarget(mySeat, s.passDir))}</b></span>
              <button className="btn-pass" disabled={sel.length !== 3} onClick={confirmPass}>Pass {sel.length}/3</button>
            </div>
          ) : null}

          <div className="youzone">
            <div className="youhead">
              <span className="yh-name">Your hand</span>
              <span className="yh-tip">{passingYou ? 'tap 3 to pass' : yourPlayTurn ? 'tap a highlighted card' : ''}</span>
            </div>
            <div className="hand">
              {myHand.map(c => {
                const isLegal = legalSet.has(c.id)
                const isSel = sel.includes(c.id)
                const clickable = passingYou || (yourPlayTurn && isLegal)
                const dim = (yourPlayTurn && !isLegal) || (passingYou && sel.length >= 3 && !isSel)
                return (
                  <div key={c.id} className="handcard">
                    <CardView
                      c={c} size="hand"
                      sel={isSel}
                      dim={dim}
                      onClick={clickable ? () => (passingYou ? toggleSel(c.id) : playYou(c)) : undefined}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel">
            <div className="panel-l">Scores · first to {H.TARGET} ends it, lowest wins</div>
            <div className="scorelist">
              {[0, 1, 2, 3].map(p => (
                <div key={p} className={`sc-row${p === mySeat ? ' you' : ''}${s.scores[p] === leadScore ? ' lead' : ''}`}>
                  <span className="sc-name">{seatName(p)}</span>
                  <span className="sc-hand">{s.handPoints[p] > 0 ? `+${s.handPoints[p]}` : ''}</span>
                  <span className="sc-total">{s.scores[p]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.phase === 'handover' && (
        <Modal
          eyebrow={`Hand ${s.handNo} done`}
          title="Scores"
          closeOnOverlay={false}
          actions={net.amHost
            ? <button className="btn-modal" onClick={() => dispatch({ kind: 'next' })}>Next hand →</button>
            : <span className="modal-wait">Waiting for the host…</span>}
        >
          <FinalScores s={s} seatName={seatName} />
        </Modal>
      )}

      {s.phase === 'gameover' && s.winner != null && (
        <Modal
          eyebrow={s.winner === mySeat ? 'Lowest score' : 'Better luck next time'}
          title={s.winner === mySeat ? 'You Win!' : `${seatName(s.winner)} Wins`}
          closeOnOverlay={false}
          actions={net.amHost
            ? <button className="btn-modal" onClick={newGame}>New game</button>
            : <span className="modal-wait">Waiting for the host…</span>}
        >
          <FinalScores s={s} seatName={seatName} />
        </Modal>
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function FinalScores({ s, seatName }: { s: H.State; seatName: (seat: number) => string }) {
  const min = Math.min(...s.scores)
  return (
    <div className="final-scores">
      {[0, 1, 2, 3].map(p => (
        <div key={p} className={`fs-row${s.scores[p] === min ? ' win' : ''}`}>
          <span>{seatName(p)}{s.handPoints[p] > 0 ? ` (+${s.handPoints[p]})` : ''}</span>
          <span>{s.scores[p]}</span>
        </div>
      ))}
    </div>
  )
}

function openingLine(dir: PassDir): string {
  return dir === 'hold' ? 'New game — no passing this hand. Holder of 2♣ leads.' : `New game — pass 3 cards ${dir}.`
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Hearts" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Deal me in</button>}>
      <div className="modal-body">
        <p><b>Goal:</b> finish with the <b>fewest</b> points. Each <i>heart</i> is 1 point and the <i>Queen of Spades</i> is 13 — points are bad.</p>
        <p>Each hand you may <b>pass 3 cards</b> — left, right, across, then a no-pass hand, cycling. Whoever holds the <b>2♣</b> leads it to the first trick.</p>
        <p><b>Follow suit</b> if you can; otherwise play anything. No points may be dropped on the very first trick, and <b>hearts can't be led</b> until they've been "broken" by being discarded on an off-suit trick. Highest card of the led suit wins the trick and leads next.</p>
        <p><b>Shoot the moon:</b> take <i>all 26</i> points in a hand and you score 0 while everyone else takes 26.</p>
        <p>The game ends when someone reaches {H.TARGET}; the <b>lowest</b> total wins.</p>
        <p>You can <b>play online</b> with up to three friends — host a table from the side panel and share the link; empty seats are filled by the AI.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
