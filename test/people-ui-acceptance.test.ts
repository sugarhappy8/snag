// R4-U11 (the People UI and fog track, H.5 and H.7): the acceptance sweep of the track, run once on the merged tree. Each task of the track
// proves its own screen (test/people-*.test.ts, person-facts-ui, fog-staff, fog-leader); no task proves that they hold together, in lives that
// are played and not built, on old saves and on hostile ones. The long one: no `// ci: fast` (about 30 s).
//
//   (a) screens   in Realistic with `peopleProfile` on, a person has chips and a Look closer group, the hired staff and the CEO read as ranges and
//                 offer a check; in Exact, and with the flag off, none of it
//   (b) pure      every screen of the track builds on a deep-frozen copy (or twice on fresh copies when it is a flow) and leaves the JSON and
//                 g.rng alone; the display half of the marriage-for-wealth probe: a read or a shown row changes no money (E15 case (b) is the probe)
//   (c) owners    `ppl` and `stf` are registered once the game is loaded, `cand` is still read in place
//   (d) bought    after a Look closer purchase, a hire with a check and a CEO check, every screen of the game still renders
//   (e) played    three lives of up to 40 years in Realistic (a founder, a firm under a hired CEO, a life stamped by the social flag), every
//                 profile, staff sheet and cockpit rendered each year: stable, bounded, no hole in the text
//   (f) replay    the same three lives in Exact, with the flag off and nothing rendered, end with the JSON of the lives played in (e)
//   (g) old saves every save-*.json.gz renders every profile in Realistic, an unstamped life included (X8), and hostile records stay bounded
//   (h) docs      docs/FOG.md names the rules of the track
//   (j) advisors  H.5 "claimed versus true" for the money team, with no edit to advisors/: a crook's claimed rating is above the true skill and the
//                 screens print the rating as a word
//   (k) money     the static scan (X50): the files of the track write no purse, mint, burn or income and never call Math.random
//   (l) palette   how the ranking orders the one Look closer entry each person adds to the index
//
// (i), the repetition gates, are three commands and not a case: quiet-acceptance, text-kit and text-repeat run once each, plain, one at a time.
// The suite runs in Exact (test/setup-exact.ts). A Realistic case goes through `real` (inFog and withFlags); the flag is always named.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { moneyTeamMenu } from '../src/game/advisors/menu'
import { hire, offersFor, ratingLabel, readTeam, type ManagerHire } from '../src/game/advisors/team'
import { businessAssetView } from '../src/game/business'
import { becomeCeo } from '../src/game/business/career'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { industryDef } from '../src/game/business/industries'
import { infoRows } from '../src/game/business/manage'
import { staffMenu } from '../src/game/business/staff'
import { bizOf, businessAssets, type KeyStaff } from '../src/game/business/state'
import { netWorth } from '../src/game/core'
import { withFlags } from '../src/game/flags'
import { cockpitOf } from '../src/game/hubs/cockpit'
import { personFacts, type FactRow as FactData } from '../src/game/hubs/people-facts'
import { memoryLines } from '../src/game/hubs/people-memory'
import { connectionsOf } from '../src/game/hubs/people-web'
import { peopleMenu, personGroup } from '../src/game/hubs/people'
import { checkLedger } from '../src/game/kernel/ledger'
import { personKey } from '../src/game/kernel/person-ref'
import { KNOW_LIMITS, readKnow, storedEstimates } from '../src/game/knowledge/contract'
import { kindOf } from '../src/game/knowledge/kinds'
import { yearlyKnowledge } from '../src/game/knowledge/module'
import { ownerOf } from '../src/game/knowledge/rows'
import { withInfoMode } from '../src/game/knowledge/mode'
import { PEOPLE_CAPS, lookKeysOf, pplKey, usesProfile } from '../src/game/people-fog'
import { personActions } from '../src/game/relationships'
import { isLoadableGame, migrateSave } from '../src/game/save-schema'
import { runScript } from '../src/game/scripts'
import type { Asset, ChoiceModal, GameState, MenuAction, MenuGroup, MenuNode, ModalItem, Person } from '../src/game/types'
import { MEMORY_KINDS } from '../src/game/world/edge-memory'
import { remember } from '../src/game/world/edge-write'
import { socialOn } from '../src/game/world/social'
import { PersonDetails } from '../src/ui/components/PersonSheet'
import { PersonProfileLazy } from '../src/ui/people/lazy'
import { buildIndex, type IndexRoots } from '../src/ui/nav/searchIndex'
import { search } from '../src/ui/nav/searchRank'
import { client, own, withTeam } from './advisors-kit'
import { FailureLog, formatFailures, renderAll } from './fuzz-kit'
import { deepFreeze, inFog } from './knowledge-kit'
import { adult, allNodes, company } from './market-kit'
import { makeTestGame } from './helpers'
import { playLife } from './play-kit'
import { FIXTURE_FILE, KIT_KEYS, buildKit, buildRows, companyGame, diffRows, linesOf, staffedCompany, type Kit, type KitKey, type Recorded } from './people-ui-kit'
import { K_ID, K_PUNCT, K_STR, ROOT, closeParen, isId, isPunct, lineOf, loadSources, splitArgs, toSource, type SourceFile, type Tok } from './scan-kit'
import { socialLife } from './social-kit'

const ON = { peopleProfile: true } as const
const OFF = { peopleProfile: false } as const
/** Realistic with the flag on: the only state in which the new screens exist. */
const real = <T>(fn: () => T): T => withFlags(ON, () => inFog(fn))
/** Realistic with the flag off, Exact with the flag on, and Exact with it off: the three states that print v5.2.0. */
const dark = <T>(fn: () => T): T => withFlags(OFF, () => inFog(fn))
const exact = <T>(fn: () => T): T => withFlags(ON, () => withInfoMode('exact', fn))
const v520 = <T>(fn: () => T): T => withFlags(OFF, () => withInfoMode('exact', fn))

const BAD = /NaN|undefined|\[object|Infinity/
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`)
const TIMEOUT = 300_000
const FIXTURE_DIR = join(ROOT, 'test', 'fixtures')
const DOCS = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'docs')

beforeAll(async () => {
  // The profile is a lazy chunk (X48): every case below that renders it needs the chunk in.
  expect(await PersonProfileLazy.preload()).toBe(true)
})

// ---------------------------------------------------------------------------------------------------------------------------------
// Reading a screen

const personIn = (g: GameState, id: string): Person => {
  const p = g.people.find((x) => x.id === id)
  if (!p) throw new Error(`no person ${id}`)
  return p
}
const kitPerson = (k: Kit, key: KitKey, g: GameState = k.g): Person => personIn(g, k.ids[key])
const markup = (g: GameState, p: Person): string => renderToStaticMarkup(createElement(PersonDetails, { g, person: p }))

/** The words of a rendered tree: tags dropped, the entities React writes turned back, white space collapsed. */
function plain(m: string): string {
  return m
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}
const count = (m: string, needle: RegExp): number => (m.match(needle) ?? []).length
const textOf = (g: GameState, n: MenuNode): string => (n.type === 'info' ? (typeof n.text === 'function' ? n.text(g) : n.text) : n.type === 'heading' ? n.label : '')

/** Every visible node under some roots, menus opened, depth first. */
function walk(g: GameState, nodes: readonly MenuNode[], depth = 0): MenuNode[] {
  const out: MenuNode[] = []
  for (const n of nodes) {
    if (n.visible && !n.visible(g)) continue
    out.push(n)
    if (n.type === 'menu' && depth < 7) out.push(...walk(g, n.children(g), depth + 1))
  }
  return out
}
const looksOf = (g: GameState, nodes: readonly MenuNode[]): string[] => walk(g, nodes).filter((n) => n.id.startsWith('look.')).map((n) => n.id)
const chipsOf = (g: GameState, nodes: readonly MenuNode[]): number => walk(g, nodes).filter((n) => n.type !== 'heading' && n.conf !== undefined).length

/** What the people screens say of a life, one string a screen: every profile, the cockpit and the badges. */
function peopleScreens(g: GameState): string[] {
  const out: string[] = []
  for (const p of g.people) out.push(plain(markup(g, p)))
  out.push(JSON.stringify(cockpitOf('relationships', g)))
  for (const p of g.people) if (p.alive && p.relation !== 'pet') out.push(String(personGroup(p).badge?.(g) ?? ''))
  return out
}

/** What the company screens say: each hired staff sheet (subtitle, header) and the CEO rows. */
function companyScreens(g: GameState): string[] {
  const out: string[] = []
  for (const a of businessAssets(g)) {
    out.push(...linesOf(g, staffMenu(a).children(g)))
    out.push(...infoRows(g, a).map((n) => textOf(g, n)))
  }
  return out
}

/** The text of the facts, connections and memory lines of a person, which are the rows this track writes. */
function newRows(g: GameState, p: Person): string[] {
  const f = personFacts(g, p)
  const rows: FactData[] = f === null ? [] : f.rows
  return [...rows.flatMap((r) => [r.label, r.text, r.how ?? '']), ...connectionsOf(g, p).flatMap((r) => [r.label, r.text]), ...memoryLines(g, p)]
}

/** A restaurant company with four hired staff (the kit's), and the fourteen people of the kit at one feeling. */
function uiLife(level = 70): { g: GameState; kit: Kit; a: Asset } {
  const { g, a } = staffedCompany('rest')
  const kit = buildKit(level, g)
  return { g, kit, a }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// (a) the screens

describe('(a) in Realistic the screens of the track have their chips and their Look closer, in Exact none', () => {
  it('the person profile: a chip a read in Realistic, the old bars in Exact, with the flag off and for a pet', () => {
    const { g, kit } = uiLife()
    const friend = kitPerson(kit, 'friend')
    real(() => {
      const m = markup(g, friend)
      expect(count(m, /class="conf-chip"/g), 'chips').toBeGreaterThanOrEqual(4)
      expect(count(m, /class="statbar"/g), 'one bar, your own feeling').toBe(1)
      expect(m).not.toMatch(/statbar-small/)
    })
    for (const wrap of [exact, dark, v520]) {
      wrap(() => {
        const m = markup(g, friend)
        expect(m, wrap.name).not.toMatch(/conf-chip|fact-row/)
        expect(count(m, /statbar-small/g), wrap.name).toBeGreaterThanOrEqual(4)
      })
    }
    // a pet and the dead keep the old sheet in Realistic, too
    real(() => {
      for (const key of ['pet', 'deadParent'] as const) expect(markup(g, kitPerson(kit, key)), key).not.toMatch(/conf-chip|fact-row/)
    })
  }, TIMEOUT)

  it('the person actions: a Look closer group and chips in Realistic for a living person, none in Exact or with the flag off', () => {
    const { g, kit } = uiLife()
    const nina = kitPerson(kit, 'npcLife')
    real(() => {
      const nodes = personActions(g, nina)
      expect(looksOf(g, nodes)).toContain('look.person')
      expect(chipsOf(g, nodes), 'rows with a chip').toBeGreaterThan(0)
      // the group sells the private investigator and nothing else
      const group = nodes.find((n) => n.id === 'look.person') as MenuGroup
      expect(group.children(g).map((n) => n.id)).toEqual(['look.person.investigator'])
      // never for the dead or a pet
      for (const key of ['pet', 'deadParent'] as const) expect(looksOf(g, personActions(g, kitPerson(kit, key))), key).toEqual([])
    })
    for (const wrap of [exact, dark, v520]) {
      wrap(() => {
        const nodes = personActions(g, nina)
        expect(looksOf(g, nodes), wrap.name).toEqual([])
        expect(chipsOf(g, nodes), wrap.name).toBe(0)
      })
    }
  }, TIMEOUT)

  it('hired staff: a range a sheet in Realistic, the number in Exact', () => {
    const { g, a } = uiLife()
    const rosa = bizOf(g, a).staff.find((s) => s.id === 'ks1')!
    const lines = (): string => linesOf(g, staffMenu(a).children(g)).join('\n')
    real(() => {
      const t = lines()
      expect(t).toMatch(/Rosa Diaz[^\n]*skill about \d+ to \d+/)
      expect(t).not.toContain(`skill ${rosa.skill} `)
      expect(t).not.toContain(`Skill ${rosa.skill}/100`)
      expect(t).toMatch(/Trait not clear yet/)
    })
    for (const wrap of [exact, dark, v520]) {
      wrap(() => {
        const t = lines()
        expect(t, wrap.name).toContain(`skill ${rosa.skill} `)
        expect(t, wrap.name).not.toMatch(/skill about|not clear yet/i)
      })
    }
  }, TIMEOUT)

  it('the CEO shortlist: ranges, no star and a check choice in Realistic, the numbers and no check in Exact', () => {
    const open = (): ChoiceModal => {
      const { g, a } = companyGame('restaurant')
      const row = allNodes(g, businessAssetView(g, a)).find((n): n is MenuAction => n.type === 'action' && n.id === `biz.stepDown.${a.id}`)!
      g.queue = []
      g.rng = 777
      row.run(g)
      return g.queue.filter((m): m is ChoiceModal => m.kind === 'choice' && m.source === 'script' && m.scriptId === 'business.manager').at(-1)!
    }
    const m = real(open)
    expect(m.text).toMatch(/skill about \d+ to \d+/)
    expect(m.choices.map((c) => c.id)).toContain('vet')
    expect(m.text).not.toMatch(/skill \d+\/100|⭐/)
    for (const wrap of [exact, dark, v520]) {
      const e = wrap(open)
      expect(e.choices.map((c) => c.id), wrap.name).not.toContain('vet')
      expect(e.text, wrap.name).toMatch(/skill \d+\/100|skill \d+,/)
      expect(e.text, wrap.name).not.toMatch(/skill about/)
    }
  }, TIMEOUT)

  it('the People cockpit: facts and no estimate; four tiles at most with the flag, none without it, in either mode', () => {
    const { g } = uiLife(20)
    const tiles = (wrap: <T>(f: () => T) => T): number => wrap(() => cockpitOf('relationships', g).tiles.length)
    expect(tiles(real)).toBeGreaterThan(0)
    expect(tiles(real)).toBeLessThanOrEqual(4)
    expect(tiles(exact)).toBe(tiles(real))
    expect(tiles(dark)).toBe(0)
    expect(tiles(v520)).toBe(0)
    real(() => {
      const model = JSON.stringify(cockpitOf('relationships', g))
      expect(model).not.toMatch(/"conf"|about \d|\d to \d/)
    })
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (b) pure

describe('(b) every screen of the track is pure', () => {
  it('builds the whole oracle of the kit in Realistic with the flag on: the rows twice, on frozen copies or on fresh ones, and no hole in the text', () => {
    const rows = real(() => buildRows())
    const recorded = (JSON.parse(readFileSync(join(ROOT, FIXTURE_FILE), 'utf8')) as Recorded).rows
    // the same screens as the oracle recorded at v5.2.0: none is missing, none is new
    expect(rows.map(([k]) => k)).toEqual(recorded.map(([k]) => k))
    expect(rows.length).toBeGreaterThan(100)
    // and what is built is the screens of the track: the profile, the staff sheet and the CEO list moved, so the sweep is not reading Exact
    const moved = diffRows(recorded, rows)
    expect(moved.some((m) => m.startsWith('details/friend/50')), 'the profile moved').toBe(true)
    expect(moved.some((m) => m.startsWith('staff/rest/ks1/subtitle')), 'the staff sheet moved').toBe(true)
    expect(moved.some((m) => m.startsWith('ceo/rest/standard')), 'the CEO list moved').toBe(true)
    for (const [k, t] of rows) {
      expect(t, k).not.toMatch(BAD)
    }
  }, TIMEOUT)

  it('reads the new rows of every person of the kit on a frozen copy: the same text twice, nothing written, nothing drawn', () => {
    for (const level of [20, 50, 90]) {
      const kit = buildKit(level)
      const g = structuredClone(kit.g)
      const json = JSON.stringify(g)
      const rng = g.rng
      const nextId = g.nextId
      deepFreeze(g)
      real(() => {
        for (const key of KIT_KEYS) {
          const p = kitPerson(kit, key, g)
          const a = newRows(g, p)
          expect(newRows(g, p), key).toEqual(a)
          for (const t of a) {
            expect(t, key).not.toMatch(BAD)
            expect(t, key).not.toMatch(LONG_DASH)
            expect(t.length, key).toBeLessThanOrEqual(120)
          }
          expect(personFacts(g, p) !== null, key).toBe(usesProfile(p))
        }
        peopleScreens(g)
      })
      expect(JSON.stringify(g)).toBe(json)
      expect(g.rng).toBe(rng)
      expect(g.nextId).toBe(nextId)
    }
  }, TIMEOUT)

  it('shows a rich spouse and changes no money: a read or a shown row moves nothing (the display half of the marriage-for-wealth probe)', () => {
    // The probe itself, a $50M spouse for ten years, is E15 case (b). This is the half that is true of every pure read: the rows that show
    // a rich person's cash, net worth and company move no dollar, so a shown wealth is not a spendable one.
    const { g, kit } = uiLife(90)
    const spouse = kitPerson(kit, 'spouse')
    spouse.money = 50_000_000
    spouse.livesWithPlayer = true
    const before = JSON.stringify(g)
    const worth = netWorth(g)
    const cash = g.character.money
    real(() => {
      const nodes = personActions(g, spouse)
      expect(nodes.length).toBeGreaterThan(5)
      const facts = personFacts(g, spouse)!
      expect(facts.rows.find((r) => r.id === 'facts.cash')?.state).toBe('estimate')
      peopleScreens(g)
      walk(g, nodes)
      cockpitOf('relationships', g)
    })
    expect(JSON.stringify(g)).toBe(before)
    expect(g.character.money).toBe(cash)
    expect(netWorth(g)).toBe(worth)
    expect(spouse.money).toBe(50_000_000)
    expect(checkLedger(g).ok).toBe(true)
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (c) owners

describe('(c) the key families of the track have an owner', () => {
  it('ppl and stf are registered once the game is loaded, each with a label and a truth; cand is still read in place', () => {
    // the imports above loaded the people and company screens
    for (const kind of ['ppl', 'stf']) {
      const def = kindOf(kind)
      expect(def, kind).not.toBeNull()
      expect(typeof def!.label, kind).toBe('function')
      expect(typeof def!.truth, kind).toBe('function')
      expect(typeof def!.gone, `${kind} forgets what left`).toBe('function')
    }
    // a person's numbers are for sale (the private investigator), a hire's skill is not: it is read by the interview, the check and the years
    expect(typeof kindOf('ppl')!.scope).toBe('function')
    expect(kindOf('cand')).toBeNull()
    const { g, kit } = uiLife()
    const p = kitPerson(kit, 'friend')
    expect(kindOf('ppl')!.truth(g, pplKey(p, 'smarts')!)).toBe(p.stats.smarts)
    expect(kindOf('ppl')!.truth(g, pplKey(p, 'worth')!), 'net worth is not for sale').toBeNull()
    expect(kindOf('stf')!.truth(g, 'stf:biz1:ks1:skill')).toBeNull()
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (d) bought

const isHire = (m: ModalItem): m is ChoiceModal => m.kind === 'choice' && m.source === 'script' && m.scriptId === 'business.hire'
const isManager = (m: ModalItem): m is ChoiceModal => m.kind === 'choice' && m.source === 'script' && m.scriptId === 'business.manager'

describe('(d) a purchase, a hire with a check and a CEO check', () => {
  it('buys a read of two people, interviews and checks a hire, checks a CEO shortlist, and then every screen of the game renders', () => {
    real(() => {
      const { g, kit, a } = uiLife(70)
      g.character.talents = []
      const cash0 = g.character.money

      // Look closer: the investigator reads a person with an NPC life (five keys) and one without (four)
      for (const key of ['npcLife', 'friend'] as const) {
        const p = kitPerson(kit, key)
        const group = personActions(g, p).find((n): n is MenuGroup => n.id === 'look.person')!
        const offer = group.children(g).find((n): n is MenuAction => n.type === 'action')!
        expect(offer.disabledReason?.(g) ?? null, key).toBeNull()
        offer.run(g)
        g.queue = []
        expect(lookKeysOf(g, p).length, key).toBe(key === 'npcLife' ? 5 : 4)
      }
      const bought = storedEstimates(g).filter((e) => e.key.startsWith('ppl:'))
      expect(bought.length, 'rows the investigator kept').toBe(9)
      for (const e of bought) expect(String(e.src)).toContain('investigator')

      // a hire: interview, the background check, then the first candidate
      const row = allNodes(g, businessAssetView(g, a)).find((n) => n.type === 'action' && n.id.startsWith(`biz.hire.${a.id}.`) && !n.disabledReason?.(g))
      expect(row, 'an open hiring row').toBeDefined()
      if (row?.type === 'action') row.run(g)
      const popup = g.queue.filter(isHire).at(-1)!
      expect(popup.choices.map((c) => c.id)).toContain('vet')
      runScript(g, popup.scriptId!, 'vet', popup.data, popup)
      const again = g.queue.filter(isHire).at(-1)!
      expect(again.text).not.toMatch(/not clear yet/)
      const staffBefore = bizOf(g, a).staff.length
      runScript(g, again.scriptId!, 'c0', again.data, again)
      g.queue = []
      expect(bizOf(g, a).staff.length).toBe(staffBefore + 1)

      // a CEO: the shortlist, the check, the hire
      const step = allNodes(g, businessAssetView(g, a)).find((n): n is MenuAction => n.type === 'action' && n.id === `biz.stepDown.${a.id}`)!
      g.queue = []
      g.rng = 4242
      step.run(g)
      const list = g.queue.filter(isManager).at(-1)!
      expect(list.choices.map((c) => c.id)).toContain('vet')
      g.queue = []
      runScript(g, 'business.manager', 'vet', list.data, list)
      const checked = g.queue.filter(isManager).at(-1)!
      expect(checked.choices.map((c) => c.id), 'one check a list').not.toContain('vet')
      g.queue = []
      runScript(g, 'business.manager', 'm0', checked.data, checked)
      g.queue = []

      // the fees came out of the books as fees, and the books balance
      expect(g.character.money).toBeLessThan(cash0)
      expect(checkLedger(g).ok).toBe(true)
      const keys = storedEstimates(g).map((e) => e.key)
      expect(keys.some((k) => k.startsWith('stf:')), 'the hire and the CEO carry their reads').toBe(true)
      expect(keys.length).toBeLessThanOrEqual(KNOW_LIMITS.keys)

      // every screen of the game, on a frozen copy: no throw, no write, no hole in the text
      const json = JSON.stringify(g)
      const rng = g.rng
      const log = new FailureLog()
      expect(renderAll(g, log), 'enabled actions seen').toBeGreaterThan(40)
      expect(formatFailures(log)).toBe('')
      expect(JSON.stringify(g)).toBe(json)
      expect(g.rng).toBe(rng)
      const frozen = deepFreeze(structuredClone(g))
      for (const t of [...peopleScreens(frozen), ...companyScreens(frozen)]) expect(t).not.toMatch(BAD)
      expect(JSON.stringify(frozen)).toBe(json)
    })
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (e) played, (f) replay

/** The seeds of the three lives (tuples: the seed-pin ratchet counts only the `seed:` form). */
const SEEDS = [17, 23, 9] as const

interface LifeSpec {
  name: string
  seed: number
  /** The years played: the life stops sooner when the character dies. */
  years: number
  make: () => GameState
  /** Before each year, the same in every replay: the care a player would take (the doctor, a new firm when the old one failed). */
  between: (g: GameState) => void
}

/** A player who sees the doctor: health to full. Deaths from accidents and crimes still happen. */
const heal = (g: GameState): void => {
  g.character.stats.health = 100
}

/** Hired key staff, as the kit hires them: three for a restaurant and two for a firm, new this year, a year in and five in. */
function addStaff(g: GameState, a: Asset, industry: 'restaurant' | 'investmentFirm' = 'restaurant'): void {
  const b = bizOf(g, a)
  const title = (focus: KeyStaff['focus']): string => industryDef(industry).roles.find((r) => r.focus === focus)!.title
  const rows: { first: string; focus: KeyStaff['focus']; years: number; skill: number; trait: string }[] =
    industry === 'restaurant'
      ? [
          { first: 'Ada', focus: 'ops', years: 0, skill: 72, trait: 'workaholic' },
          { first: 'Kofi', focus: 'sales', years: 1, skill: 55, trait: 'charmer' },
          { first: 'Lena', focus: 'quality', years: 5, skill: 88, trait: 'steady' },
        ]
      : [
          { first: 'Imani', focus: 'finance', years: 5, skill: 91, trait: 'visionary' },
          { first: 'Sven', focus: 'sales', years: 0, skill: 47, trait: 'shady' },
        ]
  rows.forEach((r, i) => {
    const n = b.staff.length + 1 + i
    b.staff.push({ id: `ks${n}`, firstName: r.first, lastName: 'Okoro', gender: n % 2 === 0 ? 'female' : 'male', age: 34 + n, role: title(r.focus), focus: r.focus, skill: r.skill, salary: 50_000 + n * 4_000, trait: r.trait, morale: 60 + n, years: r.years })
  })
}

/** An investment firm the player runs, then hands to a hired CEO (the CEO rows and the letter are in play). */
function foundFirm(g: GameState): Asset {
  const year = g.year - 6
  const b0 = newBiz(g, 'investmentFirm', 'us', 'Chicago', { cash: 5_000_000, quality: 70, brand: 40, founded: year, outlets: [{ countryId: 'us', city: 'Chicago', count: 6, opened: year }] })
  const a = createBusinessAsset(g, 'Kit Fund', b0, 100_000)
  g.assets.push(a)
  becomeCeo(g, a, b0)
  g.queue = []
  const step = allNodes(g, businessAssetView(g, a)).find((n): n is MenuAction => n.type === 'action' && n.id === `biz.stepDown.${a.id}`)!
  step.run(g)
  const list = g.queue.filter(isManager).at(-1)!
  g.queue = []
  runScript(g, 'business.manager', 'm0', list.data, list)
  g.queue = []
  addStaff(g, a, 'investmentFirm')
  return a
}

const LIVES: readonly LifeSpec[] = [
  {
    name: 'a founder with a restaurant, three staff and fourteen people',
    seed: SEEDS[0],
    years: 40,
    make: () => {
      const g = adult(SEEDS[0], 2026, 'us')
      g.character.age = 25
      const a = company(g, 'restaurant', { cash: 5_000_000 })
      addStaff(g, a)
      buildKit(60, g)
      return g
    },
    between: (g) => {
      heal(g)
      // a restaurant that failed is followed by another, so a staff sheet is read in most of the years
      if (g.character.age < 60 && businessAssets(g).length === 0) addStaff(g, company(g, 'restaurant', { cash: 5_000_000 }))
    },
  },
  {
    name: 'an investment firm under a hired CEO, with the fourteen people',
    seed: SEEDS[1],
    years: 40,
    make: () => {
      const g = makeTestGame(SEEDS[1], { age: 26, money: 5_000_000 })
      g.character.talents = []
      foundFirm(g)
      buildKit(55, g)
      return g
    },
    between: (g) => {
      heal(g)
      if (g.character.age < 60 && businessAssets(g).length === 0) foundFirm(g)
    },
  },
  {
    name: 'a stamped life from birth (the social flag)',
    seed: SEEDS[2],
    years: 40,
    make: () => socialLife({ seed: SEEDS[2], year: 1986 }),
    between: (g) => {
      heal(g)
      // What the Edges track writes on an event (a gift, a loan, a fight) is written here by the same call, one memory a year about one living
      // person, so that the 40 kinds of MEMORY_KINDS reach the page over the 40 years, strongest and newest first.
      const living = g.people.filter((p) => p.alive && p.relation !== 'pet')
      const age = g.character.age
      if (living.length > 0 && socialOn(g)) remember(g, living[age % living.length]!, MEMORY_KINDS[age % MEMORY_KINDS.length]!, { w: (1 + (age % 3)) as 1 | 2 | 3, by: age % 2 === 0 ? 'ego' : 'them' })
    },
  },
]

interface Tally {
  years: number
  profiles: number
  staffSheets: number
  cockpits: number
  memoryLines: number
  connections: number
}

/** One year of a played life: every profile, staff sheet and cockpit, twice (the same text), and the rows this track wrote. */
function walkYear(g: GameState, y: number, t: Tally): void {
  const people = peopleScreens(g)
  expect(peopleScreens(g), `year ${y}: the people screens twice`).toEqual(people)
  const company = companyScreens(g)
  expect(companyScreens(g), `year ${y}: the company screens twice`).toEqual(company)
  for (const s of [...people, ...company]) expect(s, `year ${y}`).not.toMatch(BAD)
  for (const p of g.people) {
    const living = p.alive === true && p.relation !== 'pet'
    const m = markup(g, p)
    expect(personFacts(g, p) !== null, `${p.firstName} at year ${y}`).toBe(living)
    if (living) {
      expect(count(m, /class="statbar"/g), `${p.firstName} at year ${y}: one bar`).toBe(1)
      expect(m, `${p.firstName} at year ${y}`).not.toMatch(/statbar-small/)
      const f = personFacts(g, p)!
      expect(f.rows.filter((r) => r.id.startsWith('personality.') && r.state === 'estimate').length).toBeLessThanOrEqual(PEOPLE_CAPS.personality)
      expect(connectionsOf(g, p).length).toBeLessThanOrEqual(PEOPLE_CAPS.connections)
      expect(memoryLines(g, p).length).toBeLessThanOrEqual(PEOPLE_CAPS.memories)
      if (!socialOn(g)) expect(memoryLines(g, p), 'memories only on a stamped life').toEqual([])
      for (const text of newRows(g, p)) {
        expect(text).not.toMatch(BAD)
        expect(text).not.toMatch(LONG_DASH)
      }
      for (const line of memoryLines(g, p)) expect(plain(m), `${p.firstName} at year ${y}: a memory line on the page`).toContain(line)
      t.memoryLines += memoryLines(g, p).length
      t.connections += connectionsOf(g, p).length
      t.profiles++
    }
  }
  t.staffSheets += businessAssets(g).reduce((n, a) => n + bizOf(g, a).staff.length, 0)
  t.cockpits++
  t.years++
  // every tenth year on a frozen copy: the screens write nothing
  if (y % 10 === 0) {
    const copy = structuredClone(g)
    const json = JSON.stringify(copy)
    deepFreeze(copy)
    peopleScreens(copy)
    companyScreens(copy)
    for (const p of copy.people) personActions(copy, p)
    expect(JSON.stringify(copy), `year ${y}: a frozen walk wrote`).toBe(json)
  }
}

/** A life played year by year through the real yearly loop; in Realistic every screen is walked after each year, in Exact (flag off) none is. */
function play(spec: LifeSpec, mode: 'realistic' | 'exact'): { json: string; tally: Tally; g: GameState } {
  const tally: Tally = { years: 0, profiles: 0, staffSheets: 0, cockpits: 0, memoryLines: 0, connections: 0 }
  const run = (): { json: string; g: GameState } => {
    const g = spec.make()
    for (let y = 0; y < spec.years && g.character.alive; y++) {
      spec.between(g)
      const onYear = mode === 'realistic' ? (gg: GameState, n: number): void => (n === 1 ? walkYear(gg, y + 1, tally) : undefined) : undefined
      playLife({ seed: spec.seed + y, birthYear: 1986, from: g, untilAge: g.character.age + 1, ...(onYear ? { onYear } : {}) })
    }
    return { json: JSON.stringify(g), g }
  }
  const out = mode === 'realistic' ? real(run) : v520(run)
  return { ...out, tally }
}

describe('(e) three lives of up to 40 years in Realistic, every profile, staff sheet and cockpit walked each year', () => {
  const played = new Map<string, { json: string; tally: Tally; age: number }>()
  for (const spec of LIVES) {
    it(`${spec.name}`, () => {
      const r = play(spec, 'realistic')
      played.set(spec.name, { json: r.json, tally: r.tally, age: r.g.character.age })
      // a character can die: the life stops there, and the walk ran every year it was lived
      expect(r.tally.years, 'years walked').toBeGreaterThanOrEqual(15)
      expect(r.tally.profiles, 'profiles read').toBeGreaterThan(60)
      expect(r.tally.cockpits).toBe(r.tally.years)
    }, TIMEOUT)
  }

  it('walked the years of all three, the staff sheets of the lives that have a company, and the memory lines of the stamped one', () => {
    const [founder, firm, stamped] = LIVES.map((s) => played.get(s.name)!)
    expect(founder!.tally.years + firm!.tally.years + stamped!.tally.years, 'years walked in all').toBeGreaterThanOrEqual(80)
    expect(founder!.tally.staffSheets, 'staff sheets walked in the founder life').toBeGreaterThan(30)
    expect(firm!.tally.staffSheets, 'staff sheets walked in the firm life').toBeGreaterThan(20)
    expect(stamped!.tally.profiles).toBeGreaterThan(100)
    expect(stamped!.tally.memoryLines, 'memory lines on the stamped life').toBeGreaterThan(20)
    expect(founder!.tally.memoryLines + firm!.tally.memoryLines, 'an unstamped life remembers nothing').toBe(0)
  })

  describe('(f) the same lives in Exact, with the flag off and nothing walked, end with the same JSON', () => {
    for (const spec of LIVES) {
      it(`${spec.name}`, () => {
        const walked = played.get(spec.name)
        expect(walked, 'the Realistic life ran first').toBeDefined()
        const exactLife = play(spec, 'exact')
        expect(exactLife.g.character.age, 'the same age at the end').toBe(walked!.age)
        expect(exactLife.json === walked!.json).toBe(true)
      }, TIMEOUT)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (g) old saves and hostile records

const FIXTURES = readdirSync(FIXTURE_DIR)
  .filter((name) => /^save-.*\.json\.gz$/.test(name))
  .sort()
const fixtureRaw = (name: string): Record<string, unknown> => JSON.parse(gunzipSync(readFileSync(join(FIXTURE_DIR, name))).toString()) as Record<string, unknown>
function loaded(name: string): GameState {
  const r = migrateSave(fixtureRaw(name))
  if (r.kind !== 'ready') throw new Error(`${name} did not load: ${r.kind}`)
  return r.game
}

describe('(g) old saves', () => {
  it('finds the fixtures, the v4.0.2 one and the 22-exes life among them', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(7)
    expect(FIXTURES).toContain('save-v4.0.2.json.gz')
    expect(FIXTURES).toContain('save-v5.2.0-social.json.gz')
  })

  describe.each(FIXTURES)('%s', (name) => {
    it('renders every profile in Realistic, stamped or not, and every staff sheet, bounded and without a hole', () => {
      const g = loaded(name)
      const json = JSON.stringify(g)
      real(() => {
        let profiles = 0
        for (const p of g.people) {
          const living = p.alive === true && p.relation !== 'pet'
          const m = markup(g, p)
          expect(m, `${p.firstName}`).not.toMatch(BAD)
          expect(personFacts(g, p) !== null, `${p.firstName}`).toBe(living)
          if (living) {
            profiles++
            expect(count(m, /class="statbar"/g), `${p.firstName}: one bar`).toBe(1)
            expect(m).not.toMatch(/statbar-small/)
            expect(connectionsOf(g, p).length).toBeLessThanOrEqual(PEOPLE_CAPS.connections)
            expect(memoryLines(g, p).length).toBeLessThanOrEqual(PEOPLE_CAPS.memories)
            if (!socialOn(g)) expect(memoryLines(g, p)).toEqual([])
            for (const t of newRows(g, p)) {
              expect(t).not.toMatch(BAD)
              expect(t).not.toMatch(LONG_DASH)
            }
            // a person can be bought: the group is there and offers the investigator
            const look = personActions(g, p).find((n) => n.id === 'look.person')
            expect(look, `${p.firstName}: a Look closer group`).toBeDefined()
          }
        }
        expect(profiles, 'living people in the save').toBeGreaterThan(0)
        for (const s of [...companyScreens(g)]) expect(s).not.toMatch(BAD)
        expect(cockpitOf('relationships', g).tiles.length).toBeLessThanOrEqual(4)
        // and on a frozen copy
        const copy = deepFreeze(structuredClone(g))
        peopleScreens(copy)
        companyScreens(copy)
      })
      expect(JSON.stringify(g)).toBe(json)
    }, TIMEOUT)
  })

  it('the peopleProfile flag applies to a life the social flag never stamped (X8): a profile on every old save without the stamp', () => {
    const unstamped = FIXTURES.filter((n) => !socialOn(loaded(n)))
    expect(unstamped.length, 'unstamped fixtures').toBeGreaterThanOrEqual(5)
    const g = loaded('save-v5.2.0-social.json.gz')
    expect(socialOn(g)).toBe(false)
    const exes = g.people.filter((p) => p.relation === 'ex')
    expect(exes.length, 'the 22 exes of E1').toBeGreaterThanOrEqual(20)
    real(() => {
      for (const p of exes.filter((x) => x.alive)) expect(personFacts(g, p), p.firstName).not.toBeNull()
    })
  })
})

describe('(g) hostile records', () => {
  /** A living friend with every field given. */
  const friend = (over: Partial<Person> = {}): Person => ({
    id: 'p1', firstName: 'Dana', lastName: 'Reed', gender: 'female', age: 31, alive: true, relation: 'friend', relationship: 50,
    stats: { happiness: 60, health: 70, smarts: 55, looks: 65 }, money: 40_000, occupation: 'Nurse', traits: ['kind', 'proud'], yearsKnown: 3,
    livesWithPlayer: false, notes: [], data: { countryId: 'us' }, ...over,
  })

  it('500 know rows of people who are gone load bounded, render, and the yearly step forgets them 12 at a time and twice is once', () => {
    const { g, kit } = uiLife(70)
    const k: Record<string, string> = {}
    for (let i = 0; i < 500; i++) k[`ppl:gone${String(i).padStart(3, '0')}:smarts`] = `55|200|${g.year}|investigator`
    k[pplKey(kitPerson(kit, 'friend'), 'smarts')!] = `55|200|${g.year}|investigator`
    g.flags.know = { v: 1, o: ownerOf(g), k }
    real(() => {
      expect(Object.keys(readKnow(g)?.k ?? {}).length, 'rows the record reads').toBeLessThanOrEqual(KNOW_LIMITS.keys)
      for (const p of g.people) expect(plain(markup(g, p))).not.toMatch(BAD)
      expect(personFacts(g, kitPerson(kit, 'friend'))).not.toBeNull()
    })
    let rows = Object.keys(readKnow(g)?.k ?? {}).length
    for (let step = 0; step < 40; step++) {
      yearlyKnowledge(g)
      const now = Object.keys(readKnow(g)?.k ?? {}).length
      expect(rows - now, `step ${step}: forgotten`).toBeLessThanOrEqual(PEOPLE_CAPS.forgetPerStep)
      const json = JSON.stringify(g)
      yearlyKnowledge(g)
      expect(JSON.stringify(g), `step ${step}: twice is once`).toBe(json)
      rows = now
      g.year += 1
      for (const [key, row] of Object.entries(((g.flags.know as { k: Record<string, string> } | undefined)?.k) ?? {})) {
        // a row stamped before the clock moved is still a row
        void key
        void row
      }
    }
    expect(Object.keys(readKnow(g)?.k ?? {}).filter((key) => key.startsWith('ppl:gone')), 'gone people are forgotten').toEqual([])
  }, TIMEOUT)

  it('garbage persons the loader lets through: ids with spaces, stats far out of range, 500 traits and notes, a data of 1,500 keys, names with markup', () => {
    const long = (n: number): string => 'x'.repeat(n)
    const bad: Person[] = [
      friend({ id: 'p 1', stats: { happiness: -5, health: 1e300, smarts: 101.5, looks: -1e300 } }),
      friend({ id: 'p2', traits: Array.from({ length: 500 }, (_, i) => `t${i}`.padEnd(200, 'z')), notes: Array.from({ length: 500 }, (_, i) => `note ${i} ${long(300)}`) }),
      friend({ id: 'p3', firstName: '', lastName: '', occupation: '' }),
      friend({ id: 'p4', firstName: '<b>Dana</b>\n\t"quoted"', lastName: long(500), occupation: long(500) }),
      friend({ id: long(60), relationship: 1e300, yearsKnown: -1 }),
      friend({ id: 'p6', money: -1e15, age: 1e300, yearsKnown: 1e300, livesWithPlayer: true }),
      friend({ id: 'p7', data: { countryId: 'zz', kids: 'many', spouseName: 7, married: true, kin: long(500), ...Object.fromEntries(Array.from({ length: 1500 }, (_, i) => [`k${i}`, i % 2 === 0 ? i : { deep: [i] }])) } }),
      friend({ id: 'p8', relation: 'sibling', data: { married: true, spouseName: 'A'.repeat(300), kids: 1e9, exSpouseId: 'p1', w: { owes: 1e300 }, wl: { cut: true, estr: true, estrY: 3000 } } }),
      friend({ id: '__proto__', data: { generosity: 1e300, kindness: -3, loyalty: 50, popularity: 51, craziness: 52, willpower: 53, petulance: 54, diligence: 55 } }),
    ]
    const { g } = uiLife(70)
    g.people.push(...bad)
    // the loader accepts all of them once the game is saved and read back (createPerson keeps keys that are undefined): what a hand-edited save could hold
    expect(isLoadableGame(JSON.parse(JSON.stringify(g)))).toBe(true)
    real(() => {
      for (const p of bad) {
        const m = plain(markup(g, p))
        expect(m, p.id).not.toMatch(BAD)
        const f = personFacts(g, p)
        expect(f, p.id).not.toBeNull()
        for (const r of f!.rows) expect(r.text.length, `${p.id}: ${r.id}`).toBeLessThanOrEqual(120)
        expect(f!.rows.filter((r) => r.id.startsWith('personality.') && r.state === 'estimate').length, p.id).toBeLessThanOrEqual(PEOPLE_CAPS.personality)
        expect(connectionsOf(g, p).length, p.id).toBeLessThanOrEqual(PEOPLE_CAPS.connections)
        expect(memoryLines(g, p).length, p.id).toBeLessThanOrEqual(PEOPLE_CAPS.memories)
        expect(lookKeysOf(g, p).length, p.id).toBeLessThanOrEqual(PEOPLE_CAPS.lookKeys)
        expect(() => walk(g, personActions(g, p)), p.id).not.toThrow()
        for (const t of newRows(g, p)) {
          expect(t, p.id).not.toMatch(BAD)
          expect(t, p.id).not.toMatch(LONG_DASH)
        }
      }
      expect(() => peopleScreens(g)).not.toThrow()
      const json = JSON.stringify(g)
      const copy = deepFreeze(structuredClone(g))
      expect(() => peopleScreens(copy)).not.toThrow()
      expect(JSON.stringify(copy)).toBe(json)
    })
    // a person with a space in the id has no key, so nobody can buy a read of them, and a 60-character id has none either
    expect(pplKey(bad[0]!, 'smarts')).toBeNull()
    expect(pplKey(bad[4]!, 'smarts')).toBeNull()
    expect(personKey(bad[1]!)).toBe('p2')
  }, TIMEOUT)

  it('records beyond what the loader lets through: the pure readers still never throw and never print the number', () => {
    const rows: Person[] = [
      friend({ id: 'q1', stats: { happiness: NaN, health: Infinity, smarts: -Infinity, looks: NaN } }),
      friend({ id: 'q2', data: null as never }),
      friend({ id: 'q3', data: [] as never }),
      friend({ id: 'q4', firstName: 42 as never, lastName: undefined as never }),
      friend({ id: 'q5', relationship: NaN, yearsKnown: NaN, money: NaN, age: NaN }),
      friend({ id: 'q6', traits: 'kind' as never, notes: 5 as never }),
      friend({ id: 'q7', stats: { happiness: '60' as never, health: null as never, smarts: [] as never, looks: {} as never } }),
      friend({ id: 'q8', data: { countryId: {} as never, kids: NaN, kin: 5 as never, married: 'yes' as never } }),
      friend({ id: '', stats: null as never }),
    ]
    const g = structuredClone(uiLife(70).g)
    g.people.push(...rows)
    real(() => {
      for (const p of rows) {
        expect(() => personFacts(g, p), p.id).not.toThrow()
        expect(() => connectionsOf(g, p), p.id).not.toThrow()
        expect(() => memoryLines(g, p), p.id).not.toThrow()
        expect(() => lookKeysOf(g, p), p.id).not.toThrow()
        expect(() => usesProfile(p), p.id).not.toThrow()
        expect(connectionsOf(g, p).length, p.id).toBeLessThanOrEqual(PEOPLE_CAPS.connections)
        for (const t of [...(personFacts(g, p)?.rows ?? []).flatMap((r) => [r.text, r.how ?? '']), ...connectionsOf(g, p).map((r) => r.text)]) expect(t, p.id).not.toMatch(BAD)
      }
    })
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (h) docs

describe('(h) docs/FOG.md names the rules of the track', () => {
  const doc = (): string => readFileSync(join(DOCS, 'FOG.md'), 'utf8')

  it('has the screens of the track in its table, with their keys and files', () => {
    const text = doc()
    for (const row of ['person profile', 'Hired staff', 'CEO', 'People cockpit']) expect(text.toLowerCase(), row).toContain(row.toLowerCase())
    for (const family of ['ppl:', 'stf:']) expect(text, family).toContain(`\`${family}`)
    for (const file of ['people-fog.ts', 'leader-fog.ts', 'hubs/people-facts.ts', 'hubs/people-web.ts', 'hubs/people-memory.ts', 'PersonProfile.tsx']) expect(text, file).toContain(file)
  })

  it('names the flag, the exposure rule, the close rule, the trait reveal and the caps', () => {
    const text = doc()
    for (const word of ['peopleProfile', 'exposureOf', 'isClose', 'PEOPLE_CAPS', 'usesProfile', 'Private', 'Look closer', 'Left for later']) expect(text, word).toContain(word)
    expect(text).toMatch(/exposure[^.]*years|years[^.]*exposure/i)
    expect(text).toMatch(/relationship 35/)
    expect(text).toMatch(/first (?:trait )?word/i)
    expect(text).toMatch(/personality[^.]*\b6\b|\b6\b[^.]*personality/i)
  })

  it('has the sd0 classes of the four new reads and says who owns ppl and stf', () => {
    const text = doc()
    for (const row of [/A face[^\n]*\.12/, /A mood[^\n]*\.28/, /A mind[^\n]*\.32/, /A character[^\n]*\.45/]) expect(text).toMatch(row)
    expect(text).toMatch(/`ppl`[^\n]*people-fog\.ts/)
    expect(text).toMatch(/`stf`[^\n]*leader-fog\.ts/)
  })

  it('moves people sheets out of "Left for later" and lists the dating and adoption candidates there', () => {
    const text = doc()
    const later = text.slice(text.indexOf('Left for later'), text.indexOf('## The market rule'))
    expect(later).not.toMatch(/people sheets/i)
    expect(later.toLowerCase()).toContain('dating')
    expect(later.toLowerCase()).toContain('adoption')
    // the older items stay (test/fog-acceptance.test.ts holds them)
    for (const left of ['Annual Report', 'net worth', 'segments', 'optimiser']) expect(later.toLowerCase(), left).toContain(left.toLowerCase())
  })

  it('records how the Palette orders the Look closer entries and lists the new guards', () => {
    const text = doc()
    expect(text).toMatch(/Palette/)
    expect(text).toMatch(/Look closer[^\n]*(?:same order|people list|list order)/i)
    for (const file of ['test/people-ui-acceptance.test.ts', 'test/people-ui-golden.test.ts', 'test/fog-staff.test.ts', 'test/fog-leader.test.ts', 'test/person-facts-ui.test.ts']) expect(text, file).toContain(file)
  })

  it('has no en-dash or em-dash, and none of the files of the track carries one', () => {
    expect(doc()).not.toMatch(LONG_DASH)
    for (const f of ['src/game/people-fog.ts', 'src/game/business/leader-fog.ts', 'src/game/hubs/people-facts.ts', 'src/game/hubs/people-web.ts', 'src/game/hubs/people-memory.ts', 'src/ui/components/PersonProfile.tsx', 'src/ui/components/FactRow.tsx']) {
      expect(existsSync(join(ROOT, f)), f).toBe(true)
      expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(LONG_DASH)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (j) the money team: claimed versus true

describe('(j) advisors: claimed versus true (H.5, no edit to advisors/)', () => {
  /** A client whose manager offers include a crook whose claimed rating is a different word from the true one, with a book to manage. */
  const crookLife = (): { g: GameState; slot: number } => {
    for (let seed = 1; seed < 600; seed++) {
      const g = client(seed)
      const o = offersFor(g, 'manager').find((x) => !x.honest && ratingLabel(x.claimed) !== ratingLabel(x.skill))
      if (o) {
        own(g, 'index', 3_000_000)
        return { g, slot: o.slot }
      }
    }
    throw new Error('no client with a crooked manager offer in 600 seeds')
  }
  /** The rows that print a hire's rating: the offers, the hired advisor and manager, and the advisor's vet lines. */
  const ratingTexts = (g: GameState): string[] =>
    walk(g, moneyTeamMenu.children(g))
      .filter((n) => /^team-(?:hire-|advisor$|manager$|vet-)/.test(n.id))
      .flatMap((n) => (n.type === 'info' ? [textOf(g, n)] : n.type === 'action' || n.type === 'menu' ? [n.label, typeof n.subtitle === 'function' ? n.subtitle(g) : (n.subtitle ?? ''), n.type === 'action' ? (n.confirm?.(g) ?? '') : ''] : []))
  /** A money amount and a percent are numbers of the deal and not of the person. */
  const noDeal = (t: string): string => t.replace(/\$[\d,.]+[A-Za-z]*/g, '').replace(/[\d.]+%/g, '')

  it('a crooked manager claims more than the truth, and the hire keeps both', () => {
    const { g, slot } = crookLife()
    const offer = offersFor(g, 'manager').find((o) => o.slot === slot)!
    expect(offer.honest).toBe(false)
    expect(offer.claimed).toBeGreaterThan(offer.skill)
    expect(hire(g, 'manager', slot)).toBe(true)
    const m = readTeam(g)!.manager as ManagerHire
    expect(m.honest).toBe(false)
    expect(m.claimed).toBe(offer.claimed)
    expect(m.skill).toBe(offer.skill)
    expect(m.claimed).toBeGreaterThan(m.skill)
  }, TIMEOUT)

  it('the advisor screens print the rating as a word and no skill number, in Realistic and in Exact, and say the claimed word', () => {
    const { g, slot } = crookLife()
    const offer = offersFor(g, 'manager').find((o) => o.slot === slot)!
    for (const [name, wrap] of [['Realistic', real], ['Exact', exact], ['v5.2.0', v520]] as const) {
      wrap(() => {
        const texts = ratingTexts(g)
        expect(texts.length, name).toBeGreaterThanOrEqual(6)
        for (const t of texts) expect(noDeal(t), `${name}: ${t}`).not.toMatch(/\d/)
        // the crook's row says the claimed word and cannot say the true one
        const row = texts.join('\n')
        expect(row, name).toContain(`${ratingLabel(offer.claimed)} \u00B7 `)
        expect(ratingTexts(g), `${name}: twice`).toEqual(texts)
      })
    }
    expect(hire(g, 'manager', slot)).toBe(true)
    real(() => {
      const hired = ratingTexts(g).join('\n')
      expect(hired).toContain(`${offer.name}, ${ratingLabel(offer.claimed)}.`)
      expect(hired).not.toContain(`${offer.name}, ${ratingLabel(offer.skill)}.`)
      for (const t of ratingTexts(g)) expect(noDeal(t), t).not.toMatch(/\d/)
    })
  }, TIMEOUT)

  it('a hired advisor vets the offers: the true word and a red flag for the crook, still no number', () => {
    const { g, slot } = crookLife()
    // an advisor who always checks (his skill is the chance)
    withTeam(g, { advisor: { name: 'Pat Hale', skill: 100, since: g.year - 1 } })
    const offer = offersFor(g, 'manager').find((o) => o.slot === slot)!
    real(() => {
      const lines = walk(g, moneyTeamMenu.children(g)).filter((n) => n.id === `team-vet-${slot}`)
      expect(lines).toHaveLength(1)
      const line = textOf(g, lines[0]!)
      expect(line).toContain(`rates them ${ratingLabel(offer.skill)}.`)
      expect(line).toContain('Red flag')
      expect(noDeal(line)).not.toMatch(/\d/)
    })
  }, TIMEOUT)
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (k) the money scan

/** The money and luck findings of one file: the forbidden names, a write of .money or .cash, ['money'], Object.assign( on anything and Math.random. */
const MONEY_NAMES: ReadonlySet<string> = new Set(['personPurse', 'bookMint', 'bookBurn', 'earnIncome', 'spend', 'addMoney'])
const WRITE_OPS: ReadonlySet<string> = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '??=', '||=', '&&=', '<<=', '>>=', '>>>=', '&=', '|=', '^='])

/** The index of the first identifier of the member chain that ends at toks[i] (`a.b?.c[d].e` walked back), so a prefix `++` or `--` can be seen. */
function chainStart(toks: readonly Tok[], i: number): number {
  let j = i
  for (;;) {
    if (!isPunct(toks[j - 1], '.') && !isPunct(toks[j - 1], '?.')) return j
    let k = j - 2
    while (isPunct(toks[k], ']') || isPunct(toks[k], ')')) {
      const close = toks[k]!.v
      const open = close === ']' ? '[' : '('
      let depth = 0
      for (; k >= 0; k--) {
        if (isPunct(toks[k], close)) depth++
        else if (isPunct(toks[k], open) && --depth === 0) break
      }
      k -= 1
    }
    if (k < 0 || toks[k]!.k !== K_ID) return j
    j = k
  }
}

function moneyFindings(src: SourceFile): string[] {
  const out: string[] = []
  const { toks, text } = src
  const at = (t: Tok, rule: string): void => void out.push(`${lineOf(text, t.p)}: ${rule}`)
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    const member = isPunct(toks[i - 1], '.') || isPunct(toks[i - 1], '?.')
    if (t.k === K_ID) {
      const next = toks[i + 1]
      if ((t.v === 'money' || t.v === 'cash') && member && next !== undefined && next.k === K_PUNCT && (WRITE_OPS.has(next.v) || next.v === '++' || next.v === '--')) at(t, `.${t.v} ${next.v}`)
      else if ((t.v === 'money' || t.v === 'cash') && member && (isPunct(toks[chainStart(toks, i) - 1], '++') || isPunct(toks[chainStart(toks, i) - 1], '--'))) at(t, `${toks[chainStart(toks, i) - 1]!.v} .${t.v}`)
      else if (MONEY_NAMES.has(t.v) && !member) at(t, t.v)
      else if (t.v === 'Math' && isPunct(next, '.') && isId(toks[i + 2], 'random')) at(t, 'Math.random')
      else if (t.v === 'Object' && isPunct(next, '.') && isId(toks[i + 2], 'assign') && isPunct(toks[i + 3], '(')) {
        const close = closeParen(toks, i + 3)
        const first = close < 0 ? undefined : splitArgs(toks, i + 3, close)[0]
        // a patch the file made itself (`const out = {}`) is no person
        const local = first !== undefined && first.length === 1 && first[0]!.k === K_ID && new RegExp(`(?:const|let)\\s+${first[0]!.v}\\s*(?::[^=]+)?=\\s*\\{\\s*\\}`).test(text)
        if (!local) at(t, 'Object.assign(')
      }
    } else if (t.k === K_STR && (t.v === 'money' || t.v === 'cash') && isPunct(toks[i - 1], '[') && isPunct(toks[i + 1], ']')) at(t, `['${t.v}']`)
  }
  return out
}

describe('(k) the money scan (X50)', () => {
  const inTrack = (path: string): boolean => path === 'src/game/people-fog.ts' || path === 'src/game/business/leader-fog.ts' || /^src\/game\/hubs\/people-[a-z0-9-]+\.ts$/.test(path)
  const scan = (code: string): string[] => moneyFindings(toSource('src/game/hubs/people-x.ts', code)).map((f) => f.replace(/^\d+: /, ''))

  it('finds no purse, mint, burn, income, spend, addMoney, write of .money or .cash, Object.assign on a person or Math.random in the files of the track', () => {
    const files = loadSources().filter((s) => inTrack(s.path))
    const paths = files.map((s) => s.path)
    expect(paths.length, 'files scanned').toBeGreaterThanOrEqual(5)
    for (const must of ['src/game/people-fog.ts', 'src/game/business/leader-fog.ts', 'src/game/hubs/people-facts.ts', 'src/game/hubs/people-web.ts', 'src/game/hubs/people-memory.ts']) expect(paths, must).toContain(must)
    for (const s of files) expect(s.toks.length, `${s.path} lexed to nothing`).toBeGreaterThan(50)
    expect(files.flatMap((s) => moneyFindings(s).map((f) => `${s.path}:${f}`))).toEqual([])
  }, TIMEOUT)

  it('has teeth: each forbidden shape is a finding and the shapes that look alike are not', () => {
    expect(scan('p.money = 5')).toEqual(['.money ='])
    expect(scan('p.money += 5')).toEqual(['.money +='])
    expect(scan('b.cash -= x')).toEqual(['.cash -='])
    expect(scan('p.money++')).toEqual(['.money ++'])
    expect(scan('--p.money')).toEqual(['-- .money'])
    expect(scan("p['money'] = 5")).toEqual(["['money']"])
    expect(scan('personPurse(p).add(5)')).toEqual(['personPurse'])
    for (const name of ['bookMint', 'bookBurn', 'earnIncome', 'spend', 'addMoney']) expect(scan(`${name}(g, 5)`)).toEqual([name])
    expect(scan('const u = Math.random()')).toEqual(['Math.random'])
    expect(scan('Object.assign(person, { money: 5 })')).toEqual(['Object.assign('])
    expect(scan('const out: Patch = {}\nObject.assign(out, row)')).toEqual([])
    // reads, comments and strings are not writes
    expect(scan('const m = p.money + q.cash\nif (p.money === 5) return')).toEqual([])
    expect(scan('// p.money = 5, spend(g), Math.random()\nconst s = "bookMint and addMoney"')).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------
// (l) the Palette

describe('(l) the Palette lists one Look closer for every person', () => {
  /** The four roots with only the people tab filled in, so the walk does not index the whole game. */
  const roots = (): IndexRoots => {
    const empty = (id: string): MenuGroup => ({ type: 'menu', id, label: id, emoji: 'x', children: () => [] })
    return { occupation: empty('occupation'), assets: empty('assets'), relationships: peopleMenu, activities: empty('activities') }
  }

  it('indexes one Look closer a living person and none for a pet or the dead, and orders them in the order of the people list', () => {
    const { g, kit } = uiLife(70)
    // more people, so the list is long enough to need the page limit
    for (let i = 0; i < 40; i++) {
      const clone = structuredClone(kit.g.people.find((p) => p.id === kit.ids.friend)!)
      clone.id = `extra${i}`
      clone.firstName = `Extra${String(i).padStart(2, '0')}`
      g.people.push(clone)
    }
    const living = g.people.filter((p) => p.alive && p.relation !== 'pet')
    real(() => {
      const index = buildIndex(g, roots())
      const looks = index.entries.filter((e) => e.id === 'look.person')
      expect(looks.length, 'one Look closer a living person').toBe(living.length)
      expect(new Set(looks.map((e) => e.entity?.id)).size).toBe(looks.length)
      for (const e of looks) expect(e.entity?.kind).toBe('person')
      expect(looks.some((e) => e.entity?.id === kit.ids.pet)).toBe(false)
      expect(looks.some((e) => e.entity?.id === kit.ids.deadParent)).toBe(false)

      // "look closer": every Look closer entry ties on tier, depth and label, so the stable sort keeps the order of the index, which is the
      // order of the people list (the list groups by relation). The Palette shows 30 of them, and a person's name finds the person first.
      const hits = search(index, 'look closer', { pins: [], recents: [] }, 200).filter((h) => h.entry.id === 'look.person')
      expect(hits.length).toBe(looks.length)
      expect(new Set(hits.map((h) => `${h.tier}|${h.entry.depth}|${h.entry.label}`)).size, 'one rank for all of them').toBe(1)
      expect(hits.map((h) => h.entry.entity?.id)).toEqual(looks.map((e) => e.entity?.id))
      expect(search(index, 'look closer', { pins: [], recents: [] }).length, 'the default page').toBeLessThanOrEqual(30)

      // a name: the person's own row comes before their Look closer
      const named = search(index, 'extra07', { pins: [], recents: [] }, 20)
      const own = named.findIndex((h) => h.entry.entity?.id === 'extra7' && h.entry.id === 'person.extra7')
      const look = named.findIndex((h) => h.entry.entity?.id === 'extra7' && h.entry.id === 'look.person')
      expect(own, 'the person is found').toBeGreaterThanOrEqual(0)
      expect(look, 'and their Look closer').toBeGreaterThanOrEqual(0)
      expect(own).toBeLessThan(look)
    })
    // the flag off, or Exact, indexes none
    for (const wrap of [dark, exact, v520]) {
      wrap(() => expect(buildIndex(g, roots()).entries.filter((e) => e.id === 'look.person'), wrap.name).toEqual([]))
    }
  }, TIMEOUT)
})

