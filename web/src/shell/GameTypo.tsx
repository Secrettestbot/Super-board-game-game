import { pickDisplay } from './helpers'

// Large typographic "cover art" for a game card — stacks the name's words and scales
// the type to the longest word.
export function GameTypo({ name }: { name: string }) {
  const parts = pickDisplay(name)
  const longest = Math.max(...parts.map(p => p.length))
  let scale = 1
  if (longest > 11) scale = 0.55
  else if (longest > 8) scale = 0.7
  else if (longest > 5) scale = 0.88
  return (
    <div className="game-typo" style={{ fontSize: `clamp(22px, ${4 * scale}vw + ${8 * scale}px, ${52 * scale}px)` }}>
      {parts.map((p, i) => (
        <div key={i} style={{ display: 'block' }}>
          {i === 0 ? <span style={{ fontStyle: 'italic' }}>{p}</span> : p}
        </div>
      ))}
    </div>
  )
}
