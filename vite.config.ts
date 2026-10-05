import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The game calls the player's chosen AI provider directly from the browser: a local server
// (LM Studio, Ollama, llama.cpp, ...) at its own URL, or a cloud API with the player's key.
// This proxy is only a dev convenience for LM Studio: under `npm run dev` its default URL is
// /lmstudio/v1, forwarded here to the LM Studio server, so LM Studio's CORS setting doesn't
// matter while developing. Point it elsewhere with LMSTUDIO_URL=http://host:port. The hosted
// (static) site has no proxy.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.LMSTUDIO_URL || 'http://localhost:1234'
  const proxy = {
    '/lmstudio': {
      target,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/lmstudio/, ''),
    },
  }
  return {
    // Relative asset paths so the build works at any URL (Cloudflare root or a sub-path).
    base: './',
    plugins: [react()],
    // One ~2 MB bundle (mostly event/job text); fine for a game, so don't warn about it.
    build: { chunkSizeWarningLimit: 3000 },
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    test: { environment: 'node', include: ['test/**/*.test.ts'] },
  }
})
