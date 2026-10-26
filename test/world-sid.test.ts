// ci: fast
// R4-S3 (D.1 b): the sid grammar (src/game/world/sid.ts). A person who is not in g.people yet is a slot, (kind, place, cohort, ord),
// and the text of a slot is the person's sid: 'cls.us.2004.12', 'actor.us.1985.0'. The grammar is closed (18 kinds, append-only),
// canonical (one text for one slot, so makeSid(parseSid(x)) === x) and total on the reading side (parseSid takes anything and
// returns null for what it does not accept), while makeSid is for code and throws a RangeError for a slot that is not one.
//
// Also here: the ids rosterAt already makes are sids (S1's pin rows), a sid is a valid `person:` ref of 52 characters at most, and
// docs/PEOPLE.md names the eight parallel named-person shapes with an anchor that is still true in the code.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRef } from '../src/game/kernel/ids'
import { personEntity, validSid } from '../src/game/kernel/person-ref'
import { SID_KINDS, SID_LIMITS, isSid, makeSid, parseSid, type SidKind, type Slot } from '../src/game/world/sid'
import { layerOf } from './layer-kit'
import { pinRows } from './registry-pins-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const FILE = 'src/game/world/sid.ts'
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

const KINDS_IN_ORDER = ['actor', 'model', 'music', 'astronaut', 'author', 'gamedev', 'sport', 'cls', 'tch', 'cow', 'boss', 'dat', 'frn', 'kin', 'dir', 'stf', 'exe', 'pol']
const PLACES = ['us', 'jp', 'a', 'Montreal-1', 'firm_0123456']
const COHORTS = [1850, 1985, 2004, 2400]
const ORDS = [0, 1, 9, 10, 9999]

/** The texts that older code calls an id of a person: none of them may be a sid. */
const LEGACY = [/^p\d+$/, /^ks\d+$/, /^out\..*$/, /^a\d+$/]

describe('the kind table', () => {
  it('has the 18 kinds in the order the plan pins, frozen (append-only: R6 and R7 add at the end)', () => {
    expect([...SID_KINDS]).toEqual(KINDS_IN_ORDER)
    expect(SID_KINDS).toHaveLength(18)
    expect(Object.isFrozen(SID_KINDS)).toBe(true)
    expect(new Set(SID_KINDS).size).toBe(18)
  })

  it('has no kind that older ids could be: no p, ks, a or out, and every kind is lower case letters only', () => {
    for (const k of SID_KINDS) {
      expect(k, k).toMatch(/^[a-z]+$/)
      expect(['p', 'ks', 'a', 'out'], k).not.toContain(k)
    }
  })

  it('states its limits once: cohort 1850..2400, ord 0..9999, place 12, 40 characters', () => {
    expect(SID_LIMITS).toEqual({ cohortMin: 1850, cohortMax: 2400, ordMax: 9999, placeMax: 12, lengthMax: 40 })
    expect(Object.isFrozen(SID_LIMITS)).toBe(true)
  })
})

describe('makeSid and parseSid: the round trip', () => {
  it('every kind x 5 places x 4 cohorts x ord 0, 1, 9, 10, 9999 reads back as the slot and writes back as the text', () => {
    let n = 0
    for (const kind of SID_KINDS) {
      for (const place of PLACES) {
        for (const cohort of COHORTS) {
          for (const ord of ORDS) {
            const slot: Slot = { kind, place, cohort, ord }
            const sid = makeSid(slot)
            expect(sid).toBe(`${kind}.${place}.${cohort}.${ord}`)
            expect(parseSid(sid)).toEqual(slot)
            expect(makeSid(parseSid(sid)!)).toBe(sid)
            expect(isSid(sid)).toBe(true)
            expect(sid.length).toBeLessThanOrEqual(40)
            expect(sid).not.toContain(':')
            for (const legacy of LEGACY) expect(legacy.test(sid), `${sid} ${legacy}`).toBe(false)
            n++
          }
        }
      }
    }
    expect(n).toBe(18 * 5 * 4 * 5)
  })

  it('writes the same text for the same slot, and a different text for any other', () => {
    const seen = new Set<string>()
    for (const kind of SID_KINDS) for (const cohort of COHORTS) for (const ord of ORDS) seen.add(makeSid({ kind, place: 'us', cohort, ord }))
    expect(seen.size).toBe(18 * 4 * 5)
  })

  it('reads an extra property of a slot as nothing: the text has four parts', () => {
    const slot = { kind: 'cls', place: 'us', cohort: 2004, ord: 12, extra: 'x' } as Slot
    expect(makeSid(slot)).toBe('cls.us.2004.12')
  })

  it('the longest sid is well under 40 characters, and is a valid person: ref of 52 or fewer', () => {
    const longest = makeSid({ kind: 'astronaut', place: 'abcdefghijkl', cohort: 2400, ord: 9999 })
    expect(longest).toHaveLength(32)
    for (const kind of SID_KINDS) {
      const sid = makeSid({ kind, place: 'abcdefghijkl', cohort: 2400, ord: 9999 })
      expect(sid.length).toBeLessThanOrEqual(SID_LIMITS.lengthMax)
      expect(parseRef(`person:${sid}`), sid).toEqual({ kind: 'person', key: sid })
      expect(validSid(sid)).toBe(sid)
      expect(personEntity({ id: 'p1', data: { sid } })).toBe(`person:${sid}`)
    }
  })
})

describe('parseSid reads canonical text only', () => {
  const BAD: string[] = [
    // the wrong number of parts
    '', ' ', '.', '...', 'cls', 'cls.us', 'cls.us.2004', 'cls.us.2004.', 'cls..2004.12', '.us.2004.12', 'cls.us..12', 'cls.us.2004.12.5', 'cls.us.2004.12.', 'cls.us.2004.12.5.6',
    // a cohort or an ord that is not canonical plain decimal, or is out of range
    'cls.us.02004.12', 'cls.us.2004.012', 'cls.us.2004.00', 'cls.us.2004.01', 'cls.us.2004.10000', 'cls.us.2004.99999', 'cls.us.1849.1', 'cls.us.2401.1', 'cls.us.0.1', 'cls.us.99999.1',
    'cls.us.2004.-1', 'cls.us.-2004.1', 'cls.us.2004.1e2', 'cls.us.2004.0x10', 'cls.us.2004.+5', 'cls.us.2004. 5', 'cls.us.2004.5 ', 'cls.us.2004.1.0', 'cls.us.2004.٥', 'cls.us.２００４.5',
    // a kind that is not in the table, or is spelled differently
    'CLS.us.2004.5', 'Cls.us.2004.5', 'out.us.2004.5', 'p12', 'ks3', 'a7', 'out.Ann.Lee', 'out.Ann.Lee.kin.30.50', '__proto__.us.2004.5', 'constructor.us.2004.5', 'toString.us.2004.5', 'hasOwnProperty.us.2004.5', 'class.us.2004.5',
    // a place that is not 1 to 12 of letters, digits, underscore and dash
    'cls.u:s.2004.5', 'cls.u s.2004.5', 'cls.thirteenchars.2004.5', 'cls.ñandú.2004.5', 'cls.u/s.2004.5', 'cls.us\n.2004.5', 'cls.us.2004.5\n', 'cls.us.2004.5\0', 'cls.u\ts.2004.5',
    // a ref, or text that older code uses for an id
    'person:cls.us.2004.5', 'cls:us:2004:5', 's77', 's-42', 's9',
    // too long
    `cls.${'x'.repeat(30)}.2004.5`, `${'cls.us.2004.5'.padEnd(41, '5')}`,
  ]

  it('returns null for each of 60 or more bad texts, and isSid says no', () => {
    expect(BAD.length).toBeGreaterThanOrEqual(60)
    for (const bad of BAD) {
      expect(parseSid(bad), JSON.stringify(bad)).toBeNull()
      expect(isSid(bad), JSON.stringify(bad)).toBe(false)
    }
  })

  it('returns null for anything that is not text, and never throws', () => {
    const hostile: unknown[] = [
      null, undefined, 0, 5, NaN, 1e9, true, false, {}, [], ['cls', 'us', 2004, 12], { kind: 'cls', place: 'us', cohort: 2004, ord: 12 },
      Symbol('cls.us.2004.12'), () => 'cls.us.2004.12', 12n, new String('cls.us.2004.12'), { toString: () => 'cls.us.2004.12' }, Object.create(null),
      new Date(0), /cls/,
    ]
    for (const h of hostile) {
      expect(() => parseSid(h)).not.toThrow()
      expect(parseSid(h)).toBeNull()
      expect(isSid(h)).toBe(false)
    }
  })

  it('accepts the edges: the first and last cohort, ord 0 and 9999, the 1 and the 12 character place, a dash and an underscore', () => {
    expect(parseSid('cls.a.1850.0')).toEqual({ kind: 'cls', place: 'a', cohort: 1850, ord: 0 })
    expect(parseSid('pol.abcdefghijkl.2400.9999')).toEqual({ kind: 'pol', place: 'abcdefghijkl', cohort: 2400, ord: 9999 })
    expect(parseSid('frn.my_town-2.1999.7')).toEqual({ kind: 'frn', place: 'my_town-2', cohort: 1999, ord: 7 })
    expect(parseSid('frn.0.1999.7')).toEqual({ kind: 'frn', place: '0', cohort: 1999, ord: 7 })
  })

  it('a text that parses is the text makeSid writes: no two texts for one slot', () => {
    for (const kind of SID_KINDS) {
      const sid = `${kind}.us.1990.3`
      expect(makeSid(parseSid(sid)!)).toBe(sid)
    }
  })
})

describe('makeSid is for code and throws a RangeError for a slot that is not one', () => {
  const ok: Slot = { kind: 'cls', place: 'us', cohort: 2004, ord: 12 }
  const bad = (over: Record<string, unknown>): Slot => ({ ...ok, ...over }) as unknown as Slot

  it('refuses a kind outside the table', () => {
    for (const kind of ['', 'out', 'p', 'CLS', '__proto__', 'toString', 5, null, undefined]) expect(() => makeSid(bad({ kind })), String(kind)).toThrow(RangeError)
  })

  it('refuses a place that is not 1 to 12 of letters, digits, underscore and dash', () => {
    for (const place of ['', 'a.b', 'a:b', 'a b', 'thirteenchars', 'ñ', 5, null, undefined, 'x\n']) expect(() => makeSid(bad({ place })), String(place)).toThrow(RangeError)
  })

  it('refuses a cohort outside 1850..2400 or not a whole number', () => {
    for (const cohort of [1849, 2401, 0, -1850, 1990.5, NaN, Infinity, '1990', null, undefined]) expect(() => makeSid(bad({ cohort })), String(cohort)).toThrow(RangeError)
  })

  it('refuses an ord outside 0..9999 or not a whole number', () => {
    for (const ord of [-1, 10000, 1.5, NaN, Infinity, '1', null, undefined]) expect(() => makeSid(bad({ ord })), String(ord)).toThrow(RangeError)
  })

  it('refuses what is not a slot at all', () => {
    for (const s of [null, undefined, 5, 'cls.us.2004.12', [], () => 1]) expect(() => makeSid(s as unknown as Slot), String(s)).toThrow(RangeError)
  })
})

describe('the ids rosterAt already makes are sids', () => {
  // S1's pin rows: id `<family>|<career>|<year>|<country>`, value a list of [id, name, born, gender, country].
  const rows = pinRows('roster')
  const lists = rows.map(([id, v]) => ({ id, parts: id.split('|'), list: v as [string, string, number, string, string][] }))

  it('has rows with rivals in them', () => {
    expect(lists.reduce((n, r) => n + r.list.length, 0)).toBeGreaterThan(400)
  })

  it('reads back the career, the country, the cohort and the index of every rival', () => {
    for (const { id, parts, list } of lists) {
      const [, career, year, country] = parts as [string, string, string, string]
      for (const [rid] of list) {
        expect(isSid(rid), `${id} ${rid}`).toBe(true)
        const slot = parseSid(rid)!
        expect(slot.kind, rid).toBe(career as SidKind)
        expect(slot.place, rid).toBe(country)
        expect(slot.cohort % 5, rid).toBe(0)
        expect(slot.cohort, rid).toBeLessThanOrEqual(Number(year))
        expect(Number.isInteger(slot.ord) && slot.ord >= 0 && slot.ord <= 9999, rid).toBe(true)
        expect(makeSid(slot), rid).toBe(rid)
        expect(validSid(rid), rid).toBe(rid)
      }
    }
  })

  it('numbers from 0, so an ord that starts at 1 would refuse a real id', () => {
    const ords = lists.flatMap((r) => r.list.map(([rid]) => parseSid(rid)!.ord))
    expect(Math.min(...ords)).toBe(0)
  })
})

describe('the module', () => {
  it('sits in layer 2, imports no other game file, and has no long dash', () => {
    expect(layerOf(FILE)).toBe(2)
    const text = read(FILE)
    expect([...text.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1])).toEqual([])
    expect(DASH.test(text)).toBe(false)
  })

  it('reads no game state and draws nothing: it is a function of its argument', () => {
    expect(parseSid.length).toBe(1)
    expect(makeSid.length).toBe(1)
    expect(isSid.length).toBe(1)
    expect(parseSid('cls.us.2004.12')).not.toBe(parseSid('cls.us.2004.12'))
  })
})

describe('docs/PEOPLE.md: the eight named-person shapes', () => {
  const doc = read('docs/PEOPLE.md')

  // [name in the doc, file, the text the line at the cited number must hold]
  const ANCHORS: readonly (readonly [name: string, file: string, line: number, holds: string])[] = [
    ['Candidate', 'src/game/love.ts', 252, 'interface Candidate'],
    ['makeCandidate', 'src/game/love.ts', 286, 'function makeCandidate'],
    ['strangerName', 'src/game/events/helpers.ts', 454, 'function strangerName'],
    ['opponent', 'src/game/special/politics.ts', 583, 'opponent: string'],
    ['opponentName', 'src/game/special/politics.ts', 594, 'function opponentName'],
    ['CareerRival', 'src/game/special/kit/rivals.ts', 32, 'interface CareerRival'],
    ['Director', 'src/game/business/board-state.ts', 22, 'interface Director'],
    ['KeyStaff', 'src/game/business/state.ts', 24, 'interface KeyStaff'],
    ['Manager', 'src/game/business/state.ts', 282, 'interface Manager'],
    ['Outsider', 'src/game/business/nepo-actions.ts', 136, 'interface Outsider'],
  ]

  it('names each of the eight shapes with the path and the line of its type, and the line still holds the type', () => {
    for (const [name, file, line, holds] of ANCHORS) {
      const base = file.slice(file.lastIndexOf('/') + 1)
      expect(doc, `${name} ${base}:${line}`).toContain(`${base}:${line}`)
      const at = read(file).split('\n')[line - 1] ?? ''
      expect(at, `${file}:${line}`).toContain(holds)
    }
  })

  it('has one table row for each of the eight with who creates it, whether it is saved, and the kind R6 will use', () => {
    const shapes = ['Candidate', 'strangerName', 'opponent', 'CareerRival', 'Director', 'KeyStaff', 'Manager', 'Outsider']
    const rows = doc.split('\n').filter((l) => l.startsWith('|') && shapes.some((n) => (l.split('|')[1] ?? '').includes(n)))
    expect(rows).toHaveLength(8)
    shapes.forEach((n, i) => expect(rows[i]!.split('|')[1], n).toContain(n))
    // five cells: shape, type and path:line, built by, saved, kind for R6 (an empty cell is a missing answer)
    for (const r of rows) {
      const cells = r.split('|').slice(1, -1).map((c) => c.trim())
      expect(cells, r).toHaveLength(5)
      for (const c of cells) expect(c.length, r).toBeGreaterThan(1)
    }
  })

  it('holds the grammar, the facets and the caps, and says what the frozen tables are', () => {
    for (const word of ['SID_KINDS', 'makeSid', 'parseSid', 'LATENT_V', 'KIND_AGE', 'FACET', 'soc.latent', 'latent-golden.json', 'MET_CAPS']) expect(doc, word).toContain(word)
    for (const kind of KINDS_IN_ORDER) expect(doc, kind).toContain(`\`${kind}\``)
  })

  it('has no long dash', () => {
    expect(DASH.test(doc)).toBe(false)
  })
})
