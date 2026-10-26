// ci: fast
// R4-U5 (People UI and fog track, H.7): the action rows of a person go through the same gate as the profile, and Look closer.
//
//   the rows      npcLifeNodes (professional skill, ambition, net worth), the Money Matters line (entitlement) and the will status
//                 line (anger) stop printing the true number once the profile exists (flag `peopleProfile` and Realistic):
//                 they print words or a range, and the info row carries the chip its weakest read earns
//   Look closer   one `look.person` group at the end of a living person's rows, only behind peopleFog(): the private investigator
//                 and no other source, one fee for any cash, the person's own country, once a year, never for the dead or a pet
//   Exact         the rows equal the U1 oracle (test/fixtures/people-ui-exact.json) byte for byte, with the flag on and in
//                 Realistic with the flag off, which also gets no Look closer
//   layers        events/wealth-menu.ts takes the reader as an argument, events/will-amends.ts gates locally: neither imports
//                 people-fog.ts (rule (n) of the plan), and the local gate equals peopleFog() for the four flag and mode pairs
//
// The suite runs in Exact (test/setup-exact.ts). A Realistic case goes through inFog and names the flag with withFlags.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { withFlags } from '../src/game/flags'
import { wealthNodes } from '../src/game/events/wealth-menu'
import { willPersonNodes } from '../src/game/events/will-amends'
import { money } from '../src/game/business/util'
import { checkLedger } from '../src/game/kernel/ledger'
import { storedEstimates } from '../src/game/knowledge/contract'
import { withInfoMode } from '../src/game/knowledge/mode'
import { npcLife, saveNpcLife } from '../src/game/npc-state'
import { npcLifeNodes, npcWorth } from '../src/game/npc-lives'
import { lookKeysOf, peopleFog, readPerson } from '../src/game/people-fog'
import { personActions } from '../src/game/relationships'
import type { GameState, MenuAction, MenuGroup, MenuInfo, MenuNode, Person } from '../src/game/types'
import { groupChildren, nodeDisabled, nodeSubtitle } from '../src/ui/components/menuModel'
import { buildIndex } from '../src/ui/nav/searchIndex'
import { deepFreeze, inFog } from './knowledge-kit'
import { flowTotal } from './ledger-kit'
import {
  FIXTURE_FILE,
  KIT_KEYS,
  LEVELS,
  LIVING_KEYS,
  angryAboutWill,
  buildGroup,
  buildKit,
  diffRows,
  groupOf,
  linesOf,
  type KitKey,
  type Recorded,
} from './people-ui-kit'

const ON = { peopleProfile: true } as const
const OFF = { peopleProfile: false } as const
/** Realistic with the flag on: the only state in which the profile and its rows exist. */
const profile = <T>(fn: () => T): T => withFlags(ON, () => inFog(fn))
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)
const TIMEOUT = 120_000

function kitOf(level = 50, key: KitKey = 'npcLife'): { g: GameState; p: Person } {
  const kit = buildKit(level)
  return { g: kit.g, p: kit.g.people.find((x) => x.id === kit.ids[key])! }
}

const textOf = (n: MenuNode, g: GameState): string => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : '')

/** The first node with this id, groups opened (three levels deep). */
function find(g: GameState, nodes: readonly MenuNode[], id: string, depth = 0): MenuNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'menu' && depth < 3) {
      const hit = find(g, groupChildren(n, g), id, depth + 1)
      if (hit) return hit
    }
  }
  return null
}

const infoOf = (g: GameState, nodes: readonly MenuNode[], id: string): MenuInfo => {
  const n = find(g, nodes, id)
  if (!n || n.type !== 'info') throw new Error(`no info row ${id}`)
  return n
}

const lookOf = (g: GameState, p: Person): MenuGroup | null => {
  const n = personActions(g, p).find((x) => x.id === 'look.person')
  return n && n.type === 'menu' ? n : null
}

const logCount = (g: GameState): number => g.log.reduce((n, y) => n + y.entries.length, 0)

function recorded(): Recorded {
  if (!existsSync(join(ROOT, FIXTURE_FILE))) expect.fail(`${FIXTURE_FILE} is missing`)
  return JSON.parse(readFileSync(join(ROOT, FIXTURE_FILE), 'utf8')) as Recorded
}

// ---------------------------------------------------------------------------------------------------------------------------------
// 1. The three rows

describe('the NPC life rows (skill, ambition, net worth)', () => {
  it('print words or a range for the three numbers, and never the true figure as N/100', () => {
    const { g, p } = kitOf(50)
    const l = npcLife(p)!
    const nodes = profile(() => npcLifeNodes(g, p))
    const text = textOf(infoOf(g, nodes, `npc.life.${p.id}`), g)
    const skill = profile(() => readPerson(g, p, 'skill', l.skill))!
    const worth = profile(() => readPerson(g, p, 'worth', npcWorth(p, g.year, g)))!
    const ambition = profile(() => readPerson(g, p, 'ambition', l.ambition))!
    expect(skill.exact || worth.exact || ambition.exact).toBe(false)
    expect(text).toContain(`professional skill ${skill.words}`)
    expect(text).toContain(`net worth incl. property & companies ${worth.words}`)
    expect(text).toContain(`Ambition ${ambition.words}.`)
    expect(text).not.toMatch(/\d\/100/)
    expect(text).not.toContain(`about ${money(npcWorth(p, g.year, g))}`)
    expect(text).toContain('Experience 9 years')
  })

  it('carry the chip of the weakest read, and the year of a read that is two years old or more', () => {
    const { g, p } = kitOf(50)
    const l = npcLife(p)!
    const reads = (x: GameState) => [
      readPerson(x, p, 'skill', l.skill)!,
      readPerson(x, p, 'worth', npcWorth(p, x.year, x))!,
      readPerson(x, p, 'ambition', l.ambition)!,
    ]
    const row = profile(() => infoOf(g, npcLifeNodes(g, p), `npc.life.${p.id}`))
    expect(row.conf).toBe(Math.min(...profile(() => reads(g)).map((e) => e.conf)))
    expect(row.asOf).toBeUndefined()
    // the skill was bought in 2026 and is read again three years on: the row carries the year
    const bought = profile(() => (groupChildren(lookOf(g, p)!, g)[0] as MenuAction).run(g))
    expect(bought).toBeUndefined()
    const born = g.year
    g.year = born + 3
    const old = profile(() => reads(g)[0]!)
    expect(old.src).toBe('investigator')
    expect(old.asOf).toBe(born)
    const later = profile(() => infoOf(g, npcLifeNodes(g, p), `npc.life.${p.id}`))
    expect(later.asOf).toBe(born)
    expect(later.conf).toBe(Math.min(...profile(() => reads(g)).map((e) => e.conf)))
  })

  it('the Main Character row prints the ambition as words, and its sentence follows the estimate and not the truth', () => {
    const { g, p } = kitOf(50)
    const l = npcLife(p)!
    const est = profile(() => readPerson(g, p, 'ambition', l.ambition))!
    const row = profile(() => infoOf(g, npcLifeNodes(g, p), `npc.talent.${p.id}`))
    const text = textOf(row, g)
    expect(text).toContain(`Ambition ${est.words}:`)
    expect(text).not.toMatch(/\d\/100/)
    const phrase = est.mid >= 80 ? 'may build a competing family business' : est.mid >= 65 ? 'wants an independent business' : 'prefers a career or a quieter life'
    expect(text).toContain(phrase)
    expect(row.conf).toBe(est.conf)
  })

  it('over 300 lives never print the true skill, ambition or worth in the old form', () => {
    const { g, p } = kitOf(90)
    const l = npcLife(p)!
    const truth = [`professional skill ${Math.round(l.skill)}/100`, `Ambition ${Math.round(l.ambition)}/100`, `about ${money(npcWorth(p, g.year, g))}`]
    for (let i = 0; i < 300; i++) {
      const gi: GameState = { ...g, lifeId: `rows-life-${i}`, year: g.year + (i % 7) }
      const nodes = profile(() => npcLifeNodes(gi, p))
      for (const id of [`npc.life.${p.id}`, `npc.talent.${p.id}`]) {
        const t = textOf(infoOf(gi, nodes, id), gi)
        for (const old of truth) expect(t, `${i} ${id}`).not.toContain(old)
        expect(t, `${i} ${id}`).not.toMatch(/\d\/100/)
        expect(t, `${i} ${id}`).not.toContain('NaN')
      }
    }
  })

  it('a stranger keeps today\'s line, and nobody gets a chip they did not earn', () => {
    const { g, p } = kitOf(20, 'npcLife')
    p.livesWithPlayer = false
    const row = profile(() => infoOf(g, npcLifeNodes(g, p), `npc.life.${p.id}`))
    expect(textOf(row, g)).toContain('Private finances are not known to you.')
    expect(row.conf).toBeUndefined()
    const talent = profile(() => infoOf(g, npcLifeNodes(g, p), `npc.talent.${p.id}`))
    expect(talent.conf).toBeUndefined()
    expect(textOf(talent, g)).not.toContain('Ambition')
  })

  it('is total: a person with no usable key reads as not clear yet, and money that is not a number never throws', () => {
    const { g, p } = kitOf(50)
    p.id = 'p 13' // a space: the contract refuses the key, so nothing can be read
    const row = profile(() => infoOf(g, npcLifeNodes(g, p), `npc.life.${p.id}`))
    const text = textOf(row, g)
    expect(text).toContain('professional skill not clear yet')
    expect(text).toContain('net worth incl. property & companies not clear yet')
    expect(text).toContain('Ambition not clear yet.')
    expect(text).not.toMatch(/\d\/100/)
    expect(row.conf).toBe(0)
    const q = kitOf(50)
    q.p.money = Number.NaN
    expect(() => profile(() => npcLifeNodes(q.g, q.p))).not.toThrow()
    expect(textOf(profile(() => infoOf(q.g, npcLifeNodes(q.g, q.p), `npc.life.${q.p.id}`)), q.g)).toContain('not clear yet')
  })

  it('prints no em dash or en dash in either mode, and the source holds none', () => {
    const { g, p } = kitOf(50)
    for (const mode of ['exact', 'realistic'] as const) {
      const nodes = withFlags(ON, () => withInfoMode(mode, () => npcLifeNodes(g, p)))
      for (const n of nodes) expect(textOf(n, g), `${mode} ${n.id}`).not.toMatch(LONG_DASH)
    }
    const bare = kitOf(50, 'npcLife')
    bare.p.data.life = null
    const none = npcLifeNodes(bare.g, bare.p)
    expect(none.map((n) => textOf(n, bare.g)).join('')).not.toMatch(LONG_DASH)
    const src = readFileSync(join(ROOT, 'src/game/npc-lives.ts'), 'utf8')
    expect(LONG_DASH.test(src)).toBe(false)
  })

  it('Exact and a flag-off life print today\'s text, digits included (hyphens for the three dashes)', () => {
    const { g, p } = kitOf(50)
    const exact = withFlags(ON, () => npcLifeNodes(g, p))
    const off = withFlags(OFF, () => inFog(() => npcLifeNodes(g, p)))
    expect(textOf(infoOf(g, exact, `npc.life.${p.id}`), g)).toContain('professional skill 72/100')
    expect(textOf(infoOf(g, exact, `npc.life.${p.id}`), g)).toContain('Ambition 83/100.')
    expect(textOf(infoOf(g, exact, `npc.life.${p.id}`), g)).toMatch(/^Life & Career - Engineer at Apex Labs\./)
    expect(textOf(infoOf(g, exact, `npc.talent.${p.id}`), g)).toMatch(/^Main Character Syndrome - every talent;/)
    expect(JSON.stringify(off)).toBe(JSON.stringify(exact))
    expect(infoOf(g, exact, `npc.life.${p.id}`).conf).toBeUndefined()
    expect(infoOf(g, off, `npc.life.${p.id}`).conf).toBeUndefined()
  })

  it('a child with Main Character and no life keeps one hyphenated line in every mode', () => {
    const { g, p } = kitOf(50, 'child')
    p.data.talents = ['MainCharacter']
    for (const run of [() => npcLifeNodes(g, p), () => profile(() => npcLifeNodes(g, p)), () => withFlags(OFF, () => inFog(() => npcLifeNodes(g, p)))]) {
      const nodes = run()
      expect(nodes).toHaveLength(1)
      expect(textOf(nodes[0]!, g)).toBe('Main Character Syndrome - inherited from family. Every talent; masters skills through first use as they grow up.')
    }
  })
})

describe('the Money Matters line (entitlement)', () => {
  it('prints a word or a range through the reader and keeps N% without one', () => {
    const { g, p } = kitOf(50, 'child')
    expect(p.data.entitlement).toBe(62)
    const plainNodes = wealthNodes(g, p)
    expect(textOf(infoOf(g, plainNodes, 'wealth.info'), g)).toContain('Entitlement 62%')
    const calls: Array<[string, number]> = []
    const said = wealthNodes(g, p, (_x, who, field, truth) => {
      calls.push([field, truth])
      expect(who.id).toBe(p.id)
      return 'a lot'
    })
    const text = textOf(infoOf(g, said, 'wealth.info'), g)
    expect(text).toContain('Entitlement a lot')
    expect(text).not.toContain('62%')
    expect(calls).toEqual([['entitlement', 62]])
  })

  it('goes through readPerson from personActions when the profile exists', () => {
    const { g, p } = kitOf(50, 'child')
    const est = profile(() => readPerson(g, p, 'entitlement', 62))!
    // the line is read when it is drawn, in the mode of the screen: Realistic with the flag on
    const text = profile(() => textOf(infoOf(g, personActions(g, p), 'wealth.info'), g))
    expect(est.exact).toBe(false)
    expect(text).toContain(`Entitlement ${est.words}`)
    expect(text).not.toContain('62%')
    expect(text).toContain('Upbringing:')
  })

  it('is total: a key the contract refuses reads as not clear yet and never as the truth', () => {
    const { g, p } = kitOf(50, 'child')
    p.id = 'p 3'
    const text = profile(() => textOf(infoOf(g, personActions(g, p), 'wealth.info'), g))
    expect(text).toContain('Entitlement not clear yet')
    expect(text).not.toContain('62')
  })

  it('a flag-off Realistic life and Exact print N% as today', () => {
    const { g, p } = kitOf(50, 'child')
    expect(textOf(withFlags(OFF, () => inFog(() => infoOf(g, personActions(g, p), 'wealth.info'))), g)).toContain('Entitlement 62%')
    expect(textOf(withFlags(ON, () => infoOf(g, personActions(g, p), 'wealth.info')), g)).toContain('Entitlement 62%')
  })
})

describe('the will status line (anger)', () => {
  function angry(): { g: GameState; p: Person } {
    const { g, p } = kitOf(90, 'parent')
    angryAboutWill(g, p)
    return { g, p }
  }

  it('leaves the (N/100) out once the profile exists, and keeps the anger word', () => {
    const { g, p } = angry()
    const text = textOf(profile(() => infoOf(g, willPersonNodes(g, p), 'will.status')), g)
    expect(text).not.toMatch(/\d+\/100/)
    expect(text).toContain('knew by')
    const exact = textOf(infoOf(g, willPersonNodes(g, p), 'will.status'), g)
    expect(exact).toContain('(42/100)')
    expect(exact.replace(' (42/100)', '')).toBe(text)
  })

  it('the local gate equals peopleFog() for the four pairs of flag and mode', () => {
    const { g, p } = angry()
    for (const flag of [true, false]) {
      for (const mode of ['exact', 'realistic'] as const) {
        withFlags({ peopleProfile: flag }, () =>
          withInfoMode(mode, () => {
            const shown = /\(42\/100\)/.test(textOf(infoOf(g, willPersonNodes(g, p), 'will.status'), g))
            expect(shown, `flag ${flag} mode ${mode}`).toBe(!peopleFog())
            expect(peopleFog(), `flag ${flag} mode ${mode}`).toBe(flag && mode === 'realistic')
          }),
        )
      }
    }
  })

  it('a flag-off Realistic life prints (N/100) as today', () => {
    const { g, p } = angry()
    expect(textOf(withFlags(OFF, () => inFog(() => infoOf(g, willPersonNodes(g, p), 'will.status'))), g)).toContain('(42/100)')
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// 2. Look closer

describe('Look closer on a person', () => {
  it('is one group at the end of a living person\'s rows, with the investigator and no other source', () => {
    for (const key of LIVING_KEYS) {
      const { g, p } = kitOf(50, key)
      const nodes = profile(() => personActions(g, p))
      const last = nodes[nodes.length - 1]!
      expect(last.id, key).toBe('look.person')
      expect(last.type).toBe('menu')
      const group = last as MenuGroup
      expect(group.label).toBe('Look closer')
      expect(profile(() => groupChildren(group, g)).map((c) => c.id), key).toEqual(['look.person.investigator'])
      expect(nodes.filter((n) => n.id === 'look.person'), key).toHaveLength(1)
    }
  })

  it('keeps its place after the will rows', () => {
    const { g, p } = kitOf(90, 'parent')
    angryAboutWill(g, p)
    const ids = profile(() => personActions(g, p)).map((n) => n.id)
    expect(ids.indexOf('will.head')).toBeGreaterThan(-1)
    expect(ids.indexOf('look.person')).toBeGreaterThan(ids.indexOf('will.status'))
    expect(ids[ids.length - 1]).toBe('look.person')
  })

  it('asks about four numbers for a person with no NPC life and five for one with a life', () => {
    const plain = kitOf(50, 'friend')
    const withLife = kitOf(50, 'npcLife')
    expect(profile(() => lookKeysOf(plain.g, plain.p))).toHaveLength(4)
    expect(profile(() => lookKeysOf(withLife.g, withLife.p))).toHaveLength(5)
    for (const [kit, n] of [[plain, 4], [withLife, 5]] as const) {
      const child = profile(() => groupChildren(lookOf(kit.g, kit.p)!, kit.g))[0] as MenuAction
      profile(() => child.run(kit.g))
      expect(storedEstimates(kit.g), `${kit.p.relation}`).toHaveLength(n)
    }
  })

  it('charges one fee for any cash and follows the country of the person', () => {
    const feeOf = (g: GameState, p: Person): string => profile(() => nodeSubtitle(groupChildren(lookOf(g, p)!, g)[0] as MenuAction, g)) ?? ''
    const a = kitOf(50, 'friend')
    const b = kitOf(50, 'friend')
    b.g.character.money = a.g.character.money * 100
    expect(feeOf(a.g, a.p)).toBe(feeOf(b.g, b.p))
    expect(feeOf(a.g, a.p)).toMatch(/^\$[\d.,]+[KM]? · /)
    const abroad = kitOf(50, 'friend')
    abroad.p.data.countryId = 'ht'
    expect(feeOf(abroad.g, abroad.p)).not.toBe(feeOf(a.g, a.p))
  })

  it('books the fee once through the ledger, writes one investigator line, and refuses a second buy in the year', () => {
    const { g, p } = kitOf(50, 'friend')
    const child = profile(() => groupChildren(lookOf(g, p)!, g)[0] as MenuAction)
    const before = g.character.money
    const lines = logCount(g)
    expect(profile(() => nodeDisabled(child, g))).toBeNull()
    profile(() => child.run(g))
    const fee = before - g.character.money
    expect(fee).toBeGreaterThan(0)
    expect(flowTotal(g, 'intel', 'person')).toBe(-fee)
    expect(checkLedger(g).ok).toBe(true)
    expect(logCount(g)).toBe(lines + 1)
    const said = g.log[g.log.length - 1]!.entries.at(-1)!.text
    expect(said).toMatch(/investigator/i)
    // the same action, run again, books nothing and writes nothing
    profile(() => child.run(g))
    expect(before - g.character.money).toBe(fee)
    expect(logCount(g)).toBe(lines + 1)
    // the menu the player sees next has nothing left to buy for these numbers
    expect(profile(() => lookOf(g, p))).toBeNull()
  })

  it('the bought read is sharper than the passive one, and the rows show it', () => {
    const { g, p } = kitOf(50, 'friend')
    const passive = profile(() => readPerson(g, p, 'smarts', p.stats.smarts))!
    const child = profile(() => groupChildren(lookOf(g, p)!, g)[0] as MenuAction)
    profile(() => child.run(g))
    const bought = profile(() => readPerson(g, p, 'smarts', p.stats.smarts))!
    expect(bought.src).toBe('investigator')
    expect(bought.sd).toBeLessThan(passive.sd)
  })

  it('is no group for the dead or for a pet', () => {
    for (const key of ['deadParent', 'pet'] as const) {
      const { g, p } = kitOf(50, key)
      const ids = profile(() => personActions(g, p)).map((n) => n.id)
      expect(ids, key).not.toContain('look.person')
    }
  })

  it('is no group in Exact, and none in Realistic with peopleProfile off, for any of the fourteen', () => {
    for (const level of LEVELS) {
      const kit = buildKit(level)
      for (const key of KIT_KEYS) {
        const p = kit.g.people.find((x) => x.id === kit.ids[key])!
        expect(find(kit.g, withFlags(ON, () => personActions(kit.g, p)), 'look.person'), `exact ${key} ${level}`).toBeNull()
        expect(find(kit.g, withFlags(OFF, () => inFog(() => personActions(kit.g, p))), 'look.person'), `off ${key} ${level}`).toBeNull()
        expect(withFlags(OFF, () => inFog(() => lookKeysOf(kit.g, p))), `keys ${key} ${level}`).toEqual([])
      }
    }
  })

  it('shows for the stranger and the estranged too: the investigator needs nobody\'s leave', () => {
    const stranger = kitOf(5, 'coworker')
    expect(profile(() => lookOf(stranger.g, stranger.p))).not.toBeNull()
    const cut = kitOf(20, 'child')
    cut.p.data.wl = { by: cut.g.character.id, cut: true, cutY: 2021, known: true, how: 'external', knownY: 2022, anger: 70, estr: true, estrY: 2023 }
    const ids = profile(() => personActions(cut.g, cut.p)).map((n) => n.id)
    expect(ids).toContain('look.person')
    expect(ids).not.toContain('wealth')
  })

  it('the Palette index lists each person\'s group without a throw', () => {
    const { g } = kitOf(50)
    const index = profile(() => buildIndex(g))
    const hits = index.entries.filter((e) => e.id === 'look.person')
    expect(hits).toHaveLength(LIVING_KEYS.length)
    expect(new Set(hits.map((h) => h.entity?.id)).size).toBe(LIVING_KEYS.length)
    for (const h of hits) {
      expect(h.type).toBe('menu')
      expect(h.label).toBe('Look closer')
      expect(h.entity?.kind).toBe('person')
    }
    // nothing of it in Exact, and nothing with the flag off
    expect(buildIndex(g).entries.some((e) => e.id === 'look.person')).toBe(false)
    expect(withFlags(OFF, () => inFog(() => buildIndex(g))).entries.some((e) => e.id === 'look.person')).toBe(false)
  }, TIMEOUT)

  it('is pure: built twice on a frozen copy it gives the same rows, and nothing moves (rng, id counter, JSON)', () => {
    const kit = buildKit(50)
    const frozen = deepFreeze(structuredClone(kit.g))
    const json = JSON.stringify(frozen)
    const rng = frozen.rng
    const next = frozen.nextId
    for (const key of KIT_KEYS) {
      const p = frozen.people.find((x) => x.id === kit.ids[key])!
      const a = profile(() => linesOf(frozen, personActions(frozen, p)).join('\n'))
      const b = profile(() => linesOf(frozen, personActions(frozen, p)).join('\n'))
      expect(a, key).toBe(b)
    }
    expect(JSON.stringify(frozen)).toBe(json)
    expect(frozen.rng).toBe(rng)
    expect(frozen.nextId).toBe(next)
  })

  it('is total: a hostile person (500 notes, NaN money, a 60 character id) builds rows and never throws', () => {
    const { g, p } = kitOf(50, 'friend')
    p.notes = Array.from({ length: 500 }, (_, i) => `note ${i}`)
    p.money = Number.NaN
    p.id = 'x'.repeat(60)
    p.yearsKnown = Number.NaN
    p.relationship = Number.NaN
    expect(() => profile(() => linesOf(g, personActions(g, p)))).not.toThrow()
    const ids = profile(() => personActions(g, p)).map((n) => n.id)
    // a key the contract refuses leaves nothing to buy
    expect(ids).not.toContain('look.person')
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// 3. Exact is today

describe('Exact is today', () => {
  type Rows = Array<[string, string]>
  const memo = new Map<string, Rows>()
  const variants = {
    'exact-on': <T,>(fn: () => T): T => withFlags(ON, fn),
    'real-off': <T,>(fn: () => T): T => withFlags(OFF, () => inFog(fn)),
    'real-on': <T,>(fn: () => T): T => withFlags(ON, () => inFog(fn)),
  } as const
  function today(label: keyof typeof variants): Rows {
    let rows = memo.get(label)
    if (!rows) {
      rows = variants[label](() => buildGroup('actions')).map((r) => [r[0], r[1]] as [string, string])
      memo.set(label, rows)
    }
    return rows
  }
  const file = (): Rows => recorded().rows.filter(([k]) => groupOf(k) === 'actions').map((r) => [r[0], r[1]] as [string, string])

  /** A row without the lines this task changes: the three info rows it fogs and the Look closer group with what is under it. */
  const FOGGED = /^\s*info (npc\.life\.|npc\.talent\.|wealth\.info|will\.status)/
  function rest(text: string): string[] {
    const out: string[] = []
    let skipping = false
    for (const line of text.split('\n')) {
      if (/^menu look\.person:/.test(line)) {
        skipping = true
        continue
      }
      if (skipping && line.startsWith(' ')) continue
      skipping = false
      if (FOGGED.test(line)) continue
      out.push(line)
    }
    return out
  }

  it('the action rows equal the U1 oracle in Exact with the flag on', { timeout: TIMEOUT }, () => {
    const moved = diffRows(file(), today('exact-on'))
    expect(moved, moved.slice(0, 6).join('\n')).toEqual([])
  })

  it('the action rows equal the U1 oracle in Realistic with the flag off, and there is no Look closer', { timeout: TIMEOUT }, () => {
    const rows = today('real-off')
    const moved = diffRows(file(), rows)
    expect(moved, moved.slice(0, 6).join('\n')).toEqual([])
    expect(rows.some(([, t]) => t.includes('look.person'))).toBe(false)
  })

  it('with the profile on, a row moves only in the fogged lines and the Look closer group', { timeout: TIMEOUT }, () => {
    const rows = today('real-on')
    const want = new Map(file())
    expect(rows.map(([k]) => k)).toEqual(file().map(([k]) => k))
    for (const [k, text] of rows) {
      expect(rest(text), k).toEqual(rest(want.get(k)!))
      const living = LIVING_KEYS.some((key) => k.startsWith(`actions/${key}/`))
      expect(text.includes('menu look.person: Look closer'), k).toBe(living)
    }
    // the dead and the pet read exactly as the oracle says
    for (const level of LEVELS) for (const key of ['deadParent', 'pet']) expect(rows.find(([k]) => k === `actions/${key}/${level}`)![1]).toBe(want.get(`actions/${key}/${level}`))
    // and the rows that printed a number now print something else
    for (const k of ['actions/npcLife/50', 'actions/child/50', 'actions/parent/90']) expect(rows.find(([x]) => x === k)![1], k).not.toBe(want.get(k))
  })

  it('holds no em dash or en dash in a row it builds in any of the three states', { timeout: TIMEOUT }, () => {
    for (const label of Object.keys(variants) as Array<keyof typeof variants>) {
      for (const [k, t] of today(label)) expect(t, `${label} ${k}`).not.toMatch(LONG_DASH)
    }
  })
})

describe('the layers (rule (n) of the plan)', () => {
  const src = (file: string): string => readFileSync(join(ROOT, file), 'utf8')

  it('events/wealth-menu.ts takes the reader as an argument and events/will-amends.ts gates locally: neither imports people-fog', () => {
    for (const file of ['src/game/events/wealth-menu.ts', 'src/game/events/will-amends.ts']) {
      expect(src(file), file).not.toMatch(/from '[^']*people-fog'/)
    }
    expect(src('src/game/events/will-amends.ts')).toMatch(/from '\.\.\/flags'/)
    expect(src('src/game/events/will-amends.ts')).toMatch(/from '\.\.\/knowledge\/contract'/)
  })

  it('npc-lives.ts reads people-fog and people-fog.ts never reads npc-lives.ts (a two-module cycle fails the architecture test)', () => {
    expect(src('src/game/npc-lives.ts')).toMatch(/from '\.\/people-fog'/)
    expect(src('src/game/people-fog.ts')).not.toMatch(/from '\.\/npc-lives'/)
  })
})

describe('a person with a life can be saved and read twice', () => {
  it('saveNpcLife of the same life leaves the rows unchanged', () => {
    const { g, p } = kitOf(50)
    const a = profile(() => linesOf(g, personActions(g, p)).join('\n'))
    saveNpcLife(p, npcLife(p)!)
    const b = profile(() => linesOf(g, personActions(g, p)).join('\n'))
    expect(b).toBe(a)
  })
})
