// ci: fast
// R4-E1 (X2, X4, X30): the self-test of test/social-parity-kit.ts. The kit is what R4-E2 to R4-E4 and R4-L1 record their byte-exact
// oracles with, so what this file pins is the kit and not an area: a scene draws nothing, a step records numbers and no text, a
// float is cut to nine digits, a non-finite value survives the file, the comparison names the first row that moved, the recorder
// writes only when asked (the area, a reason that checkReason accepts, Node 22, an engine that equals HEAD) and writes the same
// bytes twice. Nothing here is recorded in the repository: the recorder writes to a scratch directory.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { chance, rand } from '../src/game/rng'
import { RngTrapError } from './effort-kit'
import {
  REFERENCE,
  REFERENCE_TABLE,
  applyDelta,
  compareRows,
  currentGame,
  cut,
  expectRows,
  frozenGame,
  gridHash,
  isRecording,
  oracle,
  parseRecording,
  queueKinds,
  readRows,
  recordRows,
  referenceRows,
  runAction,
  scene,
  serialize,
  step,
  trapRng,
  type Header,
  type ParityRow,
  type RecordDeps,
} from './social-parity-kit'
import { ROOT } from './scan-kit'

const REASON = 'first rows of the kit self-test recorded on a scratch directory'
const SCRATCH = mkdtempSync(join(tmpdir(), 'social-parity-kit-'))
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }))

const gitOut = (...args: string[]): string => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()

/** Recorder dependencies for a test: the real git, Node 22, the area asked for, a good reason. */
function deps(over: Partial<RecordDeps> & { env?: Record<string, string | undefined> } = {}): RecordDeps {
  return {
    env: { RECORD_SOCIAL_PARITY: 'scratch', RECORD_REASON: REASON, ...over.env },
    node: over.node ?? '22.23.3',
    git: over.git ?? ((args) => gitOut(...args)),
  }
}

describe('a scene', () => {
  it('draws nothing and ids the cast in order: g.rng is the seed, g.nextId counts the people', () => {
    const s = scene([7, 1990], { cast: [{ key: 'a', relation: 'parent', age: 50 }, { key: 'b', relation: 'friend', age: 20 }, { key: 'c', relation: 'pet', age: 2, species: 'Cat' }] })
    expect(s.g.rng).toBe(7)
    expect(s.g.year).toBe(1990)
    expect(s.g.nextId).toBe(3)
    expect(s.g.people.map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
    expect(Object.keys(s.who)).toEqual(['a', 'b', 'c'])
    expect(s.g.character.age).toBe(30)
  })

  it('fills what the spec leaves out with fixed values, and the same spec makes the same people twice', () => {
    const spec = { cast: [{ key: 'a', relation: 'sibling' as const, age: 33 }, { key: 'b', relation: 'child' as const, age: 4, relationship: 90, money: 12 }] }
    const one = scene([3, 2026], spec).g.people
    const two = scene([3, 2026], spec).g.people
    expect(JSON.stringify(one)).toBe(JSON.stringify(two))
    expect(one[0]).toMatchObject({ relationship: 50, money: 0, occupation: 'Clerk', traits: ['kind', 'calm'], livesWithPlayer: false })
    expect(one[1]).toMatchObject({ relationship: 90, money: 12 })
    expect(one[0]!.gender).not.toBe(one[1]!.gender)
  })

  it('takes a character override and refuses two people with one name', () => {
    expect(scene([1, 2026], { character: { age: 17, money: 500 } }).g.character).toMatchObject({ age: 17, money: 500 })
    expect(() => scene([1, 2026], { cast: [{ key: 'a', relation: 'friend', age: 1 }, { key: 'a', relation: 'friend', age: 2 }] })).toThrow(/two people are called a/)
  })

  it('records a step: relationships in people order, rng, nextId, queue kinds, money, and nothing else', () => {
    const s = scene([5, 2026], { character: { money: 250 }, cast: [{ key: 'a', relation: 'friend', age: 30, relationship: 40 }, { key: 'b', relation: 'friend', age: 31, relationship: 60 }] })
    const row = s.step('start', () => undefined)
    expect(row).toEqual({ label: 'start', rel: [40, 60], rng: 5, nextId: 2, queue: [], money: 250 })
    const next = s.step('rolled', (g) => {
      rand(g)
      g.people[1]!.relationship = 61
      g.character.money -= 50.5
      g.queue.push({ kind: 'choice', scriptId: 'rel.test', title: 'A long title', text: 'Some long text that never appears', choices: [] } as never, { kind: 'notice', title: 'n', text: 't' } as never)
    })
    expect(next.rel).toEqual([40, 61])
    expect(next.rng).not.toBe(5)
    expect(next.money).toBe(199.5)
    expect(next.queue).toEqual(['choice:rel.test', 'notice'])
    expect(JSON.stringify(next)).not.toMatch(/long text|A long title/)
    expect(s.rows).toHaveLength(2)
  })

  it('step is the same call on the scene made last, and says so before any scene', () => {
    const s = scene([2, 2026], { cast: [{ key: 'a', relation: 'friend', age: 30 }] })
    expect(currentGame()).toBe(s.g)
    step('via the free function', () => undefined)
    expect(s.rows.map((r) => r.label)).toEqual(['via the free function'])
  })

  it('cuts a float to nine significant digits, writes -0 as 0, and keeps a non-finite number as text', () => {
    expect(cut(1 / 3)).toBe(0.333333333)
    expect(cut(-0)).toBe(0)
    expect(cut(12345)).toBe(12345)
    expect(cut(Number.NaN)).toBe('NaN')
    expect(cut(Infinity)).toBe('Infinity')
    expect(cut(-Infinity)).toBe('-Infinity')
    expect(cut({ b: [1 / 3, undefined], a: undefined, c: null })).toEqual({ b: [0.333333333, null], c: null })
    expect(Object.keys(cut({ z: 1, a: 2 }) as object)).toEqual(['a', 'z'])
    const s = scene([2, 2026], { cast: [{ key: 'a', relation: 'friend', age: 30 }] })
    const row = s.step('extra', () => undefined, () => ({ ratio: 2 / 3, nan: Number.NaN, nested: { y: 1, x: 0.1 + 0.2 } }))
    expect(row.x).toEqual({ nan: 'NaN', nested: { x: 0.3, y: 1 }, ratio: 0.666666667 })
  })

  it('queueKinds names a modal by its kind, and by kind:scriptId when it has one', () => {
    const g = scene([2, 2026]).g
    g.queue.push({ kind: 'input', scriptId: 'x.y' } as never, { kind: 'minigame' } as never, { kind: 'choice', scriptId: '' } as never)
    expect(queueKinds(g)).toEqual(['input:x.y', 'minigame', 'choice'])
  })
})

describe('runAction', () => {
  it('runs a menu action the way the screen would, and throws on one that is missing or disabled', () => {
    const s = scene([4, 2026], { cast: [{ key: 'mom', relation: 'parent', age: 55, relationship: 50 }] })
    const mom = s.who.mom!
    const before = mom.relationship
    runAction(s.g, mom, 'hug')
    expect(mom.relationship).toBeGreaterThanOrEqual(before)
    expect(() => runAction(s.g, mom, 'no.such.action')).toThrow(/has no action no.such.action/)
    s.g.character.alive = false
    expect(() => runAction(s.g, mom, 'hug')).toThrow(/has no action hug/)
  })
})

describe('applyDelta', () => {
  it('is addRelationship of v5.2.0: rounds, clamps to 0..100 and ignores a non-finite value', () => {
    const s = scene([6, 2026], { cast: [{ key: 'a', relation: 'friend', age: 30 }] })
    const p = s.who.a!
    const to = (start: number, d: number): number => {
      p.relationship = start
      applyDelta(s.g, p, d)
      return p.relationship
    }
    expect(to(50, 0.4)).toBe(50)
    expect(to(50, 0.5)).toBe(51)
    expect(to(99, 5)).toBe(100)
    expect(to(1, -1000)).toBe(0)
    expect(to(50, Number.NaN)).toBe(50)
    expect(to(Number.NaN, 5)).toBeNaN()
    expect(s.g.rng).toBe(6)
  })
})

describe('the reference scene', () => {
  it('is the same rows twice, with the grid and the table the kit says', () => {
    const one = referenceRows()
    const two = referenceRows()
    expect(compareRows(one, two)).toMatchObject({ same: true, moved: 0, first: null })
    expect(JSON.stringify(one)).toBe(JSON.stringify(two))
    expect(one).toHaveLength(REFERENCE_TABLE.length + 4)
    expect(gridHash(one)).toBe(gridHash(two))
    expect(REFERENCE).toEqual([11, 2026])
  })

  it('has rows that carry the table at the bounds and the four real actions, with nothing queued by the table', () => {
    const rows = referenceRows()
    const at = (label: string): ParityRow => rows.find((r) => r.label === label)!
    expect(at('table|0|-5').rel[1]).toBe(0)
    expect(at('table|99|5').rel[1]).toBe(100)
    expect(at('table|100|-1000').rel[1]).toBe(0)
    expect(at('table|50|1000000000').rel[1]).toBe(100)
    expect(at('table|50|Infinity').rel[1]).toBe(50)
    expect(at('table|NaN|5').rel[1]).toBe('NaN')
    expect(at('table|50|NaN').rel[1]).toBe(50)
    expect(at('table|49|0.5').rel[1]).toBe(50)
    expect(rows.slice(0, REFERENCE_TABLE.length).every((r) => r.queue.length === 0 && r.rng === REFERENCE[0])).toBe(true)
    expect(at('hug|mom|25').rng).not.toBe(REFERENCE[0])
    expect(at('hug|mom|25').queue).toContain('notice')
    expect(at('hug|mom|25').rel[0]).toBeGreaterThanOrEqual(27)
  })
})

describe('compareRows', () => {
  const rows = (): ParityRow[] => referenceRows()

  it('names the first row that moved and what moved in it', () => {
    const run = rows()
    run[3]!.rel[1] = (run[3]!.rel[1] as number) + 1
    run[5]!.rng = 0
    run[5]!.queue = ['choice:x']
    const r = compareRows(rows(), run)
    expect(r.same).toBe(false)
    expect(r.moved).toBe(2)
    expect(r.first).toBe('#3 table|50|-0.5: rel[1] 50 -> 51')
    expect(r.lines).toHaveLength(2)
    expect(r.lines[1]).toBe('#5 table|100|1: rng 11 -> 0; queue [] -> ["choice:x"]')
  })

  it('sees a moved money, nextId and x field, a person that is gone, a step renamed, a step added or dropped', () => {
    const base = rows()
    const run = rows()
    run[0]!.money = 1
    run[1]!.nextId = 99
    run[2]!.x = { purse: 5 }
    run[4]!.rel.pop()
    run[6]!.label = 'other'
    run.push({ ...run[0]!, label: 'extra' })
    const r = compareRows(base, run, 99)
    expect(r.moved).toBe(6)
    expect(r.lines.join('\n')).toMatch(/money 0 -> 1/)
    expect(r.lines.join('\n')).toMatch(/nextId 3 -> 99/)
    expect(r.lines.join('\n')).toMatch(/x\.purse undefined -> 5/)
    expect(r.lines.join('\n')).toMatch(/rel\[2\] \d+ -> undefined/)
    expect(r.lines.join('\n')).toMatch(/the step is other, the recording has/)
    expect(r.lines.join('\n')).toMatch(/#\d+ extra: not in the recording/)
    expect(compareRows(run, base, 99).lines.join('\n')).toMatch(/#\d+ extra: the run has no such step/)
  })

  it('reports at most the limit of rows but counts them all', () => {
    const run = rows().map((r) => ({ ...r, money: 7 }))
    const r = compareRows(rows(), run, 3)
    expect(r.moved).toBe(run.length)
    expect(r.lines).toHaveLength(3)
  })

  it('does not see a float beyond nine digits', () => {
    const a = scene([2, 2026], { cast: [{ key: 'a', relation: 'friend', age: 30 }] })
    const x = a.step('s', () => undefined, () => ({ v: 1 / 3 }))
    const y = { ...x, x: cut({ v: 0.3333333333333 }) as { [k: string]: never } }
    expect(compareRows([x], [y]).same).toBe(true)
  })
})

describe('the recorder', () => {
  const O = oracle('scratch', join(SCRATCH, 'social-parity-scratch.json'))

  it('writes only when asked: no area, another area, a missing reason and a stock reason are all refused', () => {
    const rows = referenceRows()
    expect(() => recordRows(O, rows, deps({ env: { RECORD_SOCIAL_PARITY: '' } }))).toThrow(/only when asked/)
    expect(() => recordRows(O, rows, deps({ env: { RECORD_SOCIAL_PARITY: 'love' } }))).toThrow(/only when asked/)
    expect(() => recordRows(O, rows, deps({ env: { RECORD_REASON: undefined } }))).toThrow(/a reason is required/)
    expect(() => recordRows(O, rows, deps({ env: { RECORD_REASON: 'update golden' } }))).toThrow(/RECORD_REASON/)
    expect(() => recordRows(O, rows, deps({ env: { RECORD_REASON: `recorded ${String.fromCharCode(0x2014)} on the clean tree of the release` } }))).toThrow(/long dash/)
    expect(() => readRows(O)).toThrow(/is missing: RECORD_SOCIAL_PARITY=scratch/)
  })

  it('writes only under the Node major CI runs', () => {
    const rows = referenceRows()
    expect(() => recordRows(O, rows, deps({ node: '24.22.0' }))).toThrow(/Node 22, the version CI runs, not 24\.22\.0/)
    expect(() => recordRows(O, rows, deps({ node: '20.1.0' }))).toThrow(/Node 22/)
  })

  it('writes only on an engine that equals HEAD, unless told, and then marks the header', () => {
    const rows = referenceRows()
    const dirty = (args: readonly string[]): string => (args[0] === 'status' ? ' M src/game/core.ts' : gitOut(...args))
    expect(() => recordRows(O, rows, deps({ git: dirty }))).toThrow(/src\/ has uncommitted changes/)
    const text = recordRows(O, rows, deps({ git: dirty, env: { RECORD_DIRTY: '1' } }))
    expect(JSON.parse(text)).toMatchObject({ dirty: true })
    recordRows(O, rows, deps())
    expect(JSON.parse(readFileSync(O.file, 'utf8'))).not.toHaveProperty('dirty')
  })

  it('names HEAD, the tree of src, the node and the reason in the header', () => {
    recordRows(O, referenceRows(), deps())
    const text = readFileSync(O.file, 'utf8')
    const header = JSON.parse(text) as Header
    expect(header).toMatchObject({ v: 1, area: 'scratch', node: 'v22.23.3', head: gitOut('rev-parse', '--short', 'HEAD'), src: gitOut('rev-parse', 'HEAD:src'), reason: REASON, digits: 9, count: referenceRows().length })
    expect(header.gridHash).toBe(gridHash(referenceRows()))
    expect(text.split('\n').filter((l) => l.startsWith('["')).length).toBe(header.count)
  })

  it('writes the same bytes twice, and reads back what it wrote', () => {
    const rows = referenceRows()
    const first = recordRows(O, rows, deps())
    const second = recordRows(O, referenceRows(), deps())
    expect(second).toBe(first)
    expect(readFileSync(O.file, 'utf8')).toBe(first)
    const back = readRows(O)
    expect(back.rows).toEqual(rows)
    expect(compareRows(back.rows, referenceRows()).same).toBe(true)
    expect(() => expectRows(O, referenceRows())).not.toThrow()
  })

  it('takes a comma list and all, and the default file name', () => {
    expect(isRecording('love', { RECORD_SOCIAL_PARITY: 'relationships, love' })).toBe(true)
    expect(isRecording('wealth', { RECORD_SOCIAL_PARITY: 'relationships,love' })).toBe(false)
    expect(isRecording('wealth', { RECORD_SOCIAL_PARITY: 'all' })).toBe(true)
    expect(isRecording('wealth', {})).toBe(false)
    expect(oracle('love').file).toBe('test/fixtures/social-parity-love.json')
    expect(oracle('lifepins', 'test/fixtures/life-pins.json').file).toBe('test/fixtures/life-pins.json')
    expect(() => oracle('Bad Area')).toThrow(/lower-case/)
  })

  it('expectRows names the first row that moved, the area and the commit', () => {
    recordRows(O, referenceRows(), deps())
    const run = referenceRows()
    run[2]!.rel[1] = 77
    expect(() => expectRows(O, run)).toThrow(/^scratch: 1 of 15 rows moved \(recorded at [0-9a-f]+, src [0-9a-f]{10}\); the first is #2 table\|49\|0\.5: rel\[1\] 50 -> 77/)
    const renamed = referenceRows()
    renamed[0]!.label = 'renamed'
    expect(() => expectRows(O, renamed)).toThrow(/the steps are not the recorded ones/)
  })

  it('refuses a recording edited by hand, a file that is not one, and one that is not JSON', () => {
    recordRows(O, referenceRows(), deps())
    const text = readFileSync(O.file, 'utf8')
    expect(() => parseRecording(O, text.replace('"table|0|-5"', '"table|0|-6"'))).toThrow(/edited by hand/)
    expect(() => parseRecording(O, text.replace('"count": 15', '"count": 14'))).toThrow(/edited by hand/)
    expect(() => parseRecording(O, '{"v": 2, "rows": []}')).toThrow(/not a version 1 recording/)
    expect(() => parseRecording(O, 'nope')).toThrow(/not JSON/)
    expect(() => parseRecording(O, text.replace('["table|0|-5",[', '["table|0|-5",3,['))).toThrow(/not a recorded step|edited by hand/)
    writeFileSync(join(SCRATCH, 'junk.json'), '[]')
    expect(() => readRows(oracle('junk', join(SCRATCH, 'junk.json')))).toThrow(/not a version 1 recording/)
  })

  it('serialize puts the header one field a line and each row on one line', () => {
    const rows = referenceRows().slice(0, 2)
    const header: Header = { v: 1, area: 'a', node: 'v22.0.0', head: 'abc1234', src: 'f'.repeat(40), reason: REASON, digits: 9, gridHash: gridHash(rows), count: 2 }
    const text = serialize(header, rows)
    expect(text.split('\n')).toHaveLength(16)
    expect(text.endsWith(']\n}\n')).toBe(true)
    expect(parseRecording(oracle('a'), text).rows).toEqual(rows)
  })
})

describe('the purity tools it re-exports', () => {
  it('a trapped g.rng throws on a draw and a named scene draws nothing in a read', () => {
    const g = trapRng(scene([9, 2026], { cast: [{ key: 'a', relation: 'friend', age: 30 }] }).g)
    expect(() => rand(g)).toThrow(RngTrapError)
    expect(() => chance(g, 0.5)).toThrow(RngTrapError)
    expect(Object.isFrozen(frozenGame(3))).toBe(true)
  })
})
