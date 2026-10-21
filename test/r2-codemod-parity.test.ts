// R2-A1: the parity canary. It plays the 12 lives of test/r2-parity-kit.ts (8 born, 4 founders) and compares g.rng and ten
// non-text slices, after every year, with test/fixtures/r2-parity.json. The fixture was recorded at the unmodified v4.1.1
// (a65349a), before the pickline codemod: the codemod (R2-A3) moves no draw, so it must hold unchanged. Only the
// rebaseline (R2-B2) moves g.rng on purpose, and it re-records the fixture once, with the reason in the commit message.
// From then on a moved fixture is a canary: a track that moves it by accident has reordered or added a draw.
// R2-B2 (the rebaseline) re-recorded it once with R2_PARITY_RECORD=rebase: the text draws left g.rng, so every life moved. The
// `source` field of the fixture says which recording it is. After the rebaseline it is the canary for every later track.
//
// The recorder is a mode of this test, so it runs under the same transform as the tests (precedent: FLAVOR_GOLDEN=1 in
// test/flavor-memory.test.ts, TEXT_KIT_RECORD=1 in test/text-kit.test.ts):
//
//   R2_PARITY_RECORD=base      the first recording. Refuses to run when a src/ file outside src/game/text/ calls
//                              pickLine( or pickSite(, so it cannot record a converted tree.
//   R2_PARITY_RECORD=rebase    R2-B2 only. Refuses unless src/game/text/draw.ts exists. R2_PARITY_REASON, when set,
//                              is the `source`; else 'rebaseline: text off g.rng'.
//   R2_PARITY_RECORD=update    any other legitimate move. Needs a non-empty R2_PARITY_REASON, written into `source`.
//
// A recording rewrites the fixture and skips the comparison.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PARITY_LIVES, PARITY_SLICES, compareTraces, traceLife, type Divergence, type ParityFixture, type ParityTrace } from './r2-parity-kit'
import { isId, isPunct, lineOf, loadSources } from './scan-kit'

const FIXTURE = join(__dirname, 'fixtures', 'r2-parity.json')
const DRAW_MODULE = join(__dirname, '..', 'src', 'game', 'text', 'draw.ts')
const TIMEOUT = 300_000
const BASE_SOURCE = 'base a65349a: v4.1.1, before the pickline codemod'
const SLICE_NAMES: string[] = [...PARITY_SLICES, 'text']

/** business/nepo-asks.ts declares its own local `pickLine` (a hash helper at line 269): it is not the text kit's. */
const NOT_THE_KIT = new Set(['src/game/business/nepo-asks.ts'])

type RecordMode = 'base' | 'rebase' | 'update'

function recordMode(): RecordMode | null {
  const raw = process.env.R2_PARITY_RECORD
  if (raw === undefined || raw === '') return null
  if (raw === 'base' || raw === 'rebase' || raw === 'update') return raw
  throw new Error(`R2_PARITY_RECORD must be base, rebase or update, not "${raw}"`)
}

/** `path:line` of every call of the text kit's pickLine or pickSite outside src/game/text/. */
function convertedCalls(): string[] {
  const hits: string[] = []
  for (const f of loadSources()) {
    if (f.path.startsWith('src/game/text/') || NOT_THE_KIT.has(f.path)) continue
    f.toks.forEach((t, i) => {
      if (!isId(t, 'pickLine') && !isId(t, 'pickSite')) return
      if (isPunct(f.toks[i + 1], '(') || isPunct(f.toks[i + 1], '<')) hits.push(`${f.path}:${lineOf(f.text, t.p)}`)
    })
  }
  return hits
}

/** The source line to write, or throws when this mode may not run here. */
function recordSource(mode: RecordMode): string {
  const reason = (process.env.R2_PARITY_REASON ?? '').trim()
  if (mode === 'base') {
    const hits = convertedCalls()
    if (hits.length > 0) {
      throw new Error(`R2_PARITY_RECORD=base records the unmodified tree, but ${hits.length} call(s) of pickLine or pickSite are outside src/game/text/, e.g. ${hits.slice(0, 3).join(', ')}`)
    }
    return BASE_SOURCE
  }
  if (mode === 'rebase') {
    if (!existsSync(DRAW_MODULE)) throw new Error('R2_PARITY_RECORD=rebase is for R2-B2: src/game/text/draw.ts does not exist yet')
    return reason || 'rebaseline: text off g.rng'
  }
  if (reason === '') throw new Error('R2_PARITY_RECORD=update needs a non-empty R2_PARITY_REASON: say why a draw moved')
  return reason
}

function loadFixture(): ParityFixture {
  if (!existsSync(FIXTURE)) throw new Error('test/fixtures/r2-parity.json is missing: record it with R2_PARITY_RECORD=base at the unmodified base')
  const f = JSON.parse(readFileSync(FIXTURE, 'utf8')) as ParityFixture
  if (f.v !== 1) throw new Error(`r2-parity.json has v ${String(f.v)}, expected 1`)
  return f
}

/** The fixture as text: one row per year on its own line, so a moved digest is a one-line diff. */
function fixtureText(f: ParityFixture): string {
  const lives = f.lives.map((l) => {
    const rows = l.years.map((r) => `        ${JSON.stringify(r)}`).join(',\n')
    return `    {\n      "id": ${JSON.stringify(l.id)},\n      "years": [\n${rows}\n      ]\n    }`
  })
  return `{\n  "v": 1,\n  "source": ${JSON.stringify(f.source)},\n  "slices": ${JSON.stringify(f.slices)},\n  "lives": [\n${lives.join(',\n')}\n  ]\n}\n`
}

function describeMoves(life: string, moves: Divergence[], yearsRecorded: number, yearsPlayed: number): string {
  const first = moves
    .slice(0, 5)
    .map((d) => `year ${d.year}: ${d.slices.join(', ')}`)
    .join('; ')
  const more = moves.length > 5 ? ` (and ${moves.length - 5} more years)` : ''
  const length = yearsRecorded === yearsPlayed ? '' : ` The life ran ${yearsPlayed - 1} years, the fixture has ${yearsRecorded - 1}.`
  return (
    `life ${life} moved. First divergence, by year and slice: ${first}${more}.${length} ` +
    'A moved fixture means a draw moved: do not re-record without a reason (R2_PARITY_RECORD=update with R2_PARITY_REASON).'
  )
}

const MODE = recordMode()
const recorded = new Map<string, ParityTrace>()
let failed = false

describe(MODE ? `r2 parity: recording (${MODE})` : 'r2 parity: the 12 lives against the base fixture', () => {
  let source = ''
  beforeAll(() => {
    if (MODE) source = recordSource(MODE)
  })

  afterAll(() => {
    if (!MODE || failed || recorded.size !== PARITY_LIVES.length) return
    const fixture: ParityFixture = { v: 1, source, slices: SLICE_NAMES, lives: PARITY_LIVES.map((l) => recorded.get(l.id)!) }
    writeFileSync(FIXTURE, fixtureText(fixture))
  })

  for (const life of PARITY_LIVES) {
    it(
      `${life.id}: g.rng and ten slices match after every year`,
      () => {
        try {
          const got = traceLife(life)
          if (MODE) {
            recorded.set(life.id, got)
            return
          }
          const want = loadFixture().lives.find((l) => l.id === life.id)
          if (!want) throw new Error(`r2-parity.json has no row for life ${life.id}`)
          // Compare the years both have, so a life that now ends sooner or later still names its first moved slice.
          const n = Math.min(want.years.length, got.years.length)
          const moves = compareTraces([{ id: life.id, years: want.years.slice(0, n) }], [{ id: life.id, years: got.years.slice(0, n) }])
          if (moves.length > 0 || want.years.length !== got.years.length) {
            throw new Error(describeMoves(life.id, moves, want.years.length, got.years.length))
          }
          expect(moves).toEqual([])
        } catch (e) {
          failed = true
          throw e
        }
      },
      TIMEOUT,
    )
  }
})
