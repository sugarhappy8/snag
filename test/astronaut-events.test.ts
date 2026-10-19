import { afterEach, describe, expect, it } from 'vitest'
import { seeded } from '../src/game/assets'
import { yearActionsUsed } from '../src/game/core'
import { policyOf, writePolicy } from '../src/game/nation/state'
import { hasScript, runScript } from '../src/game/scripts'
import { yearlySpecial } from '../src/game/special'
import { astronautJobNodes } from '../src/game/special/astronaut'
import { ASTRO_DEFS, INQUIRY_SCRIPT, MEDICAL_SCRIPT, RESEARCH_SCRIPT, appealOdds, astroCrises, forcedChoice, hotLine, reportCard } from '../src/game/special/astronaut-events'
import { astronautSim } from '../src/game/special/astronaut-sim'
import { astronautStore, type AstroState, type FlightRec, type Inquiry } from '../src/game/special/astronaut-state'
import { fundingIndex } from '../src/game/special/astronaut-world'
import { fameOf, hire, ownerKey } from '../src/game/special/common'
import { applyEffects, bestStance, defineCrises, type CrisisDef, type CrisisSet, type Stance } from '../src/game/special/kit/crisis'
import { ACTION_BUDGET, careerCtx, pendingCareerChoices, setCareerAudit, type AuditEvent, type CareerCtx } from '../src/game/special/kit/year'
import type { ChoiceModal, GameState, Json, MenuAction, ModalItem, NoticeModal } from '../src/game/types'
import { assertHonestOdds, assertMenuPure, careerRoots, checkLedger, finiteJson, nextYear, voiceProblems } from './career-kit'
import { makeTestGame } from './helpers'

type Def = CrisisDef<AstroState, any>
interface Fx { g: GameState; s: AstroState }

const IDS = ['scheduleSqueeze', 'appropriations', 'anomaly', 'crewFriction', 'boneScan', 'homeFront', 'lostCrew'] as const
type DefId = (typeof IDS)[number]
const STANCES: Stance[] = ['safe', 'bold', 'cash']

const defOf = (id: string): Def => {
  const d = ASTRO_DEFS.find((x) => x.id === id)
  if (!d) throw new Error(`no def ${id}`)
  return d
}

const ctxOf = (g: GameState, s: AstroState = astronautStore.mut(g)): CareerCtx<AstroState> => careerCtx(g, 'astronaut', s, { ...ACTION_BUDGET })

/** A notice-kind modal: runScript keeps no replay token for it, so a script's own guards are what is tested. */
let serial = 0
const fake = (): ModalItem => ({ kind: 'notice', id: `e${++serial}`, title: '', text: '' })

const notices = (g: GameState): NoticeModal[] => g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
const choices = (g: GameState): ChoiceModal[] => g.queue.filter((m): m is ChoiceModal => m.kind === 'choice')
const choiceOf = (g: GameState, scriptId: string): ChoiceModal | undefined => choices(g).find((m) => m.scriptId === scriptId)

function take(g: GameState, scriptId: string): ChoiceModal {
  const at = g.queue.findIndex((m) => m.kind === 'choice' && m.scriptId === scriptId)
  if (at < 0) throw new Error(`no ${scriptId} modal queued`)
  return g.queue.splice(at, 1)[0] as ChoiceModal
}

/** The state a replay must not move: everything but the script replay tokens. */
const flat = (g: GameState): string => {
  const c = structuredClone(g)
  delete c.flags['core.resolvedScriptModals']
  return JSON.stringify(c)
}

afterEach(() => setCareerAudit(null))

/** A 2026 life with a Mission Specialist job, a migrated record (standing 70, skills 42) and cash. */
function newAstro(seed = 5, o: { year?: number; country?: string; level?: number; age?: number; salary?: number } = {}): Fx {
  const age = o.age ?? 36
  const g = makeTestGame(seed, { age, countryId: o.country ?? 'us' })
  g.year = o.year ?? 2026
  g.log = [{ age, year: g.year, entries: [] }]
  g.character.money = 500_000
  hire(g, { defId: 'astronaut', title: 'Mission Specialist', company: 'Orbital Exploration Agency', salary: o.salary ?? 100_000, level: o.level ?? 2, performance: 70, data: { agency: 'oea', lastMissionAge: -1 } })
  return { g, s: astronautStore.mut(g) }
}

const flightRec = (o: Partial<FlightRec> = {}): FlightRec => ({ year: 2025, type: 'station', role: 'specialist', days: 180, regimen: 'standard', result: 'clean', crew: ['Ana Wu', 'Li Chen'], bone: 90, dose: 20, ...o })

const inquiry = (o: Partial<Inquiry> = {}): Inquiry => ({ id: 'iq1', year: 2025, cause: 'hardware', lost: ['Ana Wu', 'Li Chen'], involved: false, yearsOpen: 0, status: 'open', stance: '', coverup: false, ...o })

const person = (relation: 'spouse' | 'child', age = 36) => ({
  id: `p-${relation}`,
  firstName: 'Sam',
  lastName: 'Lee',
  gender: 'female' as const,
  age,
  alive: true,
  relation,
  relationship: 80,
  stats: { happiness: 50, health: 50, smarts: 50, looks: 50 },
  money: 0,
  occupation: 'x',
  traits: [],
  yearsKnown: 5,
  livesWithPlayer: true,
  notes: [],
  data: {},
})

/** A starved space line, a gloomy public and a lobby under water: the funding index falls under 45. */
function starve(f: Fx): void {
  const p = structuredClone(policyOf(f.g, 'us'))
  p.national.budget.space = 0.5
  writePolicy(f.g, p)
  f.s.mood = 20
  f.s.lobby = -6
}

/** A life in which `id` is eligible (weight above 0), a fresh one per call. */
function fixture(id: DefId, seed = 5): Fx {
  const f = newAstro(seed)
  const { g, s } = f
  switch (id) {
    case 'scheduleSqueeze':
      starve(f)
      s.safety = 40
      return f
    case 'appropriations':
      s.cool.cut = g.year
      return f
    case 'anomaly':
      s.flights = [flightRec({ year: g.year - 1, days: 180 })]
      s.skills.team = 40
      s.skills.eva = 60
      return f
    case 'crewFriction':
      s.flights = [flightRec({ year: g.year - 1, days: 180 })]
      s.skills.team = 40
      return f
    case 'boneScan':
      s.flights = [flightRec({ year: g.year - 1, days: 10 })]
      s.bone = 70
      return f
    case 'homeFront':
      s.family = 75
      g.people.push(person('spouse'))
      return f
    case 'lostCrew':
      s.inquiries = [inquiry({ year: g.year - 1 })]
      return f
  }
}

/** The def's crisis data from the fixture, the way the offer would make it. */
const dataOf = (def: Def, g: GameState, s: AstroState): Record<string, Json> => def.make(g, s, seeded(`t|${def.id}`))

/** Applies one branch of one option without the roll (the odds are tested apart): effects, then then(). */
function branch(g: GameState, s: AstroState, def: Def, stance: Stance, which: 'good' | 'bad', d: Record<string, Json> = dataOf(def, g, s)) {
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
  runScript(g, `career.astronaut.${id}`, choice, { d, owner, year }, modal)
}

/** A crisis set for one def only, under its own career id so the scripts of the real set stay untouched. Made once per def. */
const solos = new Map<string, CrisisSet<AstroState>>()
function solo(def: Def): CrisisSet<AstroState> {
  let set = solos.get(def.id)
  if (!set) {
    set = defineCrises({ career: 'astronautt', store: astronautStore, talent: 'Academics', defs: [def] })
    solos.set(def.id, set)
  }
  return set
}

/** Offers `def` on a clone of the fixture by trying rng seeds until the 35% roll lands. */
function offerOne(id: DefId, talent: boolean): { g: GameState; modal: ChoiceModal; s: AstroState } {
  const def = defOf(id)
  const set = solo(def)
  for (let seed = 1; seed <= 200; seed++) {
    const f = fixture(id)
    if (talent) f.g.character.talent = 'Academics'
    f.g.rng = seed
    if (!set.offer(ctxOf(f.g, f.s))) continue
    const modal = choices(f.g).find((m) => m.scriptId === `career.astronautt.${def.id}`)
    if (modal) return { g: f.g, modal, s: f.s }
  }
  throw new Error(`${id} was never offered`)
}

describe('astronaut events: seven defs', () => {
  it('registers every def as career.astronaut.<id> with 2 to 3 stances and distinct labels', () => {
    expect(ASTRO_DEFS.map((d) => d.id)).toEqual([...IDS])
    for (const def of ASTRO_DEFS) {
      expect(hasScript(`career.astronaut.${def.id}`)).toBe(true)
      const opts = STANCES.map((s) => def.options[s]).filter((o) => !!o)
      expect(opts.length).toBeGreaterThanOrEqual(2)
      expect(opts.length).toBeLessThanOrEqual(3)
      expect(new Set(opts.map((o) => o!.label)).size).toBe(opts.length)
      expect(def.cool ?? 4).toBeGreaterThanOrEqual(1)
    }
    for (const id of ['medical', 'inquiry', 'admin', 'research']) expect(hasScript(`career.astronaut.${id}`)).toBe(true)
    expect(astroCrises.offer).toBeTypeOf('function')
  })

  it('makes every def reachable through its weight, and gates each by its condition', () => {
    const w = (id: DefId, f: Fx): number => defOf(id).weight(f.g, f.s)
    for (const id of IDS) expect(w(id, fixture(id)), id).toBeGreaterThan(0)

    // scheduleSqueeze: safety under 50 and funding under 45
    const sq = fixture('scheduleSqueeze')
    expect(fundingIndex(sq.g, sq.s)).toBeLessThan(45)
    sq.s.safety = 50
    expect(w('scheduleSqueeze', sq)).toBe(0)
    sq.s.safety = 49
    expect(w('scheduleSqueeze', sq)).toBeGreaterThan(0)
    const flush = newAstro(5)
    flush.s.safety = 30
    expect(fundingIndex(flush.g, flush.s)).toBeGreaterThanOrEqual(45)
    expect(w('scheduleSqueeze', flush)).toBe(0)

    // appropriations: a thin year or a cut line, rank 2 and up
    const ap = fixture('appropriations')
    expect(w('appropriations', ap)).toBeGreaterThan(0)
    ap.g.character.job!.level = 1
    expect(w('appropriations', ap)).toBe(0)
    const calm = newAstro(5)
    expect(fundingIndex(calm.g, calm.s)).toBeGreaterThanOrEqual(50)
    expect(w('appropriations', calm)).toBe(0)
    expect(w('appropriations', fixture('scheduleSqueeze'))).toBeGreaterThan(0) // funding under 50 is enough

    // anomaly: a tour over 7 days last year that went clean; the weight falls as the team skill rises
    const an = fixture('anomaly')
    const low = w('anomaly', an)
    an.s.skills.team = 90
    expect(w('anomaly', an)).toBeLessThan(low)
    an.s.flights = [flightRec({ year: an.g.year - 1, days: 7 })]
    expect(w('anomaly', an)).toBe(0)
    an.s.flights = [flightRec({ year: an.g.year - 2, days: 180 })]
    expect(w('anomaly', an)).toBe(0)
    an.s.flights = [flightRec({ year: an.g.year - 1, days: 180, result: 'abort' })]
    expect(w('anomaly', an)).toBe(0)

    // crewFriction: a stay over 90 days and a team skill under 55
    const cf = fixture('crewFriction')
    cf.s.skills.team = 55
    expect(w('crewFriction', cf)).toBe(0)
    cf.s.skills.team = 54
    expect(w('crewFriction', cf)).toBeGreaterThan(0)
    cf.s.flights = [flightRec({ year: cf.g.year - 1, days: 90 })]
    expect(w('crewFriction', cf)).toBe(0)

    // boneScan: a flight last year and bone under 75
    const bs = fixture('boneScan')
    bs.s.bone = 75
    expect(w('boneScan', bs)).toBe(0)
    bs.s.bone = 74
    expect(w('boneScan', bs)).toBeGreaterThan(0)
    bs.s.flights = []
    expect(w('boneScan', bs)).toBe(0)

    // homeFront: strain 70 and up with a partner or a child under 18
    const hf = fixture('homeFront')
    hf.s.family = 69
    expect(w('homeFront', hf)).toBe(0)
    hf.s.family = 70
    expect(w('homeFront', hf)).toBeGreaterThan(0)
    hf.g.people = [person('child', 9)]
    expect(w('homeFront', hf)).toBeGreaterThan(0)
    hf.g.people = [person('child', 19)]
    expect(w('homeFront', hf)).toBe(0)
    hf.g.people = []
    expect(w('homeFront', hf)).toBe(0)

    // lostCrew: an inquiry opened this year or last
    const lc = fixture('lostCrew')
    lc.s.inquiries = [inquiry({ year: lc.g.year })]
    expect(w('lostCrew', lc)).toBeGreaterThan(0)
    lc.s.inquiries = [inquiry({ year: lc.g.year - 2 })]
    expect(w('lostCrew', lc)).toBe(0)
    lc.s.inquiries = []
    expect(w('lostCrew', lc)).toBe(0)
  })

  it('builds branches without writing: weight, scene, odds, good() and bad() are pure', () => {
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

  it('marks the bestStance option from the resolver odds and only with Academics', () => {
    for (const id of IDS) {
      const def = defOf(id)
      const plain = offerOne(id, false)
      expect(plain.modal.choices.every((c) => c.hint === undefined), `${id} without Academics`).toBe(true)
      const gifted = offerOne(id, true)
      const d = (gifted.modal.data as unknown as { d: Record<string, Json> }).d
      const best = bestStance(gifted.g, astronautStore.view(gifted.g), d, def)
      const hinted = gifted.modal.choices.filter((c) => c.hint)
      expect(hinted.map((c) => c.id), id).toEqual([best])
      expect(hinted[0].hint).toMatch(/Looks best/)
      expect(hinted[0].hint).not.toMatch(/will/)
      const opt = def.options[best as Stance]!
      if (opt.odds) expect(hinted[0].hint).toMatch(/about \d+%/)
      else expect(hinted[0].hint).not.toContain('%')
    }
  })

  it('rolls the odds it hints', () => {
    for (const def of ASTRO_DEFS) {
      assertHonestOdds(def, () => {
        const f = fixture(def.id as DefId)
        return { g: f.g, s: f.s, d: dataOf(def, f.g, f.s) }
      })
    }
    // the rolled options are exactly the two the design names
    expect(defOf('anomaly').options.bold?.odds).toBeTypeOf('function')
    expect(defOf('crewFriction').options.bold?.odds).toBeTypeOf('function')
    const an = fixture('anomaly')
    an.s.skills.eva = 60
    expect(defOf('anomaly').options.bold!.odds!(an.g, an.s, {})).toBeCloseTo(0.55 + 60 / 200, 10)
    const cf = fixture('crewFriction')
    cf.s.skills.team = 40
    expect(defOf('crewFriction').options.bold!.odds!(cf.g, cf.s, {})).toBeCloseTo(0.5 + 40 / 200, 10)
  }, 120_000)

  it('keeps all text in voice and uses no wording like moon landing, in any era', () => {
    const texts: { role: 'scene' | 'outcome' | 'title'; text: string; where: string }[] = []
    for (const year of [1962, 2026]) {
      for (const id of IDS) {
        const def = defOf(id)
        const f = fixture(id)
        f.g.year = year
        const d = dataOf(def, f.g, f.s)
        texts.push({ role: 'title', text: def.title, where: `${id} title` })
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
      expect(t.text, `${t.where}: ${t.text}`).not.toMatch(/moon landing|walk(ed)? on the moon|lunar landing/i)
      expect(t.text.includes(String.fromCharCode(0x2014))).toBe(false)
    }
  })

  it('offers one choice a year, forced choices first, and replays change nothing [RF3]', () => {
    // a medical board and an eligible appropriations hearing: the board takes the one slot, the random crisis waits
    for (let seed = 1; seed <= 30; seed++) {
      const f = fixture('appropriations')
      f.s.dose = 90
      f.g.rng = seed
      nextYear(f.g, astronautSim.yearly)
      const mine = choices(f.g).filter((m) => m.scriptId?.startsWith('career.'))
      expect(mine.map((m) => m.scriptId), `seed ${seed}`).toEqual([MEDICAL_SCRIPT])
    }
    // with no forced choice due, a random one arrives about a third of the years, never two
    let offers = 0
    let found: { g: GameState; modal: ChoiceModal } | null = null
    for (let seed = 1; seed <= 60; seed++) {
      const f = fixture('appropriations')
      f.s.cool.cut = f.g.year + 1 // the line stays cut into the year the sim ticks
      f.g.rng = seed
      nextYear(f.g, astronautSim.yearly)
      const mine = choices(f.g).filter((m) => m.scriptId?.startsWith('career.astronaut.'))
      expect(mine.length).toBeLessThanOrEqual(1)
      expect(finiteJson(f.g)).toEqual([])
      if (mine.length === 1) {
        offers++
        if (!found) found = { g: f.g, modal: mine[0] }
      }
    }
    expect(offers).toBeGreaterThan(5)
    expect(offers).toBeLessThan(45)
    if (!found) throw new Error('no crisis was offered')
    const { g, modal } = found
    expect(pendingCareerChoices(g)).toBe(1)

    // the yearly hook again in the same year and age: nothing moves
    const queued = JSON.stringify(g)
    astronautSim.yearly(g)
    expect(JSON.stringify(g)).toBe(queued)

    const pre = structuredClone(g)
    runScript(g, modal.scriptId!, 'safe', modal.data, modal)
    const once = JSON.stringify(g)
    expect(once).not.toBe(JSON.stringify(pre))
    runScript(g, modal.scriptId!, 'safe', modal.data, modal)
    expect(JSON.stringify(g)).toBe(once)
    const settled = flat(g)
    runScript(g, modal.scriptId!, 'safe', modal.data, { ...modal, id: 'again' })
    expect(flat(g)).toBe(settled)
    const data = modal.data as unknown as { d: Record<string, Json>; owner: string; year: number }
    const other = structuredClone(pre)
    runScript(other, modal.scriptId!, 'safe', { ...data, owner: 'v2:9:someone-else' }, { ...modal, id: 'owner' })
    expect(flat(other)).toBe(flat(pre))
    const later = structuredClone(pre)
    later.year += 1
    const expected = flat(later)
    runScript(later, modal.scriptId!, 'safe', modal.data, { ...modal, id: 'year' })
    expect(flat(later)).toBe(expected)
    const bogus = structuredClone(pre)
    runScript(bogus, modal.scriptId!, 'fold', modal.data, { ...modal, id: 'bogus' })
    expect(flat(bogus)).toBe(flat(pre))
  })

  it('books every dollar a crisis moves, whichever way the roll goes', () => {
    for (const id of IDS) {
      const def = defOf(id)
      for (const stance of STANCES) {
        if (!def.options[stance]) continue
        for (let seed = 1; seed <= 12; seed++) {
          const f = fixture(id)
          f.g.rng = seed
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

  it('survives junk crisis data in a stale or tampered modal, and keeps every meter in range [RF1]', () => {
    for (const id of IDS) {
      const def = defOf(id)
      for (const junk of [null, 'x', [], { d: null }, { d: 'x' }, { d: { name: 5, more: 'bad', days: {}, pay: 'x' } }] as unknown as Json[]) {
        for (const stance of STANCES) {
          if (!def.options[stance]) continue
          const g = fixture(id).g
          const data = junk && typeof junk === 'object' && !Array.isArray(junk) ? { ...(junk as Record<string, Json>), owner: ownerKey(g), year: g.year } : junk
          runScript(g, `career.astronaut.${id}`, stance, data, fake())
          expect(finiteJson(g), `${id}/${stance}`).toEqual([])
        }
      }
    }
    for (const start of [0, 100]) {
      for (const id of IDS) {
        const def = defOf(id)
        for (const stance of STANCES) {
          if (!def.options[stance]) continue
          for (const which of ['good', 'bad'] as const) {
            const f = fixture(id)
            Object.assign(f.s, { standing: start, peak: start, safety: Math.max(15, Math.min(95, start)), mood: start, lobby: start === 0 ? -6 : 20, bone: Math.max(15, start), muscle: Math.max(15, start), dose: start, family: start })
            f.s.skills = { eva: start, pilot: start, fit: start, team: start }
            branch(f.g, f.s, def, stance, which)
            const t = astronautStore.mut(f.g)
            const tag = `${id}/${stance}/${which}@${start}`
            for (const [name, v, lo, hi] of [['standing', t.standing, 0, 100], ['peak', t.peak, 0, 100], ['safety', t.safety, 15, 95], ['mood', t.mood, 0, 100], ['lobby', t.lobby, -6, 20], ['bone', t.bone, 15, 100], ['muscle', t.muscle, 15, 100], ['dose', t.dose, 0, 100], ['family', t.family, 0, 100], ['team', t.skills.team, 0, 100]] as const) {
              expect(Number.isFinite(v), `${tag} ${name}`).toBe(true)
              expect(v, `${tag} ${name}`).toBeGreaterThanOrEqual(lo)
              expect(v, `${tag} ${name}`).toBeLessThanOrEqual(hi)
            }
            expect(finiteJson(f.g), tag).toEqual([])
          }
        }
      }
    }
  })
})

describe('astronaut events: what each def does', () => {
  it('scheduleSqueeze: a concern and a refusal cost standing and build safety, signing off earns standing and hurries the next flight', () => {
    const def = defOf('scheduleSqueeze')
    for (const [stance, standing, safety] of [['safe', -3, 4], ['bold', -6, 6]] as const) {
      const { g, s } = fixture('scheduleSqueeze')
      s.standing = 60
      s.safety = 40
      branch(g, s, def, stance, 'good')
      expect([s.standing, s.safety, s.mark.rush], stance).toEqual([60 + standing, 40 + safety, false])
    }
    const { g, s } = fixture('scheduleSqueeze')
    s.standing = 60
    s.safety = 40
    branch(g, s, def, 'cash', 'good')
    expect([s.standing, s.safety, s.mark.rush]).toEqual([63, 40, true])
    for (const stance of STANCES) expect(def.options[stance]?.odds, stance).toBeUndefined()
  })

  it('appropriations: testifying lifts the lobby (a hostile room costs standing), briefing reporters lifts mood and fame, staying out does nothing', () => {
    const def = defOf('appropriations')
    {
      const { g, s } = fixture('appropriations')
      s.mood = 60
      s.lobby = 2
      s.standing = 60
      branch(g, s, def, 'bold', 'good')
      expect([s.lobby, s.standing]).toEqual([8, 60])
    }
    {
      const { g, s } = fixture('appropriations')
      s.mood = 30
      s.lobby = 2
      s.standing = 60
      branch(g, s, def, 'bold', 'good')
      expect([s.lobby, s.standing]).toEqual([11, 57])
      s.lobby = 18
      branch(g, s, def, 'bold', 'good')
      expect(s.lobby).toBe(20)
    }
    {
      const { g, s } = fixture('appropriations')
      s.mood = 50
      const fame = fameOf(g)
      branch(g, s, def, 'cash', 'good')
      expect([s.mood, fameOf(g)]).toEqual([54, fame + 1])
    }
    {
      const { g, s } = fixture('appropriations')
      const before = JSON.stringify([s.mood, s.lobby, s.standing, fameOf(g)])
      branch(g, s, def, 'safe', 'good')
      expect(JSON.stringify([s.mood, s.lobby, s.standing, fameOf(g)])).toBe(before)
    }
  })

  it('anomaly: fixing it outside rolls at 0.55 + eva/200 for an EVA or an aborted tour, waiting adds three days of dose and strain, aborting docks half the pay', () => {
    const def = defOf('anomaly')
    {
      const { g, s } = fixture('anomaly')
      s.standing = 60
      const evas = s.tally.evas
      branch(g, s, def, 'bold', 'good')
      expect([s.standing, s.tally.evas, s.flights[0].result]).toEqual([63, evas + 1, 'clean'])
    }
    {
      const { g, s } = fixture('anomaly')
      s.standing = 60
      branch(g, s, def, 'bold', 'bad')
      expect([s.standing, s.flights[0].result]).toEqual([57, 'abort'])
    }
    {
      const { g, s } = fixture('anomaly')
      s.dose = 20
      s.family = 10
      branch(g, s, def, 'safe', 'good')
      expect(s.dose).toBeCloseTo(20.4, 5) // 3 days at 0.12 a day, kept to one decimal
      expect(s.family).toBeCloseTo(10.1, 5) // 3 days of strain at 1.4 per 30 days
      expect(s.flights[0].result).toBe('clean')
    }
    {
      const { g, s } = fixture('anomaly')
      const d = dataOf(def, g, s)
      expect(d.days).toBe(180)
      expect(d.pay).toBeGreaterThan(0)
      expect(d.pay).toBeLessThanOrEqual(0.4 * 100_000)
      const cash = g.character.money
      const mood = s.mood
      const { result } = branch(g, s, def, 'cash', 'good', d)
      expect(result.paid).toBe(Math.round((d.pay as number) / 2))
      expect(g.character.money).toBe(cash - result.paid)
      expect([s.mood, s.flights[0].result]).toEqual([mood - 2, 'abort'])
    }
  })

  it('crewFriction: splitting shifts cuts research a fifth this year, mediating rolls at 0.5 + team/200, saying nothing costs team skill', () => {
    const def = defOf('crewFriction')
    {
      const { g, s } = fixture('crewFriction')
      branch(g, s, def, 'safe', 'good')
      expect(s.cool.split).toBe(g.year)
    }
    {
      const { g, s } = fixture('crewFriction')
      s.skills.team = 40
      s.standing = 60
      branch(g, s, def, 'bold', 'good')
      expect([s.skills.team, s.standing]).toEqual([43, 60])
      const { g: h, s: t } = fixture('crewFriction')
      t.skills.team = 40
      t.standing = 60
      branch(h, t, def, 'bold', 'bad')
      expect([t.skills.team, t.standing]).toEqual([40, 57])
    }
    const { g, s } = fixture('crewFriction')
    s.skills.team = 40
    branch(g, s, def, 'cash', 'good')
    expect(s.skills.team).toBe(36)
    expect(def.options.safe!.odds).toBeUndefined()
    expect(def.options.cash!.odds).toBeUndefined()
  })

  it('boneScan: full rehab is paid and rebuilds bone and muscle, returning early earns standing and risks a fracture, standard care does nothing', () => {
    const def = defOf('boneScan')
    {
      const { g, s } = fixture('boneScan')
      s.muscle = 80
      const cash = g.character.money
      const { result } = branch(g, s, def, 'safe', 'good')
      expect(result.paid).toBeGreaterThan(0)
      expect(g.character.money).toBe(cash - result.paid)
      expect([s.bone, s.muscle]).toEqual([72.5, 86])
    }
    {
      // no cash for the program: nothing is paid and nothing is rebuilt
      const { g, s } = fixture('boneScan')
      g.character.money = 5
      const { result } = branch(g, s, def, 'safe', 'good')
      expect(result.paid).toBe(0)
      expect(g.character.money).toBe(5)
      expect(s.bone).toBe(70)
    }
    {
      const { g, s } = fixture('boneScan')
      s.standing = 60
      branch(g, s, def, 'bold', 'good')
      expect([s.standing, s.cool.early]).toEqual([64, g.year])
    }
    {
      const { g, s } = fixture('boneScan')
      const before = JSON.stringify([s.bone, s.muscle, s.standing, s.cool, g.character.money])
      branch(g, s, def, 'cash', 'good')
      expect(JSON.stringify([s.bone, s.muscle, s.standing, s.cool, g.character.money])).toBe(before)
    }
    for (const stance of STANCES) expect(def.options[stance]?.odds, stance).toBeUndefined()
  })

  it('boneScan: a return-early flag brings a 15% stress fracture after the next flight, and only then', () => {
    const run = (early: boolean, seed: number): number => {
      const f = newAstro(5)
      f.s.flights = [flightRec({ year: f.g.year, days: 10 })]
      f.s.bone = 100
      if (early) f.s.cool.early = f.g.year
      f.g.rng = seed
      const health = f.g.character.stats.health
      nextYear(f.g, astronautSim.yearly)
      return health - f.g.character.stats.health
    }
    let hurt = 0
    for (let seed = 1; seed <= 200; seed++) {
      expect(run(false, seed), `plain ${seed}`).toBe(0)
      if (run(true, seed) > 0) hurt++
    }
    expect(hurt / 200).toBeGreaterThan(0.08)
    expect(hurt / 200).toBeLessThan(0.25)
    // the flag covers one year: with no flight that year it expires
    const f = newAstro(5)
    f.s.cool.early = f.g.year
    f.s.bone = 100
    for (let seed = 1; seed <= 40; seed++) {
      const h = structuredClone(f.g)
      h.rng = seed
      const health = h.character.stats.health
      nextYear(h, astronautSim.yearly)
      expect(h.character.stats.health).toBe(health)
    }
  })

  it('homeFront: leave grounds the year and eases strain, a video eases it a little, flying on strains the partner', () => {
    const def = defOf('homeFront')
    {
      const { g, s } = fixture('homeFront')
      const happy = g.character.stats.happiness
      branch(g, s, def, 'safe', 'good')
      expect([s.family, s.mark.groundedYear, g.character.stats.happiness]).toEqual([50, g.year, Math.min(100, happy + 6)])
    }
    {
      const { g, s } = fixture('homeFront')
      branch(g, s, def, 'bold', 'good')
      expect([s.family, s.mark.groundedYear]).toEqual([69, 0])
    }
    {
      const { g, s } = fixture('homeFront')
      s.family = 75
      branch(g, s, def, 'cash', 'good')
      expect(g.people.find((p) => p.id === 'p-spouse')!.relationship).toBe(74)
      expect(s.family).toBe(75)
      const { g: h, s: t } = fixture('homeFront')
      t.family = 88
      branch(h, t, def, 'cash', 'good')
      expect(h.people.find((p) => p.id === 'p-spouse')!.relationship).toBe(64) // -6, and -10 more at strain 85
    }
    {
      // a child and no partner: nobody to lose, and no crash
      const { g, s } = fixture('homeFront')
      g.people = [person('child', 8)]
      branch(g, s, def, 'cash', 'good')
      expect(g.people[0].relationship).toBe(80)
    }
    for (const stance of STANCES) expect(def.options[stance]?.odds, stance).toBeUndefined()
  })

  it('lostCrew: speaking at the memorial earns fame and mood, staying with the families earns standing and eases strain', () => {
    const def = defOf('lostCrew')
    {
      const { g, s } = fixture('lostCrew')
      const d = dataOf(def, g, s)
      expect(def.scene(g, s, d)).toContain('Ana Wu')
      s.mood = 50
      const fame = fameOf(g)
      branch(g, s, def, 'bold', 'good', d)
      expect([s.mood, fameOf(g)]).toEqual([53, fame + 1])
    }
    {
      const { g, s } = fixture('lostCrew')
      s.standing = 60
      s.family = 30
      branch(g, s, def, 'safe', 'good')
      expect([s.standing, s.family]).toEqual([62, 26])
    }
    expect(def.options.cash).toBeUndefined()
    expect(def.options.safe!.odds).toBeUndefined()
    expect(def.options.bold!.odds).toBeUndefined()
  })
})

describe('astronaut forced choices', () => {
  /** An astronaut whose inquiry opened this year: after one tick it has been open a year and the testimony is due. */
  function testimonyFx(cause: Inquiry['cause'], o: { involved?: boolean; level?: number } = {}): Fx & { m: ChoiceModal } {
    const f = newAstro(5, { level: o.level ?? 2 })
    f.s.inquiries = [inquiry({ id: 'iq1', year: f.g.year, cause, involved: o.involved ?? true })]
    nextYear(f.g, astronautSim.yearly)
    return { ...f, m: take(f.g, INQUIRY_SCRIPT) }
  }

  it('asks for testimony after a year when you were involved or hold rank 3, and closes a stranger inquiry for a junior at once', () => {
    const involved = testimonyFx('hardware')
    expect(involved.m.choices.map((c) => c.id).filter((id) => !id.startsWith('blame.'))).toEqual(['protect', 'recuse'])
    expect(involved.m.choices).toHaveLength(4)
    expect(involved.m.text).toMatch(/What will you do\?$/)
    expect(astronautStore.view(involved.g).inquiries[0]).toMatchObject({ status: 'open', yearsOpen: 1 })

    const senior = testimonyFx('hardware', { involved: false, level: 3 })
    expect(senior.m.choices).toHaveLength(4)
    expect(astronautStore.view(senior.g).inquiries[0]).toMatchObject({ status: 'open', yearsOpen: 1 })

    const junior = newAstro(5, { level: 2 })
    junior.s.inquiries = [inquiry({ id: 'iq1', year: junior.g.year, involved: false })]
    nextYear(junior.g, astronautSim.yearly)
    expect(choiceOf(junior.g, INQUIRY_SCRIPT)).toBeUndefined()
    expect(astronautStore.view(junior.g).inquiries[0]).toMatchObject({ status: 'closed', yearsOpen: 1 })
  })

  it('moves safety, standing and blame by the stated numbers for the inquiry choices', () => {
    const answer = (cause: Inquiry['cause'], pickId: (m: ChoiceModal) => string, o: { involved?: boolean; level?: number } = {}) => {
      const f = testimonyFx(cause, o)
      const before = astronautStore.view(f.g)
      const id = pickId(f.m)
      runScript(f.g, INQUIRY_SCRIPT, id, f.m.data, f.m)
      return { before, after: astronautStore.view(f.g), id }
    }
    // naming the true cause: safety +10, and the board closes it
    {
      const { before, after } = answer('hardware', () => 'blame.hardware')
      expect(after.safety).toBe(before.safety + 10)
      expect(after.standing).toBe(before.standing)
      expect(after.inquiries[0]).toMatchObject({ status: 'closed', stance: 'cause', coverup: false })
    }
    // naming a cause that isn't it: safety +3
    {
      const { before, after, id } = answer('hardware', (m) => m.choices.find((c) => c.id.startsWith('blame.') && c.id !== 'blame.hardware')!.id)
      expect(id).not.toBe('blame.hardware')
      expect(after.safety).toBe(before.safety + 3)
      expect(after.inquiries[0]).toMatchObject({ status: 'closed', stance: 'cause' })
    }
    // when the truth is the schedule, saying so costs standing
    {
      const { before, after } = answer('schedule', () => 'blame.schedule')
      expect([after.safety, after.standing]).toEqual([before.safety + 10, before.standing - 4])
    }
    // protecting the agency: standing +3, safety -6, a cover-up that can leak
    {
      const { before, after } = answer('hardware', () => 'protect')
      expect([after.standing, after.safety]).toEqual([before.standing + 3, before.safety - 6])
      expect(after.inquiries[0]).toMatchObject({ status: 'closed', stance: 'protect', coverup: true })
    }
    // recusing: blame +1 only when you were involved
    {
      const { before, after } = answer('hardware', () => 'recuse')
      expect(after.tally.blame).toBe(before.tally.blame + 1)
      expect(after.inquiries[0]).toMatchObject({ status: 'closed', stance: 'recuse' })
      expect([after.standing, after.safety]).toEqual([before.standing, before.safety])
      const clear = answer('hardware', () => 'recuse', { involved: false, level: 3 })
      expect(clear.after.tally.blame).toBe(clear.before.tally.blame)
    }
  })

  it('marks the option that matches Inquiry.cause, with Academics only, and shuffles where it sits', () => {
    const plain = testimonyFx('crew')
    expect(plain.m.choices.every((c) => c.hint === undefined)).toBe(true)
    let first = 0
    for (let seed = 1; seed <= 30; seed++) {
      const f = newAstro(seed)
      f.g.lifeId = `life-${seed}`
      f.g.character.talent = 'Academics'
      f.s.inquiries = [inquiry({ id: 'iq1', year: f.g.year, cause: 'procedure', involved: true })]
      nextYear(f.g, astronautSim.yearly)
      const m = take(f.g, INQUIRY_SCRIPT)
      const hinted = m.choices.filter((c) => c.hint)
      expect(hinted.map((c) => c.id), `seed ${seed}`).toEqual(['blame.procedure'])
      expect(hinted[0].hint).not.toMatch(/will/)
      if (m.choices[0].id === 'blame.procedure') first++
    }
    expect(first).toBeGreaterThan(3)
    expect(first).toBeLessThan(27)
  })

  it('replays a testimony or medical choice with no effect, and rejects a stale or foreign one [RF3]', () => {
    const t = testimonyFx('hardware')
    runScript(t.g, INQUIRY_SCRIPT, 'protect', t.m.data, t.m)
    const once = flat(t.g)
    runScript(t.g, INQUIRY_SCRIPT, 'protect', t.m.data, t.m)
    runScript(t.g, INQUIRY_SCRIPT, 'recuse', t.m.data, { ...t.m, id: 'again' })
    expect(flat(t.g)).toBe(once)

    const u = testimonyFx('hardware')
    const pre = flat(u.g)
    const data = u.m.data as unknown as Record<string, Json>
    runScript(u.g, INQUIRY_SCRIPT, 'protect', { ...data, owner: 'v2:9:someone-else' }, fake())
    runScript(u.g, INQUIRY_SCRIPT, 'fold', u.m.data, fake())
    runScript(u.g, INQUIRY_SCRIPT, 'blame.nothing', u.m.data, fake())
    runScript(u.g, INQUIRY_SCRIPT, 'protect', { ...data, id: 'iq9' }, fake())
    u.g.year += 1
    runScript(u.g, INQUIRY_SCRIPT, 'protect', u.m.data, fake())
    u.g.year -= 1
    expect(flat(u.g)).toBe(pre)

    const med = newAstro(5)
    med.s.dose = 90
    nextYear(med.g, astronautSim.yearly)
    const board = take(med.g, MEDICAL_SCRIPT)
    runScript(med.g, MEDICAL_SCRIPT, 'ground', board.data, board)
    const grounded = flat(med.g)
    runScript(med.g, MEDICAL_SCRIPT, 'ground', board.data, board)
    runScript(med.g, MEDICAL_SCRIPT, 'retire', board.data, { ...board, id: 'again' })
    expect(flat(med.g)).toBe(grounded)
    expect(med.g.character.job).not.toBeNull()
    const old = structuredClone(med.g)
    old.year += 1
    const ref = flat(old)
    runScript(old, MEDICAL_SCRIPT, 'retire', board.data, fake())
    expect(flat(old)).toBe(ref)
  })

  it('waits a year when the slot is taken: the medical board first, then the testimony', () => {
    const f = newAstro(5)
    f.s.dose = 90
    f.s.inquiries = [inquiry({ id: 'iq1', year: f.g.year, cause: 'hardware', involved: true })]
    f.g.rng = 3
    nextYear(f.g, astronautSim.yearly)
    expect(choices(f.g).map((m) => m.scriptId)).toEqual([MEDICAL_SCRIPT])
    const board = take(f.g, MEDICAL_SCRIPT)
    runScript(f.g, MEDICAL_SCRIPT, 'appeal', board.data, board)
    f.g.queue = []
    expect(astronautStore.view(f.g).inquiries[0]).toMatchObject({ status: 'open', yearsOpen: 1, stance: '' })
    nextYear(f.g, astronautSim.yearly)
    expect(choices(f.g).map((m) => m.scriptId)).toEqual([INQUIRY_SCRIPT]) // the board sits out its year
    // left unanswered to year 3, the inquiry closes as a recusal with blame
    f.g.queue = []
    nextYear(f.g, astronautSim.yearly)
    expect(astronautStore.view(f.g).inquiries[0]).toMatchObject({ status: 'closed', stance: 'recuse' })
    expect(astronautStore.view(f.g).tally.blame).toBe(1)
  })

  it('asks the medical board at dose 85 or thin bones, and a ground job, an appeal or retirement each do what they say', () => {
    const board = (o: { dose?: number; bone?: number } = {}) => {
      const f = newAstro(5)
      f.s.dose = o.dose ?? 90
      f.s.bone = o.bone ?? 100
      nextYear(f.g, astronautSim.yearly)
      return { ...f, m: choiceOf(f.g, MEDICAL_SCRIPT) }
    }
    expect(board({ dose: 84, bone: 100 }).m).toBeUndefined()
    expect(board({ dose: 85, bone: 100 }).m).toBeDefined()
    expect(board({ dose: 0, bone: 56 }).m).toBeUndefined() // bone recovers a little in the tick: 56 + 3 stays over 55
    expect(board({ dose: 0, bone: 40 }).m).toBeDefined()

    const a = board()
    expect(a.m!.choices.map((c) => c.id)).toEqual(['ground', 'appeal', 'retire'])
    expect(a.m!.text).toMatch(/What will you do\?$/)
    expect(a.m!.choices.every((c) => c.hint === undefined)).toBe(true) // no talent
    take(a.g, MEDICAL_SCRIPT)
    const before = astronautStore.view(a.g)
    runScript(a.g, MEDICAL_SCRIPT, 'ground', a.m!.data, a.m!)
    const after = astronautStore.view(a.g)
    expect([after.mark.groundedYear, after.standing, after.cool.ground]).toEqual([a.g.year, before.standing + 2, a.g.year])
    const mission = astronautJobNodes(a.g).find((n) => 'id' in n && n.id === 'astro.mission') as MenuAction
    expect(mission.disabledReason?.(a.g)).toMatch(/leave/)

    const r = board()
    take(r.g, MEDICAL_SCRIPT)
    runScript(r.g, MEDICAL_SCRIPT, 'retire', r.m!.data, r.m!)
    expect(r.g.character.job).toBeNull()
    expect(r.g.character.careerHistory.at(-1)?.reason).toBe('retired')

    // a full dose has nothing to appeal: the board offers no appeal at all
    const full = board({ dose: 100 })
    expect(full.m!.choices.map((c) => c.id)).toEqual(['ground', 'retire'])
  })

  it('rolls the appeal at 0.4 + health/200, hints it with Academics, and grounds the year on a miss', () => {
    const f = newAstro(5)
    f.s.dose = 90
    f.g.character.stats.health = 60
    expect(appealOdds(f.g)).toBeCloseTo(0.7, 10)
    f.g.character.stats.health = 100
    expect(appealOdds(f.g)).toBeCloseTo(0.9, 10)
    f.g.character.stats.health = 0
    expect(appealOdds(f.g)).toBeCloseTo(0.4, 10)
    f.g.character.stats.health = 60
    f.g.character.talent = 'Academics'
    nextYear(f.g, astronautSim.yearly)
    const m = take(f.g, MEDICAL_SCRIPT)
    const hinted = m.choices.filter((c) => c.hint)
    expect(hinted.map((c) => c.id)).toEqual(['appeal'])
    expect(hinted[0].hint).toContain('about 70%')
    expect(hinted[0].hint).not.toMatch(/will/)
    let grounded = 0
    const n = 600
    for (let seed = 1; seed <= n; seed++) {
      const h = structuredClone(f.g)
      h.rng = seed
      runScript(h, MEDICAL_SCRIPT, 'appeal', m.data, m)
      if (astronautStore.view(h).mark.groundedYear === h.year) grounded++
      else expect(h.character.job).not.toBeNull()
    }
    expect(Math.abs(grounded / n - 0.3)).toBeLessThan(0.05)
  })

  it('keeps an inquiry open for a senior who is not involved, and the dose 100 ban holds inside run() by direct call', () => {
    const { g, s } = newAstro(5)
    s.dose = 100
    const row = astronautJobNodes(g).find((n) => 'id' in n && n.id === 'astro.mission') as MenuAction
    expect(row.disabledReason?.(g)).toMatch(/radiation/)
    const flags = JSON.stringify(g.flags)
    const queue = g.queue.length
    row.run(g)
    expect(JSON.stringify(g.flags)).toBe(flags)
    expect(g.queue.length).toBe(queue + 1)
    expect(notices(g).at(-1)?.text).toMatch(/radiation/)
    expect(choiceOf(g, 'career.astronaut.board')).toBeUndefined()
  })
})

describe('astronaut report card and the yearly extras', () => {
  const card = (g: GameState): NoticeModal | undefined => notices(g).find((m) => m.title === 'Corps Report')

  it('posts one notice when a flight, a class, an inquiry or a funding swing moved something', () => {
    // a flight last year
    const f = newAstro(5)
    f.s.flights = [flightRec({ year: f.g.year })]
    nextYear(f.g, astronautSim.yearly)
    const n = card(f.g)
    expect(n?.text).toMatch(/^Funding \d+(, (up|down) \d+)?\. Mood \d+\. Safety \d+\. Bone \d+, strain \d+\.$/)
    expect(n!.text.length).toBeLessThanOrEqual(120)
    expect(notices(f.g).filter((m) => m.title === 'Corps Report')).toHaveLength(1)

    // a quiet year: no flight, no class (2027 is not a class year), no inquiry, no swing
    const q = newAstro(5)
    nextYear(q.g, astronautSim.yearly)
    expect(card(q.g)).toBeUndefined()

    // a funding swing of 8 or more, worded up or down
    const s = newAstro(5)
    s.s.fund = [60]
    s.s.mood = 100
    s.s.lobby = 20
    nextYear(s.g, astronautSim.yearly)
    const now = astronautStore.view(s.g).fund.at(-1)!
    const diff = now - 60
    if (Math.abs(diff) >= 8) expect(card(s.g)?.text).toContain(`Funding ${now}, ${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)}.`)

    // an inquiry opened this year (a peer's loss in the tick itself)
    const i = newAstro(5)
    i.s.inquiries = [inquiry({ id: 'iq1', year: i.g.year + 1, involved: false })]
    nextYear(i.g, astronautSim.yearly)
    expect(card(i.g)).toBeDefined()

    // called directly it reads the record and moves nothing but the queue
    const d = newAstro(5)
    d.s.flights = [flightRec({ year: d.g.year - 1 })]
    d.s.fund = [50, 58]
    const json = JSON.stringify(d.s)
    reportCard(ctxOf(d.g, d.s))
    expect(JSON.stringify(d.s)).toBe(json)
    expect(card(d.g)?.text).toContain('Funding 58, up 8.')
  })

  it('halves the lobby every year, toward zero', () => {
    const f = newAstro(5)
    f.s.lobby = 20
    nextYear(f.g, astronautSim.yearly)
    expect(astronautStore.view(f.g).lobby).toBe(10)
    nextYear(f.g, astronautSim.yearly)
    expect(astronautStore.view(f.g).lobby).toBe(5)
    const g = newAstro(5)
    g.s.lobby = -5
    nextYear(g.g, astronautSim.yearly)
    expect(astronautStore.view(g.g).lobby).toBe(-2)
    // this year's funding counted the whole lobby before it halved
    const h = newAstro(5)
    h.s.lobby = 20
    const f27 = fundingIndex(h.g, h.s, 2027)
    nextYear(h.g, astronautSim.yearly)
    expect(astronautStore.view(h.g).fund.at(-1)).toBe(f27)
  })

  it('calls forcedChoice itself from the yearly hook and never twice in a year', () => {
    const f = newAstro(5)
    f.s.dose = 90
    const ctx = ctxOf(f.g, f.s)
    expect(forcedChoice(ctx)).toBe(true)
    expect(choices(f.g).filter((m) => m.scriptId === MEDICAL_SCRIPT)).toHaveLength(1)
    const budget = careerCtx(f.g, 'astronaut', f.s, { choices: 0, notices: 2 })
    f.g.queue = []
    f.s.cool.medical = 0
    expect(forcedChoice(budget)).toBe(false)
    expect(choices(f.g)).toHaveLength(0)
  })
})

describe('astronaut lobby, concern and research rows', () => {
  const row = (g: GameState, id: string): MenuAction => {
    const n = astronautJobNodes(g).find((x) => 'id' in x && x.id === id)
    if (!n || n.type !== 'action') throw new Error(`no ${id} row`)
    return n
  }

  it('lobbies at rank 3 or fame 20, once a year: +6 (+9 and standing -3 in a gloomy year), capped at 20', () => {
    const { g, s } = newAstro(5, { level: 2 })
    const r = row(g, 'astro.lobby')
    expect(r.disabledReason?.(g)).toMatch(/Flight Engineer/)
    const before = JSON.stringify(g.flags)
    r.run(g)
    expect(JSON.stringify(g.flags)).toBe(before) // a direct run of a closed row changes nothing
    g.character.job!.level = 3
    s.mood = 60
    s.lobby = 0
    s.standing = 60
    expect(r.disabledReason?.(g)).toBeNull()
    r.run(g)
    expect([astronautStore.view(g).lobby, astronautStore.view(g).standing]).toEqual([6, 60])
    expect(r.disabledReason?.(g)).toMatch(/already/)
    const once = JSON.stringify(g.flags)
    r.run(g)
    expect(JSON.stringify(g.flags)).toBe(once)

    const f = newAstro(5, { level: 2 })
    f.g.character.hidden.fame = 20
    f.s.mood = 30
    f.s.standing = 60
    row(f.g, 'astro.lobby').run(f.g)
    expect([astronautStore.view(f.g).lobby, astronautStore.view(f.g).standing]).toEqual([9, 57])
    const c = newAstro(5, { level: 3 })
    c.s.lobby = 18
    row(c.g, 'astro.lobby').run(c.g)
    expect(astronautStore.view(c.g).lobby).toBe(20)
  })

  it('files a safety concern once a year: standing -3, safety +3 under 70, a concern on record, and one point of blame off', () => {
    const { g, s } = newAstro(5)
    s.safety = 60
    s.standing = 60
    s.tally.blame = 2
    const r = row(g, 'astro.concern')
    expect(r.disabledReason?.(g)).toBeNull()
    r.run(g)
    const t = astronautStore.view(g)
    expect([t.standing, t.safety, t.tally.concerns, t.tally.blame]).toEqual([57, 63, 1, 1])
    expect(r.disabledReason?.(g)).toMatch(/already/)
    const once = JSON.stringify(g.flags)
    r.run(g)
    expect(JSON.stringify(g.flags)).toBe(once)
    const high = newAstro(5)
    high.s.safety = 80
    row(high.g, 'astro.concern').run(high.g)
    expect([astronautStore.view(high.g).safety, astronautStore.view(high.g).tally.blame]).toEqual([80, 0])
  })

  it('offers three lines of research, marks the hot one for Academics only, and pays x1.5 on it', () => {
    const { g } = newAstro(5)
    g.character.stats.smarts = 100
    const r = row(g, 'astro.research')
    expect(r.disabledReason?.(g)).toBeNull()
    r.run(g)
    const m = take(g, RESEARCH_SCRIPT)
    expect(m.choices.map((c) => c.id)).toEqual(['bone', 'solar', 'materials'])
    expect(m.choices.every((c) => c.hint === undefined)).toBe(true)
    expect(m.text).toMatch(/What will you do\?$/)
    expect(yearActionsUsed(g, 'astro.research')).toBe(0) // opening the lab spends nothing until you pick

    g.queue = []
    g.character.talent = 'Academics'
    r.run(g)
    const k = take(g, RESEARCH_SCRIPT)
    const hot = hotLine(g)
    expect(k.choices.filter((c) => c.hint).map((c) => c.id)).toEqual([hot])
    expect(hotLine(structuredClone(g))).toBe(hot)

    // the same draw pays half again as much on the hot line
    const pay = (line: string): number => {
      const h = structuredClone(g)
      h.rng = 11
      const was = (h.flags['special.astronaut'] as { research?: number } | undefined)?.research ?? 0
      runScript(h, RESEARCH_SCRIPT, line, k.data, k)
      return ((h.flags['special.astronaut'] as { research: number }).research ?? 0) - was
    }
    const cold = ['bone', 'solar', 'materials'].find((x) => x !== hot)!
    expect(pay(cold)).toBeGreaterThanOrEqual(8) // smarts 100: 2 + 6 + 0 to 4
    expect(pay(hot)).toBe(Math.round(pay(cold) * 1.5))
  })

  it('credits research once a year, caps the lifetime at 200, trims it after an intense tour or split shifts, and refuses a replay', () => {
    const run = (setup: (f: Fx) => void = () => {}): { g: GameState; gained: number } => {
      const f = newAstro(5)
      f.g.character.stats.smarts = 100
      setup(f)
      f.g.rng = 11
      row(f.g, 'astro.research').run(f.g)
      const m = take(f.g, RESEARCH_SCRIPT)
      const line = ['bone', 'solar', 'materials'].find((x) => x !== hotLine(f.g))!
      const was = (f.g.flags['special.astronaut'] as { research?: number } | undefined)?.research ?? 0
      runScript(f.g, RESEARCH_SCRIPT, line, m.data, m)
      const now = (f.g.flags['special.astronaut'] as { research: number }).research
      return { g: f.g, gained: now - was }
    }
    const plain = run()
    expect(plain.gained).toBeGreaterThanOrEqual(8)
    expect(yearActionsUsed(plain.g, 'astro.research')).toBe(1)
    expect(row(plain.g, 'astro.research').disabledReason?.(plain.g)).toMatch(/already/)
    expect(run((f) => (f.s.cool.intense = f.g.year)).gained).toBe(Math.round(plain.gained * 0.7))
    expect(run((f) => (f.s.cool.split = f.g.year)).gained).toBe(Math.round(plain.gained * 0.8))
    expect(run((f) => (f.s.cool.intense = f.g.year - 1)).gained).toBe(plain.gained) // last year's tour no longer counts
    // a specialist's last flight pays a quarter more
    expect(run((f) => (f.s.flights = [flightRec({ year: f.g.year - 1, role: 'specialist' })])).gained).toBe(Math.round(plain.gained * 1.25))

    // a replayed modal pays nothing more
    const f = newAstro(5)
    f.g.character.stats.smarts = 100
    row(f.g, 'astro.research').run(f.g)
    const m = take(f.g, RESEARCH_SCRIPT)
    runScript(f.g, RESEARCH_SCRIPT, 'solar', m.data, m)
    const once = flat(f.g)
    runScript(f.g, RESEARCH_SCRIPT, 'solar', m.data, m)
    runScript(f.g, RESEARCH_SCRIPT, 'bone', m.data, { ...m, id: 'again' })
    expect(flat(f.g)).toBe(once)
    // a foreign or stale modal, a bad line
    const h = newAstro(5)
    row(h.g, 'astro.research').run(h.g)
    const n = take(h.g, RESEARCH_SCRIPT)
    const pre = flat(h.g)
    runScript(h.g, RESEARCH_SCRIPT, 'dark', n.data, fake())
    runScript(h.g, RESEARCH_SCRIPT, 'bone', { ...(n.data as Record<string, Json>), owner: 'v2:9:x' }, fake())
    h.g.year += 1
    runScript(h.g, RESEARCH_SCRIPT, 'bone', n.data, fake())
    h.g.year -= 1
    expect(flat(h.g)).toBe(pre)

    // the lifetime cap: points stop at 200 and the row closes
    const cap = newAstro(5)
    cap.g.flags['special.astronaut'] = { owner: ownerKey(cap.g), graduated: true, research: 199, missions: 0, spacewalks: 0, moonLandings: 0, marsLandings: 0, articles: 0, planets: [], firstWords: '' } as unknown as Json
    cap.g.character.stats.smarts = 100
    row(cap.g, 'astro.research').run(cap.g)
    const c = take(cap.g, RESEARCH_SCRIPT)
    runScript(cap.g, RESEARCH_SCRIPT, 'bone', c.data, c)
    expect((cap.g.flags['special.astronaut'] as { research: number }).research).toBe(200)
    cap.g.yearActions = {}
    expect(row(cap.g, 'astro.research').disabledReason?.(cap.g)).toBeTruthy()
  })

  it('keeps the voice of every forced and research script, with finite numbers and no holes in the text', () => {
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    // inquiry (every answer), medical (every answer), research (every line)
    for (const id of ['blame.hardware', 'protect', 'recuse']) {
      const f = newAstro(5)
      f.s.inquiries = [inquiry({ id: 'iq1', year: f.g.year, cause: 'hardware', involved: true })]
      nextYear(f.g, astronautSim.yearly)
      const m = take(f.g, INQUIRY_SCRIPT)
      runScript(f.g, INQUIRY_SCRIPT, id, m.data, m)
    }
    for (const id of ['ground', 'appeal', 'retire']) {
      for (const seed of [1, 2]) {
        const f = newAstro(5)
        f.s.dose = 90
        nextYear(f.g, astronautSim.yearly)
        const m = take(f.g, MEDICAL_SCRIPT)
        f.g.rng = seed
        runScript(f.g, MEDICAL_SCRIPT, id, m.data, m)
      }
    }
    for (const id of ['bone', 'solar', 'materials']) {
      const f = newAstro(5)
      row(f.g, 'astro.research').run(f.g)
      const m = take(f.g, RESEARCH_SCRIPT)
      runScript(f.g, RESEARCH_SCRIPT, id, m.data, m)
    }
    setCareerAudit(null)
    expect(events.filter((e) => e.t === 'text').length).toBeGreaterThan(10)
    for (const e of events) {
      if (e.t !== 'text') continue
      expect(voiceProblems(e.text, e.role), e.text).toEqual([])
      expect(e.text).not.toMatch(/NaN|undefined|\[object/)
      if (e.role === 'outcome') expect(e.text.length).toBeLessThanOrEqual(150)
    }
  })

  it('renders every new row on a frozen state, with and without a record [RF5]', () => {
    const { g, s } = newAstro(5, { level: 3 })
    s.inquiries = [inquiry({ id: 'iq1', year: g.year - 1, involved: true, yearsOpen: 1 })]
    s.flights = [flightRec({ year: g.year - 1 })]
    expect(() => assertMenuPure(g, careerRoots('astronaut'))).not.toThrow()
    const bare = makeTestGame(6, { age: 36 })
    bare.year = 2026
    hire(bare, { defId: 'astronaut', title: 'Astronaut', company: 'NASA', salary: 90_000, level: 3, performance: 60, data: { agency: 'oea', lastMissionAge: -1 } })
    expect(astronautStore.has(bare)).toBe(false)
    expect(() => assertMenuPure(bare, careerRoots('astronaut'))).not.toThrow()
    expect(astronautStore.has(bare)).toBe(false)
    expect(yearlySpecial).toBeTypeOf('function')
  })
})
