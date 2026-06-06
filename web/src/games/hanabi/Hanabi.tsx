/* HANABI — UI (built for this codebase).
   A COOPERATIVE firework game on the framework shell. You are player 0 with two AI
   partners (Iris, Juno). The KEY TWIST: every player holds their cards FACING OUTWARD,
   so YOUR OWN hand is shown FACE-DOWN — only the clue knowledge you've legitimately
   received is revealed — while your partners' hands are FACE-UP for you to clue.

   The two AI partners take consecutive turns, so the AI driver re-arms on s.step
   (useAITurn tick) — a monotonic counter that changes on every AI action. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as H from './logic'
import type { HanabiState, HeldCard, Clue, Color, Value } from './logic'

const NAMES = H.PLAYER_NAMES
const COLORS = H.COLORS

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#0c1230" stroke="#27306a" strokeWidth="1.5" />
    <g stroke="#ff5d73" strokeWidth="1.4" strokeLinecap="round" opacity="0.95">
      <path d="M24 24 L24 13" /><path d="M24 24 L33 19" /><path d="M24 24 L31 30" />
    </g>
    <g stroke="#5ad1ff" strokeWidth="1.3" strokeLinecap="round" opacity="0.9">
      <path d="M24 24 L15 19" /><path d="M24 24 L17 31" /><path d="M24 24 L24 34" />
    </g>
    <circle cx="24" cy="13" r="1.6" fill="#ffd34d" />
    <circle cx="33" cy="19" r="1.4" fill="#7dffb0" />
    <circle cx="15" cy="19" r="1.4" fill="#5ad1ff" />
    <circle cx="24" cy="34" r="1.5" fill="#c89bff" />
    <circle cx="24" cy="24" r="2.4" fill="#fff7d6" />
  </svg>
)

const RATINGS: Array<[number, string]> = [
  [25, 'Legendary — a flawless display!'],
  [22, 'Extraordinary — the crowd roars'],
  [18, 'Excellent — a memorable show'],
  [15, 'Honourable — a fine display'],
  [11, 'Mediocre — a few sparks'],
  [6, 'Poor — boos from the crowd'],
  [0, 'A damp squib'],
]
function ratingFor(score: number): string {
  for (const [thresh, label] of RATINGS) if (score >= thresh) return label
  return RATINGS[RATINGS.length - 1][1]
}

function CardFace({ color, value }: { color: Color; value: Value }) {
  return (
    <div className={'hb-card color-' + color}>
      <span className="hb-pip tl">{value}</span>
      <span className="hb-glyph">✦</span>
      <span className="hb-pip br">{value}</span>
    </div>
  )
}

/** YOUR card — face DOWN. Shows only what clues have legitimately revealed. */
function HiddenCard({ hc, idx, selected, onClick }: { hc: HeldCard; idx: number; selected: boolean; onClick?: () => void }) {
  const k = hc.known
  const colorTxt = k.colors.length === 1 ? k.colors[0] : k.colors.length < 5 ? k.colors.join('/') : '?'
  const valueTxt = k.values.length === 1 ? String(k.values[0]) : k.values.length < 5 ? k.values.join('') : '?'
  const clued = k.colorClued || k.valueClued
  return (
    <div className={'hb-card hb-back' + (clued ? ' clued' : '') + (selected ? ' sel' : '')} onClick={onClick}>
      <span className="hb-slot">{idx + 1}</span>
      <span className={'hb-known kn-color ' + (k.colors.length === 1 ? 'color-' + k.colors[0] + '-txt' : '')}>{colorTxt}</span>
      <span className="hb-known kn-value">{valueTxt}</span>
    </div>
  )
}

export function Hanabi() {
  const [s, setS] = useState<HanabiState>(() => H.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null) // selected card in YOUR hand
  const [clueTo, setClueTo] = useState<number | null>(null) // partner we're cluing
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() {
    setS(H.makeGame())
    setSel(null)
    setClueTo(null)
    setShowRules(false)
  }

  // 3 players: your two AI partners take consecutive turns. `active` while it's an AI
  // partner's turn and the game isn't over; re-arm on s.step (changes every AI action).
  useAITurn(!s.gameOver && s.turn !== 0, () => setS((p) => H.aiTurn(p)), { delayMs: 760, tick: s.step })

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [s.log])
  useEffect(() => {
    setSel(null)
    setClueTo(null)
  }, [s.turn])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => {
      if (clueTo != null) setClueTo(null)
      else if (sel != null) setSel(null)
      else setShowRules(false)
    },
  })

  const yourTurn = !s.gameOver && s.turn === 0
  const sc = H.score(s)

  let banner: string, bk = ''
  if (s.gameOver) {
    bk = sc >= 18 ? 'win' : sc <= 6 ? 'lose' : 'you'
    banner = `Display over — ${sc} / 25 · ${ratingFor(sc)}`
  } else if (yourTurn) {
    bk = 'you'
    banner = clueTo != null ? `Clue ${NAMES[clueTo]} — pick a colour or value` : sel != null ? 'Play or discard the selected card' : 'Your turn — clue a partner, or pick your own card'
  } else {
    bk = 'foe'
    banner = `${NAMES[s.turn]} is deciding…`
  }

  function doPlay() {
    if (yourTurn && sel != null) {
      setS(H.playCard(s, 0, sel))
      setSel(null)
    }
  }
  function doDiscard() {
    if (yourTurn && sel != null && s.clueTokens < H.MAX_CLUES) {
      setS(H.discard(s, 0, sel))
      setSel(null)
    } else if (yourTurn && sel != null && s.clueTokens >= H.MAX_CLUES) {
      // Cannot discard at full clue tokens — keep selection, no-op.
    }
  }
  function giveClue(to: number, clue: Clue) {
    if (!yourTurn || s.clueTokens <= 0) return
    // Must match at least one card (illegal otherwise) — guard for a clean UX.
    const matches = s.hands[to].some((hc) => (clue.kind === 'color' ? hc.card.color === clue.color : hc.card.value === clue.value))
    if (!matches) return
    setS(H.giveClue(s, 0, to, clue))
    setClueTo(null)
  }

  // Which clue buttons are legal for the partner currently being clued.
  const clueHand = clueTo != null ? s.hands[clueTo] : []
  const liveColors = new Set(clueHand.map((hc) => hc.card.color))
  const liveValues = new Set(clueHand.map((hc) => hc.card.value))

  function PartnerHand({ p }: { p: number }) {
    const hand = s.hands[p]
    const active = !s.gameOver && s.turn === p
    const choosing = yourTurn && clueTo === p
    return (
      <div className={'hb-partner' + (active ? ' active' : '') + (choosing ? ' choosing' : '')}>
        <div className="hb-phead">
          <span className="hb-pname">{NAMES[p]}</span>
          <span className="hb-pmeta">{hand.length} cards</span>
          {yourTurn && s.clueTokens > 0 && (
            <button className={'hb-cluebtn' + (choosing ? ' on' : '')} onClick={() => setClueTo(choosing ? null : p)}>
              {choosing ? 'cancel' : 'clue'}
            </button>
          )}
        </div>
        <div className="hb-hand">
          {hand.map((hc) => (
            <div key={hc.card.id} className="hb-cardwrap">
              <CardFace color={hc.card.color} value={hc.card.value} />
              {(hc.known.colorClued || hc.known.valueClued) && <span className="hb-cluedot" title="has a clue" />}
            </div>
          ))}
        </div>
        {choosing && (
          <div className="hb-clueopts">
            <div className="hb-clab">colour</div>
            <div className="hb-cluerow">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={'hb-cchip color-' + c + (liveColors.has(c) ? '' : ' dead')}
                  disabled={!liveColors.has(c)}
                  onClick={() => giveClue(p, { kind: 'color', color: c })}
                >
                  {c[0].toUpperCase()}
                </button>
              ))}
            </div>
            <div className="hb-clab">value</div>
            <div className="hb-cluerow">
              {([1, 2, 3, 4, 5] as Value[]).map((v) => (
                <button
                  key={v}
                  className={'hb-vchip' + (liveValues.has(v) ? '' : ' dead')}
                  disabled={!liveValues.has(v)}
                  onClick={() => giveClue(p, { kind: 'value', value: v })}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Hanabi · co-op fireworks"
        title="Hanabi"
        subtitle="a silent fireworks display — you can see everyone's cards but your own; clue your partners to a perfect 25"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Score ${sc} / 25 · ${s.deck.length} in deck`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click a card · N · new &nbsp; ? · rules</>}
      >
        <div className="hb-table">
          {/* Fireworks + tokens */}
          <div className="hb-stacks">
            <div className="hb-stacksrow">
              {COLORS.map((c) => {
                const h = s.fireworks[c]
                return (
                  <div key={c} className={'hb-stack color-' + c + (h === 5 ? ' done' : '')}>
                    <div className="hb-stacknum">{h === 0 ? '–' : h}</div>
                    <div className="hb-stacklbl">{c}</div>
                  </div>
                )
              })}
            </div>
            <div className="hb-tokens">
              <div className="hb-tokgroup">
                <span className="hb-toklab">clues</span>
                <span className="hb-toknum clue">{s.clueTokens}<i>/{H.MAX_CLUES}</i></span>
                <span className="hb-pips">
                  {Array.from({ length: H.MAX_CLUES }, (_, i) => (
                    <span key={i} className={'hb-tpip clue' + (i < s.clueTokens ? '' : ' off')} />
                  ))}
                </span>
              </div>
              <div className="hb-tokgroup">
                <span className="hb-toklab">fuses</span>
                <span className="hb-toknum fuse">{s.fuseTokens}<i>/{H.MAX_FUSES}</i></span>
                <span className="hb-pips">
                  {Array.from({ length: H.MAX_FUSES }, (_, i) => (
                    <span key={i} className={'hb-tpip fuse' + (i < s.fuseTokens ? '' : ' off')} />
                  ))}
                </span>
              </div>
            </div>
          </div>

          {/* Partners (face up) */}
          <div className="hb-partners">
            <PartnerHand p={1} />
            <PartnerHand p={2} />
          </div>

          {/* Your hand (face down — only clue knowledge shown) */}
          <div className={'hb-you' + (yourTurn ? ' active' : '')}>
            <div className="hb-phead">
              <span className="hb-pname you">You</span>
              <span className="hb-pmeta">your cards face away — you only know what you've been told</span>
            </div>
            <div className="hb-hand yourhand">
              {s.hands[0].map((hc, i) => (
                <HiddenCard
                  key={hc.card.id}
                  hc={hc}
                  idx={i}
                  selected={sel === i}
                  onClick={yourTurn ? () => { setSel(sel === i ? null : i); setClueTo(null) } : undefined}
                />
              ))}
            </div>
            {yourTurn && (
              <div className="hb-actions">
                <button className="hb-act play" disabled={sel == null} onClick={doPlay}>Play card</button>
                <button
                  className="hb-act discard"
                  disabled={sel == null || s.clueTokens >= H.MAX_CLUES}
                  onClick={doDiscard}
                  title={s.clueTokens >= H.MAX_CLUES ? 'clue tokens are full — cannot discard' : undefined}
                >
                  Discard
                </button>
                <span className="hb-acthint">
                  {sel == null ? 'select one of your cards, or clue a partner above' : 'play it onto its firework, or discard to regain a clue'}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="side">
          <div className="panel hb-discardpanel">
            <div className="panel-l">Discard pile</div>
            <div className="hb-discardgrid">
              {COLORS.map((c) => {
                const cards = s.discard.filter((d) => d.color === c).map((d) => d.value).sort((a, b) => a - b)
                return (
                  <div key={c} className="hb-drow">
                    <span className={'hb-dswatch color-' + c} />
                    <span className="hb-dvals">{cards.length ? cards.join(' ') : '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => (
              <div key={i} className={'log-line ' + l.t}>{l.x}</div>
            ))}
          </div>
        </div>
      </GameShell>

      {s.gameOver && <ResultModal score={sc} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ score, onNew }: { score: number; onNew: () => void }) {
  const great = score >= 18
  return (
    <Modal
      eyebrow={great ? 'The crowd cheers' : 'The smoke clears'}
      title={`${score} / 25`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className={great ? 'you' : 'foe'}>{ratingFor(score)}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Hanabi" onClose={onClose} actions={<button className="btn-modal" onClick={onClose}>Light the fuse</button>}>
      <div className="modal-body">
        <p>A <b>cooperative</b> fireworks game. You and your partners <i>Iris</i> and <i>Juno</i> share one score — together you build five colour fireworks, each from <b>1 to 5</b>, for a perfect <b>25</b>.</p>
        <p>The twist: you hold your five cards <b>facing outward</b>. You can see everyone else's cards but <b>not your own</b> — you only know what your partners have <b>clued</b> you.</p>
        <p>On your turn do <b>one</b> of:</p>
        <p>• <b>Give a clue</b> (spends one of the 8 shared clue tokens): tell a partner about <i>all</i> their cards of one colour or one value.</p>
        <p>• <b>Discard</b> a card to <b>regain a clue token</b> and draw a replacement.</p>
        <p>• <b>Play</b> a card: if it's the next number for its colour it joins that firework (finishing a colour returns a clue); if not, it <b>misfires</b> and burns one of the 3 fuses.</p>
        <p>The show ends on the <b>third fuse</b>, a perfect <b>25</b>, or one final round after the deck runs out. Higher score is a better display.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel selection.</p>
      </div>
    </Modal>
  )
}
