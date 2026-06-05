/* HEARTS — UI.
   You are South (seat 0); West, North, East are AI. Four AI cards may resolve in sequence
   within a trick AND across many tricks while it's "not your turn", so the useAITurn `tick`
   must change on EVERY single AI play. We use `${handNo}-${played}-${trickLen}-${turn}`,
   which is unique per ply (a played card advances either trick.length or played+leader). */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as H from './logic'
import type { Card as TCard, State } from './logic'

const NAMES = H.NAMES

interface LogEntry { t: string; x: string }

function CardView({ c, size, faded, dim, sel, win, onClick }: {
  c: { suit: H.Suit; rank: number }; size: string; faded?: boolean; dim?: boolean; sel?: boolean; win?: boolean; onClick?: () => void
}) {
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
  const [s, setS] = useState<State>(() => H.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number[]>([])      // your selected card ids while passing
  const [log, setLog] = useState<LogEntry[]>(() => [{ t: 'sys', x: openingLine(H.passDirForHand(1)) }])
  const logRef = useRef<HTMLDivElement>(null)
  const prevTrickKey = useRef('')

  function pushLog(entries: LogEntry[]) { setLog(l => l.concat(entries).slice(-60)) }

  function newGame() {
    const g = H.makeGame()
    setS(g); setSel([]); setShowRules(false)
    setLog([{ t: 'sys', x: openingLine(g.passDir) }])
    prevTrickKey.current = ''
  }

  // ---- AI driver: three AI seats may play in sequence within a trick, and AI seats lead
  // many tricks while you're idle. `tick` changes on every ply so the timer re-arms each time.
  const aiActive = s.phase === 'playing' && s.turn != null && s.turn !== 0 && s.winner == null
  useAITurn(aiActive, () => setS(p => H.aiPlay(p, p.turn!)), {
    delayMs: 560,
    tick: `${s.handNo}-${s.played}-${s.trick.length}-${s.turn}`,
  })

  // ---- log trick resolutions + hand/game results as state advances
  useEffect(() => {
    if (!s.lastTrick) return
    const key = `${s.handNo}-${s.played}`
    if (key === prevTrickKey.current) return
    prevTrickKey.current = key
    const lt = s.lastTrick
    const pts = lt.cards.reduce((a, e) => a + H.cardPoints(e.card), 0)
    const playedStr = lt.cards.map(e => `${NAMES[e.seat]} ${H.cardLabel(e.card)}`).join(', ')
    pushLog([{ t: pts > 0 ? 'pts' : 'ai', x: `${playedStr} — ${NAMES[lt.winner]} takes the trick${pts > 0 ? ` (+${pts})` : ''}.` }])
    if (s.played === 13 && (s.phase === 'handover' || s.phase === 'gameover')) {
      const moon = s.handPoints.filter(p => p === 0).length === 1 && s.handPoints.filter(p => p === 26).length === 3
      if (moon) {
        const shooter = s.handPoints.indexOf(0)
        pushLog([{ t: 'moon', x: `🌙 ${NAMES[shooter]} shot the moon! Everyone else +26.` }])
      } else {
        pushLog([{ t: 'sys', x: `Hand ${s.handNo} scored: ${s.handPoints.map((p, i) => `${NAMES[i]} +${p}`).join(', ')}.` }])
      }
      if (s.phase === 'gameover' && s.winner != null) {
        pushLog([{ t: 'win', x: `Game over — ${NAMES[s.winner]} win${s.winner === 0 ? '' : 's'} with the lowest score (${s.scores[s.winner]}).` }])
      }
    }
  }, [s.handNo, s.played, s.phase])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
  })

  const yourPlayTurn = s.phase === 'playing' && s.turn === 0 && s.winner == null
  const legalSet = yourPlayTurn ? new Set(H.legalPlays(s, 0).map(c => c.id)) : new Set<number>()
  const passingYou = s.phase === 'passing'

  function toggleSel(id: number) {
    if (!passingYou) return
    setSel(cur => cur.includes(id) ? cur.filter(x => x !== id) : cur.length < 3 ? cur.concat(id) : cur)
  }
  function confirmPass() {
    if (sel.length !== 3) return
    const picks = [sel, H.aiPass(s, 1), H.aiPass(s, 2), H.aiPass(s, 3)]
    const recv = H.passTarget(0, s.passDir)
    const g = H.applyPass(s, picks)
    pushLog([{ t: 'you', x: `You pass 3 cards ${s.passDir} to ${NAMES[recv]}.` }])
    setSel([]); setS(g)
  }
  function playYou(c: TCard) { if (yourPlayTurn && legalSet.has(c.id)) setS(H.playCard(s, 0, c.id)) }

  // current trick (or last) for the table center
  const showTrick = s.trick.length ? { cards: s.trick, winner: null as number | null } : s.lastTrick
  function seatCard(p: number) { return showTrick ? (showTrick.cards.find(e => e.seat === p) || null) : null }

  // banner
  let banner: string, bk = ''
  if (s.phase === 'gameover' && s.winner != null) {
    if (s.winner === 0) { bk = 'win'; banner = 'You win!' } else { bk = 'lose'; banner = `${NAMES[s.winner]} wins` }
  } else if (s.phase === 'handover') {
    bk = 'foe'; banner = `Hand ${s.handNo} complete`
  } else if (passingYou) {
    bk = 'you'; banner = `Pass 3 cards ${s.passDir} (${sel.length}/3)`
  } else if (yourPlayTurn) {
    bk = 'you'; banner = s.trick.length ? 'Your turn — follow suit' : 'Your turn — lead a card'
  } else if (s.turn != null) {
    bk = 'foe'; banner = `${NAMES[s.turn]} is playing…`
  } else { banner = '…' }

  const leadScore = Math.min(...s.scores)

  function Plate({ p, area }: { p: number; area: string }) {
    const active = s.phase === 'playing' && s.turn === p && s.winner == null
    return (
      <div className={`plate ${area}${p === 0 ? ' you' : ''}${active ? ' active' : ''}`}>
        <span className="pl-name">{NAMES[p]}{p === 0 ? ' (S)' : ['', ' (W)', ' (N)', ' (E)'][p]}</span>
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
        <span className="tc-who">{NAMES[p]}</span>
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
            <Plate p={2} area="seat-n" />
            <Plate p={1} area="seat-w" />
            <div className="tc trick-center">
              <TrickSlot p={2} cls="tcn" />
              <TrickSlot p={1} cls="tcw" />
              <div className="tc-mid">
                <div className="tc-label">{s.trick.length ? 'current trick' : s.lastTrick ? 'last trick' : 'trick'}</div>
                <div className="tc-hint">{s.heartsBroken ? '♥ broken' : '♥ unbroken'}</div>
              </div>
              <TrickSlot p={3} cls="tce" />
              <TrickSlot p={0} cls="tcs" />
            </div>
            <Plate p={3} area="seat-e" />
            <Plate p={0} area="seat-s" />
          </div>

          {passingYou ? (
            <div className="passbar">
              <span className="pb-txt">Select <b>3</b> cards to pass <b>{s.passDir}</b> to <b>{NAMES[H.passTarget(0, s.passDir)]}</b></span>
              <button className="btn-pass" disabled={sel.length !== 3} onClick={confirmPass}>Pass {sel.length}/3</button>
            </div>
          ) : null}

          <div className="youzone">
            <div className="youhead">
              <span className="yh-name">Your hand</span>
              <span className="yh-tip">{passingYou ? 'tap 3 to pass' : yourPlayTurn ? 'tap a highlighted card' : ''}</span>
            </div>
            <div className="hand">
              {H.sortHand(s.hands[0]).map(c => {
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
            <div className="panel-l">Scores · first to {H.TARGET} ends it, lowest wins</div>
            <div className="scorelist">
              {[0, 1, 2, 3].map(p => (
                <div key={p} className={`sc-row${p === 0 ? ' you' : ''}${s.scores[p] === leadScore ? ' lead' : ''}`}>
                  <span className="sc-name">{NAMES[p]}</span>
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
          actions={<button className="btn-modal" onClick={() => setS(H.nextHand(s))}>Next hand →</button>}
        >
          <FinalScores s={s} />
        </Modal>
      )}

      {s.phase === 'gameover' && s.winner != null && (
        <Modal
          eyebrow={s.winner === 0 ? 'Lowest score' : 'Better luck next time'}
          title={s.winner === 0 ? 'You Win!' : `${NAMES[s.winner]} Wins`}
          closeOnOverlay={false}
          actions={<button className="btn-modal" onClick={newGame}>New game</button>}
        >
          <FinalScores s={s} />
        </Modal>
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function FinalScores({ s }: { s: State }) {
  const min = Math.min(...s.scores)
  return (
    <div className="final-scores">
      {[0, 1, 2, 3].map(p => (
        <div key={p} className={`fs-row${s.scores[p] === min ? ' win' : ''}`}>
          <span>{NAMES[p]}{s.handPoints[p] > 0 ? ` (+${s.handPoints[p]})` : ''}</span>
          <span>{s.scores[p]}</span>
        </div>
      ))}
    </div>
  )
}

function openingLine(dir: H.PassDir): string {
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
        <p>The game ends when someone reaches {H.TARGET}; the <b>lowest</b> total wins. You are <b>South</b>.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
