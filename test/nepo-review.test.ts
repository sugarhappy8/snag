// Adversarial review of nepo babies: a randomized fuzz through the real menus and the yearly step,
// plus the bugs it found.
import { describe, expect, it } from 'vitest'
import { ageUp } from '../src/game/aging'
import { nepoNodes, nepoPersonNodes } from '../src/game/business/nepo'
import { readJob } from '../src/game/business/nepo-job'
import { readFamily } from '../src/game/business/nepo-state'
import { bizOf } from '../src/game/business/state'
import { continueAsChild } from '../src/game/life'
import { killCharacter } from '../src/game/death'
import { fire, hireRelative, makeCeo, designateSuccessor, materialize, pseudoId, planHire, rollOutsider, setPay } from '../src/game/business/nepo-actions'
import { outlookFor } from '../src/game/business/nepo-model'
import { yearlyNepoLife } from '../src/game/events/nepo-life'
import { familyYear } from '../src/game/business/nepo-year'
import { createNewLife } from '../src/game/life'
import type { ChoiceModal, NoticeModal } from '../src/game/types'
import { mulberry } from './nepo-fuzz-rng'
import { all, drain, kid, world } from './nepo-kit'
import type { GameState, MenuAction, MenuNode } from '../src/game/types'

function invariants(g: GameState, where: string): void {
  for (const a of g.assets.filter((x) => x.kind === 'business')) {
    const b = bizOf(g, a)
    for (const k of ['cash', 'morale', 'brand', 'quality', 'yearCosts', 'yearIncome', 'debt'] as const) {
      expect(Number.isFinite(b[k]), `${where}: ${a.name}.${k}=${b[k]}`).toBe(true)
    }
    if (b.manager) {
      expect(Number.isFinite(b.manager.salary), `${where} manager salary`).toBe(true)
      expect(Number.isFinite(b.manager.skill), `${where} manager skill`).toBe(true)
    }
    const f = readFamily(b.family)
    expect(f.resent).toBeGreaterThanOrEqual(0)
    expect(f.resent).toBeLessThanOrEqual(100)
  }
  for (const p of g.people) {
    expect(Number.isFinite(p.money), `${where}: ${p.firstName}.money=${p.money}`).toBe(true)
    const j = readJob(p)
    if (j) {
      expect(Number.isFinite(j.pay), `${where} pay`).toBe(true)
      expect(Number.isFinite(j.skill), `${where} skill`).toBe(true)
    }
  }
  const json = JSON.stringify(g)
  expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(JSON.parse(json))))
  expect(json.includes('NaN') || json.includes('undefined')).toBe(false)
}

describe('fuzz through the real menus', () => {
  for (const seed of [501, 502, 503, 504]) {
    it(`seed ${seed}: random menu actions, ages, deaths and heirs keep every invariant`, () => {
      const rnd = mulberry(seed)
      const ran: Record<string, number> = {}
      let w = world(seed, { age: 48, money: 5_000_000, share: seed % 2 ? 1 : 0.6 })
      let g = w.g
      for (let i = 0; i < 4; i++) kid(g, 15 + i * 4, { smarts: 20 + Math.round(rnd() * 70), traits: rnd() < 0.5 ? ['ambitious'] : ['lazy'], entitlement: rnd() < 0.4 ? 70 : 0 })
      kid(g, 40, { relation: 'sibling' })
      kid(g, 44, { relation: 'spouse', gender: 'female' })
      for (let year = 0; year < 45; year++) {
        if (!g.character.alive) {
          const heir = g.people.filter((p) => p.alive && p.relation === 'child' && p.age >= 18).sort((x, y) => y.age - x.age)[0]
          if (!heir) break
          g = continueAsChild(g, heir.id)
          drain(g)
        }
        // A few random menu actions a year.
        for (let k = 0; k < 6; k++) {
          const assets = g.assets.filter((x) => x.kind === 'business')
          const a = assets[Math.floor(rnd() * assets.length)]
          if (!a) break
          const nodes = all(g, nepoNodes(g, a))
          const acts = nodes.filter((n): n is MenuAction => n.type === 'action' && !n.disabledReason?.(g) && (n.visible ? n.visible(g) : true))
          // Sometimes drive from a person sheet instead.
          const pool: MenuAction[] = [...acts]
          if (rnd() < 0.3) {
            const p = g.people[Math.floor(rnd() * g.people.length)]
            if (p) pool.push(...(all(g, nepoPersonNodes(g, p)).filter((n): n is MenuAction => n.type === 'action' && !n.disabledReason?.(g)) as MenuAction[]))
          }
          if (pool.length === 0) continue
          const act = pool[Math.floor(rnd() * pool.length)]
          const input = act.input ? String(Math.round(act.input.min! + rnd() * (act.input.max! - act.input.min!))) : undefined
          act.run(g, input)
          ran[act.id.split('.').slice(-1)[0]] = (ran[act.id.split('.').slice(-1)[0]] ?? 0) + 1
          drain(g, (m) => m.choices[Math.floor(rnd() * m.choices.length)].id)
          invariants(g, `seed ${seed} year ${year} action ${act.id}`)
        }
        ageUp(g)
        drain(g, (m) => m.choices[Math.floor(rnd() * m.choices.length)].id)
        invariants(g, `seed ${seed} year ${year}`)
        expect(g.yearActions['nepo.pop'] ?? 0).toBeLessThanOrEqual(2)
        // The owner dies now and then so heirs inherit a company with a kid in charge.
        if (g.character.alive && rnd() < 0.05) killCharacter(g, 'Heart attack')
      }
      // The fuzz really used the menus: several kinds of action ran.
      expect(Object.keys(ran).length).toBeGreaterThanOrEqual(3)
      void w
    }, 240_000)
  }
})

/** Call every function a menu node has, the way the UI does, and collect what they say. */
function touchAll(g: GameState, nodes: MenuNode[], seen: string[], texts: string[], depth = 0): void {
  for (const n of nodes) {
    if (n.type === 'heading') {
      seen.push(n.id)
      continue
    }
    if (n.type === 'info') {
      seen.push(n.id)
      if (n.visible && !n.visible(g)) continue
      texts.push(typeof n.text === 'function' ? n.text(g) : n.text)
      continue
    }
    seen.push(n.id)
    if (n.visible && !n.visible(g)) continue
    const sub = typeof n.subtitle === 'function' ? n.subtitle(g) : n.subtitle
    texts.push(sub ?? '', n.disabledReason?.(g) ?? '', n.hint?.(g) ?? '')
    if (n.type === 'action') {
      texts.push(n.confirm?.(g) ?? '')
      if (n.input?.kind === 'slider') {
        const { min = 0, max = 100, step = 1 } = n.input
        for (let v = min; v <= max; v += step * 3) texts.push(n.input.preview?.(g, v) ?? '')
        texts.push(n.input.defaultValue?.(g) ?? '')
      }
    } else if (depth < 6) {
      texts.push(n.header?.(g) ?? '')
      touchAll(g, n.children(g), seen, texts, depth + 1)
    }
  }
}

describe('menus are pure and print clean text', () => {
  it('every row, hint, preview and header of a busy company reads clean and changes nothing', () => {
    const { g, a, b } = world(601, { share: 0.45 })
    g.character.talents = ['Business']
    const staff = kid(g, 30, { smarts: 80 })
    const dud = kid(g, 25, { smarts: 15, entitlement: 80 })
    const teen = kid(g, 16)
    kid(g, 41, { relation: 'sibling' })
    kid(g, 44, { relation: 'spouse', gender: 'female' })
    kid(g, 21, { smarts: 70 })
    hireRelative(g, a, b, staff, { rank: 2 }, { quiet: true })
    hireRelative(g, a, b, dud, { rank: 3, kind: 'cushy' }, { quiet: true })
    hireRelative(g, a, b, teen, { rank: 0 }, { quiet: true })
    designateSuccessor(g, a, b, staff, { quiet: true })
    drain(g)
    makeCeo(g, a, b, staff)
    drain(g)
    const snapshot = JSON.stringify(g)
    const rng = g.rng
    const seen: string[] = []
    const texts: string[] = []
    touchAll(g, nepoNodes(g, a), seen, texts)
    for (const p of g.people) touchAll(g, nepoPersonNodes(g, p), seen, texts)
    expect(JSON.stringify(g)).toBe(snapshot)
    expect(g.rng).toBe(rng)
    expect(texts.length).toBeGreaterThan(40)
    for (const t of texts) {
      expect(t).not.toMatch(/undefined|NaN|\[object|null|\$-|Infinity/)
    }
    // Ids are unique inside one screen, so React never sees a duplicate key.
    const company = new Set<string>()
    const ids: string[] = []
    touchAll(g, nepoNodes(g, a), ids, [])
    for (const id of ids) {
      expect(company.has(id), `duplicate id ${id}`).toBe(false)
      company.add(id)
    }
  })
})

describe('bugs found in review', () => {
  it('an in-law is shown the same skill, department and title they get once hired', () => {
    const { g, a, b } = world(611)
    for (let i = 0; i < 12; i++) {
      const o = rollOutsider(g, b, 'cousin', i % 2 ? 'male' : 'female')
      const stand = { id: pseudoId(o), firstName: o.firstName, lastName: o.lastName, gender: o.gender, age: o.age, alive: true, relation: 'coworker', relationship: 65, stats: { happiness: 60, health: 80, smarts: o.smarts, looks: 50 }, money: 0, occupation: 'Unemployed', traits: o.traits, yearsKnown: 0, livesWithPlayer: false, notes: [], data: { kin: o.kin, ...(o.entitlement > 0 ? { entitlement: o.entitlement } : {}) } } as never
      const shown = planHire(g, b, stand, { rank: 1 })
      const shownCushy = planHire(g, b, stand, { rank: 3, kind: 'cushy' })
      const o1 = outlookFor(stand, 1)
      const real = materialize(g, b, o)
      const plan = planHire(g, b, real, { rank: 1 })
      expect(plan.focus).toBe(shown.focus)
      expect(plan.title).toBe(shown.title)
      expect(plan.skill).toBe(shown.skill)
      expect(planHire(g, b, real, { rank: 3, kind: 'cushy' }).title).toBe(shownCushy.title)
      expect(outlookFor(real, 1).fit).toBe(o1.fit)
    }
    void a
  })

  it('a minor on a summer job cannot be put on the full rate with the pay slider', () => {
    const { g, a, b } = world(612)
    const teen = kid(g, 16)
    expect(hireRelative(g, a, b, teen, { rank: 0 }, { quiet: true }).ok).toBe(true)
    const before = readJob(teen)!.pay
    expect(setPay(g, a, bizOf(g, a), teen, 4).ok).toBe(false)
    expect(readJob(teen)!.pay).toBe(before)
  })

  it('firing names the country, not its code', () => {
    const { g, a, b } = world(613)
    const p = kid(g, 25)
    hireRelative(g, a, b, p, { rank: 2 }, { quiet: true })
    g.queue = []
    fire(g, a, bizOf(g, a), p)
    const n = g.queue.find((m): m is NoticeModal => m.kind === 'notice' && m.title === 'Let Go')
    expect(n).toBeDefined()
    expect(n!.text).not.toMatch(/law in [A-Z]{2}\b/)
  })

  it('an arranged internship reads right in every era ("an apprenticeship", "a traineeship", "an internship")', () => {
    for (const [year, word] of [[1935, /an apprenticeship/], [1965, /a traineeship/], [2010, /an internship/]] as const) {
      const g = createNewLife({ seed: 620 + year, year: 1990, countryId: 'us' })
      g.queue = []
      g.year = year
      g.character.age = 50
      g.character.money = 60_000_000
      g.character.hidden.fame = 0
      g.character.job = null
      g.assets = []
      g.people = []
      const p = kid(g, 21)
      let found: ChoiceModal | undefined
      for (let i = 0; i < 400 && !found; i++) {
        g.yearActions = {}
        g.queue = []
        delete p.data.nepoLife
        yearlyNepoLife(g)
        found = g.queue.find((m): m is ChoiceModal => m.kind === 'choice' && m.scriptId === 'nepo.life')
      }
      expect(found, `year ${year}`).toBeDefined()
      expect(found!.text).toMatch(word)
    }
  })

  it('a relative who is disowned leaves the payroll (and the CEO chair) at the next year end', () => {
    const { g, a, b } = world(614)
    const p = kid(g, 30, { smarts: 80 })
    hireRelative(g, a, b, p, { rank: 2 }, { quiet: true })
    makeCeo(g, a, bizOf(g, a), p)
    drain(g)
    p.data.disowned = true
    g.year += 1
    g.yearActions = {}
    familyYear(g)
    drain(g)
    expect(readJob(p)).toBeNull()
    expect(bizOf(g, a).manager?.personId).not.toBe(p.id)
  })
})
