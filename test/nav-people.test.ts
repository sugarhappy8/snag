// R1-N3: the people adapter and the keyword table. Relationships is a custom sheet in the UI, not a MenuGroup, so
// peopleMenu is the same data dressed as one: a heading per relationship group and a `person.<id>` group per person. The
// search index, the deep links and the cockpit read it; the sheets keep their own markup. KEYWORDS is plain data that adds
// search words to menu rows by id, without touching the menus that build them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetFlags } from '../src/game/flags'
import { KEYWORDS, keywordsOf } from '../src/game/hubs/keywords'
import { PEOPLE_ROOT_ID, peopleMenu, personGroup, personGroupId, personIdOf } from '../src/game/hubs/people'
import { activitiesMenu } from '../src/game/menus'
import { createPerson } from '../src/game/people'
import { personActions, relationshipGroups } from '../src/game/relationships'
import type { GameState, MenuGroup, MenuNode, Person, RelationKind } from '../src/game/types'
import { nodeVisible } from '../src/ui/components/menuModel'
import { personName, personSubtitle } from '../src/ui/components/PersonSheet'
import { frozen, navState, walkTreeCached, type NavStateName } from './nav-kit'

/** The CEO walk (about 12,000 nodes) takes seconds; the default 10 s hook and 15 s test timeouts are too tight on a loaded box. */
const HEAVY = 120_000

beforeEach(() => {
  resetFlags()
})

afterEach(() => {
  resetFlags()
  vi.restoreAllMocks()
})

/** The adult with a dead parent (Late Relatives), a dog that died (Late Pets) and a live dog. */
function crowded(): GameState {
  const g = navState('adult')
  const parent = g.people.find((p) => p.relation === 'parent')
  if (!parent) throw new Error('the canned adult has no parent')
  parent.alive = false
  const old = createPerson(g, { relation: 'pet', age: 14, species: 'Dog', firstName: 'Biscuit' })
  old.alive = false
  createPerson(g, { relation: 'pet', age: 3, species: 'Dog', firstName: 'Rex' })
  return g
}

function personOf(g: GameState, relation: RelationKind): Person {
  const p = g.people.find((x) => x.relation === relation && x.alive)
  if (!p) throw new Error(`the state has no living ${relation}`)
  return p
}

function groupFor(g: GameState, p: Person): MenuGroup {
  const grp = peopleMenu.children(g).find((n): n is MenuGroup => n.type === 'menu' && n.id === personGroupId(p.id))
  if (!grp) throw new Error(`peopleMenu has no group for ${p.id}`)
  return grp
}

function subtitleOf(grp: MenuGroup, g: GameState): string | undefined {
  return typeof grp.subtitle === 'function' ? grp.subtitle(g) : grp.subtitle
}

/** Id and label of a node; an info row has no label. */
function idLabel(n: MenuNode): [string, string | undefined] {
  return [n.id, 'label' in n ? n.label : undefined]
}

describe('peopleMenu', () => {
  it('0. is the relationships root: id, label and emoji', () => {
    expect(PEOPLE_ROOT_ID).toBe('relationships')
    expect(peopleMenu.type).toBe('menu')
    expect(peopleMenu.id).toBe('relationships')
    expect(peopleMenu.label).toBe('Relationships')
    expect(peopleMenu.emoji).toBe('\u{2764}\u{FE0F}')
  })

  it('1. lists a heading per non-empty group and a person group for every person, the dead included', () => {
    const g = crowded()
    const groups = relationshipGroups(g)
    expect(groups.map((x) => x.title)).toContain('Late Relatives')
    expect(groups.map((x) => x.title)).toContain('Late Pets')
    const kids = peopleMenu.children(g)
    const headings = kids.filter((n) => n.type === 'heading')
    expect(headings.map((h) => h.label)).toEqual(groups.map((x) => `${x.title} (${x.people.length})`))
    const total = groups.reduce((sum, x) => sum + x.people.length, 0)
    expect(kids.filter((n) => n.type === 'menu')).toHaveLength(total)
    // Heading first, then that group's people, in the order relationshipGroups gives them.
    const flat = kids.map((n) => n.id).filter((id) => id.startsWith('rel.h.') || id.startsWith('person.'))
    const want = groups.flatMap((x) => [`rel.h.${x.title.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')}`, ...x.people.map((p) => `person.${p.id}`)])
    expect(flat).toEqual(want)
  })

  it('1b. heading ids are rel.h.<slug>: lowercase ASCII, unique, accents and brackets folded', () => {
    const g = crowded()
    const partner = personOf(g, 'partner')
    partner.relation = 'fiance'
    const heads = peopleMenu.children(g).filter((n) => n.type === 'heading')
    const ids = heads.map((h) => h.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id, id).toMatch(/^rel\.h\.[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(ids).toContain('rel.h.parents')
    expect(ids).toContain('rel.h.friends')
    expect(ids).toContain('rel.h.late-relatives')
    expect(ids).toContain('rel.h.late-pets')
    expect(ids).toContain('rel.h.fiance-e')
    expect(heads.find((h) => h.id === 'rel.h.fiance-e')?.label).toBe('Fiancé(e) (1)')
  })

  it('1c. a failure inside relationshipGroups gives an empty list and one console.error, not a throw', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const g = { ...navState('adult'), people: null as unknown as Person[] }
    expect(peopleMenu.children(g)).toEqual([])
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('1d. a person group has the id, the avatar and the Person fields it is built from', () => {
    const g = navState('adult')
    const p = personOf(g, 'partner')
    const grp = personGroup(p)
    expect(grp.type).toBe('menu')
    expect(grp.id).toBe(`person.${p.id}`)
    expect(grp.id).toBe(personGroupId(p.id))
    expect(grp.emoji.length).toBeGreaterThan(0)
  })

  it('2. a person group lists the same ids and labels as personActions, for the first 5 people', () => {
    const g = frozen('adult')
    expect(g.people.length).toBeGreaterThanOrEqual(5)
    for (const p of g.people.slice(0, 5)) {
      const got = personGroup(p).children(g).map(idLabel)
      const want = personActions(g, p).map(idLabel)
      expect(got.length, p.id).toBeGreaterThan(0)
      expect(got, p.id).toEqual(want)
    }
  })

  it('3. subtitle equals personSubtitle and label equals personName: alive, dead, pet, no last name', () => {
    const g = crowded()
    const alive = personOf(g, 'parent')
    const dead = g.people.find((p) => !p.alive && p.relation === 'parent')!
    const pet = g.people.find((p) => p.relation === 'pet' && p.alive)!
    const lonely = createPerson(g, { relation: 'friend', age: 30, firstName: 'Mika', lastName: '' })
    const named = personOf(g, 'partner')
    expect(dead.alive).toBe(false)
    for (const p of [alive, dead, pet, lonely, named]) {
      const grp = groupFor(g, p)
      expect(subtitleOf(grp, g), p.id).toBe(personSubtitle(p))
      expect(grp.label, p.id).toBe(personName(p))
      expect(personGroup(p).label, p.id).toBe(personName(p))
    }
    expect(groupFor(g, pet).label).toBe('Rex')
    expect(groupFor(g, lonely).label).toBe('Mika')
    expect(groupFor(g, named).label).toBe(`${named.firstName} ${named.lastName}`.trim())
    expect(subtitleOf(groupFor(g, dead), g)).toMatch(/ · Deceased \(age \d+\)$/)
    expect(subtitleOf(groupFor(g, pet), g)).toBe('Dog · 3 years old')
    const baby = createPerson(g, { relation: 'pet', age: 1, species: 'Cat', firstName: 'Mimi' })
    expect(subtitleOf(groupFor(g, baby), g)).toBe('Cat · 1 year old')
  })

  it('4. a person removed after the group was built gives the person.gone info and does not throw', () => {
    const g = navState('adult')
    const p = personOf(g, 'friend')
    const grp = groupFor(g, p)
    g.people = g.people.filter((x) => x.id !== p.id)
    let kids: MenuNode[] = []
    expect(() => {
      kids = grp.children(g)
    }).not.toThrow()
    expect(kids).toHaveLength(1)
    expect(kids[0]!.type).toBe('info')
    expect(kids[0]!.id).toBe('person.gone')
    const text = (kids[0] as { text: string | ((g: GameState) => string) }).text
    expect(typeof text === 'function' ? text(g) : text).toBe("They're no longer part of your life.")
    // The badge of a person who is gone is nothing, not a throw.
    expect(grp.badge?.(g) ?? null).toBeNull()
  })

  it('5. badge: Drifting for a parent, partner, spouse, fiance, child or best friend below 25; null otherwise', () => {
    const g = navState('adult')
    const badgeOf = (p: Person): string | number | null => groupFor(g, p).badge?.(g) ?? null
    const parent = personOf(g, 'parent')
    parent.relationship = 10
    expect(badgeOf(parent)).toBe('Drifting')
    parent.relationship = 24
    expect(badgeOf(parent)).toBe('Drifting')
    parent.relationship = 25
    expect(badgeOf(parent)).toBeNull()
    parent.relationship = 60
    expect(badgeOf(parent)).toBeNull()
    const friend = personOf(g, 'friend')
    friend.relationship = 10
    expect(badgeOf(friend)).toBeNull()
    const partner = personOf(g, 'partner')
    for (const rel of ['spouse', 'partner', 'fiance', 'child', 'bestFriend'] as const) {
      partner.relation = rel
      partner.relationship = 10
      expect(badgeOf(partner), rel).toBe('Drifting')
    }
    const dead = createPerson(g, { relation: 'parent', age: 70, firstName: 'Old', lastName: 'Timer' })
    dead.relationship = 10
    dead.alive = false
    expect(badgeOf(dead)).toBeNull()
  })

  it('6. two builds on a frozen state are equal, and the state is not touched', () => {
    const g = frozen('adult')
    const before = JSON.stringify(g)
    const show = (kids: MenuNode[]) =>
      JSON.stringify(
        kids.map((n) => (n.type === 'menu' ? [n.type, n.id, n.label, n.emoji, subtitleOf(n, g) ?? null, n.badge?.(g) ?? null] : [n.type, n.id, 'label' in n ? n.label : null])),
      )
    const a = show(peopleMenu.children(g))
    const b = show(peopleMenu.children(g))
    expect(a.length).toBeGreaterThan(20)
    expect(a).toBe(b)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('7. personIdOf reads a person group id and nothing else', () => {
    expect(personIdOf('person.p12')).toBe('p12')
    expect(personIdOf('x')).toBeNull()
    expect(personIdOf('person.')).toBeNull()
    expect(personIdOf('person')).toBeNull()
    expect(personIdOf('rel.h.parents')).toBeNull()
    expect(personIdOf('xperson.p12')).toBeNull()
    expect(personGroupId('p12')).toBe('person.p12')
    expect(personIdOf(personGroupId('p7'))).toBe('p7')
  })

  it('12. the nav-kit walk of the relationships tab is peopleMenu: the same person groups', () => {
    const g = frozen('adult')
    const walked = walkTreeCached('adult')
    const top = walked.filter((w) => w.tab === 'relationships' && w.ids.length === 1 && w.type === 'menu').map((w) => w.ids[0])
    const want = peopleMenu
      .children(g)
      .filter((n) => n.type === 'menu')
      .map((n) => n.id)
    expect(top).toEqual(want)
    expect(top.length).toBeGreaterThan(0)
  }, HEAVY)
})

describe('KEYWORDS', () => {
  /**
   * Ids that can be missing from all four canned states: they sit behind a talent, an era, a company or a condition.
   * `surrender` is not in the plan's list but belongs here: it is the Turn Yourself In row (the Surrender row that gives
   * up the life is `surrenderLife`), and it shows only while the player is wanted. Test 8b shows it does.
   */
  const CONDITIONAL = ['military', 'royal.court', 'corruption', 'workshop', 'inv-penny', 'inv-crypto', 'thisYear', 'surrender']
  const NAMES: NavStateName[] = ['kid', 'adult', 'ceo', 'elder']

  it('8. every key is a node id somewhere in the four canned states (catches typos), bar the conditional ones', () => {
    const present = new Set<string>()
    for (const name of NAMES) for (const w of walkTreeCached(name)) present.add(w.ids[w.ids.length - 1])
    for (const id of CONDITIONAL) expect(id in KEYWORDS, `${id} is conditional but not a key`).toBe(true)
    const missing = Object.keys(KEYWORDS).filter((id) => !present.has(id) && !CONDITIONAL.includes(id))
    expect(missing, 'keyword keys that are no node id in any canned state').toEqual([])
  }, HEAVY)

  it('8b. the conditional surrender key is a real row: Turn Yourself In shows for a wanted adult and not for a clean one', () => {
    const wanted = navState('adult')
    wanted.character.wantedLevel = 2
    const row = (g: GameState) => activitiesMenu.children(g).find((n) => n.id === 'surrender')
    const shown = row(wanted)
    expect(shown, 'the surrender row exists in Activities').toBeDefined()
    expect(nodeVisible(shown!, wanted)).toBe(true)
    const clean = navState('adult')
    expect(nodeVisible(row(clean)!, clean)).toBe(false)
  })

  it('9. every word is lowercase ASCII, at most 24 characters, free of dashes, and unique inside its row', () => {
    const keys = Object.keys(KEYWORDS)
    expect(keys.length).toBeGreaterThanOrEqual(60)
    for (const id of keys) {
      const words = KEYWORDS[id]!
      expect(words.length, id).toBeGreaterThan(0)
      expect(new Set(words).size, `${id}: duplicate word`).toBe(words.length)
      for (const w of words) {
        expect(w, `${id}: ${w}`).toMatch(/^[a-z0-9]+(?: [a-z0-9]+)*$/)
        expect(w.length, `${id}: ${w}`).toBeLessThanOrEqual(24)
        expect(/[\u2013\u2014]/.test(w), `${id}: ${w} has a dash`).toBe(false)
      }
    }
  })

  it('9b. the table is frozen, so a consumer cannot change what search finds', () => {
    expect(Object.isFrozen(KEYWORDS)).toBe(true)
    expect(Object.isFrozen(KEYWORDS.doctor)).toBe(true)
  })

  it('10. keywordsOf puts the node words first, then the table words, lowercase and de-duplicated', () => {
    const got = keywordsOf({ id: 'doctor', keywords: ['Clinic'] })
    expect(got[0]).toBe('clinic')
    expect(got).toEqual(['clinic', ...KEYWORDS.doctor!])
    const dupes = keywordsOf({ id: 'doctor', keywords: ['HOSPITAL', 'Clinic', 'clinic', ' Sick '] })
    expect(dupes.slice(0, 3)).toEqual(['hospital', 'clinic', 'sick'])
    expect(dupes).toEqual([...new Set(dupes)])
    expect(dupes).toEqual(expect.arrayContaining([...KEYWORDS.doctor!]))
  })

  it('10b. keywordsOf: no words gives the table row, an unknown id gives nothing, and a readonly list is fine', () => {
    expect(keywordsOf({ id: 'doctor' })).toEqual([...KEYWORDS.doctor!])
    expect(keywordsOf({ id: 'no-such-row-anywhere' })).toEqual([])
    expect(keywordsOf({ id: 'no-such-row-anywhere', keywords: ['A', 'b'] as const })).toEqual(['a', 'b'])
  })

  it('10c. keywordsOf never reads the object prototype, and hands back a copy of the row', () => {
    for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) expect(keywordsOf({ id }), id).toEqual([])
    const first = keywordsOf({ id: 'doctor' })
    first.push('tampered')
    expect(keywordsOf({ id: 'doctor' })).toEqual([...KEYWORDS.doctor!])
    expect(KEYWORDS.doctor).not.toContain('tampered')
  })

  it('10d. keywordsOf skips junk entries instead of throwing', () => {
    const junk = ['ok', '', '   ', 42, null, undefined] as unknown as string[]
    expect(keywordsOf({ id: 'no-such-row-anywhere', keywords: junk })).toEqual(['ok'])
  })

  it('10e. the seed rows named by the plan are present', () => {
    expect(KEYWORDS['inv-stocks']).toContain('buy a stock')
    expect(KEYWORDS.banking).toContain('mortgage')
    expect(KEYWORDS.realEstate).toContain('buy a house')
    expect(KEYWORDS.love).toContain('divorce')
    expect(KEYWORDS['biz.start']).toContain('open a shop')
    expect(KEYWORDS.emigrate).toContain('move abroad')
    expect(KEYWORDS['shared.projects']).toContain('mentor')
    expect(KEYWORDS.economy).toContain('interest rates')
  })
})
