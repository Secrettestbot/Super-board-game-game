import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

// Multi-page app: the library is the root entry, and every playable game is its own
// self-contained HTML entry under games/. This mirrors the design handoff's "one
// self-contained page per game" model and keeps each game's global CSS isolated
// (the library and each game reuse class names like .app / .masthead / .modal).
// Adding a game = drop a games/<id>.html entry + a src/games/<id>/ folder, then
// register it in src/data/playable.ts.
//
// `base: './'` makes asset URLs relative so the built site also works from a subpath
// (e.g. a GitHub Pages project site) or straight off the filesystem.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        library: resolve(__dirname, 'index.html'),
        yahtzee: resolve(__dirname, 'games/yahtzee.html'),
        xiangqi: resolve(__dirname, 'games/xiangqi.html'),
        skull_king: resolve(__dirname, 'games/skull_king.html'),
        the_crew: resolve(__dirname, 'games/the_crew.html'),
        yinsh: resolve(__dirname, 'games/yinsh.html'),
        tiny_towns: resolve(__dirname, 'games/tiny_towns.html'),
        tictactoe: resolve(__dirname, 'games/tictactoe.html'),
        connect_four: resolve(__dirname, 'games/connect_four.html'),
        reversi: resolve(__dirname, 'games/reversi.html'),
        checkers: resolve(__dirname, 'games/checkers.html'),
        gomoku: resolve(__dirname, 'games/gomoku.html'),
        nim: resolve(__dirname, 'games/nim.html'),
        dots_boxes: resolve(__dirname, 'games/dots_boxes.html'),
        blackjack: resolve(__dirname, 'games/blackjack.html'),
        mancala: resolve(__dirname, 'games/mancala.html'),
        breakthrough: resolve(__dirname, 'games/breakthrough.html'),
        pig: resolve(__dirname, 'games/pig.html'),
        mastermind: resolve(__dirname, 'games/mastermind.html'),
        battleship: resolve(__dirname, 'games/battleship.html'),
        onitama: resolve(__dirname, 'games/onitama.html'),
        hex: resolve(__dirname, 'games/hex.html'),
      },
    },
  },
})
