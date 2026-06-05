// Small formatting helpers for the library shell (ported from app.jsx).

export const fmtTime = (m: number) =>
  m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`

export const COMPLEXITY_LABELS = ['', 'Easy', 'Light', 'Medium', 'Heavy', 'Expert']

// Split a game name into stacked words for the typographic art (drop punctuation).
export function pickDisplay(name: string): string[] {
  return name.replace(/[!?'.]/g, '').split(/\s+/)
}
