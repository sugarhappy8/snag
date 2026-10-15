// The four newer deep-tech trades (fusion, neurotech, drones, carbon removal): nothing they say
// may use a thing that did not exist yet in a year they can say it, and their yearly public
// showcase must be closed until the company has something to show.
import { describe, expect, it } from 'vitest'
import { businessAssetView } from '../src/game/business'
import { MARKETS } from '../src/game/business/competition-data'
import { DEEP_TECH, GRANTS, PLANT_MAX, PROGRAMS } from '../src/game/business/deeptech-data'
import { TOPIC } from '../src/game/business/deeptech-events'
import { SHOWCASE } from '../src/game/business/deeptech-menu'
import { readTech, type TechState } from '../src/game/business/deeptech-state'
import { createBusinessAsset, newBiz } from '../src/game/business/founding'
import { INDUSTRIES } from '../src/game/business/industries'
import { bizOf } from '../src/game/business/state'
import { techOf } from '../src/game/business/deeptech-core'
import type { Industry } from '../src/game/data/markets'
import { ERA_RULES, anachronismsIn } from '../src/game/events/era'
import { createNewLife } from '../src/game/life'
import type { Asset, GameState, Json, MenuAction, MenuNode } from '../src/game/types'
import { COUNTRIES, getCountry } from '../src/game/world'

const NEWER = ['fusion', 'neurotech', 'drones', 'carbonCapture'] as const
type Newer = (typeof NEWER)[number]

/** The country that gets every technology last, so a text that fits there fits everywhere. */
const POOREST = [...COUNTRIES].sort((a, b) => a.wealth - b.wealth)[0].id

/**
 * Nothing in the shared rules is skipped, except one: the drone rule stops everyday life lines
 * from mentioning consumer drones before 2012. A Drone & Air Taxi company is called that from the
 * year it opens (2005), and military drones are older than that, so its own screens may say it.
 * Its product ideas are a different matter: those are renamed (product-ideas-new-trades.test.ts).
 */
function ownWord(ind: Newer, rule: string): boolean {
  return ind === 'drones' && rule === 'drone'
}

/** A lab in every state a program can look at, so each of its messages gets read. */
function labs(ind: Newer): TechState[] {
  const out: TechState[] = []
  const ids = PROGRAMS[ind].map((p) => p.id)
  for (let stage = 0; stage < DEEP_TECH[ind].stages.length; stage++) {
    for (const level of [0, 100]) {
      for (const done of [[] as string[], ids]) {
        for (const plant of [0, 1, PLANT_MAX]) {
          const t = readTech(undefined)
          Object.assign(t, { stage, level, done: [...done], plant, safety: 50 })
          out.push(t)
        }
      }
    }
  }
  return out
}

/** Every line of text a player of this trade can read, each with where it comes from. */
function textsOf(ind: Newer): Map<string, string> {
  const texts = new Map<string, string>()
  const add = (where: string, s: unknown) => {
    if (typeof s === 'string' && s.trim() && !texts.has(s)) texts.set(s, where)
  }
  const d = DEEP_TECH[ind]
  d.stages.forEach((s, i) => (add(`stage ${i} name`, s.name), add(`stage ${i} blurb`, s.blurb)))
  add('founder requirement', d.req.text)
  add('expert', d.expert)
  add('screen label', d.screen.label)
  add('screen header', d.screen.header)
  add('cycle up', d.cycle.up)
  add('cycle down', d.cycle.down)
  add('cycle name', d.cycle.name)
  d.plant.forEach((p) => add('plant', p))
  const def = INDUSTRIES[ind]
  for (const k of ['label', 'blurb', 'unit', 'unitOne', 'site', 'sitePlural'] as const) add(`trade ${k}`, def[k])
  def.roles.forEach((r) => add('key role', r.title))
  def.suffixes.forEach((x) => add('company name suffix', x))
  const m = MARKETS[ind]
  add('market noun', m.noun)
  add('market not yet', m.notYet)
  m.names?.pre.forEach((n) => add('rival name', n))
  m.names?.post.forEach((n) => add('rival name', n))
  add('talk show topic', TOPIC[ind])
  const sc = SHOWCASE[ind]
  for (const k of ['label', 'subtitle', 'early', 'done', 'win', 'lose', 'loseTitle'] as const) add(`showcase ${k}`, sc[k])
  add('showcase status', sc.status(readTech(undefined)))
  for (const gr of GRANTS) {
    if (gr.who !== 'all' && !gr.who.includes(ind)) continue
    add(`grant ${gr.id} name`, gr.name)
    add(`grant ${gr.id} blurb`, gr.blurb)
  }
  const sample = labs(ind)
  for (const p of PROGRAMS[ind]) {
    add(`program ${p.id} blurb`, p.blurb)
    for (const t of sample) {
      add(`program ${p.id} label`, p.label(t))
      add(`program ${p.id} gate`, p.gate(t, 'us'))
    }
    const ctx = (t: TechState) => ({ t, countryId: 'us', year: 2020, roll: () => 0.5, company: 'Acme' })
    for (const t of sample.slice(0, 6)) {
      add(`program ${p.id} win`, p.win(ctx(structuredClone(t))))
      if (p.lose) add(`program ${p.id} lose`, p.lose(ctx(structuredClone(t))))
    }
  }
  return texts
}

describe('new deep-tech trades: nothing they say is from the future', () => {
  it('reads every program, stage, event topic, showcase, grant and rival name in every year they can be shown', () => {
    const bad: string[] = []
    for (const ind of NEWER) {
      const open = MARKETS[ind].from!
      for (const [text, where] of textsOf(ind)) {
        // Only the lines that match some rule can ever be flagged: look at those year by year.
        if (!ERA_RULES.some((r) => r.re.test(text))) continue
        for (let year = open; year <= 2040; year++) {
          for (const country of ['us', POOREST]) {
            const hits = anachronismsIn(text, year, [country]).filter((rule) => !ownWord(ind, rule))
            if (hits.length) bad.push(`${ind} ${year} in ${country} (${where}): ${hits.join(', ')} :: ${text}`)
          }
        }
      }
    }
    // Show one line per text and trade, with the first year it is flagged.
    const firstOnly = new Map<string, string>()
    for (const line of bad) {
      const key = line.slice(line.indexOf('(')).replace(/ in [a-z]+ /, ' ')
      if (!firstOnly.has(key)) firstOnly.set(key, line)
    }
    expect([...firstOnly.values()]).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The showcase

function player(countryId: string, seed: number): GameState {
  const g = createNewLife({ seed, year: 2024, countryId })
  g.queue = []
  const c = g.character
  c.age = 30
  c.money = 5_000_000_000
  c.city = getCountry(countryId).cities[0]
  c.stats.smarts = 95
  c.licenses = ['driver']
  c.talent = null
  c.talents = []
  return g
}

function labCompany(g: GameState, ind: Newer, patch: Partial<TechState> = {}): Asset {
  const c = g.character
  const b = newBiz(g, ind as Industry, c.countryId, c.city, { cash: 100_000_000 })
  const t = readTech(undefined)
  Object.assign(t, { level: 40, ...patch })
  b.tech = JSON.parse(JSON.stringify(t)) as Json
  const a = createBusinessAsset(g, `Test ${ind}`, b, 0)
  g.assets.push(a)
  c.job = { defId: 'business_owner', title: 'Founder & CEO', company: a.name, category: 'special', salary: 0, level: 0, performance: 60, yearsInRole: 0, yearsAtCompany: 0, data: { assetId: a.id, startAge: c.age, roleStartAge: c.age } }
  return a
}

function flat(g: GameState, nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap((n) => (n.type === 'menu' ? [n, ...flat(g, n.children(g))] : [n]))
}

function showcaseRow(g: GameState, a: Asset): MenuAction {
  const row = flat(g, businessAssetView(g, a)).find((n) => n.id === `dt.showcase.${a.id}`)
  if (!row || row.type !== 'action') throw new Error('no showcase row')
  return row
}

describe('new deep-tech trades: the yearly showcase', () => {
  it('is closed with its own “too early” text until the company has something to show', () => {
    for (const ind of NEWER) {
      const sc = SHOWCASE[ind]
      const g = player('us', 5)
      const a = labCompany(g, ind)
      expect(techOf(bizOf(g, a)).stage, ind).toBe(0)
      // A brand-new lab already has a decent tech level. The text still has to be true.
      expect(techOf(bizOf(g, a)).level, ind).toBeGreaterThanOrEqual(20)
      expect(showcaseRow(g, a).disabledReason?.(g), ind).toBe(sc.early)
    }
  })

  it('opens at the first stage that matches its text, and not before', () => {
    // fusion: record plasmas. neurotech: first human implants. drones and carbon removal: the first product.
    const first: Record<Newer, number> = { fusion: 1, neurotech: 2, drones: 1, carbonCapture: 1 }
    for (const ind of NEWER) {
      const g = player('us', 6)
      const a = labCompany(g, ind)
      for (let stage = 0; stage < DEEP_TECH[ind].stages.length; stage++) {
        techOf(bizOf(g, a)).stage = stage
        const reason = showcaseRow(g, a).disabledReason?.(g)
        if (stage < first[ind]) expect(reason, `${ind} stage ${stage}`).toBe(SHOWCASE[ind].early)
        else expect(reason, `${ind} stage ${stage}`).toBeNull()
      }
    }
  })

  it('keeps every outcome under the 120-character cap, with the price on the end, in other currencies too', () => {
    for (const ind of NEWER) {
      const sc = SHOWCASE[ind]
      expect(sc.win.length, `${ind} win`).toBeLessThan(100)
      expect(sc.lose.length, `${ind} lose`).toBeLessThan(100)
      const seen = new Set<string>()
      for (const country of ['us', 'jp', 'ng', 'in']) {
        const g = player(country, 9)
        const a = labCompany(g, ind, { stage: 3 })
        for (let tries = 0; tries < 60 && seen.size < 2; tries++) {
          g.yearActions = {}
          g.queue = []
          const row = showcaseRow(g, a)
          expect(row.disabledReason?.(g), `${ind} ${country}`).toBeNull()
          row.run(g)
          const modal = g.queue.find((m) => m.kind === 'notice')
          expect(modal, `${ind} ${country}`).toBeTruthy()
          if (modal?.kind !== 'notice') continue
          expect(modal.text.length, `${ind} ${country}: ${modal.text}`).toBeLessThanOrEqual(120)
          seen.add(modal.title)
        }
      }
      expect(seen.size, `${ind} showed both a win and a loss`).toBe(2)
    }
  })

  it('does not livestream, stream or tweet anything in the neurotech showcase', () => {
    const sc = SHOWCASE.neurotech
    const all = [sc.label, sc.subtitle, sc.early, sc.done, sc.win, sc.lose].join(' ')
    expect(all).not.toMatch(/livestream|streamer|tweet|commenter/i)
    expect(sc.label).toBe('Demo a Patient on Stage')
    expect(sc.win).toContain('chess master')
    const first = PROGRAMS.neurotech.find((p) => p.id === 'firstHuman')!
    const win = first.win({ t: readTech(undefined), countryId: 'us', year: 2003, roll: () => 0.5, company: 'Acme' })
    expect(win).toContain('moved a cursor using only their thoughts')
    expect(win).not.toMatch(/tweet/i)
  })
})
