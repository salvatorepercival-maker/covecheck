import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Vite resolves the `@/*` paths from tsconfig.json natively.
  resolve: { tsconfigPaths: true },
  test: {
    // Phase 1 is pure logic and parsing — no DOM needed yet.
    environment: 'node',
    include: ['lib/**/*.test.ts', 'components/**/*.test.ts'],
  },
})
