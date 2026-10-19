import { afterEach, describe, expect, it } from 'vitest'
import { seeded } from '../src/game/assets'
import { allBrands, brandAvailable } from '../src/game/data/brands'
import { hasScript, runScript } from '../src/game/scripts'
import { yearlySpecial } from '../src/game/special'
import { hire, ownerKey } from '../src/game/special/common'
import { applyEffects, bestStance, defineCrises, type CrisisDef, type CrisisSet, type Stance } from '../src/game/special/kit/crisis'
import { ACTION_BUDGET, careerCtx, setCareerAudit, type AuditEvent, type CareerCtx } from '../src/game/special/kit/year'
import { ensureContract, signWith } from '../src/game/special/model-agency'
import { boardOf, slotsUsed } from '../src/game/special/model-board'
import { shelf, strainRisk } from '../src/game/special/model-core'
import { MODEL_DEFS, modelCrises } from '../src/game/special/model-events'
import { modelSim } from '../src/game/special/model-sim'
import { modelStore, readContract, type MdOffer, type ModelState } from '../src/game/special/model-state'
import type { ChoiceModal, GameState, Json, ModalItem, NoticeModal } from '../src/game/types'
import { assertHonestOdds, finiteJson, nextYear, voiceProblems } from './career-kit'
import { makeTestGame } from './helpers'

type Def = CrisisDef<ModelState, any>
interface Fx { g: GameState; s: ModelState }

const IDS = ['agencyApproach', 'windowConflict', 'injury', 'testShoot', 'rumor', 'youngerFaces', 'likenessLicence', 'pressStorm'] as const
type DefId = (typeof IDS)[number]
const STANCES: Stance[] = ['safe', 'bold', 'cash']
const NEGATIVE = /\b(fail|failed|lost|scandal|sued|lawsuit|fraud|bankrupt|cancel|cancelled|banned|dropped)\b/i

const json = (v: unknown): Json => v as Json
const defOf = (id: string): Def => {
  const d = MODEL_DEFS.find((x) => x.id === id)
  if (!d) throw new Error(`no def ${id}`)
  return d
}
const ctxOf = (g: GameState, s: ModelState = modelStore.mut(g)): CareerCtx<ModelState> => careerCtx(g, 'model', s, { ...ACTION_BUDGET })
const notices = (g: GameState): NoticeModal[] => g.queue.filter((m): m is NoticeModal => m.kind === 'notice')
const choices = (g: GameState): ChoiceModal[] => g.queue.filter((m): m is ChoiceModal => m.kind === 'choice')

let serial = 0
/** A notice-kind modal: runScript keeps no replay token for it, so a script's own guards are what is tested. */
const fake = (): ModalItem => ({ kind: 'notice', id: `v${++serial}`, title: '', text: '' })
const flat = (g: GameState): string => {
  const c = structuredClone(g)
  delete c.flags['core.resolvedScriptModals']
  return JSON.stringify([c, g.rng])
}

afterEach(() => setCareerAudit(null))

const offer = (o: Partial<MdOffer> = {}): MdOffer => ({
  id: 'x1',
  kind: 'catalogue',
  season: 'year',
  circuit: '',
  brand: '',
  house: 'The client',
  fee: 20_000,
  days: 2,
  minLook: 0,
  minTitle: 0,
  abroad: false,
  window: 0,
  rivals: [],
  status: 'open',
  terms: null,
  ...o,
})

const watches = allBrands().filter((b) => b.category === 'watch' && brandAvailable(b, 'us', 2026))

/** A 2026 life of 28: looks 90, headshot 90, cash 500,000, signed to Silhouette Models on a guarantee, book 60, mood 50. */
function base(o: { seed?: number; age?: number; year?: number } = {}): Fx {
  const age = o.age ?? 28
  const g = makeTestGame(o.seed ?? 5, { age, money: 500_000 })
  g.year = o.year ?? 2026
  g.log = [{ age, year: g.year, entries: [] }]
  g.character.stats.looks = 90
  g.flags['special.model'] = json({ owner: ownerKey(g), headshot: 90, headshotAge: age, couture: [], gigs: 0, fashionWeeks: 0, rejectedBy: [] })
  const s = modelStore.mut(g)
  s.book = 60
  s.rep = 40
  signWith(ctxOf(g, s), 'Silhouette Models', 'guarantee')
  s.mood = 50
  s.focus = 'editorial'
  s.strain = 10
  s.buzz = 40
  g.queue = []
  return { g, s }
}

/** A life in which `id` is eligible (weight above 0), a fresh one per call. */
function fixture(id: DefId, seed = 5): Fx {
  const f = base({ seed })
  const { g, s } = f
  switch (id) {
    case 'agencyApproach':
      g.character.age = 25
      return f
    case 'windowConflict':
      s.windows = [{ brand: watches[0].id, category: 'watch', until: g.year + 1 }]
      s.board = { year: g.year, items: [offer({ id: 'w1', kind: 'campaign', brand: watches[1].id, house: watches[1].name, fee: 30_000 })] }
      return f
    case 'injury':
      s.strain = 80
      s.board = { year: g.year, items: [offer({ id: 'i1', fee: 5_000 }), offer({ id: 'i2', fee: 2_000 }), offer({ id: 'i3', fee: 9_000 })] }
      return f
    case 'testShoot':
      s.book = 30
      return f
    case 'rumor':
      s.memory = [{ id: 'r1', name: 'Ana Rossi', met: 4, won: 2, lost: 1, grudge: 3, last: g.year }]
      s.rep = 40
      return f
    case 'youngerFaces':
      g.character.age = 29
      s.focus = 'runway'
      s.board = { year: g.year, items: [offer({ id: 'y1', fee: 4_000 }), offer({ id: 'y2', fee: 1_000 }), offer({ id: 'y3', fee: 7_000 })] }
      return f
    case 'likenessLicence':
      s.ledger = [
        { year: g.year - 1, src: 'Client', gross: 100_000, agency: 20_000, mother: 0, recoup: 0, net: 80_000 },
        { year: g.year - 1, src: 'Client', gross: 60_000, agency: 12_000, mother: 0, recoup: 0, net: 48_000 },
      ]
      return f
    case 'pressStorm':
      g.character.hidden.fame = 40
      return f
  }
}

const dataOf = (def: Def, g: GameState, s: ModelState): Record<string, Json> => def.make(g, s, seeded(`t|${def.id}`))

/** Applies one branch of one option without the roll (the odds are tested apart): effects, then then(). */
function branch(g: GameState, s: ModelState, def: Def, stance: Stance, which: 'good' | 'bad', d: Record<string, Json> = dataOf(def, g, s)) {
  const opt = def.options[stance]
  if (!opt) throw new Error(`${def.id} has no ${stance}`)
  const b = which === 'bad' && opt.bad ? opt.bad(g, s, d) : opt.good(g, s, d)
  const c = ctxOf(g, s)
  const result = applyEffects(c, b.fx, def.title)
  b.then?.(s, g)
  return { b, result, text: b.text(result) }
}

/** Resolves a crisis through its script, the way the store would on a click. */
function resolve(g: GameState, id: string, choice: string, d: Record<string, Json>, modal: ModalItem = fake(), owner = ownerKey(g), year = g.year): void {
  runScript(g, `career.model.${id}`, choice, { d, owner, year }, modal)
}

/** A crisis set for one def only, under its own career id so the scripts of the real set stay untouched. Made once per def. */
const solos = new Map<string, CrisisSet<ModelState>>()
function solo(def: Def): CrisisSet<ModelState> {
  let set = solos.get(def.id)
  if (!set) {
    set = defineCrises({ career: 'modelt', store: modelStore, talent: 'Modeling', defs: [def] })
    solos.set(def.id, set)
  }
  return set
}

/** Offers `def` on a clone of the fixture by trying rng seeds until the 35% roll lands. */
function offerOne(id: DefId, talent: boolean): { g: GameState; modal: ChoiceModal; s: ModelState } {
  const def = defOf(id)
  const set = solo(def)
  for (let seed = 1; seed <= 200; seed++) {
    const f = fixture(id)
    if (talent) f.g.character.talent = 'Modeling'
    f.g.rng = seed
    if (!set.offer(ctxOf(f.g, f.s))) continue
    const modal = choices(f.g).find((m) => m.scriptId === `career.modelt.${def.id}`)
    if (modal) return { g: f.g, modal, s: f.s }
  }
  throw new Error(`${id} was never offered`)
}

const mkFor = (def: Def) => () => {
  const f = fixture(def.id as DefId)
  return { g: f.g, s: f.s, d: dataOf(def, f.g, f.s) }
}

describe('model events: the eight defs', () => {
  it('registers every def as career.model.<id> with 2 to 3 stances and distinct labels', () => {
    expect(MODEL_DEFS.map((d) => d.id)).toEqual([...IDS])
    for (const def of MODEL_DEFS) {
      expect(hasScript(`career.model.${def.id}`)).toBe(true)
      const opts = STANCES.map((s) => def.options[s]).filter((o) => !!o)
      expect(opts.length).toBeGreaterThanOrEqual(2)
      expect(opts.length).toBeLessThanOrEqual(3)
      expect(new Set(opts.map((o) => o!.label)).size).toBe(opts.length)
      expect(def.cool ?? 4).toBeGreaterThanOrEqual(1)
    }
    expect(hasScript('career.model.renewal')).toBe(true) // the forced choice of Task 13 stays
    expect(modelCrises.offer).toBeTypeOf('function')
  })

  it('makes every def reachable through its weight, and gates each by its condition', () => {
    const w = (id: DefId, f: Fx): number => defOf(id).weight(f.g, f.s)
    for (const id of IDS) expect(w(id, fixture(id)), id).toBeGreaterThan(0)

    // agencyApproach: a higher tier that would sign you, and a mood under 80
    const ap = fixture('agencyApproach')
    expect(w('agencyApproach', ap)).toBe(0.25)
    ap.s.mood = 80
    expect(w('agencyApproach', ap)).toBe(0)
    ap.s.mood = 50
    ap.s.book = 10
    expect(w('agencyApproach', ap)).toBe(0)
    const none = fixture('agencyApproach')
    none.g.character.job = null
    expect(w('agencyApproach', none)).toBe(0)

    // windowConflict: a live window and an open offer of the same category from another client
    const wc = fixture('windowConflict')
    wc.s.windows = [{ brand: watches[0].id, category: 'watch', until: wc.g.year - 1 }]
    expect(w('windowConflict', wc)).toBe(0)
    wc.s.windows = [{ brand: watches[1].id, category: 'watch', until: wc.g.year + 1 }]
    expect(w('windowConflict', wc)).toBe(0) // the same client is no conflict
    wc.s.windows = [{ brand: watches[0].id, category: 'watch', until: wc.g.year + 1 }]
    wc.s.board.items[0].status = 'lost'
    expect(w('windowConflict', wc)).toBe(0)

    // injury: the injury weight is strainRisk, with a job to cancel
    const inj = fixture('injury')
    expect(w('injury', inj)).toBeCloseTo(strainRisk(80), 10)
    inj.s.strain = 20
    expect(w('injury', inj)).toBeCloseTo(strainRisk(20), 10)
    inj.s.board = { year: inj.g.year, items: [offer({ status: 'lost' })] }
    expect(w('injury', inj)).toBe(0)
    inj.g.character.job = null
    expect(w('injury', inj)).toBe(0)

    // testShoot: a book of 20
    const ts = fixture('testShoot')
    expect(w('testShoot', ts)).toBe(0.3)
    ts.s.book = 19
    expect(w('testShoot', ts)).toBe(0)

    // rumor: a grudge of 2 and a reputation under 60
    const ru = fixture('rumor')
    expect(w('rumor', ru)).toBe(0.3)
    ru.s.rep = 60
    expect(w('rumor', ru)).toBe(0)
    ru.s.rep = 40
    ru.s.memory[0].grudge = 1
    expect(w('rumor', ru)).toBe(0)

    // youngerFaces: 27 and over, runway, a shelf under .85
    const yf = fixture('youngerFaces')
    expect(shelf('runway', 29, false, yf.g.year)).toBeLessThan(0.85)
    yf.s.focus = 'editorial'
    expect(w('youngerFaces', yf)).toBe(0)
    yf.s.focus = 'runway'
    yf.g.character.age = 26
    expect(w('youngerFaces', yf)).toBe(0)
    yf.g.character.age = 27
    expect(shelf('runway', 27, false, yf.g.year)).toBeLessThan(0.85)
    expect(w('youngerFaces', yf)).toBeGreaterThan(0)
    yf.g.character.talent = 'Modeling' // the prime runs two years longer: a shelf of .93 at 27
    expect(w('youngerFaces', yf)).toBe(0)

    // likenessLicence: 2023 and after with the AI tools, once a life
    const ll = fixture('likenessLicence')
    ll.g.year = 2022
    expect(w('likenessLicence', ll)).toBe(0)
    ll.g.year = 2026
    ll.s.announced = ['likeness']
    expect(w('likenessLicence', ll)).toBe(0)

    // pressStorm: fame 30 or 500,000 followers
    const ps = fixture('pressStorm')
    expect(w('pressStorm', ps)).toBe(0.12)
    ps.g.character.hidden.fame = 29
    expect(w('pressStorm', ps)).toBe(0)
    ps.g.character.social = { followers: 500_000 } as never
    expect(w('pressStorm', ps)).toBe(0.12)
  })

  it('builds branches without writing: weight, scene, odds, good() and bad() are pure', () => {
    for (const id of IDS) {
      const def = defOf(id)
      const f = fixture(id)
      const d = dataOf(def, f.g, f.s)
      const before = JSON.stringify([f.g, f.g.rng])
      def.weight(f.g, f.s)
      def.scene(f.g, f.s, d)
      for (const stance of STANCES) {
        const opt = def.options[stance]
        if (!opt) continue
        opt.odds?.(f.g, f.s, d)
        opt.good(f.g, f.s, d)
        opt.bad?.(f.g, f.s, d)
      }
      expect(JSON.stringify([f.g, f.g.rng]), id).toBe(before)
    }
  })

  it('marks the bestStance option from the resolver odds and only with Modeling', () => {
    for (const id of IDS) {
      const def = defOf(id)
      const plain = offerOne(id, false)
      expect(plain.modal.choices.every((c) => c.hint === undefined), `${id} without Modeling`).toBe(true)
      const gifted = offerOne(id, true)
      const d = (gifted.modal.data as unknown as { d: Record<string, Json> }).d
      const best = bestStance(gifted.g, modelStore.view(gifted.g), d, def)
      const hinted = gifted.modal.choices.filter((c) => c.hint)
      expect(hinted.map((c) => c.id), id).toEqual([best])
      expect(hinted[0].hint).toMatch(/Looks best/)
      expect(hinted[0].hint).not.toMatch(/will/)
      if (def.options[best as Stance]!.odds) expect(hinted[0].hint).toMatch(/about \d+%/)
      else expect(hinted[0].hint).not.toContain('%')
    }
  })

  it('rolls the odds it hints', () => {
    for (const def of MODEL_DEFS) assertHonestOdds(def, mkFor(def))
    // the rolled options are exactly these, at the stated odds; every other branch is a fixed outcome
    const rolled = MODEL_DEFS.flatMap((def) => STANCES.filter((s) => def.options[s]?.odds).map((s) => `${def.id}/${s}`))
    expect(rolled).toEqual(['agencyApproach/bold', 'rumor/bold', 'pressStorm/bold', 'pressStorm/cash'])
    const at = (id: DefId, stance: Stance): number => {
      const f = fixture(id)
      return defOf(id).options[stance]!.odds!(f.g, f.s, dataOf(defOf(id), f.g, f.s))
    }
    expect(at('agencyApproach', 'bold')).toBeCloseTo(0.55, 10)
    expect(at('rumor', 'bold')).toBeCloseTo(0.5, 10)
    expect(at('pressStorm', 'bold')).toBeCloseTo(0.5, 10)
    expect(at('pressStorm', 'cash')).toBeCloseTo(0.7, 10)
  }, 120_000)
})

describe('model events: voice', () => {
  it('drives all eight events and every notice and log through voiceProblems = []', () => {
    const texts: { role: 'log' | 'outcome' | 'scene' | 'title'; text: string; where: string }[] = []
    // the static texts: title, scene, labels, every branch
    for (const year of [1995, 2026]) {
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
    // the driven texts: every stance of every def resolved through its script on several seeds, with the audit sink listening
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    for (const id of IDS) {
      const def = defOf(id)
      for (const stance of STANCES) {
        if (!def.options[stance]) continue
        for (let seed = 1; seed <= 10; seed++) {
          const f = fixture(id, 20 + seed)
          f.g.rng = seed
          resolve(f.g, id, stance, dataOf(def, f.g, f.s))
          expect(finiteJson(f.g), `${id}/${stance}/${seed}`).toEqual([])
        }
      }
    }
    // the offer path: the scene and the title as the player sees them
    for (const id of IDS) {
      offerOne(id, true)
    }
    setCareerAudit(null)
    for (const e of events) if (e.t === 'text') texts.push({ role: e.role, text: e.text, where: `${e.career} ${e.role}` })
    expect(events.filter((e) => e.t === 'text').length).toBeGreaterThan(40)
    for (const t of texts) {
      expect(voiceProblems(t.text, t.role), `${t.where}: ${t.text}`).toEqual([])
      expect(t.text.includes(String.fromCharCode(0x2014)), `${t.where}: ${t.text}`).toBe(false)
      expect(t.text, `${t.where}`).not.toMatch(/\b(NaN|undefined|Infinity)\b/)
      if (t.role === 'log') expect(t.text.length, `${t.where}: ${t.text}`).toBeLessThanOrEqual(90)
      if (t.role === 'outcome') expect(t.text.length, `${t.where}: ${t.text}`).toBeLessThanOrEqual(120)
      if (t.role === 'scene') {
        expect(t.text.length, `${t.where}: ${t.text}`).toBeLessThanOrEqual(140)
        expect(t.text.endsWith('What will you do?'), `${t.where}: ${t.text}`).toBe(true)
      }
      // no body, weight or diet words in any copy about workload
      expect(t.text, `${t.where}: ${t.text}`).not.toMatch(/\b(weight|diet|skinny|thin|fat|calorie|body)\b/i)
    }
  })

  it('names no registry brand with a negative word', () => {
    const names = allBrands()
      .map((b) => b.name)
      .filter((n) => n.length >= 3)
    const texts: string[] = []
    const collect = (e: AuditEvent): void => {
      if (e.t === 'text') texts.push(e.text)
    }
    setCareerAudit(collect)
    for (const id of IDS) {
      const def = defOf(id)
      for (let seed = 1; seed <= 6; seed++) {
        const f = fixture(id, 40 + seed)
        f.g.rng = seed
        // a board and a window built from registry watch brands, so a brand name is on hand to be misused
        f.s.windows = [{ brand: watches[0].id, category: 'watch', until: f.g.year + 1 }]
        const d = dataOf(def, f.g, f.s)
        texts.push(def.scene(f.g, f.s, d))
        for (const stance of STANCES) {
          const opt = def.options[stance]
          if (!opt) continue
          texts.push(opt.label)
          for (const b of [opt.good(f.g, f.s, d), opt.bad?.(f.g, f.s, d)]) if (b) texts.push(b.text({ paid: 1234, earned: 5678 }))
          const h = fixture(id, 60 + seed)
          h.g.rng = seed
          h.s.windows = f.s.windows
          resolve(h.g, id, stance, dataOf(def, h.g, h.s))
          for (const m of h.g.queue) if (m.kind === 'notice') texts.push(m.title, m.text)
        }
      }
    }
    setCareerAudit(null)
    expect(texts.length).toBeGreaterThan(100)
    let named = 0
    for (const text of texts) {
      for (const name of names) {
        const at = text.indexOf(name)
        if (at < 0) continue
        const before = text[at - 1] ?? ' '
        const after = text[at + name.length] ?? ' '
        if (/\w/.test(before) || /\w/.test(after)) continue // part of a longer word
        named++
        expect(NEGATIVE.test(text), `${name} in a negative line: ${text}`).toBe(false)
      }
    }
    expect(named).toBeGreaterThanOrEqual(0)
    // a failure names the client or a rival, never a registry brand
    for (const text of texts.filter((t) => NEGATIVE.test(t))) {
      for (const name of names) {
        const at = text.indexOf(name)
        if (at < 0) continue
        const before = text[at - 1] ?? ' '
        const after = text[at + name.length] ?? ' '
        expect(/\w/.test(before) || /\w/.test(after), `${name} named in: ${text}`).toBe(true)
      }
    }
  })

  it('keeps the offer scene and title in voice through the real yearly hook', () => {
    const events: AuditEvent[] = []
    setCareerAudit((e) => events.push(e))
    let offered = 0
    for (let seed = 1; seed <= 40; seed++) {
      const x = fixture('testShoot', 70 + seed)
      x.g.rng = seed
      nextYear(x.g, yearlySpecial)
      const mine = choices(x.g).filter((m) => m.scriptId?.startsWith('career.model.'))
      expect(mine.length).toBeLessThanOrEqual(1)
      if (mine.length === 1) offered++
    }
    setCareerAudit(null)
    expect(offered).toBeGreaterThan(3)
    for (const e of events) if (e.t === 'text' && e.role === 'scene') expect(voiceProblems(e.text, 'scene')).toEqual([])
  })
})

describe('model events: what each def does', () => {
  it('agencyApproach: staying trims the commission 2 points and lifts the mood, playing them off rolls at 55%, switching pays the release fee', () => {
    const def = defOf('agencyApproach')
    // stay
    const a = fixture('agencyApproach')
    const k0 = ensureContract(a.g, a.g.character.job!)!
    branch(a.g, a.s, def, 'safe', 'good')
    expect(readContract(a.g.character.job, a.g)!.commission).toBe(k0.commission - 2)
    expect(a.s.mood).toBe(56)
    // play them off: a win trims 2 points and lifts the retainer 10%, a miss costs 10 mood
    const b = fixture('agencyApproach')
    const salary = b.g.character.job!.salary
    const kb = ensureContract(b.g, b.g.character.job!)!
    branch(b.g, b.s, def, 'bold', 'good')
    expect(readContract(b.g.character.job, b.g)!.commission).toBe(kb.commission - 2)
    expect(b.g.character.job!.salary).toBe(Math.round(salary * 1.1))
    expect(b.s.floor).toBe(Math.round(salary * 1.1))
    const c = fixture('agencyApproach')
    branch(c.g, c.s, def, 'bold', 'bad')
    expect(c.s.mood).toBe(40)
    expect(readContract(c.g.character.job, c.g)!.commission).toBe(k0.commission)
    // a commission-only deal has no retainer to lift
    const free = base({ seed: 8 })
    free.g.character.age = 25
    free.g.character.job = null
    signWith(ctxOf(free.g, free.s), 'Silhouette Models', 'commission')
    const fk = readContract(free.g.character.job, free.g)!
    branch(free.g, free.s, def, 'bold', 'good')
    expect(free.g.character.job!.salary).toBe(0)
    expect(readContract(free.g.character.job, free.g)!.commission).toBe(fk.commission - 2)
    // switch: the release fee is paid, the old agency keeps 5% for 8 years, the new contract starts
    const d = fixture('agencyApproach')
    expect(d.g.character.job!.company).toBe('Silhouette Models')
    const cash = d.g.character.money
    const data = dataOf(def, d.g, d.s)
    expect(data.agency).toBe('Icon Elite')
    resolve(d.g, 'agencyApproach', 'cash', data)
    expect(d.g.character.job!.company).toBe('Icon Elite')
    expect(d.g.character.money).toBeLessThan(cash)
    const s2 = modelStore.view(d.g)
    expect(s2.mother).toMatchObject({ agency: 'Silhouette Models', overrideUntil: d.g.year + 8 })
    expect(notices(d.g).filter((n) => n.title === def.title)).toHaveLength(1)
    // a switch you cannot pay for is refused: you stay, and nothing moves
    const poor = fixture('agencyApproach')
    poor.g.character.money = 10
    const kept = poor.g.character.job!.company
    resolve(poor.g, 'agencyApproach', 'cash', dataOf(def, poor.g, poor.s))
    expect(poor.g.character.job!.company).toBe(kept)
    expect(poor.g.character.money).toBe(10)
  })

  it('windowConflict: honoring the deal lifts your standing with clients, taking the job pays 3,000 and breaks the window', () => {
    const def = defOf('windowConflict')
    const a = fixture('windowConflict')
    const rep = a.s.rep
    branch(a.g, a.s, def, 'safe', 'good')
    expect(a.s.rep).toBe(rep + 3)
    expect(a.s.windows).toHaveLength(1)
    expect(boardOf(a.g, a.s)[0].status).toBe('open')
    const b = fixture('windowConflict')
    const cash = b.g.character.money
    const mood = b.s.mood
    const { text } = branch(b.g, b.s, def, 'cash', 'good')
    expect(b.g.character.money).toBe(cash - 3_000)
    expect(b.s.rep).toBe(40 - 10)
    expect(b.s.mood).toBe(mood - 10)
    expect(b.s.windows).toEqual([])
    const o = b.s.board.items[0]
    expect(o.status).toBe('booked')
    expect(o.terms).toMatchObject({ agency: 'Silhouette Models' })
    expect(text).toMatch(/first client/)
    expect(text).toMatch(/\$3,000/)
    // a job that no longer fits changes nothing
    const c = fixture('windowConflict')
    c.s.board.items[0].status = 'lost'
    const quietCash = c.g.character.money
    branch(c.g, c.s, def, 'cash', 'good')
    expect(c.g.character.money).toBe(quietCash)
    expect(c.s.windows).toHaveLength(1)
  })

  it('injury: cancelling forfeits the smallest job, easing the strain at a price; working through it costs health and builds strain', () => {
    const def = defOf('injury')
    const a = fixture('injury')
    const rep = a.s.rep
    const health = a.g.character.stats.health
    branch(a.g, a.s, def, 'safe', 'good')
    expect(a.s.strain).toBe(65)
    expect(a.s.rep).toBe(rep - 3)
    expect(a.g.character.stats.health).toBe(health - 1)
    expect(a.s.board.items.map((o) => [o.id, o.status])).toEqual([['i1', 'open'], ['i2', 'passed'], ['i3', 'open']])
    // a booked job is the one forfeited, and the cheapest of the booked
    const b = fixture('injury')
    b.s.board.items[0].status = 'booked'
    b.s.board.items[2].status = 'booked'
    branch(b.g, b.s, def, 'safe', 'good')
    expect(b.s.board.items.map((o) => o.status)).toEqual(['passed', 'open', 'booked'])
    // the next tick takes 8 reputation and 10 mood for the cancelled job, as the sim reads it
    const c = fixture('injury')
    branch(c.g, c.s, def, 'safe', 'good')
    const repBefore = c.s.rep
    c.g.queue = []
    const mood = c.s.mood
    nextYear(c.g, yearlySpecial)
    const after = modelStore.view(c.g)
    expect(after.rep).toBeLessThanOrEqual(repBefore - 8 + 0.1)
    expect(after.mood).toBeLessThan(0.8 * mood + 12 + 0.25 * (c.g.character.job!.performance - 50) + 0.01)
    // work through it
    const d = fixture('injury')
    const hp = d.g.character.stats.health
    branch(d.g, d.s, def, 'bold', 'good')
    expect(d.s.strain).toBe(90)
    expect(d.s.rep).toBe(41)
    expect(d.g.character.stats.health).toBe(hp - 6)
    expect(d.s.board.items.every((o) => o.status === 'open')).toBe(true)
    // the strain stays inside 0-100
    const e = fixture('injury')
    e.s.strain = 99
    branch(e.g, e.s, def, 'bold', 'good')
    expect(e.s.strain).toBe(100)
  })

  it('testShoot: the day rate is 1,500 for 5 book points, prints are free for 2, either records a photographer, at most 8', () => {
    const def = defOf('testShoot')
    const a = fixture('testShoot')
    const cash = a.g.character.money
    const book = a.s.book
    const { text } = branch(a.g, a.s, def, 'cash', 'good')
    expect(a.g.character.money).toBe(cash - 1_500)
    expect(a.s.book).toBeCloseTo(book + (100 - book) * 0.05, 1)
    expect(a.s.photographers).toHaveLength(1)
    expect(text).toContain(a.s.photographers[0])
    const b = fixture('testShoot')
    const cashB = b.g.character.money
    branch(b.g, b.s, def, 'safe', 'good')
    expect(b.g.character.money).toBe(cashB)
    expect(b.s.book).toBeCloseTo(30 + (100 - 30) * 0.02, 1)
    expect(b.s.photographers).toHaveLength(1)
    // short of cash, the day rate falls back to prints
    const c = fixture('testShoot')
    c.g.character.money = 100
    branch(c.g, c.s, def, 'cash', 'good')
    expect(c.g.character.money).toBe(100)
    expect(c.s.book).toBeCloseTo(30 + 70 * 0.02, 1)
    // the same photographer is not recorded twice, and the list stops at 8
    const d = fixture('testShoot')
    d.s.photographers = Array.from({ length: 8 }, (_, i) => `Old Name ${i}`)
    branch(d.g, d.s, def, 'safe', 'good')
    expect(d.s.photographers).toHaveLength(8)
    expect(d.s.photographers.at(-1)).not.toBe('Old Name 7')
  })

  it('rumor: ignoring costs buzz, confronting rolls 50% to clear the grudge, the agent costs mood', () => {
    const def = defOf('rumor')
    const a = fixture('rumor')
    const buzz = a.s.buzz
    branch(a.g, a.s, def, 'safe', 'good')
    expect(a.s.buzz).toBe(buzz - 4)
    const b = fixture('rumor')
    const d = dataOf(def, b.g, b.s)
    expect(d).toMatchObject({ id: 'r1', name: 'Ana Rossi' })
    branch(b.g, b.s, def, 'bold', 'good', d)
    expect(b.s.memory.find((m) => m.id === 'r1')!.grudge).toBe(0)
    const c = fixture('rumor')
    const rep = c.s.rep
    const fame = c.g.character.hidden.fame
    branch(c.g, c.s, def, 'bold', 'bad', dataOf(def, c.g, c.s))
    expect(c.s.rep).toBe(rep - 5)
    expect(c.g.character.hidden.fame).toBe(fame + 2)
    expect(c.s.memory.find((m) => m.id === 'r1')!.grudge).toBe(3)
    const e = fixture('rumor')
    const mood = e.s.mood
    branch(e.g, e.s, def, 'cash', 'good')
    expect(e.s.mood).toBe(mood - 5)
    // the rival with the highest grudge is named, then the most losses
    const f = fixture('rumor')
    f.s.memory = [
      { id: 'a', name: 'Ada Lund', met: 1, won: 0, lost: 1, grudge: 2, last: f.g.year },
      { id: 'b', name: 'Bea Okoro', met: 1, won: 0, lost: 0, grudge: 3, last: f.g.year },
      { id: 'c', name: 'Cy Varga', met: 1, won: 0, lost: 4, grudge: 3, last: f.g.year },
    ]
    expect(dataOf(def, f.g, f.s)).toMatchObject({ id: 'c', name: 'Cy Varga' })
  })

  it('youngerFaces: moving costs no book or buzz, staying on the runway adds 6 strain and uses a casting slot', () => {
    const def = defOf('youngerFaces')
    const a = fixture('youngerFaces')
    const book = a.s.book
    const buzz = a.s.buzz
    branch(a.g, a.s, def, 'safe', 'good')
    expect(a.s).toMatchObject({ focus: 'editorial', focusYear: a.g.year, book, buzz })
    const b = fixture('youngerFaces')
    branch(b.g, b.s, def, 'cash', 'good')
    expect(b.s).toMatchObject({ focus: 'commercial', focusYear: b.g.year })
    const c = fixture('youngerFaces')
    const strain = c.s.strain
    const used = slotsUsed(boardOf(c.g, c.s))
    branch(c.g, c.s, def, 'bold', 'good')
    expect(c.s.focus).toBe('runway')
    expect(c.s.strain).toBe(strain + 6)
    expect(slotsUsed(c.s.board.items)).toBe(used + 1)
    expect(c.s.board.items.map((o) => o.status)).toEqual(['open', 'lost', 'open']) // the cheapest casting slipped away
  })

  it('likenessLicence: the full licence pays 15% of last year gross, half for the limited one, a refusal costs mood, once a life', () => {
    const def = defOf('likenessLicence')
    const a = fixture('likenessLicence')
    const d = dataOf(def, a.g, a.s)
    expect(d.pay).toBe(24_000) // 15% of 160,000
    const cash = a.g.character.money
    const { text } = branch(a.g, a.s, def, 'cash', 'good', d)
    expect(a.g.character.money).toBe(cash + 24_000)
    expect(a.s.likeness).toBe(24_000)
    expect(a.s.announced).toContain('likeness')
    expect(a.s.cool.licence).toBe(a.g.year + 2)
    expect(text).toMatch(/\$24,000/)
    expect(def.weight(a.g, a.s)).toBe(0)
    const b = fixture('likenessLicence')
    const cashB = b.g.character.money
    branch(b.g, b.s, def, 'safe', 'good', d)
    expect(b.g.character.money).toBe(cashB + 12_000)
    expect(b.s.likeness).toBe(12_000)
    expect(b.s.cool.licence).toBeUndefined()
    const c = fixture('likenessLicence')
    const mood = c.s.mood
    branch(c.g, c.s, def, 'bold', 'good', d)
    expect(c.s.mood).toBe(mood - 5)
    expect(c.s.announced).toContain('likeness')
    // the floor of 5,000 and the cap of 150,000
    const e = fixture('likenessLicence')
    e.s.ledger = []
    expect(dataOf(def, e.g, e.s).pay).toBe(5_000)
    e.s.ledger = [{ year: e.g.year - 1, src: 'Client', gross: 6_000_000, agency: 0, mother: 0, recoup: 0, net: 6_000_000 }]
    expect(dataOf(def, e.g, e.s).pay).toBe(150_000)
  })

  it('likenessLicence: a full licence cuts digital fees 5% for the three years of castings it covers, and nothing else', () => {
    const def = defOf('likenessLicence')
    /** A commission-only model with one booked offer of 20,000 at 20%: what the sim pays above nothing at the next tick. */
    const paid = (kind: MdOffer['kind'], licenceUntil: number | null): number => {
      const g = makeTestGame(31, { age: 28, money: 500_000 })
      g.year = 2026
      g.log = [{ age: 28, year: 2026, entries: [] }]
      g.character.stats.looks = 90
      g.flags['special.model'] = json({ owner: ownerKey(g), headshot: 90, headshotAge: 28, couture: [], gigs: 0, fashionWeeks: 0, rejectedBy: [] })
      const s = modelStore.mut(g)
      s.book = 60
      signWith(ctxOf(g, s), 'Silhouette Models', 'commission')
      s.mood = 80
      s.buzz = 40
      if (licenceUntil !== null) s.cool.licence = licenceUntil
      s.board = { year: g.year, items: [offer({ id: 'd1', kind, status: 'booked', fee: 20_000, terms: { agency: 'Silhouette Models', commission: 20, mother: 0 } })] }
      g.queue = []
      const before = g.character.money
      nextYear(g, yearlySpecial)
      return g.character.money - before
    }
    expect(paid('digital', null)).toBe(16_000)
    // castings of 2026, 2027 and 2028 are covered; they pay at the ticks of 2027, 2028 and 2029
    expect(paid('digital', 2028)).toBe(15_200)
    expect(paid('catalogue', 2028)).toBe(16_000)
    // the full licence sets the window of three castings years from the year it is signed
    const f = fixture('likenessLicence', 32)
    branch(f.g, f.s, def, 'cash', 'good')
    expect(f.s.cool.licence).toBe(f.g.year + 2)
    expect(paid('digital', 2026)).toBe(15_200) // the last year of castings it covers is the licence year itself
    expect(paid('digital', 2025)).toBe(16_000)
  })

  it('pressStorm: apologizing is certain, saying nothing rolls 50%, the lawyer costs 4,000 either way and rolls 70%', () => {
    const def = defOf('pressStorm')
    const a = fixture('pressStorm')
    const buzz = a.s.buzz
    const rep = a.s.rep
    branch(a.g, a.s, def, 'safe', 'good')
    expect(a.s.buzz).toBe(buzz - 8)
    expect(a.s.rep).toBe(rep + 2)
    const b = fixture('pressStorm')
    const fame = b.g.character.hidden.fame
    branch(b.g, b.s, def, 'bold', 'good')
    expect([b.s.buzz, b.g.character.hidden.fame]).toEqual([buzz, fame])
    const c = fixture('pressStorm')
    branch(c.g, c.s, def, 'bold', 'bad')
    expect(c.s.buzz).toBe(buzz - 15)
    expect(c.g.character.hidden.fame).toBe(fame - 3)
    for (const which of ['good', 'bad'] as const) {
      const d = fixture('pressStorm')
      const cash = d.g.character.money
      const { text } = branch(d.g, d.s, def, 'cash', which)
      expect(d.g.character.money, which).toBe(cash - 4_000)
      expect(text).toMatch(/\$4,000/)
      expect(d.s.buzz).toBe(which === 'good' ? buzz : buzz - 15)
      expect(d.g.character.hidden.fame).toBe(which === 'good' ? fame : fame - 3)
    }
    // no debt: a lawyer takes what you have
    const e = fixture('pressStorm')
    e.g.character.money = 1_000
    branch(e.g, e.s, def, 'cash', 'good')
    expect(e.g.character.money).toBe(0)
  })

  it('keeps then() free of cash and g.rng in every branch of every def except the switch, which signs a new contract', () => {
    for (const id of IDS) {
      const def = defOf(id)
      for (const stance of STANCES) {
        const opt = def.options[stance]
        if (!opt) continue
        if (id === 'agencyApproach' && stance === 'cash') continue
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

  it('books every dollar a crisis moves, whichever way the roll goes', () => {
    for (const id of IDS) {
      const def = defOf(id)
      for (const stance of STANCES) {
        if (!def.options[stance]) continue
        for (let seed = 1; seed <= 8; seed++) {
          const f = fixture(id)
          f.g.rng = seed
          const events: AuditEvent[] = []
          setCareerAudit((e) => events.push(e))
          const cash = f.g.character.money
          resolve(f.g, id, stance, dataOf(def, f.g, f.s))
          setCareerAudit(null)
          const booked = events.reduce((n, e) => n + (e.t === 'earn' ? e.amount : e.t === 'pay' ? -e.amount : 0), 0)
          expect(f.g.character.money - cash, `${id}/${stance}/${seed}`).toBe(booked)
          expect(f.g.character.money).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('resolves through the script once: a replay, another owner, another year or a missing stance change nothing [RF3]', () => {
    for (const id of IDS) {
      const def = defOf(id)
      const f = fixture(id)
      const d = dataOf(def, f.g, f.s)
      const stance = STANCES.find((s) => def.options[s])!
      resolve(f.g, id, stance, d)
      const once = flat(f.g)
      resolve(f.g, id, stance, d)
      resolve(f.g, id, stance, d, fake())
      expect(flat(f.g), `${id} replay`).toBe(once)
      const o = fixture(id)
      const before = flat(o.g)
      resolve(o.g, id, stance, d, fake(), 'v2:9:someone-else')
      resolve(o.g, id, stance, d, fake(), ownerKey(o.g), o.g.year - 1)
      resolve(o.g, id, 'fold', d)
      expect(flat(o.g), `${id} stale`).toBe(before)
    }
  })

  it('offers one choice a year through the sim and the same budget as every career year [RF3]', () => {
    let offers = 0
    for (let seed = 1; seed <= 60; seed++) {
      const f = fixture('testShoot', 200 + seed)
      f.g.rng = seed
      nextYear(f.g, yearlySpecial)
      const mine = choices(f.g).filter((m) => m.scriptId?.startsWith('career.model.'))
      expect(mine.length, `seed ${seed}`).toBeLessThanOrEqual(1)
      expect(notices(f.g).length, `seed ${seed}`).toBeLessThanOrEqual(2 + 1)
      if (mine.length === 1) offers++
      const queued = JSON.stringify(f.g)
      modelSim.yearly(f.g)
      expect(JSON.stringify(f.g), 'the hook again changes nothing').toBe(queued)
    }
    expect(offers).toBeGreaterThan(5)
    expect(offers).toBeLessThan(55)
  })
})

describe('model events: hostile records', () => {
  const junks: unknown[] = [
    null,
    [],
    'x',
    { v: 1, book: NaN, rep: 'x', strain: Infinity, mood: {}, board: 'bad', windows: 'bad', memory: [null, 5, { id: 'q', grudge: 'x' }], announced: 7, likeness: 'x', ledger: [{ year: 'x' }] },
    { v: 1, memory: Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, name: 'N'.repeat(10_000), grudge: 99, lost: 1e12 })), windows: Array.from({ length: 500 }, (_, i) => ({ brand: `b${i}`, category: 'watch', until: 1e12 })) },
    { v: 1, board: { year: 2026, items: Array.from({ length: 500 }, (_, i) => ({ id: `o${i}`, kind: 'bad', fee: 'x', status: {} })) }, ledger: Array.from({ length: 500 }, () => ({ year: 2025, gross: 1e300 })) },
    { owner: 'someone-else', v: 1, book: 99, memory: [{ id: 'r', name: 'Ann', grudge: 99 }] },
  ]

  it('keeps hostile records harmless through every event weight [RF1]', () => {
    for (const junk of junks) {
      for (const id of IDS) {
        const f = fixture(id)
        f.g.flags['special.model.sim'] = json(junk && typeof junk === 'object' && !Array.isArray(junk) ? { owner: ownerKey(f.g), ...(junk as object) } : junk)
        const def = defOf(id)
        const s = modelStore.view(f.g)
        const w = def.weight(f.g, s)
        expect(Number.isFinite(w) && w >= 0, `${id} weight ${w}`).toBe(true)
        const d = def.make(f.g, s, seeded(`h|${id}`))
        expect(() => def.scene(f.g, s, d)).not.toThrow()
        for (const stance of STANCES) {
          const opt = def.options[stance]
          if (!opt) continue
          const p = opt.odds?.(f.g, s, d)
          if (p !== undefined) expect(Number.isFinite(p), `${id}/${stance} odds`).toBe(true)
          for (const b of [opt.good(f.g, s, d), opt.bad?.(f.g, s, d)]) if (b) expect(b.text({ paid: 0, earned: 0 }), id).toBeTypeOf('string')
        }
        expect(() => bestStance(f.g, s, d, def)).not.toThrow()
      }
    }
  })

  it('survives junk crisis data in a stale or tampered modal, and keeps every meter in range [RF1]', () => {
    for (const id of IDS) {
      const def = defOf(id)
      for (const bad of [null, 'x', [], { d: null }, { d: 'x' }, { d: { name: 5, id: {}, pay: 'x', agency: 7, offer: [], more: 'bad' } }] as unknown as Json[]) {
        for (const stance of STANCES) {
          if (!def.options[stance]) continue
          const g = fixture(id).g
          const data = bad && typeof bad === 'object' && !Array.isArray(bad) ? { ...(bad as Record<string, Json>), owner: ownerKey(g), year: g.year } : bad
          runScript(g, `career.model.${id}`, stance, data, fake())
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
            Object.assign(f.s, { standing: start, peak: start, book: start, buzz: start, rep: start, strain: start, mood: start })
            branch(f.g, f.s, def, stance, which)
            const t = modelStore.mut(f.g)
            const tag = `${id}/${stance}/${which}@${start}`
            for (const [name, v] of [['standing', t.standing], ['peak', t.peak], ['book', t.book], ['buzz', t.buzz], ['rep', t.rep], ['strain', t.strain], ['mood', t.mood]] as const) {
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

  it('runs the yearly hook over junk records without throwing, with the crises wired in', () => {
    for (const junk of junks) {
      const f = base({ seed: 9 })
      f.g.flags['special.model.sim'] = json(junk && typeof junk === 'object' && !Array.isArray(junk) ? { owner: ownerKey(f.g), ...(junk as object) } : junk)
      hire(f.g, { defId: 'model', title: 'Model', company: 'Silhouette Models', salary: 32_000, data: { tier: 1, gigsThisYear: 0, sabotaged: 0 } })
      expect(() => {
        for (let i = 0; i < 4; i++) {
          f.g.queue = []
          nextYear(f.g, yearlySpecial)
        }
      }).not.toThrow()
      expect(finiteJson(f.g)).toEqual([])
    }
  })
})
