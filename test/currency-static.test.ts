// Money text must be written when it is shown, in the player's currency and year. A string built
// at module load (a static menu subtitle like `Matchmaker (${money(500)})`) would be frozen in
// plain US dollars forever, so no engine module may format money while it is being imported.
import { expect, it } from 'vitest'
import { registerMoneyConverter } from '../src/game/core'
// Installs the real converter first, so importing it again below can't replace the recorder.
import { convertMoney } from '../src/game/data/currencies'

it('formats no money while the engine modules load', async () => {
  const calls: string[] = []
  registerMoneyConverter((n, ctx, display) => {
    calls.push((new Error().stack ?? '').split('\n').slice(2, 5).join(' <- '))
    return convertMoney(n, ctx, display)
  })
  try {
    const modules = import.meta.glob(['../src/game/**/*.ts', '../src/ai/*.ts'])
    expect(Object.keys(modules).length).toBeGreaterThan(50)
    for (const load of Object.values(modules)) await load()
    expect(calls).toEqual([])
  } finally {
    registerMoneyConverter(convertMoney)
  }
}, 60_000)
