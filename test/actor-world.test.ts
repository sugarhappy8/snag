import { describe, expect, it } from 'vitest'
import { AWARD_DEFS, BUDGETS, INDUSTRIES, TYPE_IDS, type IndustryId, type TypeId } from '../src/game/special/actor-data'
import { actorStore, type ActorState, type Proj, type Role } from '../src/game/special/actor-state'
import { ACTOR_SPEC, awardOdds, breakEvenOf, clashOf, grossOf, heat, hotTypes, industryOf, pressure, rankOf, scaleOf, soundShiftYear, starPower, studioYear, trendOf } from '../src/game/special/actor-world'
import { activeField, rosterAt } from '../src/game/special/kit/rivals'
import type { GameState } from '../src/game/types'
import { COUNTRIES, getCountry } from '../src/game/world'
import { deepFreeze } from './fuzz-kit'
import { makeTestGame } from './helpers'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** A deterministic life in `country` in `year`. */
function at(country: string, year: number, seed = 4): GameState {
  const g = makeTestGame(seed, { age: 30, countryId: country })
  g.year = year
  return g
}

const proj = (o: Partial<Proj> = {}): Proj => ({
  id: 'p1',
  title: 'The Last Echo',
  kind: 'film',
  genre: 'Drama',
  type: 'drama',
  role: 'Lead',
  studio: 'Silverline Studios',
  studioId: '',
  industry: 'hollywood',
  budget: 'studio',
  terms: { fee: 1_000_000, points: 0, exclusive: false },
  stage: 'post',
  developed: 0,
  buzz: 0,
  campaign: 0,
  season: 1,
  director: 65,
  costars: [],
  window: 'normal',
  quality: 70,
  since: 2000,
  lastYear: 1999,
  ...o,
})

/** A state with the given reputation and popularity, built through the store (no legacy profile on `g`). */
function actorOf(g: GameState, o: { rep?: number; popularity?: number[]; memory?: ActorState['memory'] } = {}): ActorState {
  const credits = (o.popularity ?? []).map((popularity, i) => ({ id: `c${i}`, title: `Film ${i}`, kind: 'film', role: 'Lead', genre: 'Drama', type: 'drama', industry: 'hollywood', studio: '', year: 1990 + i, age: 25 + i, pay: 1000, quality: 60, popularity, gross: 0, backend: 0, seasons: 1, verdict: 'released', residual: 0, trust: false }))
  return actorStore.read({ v: 1, rep: o.rep ?? 50, credits, memory: o.memory ?? [] }, g)
}

const HOME: Record<IndustryId, string> = { hollywood: 'us', bollywood: 'in', nollywood: 'ng', kdrama: 'kr', hongkong: 'hk', domestic: 'fr' }

describe('actor world', () => {
  it('resolves industry by country and year', () => {
    expect(industryOf(at('us', 1995))).toBe('hollywood')
    for (const c of ['ca', 'gb', 'ie', 'au', 'nz']) expect(industryOf(at(c, 1995))).toBe('hollywood')
    expect(industryOf(at('in', 1950))).toBe('bollywood')
    expect(industryOf(at('pk', 1960))).toBe('bollywood')
    expect(industryOf(at('bd', 1960))).toBe('bollywood')
    expect(industryOf(at('ng', 1980))).toBe('domestic')
    expect(industryOf(at('ng', 1991))).toBe('domestic')
    expect(industryOf(at('ng', 1995))).toBe('nollywood')
    expect(industryOf(at('kr', 1960))).toBe('kdrama')
    expect(industryOf(at('hk', 1955))).toBe('hongkong')
    expect(industryOf(at('fr', 1995))).toBe('domestic')
    // a named industry plays domestic before its film start
    expect(industryOf(at('us', 1905))).toBe('domestic')
    expect(industryOf(at('in', 1912))).toBe('domestic')
    expect(industryOf(at('kr', 1950))).toBe('domestic')
    expect(industryOf(at('hk', 1949))).toBe('domestic')
    // an explicit year wins over g.year
    expect(industryOf(at('ng', 2026), 1980)).toBe('domestic')
    expect(industryOf(at('ng', 1980), 2010)).toBe('nollywood')
  })

  it('scales by industry; domestic is 0.25 x wealth with a floor of 0.05', () => {
    expect(scaleOf(at('us', 1995))).toBe(1)
    expect(scaleOf(at('in', 1995))).toBe(0.3)
    expect(scaleOf(at('ng', 1995))).toBe(0.02)
    expect(scaleOf(at('kr', 1995))).toBe(0.14)
    expect(scaleOf(at('hk', 1995))).toBe(0.16)
    const fr = at('fr', 1995)
    expect(scaleOf(fr)).toBeCloseTo(0.25 * getCountry('fr').wealth, 10)
    // a named industry before its start is domestic, at the home country's wealth
    expect(scaleOf(at('ng', 1980))).toBeCloseTo(Math.max(0.05, 0.25 * getCountry('ng').wealth), 10)
    // an explicit industry reads its own table
    expect(scaleOf(fr, 'hollywood')).toBe(1)
    expect(scaleOf(fr, 'bollywood')).toBe(0.3)
    const named = new Set(Object.values(INDUSTRIES).flatMap((d) => d.countries))
    const poor = COUNTRIES.find((c) => c.wealth <= 0.15 && !named.has(c.id))
    expect(poor).toBeDefined()
    expect(scaleOf(at(poor!.id, 1995))).toBe(0.05)
    for (const c of COUNTRIES) {
      const v = scaleOf(at(c.id, 1995))
      expect(v).toBeGreaterThanOrEqual(0.02)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('follows the heat keyframes', () => {
    expect(heat('hollywood', 1946)).toBeCloseTo(1.2)
    expect(heat('hollywood', 2020)).toBeCloseTo(0.5)
    expect(heat('hollywood', 1960)).toBeCloseTo(0.7)
    expect(heat('hollywood', 1910)).toBeCloseTo(0.3)
    expect(heat('hollywood', 1927)).toBeCloseTo(0.8)
    expect(heat('hollywood', 1977)).toBeCloseTo(0.9)
    expect(heat('hollywood', 2000)).toBeCloseTo(1.2)
    expect(heat('hollywood', 2019)).toBeCloseTo(1.3)
    expect(heat('hollywood', 2023)).toBeCloseTo(1.0)
    expect(heat('hollywood', 1953)).toBeCloseTo(0.95) // linear between 1946 and 1960
    expect(heat('hollywood', 1909)).toBe(0)
    expect(heat('nollywood', 1991)).toBe(0)
    expect(heat('nollywood', 1992)).toBeGreaterThan(0)
    expect(heat('hollywood', 2026)).toBeCloseTo(heat('hollywood', 2060)) // keyframes end in 2026 and hold
    for (let y = 1994; y <= 2019; y++) {
      expect(heat('bollywood', y)).toBeGreaterThanOrEqual(1.3 - 1e-9)
      expect(heat('bollywood', y)).toBeLessThanOrEqual(1.4 + 1e-9)
    }
    expect(heat('hongkong', 1993)).toBeCloseTo(1.5)
    expect(heat('hongkong', 1998)).toBeCloseTo(1)
    for (const [id, def] of Object.entries(INDUSTRIES)) {
      expect(def.heat[def.heat.length - 1][0]).toBe(2026)
      expect(def.heat[0][0]).toBe(def.filmStart)
      expect(heat(id as IndustryId, def.filmStart - 1)).toBe(0)
      for (let y = def.filmStart; y <= 2030; y++) {
        expect(heat(id as IndustryId, y)).toBeGreaterThan(0)
        expect(heat(id as IndustryId, y)).toBeLessThanOrEqual(1.5)
      }
    }
    for (const bad of [NaN, Infinity, -Infinity]) expect(heat('hollywood', bad)).toBe(0)
  })

  it('pins the spec for the rival field', () => {
    expect(ACTOR_SPEC.career).toBe('actor')
    expect(ACTOR_SPEC.edges).toEqual(TYPE_IDS)
    expect([ACTOR_SPEC.peak, ACTOR_SPEC.debutAge, ACTOR_SPEC.length, ACTOR_SPEC.foreignShare]).toEqual([[38, 98], [19, 26], [20, 40], 0.05])
    expect(ACTOR_SPEC.field(1899, 'us')).toBe(0)
    expect(ACTOR_SPEC.field(2000, 'us')).toBe(21) // round(20 x (0.7 + 0.3 x 1.2))
    expect(ACTOR_SPEC.field(2000, 'fr')).toBeGreaterThan(10)
    expect(ACTOR_SPEC.field(1991, 'ng')).toBe(ACTOR_SPEC.field(1991, 'fr')) // domestic until its film start
    for (const [id, c] of Object.entries(HOME)) {
      for (const y of [1850, 1899]) expect(ACTOR_SPEC.field(y, c), `${id} ${y}`).toBe(0)
      for (let y = 1990; y <= 2026; y += 4) {
        const base = INDUSTRIES[industryOf(at(c, y))].field // the industry in play that year
        const f = ACTOR_SPEC.field(y, c)
        expect(f).toBeGreaterThanOrEqual(Math.round(base * 0.7))
        expect(f).toBeLessThanOrEqual(Math.round(base * 1.09))
      }
    }
  })

  it('has 10 to 25 active rivals from 30 years after film start and none before the field exists', () => {
    for (const [id, country] of Object.entries(HOME)) {
      const g = at(country, 2000)
      const def = INDUSTRIES[id as IndustryId]
      // a named industry plays domestic before it starts, so its field begins at the domestic start
      for (let y = 1850; y < 1900; y += 7) expect(rosterAt(g, ACTOR_SPEC, y), `${id} ${y}`).toEqual([])
      for (let y = def.filmStart + 30; y <= 2025; y += 5) {
        const n = rosterAt(g, ACTOR_SPEC, y).length
        expect(n, `${id} ${y}`).toBeGreaterThanOrEqual(10)
        expect(n, `${id} ${y}`).toBeLessThanOrEqual(25)
      }
      // a named industry's roster before its start is the domestic one, built from the same family seed
      if (id !== 'domestic') expect(rosterAt(g, ACTOR_SPEC, def.filmStart - 1).length).toBeGreaterThan(0)
    }
    // the national pool differs from one country to the next
    const us = rosterAt(at('us', 2000), ACTOR_SPEC).map((r) => r.name)
    const fr = rosterAt(at('fr', 2000), ACTOR_SPEC).map((r) => r.name)
    expect(us).not.toEqual(fr)
  })

  it('ranks monotonically in star power and prices the fame, rep, credits and skill mix', () => {
    const g = at('us', 1995)
    g.character.hidden.fame = 40
    g.flags['skill.acting'] = 50
    const mixed = actorOf(g, { rep: 60, popularity: [10, 70, 80, 90] }) // the last three count
    expect(starPower(g, mixed)).toBe(55) // .40 x 40 + .25 x 60 + .20 x 80 + .15 x 50 = 54.5
    expect(starPower(g, actorOf(g))).toBe(Math.round(0.4 * 40 + 0.25 * 50 + 0.15 * 50)) // no credits: popularity counts 0
    let star = -1
    let rank = Infinity
    for (let rep = 0; rep <= 100; rep += 10) {
      const s = actorOf(g, { rep, popularity: [50, 60, 70] })
      const p = starPower(g, s)
      const r = rankOf(g, s)
      expect(p).toBeGreaterThanOrEqual(star)
      expect(r.rank).toBeLessThanOrEqual(rank)
      expect(r.of).toBe(rosterAt(g, ACTOR_SPEC).length + 1)
      expect(r.me).toBe(p)
      star = p
      rank = r.rank
    }
    const hi = starPower({ ...g, character: { ...g.character, hidden: { ...g.character.hidden, fame: 100 } } }, actorOf(g, { rep: 100, popularity: [100, 100, 100] }))
    expect(hi).toBeGreaterThan(80)
    expect(hi).toBeLessThanOrEqual(100)
    expect(starPower(at('us', 1995), actorOf(at('us', 1995), { rep: 0 }))).toBe(0)
    // no field yet: rank 1 of 1
    const early = at('us', 1850)
    expect(rankOf(early, actorOf(early))).toMatchObject({ rank: 1, of: 1 })
  })

  it('keeps casting pressure within 0 to 8, half for supporting (cap 4), none for extras', () => {
    const g = at('us', 1995)
    const roles: Role[] = ['Extra', 'Supporting', 'Lead']
    // a bit of everything: every state and type stays inside the bounds
    for (const fame of [0, 30, 60, 100]) {
      g.character.hidden.fame = fame
      for (const rep of [0, 40, 100]) {
        const s = actorOf(g, { rep })
        for (const t of TYPE_IDS) {
          const [x, sup, lead] = roles.map((role) => pressure(g, s, t, role))
          expect(x).toBe(0)
          expect(sup).toBeGreaterThanOrEqual(0)
          expect(sup).toBeLessThanOrEqual(4)
          expect(lead).toBeGreaterThanOrEqual(0)
          expect(lead).toBeLessThanOrEqual(8)
          expect(sup).toBeLessThanOrEqual(lead + 1e-9)
        }
      }
    }
    // find a state where the lead pressure is unclamped, then check the half rule and the feud step
    g.character.hidden.fame = 0
    const type: TypeId = 'drama'
    const top = activeField(g, ACTOR_SPEC, []).filter((x) => x.rival.edge === type)
    expect(top.length).toBeGreaterThanOrEqual(3)
    let found: { s: ActorState; lead: number } | null = null
    for (let fame = 100; fame >= 0 && !found; fame -= 5) {
      g.character.hidden.fame = fame
      for (let rep = 100; rep >= 0 && !found; rep -= 5) {
        const s = actorOf(g, { rep, popularity: [60, 60, 60] })
        const lead = pressure(g, s, type, 'Lead')
        if (lead > 0.5 && lead <= 5) found = { s, lead }
      }
    }
    expect(found).not.toBeNull()
    const { s, lead } = found!
    expect(pressure(g, s, type, 'Supporting')).toBeCloseTo(lead / 2, 10)
    expect(pressure(g, s, type, 'Extra')).toBe(0)
    // a rival who beat you twice adds one point; another type is untouched
    const feud = actorOf(g, { rep: s.rep, popularity: [60, 60, 60], memory: [{ id: top[0].rival.id, name: top[0].rival.name, met: 2, won: 0, lost: 2, grudge: 0, last: 1995 }] })
    expect(pressure(g, feud, type, 'Lead')).toBeCloseTo(lead + 1, 10)
    expect(pressure(g, feud, type, 'Supporting')).toBeCloseTo(lead / 2 + 1, 10)
    expect(pressure(g, feud, type, 'Extra')).toBe(0)
    const other = TYPE_IDS.find((t) => t !== type && !activeField(g, ACTOR_SPEC, []).slice(0, 24).some((x) => x.rival.id === top[0].rival.id && x.rival.edge === t))!
    expect(pressure(g, feud, other, 'Lead')).toBeCloseTo(pressure(g, s, other, 'Lead'), 10)
    // the A-list feels no pressure
    g.character.hidden.fame = 100
    g.flags['skill.acting'] = 100
    expect(pressure(g, actorOf(g, { rep: 100, popularity: [100, 100, 100] }), type, 'Lead')).toBe(0)
  })

  it('is pure, also on a frozen state [RF5]', () => {
    const g = at('us', 1995)
    g.character.hidden.fame = 35
    const s = actorOf(g, { rep: 55, popularity: [60] })
    const f = deepFreeze(structuredClone(g))
    const before = JSON.stringify(f)
    const rng = f.rng
    for (const w of [g, f]) {
      const sw = actorOf(w, { rep: 55, popularity: [60] })
      expect(rosterAt(w, ACTOR_SPEC).length).toBeGreaterThan(5)
      expect(activeField(w, ACTOR_SPEC, sw.memory).length).toBeGreaterThan(5)
      expect(rankOf(w, sw).rank).toBeGreaterThan(0)
      expect(starPower(w, sw)).toBeGreaterThan(0)
      for (const t of TYPE_IDS) for (const role of ['Extra', 'Supporting', 'Lead'] as Role[]) pressure(w, sw, t, role)
      expect(hotTypes(w)).toHaveLength(2)
      expect(hotTypes(w, w.year + 1)).toEqual([])
      expect(typeof clashOf(w, 'hollywood', 'drama', 1995)).toBe('boolean')
      expect(trendOf(w, 'drama')).toBeGreaterThan(0)
      expect(grossOf(w, proj(), { luck: 1 })).toBeGreaterThan(0)
      expect(grossOf(w, proj({ kind: 'tv', budget: 'network' }), { luck: 1, year: 1995 })).toBeGreaterThan(0)
      expect(awardOdds(w, sw, { quality: 70, popularity: 60, campaign: 10, window: 'awards', studioFame: 7 })).toBeGreaterThan(0)
      expect([industryOf(w), scaleOf(w), heat('hollywood', 1995), studioYear('hollywood', 1950), soundShiftYear('hollywood', 1928)]).toEqual(['hollywood', 1, heat('hollywood', 1995), true, true])
    }
    expect(JSON.stringify(f)).toBe(before)
    expect(f.rng).toBe(rng)
    expect(g.rng).toBe(rng)
    expect(JSON.stringify(s)).toBe(JSON.stringify(actorOf(g, { rep: 55, popularity: [60] })))
  })

  it('pins the gross curve', () => {
    const g = at('us', 2000)
    // the break-even ratio is the bar a hint reads: pick a type with no release clash this year
    const type = TYPE_IDS.find((t) => !clashOf(g, 'hollywood', t, 2000))!
    expect(type).toBeDefined()
    const o = { luck: 1, year: 2000, leisure: 1, trend: 1 }
    const r = (q: number): number => {
      const p = proj({ type, quality: q })
      return grossOf(g, p, o) / breakEvenOf(p, 1)
    }
    expect(r(55)).toBeLessThan(0.85)
    expect(r(70)).toBeGreaterThanOrEqual(0.95)
    expect(r(70)).toBeLessThanOrEqual(1.15)
    expect(r(85)).toBeGreaterThanOrEqual(1.3)
    expect(r(85)).toBeLessThanOrEqual(1.5)
    expect(r(55)).toBeLessThan(r(70))
    expect(r(70)).toBeLessThan(r(85))
    // blockbusters and indies move the same way: quality 70 is near the bar on every budget
    for (const budget of ['indie', 'blockbuster'] as const) {
      const p = proj({ type, budget, quality: 70 })
      expect(grossOf(g, p, o) / breakEvenOf(p, 1)).toBeGreaterThan(0.8)
      expect(grossOf(g, p, o) / breakEvenOf(p, 1)).toBeLessThan(1.5)
    }
  })

  it('applies buzz, window, clash, luck, leisure, scale and the era multipliers to the gross', () => {
    const g = at('us', 2000)
    const o = { luck: 1, year: 2000, leisure: 1, trend: 1 }
    const clashing = TYPE_IDS.find((t) => clashOf(g, 'hollywood', t, 2000))
    const quiet = TYPE_IDS.find((t) => !clashOf(g, 'hollywood', t, 2000))!
    expect(clashing).toBeDefined()
    const base = grossOf(g, proj({ type: quiet }), o)
    expect(grossOf(g, proj({ type: quiet, buzz: 100 }), o) / base).toBeCloseTo(1.5, 10)
    expect(grossOf(g, proj({ type: quiet, buzz: 40 }), o) / base).toBeCloseTo(1.2, 10)
    expect(grossOf(g, proj({ type: quiet, window: 'awards' }), o) / base).toBeCloseTo(0.92, 10)
    expect(grossOf(g, proj({ type: quiet, window: 'dodge' }), o) / base).toBeCloseTo(0.95, 10)
    expect(grossOf(g, proj({ type: quiet }), { ...o, luck: 1.5 }) / base).toBeCloseTo(1.5, 10)
    expect(grossOf(g, proj({ type: quiet }), { ...o, trend: 1.2 }) / base).toBeCloseTo(1.2, 10)
    expect(grossOf(g, proj({ type: quiet }), { ...o, leisure: 9 }) / base).toBeCloseTo(1.3, 10) // clamped to 0.7-1.3
    expect(grossOf(g, proj({ type: quiet }), { ...o, leisure: 0 }) / base).toBeCloseTo(0.7, 10)
    // a clash cuts 15%, and the dodge window removes it
    expect(grossOf(g, proj({ type: clashing! }), o) / base).toBeCloseTo(0.85, 10)
    expect(grossOf(g, proj({ type: clashing!, window: 'dodge' }), o) / base).toBeCloseTo(0.95, 10)
    // the release year, not today, sets the heat
    expect(grossOf(g, proj({ type: quiet, window: 'dodge' }), { ...o, year: 1960 }) / grossOf(g, proj({ type: quiet, window: 'dodge' }), o)).toBeCloseTo(heat('hollywood', 1960) / heat('hollywood', 2000), 10)
    // scale follows the industry; a Nollywood film earns 30% before 2010
    const ng = at('ng', 2012)
    const dodge = { luck: 1, leisure: 1, trend: 1 }
    const nolly = (year: number): number => grossOf(ng, proj({ industry: 'nollywood', window: 'dodge' }), { ...dodge, year })
    expect(nolly(2009) / heat('nollywood', 2009)).toBeCloseTo(0.3 * (nolly(2010) / heat('nollywood', 2010)), 6)
    expect(grossOf(ng, proj({ industry: 'nollywood', window: 'dodge' }), { ...dodge, year: 2012 }) / grossOf(ng, proj({ industry: 'hollywood', window: 'dodge' }), { ...dodge, year: 2012 })).toBeCloseTo((0.02 * heat('nollywood', 2012)) / heat('hollywood', 2012), 10)
    // junk in, finite out
    for (const bad of [NaN, -5, Infinity]) expect(Number.isFinite(grossOf(g, proj({ quality: bad, buzz: bad }), { luck: bad, year: 2000 }))).toBe(true)
  })

  it('prices TV on the audience, the Korean export boom and the break-even of 1.5 x cost', () => {
    const kr = at('kr', 2013)
    const tv = (industry: IndustryId) => proj({ kind: 'tv', budget: 'network', industry, type: 'romance', stage: 'shoot' })
    const o = { luck: 1, trend: 1 }
    const rel = (year: number): number => grossOf(kr, tv('kdrama'), { ...o, year }) / (INDUSTRIES.kdrama.scale * grossOf(kr, tv('hollywood'), { ...o, year }))
    expect(rel(1997)).toBeCloseTo(1, 10)
    expect(rel(1990)).toBeCloseTo(1, 10)
    expect(rel(2005)).toBeCloseTo(1.3, 10)
    expect(rel(2013)).toBeCloseTo(1.6, 10)
    expect(rel(2020)).toBeCloseTo(1.6, 10)
    // a better show earns more, buzz helps, and no audience means no gross
    const g = at('us', 1995)
    const net = (q: number, buzz = 0): number => grossOf(g, proj({ kind: 'tv', budget: 'network', quality: q, buzz }), { luck: 1, trend: 1, year: 1995 })
    expect(net(80)).toBeGreaterThan(net(50))
    expect(net(60, 50)).toBeGreaterThan(net(60))
    expect(net(70) / breakEvenOf(proj({ kind: 'tv', budget: 'network' }), 1)).toBeGreaterThan(1)
    expect(grossOf(at('us', 1930), proj({ kind: 'tv', budget: 'network' }), { luck: 1, trend: 1, year: 1930 })).toBe(0)
    expect(grossOf(at('us', 1995), proj({ kind: 'tv', budget: 'streaming' }), { luck: 1, trend: 1, year: 1995 })).toBe(0)
    expect(grossOf(at('us', 2020), proj({ kind: 'tv', budget: 'streaming' }), { luck: 1, trend: 1, year: 2020 })).toBeGreaterThan(0)
  })

  it('sets break-even at 2.2 x cost x scale for films and 1.5 for TV', () => {
    expect(breakEvenOf(proj({ budget: 'studio' }), 1)).toBeCloseTo(88_000_000)
    expect(breakEvenOf(proj({ budget: 'indie' }), 0.3)).toBeCloseTo(2.2 * 2_000_000 * 0.3)
    expect(breakEvenOf(proj({ budget: 'blockbuster' }), 1)).toBeCloseTo(396_000_000)
    expect(breakEvenOf(proj({ kind: 'tv', budget: 'network' }), 1)).toBeCloseTo(6_000_000)
    expect(breakEvenOf(proj({ kind: 'tv', budget: 'streaming' }), 0.5)).toBeCloseTo(6_000_000)
    expect(Number.isFinite(breakEvenOf(proj(), NaN))).toBe(true)
  })

  it('prices award odds from quality, popularity, campaign, window, studio and the field', () => {
    const g = at('us', 1995)
    const s = actorOf(g)
    const c = { quality: 60, popularity: 55, campaign: 0, window: 'normal' as Proj['window'], studioFame: 6 }
    const type: TypeId = 'drama'
    const field = activeField(g, ACTOR_SPEC, s.memory).filter((x) => x.rival.edge === type).slice(0, 3)
    const mean = field.reduce((n, x) => n + x.score, 0) / field.length
    const expected = (q: number, o: Partial<typeof c> & { pop?: number } = {}): number => {
      const k = { ...c, ...o }
      const fp = clamp((mean - q) / 200, 0, 0.25)
      return clamp(0.2 + (q - 60) / 60 + ((o.pop ?? k.popularity) - 55) / 150 + k.campaign / 100 + (k.window === 'awards' ? 0.08 : 0) + k.studioFame / 60 - fp, 0.03, 0.75)
    }
    expect(awardOdds(g, s, { ...c, type })).toBeCloseTo(expected(60), 10)
    expect(awardOdds(g, s, { ...c, type, campaign: 10 })).toBeCloseTo(expected(60, { campaign: 10 }), 10)
    expect(awardOdds(g, s, { ...c, type, window: 'awards' })).toBeCloseTo(expected(60, { window: 'awards' }), 10)
    expect(awardOdds(g, s, { ...c, type, window: 'dodge' })).toBeCloseTo(expected(60), 10)
    expect(awardOdds(g, s, { ...c, type, campaign: 10 }) - awardOdds(g, s, { ...c, type })).toBeCloseTo(0.1, 10)
    expect(awardOdds(g, s, { ...c, type, window: 'awards' }) - awardOdds(g, s, { ...c, type })).toBeCloseTo(0.08, 10)
    // without a type the field is every active rival
    const any = awardOdds(g, s, c)
    expect(any).toBeGreaterThanOrEqual(0.03)
    expect(any).toBeLessThanOrEqual(0.75)
    // clamped at both ends
    expect(awardOdds(g, s, { quality: 0, popularity: 0, campaign: 0, window: 'normal', studioFame: 0 })).toBe(0.03)
    expect(awardOdds(g, s, { quality: 100, popularity: 100, campaign: 30, window: 'awards', studioFame: 10 })).toBe(0.75)
    for (const bad of [NaN, Infinity, -Infinity]) {
      const v = awardOdds(g, s, { quality: bad, popularity: bad, campaign: bad, window: 'normal', studioFame: bad })
      expect(v).toBeGreaterThanOrEqual(0.03)
      expect(v).toBeLessThanOrEqual(0.75)
    }
  })

  it('names the hot types for the current year only, seeded and the same for an heir', () => {
    const g = at('us', 1995)
    const hot = hotTypes(g)
    expect(hot).toHaveLength(2)
    expect(new Set(hot).size).toBe(2)
    for (const t of hot) expect(TYPE_IDS).toContain(t)
    expect(hotTypes(g)).toEqual(hot)
    const rest = TYPE_IDS.filter((t) => !hot.includes(t))
    expect(trendOf(g, hot[0])).toBeGreaterThanOrEqual(trendOf(g, hot[1]))
    for (const t of rest) expect(trendOf(g, hot[1])).toBeGreaterThanOrEqual(trendOf(g, t))
    expect(hotTypes(g, 1995 + 1)).toEqual([]) // next year is not known yet
    expect(hotTypes(g, 1994)).toHaveLength(2) // a past year is
    const heir = structuredClone(g)
    heir.lifeId = 'test-life-g2'
    heir.generation = 2
    expect(hotTypes(heir)).toEqual(hot)
    // it moves from year to year, and the multiplier stays in a narrow band
    const pairs = new Set<string>()
    for (let y = 1950; y <= 2000; y++) {
      const gy = at('us', y)
      pairs.add(hotTypes(gy).join())
      for (const t of TYPE_IDS) {
        expect(trendOf(gy, t)).toBeGreaterThanOrEqual(Math.exp(-0.22 * 2.5) - 1e-9)
        expect(trendOf(gy, t)).toBeLessThanOrEqual(Math.exp(0.22 * 2.5) + 1e-9)
      }
    }
    expect(pairs.size).toBeGreaterThan(4)
  })

  it('keeps studio-system years, the sound shift and clash facts deterministic', () => {
    expect([1927, 1928, 1955, 1956].map((y) => studioYear('hollywood', y))).toEqual([false, true, true, false])
    expect([1934, 1935, 1955, 1956].map((y) => studioYear('bollywood', y))).toEqual([false, true, true, false])
    expect([1929, 1930, 1960, 1961].map((y) => studioYear('domestic', y))).toEqual([false, true, true, false])
    for (const id of ['nollywood', 'kdrama', 'hongkong'] as const) for (const y of [1930, 1950, 2000]) expect(studioYear(id, y)).toBe(false)
    expect([1926, 1927, 1931, 1932].map((y) => soundShiftYear('hollywood', y))).toEqual([false, true, true, false])
    expect(soundShiftYear('bollywood', 1929)).toBe(true)
    expect(soundShiftYear('domestic', 1929)).toBe(true)
    for (const id of ['nollywood', 'kdrama', 'hongkong'] as const) expect(soundShiftYear(id, 1929)).toBe(false)
    expect(studioYear('hollywood', NaN)).toBe(false)
    expect(soundShiftYear('hollywood', NaN)).toBe(false)

    const g = at('us', 1995)
    const heir = structuredClone(g)
    heir.lifeId = 'test-life-g2'
    const other = structuredClone(g)
    other.lifeId = 'someone-else'
    let clashes = 0
    let same = 0
    let n = 0
    for (let y = 1930; y <= 2025; y++) {
      for (const t of TYPE_IDS) {
        const v = clashOf(g, 'hollywood', t, y)
        expect(clashOf(g, 'hollywood', t, y)).toBe(v)
        expect(clashOf(heir, 'hollywood', t, y)).toBe(v)
        if (clashOf(other, 'hollywood', t, y) === v) same++
        if (v) clashes++
        n++
      }
    }
    expect(clashes / n).toBeGreaterThan(0.15)
    expect(clashes / n).toBeLessThan(0.45)
    expect(same / n).toBeLessThan(0.95) // another family sees other calendars
  })

  it('carries the era tables as data', () => {
    expect(Object.fromEntries(Object.values(INDUSTRIES).map((d) => [d.id, [d.scale, d.filmStart, d.studio, d.field]]))).toEqual({
      hollywood: [1, 1910, [1928, 1955], 20],
      bollywood: [0.3, 1913, [1935, 1955], 16],
      nollywood: [0.02, 1992, null, 14],
      kdrama: [0.14, 1955, null, 16],
      hongkong: [0.16, 1950, null, 16],
      domestic: [0.25, 1900, [1930, 1960], 16],
    })
    expect(INDUSTRIES.hollywood.countries).toEqual(['us', 'ca', 'gb', 'ie', 'au', 'nz'])
    expect(INDUSTRIES.bollywood.countries).toEqual(['in', 'pk', 'bd'])
    expect(INDUSTRIES.nollywood.countries).toEqual(['ng', 'gh'])
    expect(INDUSTRIES.kdrama.countries).toEqual(['kr'])
    expect(INDUSTRIES.hongkong.countries).toEqual(['hk'])
    expect(INDUSTRIES.domestic.countries).toEqual([])
    const claimed = Object.values(INDUSTRIES).flatMap((d) => d.countries)
    expect(new Set(claimed).size).toBe(claimed.length)
    expect(Object.fromEntries(Object.entries(BUDGETS).map(([k, b]) => [k, [b.kind, b.cost, b.gross, b.qBase, b.from ?? 0]]))).toEqual({
      indie: ['film', 2_000_000, 4_000_000, -5, 0],
      studio: ['film', 40_000_000, 70_000_000, 5, 0],
      blockbuster: ['film', 180_000_000, 420_000_000, 15, 1975],
      cable: ['tv', 3_000_000, 6_000_000, -5, 1980],
      network: ['tv', 4_000_000, 8_000_000, 5, 0],
      streaming: ['tv', 8_000_000, 14_000_000, 5, 0],
    })
    expect(Object.fromEntries(AWARD_DEFS.map((a) => [a.id, [a.name, a.industry, a.kind, a.from]]))).toMatchObject({
      'golden-reel': ['Golden Reel', 'hollywood', 'film', 1929],
      'primetime-glow': ['Primetime Glow', 'hollywood', 'tv', 1949],
      'silver-lotus': ['Silver Lotus', 'bollywood', 'film', 1954],
      'jade-crane': ['Jade Crane', 'kdrama', 'tv', 1963],
      lantern: ['Lantern', 'hongkong', 'film', 1982],
      'palm-screen': ['Palm Screen', 'nollywood', 'film', 2005],
      'viewers-choice': ['Viewers Choice', 'any', 'tv', 2013],
    })
    expect(AWARD_DEFS.filter((a) => a.name === 'National Film or Television Prize').map((a) => [a.industry, a.kind, a.from])).toEqual([
      ['domestic', 'film', 1946],
      ['domestic', 'tv', 1946],
    ])
    expect(new Set(AWARD_DEFS.map((a) => a.id)).size).toBe(AWARD_DEFS.length)
  })
})
