// ci: fast
// R4-L11 (D.9 c, X39): what a hand-over does with a flag that holds money or a promise.
//
// continueAsChild rebuilds `flags` from a short whitelist, so every PERSONAL flag (src/game/world-flags.ts) is dropped when the life passes
// to an heir. For most of them that is all there is to say: a habit, a counter, a record of the old life. A few hold money or a promise,
// and dropping those is a decision: the money must go somewhere the books can see, or the promise must be let go on purpose. This file is
// that decision, written down, one row per flag:
//
//   wealth.pending   money in a venture or a tip the player funded         lapses     the stake left the account when it was funded; no payout follows the heir
//   will.state       the shares the will names                             consumed   the estate is divided by it, then the heir starts with a will of their own
//   will.escrow      money probate holds back for the player's share       joins the estate and the will divides it (planEstate: takePending)
//   will.pot         a claim taken from relatives, not yet decided         refunded   it goes back to the relatives it was taken from, out of pool:family
//   nepo.favors      favors the player has already called in               forgiven   the heir has called in none
//   pendingAsks      requests the year had no room for                     lapses     the heir hears none of them
//   loanMisses       missed payments on the player's bank loans            cleared    the estate repays the loans (they come first) and the misses go with them
//   wealth.cd        how long ago each kind of request was made            reset      the heir can be asked at once
//
// Each row of ROWS carries its outcome by name, an arrange step that puts the flag on the old life, and a proof of the outcome on the new
// one. Every row runs on an unstamped life (v5.2.0) and on a stamped one (the social flag, X6): the carryover of R4 touches people, edges
// and the debts between people, not these flags, so both must end the same way.
//
// The second half closes the list. Every other personal key is named in NO_ROW, and a key that is in neither the table nor NO_ROW fails
// the test until someone decides which it is (a row, with an outcome, if it holds money or a promise). A key that is no longer personal,
// or is named twice, fails too. The same goes for the personal prefixes.
import { describe, expect, it } from 'vitest'
import { moveCash, playerPurse, poolPurse } from '../src/game/cash'
import { favorsSpent } from '../src/game/events/nepo-life'
import { readPending as readVentures, writePending as writeVentures } from '../src/game/events/wealth-core'
import { changeWill } from '../src/game/events/will-act'
import { readWill } from '../src/game/events/will-core'
import { readPending as readAsks, writePending as writeAsks } from '../src/game/hubs/year-book'
import type { Gender, GameState, Person } from '../src/game/types'
import { classifyFlag, WORLD_FLAG_RULES } from '../src/game/world-flags'
import '../src/game/world/edge-step'
import { stampSocial } from '../src/game/world/social'
import { handOver } from './heir-kit'
import { makeTestGame } from './helpers'
import { acctOf, expectConserved } from './ledger-kit'
import { cast } from './social-kit'

// ---------------------------------------------------------------------------------------------------------------------
// The family

interface Fam {
  g: GameState
  /** The three children: the heir, the second and the third. */
  a: Person
  b: Person
  c: Person
}

interface After {
  f: Fam
  n: GameState
}

/** A player of 70 with $1,000,000 and three grown children of $20,000 each; the eldest (a) carries on. Nothing here draws. */
function fam(stamped: boolean): Fam {
  const g = makeTestGame(18, { age: 70, money: 1_000_000, countryId: 'us', gender: 'male', residence: { status: 'renting', rent: 0 } })
  g.log = [{ age: 70, year: g.year, entries: [] }]
  if (stamped) stampSocial(g)
  const kin = (age: number, gender: Gender): Person => cast(g, 70, 'child', { age, gender, countryId: 'us', money: 20_000 })
  return { g, a: kin(44, 'female'), b: kin(41, 'male'), c: kin(38, 'female') }
}

/** The scene after `prepare`, handed over to the eldest child. */
function over(stamped: boolean, prepare?: (f: Fam) => void): After {
  const f = fam(stamped)
  prepare?.(f)
  return { f, n: handOver(f.g, f.a.id) }
}

const sameWorld = (x: GameState, y: GameState): void => {
  expect(JSON.stringify(x)).toBe(JSON.stringify(y))
}

// ---------------------------------------------------------------------------------------------------------------------
// The table

type Outcome = 'lapses' | 'consumed' | 'joins the estate' | 'refunded' | 'forgiven' | 'cleared' | 'reset'

interface Row {
  key: string
  holds: 'money' | 'promise'
  outcome: Outcome
  /** The old life gets the flag (and the money behind it, where there is some). */
  arrange: (f: Fam) => void
  /** The same family without it, where the flag moved money out of the player's hands: what the estate would hold if it had not. */
  control?: (f: Fam) => void
  /** The proof, on the new life. `c` is the control's hand-over (the plain family when the row names none). */
  prove: (m: After, c: After) => void
}

const A_VENTURE = { id: 'v1', kind: 'venture' as const, name: 'your son', what: 'a bakery', amt: 80_000, odds: 0.4, partial: 0.2 }

const ROWS: readonly Row[] = [
  {
    key: 'wealth.pending',
    holds: 'money',
    outcome: 'lapses',
    arrange: (f) => writeVentures(f.g, [{ ...A_VENTURE, pid: f.b.id, due: f.g.year + 2, by: f.g.character.id }]),
    prove: (m, c) => {
      expect(readVentures(m.f.g), 'the old life held a venture').toHaveLength(1)
      expect(m.n.flags['wealth.pending']).toBeUndefined()
      expect(readVentures(m.n)).toEqual([])
      // nothing carried and nothing paid: the hand-over is the plain family's, down to the byte
      sameWorld(m.n, c.n)
    },
  },
  {
    key: 'will.state',
    holds: 'promise',
    outcome: 'consumed',
    arrange: (f) => {
      changeWill(f.g, (gg, w) => {
        gg.character.willBeneficiaries = [f.a.id, f.b.id, f.c.id]
        w.shares = { [f.b.id]: 50, [f.c.id]: 50 }
      })
      f.g.queue = []
    },
    prove: (m, c) => {
      expect(readWill(m.f.g).changes, 'the old life wrote a will').toBeGreaterThan(0)
      // the shares divided the estate: the eldest holds a whole share and the others half a share each, so the eldest gets one half
      expect(m.n.character.money).toBe(20_000 + 500_000)
      expect(c.n.character.money).toBe(20_000 + Math.floor(1_000_000 / 3))
      // and the heir starts with a will of their own
      expect(m.n.flags['will.state']).toBeUndefined()
      expect(readWill(m.n).changes).toBe(0)
      expect(m.n.character.willBeneficiaries).toEqual([])
    },
  },
  {
    key: 'will.escrow',
    holds: 'money',
    outcome: 'joins the estate',
    arrange: (f) => {
      // what the reading of a will does: the share is moved into the family pool and the flag says when it comes back
      moveCash(f.g, playerPurse(f.g), poolPurse('family'), 400_000, 'estate')
      f.g.flags['will.escrow'] = { amount: 400_000, year: f.g.year + 2 }
    },
    prove: (m, c) => {
      expect(m.f.g.character.money, 'the old life had given it up').toBe(600_000)
      expect(m.n.flags['will.escrow']).toBeUndefined()
      // it came back into the estate before the will divided it: the heir has exactly what the family that never froze it has
      expect(m.n.character.money).toBe(c.n.character.money)
      expect(m.n.character.money).toBe(20_000 + Math.floor(1_000_000 / 3))
      expect(acctOf(m.n, 'pool:family')).toBe(acctOf(c.n, 'pool:family'))
      expectConserved(m.n)
    },
  },
  {
    key: 'will.pot',
    holds: 'money',
    outcome: 'refunded',
    arrange: (f) => {
      // a claim of $90,000 taken from the second child's share, held in the family pool until the court decides
      moveCash(f.g, playerPurse(f.g), poolPurse('family'), 90_000, 'estate')
      f.g.flags['will.pot'] = { claim: 90_000, odds: 0.5, year: 0, back: [{ id: f.b.id, pct: 1 }] }
    },
    control: (f) => {
      f.g.character.money -= 90_000
    },
    prove: (m, c) => {
      expect(m.n.flags['will.pot']).toBeUndefined()
      const take = (x: After, id: string): number => x.n.people.find((p) => p.id === id)!.money
      // the claim went back to the relative it was taken from, and to nobody else
      expect(take(m, m.f.b.id)).toBe(take(c, c.f.b.id) + 90_000)
      expect(take(m, m.f.c.id)).toBe(take(c, c.f.c.id))
      expect(m.n.character.money).toBe(c.n.character.money)
      // out of pool:family, which is where it was parked
      expect(acctOf(m.n, 'pool:family')).toBe(acctOf(c.n, 'pool:family'))
      expectConserved(m.n)
    },
  },
  {
    key: 'nepo.favors',
    holds: 'promise',
    outcome: 'forgiven',
    arrange: (f) => {
      f.g.flags['nepo.favors'] = { n: 3, y: f.g.year }
    },
    prove: (m, c) => {
      expect(favorsSpent(m.f.g), 'the old life had called in three').toBe(3)
      expect(m.n.flags['nepo.favors']).toBeUndefined()
      expect(favorsSpent(m.n)).toBe(0)
      sameWorld(m.n, c.n)
    },
  },
  {
    key: 'pendingAsks',
    holds: 'promise',
    outcome: 'lapses',
    arrange: (f) => {
      writeAsks(f.g, [
        { y: f.g.year - 1, m: { kind: 'choice', title: 'A Sister Asks', text: 'She needs a little help this year.', choices: [{ id: 'help', label: 'Help her' }], source: 'script', scriptId: 'wealth.ask' } },
      ])
    },
    prove: (m, c) => {
      expect(readAsks(m.f.g), 'the old life had one waiting').toHaveLength(1)
      expect(m.n.flags.pendingAsks).toBeUndefined()
      expect(readAsks(m.n)).toEqual([])
      sameWorld(m.n, c.n)
    },
  },
  {
    key: 'loanMisses',
    holds: 'promise',
    outcome: 'cleared',
    arrange: (f) => {
      f.g.character.loans.push({ id: 'l1', kind: 'personal', lender: 'Bank', balance: 50_000, rate: 0.06, yearsLeft: 5, yearlyPayment: 12_000, countryId: 'us' })
      f.g.character.money += 50_000
      f.g.flags.loanMisses = { l1: 2 }
    },
    prove: (m, c) => {
      expect(m.f.g.character.loans, 'the old life owed the bank').toHaveLength(1)
      expect(m.n.flags.loanMisses).toBeUndefined()
      // the estate repaid the loan before the will divided what was left: the heir has what the debt-free family's heir has
      expect(m.n.character.loans).toEqual([])
      expect(m.n.character.money).toBe(c.n.character.money)
      expectConserved(m.n)
    },
  },
  {
    key: 'wealth.cd',
    holds: 'promise',
    outcome: 'reset',
    arrange: (f) => {
      f.g.flags['wealth.cd'] = { 'ask.loan': f.g.year - 1, 'ask.house': f.g.year }
    },
    prove: (m, c) => {
      expect(m.f.g.flags['wealth.cd'], 'the old life had asked').toBeTruthy()
      expect(m.n.flags['wealth.cd']).toBeUndefined()
      sameWorld(m.n, c.n)
    },
  },
]

const OUTCOMES: readonly Outcome[] = ['lapses', 'consumed', 'joins the estate', 'refunded', 'forgiven', 'cleared', 'reset']

describe('the table', () => {
  it('has one row for each flag that holds money or a promise, each personal, with an outcome named', () => {
    expect(ROWS.map((r) => r.key)).toEqual(['wealth.pending', 'will.state', 'will.escrow', 'will.pot', 'nepo.favors', 'pendingAsks', 'loanMisses', 'wealth.cd'])
    expect(new Set(ROWS.map((r) => r.key)).size).toBe(ROWS.length)
    for (const r of ROWS) {
      expect(classifyFlag(r.key), `${r.key} must be a personal flag, dropped by the hand-over`).toBe('personal')
      expect(OUTCOMES, `${r.key} needs an outcome by name`).toContain(r.outcome)
      expect(['money', 'promise']).toContain(r.holds)
    }
  })

  it('has every outcome used and no outcome that no row has', () => {
    expect([...new Set(ROWS.map((r) => r.outcome))].sort()).toEqual([...OUTCOMES].sort())
  })
})

describe.each([
  ['an unstamped life', false],
  ['a stamped life', true],
] as const)('%s', (_name, stamped) => {
  it.each(ROWS.map((r) => [r.key, r] as const))('%s', (_key, row) => {
    const mine = over(stamped, row.arrange)
    const control = over(stamped, row.control)
    row.prove(mine, control)
  })

  it('hands the plain family over with the books balanced and every table flag absent', () => {
    const { n } = over(stamped)
    expectConserved(n)
    for (const r of ROWS) expect(n.flags[r.key], r.key).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Every other personal key

/**
 * The personal keys that have no row: the life's own habits, counters, records and tastes, and the player's own positions (an open bet, a
 * tax carry, a hired adviser), none of them a claim that another person or the estate holds. The hand-over drops them with the old life.
 * A key that holds money or a promise between people goes in ROWS instead, with the outcome the hand-over gives it.
 */
const NO_ROW: readonly string[] = [
  'adultNotice', 'backgroundYear', 'birthBackground', 'birthControl', 'birthSurname', 'biz.bought', 'biz.groupPick', 'biz.milestonePopup',
  'boughtListings', 'brokeYears', 'bumpedGraves', 'careerExperience', 'careerProfile', 'closeted', 'codingLangs', 'codingSkill',
  'collectorsAge', 'computer.broadband', 'computerLockedBy', 'computerLockedUntil', 'computerMoney', 'cravingAge', 'creative.pieces',
  'creditCleanYears', 'creditDefaults', 'creditLastMiss', 'creditReviewedYear', 'crimeFamily', 'cryptoBuys', 'cvCaughtAge',
  'deathRecorded', 'deported', 'dev', 'devFamilyComputer', 'devFamilyPcSeen', 'devParentLaptopAge', 'devScreenPromise',
  'devUsedLaptopYear', 'diet', 'dietSurvivor', 'edu.moments', 'effort.you', 'embezzled', 'era.pill', 'eventCooldowns', 'everydayBought',
  'examScore', 'eyesight', 'eyesightCorrected', 'eyewear', 'fin.team', 'finalOccupation', 'firedJobs', 'fosterCare', 'fugitive',
  'grandkidsSeen', 'greek', 'guardianId', 'hadGrandchild', 'healthInsurance', 'hero', 'heroicDeath', 'history.covidVaccinated',
  'history.done', 'history.polioVaccinated', 'history.raidYear', 'homelessLineAge', 'homelessSince', 'household', 'identity.birthGender',
  'identity.gender', 'identity.surgery', 'illegalImmigrant', 'imm', 'inDenial', 'inbox', 'inflationLoss', 'inflationTold', 'instruments',
  'inventionImpact', 'investLossCarry', 'investmentsSettledYear', 'jobListingSeed', 'jobsRejected', 'know', 'knownAddictions',
  'lastAdmissionsQ', 'lastBirthAge', 'lastCodedAge', 'lastGrades', 'lastInterviewQ', 'lastTaxLogged', 'latentTalent', 'lawsuit.grievances',
  'license.flightHours', 'lifeSeries', 'livingLineAge', 'lowHealthWarned', 'lowHealthWarnedAge', 'lux.b', 'lux.fam.at', 'lux.heat',
  'lux.lots', 'lux.showN', 'luxury.bought', 'luxury.secretary', 'luxury.society', 'luxury.societyBanned', 'luxury.societyRejected',
  'luxury.staff', 'martialArts', 'mcs.mastered', 'memoryBest', 'midlifeCrisis', 'missedPayments', 'missedThisYear', 'mobGrudge',
  'nation.me', 'out', 'overdosed', 'parentsStatus', 'partTimeShifts', 'persona.me', 'petBan', 'pregnancy', 'previousGeneration',
  'prisonLife', 'professions', 'puberty', 'readDictionary', 'recordedGrave', 'recordedRibbon', 'recoveredAddictions', 'rehabSuccess',
  'relapseAge', 'royalPrivateHoldings', 'royalty', 'screenTime', 'selectiveExamTaken', 'sexualityRealized', 'sharedProjects',
  'skill.voice', 'special.actor.bollywood', 'special.actor.booed', 'special.actor.comforted', 'special.actor.critics',
  'special.actor.dropped', 'special.actor.telenovela', 'special.actor.zombie', 'special.athlete.canton', 'special.athlete.goldenOrb',
  'special.athlete.lance', 'special.athlete.lastTitle', 'special.athlete.scouted', 'special.author', 'special.authorStories',
  'special.diedInAction', 'special.endorser', 'special.inventor', 'special.list.actor.roles', 'special.mil.lastOrder',
  'special.mil.lastPlace', 'special.mil.recentPlaces', 'special.military.discharge', 'special.model.scoutDeclines',
  'special.music.diamond', 'special.music.hoedown', 'special.music.tour75', 'special.sports.fight.card', 'special.underworld', 'sterile',
  'studioCopies', 'surgery.counts', 'surgery.suedSurgeons', 'surrendered', 'talentAge', 'talentHintAge', 'talentHints', 'talentHintsUsed',
  'talentNoticeAge', 'talentsRevealed', 'taxLineAge', 'taxableIncome', 'taxesPaid', 'textMem', 'timeMachine', 'trainRobbed',
  'triedSpicyDiet', 'valedictorian', 'visitedWinnipeg', 'walkHeartAttack', 'wealth.bound.door', 'wealth.bound.strangers', 'wealth.donated',
  'will.pressY', 'workshop', 'yearBook',
]

/** The personal prefixes (a key built from a template, such as `special.${x}`): all of them are the life's own record. */
const NO_ROW_PREFIXES: readonly string[] = [
  'biz.ipoHint.', 'fame.scene.', 'own.', 'relEventAt.', 'relEventPerson.', 'skill.', 'special.', 'special.list.', 'special.own.', 'wealth.bound.',
]

const personalKeys = (): string[] => WORLD_FLAG_RULES.filter((r) => r.cls === 'personal' && r.prefix !== true).map((r) => r.match)
const personalPrefixes = (): string[] => WORLD_FLAG_RULES.filter((r) => r.cls === 'personal' && r.prefix === true).map((r) => r.match)

/** Which keys are not classified (in neither list), which entries are stale (not personal any more) and which are named twice. */
function audit(actual: readonly string[], rows: readonly string[], rest: readonly string[]): { unclassified: string[]; stale: string[]; twice: string[] } {
  const live = new Set(actual)
  const named = [...rows, ...rest]
  return {
    unclassified: actual.filter((k) => !named.includes(k)).sort(),
    stale: named.filter((k) => !live.has(k)).sort(),
    twice: named.filter((k, i) => named.indexOf(k) !== i).sort(),
  }
}

describe('every personal flag is classified', () => {
  it('names each personal key in the table or in NO_ROW, once', () => {
    expect(audit(personalKeys(), ROWS.map((r) => r.key), NO_ROW)).toEqual({ unclassified: [], stale: [], twice: [] })
  })

  it('names each personal prefix', () => {
    expect(audit(personalPrefixes(), [], NO_ROW_PREFIXES)).toEqual({ unclassified: [], stale: [], twice: [] })
  })

  it('fails on a new key until it is classified, on a key that is gone and on a key named twice', () => {
    const keys = ROWS.map((r) => r.key)
    expect(audit([...personalKeys(), 'tipJar'], keys, NO_ROW).unclassified).toEqual(['tipJar'])
    expect(audit(personalKeys(), keys, [...NO_ROW, 'longGone']).stale).toEqual(['longGone'])
    expect(audit(personalKeys(), keys, [...NO_ROW, 'wealth.pending']).twice).toEqual(['wealth.pending'])
    expect(audit([...personalKeys(), 'tipJar'], [...keys, 'tipJar'], NO_ROW)).toEqual({ unclassified: [], stale: [], twice: [] })
  })

  it('leaves the world and cache keys alone: a key of those classes is no row of this table', () => {
    for (const r of WORLD_FLAG_RULES.filter((x) => x.cls !== 'personal' && x.prefix !== true)) {
      expect(NO_ROW, r.match).not.toContain(r.match)
      expect(ROWS.map((x) => x.key), r.match).not.toContain(r.match)
    }
  })
})
