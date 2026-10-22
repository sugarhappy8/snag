import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import TimingsSequencer from './test/timings-sequencer'

// A static site: everything runs in the browser, with no backend and no network calls.
export default defineConfig({
  // Relative asset paths so the build works at any URL (Cloudflare root or a sub-path).
  base: './',
  plugins: [react()],
  // One ~7.4 MB bundle (~2.5 MB gzipped; mostly event, job, history and invention text). This is an
  // accepted trade-off for the self-contained game; meaningful code/data splitting is a separate project.
  build: { chunkSizeWarningLimit: 8000 },
  server: { port: 5173 },
  preview: { port: 4173 },
  // Whole-life and market sweeps are CPU-heavy. Bound default concurrency so
  // contention does not turn otherwise passing simulation checks into timeouts.
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Every test file starts in Exact information mode (R3-H1): the Realistic default is for players; a fog test flips it with
    // withInfoMode. The setup file is not a test (no .test.ts suffix), so `include` leaves it out.
    setupFiles: ['./test/setup-exact.ts'],
    testTimeout: 15_000,
    maxWorkers: 2,
    // Heaviest files first, by scripts/test-timings.json (docs/CI.md).
    sequence: { sequencer: TimingsSequencer },
  },
})
