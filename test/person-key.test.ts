// ci: fast
// R4-S1 (D.1 a): the one rule for a person's key. Until now two files each held a copy of "person:<data.sid> when that is a name an
// account can have, else person:<id>, else pool:other" (cash.ts for the books, world/people.ts for the index). src/game/kernel/
// person-ref.ts is the one copy: validSid, personKey, personEntity and heirUnsafe. This file proves it answers exactly what the two
// copies answered (test/fixtures/registry-pins.json, recorded on the tree before the move), that both old call sites now go
// through it, and that it sits in layer 0. Nothing here draws g.rng and nothing writes a person.
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { personPurse } from '../src/game/cash'
import { isRef, parseRef } from '../src/game/kernel/ids'
import { heirUnsafe, personEntity, personKey, validSid } from '../src/game/kernel/person-ref'
import type { RelationKind } from '../src/game/types'
import { personRef } from '../src/game/world/people'
import { deepFreeze } from './fuzz-kit'
import { layerOf } from './layer-kit'
import { HOSTILE_IDS, SID_SHAPES, dataLessPerson, plainPerson, pinned, sidPerson } from './registry-pins-kit'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const FILE = 'src/game/kernel/person-ref.ts'
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

/** What the two old copies answered for one shape, from the pin file. */
const answer = (name: string): { purse: string; ref: string } => pinned('sidKey', name) as { purse: string; ref: string }

describe('the rule equals the pins on the 16 shapes of data.sid', () => {
  it.each(SID_SHAPES.map((s) => s.name))('%s: personEntity, the purse and personRef name the person as recorded', (name) => {
    const shape = SID_SHAPES.find((s) => s.name === name)!
    const p = sidPerson(shape)
    const want = answer(`sid|${name}`)
    expect(personEntity(p)).toBe(want.ref)
    expect(personRef(p)).toBe(want.ref)
    expect(personPurse(p).acct).toBe(want.purse)
    expect(`person:${personKey(p)}`).toBe(want.ref)
  })

  it('a person with no data at all is keyed by id', () => {
    const p = dataLessPerson()
    const want = answer('sid|no-data')
    expect(personKey(p)).toBe('p5')
    expect(personEntity(p)).toBe(want.ref)
    expect(personRef(p)).toBe(want.ref)
    expect(personPurse(p).acct).toBe(want.purse)
  })

  it.each(HOSTILE_IDS.map((id) => [id]))('the id %j is no name: pool:other, and personKey is still the id', (id) => {
    const p = plainPerson(id)
    expect(answer(`id|${id}`).ref).toBe('pool:other')
    expect(personEntity(p)).toBe('pool:other')
    expect(personRef(p)).toBe('pool:other')
    expect(personPurse(p).acct).toBe('pool:other')
    expect(personKey(p)).toBe(id)
  })

  it('an id that is not even text is no name either', () => {
    const p = plainPerson(5 as unknown as string)
    expect(personEntity(p)).toBe('pool:other')
    expect(personRef(p)).toBe('pool:other')
    expect(personPurse(p).acct).toBe('pool:other')
  })

  it('a sid that is a name wins over the id, and keeps the strings the old tests use valid', () => {
    for (const sid of ['s77', 's9', 's-42', 'cls.us.2004.12', 'actor.us.1985.0', 'a:b', '__proto__', 'constructor']) {
      expect(validSid(sid), sid).toBe(sid)
      expect(personKey(plainPerson('p5', { data: { sid } })), sid).toBe(sid)
    }
  })
})

describe('validSid is the old test and nothing stricter', () => {
  it('is the text itself exactly when person:<text> parses as a ref, else null', () => {
    const texts = ['', ' ', 'a', 's77', 'a b', 'a:b', 'a::b', ':a', 'a:', 'x'.repeat(52), 'x'.repeat(53), 'ñ', 'a/b', 'a.b_c-d', 'P1', '0', '-', '.', 'cls.us.2004.12', '__proto__']
    for (const t of texts) expect(validSid(t), JSON.stringify(t)).toBe(parseRef(`person:${t}`) !== null ? t : null)
    for (const t of texts) expect(validSid(t) !== null, JSON.stringify(t)).toBe(isRef(`person:${t}`))
  })

  it('is null for anything that is not text', () => {
    for (const v of [5, 0, NaN, null, undefined, true, [], ['s77'], {}, { sid: 's77' }, () => 's77', Symbol('s'), 10n]) expect(validSid(v)).toBeNull()
  })

  it('is total: no input throws', () => {
    const hostile: unknown[] = [Object.create(null), new Date(0), new Map(), { toString: () => 's77' }, { valueOf: () => 's77' }, 'x'.repeat(100_000), new Proxy({}, { get: () => 's77' })]
    for (const v of hostile) expect(() => validSid(v)).not.toThrow()
  })
})

describe('personEntity and personKey', () => {
  it('read a frozen person without writing it', () => {
    const p = deepFreeze(sidPerson({ name: 's77', sid: 's77' }))
    expect(personEntity(p)).toBe('person:s77')
    expect(personKey(p)).toBe('s77')
    const q = deepFreeze(plainPerson('p12'))
    expect(personEntity(q)).toBe('person:p12')
    expect(personKey(q)).toBe('p12')
  })

  it('are the same for a person and for a bare { id, data } stand-in (holdings looks a holder up by id only)', () => {
    expect(personEntity({ id: 'p3', data: {} })).toBe('person:p3')
    expect(personEntity({ id: 'p3', data: { sid: 's9' } })).toBe('person:s9')
  })

  it('personRef is the same function of the person as personEntity', () => {
    const people = [...SID_SHAPES.map(sidPerson), dataLessPerson(), ...HOSTILE_IDS.map((id) => plainPerson(id))]
    for (const p of people) expect(personRef(p)).toBe(personEntity(p))
  })

  it('a person with no sid is keyed by its id, as every person made so far is', () => {
    for (const id of ['p1', 'p42', 'p9999', 'me1']) expect(personKey(plainPerson(id))).toBe(id)
  })
})

describe('heirUnsafe', () => {
  const withSid = (relation: RelationKind, sid: unknown = 's77') => ({ relation, data: { sid } as never })

  it('is true for a valid sid on a child, a stepchild and a grandchild', () => {
    for (const relation of ['child', 'stepchild', 'grandchild'] as const) expect(heirUnsafe(withSid(relation)), relation).toBe(true)
  })

  it('is false for a friend, a spouse and a pet that have a sid', () => {
    for (const relation of ['friend', 'spouse', 'pet', 'parent', 'sibling', 'partner', 'coworker'] as const) expect(heirUnsafe(withSid(relation)), relation).toBe(false)
  })

  it('is false for a child with no sid, or with a sid that is no name', () => {
    expect(heirUnsafe({ relation: 'child', data: {} })).toBe(false)
    for (const sid of ['', 'has space', 'x'.repeat(53), 5, null, [], {}]) expect(heirUnsafe(withSid('child', sid)), JSON.stringify(sid)).toBe(false)
    expect(heirUnsafe({ relation: 'stepchild', data: undefined as never })).toBe(false)
  })

  it('agrees with validSid on the 16 shapes for a child', () => {
    for (const shape of SID_SHAPES) {
      const p = sidPerson(shape)
      expect(heirUnsafe({ relation: 'child', data: p.data }), shape.name).toBe(validSid(p.data.sid) !== null)
    }
  })

  it('reads a frozen person', () => {
    expect(heirUnsafe(deepFreeze({ relation: 'grandchild' as const, data: { sid: 'cls.us.2004.12' } }))).toBe(true)
  })
})

describe('the rule exists once', () => {
  /** The relative imports of a file, as repo-relative paths with an extension left off. */
  function importsOf(path: string): string[] {
    const out: string[] = []
    for (const m of read(path).matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s+['"]([^'"]+)['"]/gm)) out.push(m[1]!)
    for (const m of read(path).matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.push(m[1]!)
    return out
  }

  it('the kernel file imports nothing above layer 0', () => {
    const specs = importsOf(FILE)
    expect(specs.length).toBeGreaterThan(0)
    for (const s of specs) {
      expect(s.startsWith('.'), `${s} is a package import`).toBe(true)
      const target = normalize(join(dirname(FILE), s)).split('\\').join('/') + '.ts'
      expect(layerOf(target), `${FILE} imports ${s}`).toBe(0)
    }
    expect(layerOf(FILE)).toBe(0)
  })

  it('the kernel file draws no luck and writes nothing', () => {
    const text = read(FILE)
    expect(text).not.toMatch(/from\s+['"][^'"]*\/rng['"]/)
    expect(text).not.toMatch(/\bg\.rng\b|Math\.random/)
  })

  it('cash.ts and world/people.ts call it, and neither keeps a copy of the rule', () => {
    const cash = read('src/game/cash.ts')
    const people = read('src/game/world/people.ts')
    expect(cash).toMatch(/personEntity\(/)
    expect(people).toMatch(/personEntity\(/)
    expect(cash).not.toMatch(/data\?\.sid/)
    expect(people).not.toMatch(/data\?\.sid/)
    // the firms' helper stays in cash.ts; the people index has no other use of its own copy, so it goes with the parseRef import
    expect(cash).toMatch(/named\('firm'/)
    expect(people).not.toMatch(/function named\(/)
    expect(people).not.toMatch(/\bparseRef\b/)
  })

  it('no file of src/game reads data.sid except the kernel file', () => {
    const bad: string[] = []
    const walk = (dir: string): void => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const path = `${dir}/${e.name}`
        if (e.isDirectory()) walk(path)
        else if (/\.tsx?$/.test(e.name) && path !== FILE && /data\??\.sid\b|\.data\[['"]sid['"]\]/.test(stripComments(read(path)))) bad.push(path)
      }
    }
    walk('src/game')
    expect(bad).toEqual([])
  })
})

/** The text without // lines and block comments, so a doc line that names `data.sid` is not a reader. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}
