// R1-N1: the menu-tree test kit (test/nav-kit.ts) on its own. The canned states are deterministic, the walker lists
// what the UI would show (visible nodes, locked groups listed but not entered, errors caught like the UI catches
// them), `hub.` groups cost no depth and never show up in a canonical path, and the lint finds what it should.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetFlags, setFlags, withFlags } from '../src/game/flags'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'
import {
  actionSequence,
  actionSequenceCached,
  buildNavState,
  canonical,
  frozen,
  isTruncated,
  lintViolations,
  NAV_OFF,
  navState,
  normId,
  SECTIONED_ROOTS,
  walkTree,
  walkTreeCached,
  type NavStateName,
  type NavTab,
  type WalkOpts,
} from './nav-kit'

const NAMES: NavStateName[] = ['kid', 'adult', 'ceo', 'elder']
const TABS: NavTab[] = ['occupation', 'assets', 'relationships', 'activities']

function act(id: string, over: Partial<MenuAction> = {}): MenuAction {
  return { type: 'action', id, label: id, emoji: 'x', run: () => {}, ...over }
}

function grp(id: string, children: MenuNode[] | (() => MenuNode[]), over: Partial<MenuGroup> = {}): MenuGroup {
  return { type: 'menu', id, label: id, emoji: 'x', children: typeof children === 'function' ? children : () => children, ...over }
}

function head(id: string): MenuNode {
  return { type: 'heading', id, label: id }
}

/** Roots for a synthetic walk: `group` on `tab`, an empty list on the other three tabs. */
function only(tab: NavTab, group: MenuGroup): NonNullable<WalkOpts['roots']> {
  const roots: Record<string, MenuGroup> = {}
  for (const t of TABS) roots[t] = t === tab ? group : grp(t, [])
  return roots
}

function idsOf(g: GameState, tab: NavTab, group: MenuGroup, opts: WalkOpts = {}): string[] {
  return walkTree(g, { ...opts, roots: only(tab, group) }).map((w) => w.ids.join('/'))
}

afterEach(() => {
  vi.restoreAllMocks()
  resetFlags()
})

/** A building or walking test of a CEO state costs seconds; the default 15 s is too tight on a loaded CI box. */
const HEAVY = 120_000

describe('canned states', () => {
  it('1. building a state twice gives equal JSON, and navState hands out fresh clones', () => {
    for (const name of NAMES) {
      const a = JSON.stringify(buildNavState(name))
      const b = JSON.stringify(buildNavState(name))
      expect(b, name).toBe(a)
      expect(JSON.stringify(navState(name)), name).toBe(a)
      const one = navState(name)
      const two = navState(name)
      expect(one, name).not.toBe(two)
      one.character.money += 1
      expect(JSON.stringify(navState(name)), `${name} must not see an edit made to another copy`).toBe(a)
    }
  }, HEAVY)

  it('1b. each state is what the plan says it is', () => {
    const kid = navState('kid')
    expect(kid.character.age).toBe(9)
    expect(kid.queue).toEqual([])
    const adult = navState('adult')
    expect(adult.character.age).toBe(35)
    expect(adult.character.job).not.toBeNull()
    expect(adult.assets.filter((a) => a.kind === 'house')).toHaveLength(1)
    expect(adult.people.filter((p) => p.relation === 'friend')).toHaveLength(2)
    expect(adult.people.some((p) => p.relation === 'partner')).toBe(true)
    const ceo = navState('ceo')
    expect(ceo.character.age).toBe(45)
    expect(ceo.assets.filter((a) => a.kind === 'business')).toHaveLength(2)
    const elder = navState('elder')
    expect(elder.character.age).toBe(78)
    expect(elder.character.retired).toBe(true)
    expect(elder.character.pension).toBe(24000)
    expect(elder.character.conditions.filter((c) => c.diagnosed && c.severity === 60)).toHaveLength(1)
    for (const name of NAMES) expect(navState(name).queue, name).toEqual([])
  }, HEAVY)

  it('1c. frozen() is a deep-frozen copy', () => {
    const g = frozen('kid')
    expect(Object.isFrozen(g)).toBe(true)
    expect(Object.isFrozen(g.character)).toBe(true)
    expect(Object.isFrozen(g.people)).toBe(true)
    expect(() => {
      g.character.money = 1
    }).toThrow()
    expect(Object.isFrozen(navState('kid'))).toBe(false)
  })
})

describe('normId', () => {
  it('2. every run of digits becomes #, ids without digits stay', () => {
    expect(normId('biz.plan.a12')).toBe('biz.plan.a#')
    expect(normId('person.p7.talk')).toBe('person.p#.talk')
    expect(normId('a1b22c333')).toBe('a#b#c#')
    expect(normId('activities')).toBe('activities')
    expect(normId('biz.details')).toBe('biz.details')
    expect(normId('')).toBe('')
  })
})

describe('canonical paths and action sequences', () => {
  const g = makeTestGame(3, { age: 30 })

  it('3. canonical strips hub segments and keeps the order', () => {
    const tree = grp('assets', [grp('staff', [grp('hub.team', [act('hire'), act('fire')]), act('rota')]), grp('hub.run', [act('open')])])
    const walked = walkTree(g, { roots: only('assets', tree) })
    const byIds = new Map(walked.map((w) => [w.ids.join('/'), w]))
    expect(canonical(byIds.get('staff/hub.team/hire')!)).toBe('assets/staff/hire')
    expect(canonical(byIds.get('staff/hub.team/fire')!)).toBe('assets/staff/fire')
    expect(canonical(byIds.get('staff/rota')!)).toBe('assets/staff/rota')
    expect(canonical(byIds.get('hub.run/open')!)).toBe('assets/open')
    expect(canonical(byIds.get('staff')!)).toBe('assets/staff')
  })

  it('3b. a tree with a hub group has the same action sequence as the tree without it', () => {
    const withHub = grp('activities', [act('a'), grp('hub.x', [act('b'), act('c')]), act('d')])
    const flat = grp('activities', [act('a'), act('b'), act('c'), act('d')])
    const seq = actionSequence(g, { roots: only('activities', withHub) })
    expect(seq).toEqual(['activities/a', 'activities/b', 'activities/c', 'activities/d'])
    expect(actionSequence(g, { roots: only('activities', flat) })).toEqual(seq)
  })

  it('3c. the sequence lists tabs in the order occupation, assets, relationships, activities', () => {
    const roots: NonNullable<WalkOpts['roots']> = {
      occupation: grp('occupation', [act('o')]),
      assets: grp('assets', [act('s')]),
      relationships: grp('relationships', [act('r')]),
      activities: grp('activities', [act('v')]),
    }
    expect(actionSequence(g, { roots })).toEqual(['occupation/o', 'assets/s', 'relationships/r', 'activities/v'])
  })
})

describe('walkTree', () => {
  const g = makeTestGame(4, { age: 30 })

  it('4. lists a locked group without entering it', () => {
    const tree = grp('activities', [act('open'), grp('locked', [act('inside')], { disabledReason: () => 'Not yet.' }), act('after')])
    expect(idsOf(g, 'activities', tree)).toEqual(['open', 'locked', 'after'])
  })

  it('4b. a hidden node is absent, and so is everything under a hidden group', () => {
    const tree = grp('activities', [
      act('shown'),
      act('hidden', { visible: () => false }),
      grp('hiddenGroup', [act('deep')], { visible: () => false }),
      grp('shownGroup', [act('deep')]),
    ])
    expect(idsOf(g, 'activities', tree)).toEqual(['shown', 'shownGroup', 'shownGroup/deep'])
  })

  it('4c. a throwing children() is skipped, reported through console.error, and does not abort the walk', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tree = grp('activities', [
      act('before'),
      grp('boom', () => {
        throw new Error('children blew up')
      }),
      grp('badVisible', [act('x')], {
        visible: () => {
          throw new Error('visible blew up')
        },
      }),
      act('after'),
    ])
    expect(idsOf(g, 'activities', tree)).toEqual(['before', 'boom', 'after'])
    expect(spy).toHaveBeenCalled()
    const said = spy.mock.calls.map((c) => String(c[0]))
    expect(said.some((s) => s.includes('children(boom)'))).toBe(true)
    expect(said.some((s) => s.includes('visible(badVisible)'))).toBe(true)
  })

  it('4d. records type, tab, node and the number of rows in the parent list', () => {
    const tree = grp('activities', [head('h'), act('a'), act('b', { visible: () => false }), grp('m', [act('c'), act('d'), act('e')]), { type: 'info', id: 'i', text: 'hi' }])
    const walked = walkTree(g, { roots: only('activities', tree) })
    expect(walked.map((w) => [w.ids.join('/'), w.type, w.rows])).toEqual([
      ['a', 'action', 2],
      ['m', 'menu', 2],
      ['m/c', 'action', 3],
      ['m/d', 'action', 3],
      ['m/e', 'action', 3],
    ])
    expect(walked.every((w) => w.tab === 'activities')).toBe(true)
    expect(walked[0].node).toBe(tree.children(g)[1])
  })

  it('4e. maxDepth counts groups, but a hub group adds no depth', () => {
    const plain = grp('activities', [grp('one', [grp('two', [act('leaf')])])])
    expect(idsOf(g, 'activities', plain, { maxDepth: 2 })).toEqual(['one', 'one/two'])
    expect(idsOf(g, 'activities', plain, { maxDepth: 3 })).toEqual(['one', 'one/two', 'one/two/leaf'])
    const hubbed = grp('activities', [grp('one', [grp('hub.run', [grp('two', [act('leaf')])])])])
    expect(idsOf(g, 'activities', hubbed, { maxDepth: 2 })).toEqual(['one', 'one/hub.run', 'one/hub.run/two'])
    expect(idsOf(g, 'activities', hubbed, { maxDepth: 3 })).toEqual(['one', 'one/hub.run', 'one/hub.run/two', 'one/hub.run/two/leaf'])
  })

  it('4f. maxNodes bounds a runaway tree', () => {
    const endless: MenuGroup = grp('activities', () => [act('a'), act('b'), endless])
    const walked = walkTree(g, { roots: only('activities', endless), maxNodes: 50, maxDepth: 1000 })
    expect(walked.length).toBeGreaterThan(0)
    expect(walked.length).toBeLessThanOrEqual(50)
  })

  it('4g. walks the four real roots of a real state, with the relationships root from person.<id> groups', () => {
    const adult = frozen('adult')
    const walked = walkTree(adult)
    const tabs = new Set(walked.map((w) => w.tab))
    for (const t of TABS) expect(tabs.has(t), t).toBe(true)
    const person = adult.people.find((p) => p.relation === 'partner')!
    const rel = walked.filter((w) => w.tab === 'relationships')
    expect(rel.some((w) => w.type === 'menu' && w.ids.join('/') === `person.${person.id}`)).toBe(true)
    expect(rel.some((w) => w.type === 'action' && w.ids[0] === `person.${person.id}`)).toBe(true)
  }, HEAVY)

  it('4h. isTruncated says whether the node cap or the depth cap cut the walk', () => {
    const plain = grp('activities', [grp('one', [grp('two', [act('leaf')])])])
    const walkPlain = (opts: WalkOpts) => walkTree(g, { ...opts, roots: only('activities', plain) })
    expect(isTruncated(walkPlain({ maxDepth: 3 }))).toBe(false)
    expect(isTruncated(walkPlain({ maxDepth: 2 }))).toBe(true)
    const endless: MenuGroup = grp('activities', () => [act('a'), act('b'), endless])
    expect(isTruncated(walkTree(g, { roots: only('activities', endless), maxNodes: 50, maxDepth: 1000 }))).toBe(true)
    // A locked group is left alone on purpose: that is not a cut.
    const locked = grp('activities', [grp('locked', [act('inside')], { disabledReason: () => 'Not yet.' })])
    expect(isTruncated(walkTree(g, { roots: only('activities', locked) }))).toBe(false)
    // The cap equal to the node count is a whole walk; one less is a cut.
    const three = grp('activities', [act('a'), act('b'), act('c')])
    expect(isTruncated(walkTree(g, { roots: only('activities', three), maxNodes: 3 }))).toBe(false)
    expect(isTruncated(walkTree(g, { roots: only('activities', three), maxNodes: 2 }))).toBe(true)
    expect(() => isTruncated([])).toThrow()
  })
})

describe('cached walks', () => {
  it('8. two calls under the same flags and options give one array', () => {
    const a = walkTreeCached('kid')
    expect(walkTreeCached('kid')).toBe(a)
    expect(actionSequenceCached('kid')).toBe(actionSequenceCached('kid'))
    expect(actionSequenceCached('kid')).toEqual(a.filter((w) => w.type === 'action').map(canonical))
    expect(walkTreeCached('kid', { maxDepth: 2 })).not.toBe(a)
    expect(isTruncated(walkTreeCached('kid'))).toBe(false)
  })

  it('8b. the flag state is part of the key, so a flag-off and a flag-on call never share an entry', () => {
    setFlags(NAV_OFF)
    const off = walkTreeCached('kid')
    const seqOff = actionSequenceCached('kid')
    const on = withFlags({ ...NAV_OFF, cockpits: true }, () => walkTreeCached('kid'))
    const seqOn = withFlags({ ...NAV_OFF, navRegroup: true }, () => actionSequenceCached('kid'))
    expect(on).not.toBe(off)
    expect(seqOn).not.toBe(seqOff)
    // Same flags again: the entry made under them, and back with the flags off: the first one.
    withFlags({ ...NAV_OFF, cockpits: true }, () => expect(walkTreeCached('kid')).toBe(on))
    withFlags({ ...NAV_OFF, navRegroup: true }, () => expect(actionSequenceCached('kid')).toBe(seqOn))
    expect(walkTreeCached('kid')).toBe(off)
    expect(actionSequenceCached('kid')).toBe(seqOff)
    // Turning a flag off explicitly is the default state, not a new one.
    expect(withFlags({ ...NAV_OFF, cockpits: false }, () => walkTreeCached('kid'))).toBe(off)
  })

  it('8c. synthetic roots are refused at run time, so a cached entry is always a walk of the real roots', () => {
    const roots = only('assets', grp('assets', [act('a')]))
    expect(() => walkTreeCached('kid', { roots } as WalkOpts)).toThrow(/roots/)
    expect(() => actionSequenceCached('kid', { roots } as WalkOpts)).toThrow(/roots/)
    // Nothing was cached by the refused calls.
    expect(walkTreeCached('kid').some((w) => w.node.id === 'a')).toBe(false)
  })
})

describe('lintViolations', () => {
  const g = makeTestGame(5, { age: 30 })
  const many = (n: number, prefix = 'x'): MenuNode[] => Array.from({ length: n }, (_, i) => act(`${prefix}${i}`))

  function lint(tab: NavTab, group: MenuGroup) {
    return lintViolations(g, { roots: only(tab, group) })
  }

  it('5. a group with more than 12 rows and no heading is too long; 12 rows or a heading is fine', () => {
    const tree = grp('assets', [grp('long.a1', many(13)), grp('edge.a2', many(12)), grp('headed.a3', [head('h'), ...many(14)])])
    const out = lint('assets', tree)
    expect(out.tooLong).toEqual(['long.a#'])
  })

  it('5b. only visible rows count, and info rows are not rows', () => {
    const hidden = many(20).map((n) => ({ ...n, visible: () => false }) as MenuNode)
    const infos: MenuNode[] = Array.from({ length: 20 }, (_, i) => ({ type: 'info', id: `i${i}`, text: 'x' }))
    const tree = grp('assets', [grp('hiddenRows', [...many(3), ...hidden]), grp('infoRows', [...many(3), ...infos])])
    expect(lint('assets', tree).tooLong).toEqual([])
  })

  it('5c. a group with exactly one visible row is single; none or two is not', () => {
    const tree = grp('assets', [grp('one.p7', [act('a')]), grp('none', []), grp('two', [act('a'), act('b')]), grp('oneAndInfo', [act('a'), { type: 'info', id: 'i', text: 'x' }])])
    expect(lint('assets', tree).single).toEqual(['one.p#', 'oneAndInfo'])
  })

  it('5d. ids are normalised, unique and sorted', () => {
    const tree = grp('assets', [grp('z.a1', [act('a')]), grp('a.a2', [act('a')]), grp('z.a3', [act('a')])])
    expect(lint('assets', tree).single).toEqual(['a.a#', 'z.a#'])
  })

  it('5e. the roots are linted too, and a sectioned root may be long', () => {
    expect(SECTIONED_ROOTS).toContain('activities')
    const longRoot = (id: string) => grp(id, many(30))
    expect(lint('activities', longRoot('activities')).tooLong).toEqual([])
    expect(lint('occupation', longRoot('occupation')).tooLong).toEqual(['occupation'])
    expect(lint('assets', grp('assets', [act('only')])).single).toEqual(['assets'])
  })

  it('5f. a locked group is not entered, so its rows are not linted', () => {
    const tree = grp('assets', [grp('locked', many(30), { disabledReason: () => 'Not yet.' })])
    const out = lint('assets', tree)
    expect(out.tooLong).toEqual([])
    expect(out.single).toEqual(['assets'])
  })
})
