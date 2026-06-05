// Games that have a real, built page in this app. Maps game.id -> entry HTML
// (relative to the library page at the site root). Add a row here when a new game
// is ported, and add the matching entry to vite.config.ts `rollupOptions.input`.
//
// In the prototype this was a ~140-row map to hand-built static HTML files; here it
// starts with the one game built in this pass. Games not in this map still render a
// catalog card but show a "coming soon" notice on launch.
export const PLAYABLE: Record<string, string> = {
  yahtzee: 'games/yahtzee.html',
  xiangqi: 'games/xiangqi.html',
}
