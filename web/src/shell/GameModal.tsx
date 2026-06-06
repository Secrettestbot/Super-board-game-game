import { useEffect, useState } from 'react'
import type { Game } from '../types'
import { CATEGORIES } from '../data/games'
import { GameTypo } from './GameTypo'
import { fmtTime, COMPLEXITY_LABELS } from './helpers'

export function GameModal({ game, onClose, onPlay }: {
  game: Game
  onClose: () => void
  onPlay: (g: Game, variant: number) => void
}) {
  const [variant, setVariant] = useState(0)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const cat = CATEGORIES.find(c => c.id === game.cat)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
        </button>
        <div className="modal-art">
          <div className="modal-art-eyebrow">{cat ? cat.label : ""}</div>
          <div className="modal-art-typo">
            <GameTypo name={game.name} />
          </div>
          <div className="modal-art-foot">
            <span>2 Players</span>
            <span>№ {String(game.id).slice(0, 3).toUpperCase()}</span>
          </div>
        </div>
        <div className="modal-body">
          <div className="modal-cat">{cat ? cat.label : ""}</div>
          <div className="modal-name">{game.name}</div>
          <p className="modal-desc">{game.desc}</p>
          <div className="modal-stats">
            <div>
              <div className="modal-stat-label">Players</div>
              <div className="modal-stat-val">2</div>
            </div>
            <div>
              <div className="modal-stat-label">Time</div>
              <div className="modal-stat-val">{fmtTime(game.time)}</div>
            </div>
            <div>
              <div className="modal-stat-label">Complexity</div>
              <div className="modal-stat-val">{COMPLEXITY_LABELS[game.complex]}</div>
            </div>
          </div>
          <div className="modal-variants-label">Choose a variant — {game.variants.length} available</div>
          <div className="modal-variants">
            {game.variants.map((v, i) => (
              <div key={i}
                   className="modal-variant"
                   aria-pressed={variant === i}
                   onClick={() => setVariant(i)}>
                <div className="radio"></div>
                <div className="name">{v}</div>
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Tutorial</button>
            <button className="btn-primary" onClick={() => onPlay(game, variant)}>
              Start Game
              <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7 L11 7 M7 3 L11 7 L7 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
