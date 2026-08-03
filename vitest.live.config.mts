import { defineConfig } from 'vitest/config'

/**
 * Live-provider config, run via `npm run spike`.
 *
 * Kept separate from the default suite because it makes real network calls to
 * Open-Meteo, NOAA and NWS. `npm test` must stay hermetic and offline-safe.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['lib/**/*.live.ts'],
    testTimeout: 60_000,
    // Real endpoints, so run them one at a time and be polite.
    fileParallelism: false,
    // The printed normalized output is the point of this run — don't swallow it.
    disableConsoleIntercept: true,
  },
})
