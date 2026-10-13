import { it } from 'vitest'
import { playPolitician, summarize, type PolStats } from './politics-kit'
it('probe', () => {
  const rows: PolStats[] = []
  for (const s of ['honest', 'corrupt', 'reckless'] as const) for (let seed = 1; seed <= 12; seed++) {
    const r = playPolitician(s, seed, seed % 2 ? 'us' : 'br', 1995, 14)
    rows.push(r)
    if (r.text.length) console.log(s, seed, r.text.slice(0, 3))
  }
  console.log(summarize(rows))
  for (const r of rows) console.log(r.strategy, r.seed, r.country, r.outcome, r.yearsInOffice, (r.taken/1e6).toFixed(1), (r.laundered/1e6).toFixed(1), (r.seized/1e6).toFixed(1), r.approvalEnd, r.debtEnd.toFixed(2), r.ruined)
}, 900_000)
