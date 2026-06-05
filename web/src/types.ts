// Shared catalog types for the library shell. Field shapes mirror the entries in
// data/games.ts (ported from the design handoff's games-data.js).

export interface Game {
  /** Unique lowercase slug. Used as the key into the PLAYABLE map. */
  id: string
  name: string
  /** Category id — must match a Category.id in CATEGORIES. */
  cat: string
  /** Thumbnail style hint (drives typographic art / future thumbnails). */
  type: string
  desc: string
  /** Estimated playtime, minutes. */
  time: number
  /** Complexity, 1 (easy) – 5 (expert). */
  complex: number
  variants: string[]
  /** Defaults to 2 when omitted. */
  maxPlayers?: number
}

export interface Category {
  id: string
  label: string
  blurb: string
}
