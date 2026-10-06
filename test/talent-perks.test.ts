// Special talents (talents.ts) in careers and everyday life: every non-business talent makes its
// perk real, picked (Character.talents) and discovered (Character.talent) talents both count,
// nothing changes without the talent, purple hints only show to the gifted, and nothing is a
// sure thing.
import { describe, expect, it } from 'vitest'
import { craftSkill, creativeMenu } from '../src/game/activities/creative'
import { mindBodyMenu } from '../src/game/activities/mindBody'
import { presentInterview, yearlyCareer } from '../src/game/careers'
import { aptitude, practice } from '../src/game/computer/dev-learn'
import { projectsMenu } from '../src/game/computer/dev-projects'
import { codingSkill } from '../src/game/computer/skills'
import { counter } from '../src/game/core'
import { applicantMerit } from '../src/game/education'
import { yearlyHealth } from '../src/game/health'
import { runScript } from '../src/game/scripts'
import { specialCareersMenu } from '../src/game/special'
import { flagSkill, hire, talentMatches } from '../src/game/special/common'
import { designSkill } from '../src/game/special/gamedev-state'
import { yearlyModel } from '../src/game/special/model'
import { HINT_EMOJI, hasTalent, type TalentId } from '../src/game/talents'
import type { ChoiceModal, GameState, InterviewQuestion, Job, Json, MenuAction, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Helpers

type Gift = { picked?: TalentId[]; discovered?: string }

function game(age: number, gift: Gift = {}, seed = 7): GameState {
  const g = makeTestGame(seed, { age })
  g.log = [{ age, year: 2026, entries: [] }]
  if (gift.picked) g.character.talents = [...gift.picked]
  if (gift.discovered) g.character.talent = gift.discovered
  return g
}

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 13)

function findNode(g: GameState, nodes: MenuNode[], id: string, depth = 0): MenuNode | undefined {
  if (depth > 6) return undefined
  for (const n of nodes) {
    if ('id' in n && n.id === id) return n
    if (n.type === 'menu') {
      const hit = findNode(g, n.children(g), id, depth + 1)
      if (hit) return hit
    }
  }
  return undefined
}

function action(g: GameState, nodes: MenuNode[], id: string): MenuAction {
  const n = findNode(g, nodes, id)
  if (!n || n.type !== 'action') throw new Error(`action ${id} not found`)
  return n
}

function run(g: GameState, nodes: MenuNode[], id: string): void {
  const a = action(g, nodes, id)
  const why = a.disabledReason?.(g)
  if (why) throw new Error(`action ${id} is disabled: ${why}`)
  a.run(g)
}

/** The first choice popup in the queue (notices skipped), removed from the queue. */
function takeChoice(g: GameState): ChoiceModal {
  for (;;) {
    const m = g.queue.shift()
    if (!m) throw new Error('no choice in the queue')
    if (m.kind === 'choice') return m
  }
}

/** Answer the next choice popup the way the store does. */
function answer(g: GameState, choiceId: string): ChoiceModal {
  const m = takeChoice(g)
  const before = g.queue.length
  runScript(g, m.scriptId!, choiceId, m.data, m)
  g.queue.unshift(...g.queue.splice(before))
  return m
}

const hinted = (m: ChoiceModal) => m.choices.filter((c) => typeof c.hint === 'string' && c.hint.startsWith(HINT_EMOJI))
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)

/** Average of `measure` over the seeds, with and without the talent (same seeds both ways). */
function compare(talent: TalentId, measure: (g: GameState) => number, setup: (seed: number, gift: Gift) => GameState): { gifted: number; plain: number } {
  return {
    gifted: avg(SEEDS.map((s) => measure(setup(s, { picked: [talent] })))),
    plain: avg(SEEDS.map((s) => measure(setup(s, {})))),
  }
}

// ---------------------------------------------------------------------------

describe('picked and discovered talents', () => {
  it('both count, and nothing counts without one', () => {
    expect(hasTalent(game(20, { picked: ['Acting'] }), 'Acting')).toBe(true)
    expect(hasTalent(game(20, { discovered: 'Acting' }), 'Acting')).toBe(true)
    expect(hasTalent(game(20), 'Acting')).toBe(false)
    // Older helpers that matched c.talent by name now see picked talents too.
    expect(talentMatches(game(20, { picked: ['Athletics'] }), /athlet/i)).toBe(true)
    expect(talentMatches(game(20, { picked: ['Business'] }), /music|sing|instrument/i)).toBe(false)
  })

  it('apply the same perk either way (Programming learns 1.5x faster)', () => {
    const plain = aptitude(game(20))
    expect(aptitude(game(20, { picked: ['Programming'] }))).toBeCloseTo(plain * 1.5, 5)
    expect(aptitude(game(20, { discovered: 'Programming' }))).toBeCloseTo(plain * 1.5, 5)
    // Someone else's talent does nothing for coding.
    expect(aptitude(game(20, { picked: ['Acting', 'Music', 'Athletics'] }))).toBeCloseTo(plain, 5)
  })
})

describe('Acting', () => {
  const careers = (g: GameState) => specialCareersMenu.children(g)

  it('acting skill grows much faster from practice and lessons', () => {
    const practiced = compare('Acting', (g) => {
      run(g, careers(g), 'actor.practice')
      run(g, careers(g), 'actor.practice')
      return flagSkill(g, 'acting')
    }, (s, gift) => game(20, gift, s))
    expect(practiced.gifted).toBeGreaterThan(practiced.plain * 1.4)

    const lessons = compare('Acting', (g) => {
      for (let i = 0; i < 3; i++) run(g, mindBodyMenu.children(g), 'mb.lesson.acting')
      return flagSkill(g, 'acting')
    }, (s, gift) => {
      const g = game(20, gift, s)
      g.character.money = 10_000
      return g
    })
    expect(lessons.gifted).toBeGreaterThan(lessons.plain * 1.4)
  })

  it('lands auditions far more often, but never every time', () => {
    const listing = { title: 'The Silent Harbor', kind: 'film', genre: 'Drama', role: 'Supporting', studio: 'Paragon Pictures', pay: 60_000, budget: 'studio' } as unknown as Json
    const landed = (gift: Gift) =>
      SEEDS.map((s) => {
        const g = game(22, gift, s)
        g.flags['skill.acting'] = 30
        runScript(g, 'special.actor.audition', 'heartfelt', listing, g.queue[0])
        return g.character.job?.defId === 'actor' ? 1 : 0
      })
    const gifted = avg(landed({ picked: ['Acting'] }))
    const plain = avg(landed({}))
    expect(gifted - plain).toBeGreaterThan(0.25)
    expect(gifted).toBeLessThan(1)
  })

  it('casting offers bigger parts with bigger checks, and a purple hint picks the best fit', () => {
    const offers = (gift: Gift) =>
      SEEDS.map((s) => {
        const g = game(24, gift, s)
        g.flags['skill.acting'] = 40
        run(g, careers(g), 'actor.audition')
        const m = takeChoice(g)
        const items = (g.flags['special.list.actor.roles'] as { items: { role: string; pay: number }[] }).items
        return { m, tier: avg(items.map((l) => (l.role === 'Lead' ? 2 : l.role === 'Supporting' ? 1 : 0))), pay: avg(items.map((l) => l.pay)) }
      })
    const gifted = offers({ picked: ['Acting'] })
    const plain = offers({})
    expect(avg(gifted.map((x) => x.tier))).toBeGreaterThan(avg(plain.map((x) => x.tier)) + 0.2)
    expect(avg(gifted.map((x) => x.pay))).toBeGreaterThan(avg(plain.map((x) => x.pay)) * 1.2)
    for (const x of gifted) expect(hinted(x.m)).toHaveLength(1)
    for (const x of plain) expect(hinted(x.m)).toHaveLength(0)
  })

  it('marks the approach the casting director wants', () => {
    const g = game(22, { picked: ['Acting'] })
    const plain = game(22)
    const listing = { title: 'Ha Ha Heist', kind: 'film', genre: 'Comedy', role: 'Extra', studio: 'Big Sky Films', pay: 900, budget: 'indie' }
    for (const x of [g, plain]) {
      x.flags['special.list.actor.roles'] = { age: 22, owner: `${x.character.id}:${x.character.firstName}:${x.character.lastName}:${x.year - 22}`, items: [listing] } as unknown as Json
      runScript(x, 'special.actor.pick', '0', undefined, x.queue[0])
    }
    const m = takeChoice(g)
    expect(hinted(m).map((c) => c.id)).toEqual(['comedic'])
    expect(hinted(takeChoice(plain))).toHaveLength(0)
  })
})

describe('Music', () => {
  it('instrument lessons teach faster', () => {
    const r = compare('Music', (g) => {
      for (let i = 0; i < 3; i++) run(g, mindBodyMenu.children(g), 'mb.instrument.Guitar')
      return (g.flags.instruments as Record<string, number>).Guitar ?? 0
    }, (s, gift) => {
      const g = game(20, gift, s)
      g.character.money = 10_000
      return g
    })
    expect(r.gifted).toBeGreaterThan(r.plain * 1.4)
  })

  it('records come out better and chart higher', () => {
    const release = (gift: Gift) =>
      SEEDS.map((s) => {
        const g = game(25, gift, s)
        g.flags.instruments = { Guitar: 55 }
        hire(g, { defId: 'musician', title: 'Solo Artist', company: 'Garage Door Records', salary: 10_000, data: { mode: 'solo', instrument: 'Guitar', genre: 'Pop', label: 'Garage Door Records', contractYears: 2, advancePerYear: 10_000, popularity: 30, bandName: null, bandmates: [], members: 1, recordedAge: -1, lastRelease: -1 } })
        runScript(g, 'special.music.title', 'Night Bus', { type: 'studio', subgenre: 'Dance' }, g.queue[0])
        const disc = (g.flags['special.music'] as { discography: { quality: number; sold: number }[] }).discography
        return disc[0]
      })
    const gifted = release({ picked: ['Music'] })
    const plain = release({})
    expect(avg(gifted.map((r) => r.quality))).toBeGreaterThan(avg(plain.map((r) => r.quality)) + 6)
    expect(avg(gifted.map((r) => r.sold))).toBeGreaterThan(avg(plain.map((r) => r.sold)) * 1.2)
  })
})

describe('Athletics', () => {
  it('training builds athleticism faster', () => {
    const r = compare('Athletics', (g) => {
      const before = g.character.hidden.athleticism
      for (let i = 0; i < 4; i++) run(g, mindBodyMenu.children(g), 'mb.gym.weights')
      return g.character.hidden.athleticism - before
    }, (s, gift) => {
      const g = game(20, gift, s)
      g.character.money = 1_000
      return g
    })
    expect(r.gifted).toBeGreaterThan(r.plain * 1.3)
  })

  it('points a gifted athlete at the strongest team that should take them', () => {
    let hintedOffers = 0
    for (const s of SEEDS.slice(0, 10)) {
      const g = game(20, { picked: ['Athletics'] }, s)
      g.character.hidden.athleticism = 85
      runScript(g, 'special.athlete.league', 'gridiron', undefined, g.queue[0])
      const m = takeChoice(g)
      const h = hinted(m)
      expect(h.length).toBeLessThanOrEqual(1)
      hintedOffers += h.length
      const plain = game(20, {}, s)
      plain.character.hidden.athleticism = 85
      runScript(plain, 'special.athlete.league', 'gridiron', undefined, plain.queue[0])
      expect(hinted(takeChoice(plain))).toHaveLength(0)
    }
    expect(hintedOffers).toBeGreaterThan(5)
  })
})

describe('Creative Arts (Writing, Art, Cooking, Comedy)', () => {
  const nodes = (g: GameState) => creativeMenu.children(g)

  it('each craft grows faster with its talent', () => {
    const crafts: [TalentId, string, string, string][] = [
      ['Writing', 'mb.creative.write', 'poem', 'writing'],
      ['Art', 'mb.creative.art', 'paint', 'art'],
      ['Cooking', 'mb.creative.cook', '0', 'cooking'],
      ['Comedy', 'mb.creative.standup', 'observational', 'comedy'],
    ]
    for (const [talent, id, choice, craft] of crafts) {
      const r = compare(talent, (g) => {
        for (let i = 0; i < 3; i++) {
          run(g, nodes(g), id)
          answer(g, choice)
        }
        return craftSkill(g, craft as 'writing')
      }, (s, gift) => game(20, gift, s))
      expect(r.gifted, talent).toBeGreaterThan(r.plain * 1.4)
    }
  })

  it('better writing wins more prize money', () => {
    const r = compare('Writing', (g) => {
      for (let i = 0; i < 3; i++) {
        run(g, nodes(g), 'mb.creative.write')
        answer(g, 'story')
      }
      return g.character.money
    }, (s, gift) => {
      const g = game(25, gift, s)
      g.flags['skill.writing'] = 60
      return g
    })
    expect(r.gifted).toBeGreaterThan(r.plain * 1.5)
  })

  it('comedians kill more often and get famous faster, but still bomb sometimes', () => {
    const sets = (gift: Gift) =>
      SEEDS.map((s) => {
        const g = game(22, gift, s)
        let killed = 0
        let bombed = 0
        for (let i = 0; i < 3; i++) {
          run(g, nodes(g), 'mb.creative.standup')
          const m = takeChoice(g)
          // Follow the purple hint when there is one.
          const pickId = hinted(m)[0]?.id ?? 'observational'
          const before = g.queue.length
          runScript(g, m.scriptId!, pickId, m.data, m)
          const res = g.queue.slice(before).find((x) => x.kind === 'notice')
          if (res && res.kind === 'notice' && res.title === 'You Killed!') killed++
          if (res && res.kind === 'notice' && res.title === 'You Bombed') bombed++
          g.queue = []
        }
        return { killed, bombed, fame: g.character.hidden.fame }
      })
    const gifted = sets({ picked: ['Comedy'] })
    const plain = sets({})
    expect(avg(gifted.map((x) => x.killed))).toBeGreaterThan(avg(plain.map((x) => x.killed)) + 0.5)
    expect(avg(gifted.map((x) => x.fame))).toBeGreaterThan(avg(plain.map((x) => x.fame)))
    expect(gifted.some((x) => x.bombed > 0)).toBe(true)
  })

  it('shows purple hints only to the talented', () => {
    for (const [talent, id] of [
      ['Writing', 'mb.creative.write'],
      ['Art', 'mb.creative.art'],
      ['Comedy', 'mb.creative.standup'],
    ] as [TalentId, string][]) {
      const g = game(22, { picked: [talent] })
      run(g, nodes(g), id)
      expect(hinted(takeChoice(g)), talent).toHaveLength(1)
      const plain = game(22)
      run(plain, nodes(plain), id)
      // No empty hint fields either: the popup is saved with the game.
      expect(takeChoice(plain).choices.every((c) => c.hint === undefined), talent).toBe(true)
    }
  })

  it('has per-year limits', () => {
    const g = game(22, { picked: ['Writing'] })
    for (let i = 0; i < 3; i++) {
      run(g, nodes(g), 'mb.creative.write')
      answer(g, 'poem')
    }
    g.queue = []
    const used = craftSkill(g, 'writing')
    run(g, nodes(g), 'mb.creative.write')
    expect(g.queue.some((m) => m.kind === 'choice')).toBe(false)
    expect(craftSkill(g, 'writing')).toBe(used)
  })

  it('sells art for more with the Art talent', () => {
    const r = compare('Art', (g) => {
      g.flags['creative.pieces'] = [{ title: 'Blue Study No. 4', q: 70, medium: 'paint', age: 24 }]
      run(g, nodes(g), 'mb.creative.sell')
      answer(g, '0')
      answer(g, 'online')
      return g.character.money
    }, (s, gift) => game(25, gift, s))
    expect(r.gifted).toBeGreaterThan(r.plain * 1.3)
  })
})

describe('Modeling', () => {
  it('looks fade more slowly with age', () => {
    const r = compare('Modeling', (g) => {
      for (let i = 0; i < 30; i++) {
        g.character.age += 1
        yearlyHealth(g)
        g.queue = []
      }
      return g.character.stats.looks
    }, (s, gift) => {
      const g = game(35, gift, s)
      g.character.stats.looks = 80
      return g
    })
    expect(r.gifted).toBeGreaterThan(r.plain + 5)
  })

  it('agencies come looking for you (only with the talent)', () => {
    let scouted = 0
    for (const s of SEEDS) {
      const g = game(20, { picked: ['Modeling'] }, s)
      g.character.stats.looks = 75
      yearlyModel(g)
      const m = g.queue.find((x): x is ChoiceModal => x.kind === 'choice' && x.scriptId === 'special.model.scout')
      if (m) {
        scouted++
        runScript(g, m.scriptId!, 'accept', m.data, m)
        expect(g.character.job?.defId).toBe('model')
      }
      const plain = game(20, {}, s)
      plain.character.stats.looks = 75
      yearlyModel(plain)
      expect(plain.queue.some((x) => x.kind === 'choice')).toBe(false)
    }
    expect(scouted).toBeGreaterThan(4)
    expect(scouted).toBeLessThan(SEEDS.length)
  })
})

describe('Academics', () => {
  it('reading at the library makes you smarter faster', () => {
    const r = compare('Academics', (g) => {
      const before = g.character.stats.smarts
      run(g, mindBodyMenu.children(g), 'mb.library')
      run(g, mindBodyMenu.children(g), 'mb.library')
      return g.character.stats.smarts - before
    }, (s, gift) => game(15, gift, s))
    expect(r.gifted).toBeGreaterThan(r.plain * 1.4)
  })

  it('makes you a stronger university applicant', () => {
    const plain = applicantMerit(game(18)).merit
    expect(applicantMerit(game(18, { picked: ['Academics'] })).merit).toBeGreaterThan(plain + 4)
  })
})

describe('Programming and Gaming', () => {
  it('coding practice pays off faster', () => {
    const r = compare('Programming', (g) => {
      for (let i = 0; i < 5; i++) practice(g, 6, 'python')
      return codingSkill(g)
    }, (s, gift) => game(20, gift, s))
    expect(r.gifted).toBeGreaterThan(r.plain * 1.3)
  })

  it('shows which kind of project is trending, only to a programmer', () => {
    const g = game(20, { picked: ['Programming'] })
    g.flags.codingSkill = 80
    const rows = projectsMenu.children(g).filter((n): n is MenuAction => n.type === 'action')
    expect(rows.filter((n) => n.hint?.(g)).length).toBe(1)
    const plain = game(20)
    plain.flags.codingSkill = 80
    expect(projectsMenu.children(plain).filter((n) => n.type === 'action' && n.hint?.(plain)).length).toBe(0)
  })

  it('gamers design better games', () => {
    expect(designSkill(game(20, { picked: ['Gaming'] }))).toBeGreaterThanOrEqual(designSkill(game(20)) + 10)
  })
})

describe('Crime', () => {
  it('gets you caught less often', () => {
    const arrests = (gift: Gift) =>
      avg(
        SEEDS.concat(SEEDS.map((s) => s + 1)).map((s) => {
          const g = game(16, gift, s)
          runScript(g, 'crime.delinquency', 'alone', { act: 'library' }, g.queue[0])
          return g.character.criminalRecord.some((r) => r.caught) ? 1 : 0
        }),
      )
    const gifted = arrests({ picked: ['Crime'] })
    const plain = arrests({})
    expect(plain).toBeGreaterThan(0.2)
    expect(gifted).toBeLessThan(plain * 0.85)
    expect(gifted).toBeGreaterThan(0)
  })
})

describe('Leadership', () => {
  function officeWorker(gift: Gift, seed: number): GameState {
    const g = game(35, gift, seed)
    const job: Job = { defId: 'accountant', title: 'Junior Accountant', company: 'Ledger & Co.', category: 'fulltime', salary: 50_000, level: 0, performance: 72, yearsInRole: 3, yearsAtCompany: 3, data: { hours: 40 } }
    g.character.job = job
    return g
  }

  it('wins promotions more easily', () => {
    const r = compare('Leadership', (g) => {
      yearlyCareer(g)
      return counter(g, 'promotions')
    }, (s, gift) => officeWorker(gift, s))
    expect(r.gifted).toBeGreaterThan(r.plain + 0.1)
  })

  it('polls better on the campaign trail and knows the best stop', () => {
    const polls = (gift: Gift) =>
      SEEDS.map((s) => {
        const g = game(30, gift, s)
        g.character.education.completed.push('elementary', 'middle', 'high')
        runScript(g, 'special.pol.budget', '0', { office: 'school', party: 'independent', issue: 'economy', incumbentRun: false }, g.queue[0])
        const m = takeChoice(g)
        return { poll: (m.data as { poll: number }).poll, hints: hinted(m).length }
      })
    const gifted = polls({ picked: ['Leadership'] })
    const plain = polls({})
    expect(avg(gifted.map((x) => x.poll))).toBeGreaterThan(avg(plain.map((x) => x.poll)) + 3)
    expect(gifted.every((x) => x.hints === 1)).toBe(true)
    expect(plain.every((x) => x.hints === 0)).toBe(true)
  })
})

describe('Cooking', () => {
  it('chefs perform better at work', () => {
    const r = compare('Cooking', (g) => {
      for (let i = 0; i < 3; i++) {
        if (g.character.job?.defId !== 'chef') break
        g.character.job.yearsInRole = 0
        yearlyCareer(g)
        g.queue = []
      }
      return g.character.job?.performance ?? 0
    }, (s, gift) => {
      const g = game(30, gift, s)
      g.character.job = { defId: 'chef', title: 'Line Cook', company: 'The Copper Pot', category: 'fulltime', salary: 30_000, level: 0, performance: 50, yearsInRole: 0, yearsAtCompany: 1, data: { hours: 40 } }
      return g
    })
    expect(r.gifted).toBeGreaterThan(r.plain + 3)
  })
})

describe('Comedy in job interviews', () => {
  it('reads the room: the best answer gets a purple hint', () => {
    const q: InterviewQuestion = {
      question: 'Why should we hire you?',
      answers: [
        { label: 'I work hard and learn fast', score: 85 },
        { label: 'I need the money', score: 20 },
        { label: 'My mom said I should apply', score: 10 },
      ],
    }
    const job = { defId: 'accountant', title: 'Junior Accountant', company: 'Ledger & Co.', salary: 50_000, category: 'fulltime' as const }
    const g = game(25, { picked: ['Comedy'] })
    presentInterview(g, job, q)
    expect(hinted(takeChoice(g)).map((c) => c.id)).toEqual(['0'])
    const plain = game(25)
    presentInterview(plain, job, q)
    expect(hinted(takeChoice(plain))).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Whole lives with talents: every perk path runs through real menus, popups, prison and death.

describe('whole lives with special talents', () => {
  function driver(seed: number) {
    let s = seed >>> 0 || 1
    const next = () => {
      s ^= s << 13
      s ^= s >>> 17
      s ^= s << 5
      return (s >>> 0) / 4294967296
    }
    return { next, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)), pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] }
  }

  function collect(g: GameState, nodes: MenuNode[], depth = 0, out: MenuAction[] = []): MenuAction[] {
    if (depth > 4) return out
    for (const n of nodes) {
      if (n.type === 'info' || n.type === 'heading') continue
      if (n.visible && !n.visible(g)) continue
      if (n.disabledReason && n.disabledReason(g)) continue
      // Menu hints must be pure: rendering them can't roll dice or change the game.
      if (n.hint) {
        const before = [g.rng, g.nextId, g.queue.length, JSON.stringify(g.flags), JSON.stringify(g.yearActions)].join('|')
        const h = n.hint(g)
        expect(h === null || typeof h === 'string').toBe(true)
        expect([g.rng, g.nextId, g.queue.length, JSON.stringify(g.flags), JSON.stringify(g.yearActions)].join('|')).toBe(before)
      }
      if (n.type === 'action' && n.id === 'surrenderLife') continue
      if (n.type === 'action') out.push(n)
      else collect(g, n.children(g), depth + 1, out)
    }
    return out
  }

  it('plays lives with every talent without errors, NaN money or broken saves', async () => {
    const { ageUp } = await import('../src/game/aging')
    const { applyFallback } = await import('../src/ai/director')
    const { createNewLife } = await import('../src/game/life')
    const { activitiesMenu, occupationMenu } = await import('../src/game/menus')
    const all: TalentId[] = ['Acting', 'Music', 'Athletics', 'Art', 'Writing', 'Comedy', 'Academics', 'Modeling', 'Cooking', 'Crime', 'Programming', 'Leadership', 'Gaming', 'Business', 'Investing']
    for (let seed = 1; seed <= 10; seed++) {
      const d = driver(seed * 104729)
      const talents = [all[(seed * 3) % all.length], all[(seed * 3 + 1) % all.length], all[(seed * 3 + 2) % all.length]]
      const g = createNewLife({ seed: seed + 500, year: 2026, talents })
      expect(talents.every((t) => hasTalent(g, t))).toBe(true)
      const drain = () => {
        for (let guard = 0; g.queue.length; guard++) {
          if (guard > 300) throw new Error('queue never drains')
          const m = g.queue.shift()!
          const before = g.queue.length
          if (m.kind === 'choice') {
            // Follow purple hints half the time, like a player who trusts their gut.
            const h = hinted(m)
            const c = h.length && d.next() < 0.5 ? h[0] : d.pick(m.choices)
            if (m.source === 'script') runScript(g, m.scriptId!, c.id, m.data, m)
            else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: c.id })
          } else if (m.kind === 'input') runScript(g, m.scriptId, m.input === 'number' ? String(m.min ?? 1) : m.defaultValue || 'Alex', m.data, m)
          else if (m.kind === 'minigame') runScript(g, m.scriptId, m.game === 'annualReport' ? 'skip' : m.game === 'burglary' ? JSON.stringify({ loot: 100, caught: false }) : m.game === 'pickpocket' ? 'success' : m.game === 'prisonEscape' ? 'caught' : 'done', m.data, m)
          else if (m.kind === 'aiTask') applyFallback(g, m.task)
          g.queue.unshift(...g.queue.splice(before))
        }
      }
      drain()
      while (g.character.alive && g.character.age < 125) {
        for (let i = d.int(0, 5); i > 0 && g.character.alive; i--) {
          const options = collect(g, d.pick([activitiesMenu, occupationMenu]).children(g))
          if (!options.length) continue
          const a = d.pick(options)
          a.run(g, a.input ? (a.input.kind === 'number' ? String(a.input.min ?? 1) : (a.input.defaultValue?.(g) ?? 'Alex')) : undefined)
          drain()
        }
        if (!g.character.alive) break
        ageUp(g)
        drain()
        expect(Number.isFinite(g.character.money)).toBe(true)
        for (const k of ['writing', 'art', 'cooking', 'comedy'] as const) {
          const v = craftSkill(g, k)
          expect(v >= 0 && v <= 100).toBe(true)
        }
      }
      expect(g.character.alive).toBe(false)
      const json = JSON.stringify(g)
      expect(JSON.stringify(JSON.parse(json))).toBe(json)
    }
  }, 120_000)
})
