import { defineConfig } from 'vitest/config'

// Pure-logic test suite. Each game ships src/games/<id>/<id>.test.ts that plays full
// games against its own AI and asserts invariants. Vitest runs the files in parallel
// workers, so `npm test` checks every game's rules + AI at once.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Some games self-play full matches against a search AI; give them headroom.
    testTimeout: 20000,
  },
})
