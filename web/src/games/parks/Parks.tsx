/* PARKS — UI (built for this codebase). A trail of 8 sites laid on the framework shell, walked by
   your two hikers vs a greedy AI. Click a hiker (or use its move buttons) then a glowing site to
   walk forward and take its action; gather wilderness icons, snap photos, and buy park cards at
   season's end. The AI walks + claims over many turns and seasons, so its driver re-arms on
   s.step (useAITurn tick). Four seasons; most VP wins. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as P from './logic'
import type { ParksState, Resource, Pool, Site, ParkCard } from './logic'

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
  const [s, setS] = useState<ParksState>(() => P.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [selHiker, setSelHiker] = useState<0 | 1 | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(P.makeGame()); setSelHiker(null); setShowRules(false) }

  const yourTurn = s.winner == null && s.turn === 0 && !s.players[0].doneSeason && !P.bothFinished(s)
  const seasonClosing = s.winner == null && P.bothFinished(s)

  // The AI walks/claims across many turns + seasons; re-arm on s.step so it keeps stepping.
  useAITurn(
    s.winner == null && (s.turn === 1 || seasonClosing) && !yourTurn,
    () => setS(p => P.aiTurn(p)),
    { delayMs: 620, tick: s.step },
  )

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])

  // Clear an invalid hiker selection if the turn changes.
  useEffect(() => { if (!yourTurn) setSelHiker(null) }, [yourTurn])

  const legal = yourTurn ? P.legalMoves(s, 0) : []
  const legalSitesForSel = selHiker != null
    ? new Set(legal.filter(m => m.hiker === selHiker).map(m => m.site))
    : new Set<number>()

  function pickHiker(h: 0 | 1) {
    if (!yourTurn) return
    if (s.players[0].hikers[h] === P.END) return // finished hiker can't move
    setSelHiker(prev => (prev === h ? null : h))
  }

  function walkTo(site: number) {
    if (selHiker == null) return
    if (!legalSitesForSel.has(site)) return
    setS(p => P.moveHiker(p, 0, selHiker, site))
    setSelHiker(null)
  }

  function buy(parkId: number) {
    if (!P.canBuyPark(s, 0, parkId)) return
    setS(p => P.buyPark(p, 0, parkId))
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setSelHiker(null) },
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === '1') { pickHiker(0); return true }
      if (e.key === '2') { pickHiker(1); return true }
      return false
    },
  })

  // ---- banner ----
  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'You win — the most parks explored!' }
  else if (s.winner === 1) { bk = 'lose'; banner = 'The ranger rival explored more parks' }
  else if (s.winner === 'tie') { bk = ''; banner = 'A tie on the trail' }
  else if (seasonClosing) { bk = 'foe'; banner = 'Season closing — claims are settled…' }
  else if (yourTurn) {
    bk = 'you'
    banner = selHiker != null ? 'Choose a site ahead to walk to' : 'Your turn — pick a hiker, then a site'
  } else { bk = 'foe'; banner = 'The rival ranger is on the trail…' }

  const p0 = s.players[0]
  const p1 = s.players[1]
  const occ = (site: number) => {
    const out: { who: 'you' | 'foe'; idx: 0 | 1 }[] = []
    for (let pl = 0 as 0 | 1; pl <= 1; pl = (pl + 1) as 0 | 1) {
      for (let h = 0 as 0 | 1; h <= 1; h = (h + 1) as 0 | 1) {
        if (s.players[pl].hikers[h] === site) out.push({ who: pl === 0 ? 'you' : 'foe', idx: h })
      }
    }
    return out
  }

  function HikersAt({ site }: { site: number }) {
    return (
      <>
        {occ(site).map((o, i) => (
          <span key={i} className={'pk-hiker ' + o.who + (o.who === 'you' && s.players[0].hikers[o.idx] === P.END ? ' done' : '')} />
        ))}
      </>
    )
  }

  // Player 0 hiker tokens at trailhead (for picking).
  function TrailheadHikers() {
    return (
      <div className="pk-hikers">
        {([0, 1] as const).map(h => {
          const here = p0.hikers[h] === P.TRAILHEAD
          const foeHere = p1.hikers[h] === P.TRAILHEAD
          return (
            <span key={'y' + h} style={{ display: here || foeHere ? 'inline-flex' : 'none', gap: 3 }}>
              {here && (
                <span
                  className={'pk-hiker you' + (yourTurn ? ' pick' : '') + (selHiker === h ? ' sel' : '')}
                  onClick={() => pickHiker(h)}
                />
              )}
            </span>
          )
        })}
        {/* foe hikers resting at trailhead */}
        {([0, 1] as const).filter(h => p1.hikers[h] === P.TRAILHEAD).map(h => (
          <span key={'f' + h} className="pk-hiker foe" />
        ))}
      </div>
    )
  }

  const canBuyAny = !P.bothFinished(s) && s.market.some(c => P.canBuyPark(s, 0, c.id))

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Parks · trail & wilderness"
        title="Parks"
        subtitle="walk the trail with two hikers, gather the four wilderness icons, snap photos, and claim the great parks across four seasons"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Season ${s.season}/${P.SEASONS} · You ${P.finalScore(p0)} VP · Rival ${P.finalScore(p1)} VP`}
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
                {seasonClosing ? 'season end — buying allowed' : 'buy a park you can afford'}
              </span>
            </div>
            <div className="pk-cards">
              {s.market.map(card => {
                const buyable = yourTurn || seasonClosing ? P.canBuyPark(s, 0, card.id) : false
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
          <div className="panel pk-score">
            <PlayerRow who="you" name="You" p={p0} on={yourTurn} />
            <PlayerRow who="foe" name="Rival" p={p1} on={s.turn === 1 && s.winner == null && !seasonClosing} />
          </div>

          <div className="panel pk-controls">
            {yourTurn && (
              <div className="pk-hint">
                {selHiker == null
                  ? 'Pick one of your hikers (the amber dots), then click a glowing site ahead to walk and take its action.'
                  : `Hiker ${selHiker + 1} selected — click a glowing site forward of it.`}
              </div>
            )}
            {!yourTurn && s.winner == null && !seasonClosing && (
              <div className="pk-hint">The rival ranger is walking the trail…</div>
            )}
            {seasonClosing && <div className="pk-hint">Both finished — claims are settled and the next season is laid.</div>}
            {(yourTurn || seasonClosing) && canBuyAny && (
              <div className="pk-hint" style={{ color: 'var(--accent-hi)' }}>
                You can claim a glowing park in the market.
              </div>
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

      {s.winner != null && <ResultModal s={s} onNew={newGame} />}
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

function ResultModal({ s, onNew }: { s: ParksState; onNew: () => void }) {
  const a = P.finalScore(s.players[0])
  const b = P.finalScore(s.players[1])
  const won = s.winner === 0
  const tie = s.winner === 'tie'
  return (
    <Modal
      eyebrow={tie ? 'Trail shared' : won ? 'Summit reached' : 'Rival ahead'}
      title={tie ? "It's a Tie" : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        {tie ? <span className="tie">Tied at {a} VP</span>
          : won ? <span className="you">You {a} — Rival {b}</span>
            : <span className="foe">Rival {b} — You {a}</span>}
      </div>
      <div className="modal-body">
        <p style={{ textAlign: 'center', color: 'var(--ink-2)' }}>
          Parks claimed: you {s.players[0].parks.length}, rival {s.players[1].parks.length} ·
          {' '}photos: you {s.players[0].photos}, rival {s.players[1].photos}
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
        <p>Each season an <b>8-site trail</b> is laid. You and the rival each have <b>two hikers</b> that start at the trailhead and walk <b>forward only</b>.</p>
        <p>On your turn, <b>pick a hiker</b> (the amber dots) then click a <b>glowing site</b> ahead of it. You can't land on a site another hiker already occupies. Taking a site grants its action: gather <b>wilderness icons</b> (sun, mountain, forest, water), snap a <b>photo</b> (+VP), or fill a <b>canteen</b> (a wild resource).</p>
        <p>When <b>both your hikers reach the trail's end</b>, your season is over. You may <b>claim parks</b> from the market by paying their resource cost for <b>VP</b> — do it whenever you can afford one.</p>
        <p>After both players finish, the <b>season advances</b> with a fresh trail and hikers reset. Play <b>4 seasons</b>. Leftover resources give a small end bonus (1 VP per 3). <b>Most VP wins.</b></p>
        <p><b>Keys:</b> <kbd>1</kbd>/<kbd>2</kbd> pick hiker · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel.</p>
      </div>
    </Modal>
  )
}
