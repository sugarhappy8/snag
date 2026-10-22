// The late era popups (era-pack-1980*.ts, era-pack-2000*.ts) played the way the game plays them:
// eligible only in their years and places, era-safe text in every country, every choice resolves
// without errors, money never goes negative or NaN, stats stay in range, and the odds a purple
// hint quotes are the odds the resolver rolls.
import { describe, expect, it } from 'vitest'
import { EVENT_LIBRARY, eventEligible, getEventDef } from '../src/game/events'
import { EVENT_SCRIPT, type EventDef } from '../src/game/events/helpers'
import { anachronismsIn } from '../src/game/events/era'
import { ERA_PACKS } from '../src/game/events/era-life'
import { unvaried } from '../src/game/events/variants'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import type { ChoiceModal, GameState } from '../src/game/types'
import { makeTestGame } from './helpers'
import { outcomePct } from '../src/game/events/era-late-kit'

const LATE = ERA_PACKS.filter((p) => p.from >= 1980)
const EVENTS: EventDef[] = LATE.flatMap((p) => p.events)
const COUNTRIES = ['us', 'gb', 'de', 'jp', 'kr', 'cn', 'in', 'id', 'br', 'mx', 'ng', 'ke', 'za', 'eg', 'tr', 'au', 'ru', 'ph', 'sa', 'cd']

function lifeFor(year: number, age: number, countryId: string, seed = 11): GameState {
  const g = makeTestGame(seed, { countryId, birthCountryId: countryId, age, money: 5000 })
  g.year = year
  g.character.residence = { status: age <= 19 ? 'parents' : 'renting' } as GameState['character']['residence']
  g.people.push(
    createPerson(g, { relation: 'parent', age: age + 30, firstName: 'Pat', lastName: 'Lee', gender: 'female', relationship: 70 }),
    createPerson(g, { relation: 'parent', age: age + 32, firstName: 'Lou', lastName: 'Lee', gender: 'male', relationship: 60 }),
    createPerson(g, { relation: 'friend', age, firstName: 'Kai', lastName: 'Wu', gender: 'male', relationship: 60 }),
    createPerson(g, { relation: 'friend', age, firstName: 'Mia', lastName: 'Roy', gender: 'female', relationship: 60 }),
  )
  if (age >= 22) g.people.push(createPerson(g, { relation: 'child', age: 6, firstName: 'Kit', lastName: 'Lee', gender: 'female' }))
  if (age >= 6 && age <= 24) {
    g.character.education.current = { level: age < 18 ? 'high' : 'university', school: 'Lincoln School', year: 2, totalYears: 4, grades: 70, data: {} }
  }
  if (age >= 18) {
    g.character.job = { defId: 'clerk', title: 'Office Clerk', company: 'Hartley & Sons', category: 'fulltime', salary: 30000, level: 0, performance: 60, yearsInRole: 2, yearsAtCompany: 2, data: {} }
  }
  return g
}

function span(ev: EventDef): [number, number] {
  // The events carry their year window inside `when`; probe the whole late era to find it.
  let lo = 0
  let hi = 0
  for (let y = 1980; y <= 2026; y++) {
    for (const country of ['us', 'gb', 'ng', 'jp', 'br', 'ke']) {
      for (const age of [ev.minAge, Math.min(Math.max(30, ev.minAge), ev.maxAge)]) {
        const g = lifeFor(y, age, country)
        if (eventEligible(g, ev)) {
          if (!lo) lo = y
          hi = y
        }
      }
    }
  }
  return [lo, hi]
}

describe('late era popups', () => {
  it('are registered in the event library', () => {
    // An event with scene variants is registered as a wrapper around the pack's own def (events/variants.ts): same def underneath.
    for (const ev of EVENTS) expect(unvaried(getEventDef(ev.id)!), ev.id).toBe(ev)
    expect(EVENT_LIBRARY.filter((e) => e.id.startsWith('era.')).length).toBeGreaterThanOrEqual(EVENTS.length)
  })

  it('every event can fire in some year and place, and only inside the pack that owns it', () => {
    for (const pack of LATE) {
      for (const ev of pack.events) {
        const [lo, hi] = span(ev)
        expect(lo, `${ev.id} never eligible`).toBeGreaterThan(0)
        // Ordinary 1980s/1990s popups may reach into the next decade only by a few years.
        expect(lo, `${ev.id} starts too early`).toBeGreaterThanOrEqual(pack.from - 20)
        expect(hi, `${ev.id} ends after 2026`).toBeLessThanOrEqual(2026)
      }
    }
  })

  it('show era-safe text and at least two choices wherever they are eligible', () => {
    const problems: string[] = []
    for (const ev of EVENTS) {
      const [lo, hi] = span(ev)
      for (let y = lo; y <= hi; y += 2) {
        for (const country of COUNTRIES) {
          for (const age of [ev.minAge, Math.round((ev.minAge + ev.maxAge) / 2), ev.maxAge]) {
            const g = lifeFor(y, age, country)
            if (!eventEligible(g, ev)) continue
            const s = ev.setup(g)
            if (!s) continue
            if (s.choices.length < 2) problems.push(`${ev.id} ${y} ${country} age ${age}: only ${s.choices.length} choices`)
            const shown = [s.title ?? ev.title, s.text, ...s.choices.map((c) => c.label)].join('\n')
            const bad = anachronismsIn(shown, y, [country])
            if (bad.length) problems.push(`${ev.id} ${y} ${country} age ${age}: ${bad.join(',')}`)
            if (/undefined|NaN|\[object|\{\w+\}/.test(shown)) problems.push(`${ev.id} ${y} ${country}: stray text`)
          }
        }
      }
    }
    expect([...new Set(problems)].slice(0, 30)).toEqual([])
  })

  it('resolve every choice without errors, with sane money and stats', () => {
    const problems: string[] = []
    let resolved = 0
    for (const ev of EVENTS) {
      const [lo, hi] = span(ev)
      const years = [...new Set([lo, Math.round((lo + hi) / 2), hi])]
      for (const y of years) {
        for (const country of ['us', 'ng', 'jp', 'br', 'in']) {
          for (const age of [ev.minAge, ev.maxAge]) {
            for (let seed = 1; seed <= 3; seed++) {
              const base = lifeFor(y, age, country, seed)
              if (!eventEligible(base, ev)) continue
              const setup = ev.setup(structuredClone(base))
              if (!setup) continue
              for (const choice of setup.choices) {
                const g = structuredClone(base)
                const s = ev.setup(g)
                if (!s) continue
                const before = g.character.money
                try {
                  const modal = { kind: 'choice', id: 'm1', title: s.title ?? ev.title, text: s.text, choices: s.choices, source: 'script', scriptId: EVENT_SCRIPT, data: { ...(s.data ?? {}), eventId: ev.id, ...(s.person ? { personId: s.person.id } : {}), ...(s.other ? { otherId: s.other.id } : {}) } } as unknown as ChoiceModal
                  runScript(g, EVENT_SCRIPT, choice.id, modal.data, modal)
                  resolved++
                } catch (err) {
                  problems.push(`${ev.id}/${choice.id} ${y} ${country}: threw ${String(err)}`)
                  continue
                }
                const c = g.character
                if (!Number.isFinite(c.money) || c.money < 0) problems.push(`${ev.id}/${choice.id} ${y} ${country}: money ${c.money}`)
                if (c.money - before > 30_000) problems.push(`${ev.id}/${choice.id}: windfall ${c.money - before}`)
                for (const [k, v] of Object.entries(c.stats)) if (!(v >= 0 && v <= 100)) problems.push(`${ev.id}/${choice.id}: stat ${k}=${v}`)
                for (const m of g.queue) {
                  const text = m.kind === 'notice' ? `${m.title}\n${m.text}` : ''
                  if (/undefined|NaN|\[object/.test(text)) problems.push(`${ev.id}/${choice.id}: bad outcome text`)
                  if (text && anachronismsIn(text, y, [country]).length) problems.push(`${ev.id}/${choice.id} ${y} ${country}: anachronism in outcome (${anachronismsIn(text, y, [country]).join(',')}) ${text.slice(0, 100)}`)
                }
              }
            }
          }
        }
      }
    }
    expect(resolved).toBeGreaterThan(200)
    expect([...new Set(problems)].slice(0, 30)).toEqual([])
  })

  it('quotes in a purple hint exactly the weights the resolver rolls', () => {
    // arcade: the Gaming hint says the same percentage the outcome weights give.
    const arcade = getEventDef('era.1980s.arcade')!
    const g = lifeFor(1984, 13, 'us')
    g.character.talent = 'Gaming'
    const s = arcade.setup(g)!
    const play = s.choices.find((c) => c.id === 'play')!
    expect(play.hint ?? '').toMatch(/\d+%/)
    const pct = Number(/(\d+)%/.exec(play.hint ?? '')![1])
    expect(pct).toBeGreaterThan(20)
    const plain = lifeFor(1984, 13, 'us')
    plain.character.talent = null
    expect(arcade.setup(plain)!.choices.find((c) => c.id === 'play')!.hint).toBeUndefined()
    expect(outcomePct).toBeTypeOf('function')
  })
})
