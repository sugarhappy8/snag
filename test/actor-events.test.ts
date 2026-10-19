import { afterEach, describe, expect, it } from 'vitest'
import { seeded } from '../src/game/assets'
import { getPerson, yearActionsUsed } from '../src/game/core'
import { techOdds } from '../src/game/history/timeline'
import { createPerson } from '../src/game/people'
import { hasScript, runScript } from '../src/game/scripts'
import { yearlySpecial } from '../src/game/special'
import { TYPE_IDS, type TypeId } from '../src/game/special/actor-data'
import {
  ACTOR_DEFS,
  actorCrises,
  apologize,
  censorRisk,
  crisisPr,
  firePress,
  hirePress,
  layLow,
  rangeWork,
  stepPress,
} from '../src/game/special/actor-events'
import { auditionBlock, feeMult } from '../src/game/special/actor-pipeline'
import { actorSim } from '../src/game/special/actor-sim'
import { actorStore, adoptLegacy, type ActorState, type Credit, type Proj } from '../src/game/special/actor-state'
import { rankOf, scaleOf, starPower } from '../src/game/special/actor-world'
import { fameOf, hire, ownerKey } from '../src/game/special/common'
import { applyEffects, bestStance, defineCrises, type CrisisDef, type CrisisSet, type Stance } from '../src/game/special/kit/crisis'
import { ACTION_BUDGET, careerCtx, pendingCareerChoices, setCareerAudit, type AuditEvent, type CareerCtx } from '../src/game/special/kit/year'
import type { ChoiceModal, GameState, Json, ModalItem, NoticeModal } from '../src/game/types'
import { assertHonestOdds, checkLedger, finiteJson, nextYear, voiceProblems } from './career-kit'
import { makeTestGame } from './helpers'

type Def = CrisisDef<ActorState, any>

const IDS = ['redScare', 'soundShift', 'guildStrike', 'techShift', 'scandalLeak', 'poach', 'franchise', 'shelved', 'censor', 'injury', 'rivalFeud'] as const
type DefId = (typeof IDS)[number]
const STANCES: Stance[] = ['safe', 'bold', 'cash']

const defOf = (id: string): Def => {
  const d = ACTOR_DEFS.find((x) => x.id === id)
  if (!d) throw new Error(`no def ${id}`)
  return d
}

const ctxOf = (g: GameState, s: ActorState = actorStore.mut(g)): CareerCtx<ActorState> => careerCtx(g, 'actor', s, { ...ACTION_BUDGET })

/** A notice-kind modal: runScript keeps no replay token for it, so a script's own guards are what is tested. */
let serial = 0
const fake = (): ModalItem => ({ kind: 'notice', id: `e${++serial}`, title: '', text: '' })

const notices = (g: GameState): NoticeModal[] => g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
const choices = (g: GameState): ChoiceModal[] => g.queue.filter((m): m is ChoiceModal => m.kind === 'choice')

/** A 1995 life with an actor job, an adopted record and a trained actor (no project, no credits, no team). */
function newActor(seed = 5, o: { year?: number; country?: string; skill?: number } = {}): { g: GameState; s: ActorState } {
  const g = makeTestGame(seed, { age: 30, countryId: o.country ?? 'us' })
  g.year = o.year ?? 1995
  g.flags['skill.acting'] = o.skill ?? 60
  g.character.money = 100_000
  hire(g, { defId: 'actor', title: 'Actor', company: 'Silverline Studios', salary: 0, data: { project: null } })
  const s = actorStore.mut(g)
  adoptLegacy(g, s)
  return { g, s }
}

const proj = (o: Partial<Proj> = {}): Proj => ({
  id: 'p9',
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
  developed: 10,
  buzz: 20,
  campaign: 0,
  season: 1,
  director: 65,
  costars: [],
  window: 'normal',
  quality: 70,
  since: 1994,
  lastYear: 1994,
  ...o,
})

const credit = (o: Partial<Credit> = {}): Credit => ({
  id: 'c1',
  title: 'Old Film',
  kind: 'film',
  role: 'Lead',
  genre: 'Drama',
  type: 'drama',
  industry: 'hollywood',
  studio: 'Silverline Studios',
  year: 1990,
  age: 25,
  pay: 100_000,
  quality: 70,
  popularity: 60,
  gross: 1,
  backend: 0,
  seasons: 1,
  verdict: 'a hit',
  residual: 0,
  trust: false,
  ...o,
})

const agent = (o: Partial<{ quality: number; cut: number; loyalty: number; name: string; firm: string; personId: string }> = {}) => ({
  personId: '',
  name: 'Mia Chen',
  firm: 'Starlight Talent',
  quality: 60,
  cut: 0.1,
  loyalty: 60,
  since: 1990,
  ...o,
})

/** The first year `kind` reaches 10% of homes for the life's country. */
function firstYear(kind: 'tv' | 'streaming', country = 'us'): number {
  const g = makeTestGame(1, { age: 30, countryId: country })
  for (let y = 1900; y <= 2026; y++) if (techOdds(g, kind, y) >= 0.1) return y
  throw new Error(`${kind} never reaches 10%`)
}

/** A country where the censors have reason to act, found by scanning the ids the tests already use. */
function strictCountry(): string {
  for (const id of ['ng', 'pk', 'eg', 'ru', 'cn', 'ir', 'sa', 'ke', 'bd', 'vn', 'tr', 'mx', 'br']) {
    const g = makeTestGame(1, { age: 30, countryId: id })
    g.year = 1995
    if (censorRisk(g) > 0.25) return id
  }
  throw new Error('no country with censor risk over 25%')
}

/** A life in which `id` is eligible (weight above 0), a fresh one per call. */
function fixture(id: DefId, seed = 5): { g: GameState; s: ActorState } {
  switch (id) {
    case 'redScare': {
      const f = newActor(seed, { year: 1950 })
      f.s.credits = [credit()]
      return f
    }
    case 'soundShift':
      return newActor(seed, { year: 1929 })
    case 'guildStrike': {
      const f = newActor(seed, { year: 1960 })
      f.s.pipeline = [proj({ stage: 'shoot', lastYear: 1960, terms: { fee: 400_000, points: 0, exclusive: false } })]
      return f
    }
    case 'techShift':
      return newActor(seed, { year: firstYear('tv') })
    case 'scandalLeak': {
      const f = newActor(seed)
      f.g.character.hidden.fame = 40
      return f
    }
    case 'poach': {
      const f = newActor(seed)
      f.s.team.agent = agent({ loyalty: 60 })
      f.s.cool['poach.agent'] = f.g.year
      return f
    }
    case 'franchise': {
      const f = newActor(seed)
      f.s.pipeline = [proj({ stage: 'shoot', lastYear: f.g.year, role: 'Lead', terms: { fee: 600_000, points: 0, exclusive: false } })]
      f.s.standing = 55
      f.g.character.hidden.fame = 40
      return f
    }
    case 'shelved': {
      const f = newActor(seed)
      f.s.pipeline = [proj({ stage: 'post', lastYear: f.g.year })]
      return f
    }
    case 'censor': {
      const f = newActor(seed, { country: strictCountry() })
      f.s.pipeline = [proj({ stage: 'post', lastYear: f.g.year })]
      return f
    }
    case 'injury': {
      const f = newActor(seed)
      f.s.pipeline = [proj({ stage: 'shoot', lastYear: f.g.year, type: 'action', genre: 'Action', terms: { fee: 500_000, points: 0, exclusive: false } })]
      return f
    }
    case 'rivalFeud': {
      const f = newActor(seed)
      f.s.memory = [{ id: 'actor.us.1990.0', name: 'Dana Whitfield', met: 3, won: 0, lost: 2, grudge: 40, last: f.g.year - 1 }]
      return f
    }
  }
}

/** The def's crisis data from the fixture, the way the offer would make it. */
const dataOf = (def: Def, g: GameState, s: ActorState): Record<string, Json> => def.make(g, s, seeded(`t|${def.id}`))

/** Applies one branch of one option without the roll (the odds are tested apart): effects, then then(). */
function branch(g: GameState, s: ActorState, def: Def, stance: Stance, which: 'good' | 'bad', d: Record<string, Json> = dataOf(def, g, s)) {
  const opt = def.options[stance]
  if (!opt) throw new Error(`${def.id} has no ${stance}`)
  const b = which === 'bad' && opt.bad ? opt.bad(g, s, d) : opt.good(g, s, d)
  const c = ctxOf(g, s)
  const result = applyEffects(c, b.fx, def.title)
  b.then?.(s, g)
  return { b, result }
}

/** Resolves a crisis through its script, the way the store would on a click. */
function resolve(g: GameState, id: string, choice: string, d: Record<string, Json>, modal: ModalItem = fake(), owner = ownerKey(g), year = g.year): void {
  runScript(g, `career.actor.${id}`, choice, { d, owner, year }, modal)
}

/** The queued crisis modal, if the yearly hook offered one. */
const careerModal = (g: GameState): ChoiceModal | undefined => choices(g).find((m) => typeof m.scriptId === 'string' && m.scriptId.startsWith('career.actor.'))

/** A crisis set for one def only, under its own career id so the scripts of the real set stay untouched. Made once per def: a script id registers once. */
const solos = new Map<string, CrisisSet<ActorState>>()
function solo(def: Def): CrisisSet<ActorState> {
  let set = solos.get(def.id)
  if (!set) {
    set = defineCrises({ career: 'actort', store: actorStore, talent: 'Acting', defs: [def] })
    solos.set(def.id, set)
  }
  return set
}

/** Offers `def` on a clone of the fixture by trying rng seeds until the 35% roll lands. */
function offerOne(id: DefId, talent: boolean): { g: GameState; modal: ChoiceModal; s: ActorState } {
  const def = defOf(id)
  const set = solo(def)
  for (let seed = 1; seed <= 200; seed++) {
    const f = fixture(id)
    if (talent) f.g.character.talent = 'Acting'
    f.g.rng = seed
    if (!set.offer(ctxOf(f.g, f.s))) continue
    const modal = choices(f.g).find((m) => m.scriptId === `career.actort.${def.id}`)
    if (modal) return { g: f.g, modal, s: f.s }
  }
  throw new Error(`${id} was never offered`)
}

const flat = (g: GameState): string => {
  const c = structuredClone(g)
  delete c.flags['core.resolvedScriptModals']
  return JSON.stringify(c)
}

afterEach(() => setCareerAudit(null))

describe('actor events: eleven defs', () => {
  it('registers every def as career.actor.<id> with 2 to 3 stances and distinct labels', () => {
    expect(ACTOR_DEFS.map((d) => d.id)).toEqual([...IDS])
    for (const def of ACTOR_DEFS) {
      expect(hasScript(`career.actor.${def.id}`)).toBe(true)
      const opts = STANCES.map((s) => def.options[s]).filter((o) => !!o)
      expect(opts.length).toBeGreaterThanOrEqual(2)
      expect(opts.length).toBeLessThanOrEqual(3)
      expect(new Set(opts.map((o) => o!.label)).size).toBe(opts.length)
      expect(def.cool ?? 4).toBeGreaterThanOrEqual(1)
      expect(def.cool ?? 4).toBeLessThanOrEqual(100)
    }
    expect(actorCrises.offer).toBeTypeOf('function')
  })

  it('gates every def by era, industry and state', () => {
    const w = (id: DefId, f: { g: GameState; s: ActorState }): number => defOf(id).weight(f.g, f.s)
    for (const id of IDS) expect(w(id, fixture(id)), id).toBeGreaterThan(0)

    // redScare: hollywood-type, 1947-1957, with a credit
    const red = (year: number, o: { country?: string; credits?: boolean } = {}) => {
      const f = newActor(5, { year, country: o.country })
      if (o.credits !== false) f.s.credits = [credit()]
      return w('redScare', f)
    }
    expect([red(1946), red(1947), red(1957), red(1958)].map((x) => x > 0)).toEqual([false, true, true, false])
    expect(red(1950, { credits: false })).toBe(0)
    expect(red(1950, { country: 'in' })).toBe(0)
    expect(red(1950, { country: 'fr' })).toBe(0)

    // soundShift: studio-system industries, 1927-1931
    const sound = (year: number, country = 'us') => w('soundShift', newActor(5, { year, country }))
    expect([sound(1926), sound(1927), sound(1931), sound(1932)].map((x) => x > 0)).toEqual([false, true, true, false])
    expect(sound(1990)).toBe(0)

    // guildStrike: the four strike years, an active shoot, hollywood
    const strike = (year: number, o: { shoot?: boolean; country?: string } = {}) => {
      const f = newActor(5, { year, country: o.country })
      if (o.shoot !== false) f.s.pipeline = [proj({ stage: 'shoot', lastYear: year })]
      return w('guildStrike', f)
    }
    for (const y of [1960, 1980, 2007, 2023]) expect(strike(y), String(y)).toBeGreaterThan(0)
    for (const y of [1959, 1961, 1995, 2008]) expect(strike(y), String(y)).toBe(0)
    expect(strike(1960, { shoot: false })).toBe(0)
    expect(strike(1960, { country: 'in' })).toBe(0)

    // techShift: the first years television or streaming passes 10%, once each
    const tv = firstYear('tv')
    const at = (year: number) => w('techShift', newActor(5, { year }))
    expect(at(tv - 1)).toBe(0)
    expect(at(tv)).toBeGreaterThan(0)
    expect(at(tv + 2)).toBeGreaterThan(0)
    expect(at(tv + 3)).toBe(0)
    const seen = newActor(5, { year: tv })
    seen.s.cool['tech.tv'] = tv
    expect(w('techShift', seen)).toBe(0)
    const stream = firstYear('streaming')
    expect(at(stream)).toBeGreaterThan(0)

    // scandalLeak: fame 25 and up
    const leak = (fame: number) => {
      const f = newActor(5)
      f.g.character.hidden.fame = fame
      return w('scandalLeak', f)
    }
    expect([leak(24), leak(25)].map((x) => x > 0)).toEqual([false, true])

    // poach: the year the roll hit, a rep who is staying (loyalty 40 and up)
    const poach = (o: { loyalty?: number; hit?: number; role?: 'agent' | 'manager' | null } = {}) => {
      const f = newActor(5)
      const role = o.role === undefined ? 'agent' : o.role
      if (role) f.s.team[role] = agent({ loyalty: o.loyalty ?? 60 })
      f.s.cool['poach.agent'] = o.hit ?? f.g.year
      return w('poach', f)
    }
    expect(poach()).toBeGreaterThan(0)
    expect(poach({ loyalty: 39 })).toBe(0)
    expect(poach({ hit: 1994 })).toBe(0)
    expect(poach({ role: null })).toBe(0)
    const mgr = newActor(5)
    mgr.s.team.manager = agent({ loyalty: 70 })
    mgr.s.cool['poach.manager'] = mgr.g.year
    expect(w('poach', mgr)).toBeGreaterThan(0)

    // franchise: a lead film in flight, star 40 and up, no deal already in force
    const fr = (o: { standing?: number; role?: Proj['role']; deal?: number } = {}) => {
      const f = fixture('franchise')
      f.s.standing = o.standing ?? 55
      f.s.pipeline[0].role = o.role ?? 'Lead'
      if (o.deal) f.s.cool['franchise.drama'] = o.deal
      return w('franchise', f)
    }
    expect([fr({ standing: 39 }), fr({ standing: 40 })].map((x) => x > 0)).toEqual([false, true])
    expect(fr({ role: 'Supporting' })).toBe(0)
    expect(fr({ deal: 2 })).toBe(0)

    // shelved: a film in post
    const shelved = fixture('shelved')
    shelved.s.pipeline[0].stage = 'shoot'
    expect(w('shelved', shelved)).toBe(0)
    const tvPost = fixture('shelved')
    tvPost.s.pipeline[0].kind = 'tv'
    expect(w('shelved', tvPost)).toBe(0)

    // censor: risk over 25% and a film in post
    const home = fixture('censor')
    expect(w('censor', home)).toBeGreaterThan(0)
    const calm = newActor(5, { country: 'us' })
    calm.s.pipeline = [proj({ stage: 'post', lastYear: calm.g.year })]
    expect(censorRisk(calm.g)).toBeLessThanOrEqual(0.25)
    expect(w('censor', calm)).toBe(0)
    const empty = newActor(5, { country: strictCountry() })
    expect(w('censor', empty)).toBe(0)

    // injury: an action or genre project in flight
    const inj = (type: TypeId) => {
      const f = fixture('injury')
      f.s.pipeline[0].type = type
      return w('injury', f)
    }
    expect([inj('action'), inj('genre'), inj('drama'), inj('comedy'), inj('romance')].map((x) => x > 0)).toEqual([true, true, false, false, false])

    // rivalFeud: a grudge of 30 or a second loss
    const feud = (grudge: number, lost: number) => {
      const f = newActor(5)
      f.s.memory = [{ id: 'r1', name: 'Dana Whitfield', met: 1, won: 0, lost, grudge, last: f.g.year }]
      return w('rivalFeud', f)
    }
    expect([feud(30, 0), feud(0, 2), feud(29, 1), feud(0, 0)].map((x) => x > 0)).toEqual([true, true, false, false])
  })

  it('computes censor risk from institutions, media control and the regime, never above 1', () => {
    const g = makeTestGame(1, { age: 30, countryId: 'us' })
    g.year = 1995
    const before = JSON.stringify(g)
    const risk = censorRisk(g)
    expect(risk).toBeGreaterThanOrEqual(0)
    expect(risk).toBeLessThanOrEqual(1)
    expect(Number.isFinite(risk)).toBe(true)
    expect(JSON.stringify(g)).toBe(before)
    expect(g.rng).toBe(1)
    const strict = makeTestGame(1, { age: 30, countryId: strictCountry() })
    strict.year = 1995
    expect(censorRisk(strict)).toBeGreaterThan(0.25)
  })

  it('marks the bestStance option from the resolver odds and only with Acting', () => {
    for (const id of IDS) {
      const def = defOf(id)
      const plain = offerOne(id, false)
      expect(plain.modal.choices.every((c) => c.hint === undefined), `${id} without Acting`).toBe(true)
      const gifted = offerOne(id, true)
      const d = (gifted.modal.data as unknown as { d: Record<string, Json> }).d
      const best = bestStance(gifted.g, actorStore.view(gifted.g), d, def)
      const hinted = gifted.modal.choices.filter((c) => c.hint)
      expect(hinted.map((c) => c.id), id).toEqual([best])
      expect(hinted[0].hint).toMatch(/Looks best/)
      // a rolled option prints its odds, a fixed one prints none
      const opt = def.options[best as Stance]!
      if (opt.odds) expect(hinted[0].hint).toMatch(/about \d+%/)
      else expect(hinted[0].hint).not.toContain('%')
    }
  })

  it('rolls the odds it hints', () => {
    for (const id of IDS) {
      const def = defOf(id)
      assertHonestOdds(def, () => {
        const f = fixture(id)
        return { g: f.g, s: f.s, d: dataOf(def, f.g, f.s) }
      })
    }
  }, 120_000)

  it('keeps all text in voice and dated no later than 2026', () => {
    const texts: { role: 'scene' | 'outcome' | 'title'; text: string; where: string }[] = []
    for (const id of IDS) {
      const def = defOf(id)
      const f = fixture(id)
      const variants: Record<string, Json>[] = id === 'techShift' ? [{ kind: 'tv' }, { kind: 'streaming' }] : [dataOf(def, f.g, f.s)]
      texts.push({ role: 'title', text: def.title, where: `${id} title` })
      for (const d of variants) {
        const scene = def.scene(f.g, f.s, d)
        expect(scene.endsWith('What will you do?'), `${id} scene end`).toBe(true)
        expect(scene.length, `${id} scene length`).toBeLessThanOrEqual(140)
        texts.push({ role: 'scene', text: scene, where: `${id} scene` })
        for (const stance of STANCES) {
          const opt = def.options[stance]
          if (!opt) continue
          expect(opt.label.split(/\s+/).length, `${id}/${stance} label`).toBeLessThanOrEqual(5)
          texts.push({ role: 'title', text: opt.label, where: `${id}/${stance} label` })
          for (const b of [opt.good(f.g, f.s, d), opt.bad?.(f.g, f.s, d)]) {
            if (!b) continue
            const text = b.text({ paid: 1234, earned: 5678 })
            expect(text.length, `${id}/${stance} outcome length: ${text}`).toBeLessThanOrEqual(120)
            texts.push({ role: 'outcome', text, where: `${id}/${stance} outcome` })
          }
        }
      }
    }
    for (const t of texts) {
      expect(voiceProblems(t.text, t.role), `${t.where}: ${t.text}`).toEqual([])
      expect(t.text, `${t.where}: ${t.text}`).not.toMatch(/\b20(2[7-9]|[3-9]\d)\b|\b2[1-9]\d\d\b/)
      expect(t.text.includes(String.fromCharCode(0x2014))).toBe(false)
    }
  })

  it('offers one choice a year through the sim, and replays change nothing [RF3]', () => {
    let found: { g: GameState; modal: ChoiceModal } | null = null
    for (let seed = 1; seed <= 80 && !found; seed++) {
      const f = fixture('scandalLeak', seed)
      f.g.character.hidden.fame = 40
      f.g.rng = seed
      nextYear(f.g, actorSim.yearly)
      const modal = careerModal(f.g)
      if (modal) found = { g: f.g, modal }
    }
    if (!found) throw new Error('the sim never offered a crisis')
    const { g, modal } = found
    expect(choices(g).filter((m) => m.scriptId?.startsWith('career.')).length).toBe(1)
    expect(pendingCareerChoices(g)).toBe(1)

    // the yearly hook again in the same year and age: nothing moves
    const queued = JSON.stringify(g)
    actorSim.yearly(g)
    expect(JSON.stringify(g)).toBe(queued)

    const id = modal.scriptId!.replace('career.actor.', '')
    const pre = structuredClone(g)
    runScript(g, modal.scriptId!, 'safe', modal.data, modal)
    const once = JSON.stringify(g)
    expect(once).not.toBe(JSON.stringify(pre))
    // the same modal again, and a fresh modal id with the same data
    runScript(g, modal.scriptId!, 'safe', modal.data, modal)
    expect(JSON.stringify(g)).toBe(once)
    const settled = flat(g)
    runScript(g, modal.scriptId!, 'safe', modal.data, { ...modal, id: 'again' })
    expect(flat(g)).toBe(settled)
    // another owner and another year
    const data = modal.data as unknown as { d: Record<string, Json>; owner: string; year: number }
    const other = structuredClone(pre)
    runScript(other, modal.scriptId!, 'safe', { ...data, owner: 'v2:9:someone-else' }, { ...modal, id: 'owner' })
    expect(flat(other)).toBe(flat(pre))
    const later = structuredClone(pre)
    later.year += 1
    const expected = flat(later)
    runScript(later, modal.scriptId!, 'safe', modal.data, { ...modal, id: 'year' })
    expect(flat(later)).toBe(expected)
    // a choice that is not on offer
    const bogus = structuredClone(pre)
    runScript(bogus, modal.scriptId!, 'fold', modal.data, { ...modal, id: 'bogus' })
    expect(flat(bogus)).toBe(flat(pre))
    expect(id.length).toBeGreaterThan(0)
  })

  it('resolves a crisis through its script once: a replay, another owner, another year or a missing stance change nothing [RF3]', () => {
    const f = fixture('redScare')
    f.s.rep = 50
    resolve(f.g, 'redScare', 'safe', {})
    expect(actorStore.view(f.g).rep).toBe(55)
    expect(notices(f.g).length).toBe(1)
    const once = flat(f.g)
    resolve(f.g, 'redScare', 'safe', {}) // the same year again: the one-shot guard
    resolve(f.g, 'redScare', 'cash', {})
    expect(flat(f.g)).toBe(once)

    const pre = fixture('redScare')
    pre.s.rep = 50
    const before = flat(pre.g)
    const owner = structuredClone(pre.g)
    resolve(owner, 'redScare', 'safe', {}, fake(), 'v2:9:someone-else')
    expect(flat(owner)).toBe(before)
    const year = structuredClone(pre.g)
    resolve(year, 'redScare', 'safe', {}, fake(), ownerKey(year), year.year - 1)
    expect(flat(year)).toBe(before)
    const stance = structuredClone(pre.g)
    resolve(stance, 'poach', 'cash', {}) // poach has no cash stance, and no rep to lose
    resolve(stance, 'redScare', 'fold', {})
    expect(flat(stance)).toBe(before)
  })

  it('wires the crises into the yearly sim, with the same budget as every career year', () => {
    let offers = 0
    for (let seed = 1; seed <= 60; seed++) {
      const f = fixture('scandalLeak', seed)
      f.g.character.hidden.fame = 40
      f.g.rng = seed
      nextYear(f.g, actorSim.yearly)
      const mine = choices(f.g).filter((m) => m.scriptId?.startsWith('career.actor.'))
      expect(mine.length).toBeLessThanOrEqual(1)
      if (mine.length) offers++
      expect(finiteJson(f.g)).toEqual([])
    }
    expect(offers).toBeGreaterThan(5)
    expect(offers).toBeLessThan(45)
  })

  it('books every dollar a crisis moves, whichever way the roll goes', () => {
    for (const id of IDS) {
      const def = defOf(id)
      for (const stance of STANCES) {
        if (!def.options[stance]) continue
        for (let seed = 1; seed <= 24; seed++) {
          const f = fixture(id)
          f.g.rng = seed
          f.s.rows = [{ y: f.g.year - 1, income: 300_000, spent: 0, rank: 0, of: 0, standing: 20, note: '' }]
          const d = dataOf(def, f.g, f.s)
          const events: AuditEvent[] = []
          setCareerAudit((e) => events.push(e))
          const cash = f.g.character.money
          resolve(f.g, id, stance, d)
          setCareerAudit(null)
          const booked = events.reduce((n, e) => n + (e.t === 'earn' ? e.amount : e.t === 'pay' ? -e.amount : 0), 0)
          expect(f.g.character.money - cash, `${id}/${stance}/${seed}`).toBe(booked)
          expect(checkLedger(events), `${id}/${stance}/${seed}`).toEqual([])
          expect(f.g.character.money).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('keeps then() free of cash and g.rng in every branch of every def', () => {
    for (const id of IDS) {
      const def = defOf(id)
      for (const stance of STANCES) {
        const opt = def.options[stance]
        if (!opt) continue
        for (const which of ['good', 'bad'] as const) {
          const f = fixture(id)
          const d = dataOf(def, f.g, f.s)
          const b = which === 'bad' && opt.bad ? opt.bad(f.g, f.s, d) : opt.good(f.g, f.s, d)
          const before = { money: f.g.character.money, rng: f.g.rng }
          b.then?.(f.s, f.g)
          expect([f.g.character.money, f.g.rng], `${id}/${stance}/${which}`).toEqual([before.money, before.rng])
        }
      }
    }
  })

  it('builds branches without writing: good(), bad() and scene() are pure', () => {
    for (const id of IDS) {
      const def = defOf(id)
      const f = fixture(id)
      const d = dataOf(def, f.g, f.s)
      const before = JSON.stringify(f.g)
      def.weight(f.g, f.s)
      def.scene(f.g, f.s, d)
      for (const stance of STANCES) {
        const opt = def.options[stance]
        if (!opt) continue
        opt.odds?.(f.g, f.s, d)
        opt.good(f.g, f.s, d)
        opt.bad?.(f.g, f.s, d)
      }
      expect(JSON.stringify(f.g), id).toBe(before)
    }
  })

  it('keeps fame, scandal, rep and standing within 0-100 across every branch, started from 0 and from 99 [RF1]', () => {
    for (const start of [0, 99]) {
      for (const id of IDS) {
        const def = defOf(id)
        for (const stance of STANCES) {
          if (!def.options[stance]) continue
          for (const which of ['good', 'bad'] as const) {
            const f = fixture(id)
            f.g.character.hidden.fame = start
            f.s.scandal = start
            f.s.rep = start
            f.s.standing = start
            f.s.peak = start
            for (const t of TYPE_IDS) f.s.type[t] = start
            branch(f.g, f.s, def, stance, which)
            const s = actorStore.mut(f.g)
            const tag = `${id}/${stance}/${which}@${start}`
            for (const [name, v] of [['fame', fameOf(f.g)], ['scandal', s.scandal], ['rep', s.rep], ['standing', s.standing], ['peak', s.peak], ...TYPE_IDS.map((t) => [`type.${t}`, s.type[t]] as const)] as const) {
              expect(Number.isFinite(v), `${tag} ${name}`).toBe(true)
              expect(v, `${tag} ${name}`).toBeGreaterThanOrEqual(0)
              expect(v, `${tag} ${name}`).toBeLessThanOrEqual(100)
            }
            expect(finiteJson(f.g), tag).toEqual([])
          }
        }
      }
    }
  })

  it('survives junk crisis data in a stale or tampered modal [RF1]', () => {
    for (const id of IDS) {
      const def = defOf(id)
      for (const junk of [null, 'x', [], { d: null }, { d: 'x' }, { d: { id: 5, title: {}, fee: 'bad', kind: [], rid: 9, rname: null } }] as unknown as Json[]) {
        const f = fixture(id)
        const before = f.g.character.money
        for (const stance of STANCES) {
          if (!def.options[stance]) continue
          const g = structuredClone(f.g)
          const data = junk && typeof junk === 'object' && !Array.isArray(junk) ? { ...(junk as Record<string, Json>), owner: ownerKey(g), year: g.year } : junk
          runScript(g, `career.actor.${id}`, stance, data, fake())
          expect(finiteJson(g), `${id}/${stance}`).toEqual([])
          expect(g.character.money).toBeLessThanOrEqual(before + 1e12)
        }
      }
    }
  })
})

describe('actor events: what each def does', () => {
  it('redScare: refusing costs fees and earns respect, naming names pays and costs it, stalling holds at 0.35 + rep/200', () => {
    const def = defOf('redScare')
    const karma = (g: GameState) => g.character.hidden.karma
    {
      const { g, s } = fixture('redScare')
      s.rep = 50
      const k = karma(g)
      branch(g, s, def, 'safe', 'good')
      expect(s.rep).toBe(55)
      expect(karma(g)).toBe(k + 8)
      expect(s.cool['fee.down']).toBe(g.year + 2)
      expect(s.cool['fee.up']).toBeUndefined()
      expect(feeMult(s, g.year, { kind: 'film', type: 'drama' })).toBeCloseTo(0.7, 10)
      expect(feeMult(s, g.year + 3, { kind: 'film', type: 'drama' })).toBeCloseTo(1, 10)
    }
    {
      const { g, s } = fixture('redScare')
      s.rep = 50
      const k = karma(g)
      branch(g, s, def, 'cash', 'good')
      expect(s.rep).toBe(35)
      expect(karma(g)).toBe(k - 10)
      expect(s.cool['fee.up']).toBe(g.year + 2)
      expect(feeMult(s, g.year + 2, { kind: 'film', type: 'drama' })).toBeCloseTo(1.1, 10)
    }
    {
      const { g, s } = fixture('redScare')
      s.rep = 50
      const before = JSON.stringify([g.character.hidden, s.rep, s.cool])
      branch(g, s, def, 'bold', 'good')
      expect(JSON.stringify([g.character.hidden, s.rep, s.cool])).toBe(before) // the stall worked: nothing happened
      const { g: h, s: t } = fixture('redScare')
      t.rep = 50
      branch(h, t, def, 'bold', 'bad')
      expect(t.rep).toBe(55) // a failed stall counts as refusing
      expect(t.cool['fee.down']).toBe(h.year + 2)
    }
    const f = fixture('redScare')
    f.s.rep = 60
    expect(def.options.bold!.odds!(f.g, f.s, {})).toBeCloseTo(0.35 + 60 / 200, 10)
    expect(def.options.safe!.odds).toBeUndefined()
    expect(def.options.cash!.odds).toBeUndefined()
  })

  it('soundShift: voice lessons cost 3,000 x scale and teach 6 skill either way, waiting cuts fees to 1931, the stage pauses the pipeline', () => {
    const def = defOf('soundShift')
    {
      const { g, s } = fixture('soundShift')
      branch(g, s, def, 'safe', 'good')
      expect(s.cool['fee.wait']).toBe(1931)
      expect(feeMult(s, 1929, { kind: 'film', type: 'drama' })).toBeCloseTo(0.75, 10)
      expect(feeMult(s, 1932, { kind: 'film', type: 'drama' })).toBeCloseTo(1, 10)
      expect(def.options.safe!.odds).toBeUndefined()
    }
    for (const which of ['good', 'bad'] as const) {
      const { g, s } = fixture('soundShift')
      const skill = (g.flags['skill.acting'] as number) ?? 0
      const cash = g.character.money
      const { result } = branch(g, s, def, 'bold', which)
      expect(result.paid).toBe(Math.round(3000 * scaleOf(g)))
      expect(g.character.money).toBe(cash - result.paid)
      expect(g.flags['skill.acting']).toBe(skill + 6)
      expect(s.cool['fee.wait']).toBe(which === 'bad' ? 1931 : undefined)
    }
    {
      const { g, s } = fixture('soundShift')
      s.pipeline = [proj({ stage: 'shoot', lastYear: g.year - 1 }), proj({ id: 'p10', stage: 'post', lastYear: g.year })]
      const rep = s.rep
      branch(g, s, def, 'cash', 'good')
      expect(s.pipeline.map((p) => p.lastYear)).toEqual([g.year + 1, g.year + 1])
      expect(s.layLow).toBe(g.year)
      expect(auditionBlock(g, s)).toMatch(/laying low/)
      expect(s.rep).toBe(rep + 3)
    }
    const f = fixture('soundShift')
    f.g.flags['skill.acting'] = 80
    expect(def.options.bold!.odds!(f.g, f.s, {})).toBeCloseTo(0.5 + 80 / 200, 10)
    // once: the cool-down runs for the rest of any life
    expect(def.cool).toBeGreaterThanOrEqual(10)
    const set = solo(def)
    const g = fixture('soundShift').g
    const s2 = actorStore.mut(g)
    let offered = false
    for (let seed = 1; seed <= 60 && !offered; seed++) {
      g.rng = seed
      offered = set.offer(ctxOf(g, s2))
    }
    expect(offered).toBe(true)
    g.year = 1931
    for (let seed = 1; seed <= 60; seed++) {
      g.rng = seed
      g.queue = []
      expect(set.offer(ctxOf(g, s2))).toBe(false)
    }
  })

  it('guildStrike: the picket halves the fee and earns respect, crossing keeps it and names a rival, waiting slips the shoot', () => {
    const def = defOf('guildStrike')
    {
      const { g, s } = fixture('guildStrike')
      s.team.agent = agent({ loyalty: 60 })
      s.team.manager = agent({ loyalty: 90, name: 'Lou Park' })
      const rep = s.rep
      branch(g, s, def, 'bold', 'good')
      expect(s.pipeline[0].terms.fee).toBe(200_000)
      expect(s.rep).toBe(rep + 6)
      expect([s.team.agent.loyalty, s.team.manager.loyalty]).toEqual([62, 92])
    }
    {
      const { g, s } = fixture('guildStrike')
      const rep = s.rep
      const d = dataOf(def, g, s)
      expect(d.rid).toBe(rankOf(g, s).top[0]?.id ?? '')
      expect(d.rid).not.toBe('')
      branch(g, s, def, 'cash', 'good', d)
      expect(s.pipeline[0].terms.fee).toBe(400_000)
      expect(s.rep).toBe(rep - 12)
      if (d.rid) expect(s.memory.find((m) => m.id === d.rid)?.grudge).toBe(10)
    }
    {
      const { g, s } = fixture('guildStrike')
      branch(g, s, def, 'safe', 'good')
      expect(s.pipeline[0].lastYear).toBe(g.year + 1)
      expect(s.pipeline[0].terms.fee).toBe(400_000)
    }
    for (const stance of STANCES) expect(def.options[stance]?.odds, stance).toBeUndefined()
  })

  it('techShift: staying with film pays 10% more for three years, the new work adds buzz, costs film rep and marks the kind seen', () => {
    const def = defOf('techShift')
    const tvYear = firstYear('tv')
    {
      const { g, s } = fixture('techShift')
      const d = dataOf(def, g, s)
      expect(d.kind).toBe('tv')
      branch(g, s, def, 'safe', 'good', d)
      expect(s.cool['fee.film']).toBe(tvYear + 2)
      expect(s.cool['tech.tv']).toBe(tvYear)
      expect(feeMult(s, tvYear + 2, { kind: 'film', type: 'drama' })).toBeCloseTo(1.1, 10)
      expect(feeMult(s, tvYear + 2, { kind: 'tv', type: 'drama' })).toBeCloseTo(1, 10)
      expect(feeMult(s, tvYear + 3, { kind: 'film', type: 'drama' })).toBeCloseTo(1, 10)
    }
    {
      const { g, s } = fixture('techShift')
      s.pipeline = [proj({ stage: 'shoot', buzz: 20 }), proj({ id: 'p10', stage: 'post', buzz: 98 })]
      const rep = s.rep
      const fame = fameOf(g)
      branch(g, s, def, 'bold', 'good', { kind: 'tv' })
      expect(s.pipeline.map((p) => p.buzz)).toEqual([25, 100])
      expect(s.rep).toBe(rep - 3)
      expect(fameOf(g)).toBe(fame + 1)
      expect(s.cool['tech.tv']).toBe(tvYear)
    }
    // streaming is marked on its own key
    const f = newActor(5, { year: firstYear('streaming') })
    branch(f.g, f.s, def, 'safe', 'good', { kind: 'streaming' })
    expect(f.s.cool['tech.streaming']).toBe(f.g.year)
    expect(f.s.cool['tech.tv']).toBeUndefined()
    expect(def.options.safe!.odds).toBeUndefined()
    expect(def.options.bold!.odds).toBeUndefined()
    expect(def.options.cash).toBeUndefined()
  })

  it('scandalLeak: every answer moves the scandal and notoriety, denying and suing roll', () => {
    const def = defOf('scandalLeak')
    const notoriety = (g: GameState) => g.character.hidden.notoriety
    for (const [stance, which, scandal] of [
      ['safe', 'good', 15],
      ['bold', 'good', 5],
      ['bold', 'bad', 40],
      ['cash', 'good', 0],
      ['cash', 'bad', 30],
    ] as const) {
      const { g, s } = fixture('scandalLeak')
      s.scandal = 10
      s.rows = [{ y: g.year - 1, income: 400_000, spent: 0, rank: 0, of: 0, standing: 20, note: '' }]
      const n = notoriety(g)
      const fame = fameOf(g)
      const cash = g.character.money
      const { result } = branch(g, s, def, stance, which)
      expect(s.scandal, `${stance}/${which}`).toBe(10 + scandal)
      expect(notoriety(g), `${stance}/${which}`).toBe(n + 3)
      expect(fameOf(g)).toBe(stance === 'safe' ? fame - 1 : fame)
      if (stance === 'cash') {
        expect(result.paid).toBe(20_000)
        expect(g.character.money).toBe(cash - 20_000)
      } else expect(g.character.money).toBe(cash)
    }
    const f = fixture('scandalLeak')
    f.s.rep = 60
    f.s.team.press = { firm: 'Ink & Co', quality: 70, since: f.g.year }
    expect(def.options.bold!.odds!(f.g, f.s, {})).toBeCloseTo(0.35 + 60 / 200 + 70 / 200, 10)
    expect(def.options.cash!.odds!(f.g, f.s, {})).toBe(0.45)
    expect(def.options.safe!.odds).toBeUndefined()
  })

  it('poach: following costs two points of cut and resets loyalty, staying swaps in a weaker rep with no Person', () => {
    const def = defOf('poach')
    {
      const { g, s } = fixture('poach')
      const d = dataOf(def, g, s)
      expect(d.role).toBe('agent')
      expect(typeof d.rival).toBe('string')
      branch(g, s, def, 'safe', 'good', d)
      expect(s.team.agent).toMatchObject({ name: 'Mia Chen', firm: d.rival, loyalty: 50, quality: 60 })
      expect(s.team.agent!.cut).toBeCloseTo(0.12, 10)
    }
    {
      const { g, s } = fixture('poach')
      const person = createPerson(g, { relation: 'coworker', age: 40, gender: 'female', firstName: 'Mia', lastName: 'Chen', occupation: 'Talent Agent', relationship: 40 })
      s.team.agent = agent({ personId: person.id, loyalty: 70, quality: 80, cut: 0.11 })
      const d = dataOf(def, g, s)
      const before = g.rng
      branch(g, s, def, 'bold', 'good', d)
      expect(g.rng).toBe(before)
      const next = s.team.agent!
      expect(next.personId).toBe('')
      expect(next.name).toBe(d.name)
      expect(next.name).not.toBe('Mia Chen')
      expect(next).toMatchObject({ firm: 'Starlight Talent', quality: 65, cut: 0.11, loyalty: 55, since: g.year })
      expect(getPerson(g, person.id)).toBeUndefined() // a rep you were not close to leaves your contacts
    }
    {
      const { g, s } = fixture('poach')
      const person = createPerson(g, { relation: 'coworker', age: 40, gender: 'female', firstName: 'Mia', lastName: 'Chen', occupation: 'Talent Agent', relationship: 75 })
      s.team.agent = agent({ personId: person.id, loyalty: 70 })
      branch(g, s, def, 'bold', 'good')
      expect(getPerson(g, person.id)?.relation).toBe('friend')
    }
    {
      // the quality floor is 20, and a rep who is gone by the time you answer changes nothing
      const { g, s } = fixture('poach')
      s.team.agent = agent({ quality: 25 })
      branch(g, s, def, 'bold', 'good', { role: 'agent', rival: 'Apex', name: 'Sam Lee' })
      expect(s.team.agent!.quality).toBe(20)
      s.team.agent = null
      const before = JSON.stringify(s)
      branch(g, s, def, 'safe', 'good', { role: 'agent', rival: 'Apex', name: 'Sam Lee' })
      branch(g, s, def, 'bold', 'good', { role: 'agent', rival: 'Apex', name: 'Sam Lee' })
      expect(JSON.stringify(s)).toBe(before)
    }
    for (const stance of STANCES) expect(def.options[stance]?.odds, stance).toBeUndefined()
    expect(def.options.cash).toBeUndefined()
  })

  it('franchise: signing sets three pictures at +50% and typecasts, asking can also win 5% of the back-end, declining earns respect', () => {
    const def = defOf('franchise')
    {
      const { g, s } = fixture('franchise')
      s.type.drama = 10
      const fame = fameOf(g)
      branch(g, s, def, 'safe', 'good')
      expect(s.cool['franchise.drama']).toBe(3)
      expect(s.type.drama).toBe(35)
      expect(fameOf(g)).toBe(fame + 2)
      expect(feeMult(s, g.year, { kind: 'film', type: 'drama' })).toBeCloseTo(1.5, 10)
    }
    {
      const { g, s } = fixture('franchise')
      branch(g, s, def, 'bold', 'good')
      expect(s.pipeline[0].terms.points).toBeCloseTo(0.05, 10)
      expect(s.cool['franchise.drama']).toBe(3)
      const { g: h, s: t } = fixture('franchise')
      const rep = t.rep
      branch(h, t, def, 'bold', 'bad')
      expect(t.pipeline[0].terms.points).toBe(0)
      expect(t.cool['franchise.drama']).toBe(3)
      expect(t.rep).toBeLessThan(rep)
    }
    {
      const { g, s } = fixture('franchise')
      s.type.drama = 30
      const rep = s.rep
      branch(g, s, def, 'cash', 'good')
      expect(s.rep).toBe(rep + 2)
      expect(s.type.drama).toBe(25)
      expect(s.cool['franchise.drama']).toBeUndefined()
    }
    const f = fixture('franchise')
    f.s.team.agent = agent({ quality: 75 })
    expect(def.options.bold!.odds!(f.g, f.s, {})).toBeCloseTo(0.4 + 75 / 250, 10)
  })

  it('shelved: accepting drops the film with an unreleased credit, lobbying costs 3% and rolls at one in two, a miss slips the date', () => {
    const def = defOf('shelved')
    {
      const { g, s } = fixture('shelved')
      s.rep = 50
      const happy = g.character.stats.happiness
      branch(g, s, def, 'safe', 'good')
      expect(s.pipeline).toEqual([])
      expect(s.rep).toBe(47)
      expect(s.credits.at(-1)).toMatchObject({ title: 'The Last Echo', verdict: 'unreleased', popularity: 0, trust: false })
      expect(g.character.stats.happiness).toBeLessThan(happy)
    }
    {
      const { g, s } = fixture('shelved')
      const cash = g.character.money
      const { result } = branch(g, s, def, 'bold', 'good')
      expect(result.paid).toBe(30_000)
      expect(g.character.money).toBe(cash - 30_000)
      expect(s.pipeline[0].lastYear).toBe(g.year)
      const { g: h, s: t } = fixture('shelved')
      branch(h, t, def, 'bold', 'bad')
      expect(t.pipeline[0].lastYear).toBe(h.year + 1)
      expect(t.pipeline.length).toBe(1)
    }
    const f = fixture('shelved')
    expect(def.options.bold!.odds!(f.g, f.s, {})).toBe(0.5)
    expect(def.options.safe!.odds).toBeUndefined()
    // the project may be gone by the time you answer: no credit appears from nowhere
    const gone = fixture('shelved')
    gone.s.pipeline = []
    branch(gone.g, gone.s, def, 'safe', 'good', { id: 'p9', title: 'The Last Echo', fee: 1_000_000 })
    expect(gone.s.credits.length).toBe(0)
    expect(gone.s.pipeline).toEqual([])
  })

  it('censor: re-editing costs 8 quality, fighting costs 4% and rolls at 0.3 + institutions/200, going abroad earns respect and shrinks the release', () => {
    const def = defOf('censor')
    {
      const { g, s } = fixture('censor')
      branch(g, s, def, 'safe', 'good')
      expect(s.pipeline[0].quality).toBe(62)
    }
    {
      const { g, s } = fixture('censor')
      s.pipeline[0].terms.points = 0.05
      const rep = s.rep
      branch(g, s, def, 'cash', 'good')
      expect(s.pipeline[0].buzz).toBe(0)
      expect(s.pipeline[0].terms.points).toBeCloseTo(0.03, 10)
      expect(s.rep).toBe(rep + 2)
    }
    {
      const { g, s } = fixture('censor')
      s.pipeline[0].terms.points = 0.05
      const cash = g.character.money
      const { result } = branch(g, s, def, 'bold', 'good')
      expect(result.paid).toBe(40_000)
      expect(g.character.money).toBe(cash - 40_000)
      expect(s.pipeline[0].buzz).toBe(20)
      expect(s.pipeline[0].terms.points).toBeCloseTo(0.05, 10)
      const { g: h, s: t } = fixture('censor')
      t.pipeline[0].terms.points = 0.05
      branch(h, t, def, 'bold', 'bad')
      expect(t.pipeline[0].buzz).toBe(0)
      expect(t.pipeline[0].terms.points).toBeCloseTo(0.02, 10)
    }
    const f = fixture('censor')
    const odds = def.options.bold!.odds!(f.g, f.s, {})
    expect(odds).toBeGreaterThan(0.3)
    expect(odds).toBeLessThan(0.8)
    expect(def.options.safe!.odds).toBeUndefined()
  })

  it('injury: a double costs 1% and 3 quality, doing it yourself rolls at 0.4 + athleticism/250 for buzz or a hurt', () => {
    const def = defOf('injury')
    {
      const { g, s } = fixture('injury')
      s.pipeline[0].stage = 'post'
      const cash = g.character.money
      const { result } = branch(g, s, def, 'safe', 'good')
      expect(result.paid).toBe(5_000)
      expect(g.character.money).toBe(cash - 5_000)
      expect(s.pipeline[0].quality).toBe(67)
    }
    {
      // a shoot in progress takes the cost in the work put in, since the wrap sets the quality
      const { g, s } = fixture('injury')
      s.pipeline[0].developed = 10
      branch(g, s, def, 'safe', 'good')
      expect(s.pipeline[0].developed).toBe(7)
      expect(s.pipeline[0].quality).toBe(70)
    }
    {
      const { g, s } = fixture('injury')
      const happy = g.character.stats.happiness
      branch(g, s, def, 'bold', 'good')
      expect(s.pipeline[0].buzz).toBe(28)
      expect(g.character.stats.happiness).toBe(Math.min(100, happy + 4))
    }
    {
      const { g, s } = fixture('injury')
      const d = dataOf(def, g, s)
      expect(d.hurt).toBeGreaterThanOrEqual(10)
      expect(d.hurt).toBeLessThanOrEqual(25)
      const health = g.character.stats.health
      branch(g, s, def, 'bold', 'bad', d)
      expect(g.character.stats.health).toBe(Math.max(0, health - (d.hurt as number)))
    }
    const f = fixture('injury')
    f.g.character.hidden.athleticism = 50
    expect(def.options.bold!.odds!(f.g, f.s, {})).toBeCloseTo(0.4 + 50 / 250, 10)
  })

  it('rivalFeud: barbs raise the grudge by 20 and the buzz, ignoring lowers it by 5, a joint project rolls at 0.5 + rep/300', () => {
    const def = defOf('rivalFeud')
    const grudge = (s: ActorState) => s.memory.find((m) => m.id === 'actor.us.1990.0')?.grudge
    {
      const { g, s } = fixture('rivalFeud')
      s.pipeline = [proj({ stage: 'shoot', buzz: 10 })]
      const n = g.character.hidden.notoriety
      branch(g, s, def, 'bold', 'good')
      expect(grudge(s)).toBe(60)
      expect(s.pipeline[0].buzz).toBe(16)
      expect(g.character.hidden.notoriety).toBe(n + 2)
    }
    {
      const { g, s } = fixture('rivalFeud')
      branch(g, s, def, 'safe', 'good')
      expect(grudge(s)).toBe(35)
    }
    {
      const { g, s } = fixture('rivalFeud')
      s.pipeline = [proj({ stage: 'shoot', buzz: 10 })]
      branch(g, s, def, 'cash', 'good')
      expect(grudge(s)).toBe(15)
      expect(s.pipeline[0].buzz).toBe(15)
      const { g: h, s: t } = fixture('rivalFeud')
      branch(h, t, def, 'cash', 'bad')
      expect(grudge(t)).toBe(45)
    }
    const f = fixture('rivalFeud')
    const d = dataOf(def, f.g, f.s)
    expect(d).toMatchObject({ rid: 'actor.us.1990.0', rname: 'Dana Whitfield' })
    f.s.rep = 60
    expect(def.options.cash!.odds!(f.g, f.s, d)).toBeCloseTo(0.5 + 60 / 300, 10)
  })

  it('names the feuding rival with the highest grudge, then the most losses', () => {
    const def = defOf('rivalFeud')
    const f = fixture('rivalFeud')
    f.s.memory = [
      { id: 'a', name: 'Ada Reyes', met: 1, won: 0, lost: 2, grudge: 10, last: f.g.year },
      { id: 'b', name: 'Bo Tran', met: 1, won: 0, lost: 0, grudge: 35, last: f.g.year },
      { id: 'c', name: 'Cy Lund', met: 1, won: 0, lost: 4, grudge: 35, last: f.g.year },
    ]
    expect(dataOf(def, f.g, f.s)).toMatchObject({ rid: 'c', rname: 'Cy Lund' })
  })
})

describe('actor events: scandal, range and press levers', () => {
  it('apologizing is free, once a year, and needs a scandal [RF3]', () => {
    const { g, s } = newActor(5)
    g.character.hidden.fame = 30
    apologize(ctxOf(g, s))
    expect(s.scandal).toBe(0)
    expect(g.character.hidden.fame).toBe(30)
    expect(yearActionsUsed(g, 'actor.apologize')).toBe(0)
    s.scandal = 50
    const cash = g.character.money
    apologize(ctxOf(g, s))
    expect([s.scandal, fameOf(g), g.character.money]).toEqual([25, 29, cash])
    const once = JSON.stringify(g)
    apologize(ctxOf(g, s))
    expect(JSON.stringify(g.flags)).toBe(JSON.stringify(JSON.parse(once).flags))
    expect([s.scandal, fameOf(g)]).toEqual([25, 29])
    expect(yearActionsUsed(g, 'actor.apologize')).toBe(1)
    // a new year opens it again
    g.yearActions = {}
    apologize(ctxOf(g, s))
    expect(s.scandal).toBe(0)
  })

  it('crisis PR re-checks the cost inside run: short of cash changes nothing, paid it takes 40 and 3 notoriety', () => {
    const { g, s } = newActor(5)
    s.scandal = 70
    s.rows = [{ y: g.year - 1, income: 500_000, spent: 0, rank: 0, of: 0, standing: 20, note: '' }]
    g.character.hidden.notoriety = 20
    g.character.money = 10_000
    const before = JSON.stringify(g.character)
    crisisPr(ctxOf(g, s))
    expect(JSON.stringify(g.character)).toBe(before)
    expect(s.scandal).toBe(70)
    expect(yearActionsUsed(g, 'actor.crisisPr')).toBe(0)
    expect(notices(g).length).toBeGreaterThan(0)
    g.character.money = 100_000
    crisisPr(ctxOf(g, s))
    expect(g.character.money).toBe(50_000)
    expect(s.scandal).toBe(30)
    expect(g.character.hidden.notoriety).toBe(17)
    crisisPr(ctxOf(g, s))
    expect([g.character.money, s.scandal]).toEqual([50_000, 30])
    // no scandal, nothing to repair
    const clean = newActor(5)
    const cash = clean.g.character.money
    crisisPr(ctxOf(clean.g, clean.s))
    expect(clean.g.character.money).toBe(cash)
  })

  it('crisis PR has a floor of 1,000 x scale when last year earned nothing, so zero cash always refuses', () => {
    const { g, s } = newActor(5)
    s.scandal = 60
    g.character.money = 0
    crisisPr(ctxOf(g, s))
    expect(s.scandal).toBe(60)
    expect(g.character.money).toBe(0)
    g.character.money = 5_000
    crisisPr(ctxOf(g, s))
    expect(g.character.money).toBe(4_000)
    expect(s.scandal).toBe(20)
  })

  it('lying low closes auditions for the year, takes 30 off the scandal, and works once', () => {
    const { g, s } = newActor(5)
    layLow(ctxOf(g, s))
    expect([s.layLow, s.scandal]).toEqual([0, 0])
    s.scandal = 45
    layLow(ctxOf(g, s))
    expect(s.scandal).toBe(15)
    expect(s.layLow).toBe(g.year)
    expect(auditionBlock(g, s)).toMatch(/laying low/)
    layLow(ctxOf(g, s))
    expect(s.scandal).toBe(15)
    g.year += 1
    expect(auditionBlock(g, s)).toBeNull()
  })

  it('range work needs a manager and a typecast, costs 8% of last net (at least 1,500 x scale) and works once a year', () => {
    const { g, s } = newActor(5)
    s.type.action = 60
    s.rows = [{ y: g.year - 1, income: 1_000_000, spent: 0, rank: 0, of: 0, standing: 20, note: '' }]
    const cash = g.character.money
    rangeWork(ctxOf(g, s), 'action')
    expect([s.type.action, g.character.money]).toEqual([60, cash]) // no manager
    s.team.manager = agent({ name: 'Lou Park', firm: 'Northlight Management' })
    rangeWork(ctxOf(g, s), 'drama')
    expect(g.character.money).toBe(cash) // not typecast in drama
    g.character.money = 50_000
    rangeWork(ctxOf(g, s), 'action')
    expect([s.type.action, g.character.money]).toEqual([60, 50_000]) // 80,000 is out of reach
    g.character.money = 200_000
    rangeWork(ctxOf(g, s), 'action')
    expect([s.type.action, g.character.money]).toEqual([45, 120_000])
    rangeWork(ctxOf(g, s), 'action')
    expect([s.type.action, g.character.money]).toEqual([45, 120_000])
    expect(yearActionsUsed(g, 'actor.range')).toBe(1)
    // the floor
    const poor = newActor(5)
    poor.s.type.comedy = 20
    poor.s.team.manager = agent({})
    poor.g.character.money = 10_000
    rangeWork(ctxOf(poor.g, poor.s), 'comedy')
    expect([poor.s.type.comedy, poor.g.character.money]).toEqual([5, 8_500])
    // a type that is not one of the five does nothing
    const odd = newActor(5)
    odd.s.team.manager = agent({})
    const stable = JSON.stringify(odd.g.character)
    rangeWork(ctxOf(odd.g, odd.s), 'opera' as TypeId)
    expect(JSON.stringify(odd.g.character)).toBe(stable)
  })

  it('hires a press agent for one year up front, and fires them for free', () => {
    const { g, s } = newActor(5)
    s.rows = [{ y: g.year - 1, income: 400_000, spent: 0, rank: 0, of: 0, standing: 20, note: '' }]
    g.character.money = 15_000
    hirePress(ctxOf(g, s))
    expect(s.team.press).toBeNull() // 20,000 is out of reach
    expect(g.character.money).toBe(15_000)
    g.character.money = 100_000
    hirePress(ctxOf(g, s))
    expect(s.team.press).not.toBeNull()
    expect(s.team.press!.quality).toBeGreaterThanOrEqual(30)
    expect(s.team.press!.quality).toBeLessThanOrEqual(90)
    expect(s.team.press!.since).toBe(g.year)
    expect(g.character.money).toBe(80_000)
    hirePress(ctxOf(g, s))
    expect(g.character.money).toBe(80_000) // already have one
    firePress(ctxOf(g, s))
    expect(s.team.press).toBeNull()
    expect(g.character.money).toBe(80_000)
    firePress(ctxOf(g, s))
    expect(g.character.money).toBe(80_000)
    // the same year, the same agency: no shopping around for a better draw
    hirePress(ctxOf(g, s))
    const first = s.team.press!.quality
    firePress(ctxOf(g, s))
    g.character.money = 100_000
    hirePress(ctxOf(g, s))
    expect(s.team.press!.quality).toBe(first)
  })

  it('charges the retainer each later year, lifts the buzz of what releases, and lets an unpaid press agent go with no debt', () => {
    const { g, s } = newActor(5)
    s.team.press = { firm: 'Ink & Co', quality: 70, since: g.year - 1 }
    s.rows = [{ y: g.year - 1, income: 400_000, spent: 0, rank: 0, of: 0, standing: 20, note: '' }]
    s.pipeline = [
      proj({ id: 'p1', stage: 'shoot', kind: 'film', budget: 'indie', lastYear: g.year - 1, buzz: 10 }), // releases this tick
      proj({ id: 'p2', stage: 'shoot', kind: 'film', budget: 'studio', lastYear: g.year - 1, buzz: 10 }), // goes to post, not a release yet
      proj({ id: 'p3', stage: 'post', lastYear: g.year - 1, buzz: 95 }), // releases this tick, buzz caps at 100
      proj({ id: 'p4', stage: 'shoot', kind: 'tv', budget: 'network', lastYear: g.year, buzz: 10 }), // shot already this year
      proj({ id: 'p5', stage: 'shoot', role: 'Extra', budget: 'indie', lastYear: g.year - 1, buzz: 10 }),
    ]
    g.character.money = 100_000
    stepPress(ctxOf(g, s))
    expect(g.character.money).toBe(80_000)
    expect(s.pipeline.map((p) => p.buzz)).toEqual([17, 10, 100, 10, 10])
    // a press agent hired this year was paid at hire: no second charge
    const fresh = newActor(5)
    fresh.s.team.press = { firm: 'Ink & Co', quality: 70, since: fresh.g.year }
    fresh.s.pipeline = [proj({ stage: 'post', lastYear: fresh.g.year - 1, buzz: 0 })]
    stepPress(ctxOf(fresh.g, fresh.s))
    expect(fresh.g.character.money).toBe(100_000)
    expect(fresh.s.pipeline[0].buzz).toBe(7)
    // unpaid: they leave, nothing goes negative
    const broke = newActor(5)
    broke.s.team.press = { firm: 'Ink & Co', quality: 70, since: broke.g.year - 1 }
    broke.s.rows = [{ y: broke.g.year - 1, income: 400_000, spent: 0, rank: 0, of: 0, standing: 20, note: '' }]
    broke.s.pipeline = [proj({ stage: 'post', lastYear: broke.g.year - 1, buzz: 0 })]
    broke.g.character.money = 100
    stepPress(ctxOf(broke.g, broke.s))
    expect(broke.s.team.press).toBeNull()
    expect(broke.g.character.money).toBe(100)
    expect(broke.s.pipeline[0].buzz).toBe(0)
    // nobody on retainer: nothing moves
    const none = newActor(5)
    const before = JSON.stringify(none.g)
    stepPress(ctxOf(none.g, none.s))
    expect(JSON.stringify(none.g)).toBe(before)
  })

  it('keeps every lever notice and log line in voice, success and refusal alike', () => {
    const { g, s } = newActor(5)
    g.character.hidden.fame = 30
    g.character.money = 500_000
    s.scandal = 90
    s.rows = [{ y: g.year - 1, income: 400_000, spent: 0, rank: 0, of: 0, standing: 20, note: '' }]
    s.type.action = 60
    s.team.manager = agent({ name: 'Lou Park', firm: 'Northlight Management' })
    const run = (fn: (c: CareerCtx<ActorState>) => void): void => {
      g.yearActions = {}
      fn(ctxOf(g, s))
    }
    const ops: ((c: CareerCtx<ActorState>) => void)[] = [apologize, crisisPr, layLow, (c) => rangeWork(c, 'action'), hirePress, firePress]
    // each twice: the second call is the refusal; then once more from a clean slate on an empty record
    for (const fn of ops) {
      run(fn)
      fn(ctxOf(g, s))
    }
    const empty = newActor(6)
    empty.g.character.money = 0
    for (const fn of [apologize, crisisPr, layLow, (c: CareerCtx<ActorState>) => rangeWork(c, 'drama'), hirePress, firePress]) fn(ctxOf(empty.g, empty.s))
    const texts = [...g.queue, ...empty.g.queue].filter((m): m is NoticeModal => m.kind === 'notice')
    const logs = [...g.log, ...empty.g.log].flatMap((y) => y.entries.map((e) => e.text))
    expect(texts.length).toBeGreaterThan(8)
    expect(logs.length).toBeGreaterThan(3)
    for (const n of texts) {
      expect(voiceProblems(n.text, 'outcome'), n.text).toEqual([])
      expect(n.text.length, n.text).toBeLessThanOrEqual(120)
      expect(voiceProblems(n.title, 'title'), n.title).toEqual([])
    }
    for (const line of logs) {
      expect(voiceProblems(line, 'log'), line).toEqual([])
      expect(line.length, line).toBeLessThanOrEqual(90)
    }
  })

  it('runs the press step inside the sim once a year [RF3]', () => {
    const { g, s } = newActor(5)
    s.team.press = { firm: 'Ink & Co', quality: 60, since: g.year - 1 }
    s.rows = [{ y: g.year - 1, income: 400_000, spent: 0, rank: 0, of: 0, standing: 20, note: '' }]
    nextYear(g, actorSim.yearly)
    const cash = g.character.money
    expect(cash).toBeLessThan(100_000)
    const once = JSON.stringify(g)
    const rng = JSON.stringify(g.rng)
    actorSim.yearly(g)
    expect(JSON.stringify(g)).toBe(once)
    expect(JSON.stringify(g.rng)).toBe(rng)
  })
})

describe('actor events: through the whole year loop', () => {
  it('keeps a decade of sim years finite with crises answered by every stance', () => {
    for (const stance of STANCES) {
      for (const seed of [11, 12]) {
        const { g, s } = newActor(seed, { year: 1990 })
        g.character.hidden.fame = 45
        s.rep = 60
        s.team.agent = agent({ loyalty: 70 })
        for (let i = 0; i < 12; i++) {
          nextYear(g, yearlySpecial)
          for (let guard = 0; guard < 10 && g.queue.length; guard++) {
            const m = g.queue.shift()!
            if (m.kind !== 'choice' || !m.scriptId) continue
            const pick = m.choices.find((c) => c.id === stance) ?? m.choices[0]
            runScript(g, m.scriptId, pick.id, m.data, m)
          }
          expect(finiteJson(g), `${stance}/${seed}/${i}`).toEqual([])
          expect(Number.isFinite(g.character.money)).toBe(true)
          expect(starPower(g, actorStore.view(g))).toBeGreaterThanOrEqual(0)
        }
      }
    }
  }, 120_000)
})
