import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The game talks to LM Studio through this proxy (/lmstudio -> LM Studio server),
// so the browser never makes a cross-origin request and LM Studio's CORS setting
// doesn't matter. Point it elsewhere with LMSTUDIO_URL=http://host:port.
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
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    test: { environment: 'node', include: ['test/**/*.test.ts'] },
  }
})
