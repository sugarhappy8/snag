// Model 2.0 events: eight yearly crises the kit offers (35% of active years, one at a time). Each rolled option has one
// `odds()` for the roll and the hint; the rest are fixed outcomes. Money, standing, fame, happiness and health move
// through the kit's `Effects`; what an `Effects` cannot carry (buzz, reputation, strain, mood, the contract, the board)
// rides in `Branch.then`, which moves no money and draws no g.rng, with one exception: the Switch branch signs a new
// contract through model-agency's switchAgency, which pays the release fee and meets a new booker. The hint weighs a
// branch only by what `Effects` carries, so it is a guide, not a promise. Failures name a rival or "the client",
// never a registry brand. The renewal is a forced choice of model-agency.ts, not a def here.
//
// Imports from model.ts and the model-*.ts files are used inside function bodies only.
import { brandById } from '../data/brands'
import { nameFitsYear } from '../history/events-people'
import { hasTech } from '../history/timeline'
import type { SRng } from '../assets'
import { hasTalent } from '../talents'
import type { GameState, Json } from '../types'
import { namePoolOf } from '../world'
import { fameOf, money } from './common'
import { defineCrises, type Branch, type CrisisDef, type CrisisSet } from './kit/crisis'
import { cap, txt } from './kit/state'
import { careerCtx } from './kit/year'
import { modelJob } from './model'
import { bestSwitch, ensureContract, motherPct, saveContract, switchAgency, switchBlock } from './model-agency'
import { boardOf, buildBoard, castBlock, gainBook } from './model-board'
import { shelf, strainRisk } from './model-core'
import { modelStore, readContract, type MdOffer, type ModelState } from './model-state'
import { totalFollowers } from './social'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)
const round1 = (n: number): number => Math.round(n * 10) / 10
const str = (v: unknown, max: number): string => (typeof v === 'string' ? txt(v, max) : '')

type NoData = Record<string, never>
type Def<D extends Record<string, Json> = Record<string, Json>> = CrisisDef<ModelState, D>
type Out = Branch<ModelState>

/** What a settlement with the first client costs, the day rate of a test shoot, and what a lawyer charges. */
const SETTLEMENT = 3_000
const DAY_RATE = 1_500
const LAWYER = 4_000
const LIKENESS_MIN = 5_000
const LIKENESS_MAX = 150_000
const LIKENESS_WINDOW = 2
const LIKENESS = 'likeness'

type Meter = 'book' | 'buzz' | 'rep' | 'strain' | 'mood'
/** Moves a 0-100 meter by `d`, one decimal. */
const bump = (s: ModelState, key: Meter, d: number): void => {
  s[key] = clamp(round1(s[key] + d), 0, 100)
}

// ---------------------------------------------------------------------------
// The board, read and written

/** This year's castings, derived on demand and never written. Pure. */
const items = (g: GameState, s: ModelState): MdOffer[] => boardOf(g, s)

/** The board written for this year, so a change to a casting holds. Branch `then` bodies only. */
function liveBoard(g: GameState, s: ModelState): MdOffer[] {
  if (s.board.year !== g.year) s.board = { year: g.year, items: buildBoard(g, s) }
  return s.board.items
}

const cheapest = (list: readonly MdOffer[]): MdOffer | undefined => [...list].sort((a, b) => a.fee - b.fee || (a.id < b.id ? -1 : 1))[0]

/** The casting an injury costs you: the cheapest booked job, else the cheapest still open (the crisis is offered at the settle, when none is booked yet). Pure. */
function cancelTarget(list: readonly MdOffer[]): MdOffer | undefined {
  return cheapest(list.filter((o) => o.status === 'booked')) ?? cheapest(list.filter((o) => o.status === 'open'))
}

const categoryOf = (brand: string): string => brandById(brand)?.category ?? ''
const tripOf = (o: MdOffer): boolean => o.abroad && (o.kind === 'runway' || o.kind === 'couture')

/** The open casting that breaks a live exclusivity window: same category, another client, no trip to pay for. Pure. */
function conflictOf(g: GameState, s: ModelState): MdOffer | null {
  const live = s.windows.filter((w) => w.until >= g.year)
  if (live.length === 0) return null
  for (const o of items(g, s)) {
    if (o.status !== 'open' || !o.brand || tripOf(o)) continue
    const cat = categoryOf(o.brand)
    if (cat && live.some((w) => w.category === cat && w.brand !== o.brand)) return o
  }
  return null
}

// ---------------------------------------------------------------------------
// The contract, read and written

/** Moves the commission of the job's contract by `d` points, 12 to 30 (a legacy job's contract is written first). Branch `then` bodies only. */
function moveCommission(g: GameState, d: number): void {
  const job = modelJob(g)
  const k = job ? ensureContract(g, job) : null
  if (job && k) saveContract(job, { ...k, commission: clamp(Math.round(k.commission + d), 12, 30) })
}

/** The retainer rises by 10%, and so does the floor the legacy hook pays next tick. Branch `then` bodies only. */
function liftRetainer(s: ModelState, g: GameState): void {
  const job = modelJob(g)
  if (!job || !(job.salary > 0)) return
  job.salary = Math.round(job.salary * 1.1)
  s.floor = job.salary
}

// ---------------------------------------------------------------------------
// 1. Rival agency approach

const agencyApproach: Def<{ agency: string }> = {
  id: 'agencyApproach',
  title: 'A Rival Agency',
  emoji: '\u{1F3E2}',
  cool: 4,
  weight: (g, s) => (modelJob(g) && s.mood < 80 && bestSwitch(g, s) !== null ? 0.25 : 0),
  make: (g, s) => ({ agency: bestSwitch(g, s) ?? '' }),
  scene: (_g, _s, d) => `${str(d.agency, 40) || 'A rival agency'} wants you and has called your agent. What will you do?`,
  options: {
    safe: {
      label: 'Stay put',
      emoji: '\u{1F91D}',
      good: () => ({
        text: () => 'You stayed. Your agency cut its commission 2 points to keep you, and the mood in the office lifted.',
        fx: {},
        then: (s, g) => {
          moveCommission(g, -2)
          bump(s, 'mood', 6)
        },
      }),
    },
    bold: {
      label: 'Play them off',
      emoji: '\u{1F3AD}',
      odds: () => 0.55,
      good: (g) => {
        const lift = (modelJob(g)?.salary ?? 0) > 0 && readContract(modelJob(g), g)?.guarantee === true
        return {
          text: () => (lift ? 'Your agency matched the offer. Commission fell 2 points and your retainer rose 10%.' : 'Your agency matched the offer and cut its commission 2 points.'),
          fx: {},
          then: (s, gg) => {
            moveCommission(gg, -2)
            if (lift) liftRetainer(s, gg)
          },
        }
      },
      bad: () => ({ text: () => 'Your agency called the bluff. The standoff wore you out.', fx: {}, then: (s) => bump(s, 'mood', -10) }),
    },
    cash: {
      label: 'Switch agencies',
      emoji: '\u{1F501}',
      good: (g, s, d): Out => {
        const agency = str(d.agency, 40)
        const why = agency ? switchBlock(g, s, agency) : "That offer isn't on the table anymore."
        if (why) return { text: () => `You couldn't make the move. ${why}`, fx: {} }
        return {
          text: () => `You signed with ${agency}. Your old agency keeps 5% of your fees for eight years.`,
          fx: {},
          // switchAgency pays the release fee and meets the new booker itself; its own notices fold into the log
          then: (t, gg) => switchAgency(careerCtx(gg, 'model', t, { choices: 0, notices: 0 }), agency),
        }
      },
    },
  },
}

// ---------------------------------------------------------------------------
// 2. Window conflict

const windowConflict: Def<{ offer: string }> = {
  id: 'windowConflict',
  title: 'Exclusive Deal',
  emoji: '\u{1F4DC}',
  cool: 3,
  weight: (g, s) => (conflictOf(g, s) ? 0.4 : 0),
  make: (g, s) => ({ offer: conflictOf(g, s)?.id ?? '' }),
  scene: () => 'Another client wants you for work that breaks your exclusive deal. What will you do?',
  options: {
    safe: {
      label: 'Honor the deal',
      emoji: '\u{1F91D}',
      good: () => ({ text: () => 'You turned the job down. The first client heard about it and thought better of you.', fx: {}, then: (s) => bump(s, 'rep', 3) }),
    },
    cash: {
      label: 'Take the job',
      emoji: '\u{1F4B8}',
      good: (g, s, d): Out => {
        const id = str(d.offer, 24)
        const o = items(g, s).find((x) => x.id === id && x.status === 'open')
        if (!o || castBlock(g, { ...s, windows: [] }, o) !== null) return { text: () => 'The job slipped away, so you kept your word to the first client.', fx: {} }
        if (g.character.money < SETTLEMENT) return { text: () => `You couldn't cover the ${money(SETTLEMENT)} settlement, so you kept your word.`, fx: {} }
        return {
          text: (r) => `You took the job and paid ${money(r.paid)} to settle with the first client. Your word took a hit.`,
          fx: { money: -SETTLEMENT },
          then: (t, gg) => {
            const live = liveBoard(gg, t)
            const taken = live.find((x) => x.id === id && x.status === 'open')
            if (!taken) return
            const cat = categoryOf(taken.brand)
            t.windows = t.windows.filter((w) => !(w.category === cat && w.until >= gg.year && w.brand !== taken.brand))
            const k = readContract(modelJob(gg), gg)
            taken.status = 'booked'
            taken.terms = k ? { agency: k.agency, commission: k.commission, mother: motherPct(t, gg.year) } : null
            if (taken.window > 0 && taken.brand) t.windows = cap([...t.windows.filter((w) => w.brand !== taken.brand), { brand: taken.brand, category: cat, until: gg.year + taken.window }], 8)
            bump(t, 'rep', -10)
            bump(t, 'mood', -10)
          },
        }
      },
    },
  },
}

// ---------------------------------------------------------------------------
// 3. Injury on set

const injury: Def<NoData> = {
  id: 'injury',
  title: 'Hurt on Set',
  emoji: '\u{1FA79}',
  cool: 3,
  weight: (g, s) => (modelJob(g) && cancelTarget(items(g, s)) ? strainRisk(s.strain) : 0),
  make: () => ({}),
  scene: () => 'You were hurt on set, and the client expects you back on the calendar. What will you do?',
  options: {
    safe: {
      label: 'Cancel the job',
      emoji: '\u{1F6D1}',
      good: () => ({
        text: () => 'You pulled out of a job to recover. The client moved on, and the agency took note.',
        fx: { health: -1 },
        then: (s, g) => {
          const board = liveBoard(g, s)
          const target = cancelTarget(board)
          // The crisis is offered at the settle, before this year has a booking, so the target is usually a casting you
          // never took: it just comes off the board. A booked job is closed as passed, and the next settle charges it.
          if (target?.status === 'booked') target.status = 'passed'
          else if (target) s.board.items = board.filter((o) => o !== target)
          bump(s, 'strain', -15)
          bump(s, 'rep', -3)
        },
      }),
    },
    bold: {
      label: 'Work through it',
      emoji: '\u{1F4AA}',
      good: () => ({
        text: () => 'You worked through the injury. The client was pleased, and the strain showed.',
        fx: { health: -6 },
        then: (s) => {
          bump(s, 'strain', 10)
          bump(s, 'rep', 1)
        },
      }),
    },
  },
}

// ---------------------------------------------------------------------------
// 4. Photographer test shoot

/** A fictional local photographer, from the crisis seed: the name the shoot records. */
function photographerFor(g: GameState, r: SRng): string {
  const pool = namePoolOf(g.character.countryId)
  const firsts = (r.chance(0.5) ? pool.male : pool.female).filter((f) => nameFitsYear(f, g.year - 35))
  return `${r.pick(firsts.length > 0 ? firsts : pool.male)} ${r.pick(pool.last)}`
}

/** Book points through the diminishing-return formula, and the photographer on record (eight at most). */
function shot(s: ModelState, name: string, points: number): void {
  s.book = round1(gainBook(s.book, points))
  if (name) s.photographers = cap([...s.photographers.filter((x) => x !== name), name], 8)
}

const testShoot: Def<{ name: string }> = {
  id: 'testShoot',
  title: 'Test Shoot',
  emoji: '\u{1F4F7}',
  cool: 4,
  weight: (_g, s) => (s.book >= 20 ? 0.3 : 0),
  make: (g, _s, r) => ({ name: photographerFor(g, r) }),
  scene: () => `A photographer offers a test shoot. Pay the ${money(DAY_RATE)} day rate or trade for prints. What will you do?`,
  options: {
    safe: {
      label: 'Trade for prints',
      emoji: '\u{1F5BC}\u{FE0F}',
      good: (_g, _s, d) => {
        const name = str(d.name, 40)
        return { text: () => `You traded a day with ${name || 'the photographer'} for prints. Your book grew by 2 points.`, fx: {}, then: (s) => shot(s, name, 2) }
      },
    },
    cash: {
      label: 'Pay the day rate',
      emoji: '\u{1F4B5}',
      good: (g, _s, d): Out => {
        const name = str(d.name, 40)
        if (g.character.money < DAY_RATE) return { text: () => "You couldn't cover the day rate, so you traded for prints.", fx: {}, then: (s) => shot(s, name, 2) }
        return { text: (r) => `You paid ${money(r.paid)} for a day with ${name || 'the photographer'}. Your book grew by 5 points.`, fx: { money: -DAY_RATE }, then: (s) => shot(s, name, 5) }
      },
    },
  },
}

// ---------------------------------------------------------------------------
// 5. Rival rumor

/** The rival with the highest grudge (then the most losses) among those holding 2 or more. Pure. */
function feudist(s: ModelState): { id: string; name: string } | null {
  const top = [...s.memory].filter((m) => m.grudge >= 2).sort((a, b) => b.grudge - a.grudge || b.lost - a.lost || (a.id < b.id ? -1 : 1))[0]
  return top ? { id: top.id, name: top.name } : null
}

const rumor: Def<{ id: string; name: string }> = {
  id: 'rumor',
  title: 'A Rumor',
  emoji: '\u{1F5E3}\u{FE0F}',
  cool: 4,
  weight: (_g, s) => (s.rep < 60 && feudist(s) ? 0.3 : 0),
  make: (_g, s) => feudist(s) ?? { id: '', name: '' },
  scene: (_g, _s, d) => `${str(d.name, 40) || 'A rival'} is telling clients you're hard to work with. What will you do?`,
  options: {
    safe: {
      label: 'Ignore it',
      emoji: '\u{1F910}',
      good: () => ({ text: () => 'You ignored the rumor. It lingered, and your buzz slipped.', fx: {}, then: (s) => bump(s, 'buzz', -4) }),
    },
    bold: {
      label: 'Confront them',
      emoji: '\u{1F4AC}',
      odds: () => 0.5,
      good: (_g, _s, d) => {
        const id = str(d.id, 60)
        return {
          text: () => `${str(d.name, 40) || 'Your rival'} backed down and took it back, and the feud cooled.`,
          fx: {},
          then: (s) => void (s.memory = s.memory.map((m) => (m.id === id ? { ...m, grudge: 0 } : m))),
        }
      },
      bad: (_g, _s, d) => ({ text: () => `${str(d.name, 40) || 'Your rival'} brushed you off and the story grew. You looked worse for it.`, fx: { fame: 2 }, then: (s) => bump(s, 'rep', -5) }),
    },
    cash: {
      label: 'Leave it to your agent',
      emoji: '\u{1F4DE}',
      good: () => ({ text: () => 'Your agent killed the rumor. You felt shut out of the fix.', fx: {}, then: (s) => bump(s, 'mood', -5) }),
    },
  },
}

// ---------------------------------------------------------------------------
// 6. Younger faces

const youngerFaces: Def<NoData> = {
  id: 'youngerFaces',
  title: 'Younger Faces',
  emoji: '\u{23F3}',
  cool: 5,
  weight: (g, s) => (s.focus === 'runway' && fin(g.character.age) >= 27 && shelf(s.focus, g.character.age, hasTalent(g, 'Modeling'), g.year) < 0.85 ? 0.35 : 0),
  make: () => ({}),
  scene: () => 'Casting calls now ask for younger faces on the runway. Your agent has a plan. What will you do?',
  options: {
    safe: {
      label: 'Move to editorial',
      emoji: '\u{1F4F0}',
      good: () => ({ text: () => 'You moved to editorial work. Your book and buzz held.', fx: {}, then: (s, g) => move(s, g, 'editorial') }),
    },
    bold: {
      label: 'Stay on runway',
      emoji: '\u{1F460}',
      good: () => ({
        text: () => 'You stayed on the runway. Calls came less often, and the pace added strain.',
        fx: {},
        then: (s, g) => {
          bump(s, 'strain', 6)
          // one fewer casting this year: the cheapest open one slips away, and a lost casting still uses a slot
          const gone = cheapest(liveBoard(g, s).filter((o) => o.status === 'open'))
          if (gone) gone.status = 'lost'
        },
      }),
    },
    cash: {
      label: 'Move to commercial',
      emoji: '\u{1F4FA}',
      good: () => ({ text: () => 'You moved to commercial work. Fees rise, and your book builds slower.', fx: {}, then: (s, g) => move(s, g, 'commercial') }),
    },
  },
}

/** A change of direction with no cost to the book or the buzz; it counts as this year's one change. */
function move(s: ModelState, g: GameState, focus: 'editorial' | 'commercial'): void {
  s.focus = focus
  s.focusYear = g.year
}

// ---------------------------------------------------------------------------
// 7. Likeness licence

/** 15% of the gross of your latest paid year, at least 5,000 and at most 150,000. Pure. */
function licencePay(s: ModelState): number {
  const last = s.ledger.reduce((m, r) => Math.max(m, r.year), 0)
  const gross = s.ledger.filter((r) => r.year === last).reduce((n, r) => n + r.gross, 0)
  return clamp(Math.round(0.15 * gross), LIKENESS_MIN, LIKENESS_MAX)
}

const markLikeness = (s: ModelState): void => {
  s.announced = cap([...s.announced.filter((x) => x !== LIKENESS), LIKENESS], 8)
}

const likenessLicence: Def<{ pay: number }> = {
  id: 'likenessLicence',
  title: 'Likeness Licence',
  emoji: '\u{1F4BB}',
  cool: 4,
  weight: (g, s) => (g.year >= 2023 && hasTech(g, 'aiAssistants') && !s.announced.includes(LIKENESS) ? 0.5 : 0),
  make: (_g, s) => ({ pay: licencePay(s) }),
  scene: () => 'A studio wants to license your likeness for digital work. It pays now and runs three years. What will you do?',
  options: {
    safe: {
      label: 'Sign a limited licence',
      emoji: '\u{270D}\u{FE0F}',
      good: (_g, _s, d) => {
        const half = Math.round(clamp(fin(d.pay), 0, LIKENESS_MAX) / 2)
        return {
          text: (r) => `You licensed limited use for ${money(r.earned)}. Your fees stay as they are.`,
          fx: { money: half },
          then: (s) => {
            s.likeness = clamp(half, 0, LIKENESS_MAX)
            markLikeness(s)
          },
        }
      },
    },
    bold: {
      label: 'Refuse the licence',
      emoji: '\u{1F6AB}',
      good: () => ({
        text: () => 'You refused. The studio found another face, and your team was disappointed.',
        fx: {},
        then: (s) => {
          bump(s, 'mood', -5)
          markLikeness(s)
        },
      }),
    },
    cash: {
      label: 'Sign the full licence',
      emoji: '\u{1F4B0}',
      good: (_g, _s, d) => {
        const pay = clamp(Math.round(fin(d.pay)), 0, LIKENESS_MAX)
        return {
          text: (r) => `You licensed your likeness in full for ${money(r.earned)}. Digital fees drop 5% for three years.`,
          fx: { money: pay },
          then: (s, g) => {
            s.likeness = pay
            s.cool.licence = clamp(g.year + LIKENESS_WINDOW, 0, 9999)
            markLikeness(s)
          },
        }
      },
    },
  },
}

// ---------------------------------------------------------------------------
// 8. Press storm

const pressStorm: Def<NoData> = {
  id: 'pressStorm',
  title: 'Press Storm',
  emoji: '\u{1F4F0}',
  cool: 4,
  weight: (g) => (fameOf(g) >= 30 || totalFollowers(g) >= 500_000 ? 0.12 : 0),
  make: () => ({}),
  scene: () => 'A story about you is spreading, and the facts are shaky. Reporters are calling. What will you do?',
  options: {
    safe: {
      label: 'Apologize publicly',
      emoji: '\u{1F64F}',
      good: () => ({
        text: () => 'You apologized in public. The story faded, and clients liked how you handled it.',
        fx: {},
        then: (s) => {
          bump(s, 'buzz', -8)
          bump(s, 'rep', 2)
        },
      }),
    },
    bold: {
      label: 'Say nothing',
      emoji: '\u{1F910}',
      odds: () => 0.5,
      good: () => ({ text: () => 'You said nothing, and the story died on its own.', fx: {} }),
      bad: () => ({ text: () => 'Your silence read as guilt. Buzz fell hard and your fame took a hit.', fx: { fame: -3 }, then: (s) => bump(s, 'buzz', -15) }),
    },
    cash: {
      label: 'Hire a lawyer',
      emoji: '\u{2696}\u{FE0F}',
      odds: () => 0.7,
      good: () => ({ text: (r) => `Your lawyer cost ${money(r.paid)} and the story went quiet.`, fx: { money: -LAWYER } }),
      bad: () => ({ text: (r) => `The lawyer cost ${money(r.paid)} and the story ran anyway. Buzz and fame fell.`, fx: { money: -LAWYER, fame: -3 }, then: (s) => bump(s, 'buzz', -15) }),
    },
  },
}

// ---------------------------------------------------------------------------

/** The eight crises, in the order the weights are read. */
export const MODEL_DEFS: readonly CrisisDef<ModelState, any>[] = [agencyApproach, windowConflict, injury, testShoot, rumor, youngerFaces, likenessLicence, pressStorm]

export const modelCrises: CrisisSet<ModelState> = defineCrises({ career: 'model', store: modelStore, talent: 'Modeling', defs: MODEL_DEFS })

/**
 * The chance an injury is offered at the next settle, if the workload is `strain` by then: the kit's offer roll times the
 * injury's share of the eligible weights, which is not strainRisk itself (that is only the weight). Pure.
 */
export function injuryOdds(g: GameState, s: ModelState, strain: number): number {
  return modelCrises.odds(g, { ...s, strain }, 'injury')
}
