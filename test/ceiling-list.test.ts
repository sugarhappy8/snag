// ci: fast
// R1-P5 (X.G1): the ceiling list. R0-14's guard line says "R1 X.G1's ceiling list names every growth term with a cap",
// and D.10 never defined it. This is the smallest version that does the job: test/ceiling-list.json names each cap
// by the file it lives in and the identifier that carries it, and this test fails when an identifier is gone.
// Removing a cap constant means removing the entry here on purpose, and the entry says what the cap protected.
//
// To add one: put the entry in the JSON in the same commit as the new cap. Use an identifier that is a constant or a
// named helper, so a rename is caught too.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { K_ID, ROOT, loadSources, toSource, type SourceFile } from './scan-kit'

interface Ceiling {
  id: string
  file: string
  token: string
  cap: string
}

const LIST_PATH = join(ROOT, 'test', 'ceiling-list.json')
const readList = (): Ceiling[] => JSON.parse(readFileSync(LIST_PATH, 'utf8')) as Ceiling[]

/** One message per entry whose file or identifier is gone. */
function missing(list: readonly Ceiling[], sources: readonly SourceFile[]): string[] {
  const byPath = new Map(sources.map((s) => [s.path, s]))
  const out: string[] = []
  for (const c of list) {
    const src = byPath.get(c.file)
    if (!src) out.push(`${c.id}: ${c.file} is gone, so the cap "${c.cap}" is gone`)
    else if (!src.toks.some((t) => t.k === K_ID && t.v === c.token)) out.push(`${c.id}: ${c.token} is no longer in ${c.file}, so the cap "${c.cap}" is gone`)
  }
  return out
}

let realSources: SourceFile[] | null = null
const real = (): SourceFile[] => (realSources ??= loadSources())

describe('ceiling list: the real tree', () => {
  it('finds every cap identifier in its file', () => {
    expect(missing(readList(), real())).toEqual([])
  })

  it('names at least six caps, each with an existing file under src and a reason', () => {
    const list = readList()
    expect(list.length).toBeGreaterThanOrEqual(6)
    const paths = new Set(real().map((s) => s.path))
    for (const c of list) {
      expect(Object.keys(c).sort(), c.id).toEqual(['cap', 'file', 'id', 'token'])
      for (const v of Object.values(c)) expect(typeof v === 'string' && v.trim().length > 0, `${c.id} has an empty field`).toBe(true)
      expect(c.id, c.id).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
      expect(c.token, c.id).toMatch(/^[A-Za-z_$][\w$]*$/)
      expect(paths.has(c.file), `${c.id}: ${c.file} does not exist`).toBe(true)
      expect(c.cap.length, c.id).toBeGreaterThan(10)
    }
  })

  it('has no repeated id and no repeated file and token pair', () => {
    const list = readList()
    expect(new Set(list.map((c) => c.id)).size).toBe(list.length)
    expect(new Set(list.map((c) => `${c.file}#${c.token}`)).size).toBe(list.length)
  })

  it('seeds the caps of the merged R0 and the v4.0.1 studio fix', () => {
    const tokens = new Set(readList().map((c) => c.token))
    // R0-14 podcast audience, the fame ledger, R0-12 pay scale, R0-7 deals and Olympic bonus, R0-8 adaptation, v4.0.1 studio.
    for (const t of ['MAX_AUDIENCE', 'MAX_FAME_LEDGER', 'payScale', 'dealCeiling', 'adaptationFeeCap', 'adaptationYearCap', 'TAIL_SWING']) expect(tokens.has(t), t).toBe(true)
  })

  it('keeps the list in plain voice: no em-dash and no en-dash', () => {
    // The dashes are built from their code points so that this file holds neither character.
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
    expect(readFileSync(LIST_PATH, 'utf8')).not.toMatch(dashes)
  })
})

describe('ceiling list: failing on a synthetic tree', () => {
  const entry: Ceiling = { id: 'podcast-audience', file: 'src/game/special/fame.ts', token: 'MAX_AUDIENCE', cap: '30,000,000 listeners (R0-14)' }

  it('passes when the file still carries the token', () => {
    expect(missing([entry], [toSource(entry.file, 'const MAX_AUDIENCE = 30_000_000\nexport const x = Math.min(MAX_AUDIENCE, y)')])).toEqual([])
  })

  it('fails with the cap description when the token is removed', () => {
    const out = missing([entry], [toSource(entry.file, 'export const x = Math.min(30_000_000, y)')])
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('MAX_AUDIENCE')
    expect(out[0]).toContain('30,000,000 listeners (R0-14)')
  })

  it('fails when the file is gone', () => {
    const out = missing([entry], [toSource('src/game/special/other.ts', 'const MAX_AUDIENCE = 1')])
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('src/game/special/fame.ts is gone')
  })

  it('does not take a mention in a comment, a string or a longer name for the token', () => {
    const text = ['// MAX_AUDIENCE', "const a = 'MAX_AUDIENCE'", 'const b = `MAX_AUDIENCE`', 'const MAX_AUDIENCE_2 = 1', 'const xMAX_AUDIENCE = 2'].join('\n')
    expect(missing([entry], [toSource(entry.file, text)])).toHaveLength(1)
  })

  it('reports each missing entry once, in list order', () => {
    const two: Ceiling[] = [entry, { id: 'fame-ledger', file: 'src/game/special/fame.ts', token: 'MAX_FAME_LEDGER', cap: '1e12 on every fame ledger value' }]
    expect(missing(two, [toSource(entry.file, 'const none = 1')]).map((m) => m.split(':')[0])).toEqual(['podcast-audience', 'fame-ledger'])
  })
})
