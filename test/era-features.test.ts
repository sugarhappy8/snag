// Era gating: a 1980 childhood is a 1980 childhood. Home computers follow how common they
// really were, coding follows the computer, and modern features (smartphones, social media,
// crypto, apps, dating apps, esports, data science...) only exist once their technology does.
// Lives born in PRESENT_YEAR keep every feature they had before the year system.
import { afterAll, describe, expect, it } from 'vitest'
import { applyFallback } from '../src/game/offline'
import { ageUp } from '../src/game/aging'
import { electronicsListings, carListings } from '../src/game/assets'
import { computerMenu, ownsComputer } from '../src/game/computer'
import { getAComputerNodes, askParentsForComputer, learnInternals } from '../src/game/computer/dev-learn'
import { PROJECT_KINDS, VENTURE_DEFS } from '../src/game/computer/dev-kinds'
import { CODE_GIGS } from '../src/game/computer/dev-freelance'
import { moneyNodes } from '../src/game/computer/money'
import { codingSkill, CODING_LANGUAGES, languageInEra, languagesInEra, kidLanguage } from '../src/game/computer/skills'
import { computerEra, computerModel, eraOpen, eraReason, noComputerText, PRESENT_YEAR, SOCIAL_GATE } from '../src/game/computer/era'
import { netWorth } from '../src/game/core'
import { ALL_JOBS, ERA_FULLTIME_JOBS, FULLTIME_JOBS, getJobDef, jobInEra, PARTTIME_JOBS } from '../src/game/data/jobs'
import { fullTimeListings, jobRequirementProblem, partTimeListings, recruiterMatches } from '../src/game/careers'
import { majorsInEra } from '../src/game/education'
import { createNewLife } from '../src/game/life'
import { loveMenu } from '../src/game/love'
import { activitiesMenu, assetsMenu, occupationMenu } from '../src/game/menus'
import { createPerson } from '../src/game/people'
import { runScript } from '../src/game/scripts'
import { everydayListings } from '../src/game/shops/everyday'
import { esportsMenu } from '../src/game/special/sports-esports'
import { gameIndustryMenu } from '../src/game/special/gamedev'
import { platformsIn, PLATFORMS, genresIn, GENRES, enginesIn, ENGINES } from '../src/game/special/gamedev-data'
import { PLATFORMS as SOCIAL_PLATFORMS, socialMediaExists, socialMediaMenu } from '../src/game/special/social'
import type { GameState, MenuAction, MenuNode } from '../src/game/types'
import { makeTestGame } from './helpers'

// ---------------------------------------------------------------------------
// Helpers

/** Tiny driver RNG for answering popups (separate from the game's). */
function driver(seed: number) {
  let s = seed >>> 0 || 1
  const next = () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  return { next, pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)], int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)) }
}
type Driver = ReturnType<typeof driver>

function drain(g: GameState, d: Driver): void {
  for (let guard = 0; g.queue.length > 0; guard++) {
    if (guard > 300) throw new Error(`queue never drains; head: ${JSON.stringify(g.queue[0]).slice(0, 300)}`)
    const m = g.queue.shift()!
    const before = g.queue.length
    if (m.kind === 'choice') {
      const c = d.pick(m.choices)
      if (m.source === 'script') runScript(g, m.scriptId!, c.id, m.data, m)
      else applyFallback(g, { type: 'resolveChoice', event: m, choiceId: c.id })
    } else if (m.kind === 'input') {
      const v = m.input === 'number' ? String(d.int(m.min ?? 1, Math.min(m.max ?? 1000, (m.min ?? 1) + 1000))) : m.defaultValue || 'Alex'
      runScript(g, m.scriptId, v, m.data, m)
    } else if (m.kind === 'minigame') runScript(g, m.scriptId, m.game === 'blackjack' ? 'win' : m.game === 'burglary' ? JSON.stringify({ loot: 100, caught: false }) : m.game === 'prisonEscape' ? 'caught' : m.game === 'pickpocket' ? 'fail' : m.game === 'annualReport' ? 'skip' : 'done', m.data, m)
    else if (m.kind === 'aiTask') applyFallback(g, m.task)
    const added = g.queue.splice(before)
    g.queue.unshift(...added)
  }
}

function collect(g: GameState, nodes: MenuNode[], depth = 0, out: MenuNode[] = []): MenuNode[] {
  if (depth > 5) return out
  for (const n of nodes) {
    if (n.visible && !n.visible(g)) continue
    out.push(n)
    if (n.type === 'menu' && !(n.disabledReason && n.disabledReason(g))) collect(g, n.children(g), depth + 1, out)
  }
  return out
}

function ids(g: GameState, nodes: MenuNode[]): string[] {
  return collect(g, nodes).map((n) => n.id)
}

function labels(g: GameState, nodes: MenuNode[]): string[] {
  return collect(g, nodes).map((n) => ('label' in n ? n.label : ''))
}

/** A kid in a given year with two middle-class parents at home and a working computer. */
function kidWithComputer(year: number, age = 14, countryId = 'us'): GameState {
  const g = makeTestGame(7, { age, countryId })
  g.year = year
  for (const gender of ['male', 'female'] as const) createPerson(g, { relation: 'parent', age: 42, gender, relationship: 85, livesWithPlayer: true, money: 60_000 })
  g.assets.push({ id: 'pc', kind: 'other', name: computerModel(g).name, emoji: '\u{1F5A5}\u{FE0F}', purchasePrice: 1000, value: 500, condition: 100, purchasedAge: age, upkeep: 0, details: {} })
  return g
}

function adultIn(year: number, age = 30, countryId = 'us'): GameState {
  const g = makeTestGame(11, { age, countryId, money: 200_000 })
  g.year = year
  return g
}

/** Lives a childhood without touching any menu: just the years going by. */
function passiveChildhood(year: number, seed: number): { by13: boolean; computer: boolean; coded: boolean } {
  const d = driver(seed * 104729)
  const g = createNewLife({ seed, year, countryId: 'us' })
  drain(g, d)
  let computer = false
  let by13 = false
  while (g.character.alive && g.character.age < 18) {
    ageUp(g)
    drain(g, d)
    if (ownsComputer(g) || typeof g.flags.devFamilyComputer === 'number') {
      computer = true
      if (g.character.age <= 13) by13 = true
    }
  }
  return { by13, computer, coded: codingSkill(g) > 0 }
}

// ---------------------------------------------------------------------------

describe('the home computer by era', { concurrent: false, shuffle: false }, () => {
  const n = 200
  const years = [1980, 2000] as const
  const samples = years.flatMap(year => Array.from({ length: n }, (_, i) => ({ year, seed: i + 1 })))
  const results = new Map<number, Map<number, ReturnType<typeof passiveChildhood>>>(years.map(year => [year, new Map()]))

  // Keep every original seed and its separate popup driver. Each childhood has
  // the normal per-test timeout, so a stalled life is isolated from total sweep time.
  it.each(samples)('born $year, seed $seed completes the sampled childhood', ({ year, seed }) => {
    results.get(year)!.set(seed, passiveChildhood(year, seed))
  })

  afterAll(() => {
    const rates = (year: number) => {
      const rows = results.get(year)!
      expect([...rows.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1))
      const count = (key: keyof ReturnType<typeof passiveChildhood>) => [...rows.values()].filter(row => row[key]).length / n
      return { by13: count('by13'), computer: count('computer'), coded: count('coded') }
    }
    const old = rates(1980)
    const young = rates(2000)
    console.log(`born 1980: by 13 ${old.by13.toFixed(2)}, by 18 ${old.computer.toFixed(2)}, coded ${old.coded.toFixed(2)} · born 2000: by 13 ${young.by13.toFixed(2)}, by 18 ${young.computer.toFixed(2)}, coded ${young.coded.toFixed(2)}`)
    // A 1980s childhood: a home computer was a rare, pricey novelty (most families got one in the late 90s).
    expect(old.by13).toBeLessThan(0.35)
    expect(old.computer).toBeLessThan(0.5)
    // The larger sample includes country/era-dependent family resources. Keep the
    // historical contrast without treating a one-person RNG shift as a regression.
    expect(old.coded).toBeLessThan(0.45)
    // A 2000s childhood: the family computer was normal.
    expect(young.by13).toBeGreaterThan(0.6)
    expect(young.computer).toBeGreaterThan(0.75)
    expect(young.coded).toBeGreaterThan(0.6)
    expect(young.computer).toBeGreaterThan(old.computer + 0.3)
    expect(young.coded).toBeGreaterThan(old.coded + 0.3)
  })
})

describe('computers, coding and the computer menu by era', () => {
  it('names and prices computers for their era', () => {
    const g = adultIn(1984)
    expect(computerEra(g)).toBe('micro')
    expect(computerModel(g).name).toBe('Home Computer')
    g.year = 1995
    expect(computerEra(g)).toBe('pc')
    expect(computerModel(g).name).toBe('Desktop PC')
    g.year = PRESENT_YEAR
    expect(computerEra(g)).toBe('modern')
    expect(computerModel(g)).toMatchObject({ name: 'Laptop', usd: 1_300 })
    // Computers cost a fortune (in today's money) in the 80s and 90s.
    g.year = 1990
    expect(computerModel(g).usd).toBeGreaterThan(3_000)
    g.year = 1960
    expect(computerEra(g)).toBe('none')
    expect(noComputerText(g)).toMatch(/fill whole rooms/)
  })

  it('has no home computers before they exist: parents laugh, the store has none', () => {
    const g = kidWithComputer(1962, 12)
    g.assets = []
    const nodes = getAComputerNodes(g)
    expect(nodes.map((n) => n.id)).toEqual(['computer.dev.noneYet'])
    askParentsForComputer(g)
    expect(ownsComputer(g)).toBe(false)
    const names = electronicsListings(g).map((l) => l.name)
    expect(names.some((n) => /laptop|computer|pc\b|smartphone|tablet/i.test(n))).toBe(false)
    expect(names.some((n) => /Black-and-White TV/.test(n))).toBe(true)
  })

  it('teaches the languages of the time: BASIC in 1984, the web in 1999, apps after smartphones', () => {
    const g = kidWithComputer(1984)
    const now = (year: number) => {
      g.year = year
      return languagesInEra(g).map((l) => l.id)
    }
    expect(now(1984)).toContain('basic')
    expect(now(1984)).not.toContain('python')
    expect(now(1984)).not.toContain('html')
    expect(now(1984)).not.toContain('swift')
    expect(now(1984)).not.toContain('scratch')
    expect(now(1999)).toContain('html')
    expect(now(1999)).toContain('javascript')
    expect(now(1999)).not.toContain('swift')
    expect(now(2012)).not.toContain('swift')
    expect(now(2016)).toContain('swift')
    expect(now(2016)).not.toContain('basic')
    g.year = 1984
    expect(kidLanguage(g)).toBe('basic')
    g.year = 1999
    expect(kidLanguage(g)).toBe('html')
    g.year = 2015
    expect(kidLanguage(g)).toBe('scratch')
    // The tutorial menu says how people learned back then.
    g.year = 1986
    const learnLabels = labels(g, computerMenu.children(g))
    expect(learnLabels).toContain('Library Books & Magazines')
    expect(learnLabels).toContain('Night Class')
    expect(learnLabels).not.toContain('Free Online Tutorials')
    expect(learnLabels).not.toContain('Swift')
  })

  it('studying works in the past and refuses languages that do not exist yet', () => {
    const g = kidWithComputer(1985)
    learnInternals.studyTutorial(g, 'basic')
    expect(codingSkill(g)).toBeGreaterThan(0)
    const notice = g.queue.find((m) => m.kind === 'notice')
    expect(notice && notice.kind === 'notice' ? notice.text : '').not.toMatch(/online/i)
    g.queue = []
    const before = codingSkill(g)
    learnInternals.studyTutorial(g, 'swift')
    expect(codingSkill(g)).toBe(before)
    const refusal = g.queue.find((m) => m.kind === 'notice')
    expect(refusal && refusal.kind === 'notice' ? refusal.text : '').toMatch(/not invented yet/)
  })

  it('opens projects, ventures, freelancing and contests only once their tech exists', () => {
    const g = kidWithComputer(1985, 16)
    g.flags.codingSkill = 80
    const at = (year: number) => {
      g.year = year
      return ids(g, computerMenu.children(g))
    }
    const y85 = at(1985)
    expect(y85).toContain('computer.dev.project.listing')
    expect(y85).not.toContain('computer.dev.project.website')
    expect(y85).not.toContain('computer.dev.project.app')
    expect(y85).not.toContain('computer.dev.freelance')
    expect(y85).not.toContain('computer.dev.startVenture')
    expect(y85).not.toContain('computer.crypto')
    expect(y85).not.toContain('computer.options')
    expect(y85).not.toContain('computer.scams')
    expect(y85).not.toContain('computer.dev.comp.hackathon')
    expect(y85).toContain('computer.dev.comp.clubfair')
    const y99 = at(1999)
    expect(y99).toContain('computer.dev.project.website')
    expect(y99).not.toContain('computer.dev.project.app')
    expect(y99).not.toContain('computer.dev.project.listing')
    expect(y99).toContain('computer.scams')
    expect(y99).toContain('computer.options')
    expect(y99).not.toContain('computer.crypto')
    const y2010 = at(2010)
    expect(y2010).toContain('computer.dev.project.app')
    expect(y2010).toContain('computer.dev.freelance')
    expect(y2010).not.toContain('computer.crypto')
    expect(at(2016)).toContain('computer.crypto')
    // Data: venture gates.
    g.year = 1990
    expect(eraOpen(g, VENTURE_DEFS.saas.era)).toBe(false)
    expect(eraOpen(g, VENTURE_DEFS.app.era)).toBe(false)
    g.year = 2005
    expect(eraOpen(g, VENTURE_DEFS.saas.era)).toBe(true)
    expect(eraOpen(g, VENTURE_DEFS.app.era)).toBe(false)
  })

  it('keeps risky money schemes out of the past', () => {
    const g = kidWithComputer(1992, 20)
    expect(moneyNodes(g)).toEqual([])
    g.year = 2000
    expect(moneyNodes(g).map((n) => n.id)).not.toContain('computer.crypto')
    g.year = 2020
    expect(moneyNodes(g).map((n) => n.id)).toContain('computer.crypto')
  })
})

describe('social media, fame, love, games, shops and jobs by era', () => {
  it('has no social platforms before social media, and adds them as they launch', () => {
    const g = adultIn(1995, 20)
    expect(socialMediaExists(g)).toBe(false)
    expect(socialMediaMenu.visible?.(g)).toBe(false)
    g.year = 2005
    expect(socialMediaExists(g)).toBe(true)
    const joins = (year: number) => {
      g.year = year
      return socialMediaMenu.children(g).filter((n) => n.type === 'action' && n.id.endsWith('.join') && (!n.visible || n.visible(g))).map((n) => n.id)
    }
    expect(joins(2005)).toEqual(['social.friendbook.join', 'social.viewtube.join'])
    expect(joins(2012)).not.toContain('social.clipz.join')
    expect(joins(2020)).toContain('social.clipz.join')
    expect(eraReason(g, SOCIAL_GATE, 'social media', 1990)).toMatch(/not invented yet/)
  })

  it('finds love through personal ads, then websites, then apps', () => {
    const g = adultIn(1975, 25)
    const app = () => collect(g, loveMenu.children(g)).find((n) => n.id === 'datingApp') as MenuAction
    expect(app().label).toMatch(/Personal Ad/)
    g.year = 2002
    expect(app().label).toMatch(/Dating Website/)
    g.year = 2018
    expect(app().label).toMatch(/Tinder/)
    // The flow works in 1975 too.
    g.year = 1975
    app().run(g)
    expect(g.queue.length).toBeGreaterThan(0)
    const words = g.queue.map((m) => (m.kind === 'choice' ? `${m.title} ${m.text} ${m.choices.map((c) => c.label).join(' ')}` : m.kind === 'notice' ? `${m.title} ${m.text}` : '')).join(' ')
    expect(words).not.toMatch(/swipe|\bapp\b|Tinder/i)
  })

  it('makes games for the platforms of the day', () => {
    expect(platformsIn(1995).map((p) => p.id)).not.toContain('mobile')
    expect(platformsIn(1995).map((p) => p.id)).not.toContain('vr')
    expect(platformsIn(1975).length).toBe(0)
    expect(platformsIn(PRESENT_YEAR).length).toBe(PLATFORMS.length)
    expect(genresIn(1995).map((x) => x.id)).not.toContain('battleRoyale')
    expect(enginesIn(1990).map((x) => x.id)).toEqual(['homebrew'])
    const g = adultIn(1965, 25)
    expect(ids(g, gameIndustryMenu.children(g))).toEqual(['gamedev.noIndustry'])
    g.year = 1990
    expect(esportsMenu.visible?.(g)).toBe(false)
    g.year = 2010
    expect(esportsMenu.visible?.(g)).toBe(true)
  })

  it('stocks the shops and car lots of the era', () => {
    const g = adultIn(1985, 30)
    const gadgets = electronicsListings(g).map((l) => l.name)
    expect(gadgets).not.toContain('Smartphone')
    expect(gadgets).not.toContain('Tablet')
    expect(gadgets.some((n) => /VCR/.test(n))).toBe(true)
    expect(gadgets.some((n) => /Home Computer/.test(n))).toBe(true)
    g.year = 2026
    expect(electronicsListings(g).map((l) => l.name).some((n) => /iPhone|Pixel|Galaxy|Xiaomi|Huawei|OPPO|vivo|Nokia|Motorola|OnePlus|Xperia|HTC|BlackBerry|Smartphone/.test(n))).toBe(true)
    g.year = 1985
    const cars = ['used', 'main', 'prestige', 'exotic'].flatMap((d) => carListings(g, d))
    for (const c of cars) {
      expect(c.modelYear, `${c.make} ${c.model}`).toBeLessThanOrEqual(1985)
      expect(c.make).not.toBe('Tesla')
      expect(c.make).not.toBe('Rivian')
    }
    g.year = 1915
    const old = ['used', 'main', 'prestige', 'exotic'].flatMap((d) => carListings(g, d))
    expect(old.length).toBeGreaterThan(0)
    for (const c of old) expect(['Ford', 'Detroit Electric', 'Packard', 'Rolls-Royce']).toContain(c.make)
    // Everyday stores: no e-scooters or smart-home kits in 1990.
    g.year = 1990
    for (const store of ['bike', 'furniture', 'sports', 'toy', 'garden', 'clothing'] as const) {
      const names = everydayListings(g, store).map((l) => l.name)
      expect(names).not.toContain('Electric Scooter')
      expect(names).not.toContain('Smart-Home Kit')
      expect(names).not.toContain('Mini Toy Drone')
    }
  })

  it('hires for the jobs of the era', () => {
    const def = (id: string) => getJobDef(id)!
    expect(jobInEra(def('app_developer'), 2000, 'us')).toBe(false)
    expect(jobInEra(def('app_developer'), 2015, 'us')).toBe(true)
    expect(jobInEra(def('pt_social_media'), 2002, 'us')).toBe(false)
    expect(jobInEra(def('social_media_manager'), 2002, 'us')).toBe(false)
    expect(jobInEra(def('data_scientist'), 2005, 'us')).toBe(false)
    expect(jobInEra(def('data_scientist'), 2016, 'us')).toBe(true)
    expect(jobInEra(def('switchboard_operator'), 1960, 'us')).toBe(true)
    expect(jobInEra(def('switchboard_operator'), 2000, 'us')).toBe(false)
    expect(jobInEra(def('typist'), 1970, 'us')).toBe(true)
    expect(jobInEra(def('lamplighter'), 1910, 'us')).toBe(true)
    expect(jobInEra(def('lamplighter'), 1950, 'us')).toBe(false)
    expect(jobInEra(def('rideshare'), 2000, 'us')).toBe(false)
    const g = adultIn(1965, 25)
    for (let i = 0; i < 6; i++) {
      g.flags.jobListingSeed = 1000 + i * 77
      const listed = [...fullTimeListings(g), ...partTimeListings(g)].map((l) => l.def.id)
      for (const id of ['app_developer', 'pt_social_media', 'social_media_manager', 'data_scientist', 'ml_engineer', 'web_developer', 'rideshare', 'it_support', 'pt_barista']) expect(listed).not.toContain(id)
      for (const m of [...recruiterMatches(g).top, ...recruiterMatches(g).reach]) expect(jobInEra(m.def, g.year, 'us')).toBe(true)
    }
    expect(jobRequirementProblem(g, def('app_developer'))).toMatch(/doesn't exist yet/)
    g.year = 2000
    expect(jobRequirementProblem(g, def('switchboard_operator'))).toMatch(/anymore/)
    // Universities don't offer computer science in 1955.
    expect(majorsInEra(1955)).not.toContain('Computer Science')
    expect(majorsInEra(1990)).toContain('Computer Science')
  })

  it('makes an obsolete job disappear when its era ends', () => {
    const g = adultIn(1985, 40)
    g.character.job = { defId: 'switchboard_operator', category: 'fulltime', title: 'Switchboard Operator', company: 'Bell & Co.', salary: 24_000, level: 0, performance: 70, yearsInRole: 5, years: 5, data: {} } as unknown as GameState['character']['job']
    const d = driver(3)
    ageUp(g)
    drain(g, d)
    expect(g.character.job?.defId === 'switchboard_operator').toBe(false)
  })
})

describe('whole lives in the past', () => {
  function playLife(year: number, seed: number): GameState {
    const d = driver(seed * 7919)
    const g = createNewLife({ seed, year, countryId: d.pick(['us', 'gb', 'jp', 'in', 'br', 'ng', 'de']) })
    drain(g, d)
    while (g.character.alive) {
      if (g.character.age > 125) throw new Error('character never dies')
      const n = d.int(0, 4)
      for (let i = 0; i < n && g.character.alive; i++) {
        const menu = d.pick([activitiesMenu, activitiesMenu, occupationMenu, assetsMenu])
        const options = collect(g, menu.children(g)).filter((x): x is MenuAction => x.type === 'action' && !(x.disabledReason && x.disabledReason(g)) && x.id !== 'surrenderLife')
        if (!options.length) continue
        const action = d.pick(options)
        const input = action.input ? (action.input.kind === 'number' ? String(d.int(action.input.min ?? 1, Math.min(action.input.max ?? 5000, (action.input.min ?? 1) + 5000))) : (action.input.defaultValue?.(g) ?? 'Alex')) : undefined
        action.run(g, input)
        drain(g, d)
        expect(Number.isFinite(g.character.money)).toBe(true)
      }
      if (!g.character.alive) break
      ageUp(g)
      drain(g, d)
      expect(Number.isFinite(netWorth(g))).toBe(true)
      // Nothing from the future in the inventory.
      for (const a of g.assets) {
        if (/^Smartphone$|Tablet|Smart Speaker|VR Headset/.test(a.name)) expect(g.year, `${a.name} owned in ${g.year}`).toBeGreaterThanOrEqual(2007)
      }
      if (g.character.social) expect(g.year, `social account in ${g.year}`).toBeGreaterThanOrEqual(2004)
    }
    expect(g.obituary).toBeTruthy()
    expect(JSON.stringify(JSON.parse(JSON.stringify(g)))).toBe(JSON.stringify(g))
    return g
  }

  it('plays lives born in 1950 from birth to death without errors', () => {
    for (let seed = 1; seed <= 6; seed++) playLife(1950, seed)
  }, 120_000)

  it('plays lives born in 1910 and 1980 without errors', () => {
    for (let seed = 11; seed <= 13; seed++) playLife(1910, seed)
    for (let seed = 21; seed <= 23; seed++) playLife(1980, seed)
  }, 120_000)
})

describe('lives born in PRESENT_YEAR keep everything', () => {
  it('has every original feature available today', () => {
    const g = kidWithComputer(PRESENT_YEAR, 16)
    const original = ['scratch', 'html', 'python', 'javascript', 'lua', 'sql', 'swift', 'cpp', 'rust']
    for (const id of original) expect(languageInEra(g, id), id).toBe(true)
    for (const k of PROJECT_KINDS.filter((x) => ['scratch', 'website', 'mod', 'bot', 'extension', 'app', 'game'].includes(x.id))) expect(eraOpen(g, k.era), k.id).toBe(true)
    for (const v of Object.values(VENTURE_DEFS)) expect(eraOpen(g, v.era), v.type).toBe(true)
    for (const gig of CODE_GIGS.filter((x) => x.id !== 'desktop')) expect(eraOpen(g, gig.era), gig.id).toBe(true)
    for (const p of SOCIAL_PLATFORMS) expect(eraOpen(g, p.era), p.id).toBe(true)
    for (const def of [...FULLTIME_JOBS, ...PARTTIME_JOBS]) expect(jobInEra(def, PRESENT_YEAR, 'us'), def.id).toBe(true)
    expect(platformsIn(PRESENT_YEAR).length).toBe(PLATFORMS.length)
    expect(genresIn(PRESENT_YEAR).length).toBe(GENRES.length)
    expect(enginesIn(PRESENT_YEAR).length).toBe(ENGINES.length)
    expect(learnInternals.competitionsNow(g).map((c) => c.id)).toEqual(['contest', 'gamejam', 'olympiad', 'hackathon'])
    expect(learnInternals.tracksNow(g).map((t) => t.id)).toEqual(['web', 'mobile', 'data', 'games'])
    const adult = adultIn(PRESENT_YEAR, 25)
    // Today's gadgets keep their order; each is named after a real maker and model when one trades here.
    const today = electronicsListings(adult).map((l) => l.name)
    const kinds = [/iPhone|Pixel|Galaxy|Xiaomi|Huawei|OPPO|vivo|Nokia|Motorola|OnePlus|Xperia|Smartphone/, /Laptop|MacBook|ThinkPad|Chromebook|Surface/, /Console|PlayStation|Xbox|Switch|Nintendo|Steam/, /Gaming PC/, /iPad|Tab|Fire|Tablet|MatePad/, /TV/, /Quest|VR/, /Drone/, /Watch|Fitbit|Garmin|Smartwatch/, /Headphones/, /Camera/, /Kindle|Kobo|E-Reader/, /Echo|Home|HomePod|Sonos|Speaker/, /Vacuum/]
    expect(today).toHaveLength(kinds.length)
    kinds.forEach((re, i) => expect(today[i], `gadget ${i}`).toMatch(re))
    expect((collect(adult, loveMenu.children(adult)).find((n) => n.id === 'datingApp') as MenuAction).label).toBe('Tinder (Dating App)')
    expect(moneyNodes(kidWithComputer(PRESENT_YEAR, 20)).map((n) => n.id)).toEqual(['computer.money.heading', 'computer.crypto', 'computer.options', 'computer.scams'])
    expect(socialMediaMenu.visible?.(adult)).toBe(true)
    expect(esportsMenu.visible?.(adult)).toBe(true)
    // Present-day ages and places are open in every country, poor ones included.
    for (const cid of ['ng', 'in', 'bd', 'ht', 'us', 'jp']) {
      const k = makeTestGame(1, { countryId: cid, age: 20 })
      expect(languageInEra(k, 'swift'), cid).toBe(true)
      expect(socialMediaExists(k), cid).toBe(true)
      for (const def of [...FULLTIME_JOBS, ...PARTTIME_JOBS]) expect(jobInEra(def, PRESENT_YEAR, cid), `${def.id} in ${cid}`).toBe(true)
    }
    expect(ALL_JOBS.length).toBeGreaterThan(FULLTIME_JOBS.length + PARTTIME_JOBS.length)
    expect(ERA_FULLTIME_JOBS.every((x) => !FULLTIME_JOBS.includes(x))).toBe(true)
    expect(CODING_LANGUAGES.slice(0, 9).map((l) => l.id)).toEqual(original)
  })
})
