// ci: fast
// R4-S1 (D.1 a): the registry pins. test/fixtures/registry-pins.json holds what createPerson, the person-key readers, rosterAt, the
// trait readers and initializeNpc return today, and the person accounts a played year leaves in the ledger, recorded on the
// unmodified v5.2.0 code under Node 22 (the CI version). The tasks that follow (the one person-key rule, sids, the Met shard,
// persona axes, reader migration) keep every one of these answers, so this file is green by construction on unmodified code and
// names the first rows that moved on any other. Recording is for this task only:
//
//   RECORD_REGISTRY_PINS=1 /Users/saeed/projects/anotherlife/wt/bin/vt22 test/registry-pins.test.ts
//
// Without the variable nothing is written, and a missing file is a failure that names this command. Never record to make a change
// pass: a moved row is a changed answer, and moved-tests.md has a row for each one the owner agreed to.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createPerson } from '../src/game/people'
import { makeTestGame } from './helpers'
import {
  CREATE_COUNTRIES,
  CREATE_SHAPES,
  CREATE_YEARS,
  ENTITLEMENTS,
  createState,
  HOSTILE_IDS,
  PINS_FILE,
  PIN_GROUPS,
  RECORD_COMMAND,
  ROSTER_COUNTRIES,
  ROSTER_FAMILIES,
  ROSTER_SPECS,
  ROSTER_YEARS,
  SID_SHAPES,
  measure,
  npcPersons,
  personAccounts,
  pinDiff,
  pinRows,
  pinned,
  readPins,
  recordPins,
  traitSets,
  type PinGroup,
} from './registry-pins-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const TIMEOUT = 120_000
const RECORD = process.env.RECORD_REGISTRY_PINS === '1'

describe('the recorder', () => {
  it.skipIf(RECORD)('refuses to write without RECORD_REGISTRY_PINS=1, and says what to run', () => {
    expect(() => recordPins()).toThrow(/RECORD_REGISTRY_PINS=1/)
  })

  it.runIf(RECORD)('records the pins on this code', { timeout: 600_000 }, () => {
    recordPins()
    expect(existsSync(join(ROOT, PINS_FILE))).toBe(true)
  })
})

describe('the pin file', () => {
  it('exists, and a missing file names the command that records it', () => {
    if (!existsSync(join(ROOT, PINS_FILE))) expect.fail(`${PINS_FILE} is missing: ${RECORD_COMMAND}`)
  })

  it('names the Node and the commit it was recorded on, and holds the six groups', () => {
    const raw = JSON.parse(readFileSync(join(ROOT, PINS_FILE), 'utf8')) as { v: number; node: string; head: string; groups: Record<string, unknown[]> }
    expect(raw.v).toBe(1)
    expect(raw.node).toMatch(/^v22\.\d+\.\d+$/)
    expect(raw.head).toMatch(/^[0-9a-f]{7,40}$/)
    expect(Object.keys(raw.groups)).toEqual([...PIN_GROUPS])
  })

  it('keeps one row to a line, so a diff names the row that moved', () => {
    const lines = readFileSync(join(ROOT, PINS_FILE), 'utf8').split('\n')
    const rows = lines.filter((l) => l.startsWith('["'))
    const total = PIN_GROUPS.reduce((n, g) => n + pinRows(g).length, 0)
    expect(rows).toHaveLength(total)
  })

  it('holds the grid sizes the plan names, and no row twice', () => {
    expect(pinRows('createPerson')).toHaveLength(14 * CREATE_YEARS.length * CREATE_COUNTRIES.length)
    expect(CREATE_SHAPES).toHaveLength(14)
    expect(SID_SHAPES).toHaveLength(16)
    expect(pinRows('sidKey')).toHaveLength(SID_SHAPES.length + 1 + HOSTILE_IDS.length)
    expect(pinRows('roster')).toHaveLength(ROSTER_FAMILIES.length * ROSTER_SPECS.length * ROSTER_YEARS.length * ROSTER_COUNTRIES.length)
    expect(traitSets()).toHaveLength(1 + 30 + (30 * 29) / 2)
    expect(pinRows('traits')).toHaveLength(traitSets().length * ENTITLEMENTS.length)
    expect(npcPersons()).toHaveLength(40)
    expect(pinRows('npc')).toHaveLength(40)
    expect(pinRows('ledgerKeys')).toHaveLength(1)
    for (const g of PIN_GROUPS) {
      const ids = pinRows(g).map((r) => r[0])
      expect(new Set(ids).size, g).toBe(ids.length)
    }
  })

  it('records every roster with rivals in it for the eras that have a field', () => {
    const lists = pinRows('roster').map((r) => r[1] as unknown[][])
    expect(lists.some((l) => l.length > 0)).toBe(true)
    for (const l of lists) for (const r of l) expect(r).toHaveLength(5)
  })
})

describe('what the recording says about the code it was made on', () => {
  it('createPerson given every option draws nothing and takes one id', () => {
    const at = CREATE_SHAPES.findIndex((s) => s.name === 'every-field')
    for (const year of CREATE_YEARS) {
      for (const country of CREATE_COUNTRIES) {
        const v = pinned('createPerson', `every-field|${year}|${country}`) as { rng: number; nextId: number }
        expect(v.rng, `${year} ${country}`).toBe(makeTestGame(11 + at).rng)
        expect(v.nextId).toBe(1)
      }
    }
  })

  it('a name that clashes with the player is rolled again', () => {
    for (const name of ['clash', 'clash-last']) {
      const i = CREATE_SHAPES.findIndex((s) => s.name === name)
      const first = createPerson(createState(i, 2026, 'us'), CREATE_SHAPES[i]!.opts)
      const v = pinned('createPerson', `${name}|2026|us`) as { person: { firstName: string; lastName: string } }
      expect(`${v.person.firstName} ${v.person.lastName}`, name).not.toBe(`${first.firstName} ${first.lastName}`)
    }
  })

  it('every person account after a year is a person of that life', () => {
    const v = pinned('ledgerKeys', 'family-2000') as ReturnType<typeof personAccounts>
    expect(v.accounts.length).toBeGreaterThan(0)
    for (const a of v.accounts) expect(v.ids, a).toContain(a.slice('person:'.length))
  })

  it('a sid that is a name is the key, and anything else falls to the id', () => {
    const ref = (name: string): string => (pinned('sidKey', `sid|${name}`) as { ref: string }).ref
    expect(ref('s77')).toBe('person:s77')
    expect(ref('s9')).toBe('person:s9')
    expect(ref('s-42')).toBe('person:s-42')
    for (const name of ['empty', 'space', 'len53', 'unicode', 'number', 'null', 'array', 'object', 'absent']) expect(ref(name), name).toBe('person:p5')
    for (const id of HOSTILE_IDS) expect((pinned('sidKey', `id|${id}`) as { ref: string }).ref, id).toBe('pool:other')
  })
})

describe('today\'s code gives the recorded answers', () => {
  it('reads the same file the kit compares to', () => {
    expect(readPins().groups.createPerson.length).toBeGreaterThan(0)
  })

  it.each(PIN_GROUPS as readonly PinGroup[])('%s: no row moved', (group) => {
    const diff = pinDiff(group, measure(group))
    if (diff.length > 0) throw new Error(`${group}: ${diff.length} row${diff.length === 1 ? '' : 's'} moved against ${PINS_FILE}\n${diff.slice(0, 12).join('\n')}`)
  }, TIMEOUT)
})
