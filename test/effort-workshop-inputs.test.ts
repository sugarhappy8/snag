// R3-M9 (C.4): the Workshop gets the engine's inputs.
//
//   weeks      a build takes 3 focus weeks (2 for a genius) and a brainstorm 1, out of the year's pool of 12 that Study Harder, club
//              practice, lessons and tutorials share; three builds and two brainstorms are 11 weeks and a genius's five and two are 12
//   overtime   a build past the pool still runs and is overtime (fatigue at the year's end); at most two builds past the limit, and a
//              burned-out inventor cannot build at all
//   tools      lab access (a university or graduate student 0.4, an owner of a company with a research or deep-tech lab 0.6, the larger)
//              adds at most 5 points to a build's centre and cuts its blow-up chance to 85%; money buys none of it
//   assistant  a hired bench assistant costs one `payroll` flow a year, leaves when it can't be paid, adds at most 3 points and 92%
//   why row    the idea's menu shows the odds line of a build with its labelled terms (lab access, assistant, know-how)
//   purity     every read draws nothing and writes nothing; an old save has no `helper`, a damaged one is dropped, a big one is cut
// No pinned seed: every life is makeTestGame's own.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { goodsMult } from '../src/game/assets'
import { draftLab, saveLab } from '../src/game/business/lab-state'
import { bizOf } from '../src/game/business/state'
import { focusLeft } from '../src/game/effort/focus'
import { effortStrain, fatigueOf, readYou } from '../src/game/effort/persona'
import { flowsOf } from '../src/game/kernel/ledger'
import { assetsMenu } from '../src/game/menus'
import type { GameState, MenuAction, MenuInfo } from '../src/game/types'
import { APPROACHES, BRAINSTORMS, BRAINSTORM_WEEKS, MAX_OVERTIME_BUILDS, brainstorm, brainstormBlock, buildBlock, buildLimit, buildOdds, buildWeeks, buildWhy, buildsLeft, resolveBuild, startBuild } from '../src/game/workshop/build'
import { catalogIdea } from '../src/game/workshop/catalog'
import { HELPER_CENTRE_MAX, WORKSHOP_TOOLS_MAX, buildNumbers } from '../src/game/workshop/effort'
import { HELPER_START_SKILL, HELPER_WAGE, helperBlock, helperWage, hireHelper, releaseHelper, workshopHelpers, workshopTools } from '../src/game/workshop/bench'
import { workshopMenu } from '../src/game/workshop/menu'
import { mutWorkshop, readWorkshop } from '../src/game/workshop/notebook'
import { normalizeWorkshop } from '../src/game/workshop/state'
import { yearlyWorkshop } from '../src/game/workshop/yearly'
import { CEILING_PROBES, probeFailures } from './ceiling-kit'
import { neutralAmbition } from './effort-parity-kit'
import { deepFreeze } from './fuzz-kit'
import { flowTotal } from './ledger-kit'
import { company, give, idea, ideaMenu, inventor, nextYear, walk } from './workshop-fixtures'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
const TOOL = 'pocket-tool'

/** A US inventor of 30 in 2026 at the default actor (ambition 50), with one idea on the bench. */
function bench(opts: { genius?: boolean; money?: number } = {}): GameState {
  const g = inventor({ genius: opts.genius === true, money: opts.money ?? 5_000_000 })
  neutralAmbition(g)
  if (opts.genius === true) {
    g.character.hidden.willpower = 50
    g.character.hidden.discipline = 50
  }
  give(g, TOOL)
  return g
}

function enroll(g: GameState, level: 'university' | 'graduate' | 'high'): void {
  g.character.education.current = { level, school: 'Test U', year: 2, totalYears: 4, grades: 70, data: {} }
}

/** A company the player runs, with a scientist on its research team. */
function labCompany(g: GameState, industry: Parameters<typeof company>[1] = 'manufacturing') {
  const a = company(g, industry)
  const b = bizOf(g, a)
  const st = draftLab(b)
  st.team = [g.year - 1]
  saveLab(b, st)
  return a
}

const build = (g: GameState, id = TOOL) => resolveBuild(g, idea(id), 'cheap')
const mid = (g: GameState, ap: 'safe' | 'bold' | 'cheap' = 'bold', d = 4) => {
  const o = buildOdds(g, readWorkshop(g), catalogIdea(d === 4 ? 'flying-car' : TOOL)!, 0, ap)
  return { centre: (o.low + o.high) / 2, kaboom: o.kaboom }
}
const payroll = (g: GameState) => flowTotal(g, 'payroll', 'person')

describe('focus weeks', () => {
  it('a build takes 3 weeks (a genius 2), a brainstorm 1, and the limit is what the pool holds beside two brainstorms', () => {
    expect(buildWeeks(bench())).toBe(3)
    expect(buildWeeks(bench({ genius: true }))).toBe(2)
    expect(BRAINSTORM_WEEKS).toBe(1)
    expect(BRAINSTORMS).toBe(2)
    expect(buildLimit(bench())).toBe(3)
    expect(buildLimit(bench({ genius: true }))).toBe(5)
    expect(MAX_OVERTIME_BUILDS).toBe(2)
  })

  it('three builds and two brainstorms leave one week and no fatigue; a genius\'s five and two use all twelve', () => {
    const g = bench()
    brainstorm(g)
    brainstorm(g)
    for (let i = 0; i < 3; i++) expect(build(g), `build ${i + 1}`).not.toBeNull()
    expect(focusLeft(g)).toBe(1)
    expect(readYou(g).over).toBe(0)
    expect(effortStrain(g)).toBe(0)
    // The counters count weeks, as every focus key does.
    expect(g.yearActions['workshop.build']).toBe(9)
    expect(g.yearActions['workshop.brainstorm']).toBe(2)

    const h = bench({ genius: true })
    brainstorm(h)
    brainstorm(h)
    for (let i = 0; i < 5; i++) expect(build(h), `genius build ${i + 1}`).not.toBeNull()
    expect(focusLeft(h)).toBe(0)
    expect(readYou(h).over).toBe(0)
  })

  it('the fourth build is allowed and adds fatigue, the fifth too, and the sixth is refused', () => {
    const g = bench()
    brainstorm(g)
    brainstorm(g)
    for (let i = 0; i < 3; i++) build(g)
    expect(buildBlock(g, idea(TOOL))).toBeNull()
    expect(build(g)).not.toBeNull()
    expect(readYou(g).over).toBe(2)
    expect(effortStrain(g)).toBeGreaterThan(0)
    expect(build(g)).not.toBeNull()
    expect(readYou(g).over).toBe(5)
    const money = g.character.money
    const rng = g.rng
    expect(buildBlock(g, idea(TOOL))).toMatch(/out of workshop time/)
    expect(build(g)).toBeNull()
    expect(g.character.money).toBe(money)
    expect(g.rng).toBe(rng)
    expect(g.yearActions['workshop.build']).toBe(15)
  })

  it('the overtime lands as fatigue when the year turns, and the next year starts with a fresh pool', () => {
    const g = bench()
    for (let i = 0; i < 5; i++) build(g)
    expect(readYou(g).over).toBe(3)
    expect(fatigueOf(g)).toBe(0)
    ageUp(g)
    g.queue = []
    expect(fatigueOf(g)).toBeGreaterThan(0)
    expect(readYou(g).over).toBe(0)
    expect(focusLeft(g)).toBe(12)
    expect(buildsLeft(g)).toBe(4)
  })

  it('a genius may build two past the limit too: seven in all, and the eighth is refused', () => {
    const g = bench({ genius: true })
    let made = 0
    while (build(g)) made += 1
    expect(made).toBe(buildLimit(g) + MAX_OVERTIME_BUILDS)
    expect(made).toBe(7)
    expect(buildBlock(g, idea(TOOL))).toMatch(/out of workshop time/)
  })

  it('buildsLeft is what the pool still holds: other focus weeks count, and a new year is a fresh pool', () => {
    const g = bench()
    expect(buildsLeft(g)).toBe(4)
    g.yearActions.study = 3
    expect(buildsLeft(g)).toBe(3)
    g.yearActions['practice:chess'] = 3
    expect(focusLeft(g)).toBe(6)
    expect(buildsLeft(g)).toBe(2)
    g.yearActions.study = 12
    expect(buildsLeft(g)).toBe(0)
    nextYear(g)
    expect(focusLeft(g)).toBe(12)
    expect(buildsLeft(g)).toBe(4)
  })

  it('a spent pool refuses a build before it takes any money, and brainstorms still stop at two', () => {
    const g = bench()
    g.yearActions.study = 22
    expect(buildBlock(g, idea(TOOL))).toMatch(/out of workshop time/)
    const money = g.character.money
    expect(build(g)).toBeNull()
    expect(g.character.money).toBe(money)
    const h = bench()
    brainstorm(h)
    expect(brainstormBlock(h)).toBeNull()
    brainstorm(h)
    expect(brainstormBlock(h)).toMatch(/Two brainstorms a year/)
    expect(brainstorm(h)).toBeNull()
    expect(h.yearActions['workshop.brainstorm']).toBe(2)
  })

  it('a burned-out inventor cannot build, and nothing is spent', () => {
    const g = bench()
    g.flags.household = { owner: `${g.generation}:${g.character.id}`, fatigue: 90 }
    expect(buildBlock(g, idea(TOOL))).toMatch(/burned out/)
    const money = g.character.money
    const rng = g.rng
    expect(build(g)).toBeNull()
    expect(g.character.money).toBe(money)
    expect(g.rng).toBe(rng)
    expect(g.yearActions['workshop.build']).toBeUndefined()
  })

  it('the menu says weeks: the weeks left in the pool and what a build takes, and no builds-left counter', () => {
    const g = bench()
    const row = (gg: GameState) => ideaMenu(gg, TOOL).children(gg).find((n) => n.id === `ws.build.idea.${TOOL}`) as MenuAction
    const subtitle = (gg: GameState): string => {
      const s = row(gg).subtitle
      return typeof s === 'function' ? s(gg) : (s ?? '')
    }
    expect(subtitle(g)).toMatch(/12 of 12 focus weeks left/)
    expect(subtitle(g)).toMatch(/a build takes 3 weeks/)
    expect(subtitle(g)).not.toMatch(/builds left/)
    build(g)
    expect(subtitle(g)).toMatch(/9 of 12 focus weeks left/)
    const brain = workshopMenu.children(g).find((n) => n.id === 'ws.brainstorm') as MenuAction
    const text = typeof brain.subtitle === 'function' ? brain.subtitle(g) : (brain.subtitle ?? '')
    expect(text).toMatch(/2\/2 left/)
    expect(text).toMatch(/1 focus week each/)
  })

  it('an overtime build says so before it starts, in the approach popup', () => {
    const g = bench()
    for (let i = 0; i < 4; i++) build(g)
    g.queue = []
    expect(focusLeft(g)).toBe(0)
    startBuild(g, idea(TOOL))
    const popup = g.queue.at(-1)
    expect(popup?.kind).toBe('choice')
    expect(popup?.kind === 'choice' ? popup.text : '').toMatch(/tire you/)
    // Inside the pool the popup says nothing of it.
    const fresh = bench()
    startBuild(fresh, idea(TOOL))
    const calm = fresh.queue.at(-1)
    expect(calm?.kind === 'choice' ? calm.text : '').not.toMatch(/tire you/)
  })
})

describe('tools', () => {
  it('lab access is 0 for most, 0.4 for a university or graduate student, 0.6 for a lab owner, and the larger of the two', () => {
    const g = bench()
    expect(workshopTools(g)).toBe(0)
    enroll(g, 'high')
    expect(workshopTools(g)).toBe(0)
    enroll(g, 'university')
    expect(workshopTools(g)).toBe(0.4)
    enroll(g, 'graduate')
    expect(workshopTools(g)).toBe(0.4)

    const lab = bench()
    labCompany(lab)
    expect(workshopTools(lab)).toBe(0.6)
    enroll(lab, 'university')
    expect(workshopTools(lab)).toBe(0.6)

    const deep = bench()
    company(deep, 'semiconductor')
    expect(workshopTools(deep)).toBe(0.6)

    const plain = bench()
    company(plain)
    expect(workshopTools(plain)).toBe(0)
  })

  it('a student\'s build beats the same inventor outside school by more than 0 and at most 5 points of quality, with fewer blow-ups', () => {
    const outside = bench()
    const student = bench()
    enroll(student, 'university')
    for (const ap of ['safe', 'bold', 'cheap'] as const) {
      const a = mid(outside, ap)
      const b = mid(student, ap)
      expect(b.centre - a.centre, ap).toBeGreaterThan(0)
      expect(b.centre - a.centre, ap).toBeLessThanOrEqual(WORKSHOP_TOOLS_MAX)
      expect(b.centre - a.centre, ap).toBeCloseTo(WORKSHOP_TOOLS_MAX * 0.4, 6)
      expect(b.kaboom, ap).toBeLessThan(a.kaboom)
      expect(b.kaboom, ap).toBeGreaterThanOrEqual(a.kaboom * 0.85 - 1e-4)
    }
    // A company lab is worth more than a school's.
    const owner = bench()
    labCompany(owner)
    expect(mid(owner).centre).toBeGreaterThan(mid(student).centre)
  })

  it('whatever the inputs, tools add at most 5 points and an assistant at most 3, and blow-ups never fall below 78%', () => {
    const g = bench()
    const def = catalogIdea('flying-car')!
    for (const ap of Object.values(APPROACHES)) {
      for (const scale of [1, 100, 1e9, Infinity]) {
        const base = { skill: 20, smarts: 60, genius: false, builds: 0 }
        const none = buildNumbers(g, base, def, ap)
        const tools = buildNumbers(g, { ...base, tools: scale }, def, ap)
        const both = buildNumbers(g, { ...base, tools: scale, helper: scale }, def, ap)
        const centre = (n: typeof none) => (n.low + n.high) / 2
        expect(centre(tools) - centre(none)).toBeLessThanOrEqual(WORKSHOP_TOOLS_MAX + 1e-9)
        expect(centre(both) - centre(none)).toBeLessThanOrEqual(WORKSHOP_TOOLS_MAX + HELPER_CENTRE_MAX + 1e-9)
        expect(tools.kaboom).toBeGreaterThanOrEqual(none.kaboom * 0.85 - 1e-9)
        expect(both.kaboom).toBeGreaterThanOrEqual(none.kaboom * 0.85 * 0.92 - 1e-9)
      }
      // Hostile numbers read as none.
      const none = buildNumbers(g, { skill: 20, smarts: 60, genius: false, builds: 0 }, def, ap)
      const junk = buildNumbers(g, { skill: 20, smarts: 60, genius: false, builds: 0, tools: Number.NaN, helper: -5 }, def, ap)
      expect(junk.kaboom).toBe(none.kaboom)
      expect(junk.low).toBe(none.low)
    }
  })

  it('money buys none of it: a rich student and a poor one have the same odds and the same lines', () => {
    const poor = bench({ money: 0 })
    const rich = bench({ money: 5_000_000_000 })
    enroll(poor, 'university')
    enroll(rich, 'university')
    const def = catalogIdea('flying-car')!
    expect(buildOdds(poor, readWorkshop(poor), def, 0, 'bold')).toEqual(buildOdds(rich, readWorkshop(rich), def, 0, 'bold'))
    expect(buildWhy(poor, readWorkshop(poor), def, 0, 'bold')).toEqual(buildWhy(rich, readWorkshop(rich), def, 0, 'bold'))
  })

  it('the lines name the tools: a student\'s reasons carry "lab access", an outsider\'s do not', () => {
    const outside = bench()
    const student = bench()
    enroll(student, 'university')
    const def = catalogIdea('flying-car')!
    const lines = (g: GameState) => buildWhy(g, readWorkshop(g), def, 0, 'bold')
    expect(lines(outside).some((r) => r.key === 'tools')).toBe(false)
    const t = lines(student).find((r) => r.key === 'tools')
    expect(t?.label).toBe('lab access')
    expect(t?.pts).toBeGreaterThan(0)
  })

  it('the ambition term is unchanged: 50 and steady add nothing, and a push widens the spread', () => {
    const calm = bench()
    const o = buildOdds(calm, readWorkshop(calm), catalogIdea(TOOL)!, 0, 'safe')
    expect(o.high - o.low).toBe(APPROACHES.safe.spread)
    const push = bench()
    push.character.hidden.willpower = 80
    push.character.hidden.discipline = 80
    const y = readYou(push)
    y.posture = 'push'
    y.effective = 'push'
    push.flags['effort.you'] = { ...y } as never
    const p = buildOdds(push, readWorkshop(push), catalogIdea(TOOL)!, 0, 'safe')
    expect(p.high - p.low).toBeGreaterThan(o.high - o.low)
  })
})

describe('the bench assistant', () => {
  it('costs one payroll flow when hired, at 4000 a year at local prices, and adds a helper', () => {
    const g = bench()
    expect(workshopHelpers(g)).toBe(0)
    expect(helperWage(g)).toBe(Math.round(HELPER_WAGE * goodsMult(g)))
    expect(helperBlock(g)).toBeNull()
    const money = g.character.money
    expect(hireHelper(g)).toBe(true)
    expect(money - g.character.money).toBe(helperWage(g))
    expect(payroll(g)).toBe(-helperWage(g))
    expect(workshopHelpers(g)).toBe(1)
    expect(readWorkshop(g).helper).toEqual({ since: g.year, skill: HELPER_START_SKILL })
    expect(helperBlock(g)).toMatch(/already/)
    expect(hireHelper(g)).toBe(false)
    expect(g.character.money).toBe(money - helperWage(g))
  })

  it('cannot be hired when it cannot be paid, by a child, or from behind bars', () => {
    const broke = bench({ money: 100 })
    expect(helperBlock(broke)).toMatch(/costs/)
    expect(hireHelper(broke)).toBe(false)
    expect(workshopHelpers(broke)).toBe(0)
    expect(broke.character.money).toBe(100)
    const kid = inventor({ age: 12 })
    expect(helperBlock(kid)).toMatch(/18/)
    const cell = bench()
    cell.character.prison = { name: 'State Pen', security: 'medium', crime: 'Theft', sentenceYears: 4, yearsServed: 1, respect: 50, appealed: false, escapeAttempts: 0 }
    expect(hireHelper(cell)).toBe(false)
  })

  it('is paid once a year by the yearly step, however often the step runs, and grows in skill', () => {
    const g = bench()
    hireHelper(g)
    const wage = helperWage(g)
    // The year of the hire is paid already: the step that closes it pays nothing twice.
    yearlyWorkshop(g)
    expect(payroll(g)).toBe(-wage)
    nextYear(g)
    const before = g.character.money
    yearlyWorkshop(g)
    yearlyWorkshop(g)
    expect(before - g.character.money).toBe(helperWage(g))
    expect(payroll(g)).toBe(-helperWage(g))
    expect(readWorkshop(g).helper?.skill).toBe(HELPER_START_SKILL + 3)
    expect(flowsOf(g, g.year).filter((r) => r.reason === 'payroll')).toHaveLength(1)
  })

  it('leaves when it cannot be paid, with a log line, and the year books no payroll', () => {
    const g = bench()
    hireHelper(g)
    nextYear(g)
    g.character.money = 0
    yearlyWorkshop(g)
    expect(readWorkshop(g).helper).toBeUndefined()
    expect(workshopHelpers(g)).toBe(0)
    expect(payroll(g)).toBe(0)
    const lines = g.log.flatMap((y) => y.entries).map((e) => e.text)
    expect(lines.some((t) => /assistant/.test(t))).toBe(true)
    expect(lines.every((t) => t.length <= 90)).toBe(true)
  })

  it('can be let go for nothing, and an heir starts without one', () => {
    const g = bench()
    hireHelper(g)
    const money = g.character.money
    expect(releaseHelper(g)).toBe(true)
    expect(g.character.money).toBe(money)
    expect(readWorkshop(g).helper).toBeUndefined()
    expect(releaseHelper(g)).toBe(false)
    hireHelper(g)
    g.character.id = `${g.character.id}-heir`
    expect(readWorkshop(g).helper).toBeUndefined()
  })

  it('adds at most 3 points of quality and cuts blow-ups to no less than 92%, rising with its skill', () => {
    const none = bench()
    const hired = bench()
    hireHelper(hired)
    const a = mid(none)
    const b = mid(hired)
    const gain = b.centre - a.centre
    expect(gain).toBeGreaterThan(0)
    expect(gain).toBeLessThanOrEqual(HELPER_CENTRE_MAX)
    expect(gain).toBeCloseTo((HELPER_CENTRE_MAX * HELPER_START_SKILL) / 100, 6)
    expect(b.kaboom).toBeLessThan(a.kaboom)
    expect(b.kaboom).toBeGreaterThanOrEqual(a.kaboom * 0.92 - 1e-4)
    const ws = mutWorkshop(hired)
    ws.helper = { since: hired.year, skill: 100 }
    const top = mid(hired)
    expect(top.centre - a.centre).toBeCloseTo(HELPER_CENTRE_MAX, 6)
    expect(top.kaboom).toBeLessThan(b.kaboom)
  })

  it('the lines name the assistant, and the Workshop menu offers the hire and the release', () => {
    const g = bench()
    const def = catalogIdea('flying-car')!
    expect(buildWhy(g, readWorkshop(g), def, 0, 'bold').some((r) => r.label === 'bench assistant')).toBe(false)
    const rows = (gg: GameState) => workshopMenu.children(gg).filter((n) => n.id.startsWith('ws.helper.'))
    expect(rows(g).map((n) => n.id)).toEqual(['ws.helper.hire'])
    const hire = rows(g)[0] as MenuAction
    expect(hire.disabledReason?.(g)).toBeNull()
    hire.run(g)
    expect(readWorkshop(g).helper).toBeDefined()
    expect(rows(g).map((n) => n.id)).toEqual(['ws.helper.release'])
    expect(buildWhy(g, readWorkshop(g), def, 0, 'bold').find((r) => r.key === 'crew')?.label).toBe('bench assistant')
    ;(rows(g)[0] as MenuAction).run(g)
    expect(readWorkshop(g).helper).toBeUndefined()
  })
})

describe('the why row', () => {
  const why = (g: GameState): MenuInfo | undefined =>
    ideaMenu(g, TOOL).children(g).find((n): n is MenuInfo => n.type === 'info' && n.id === `ws.idea.${TOOL}.why.odds`)

  it('sits under the build action and shows the odds of a safe build with its labelled terms', () => {
    const g = bench()
    const ids = ideaMenu(g, TOOL).children(g).map((n) => n.id)
    expect(ids.indexOf(`ws.idea.${TOOL}.why.odds`)).toBe(ids.indexOf(`ws.build.idea.${TOOL}`) + 1)
    const text = String(why(g)?.text)
    expect(text).toMatch(/^Odds \d+%: /)
    expect(text).toMatch(/your skill|hard build/)
    const o = buildOdds(g, readWorkshop(g), catalogIdea(TOOL)!, 0, 'safe')
    expect(Math.abs(Number(/^Odds (\d+)%/.exec(text)?.[1]) - Math.round((1 - o.kaboom) * 100))).toBeLessThanOrEqual(1)
    expect(text.length).toBeLessThanOrEqual(140)
    expect(DASH.test(text)).toBe(false)
  })

  it('names lab access and the assistant when they are in play', () => {
    const g = bench()
    enroll(g, 'university')
    hireHelper(g)
    const gg = bench()
    give(gg, 'flying-car')
    enroll(gg, 'university')
    hireHelper(gg)
    const row = ideaMenu(gg, 'flying-car').children(gg).find((n) => n.id === 'ws.idea.flying-car.why.odds') as MenuInfo
    expect(String(row.text)).toMatch(/lab access|bench assistant/)
  })

  it('is pure: walking the Workshop, a student\'s and an assistant\'s, changes nothing and draws nothing', () => {
    const g = bench({ genius: true })
    give(g, 'flying-car')
    enroll(g, 'university')
    labCompany(g)
    hireHelper(g)
    g.queue = []
    const before = JSON.stringify(g)
    const rng = g.rng
    expect(walk(g, [workshopMenu])).toBeGreaterThan(10)
    walk(g, assetsMenu.children(g))
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(g)).toBe(before)
  })

  it('every read leaves g.rng alone and works on a deep-frozen state', () => {
    const g = bench()
    enroll(g, 'university')
    hireHelper(g)
    const def = catalogIdea('flying-car')!
    const ws = readWorkshop(g)
    const rng = g.rng
    for (const ap of ['safe', 'bold', 'cheap'] as const) {
      buildOdds(g, ws, def, 2, ap)
      buildWhy(g, ws, def, 2, ap)
    }
    workshopTools(g)
    workshopHelpers(g)
    helperBlock(g)
    buildBlock(g, idea(TOOL))
    expect(g.rng).toBe(rng)
    const frozen = deepFreeze(structuredClone(g))
    expect(buildOdds(frozen, readWorkshop(frozen), def, 2, 'bold')).toEqual(buildOdds(g, ws, def, 2, 'bold'))
    expect(workshopTools(frozen)).toBe(workshopTools(g))
    expect(helperBlock(frozen)).toBe(helperBlock(g))
  })
})

describe('saves', () => {
  it('a workshop with no helper reads, stores and round-trips with no `helper` key', () => {
    const g = bench()
    const ws = mutWorkshop(g)
    expect('helper' in ws).toBe(false)
    expect(JSON.stringify(g.flags.workshop)).not.toMatch(/helper/)
    const copy = JSON.parse(JSON.stringify(g)) as GameState
    expect('helper' in readWorkshop(copy)).toBe(false)
    expect(workshopHelpers(copy)).toBe(0)
  })

  it('a hired helper round-trips, and a damaged or oversized one is dropped or cut to its bounds', () => {
    const g = bench()
    hireHelper(g)
    const copy = JSON.parse(JSON.stringify(g)) as GameState
    expect(readWorkshop(copy).helper).toEqual({ since: g.year, skill: HELPER_START_SKILL })
    const raw = JSON.parse(JSON.stringify(g.flags.workshop)) as Record<string, unknown>
    for (const bad of [5, 'x', null, [], {}, { since: 'a', skill: 5 }, { skill: 50 }]) {
      expect('helper' in normalizeWorkshop(g, { ...raw, helper: bad }), JSON.stringify(bad)).toBe(false)
    }
    const big = normalizeWorkshop(g, { ...raw, helper: { since: 1e12, skill: 9999 } }).helper
    expect(big?.skill).toBe(100)
    expect(big?.since).toBeLessThanOrEqual(100_000)
    expect(normalizeWorkshop(g, { ...raw, helper: { since: 2020, skill: -5 } }).helper?.skill).toBe(0)
    expect(normalizeWorkshop(g, { ...raw, helper: { since: 2020, skill: Number.NaN } }).helper?.skill).toBe(HELPER_START_SKILL)
  })
})

describe('ceilings', () => {
  it('the two rows are in the list and hold at 1x and 100x', () => {
    const list = JSON.parse(readFileSync(join(ROOT, 'test', 'ceiling-list.json'), 'utf8')) as { id: string; file: string; token: string }[]
    for (const [id, token, file] of [
      ['workshop-overtime', 'MAX_OVERTIME_BUILDS', 'src/game/workshop/build.ts'],
      ['workshop-tools', 'WORKSHOP_TOOLS_MAX', 'src/game/workshop/effort.ts'],
    ] as const) {
      expect(list.find((c) => c.id === id), id).toEqual(expect.objectContaining({ token, file }))
      const row = CEILING_PROBES.find((p) => p.id === id)
      expect(row, id).toBeDefined()
      expect(probeFailures(row!, [1, 100]), id).toEqual([])
      expect(row!.run(100).value, id).toBeGreaterThan(0)
    }
  }, 60_000)
})

describe('the new files', () => {
  it('have no dash and book money through a reason', () => {
    for (const f of ['src/game/workshop/bench.ts', 'src/game/workshop/effort.ts', 'src/game/workshop/build.ts', 'src/game/workshop/menu.ts']) {
      const text = readFileSync(join(ROOT, f), 'utf8')
      expect(DASH.test(text), f).toBe(false)
    }
    const bench = readFileSync(join(ROOT, 'src/game/workshop/bench.ts'), 'utf8')
    expect(bench).toMatch(/spend\(g, [^,]+, 'payroll'\)/)
    expect(bench).not.toMatch(/\b(rand|randInt|randFloat|chance|pick|shuffle)\(|Math\.random/)
  })
})
