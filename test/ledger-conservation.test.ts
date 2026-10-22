// R2-L5 (A.K1 d): the conservation probe, the sliced tier. Forty seeded lives (101 to 140) of up to 100 years each with two heirs
// play through the fuzzer, which checks the books after every step (the sum of the accounts equals the mint less the burn, every
// flow row nets to zero, every cap holds, nothing was healed) and measures the player's cash against the player's account at every
// year end. test/ledger-probe.ts judges the rows. In CI each shard plays its slice (docs/CI.md, the seed-sliced files) and the
// aggregate step judges the union with SLICE=merge.
//
// Locally: SLICE=1/20 SLICE_DIR=$TMPDIR/s /Users/saeed/projects/anotherlife/wt/bin/vt22 test/ledger-conservation.test.ts plays two lives.
import { describe, expect, it } from 'vitest'
import '../src/game/world/shards'
import { driftReport, judge, LEDGER_SEEDS, runLedgerLife, type LedgerLifeRow } from './ledger-probe'
import { mergedSlices, readSlice, recordSlice, seedSlice } from './shard-kit'

const slice = readSlice()
const mine = seedSlice(LEDGER_SEEDS, 'ledger-probe', slice)

describe('the conservation probe: 40 lives of 100 years with heirs', () => {
  const rows: LedgerLifeRow[] = []

  // A life of 100 years takes 10 to 30 seconds; each seed gets its own timeout and failure report.
  it.each(mine)('plays seed %i with the books balanced', async (seed) => {
    const row = await runLedgerLife(seed)
    rows.push(row)
    console.info(`ledger probe: seed ${seed} ${row.years} years, ${row.generations} generations, ${row.ledger.bookings} bookings, ${row.ledger.reasons.length} reasons, ${(row.ms / 1000).toFixed(1)} s`)
    expect(judge([row])).toEqual([])
  }, 300_000)

  it('holds over all the lives', () => {
    recordSlice('ledger-probe', rows, slice)
    // A slice checks only that its own seeds were played; the merge step judges the whole set.
    if (slice.mode === 'part') {
      console.info(driftReport(rows))
      expect(rows).toHaveLength(mine.length)
      return
    }
    const all = slice.mode === 'merge' ? mergedSlices<LedgerLifeRow>('ledger-probe', slice) : rows
    console.info(driftReport(all))
    expect(all).toHaveLength(LEDGER_SEEDS.length)
    expect(judge(all, { merged: true })).toEqual([])
  })
})
