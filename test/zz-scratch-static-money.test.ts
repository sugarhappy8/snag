import { it } from 'vitest'
import { registerMoneyConverter } from '../src/game/core'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

it('finds money formatted at import time', async () => {
  const hits = new Set<string>()
  registerMoneyConverter((n, ctx) => {
    if (!ctx) {
      const stack = (new Error().stack ?? '').split('\n').slice(2, 9).filter((l) => /src\/game/.test(l) && !/core\.ts/.test(l))
      hits.add(stack[0]?.trim() ?? '?')
    }
    return { amount: n, symbol: '$', code: 'USD' }
  })
  const files: string[] = []
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p) } }
  walk('src/game')
  for (const f of files) {
    try { await import('../' + f) } catch (e) { /* WIP */ }
  }
  console.log('HITS', [...hits].join('\n'))
})
