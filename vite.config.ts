import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// A static site: everything runs in the browser, with no backend and no network calls.
export default defineConfig({
  // Relative asset paths so the build works at any URL (Cloudflare root or a sub-path).
  base: './',
  plugins: [react()],
  // One ~5 MB bundle (~1.6 MB gzipped; mostly event, job and history text); fine for a game, so
  // don't warn about it.
  build: { chunkSizeWarningLimit: 6000 },
  server: { port: 5173 },
  preview: { port: 4173 },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
})
