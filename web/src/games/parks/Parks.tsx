/* PARKS — UI (built for this codebase). A trail of 8 sites laid on the framework shell, walked by
   your two hikers vs an opponent. Click a hiker (or use its move buttons) then a glowing site to
   walk forward and take its action; gather wilderness icons, snap photos, and buy park cards when
   the season closes. Online-capable via useGameSession: the host runs the real logic, empty seats
   are filled by the greedy AI, and a guest plays the other seat seat-relative to itself.

   Seat-relative: "you" is always s.players[mySeat]; the opponent is the other seat. Banners, score
   and the result modal are all from mySeat's perspective. When net.online the opponent is a remote
   human ("Opponent"); offline it's the AI ("Rival"). Four seasons; most VP wins. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { parksAdapter } from './net'
import * as P from './logic'
import type { Player, Resource, Pool, Site } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="11" fill="#16271f" stroke="#406352" strokeWidth="1.5" />
    <circle cx="33" cy="14" r="5" fill="#efb23e" />
    <path d="M5 40 L18 19 L27 32 L33 24 L43 40 Z" fill="#2f6b41" />
    <path d="M18 19 L27 32 L21 32 L18 27 L14 32 L11 30 Z" fill="#5fae73" />
    <rect x="4" y="39" width="40" height="4" rx="1.5" fill="#56b6c2" opacity="0.7" />
  </svg>
)

function ResChip({ r, n, label }: { r: Resource; n: number; label?: boolean }) {
  return (
    <span className={'pk-chip ' + r} title={r}>
      <span className={'pk-dot ' + r} />
      {n}{label ? <span style={{ opacity: 0.6, marginLeft: 2 }}>{r[0]}</span> : null}
    </span>
  )
}

function grantChips(grant: Partial<Pool>) {
  const out: React.ReactNode[] = []
  for (const r of P.RESOURCES) {
    const n = grant[r] ?? 0
    if (n > 0) out.push(<ResChip key={r} r={r} n={n} />)
  }
  return out
}

function poolChips(pool: Pool) {
  return P.RESOURCES.map(r => <ResChip key={r} r={r} n={pool[r]} />)
}

function siteSummary(site: Site): string {
  if (site.kind === 'photo') return `Photo +${site.photoVP} VP`
  if (site.kind === 'canteen') return 'Canteen: +1 wild'
  return 'Gather'
}

export function Parks() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(parksAdapter)
  const me = mySeat as Player
  const foe = (1 - me) as Player
  const [showRules, setShowRules] = useState(false)
  const [selHiker, setSelHiker] = useState<0 | 1 | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setSelHiker(null); setShowRules(false) }

  const seasonClosing = s.winner == null && P.bothFinished(s)
  // Your interactive turn to walk a hiker (normal play, your seat, not finished).
  const yourMoveTurn = s.winner == null && isMyTurn && !seasonClosing && !s.players[me].doneSeason
  // Your season-closing window: it's your turn during closing — buy parks then finish.
  const yourCloseTurn = seasonClosing && isMyTurn

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  // Clear an invalid hiker selection if it's no longer your move.
  useEffect(() => { if (!yourMoveTurn) setSelHiker(null) }, [yourMoveTurn])

  const legal = yourMoveTurn ? P.legalMoves(s, me) : []
  const legalSitesForSel = selHiker != null
    ? new Set(legal.filter(m => m.hiker === selHiker).map(m => m.site))
    : new Set<number>()

  function pickHiker(h: 0 | 1) {
    if (!yourMoveTurn) return
    if (s.players[me].hikers[h] === P.END) return // finished hiker can't move
    setSelHiker(prev => (prev === h ? null : h))
  }

  function walkTo(site: number) {
    if (selHiker == null) return
    if (!legalSitesForSel.has(site)) return
    dispatch({ kind: 'move', hiker: selHiker, site })
    setSelHiker(null)
  }

  function buy(parkId: number) {
    if (!yourCloseTurn) return
    if (!P.canBuyPark(s, me, parkId)) return
    dispatch({ kind: 'buy', parkId })
  }

  function finishSeason() {
    if (!yourCloseTurn) return
    dispatch({ kind: 'endTurn' })
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setSelHiker(null) },
    extra: (e) => {
      if (!yourMoveTurn) return false
      if (e.key === '1') { pickHiker(0); return true }
      if (e.key === '2') { pickHiker(1); return true }
      return false
    },
  })

  const foeLabel = net.online ? `Player ${foe + 1}` : 'Rival'
  const foeNoun = net.online ? 'opponent' : 'rival ranger'

  // ---- banner ----
  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = 'You win — the most parks explored!' }
  else if (s.winner === foe) { bk = 'lose'; banner = `The ${foeNoun} explored more parks` }
  else if (s.winner === 'tie') { bk = ''; banner = 'A tie on the trail' }
  else if (yourCloseTurn) {
    bk = 'you'
    banner = 'Season closing — claim parks, then finish your turn'
  } else if (seasonClosing) {
    bk = 'foe'; banner = `Season closing — the ${foeNoun} is settling claims…`
  } else if (yourMoveTurn) {
    bk = 'you'
    banner = selHiker != null ? 'Choose a site ahead to walk to' : 'Your turn — pick a hiker, then a site'
  } else { bk = 'foe'; banner = `The ${foeNoun} is on the trail…` }

  const myP = s.players[me]
  const foeP = s.players[foe]
  // Occupants of a site, classified relative to YOU (your hikers vs the opponent's).
  const occ = (site: number) => {
    const out: { who: 'you' | 'foe'; idx: 0 | 1 }[] = []
    for (const pl of [me, foe] as Player[]) {
      for (let h = 0 as 0 | 1; h <= 1; h = (h + 1) as 0 | 1) {
        if (s.players[pl].hikers[h] === site) out.push({ who: pl === me ? 'you' : 'foe', idx: h })
      }
    }
    return out
  }

  function HikersAt({ site }: { site: number }) {
    return (
      <>
        {occ(site).map((o, i) => (
          <span key={i} className={'pk-hiker ' + o.who + (o.who === 'you' && myP.hikers[o.idx] === P.END ? ' done' : '')} />
        ))}
      </>
    )
  }

  // Your hiker tokens at the trailhead (for picking) + the opponent's resting there.
  function TrailheadHikers() {
    return (
      <div className="pk-hikers">
        {([0, 1] as const).map(h => {
          const here = myP.hikers[h] === P.TRAILHEAD
          const foeHere = foeP.hikers[h] === P.TRAILHEAD
          return (
            <span key={'y' + h} style={{ display: here || foeHere ? 'inline-flex' : 'none', gap: 3 }}>
              {here && (
                <span
                  className={'pk-hiker you' + (yourMoveTurn ? ' pick' : '') + (selHiker === h ? ' sel' : '')}
                  onClick={() => pickHiker(h)}
                />
              )}
            </span>
          )
        })}
        {/* opponent hikers resting at trailhead */}
        {([0, 1] as const).filter(h => foeP.hikers[h] === P.TRAILHEAD).map(h => (
          <span key={'f' + h} className="pk-hiker foe" />
        ))}
      </div>
    )
  }

  const canBuyAny = yourCloseTurn && s.market.some(c => P.canBuyPark(s, me, c.id))

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Parks · trail & wilderness"
        title="Parks"
        subtitle="walk the trail with two hikers, gather the four wilderness icons, snap photos, and claim the great parks across four seasons"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Season ${s.season}/${P.SEASONS} · You ${P.finalScore(myP)} VP · ${foeLabel} ${P.finalScore(foeP)} VP`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>1·2 · pick hiker &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="pk-main">
          <div className="pk-trailwrap">
            <div className="pk-trailhead-row">
              <div className="pk-cap start">
                Trailhead
                <TrailheadHikers />
              </div>

              <div className="pk-trail">
                {s.trail.map((site, i) => {
                  const isLegal = selHiker != null && legalSitesForSel.has(i)
                  const here = occ(i)
                  const isOcc = here.length > 0
                  return (
                    <div
                      key={site.id}
                      className={
                        'pk-site ' + site.kind +
                        (isOcc ? ' occupied' : '') +
                        (isLegal ? ' legal' : '')
                      }
                      onClick={isLegal ? () => walkTo(i) : undefined}
                    >
                      <span className="pk-idx">{i + 1}</span>
                      <div className="pk-kind">{site.label}</div>
                      <div className="pk-grant">
                        {site.kind === 'gain' && grantChips(site.grant)}
                        {site.kind === 'photo' && <span className="pk-chip vp">+{site.photoVP} VP</span>}
                        {site.kind === 'photo' && grantChips(site.grant)}
                        {site.kind === 'canteen' && <span className="pk-chip">+1 wild</span>}
                      </div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--ink-3)' }}>{siteSummary(site)}</div>
                      <div className="pk-occrow"><HikersAt site={i} /></div>
                    </div>
                  )
                })}
              </div>

              <div className="pk-cap end">
                Trail End
                <div className="pk-hikers"><HikersAt site={P.END} /></div>
              </div>
            </div>
          </div>

          <div className="panel pk-market">
            <div className="pk-market-head">
              <span>Park Market</span>
              <span style={{ color: 'var(--ink-3)', fontSize: '0.62rem' }}>
                {yourCloseTurn ? 'season end — buying allowed' : 'claim parks when your season closes'}
              </span>
            </div>
            <div className="pk-cards">
              {s.market.map(card => {
                const buyable = yourCloseTurn && P.canBuyPark(s, me, card.id)
                return (
                  <div
                    key={card.id}
                    className={'pk-card' + (buyable ? ' buyable' : '')}
                    onClick={buyable ? () => buy(card.id) : undefined}
                  >
                    <div className="pk-card-top">
                      <span className="pk-name">{card.name}</span>
                      <span className="pk-vp">{card.vp}</span>
                    </div>
                    <div className="pk-cost">
                      {P.RESOURCES.filter(r => card.cost[r] > 0).map(r => (
                        <ResChip key={r} r={r} n={card.cost[r]} />
                      ))}
                      {P.RESOURCES.every(r => card.cost[r] === 0) && (
                        <span style={{ fontSize: '0.66rem', color: 'var(--ink-3)' }}>free</span>
                      )}
                    </div>
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

          <div className="panel pk-score">
            <PlayerRow who="you" name="You" p={myP} on={yourMoveTurn || yourCloseTurn} />
            <PlayerRow who="foe" name={foeLabel} p={foeP} on={s.winner == null && !isMyTurn} />
          </div>

          <div className="panel pk-controls">
            {yourMoveTurn && (
              <div className="pk-hint">
                {selHiker == null
                  ? 'Pick one of your hikers (the amber dots), then click a glowing site ahead to walk and take its action.'
                  : `Hiker ${selHiker + 1} selected — click a glowing site forward of it.`}
              </div>
            )}
            {s.winner == null && !isMyTurn && (
              <div className="pk-hint">The {foeNoun} is taking their turn…</div>
            )}
            {yourCloseTurn && (
              <div className="pk-hint">Your season is over — claim any parks you can afford, then finish your turn.</div>
            )}
            {canBuyAny && (
              <div className="pk-hint" style={{ color: 'var(--accent-hi)' }}>
                You can claim a glowing park in the market.
              </div>
            )}
            {yourCloseTurn && (
              <button className="pk-btn" onClick={finishSeason}>Finish my turn</button>
            )}
            {selHiker != null && (
              <button className="pk-btn" onClick={() => setSelHiker(null)}>Cancel selection</button>
            )}
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => (
              <div key={i} className={'log-line ' + l.t}>{l.x}</div>
            ))}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal winner={s.winner} me={me} foe={foe} foeLabel={foeLabel} myP={myP} foeP={foeP} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function PlayerRow({ who, name, p, on }: { who: 'you' | 'foe'; name: string; p: P.PlayerState; on: boolean }) {
  return (
    <div className={'pk-prow' + (on ? ' on' : '')}>
      <div className="pk-prow-top">
        <span className={'pk-hiker ' + who} />
        <span className={'pk-who ' + who}>{name}</span>
        <span className="pk-vpbig">{P.finalScore(p)}<span className="u">VP</span></span>
      </div>
      <div className="pk-poolrow">{poolChips(p.pool)}</div>
      <div className="pk-meta">
        <span>parks {p.parks.length}</span>
        <span>photos {p.photos}</span>
      </div>
    </div>
  )
}

function ResultModal(
  { winner, me, foe, foeLabel, myP, foeP, onNew }:
  { winner: Player | 'tie'; me: Player; foe: Player; foeLabel: string; myP: P.PlayerState; foeP: P.PlayerState; onNew: () => void },
) {
  const a = P.finalScore(myP)
  const b = P.finalScore(foeP)
  const won = winner === me
  const tie = winner === 'tie'
  return (
    <Modal
      eyebrow={tie ? 'Trail shared' : won ? 'Summit reached' : `${foeLabel} ahead`}
      title={tie ? "It's a Tie" : won ? 'You Win' : `${foeLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        {tie ? <span className="tie">Tied at {a} VP</span>
          : won ? <span className="you">You {a} — {foeLabel} {b}</span>
            : <span className="foe">{foeLabel} {b} — You {a}</span>}
      </div>
      <div className="modal-body">
        <p style={{ textAlign: 'center', color: 'var(--ink-2)' }}>
          Parks claimed: you {myP.parks.length}, {foeLabel.toLowerCase()} {foeP.parks.length} ·
          {' '}photos: you {myP.photos}, {foeLabel.toLowerCase()} {foeP.photos}
        </p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Parks" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Hit the trail</button>}>
      <div className="modal-body">
        <p>Each season an <b>8-site trail</b> is laid. You and your opponent each have <b>two hikers</b> that start at the trailhead and walk <b>forward only</b>.</p>
        <p>On your turn, <b>pick a hiker</b> (the amber dots) then click a <b>glowing site</b> ahead of it. You can't land on a site another hiker already occupies. Taking a site grants its action: gather <b>wilderness icons</b> (sun, mountain, forest, water), snap a <b>photo</b> (+VP), or fill a <b>canteen</b> (a wild resource).</p>
        <p>When <b>both your hikers reach the trail's end</b>, your season is over. In the closing window you may <b>claim parks</b> from the market by paying their resource cost for <b>VP</b>, then <b>finish your turn</b>.</p>
        <p>After both players finish, the <b>season advances</b> with a fresh trail and hikers reset. Play <b>4 seasons</b>. Leftover resources give a small end bonus (1 VP per 3). <b>Most VP wins.</b></p>
        <p>Play solo against a greedy AI, or use the <b>online bar</b> to host or join a live two-player match.</p>
        <p><b>Keys:</b> <kbd>1</kbd>/<kbd>2</kbd> pick hiker · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel.</p>
      </div>
    </Modal>
  )
}
