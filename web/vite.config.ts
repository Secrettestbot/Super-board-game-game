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
        quoridor: resolve(__dirname, 'games/quoridor.html'),
        quarto: resolve(__dirname, 'games/quarto.html'),
        pentago: resolve(__dirname, 'games/pentago.html'),
        morris: resolve(__dirname, 'games/morris.html'),
        ataxx: resolve(__dirname, 'games/ataxx.html'),
        konane: resolve(__dirname, 'games/konane.html'),
        pong_hau_ki: resolve(__dirname, 'games/pong_hau_ki.html'),
        fox_hounds: resolve(__dirname, 'games/fox_hounds.html'),
        amazons: resolve(__dirname, 'games/amazons.html'),
        lines_of_action: resolve(__dirname, 'games/lines_of_action.html'),
        santorini: resolve(__dirname, 'games/santorini.html'),
        tablut: resolve(__dirname, 'games/tablut.html'),
        surakarta: resolve(__dirname, 'games/surakarta.html'),
        yote: resolve(__dirname, 'games/yote.html'),
        sudoku: resolve(__dirname, 'games/sudoku.html'),
        minesweeper: resolve(__dirname, 'games/minesweeper.html'),
        abalone: resolve(__dirname, 'games/abalone.html'),
        fanorona: resolve(__dirname, 'games/fanorona.html'),
        alquerque: resolve(__dirname, 'games/alquerque.html'),
        dara: resolve(__dirname, 'games/dara.html'),
        pente: resolve(__dirname, 'games/pente.html'),
        kamisado: resolve(__dirname, 'games/kamisado.html'),
        tsuro: resolve(__dirname, 'games/tsuro.html'),
        liars_dice: resolve(__dirname, 'games/liars_dice.html'),
        backgammon: resolve(__dirname, 'games/backgammon.html'),
        love_letter: resolve(__dirname, 'games/love_letter.html'),
        no_thanks: resolve(__dirname, 'games/no_thanks.html'),
        zombie_dice: resolve(__dirname, 'games/zombie_dice.html'),
        ur: resolve(__dirname, 'games/ur.html'),
        shut_the_box: resolve(__dirname, 'games/shut_the_box.html'),
        coloretto: resolve(__dirname, 'games/coloretto.html'),
        entropy: resolve(__dirname, 'games/entropy.html'),
        lost_cities: resolve(__dirname, 'games/lost_cities.html'),
        jaipur: resolve(__dirname, 'games/jaipur.html'),
        fox_in_forest: resolve(__dirname, 'games/fox_in_forest.html'),
        qwixx: resolve(__dirname, 'games/qwixx.html'),
        cant_stop: resolve(__dirname, 'games/cant_stop.html'),
        carnac: resolve(__dirname, 'games/carnac.html'),
        dominoes: resolve(__dirname, 'games/dominoes.html'),
      },
    },
  },
})
