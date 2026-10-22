// Which flags are the world's, which are one person's, and which are a cache (R1-P6, A.K0).
//
// GameState.flags is a bag of loose keys. When a life passes to an heir (continueAsChild in life.ts) the bag is
// rebuilt from a short whitelist; this table says, for every key the code uses, which side of that line it is on.
// test/world-flags.test.ts scans src/ for every key and fails on one that has no rule here, so a new
// `g.flags.thing` must be added to WORLD, PERSONAL or CACHE in the same commit.
//
//   world     survives the handoff: laws, markets, the economy, the family's firsts. The test hands a sample of each
//             to an heir through the real continueAsChild and checks it arrived unchanged. A key that a helper
//             validates on the way through has no sample and names the helper (`covered`); the heir table in
//             test/heir-world-flags.test.ts must mention that name.
//   personal  the parent's own life; the heir starts clean. When in doubt, a key is personal.
//   cache     derived or regenerable. Dropping it changes no later outcome except repeated text or a repeated popup.
//             The heir starts clean here too.
//
// The pure data lives in this file and imports only a type, so any module may read it without joining an import cycle.
import type { Json } from './types'

export type FlagClass = 'world' | 'personal' | 'cache'

export interface FlagRule {
  /** An exact key, or a prefix when `prefix` is true. */
  readonly match: string
  readonly prefix?: true
  readonly cls: FlagClass
  /** World only: a value that survives the handoff verbatim. */
  readonly sample?: Json
  /** World only: a companion key the handoff carries only when this other key is truthy (the test sets both). */
  readonly needs?: string
  /** World only: assert presence and typeof, not equality (the handoff itself writes the key). */
  readonly loose?: true
  /** World only, when there is no sample: a string that must appear in test/heir-world-flags.test.ts (the helper name). */
  readonly covered?: string
}

type WorldRow = Omit<FlagRule, 'cls' | 'prefix'>

// World. The first block is the plain whitelist in life.ts (the `n.flags = {` literal), the second goes through helpers.
const WORLD: readonly WorldRow[] = [
  { match: 'givingFund', sample: { balance: 1_000_000, committed: 0 } },
  // life.ts writes it for the heir (an adult heir's own job), so the test checks a string, not the parent's value.
  { match: 'heirOccupation', sample: 'Nurse', loose: true },
  { match: 'marketShocks', sample: [] },
  { match: 'marketBreakthroughs', sample: [] },
  { match: 'business.confidence', sample: 0.9 },
  // The year travels only with the confidence it belongs to.
  { match: 'business.confidenceYear', sample: 2029, needs: 'business.confidence' },
  { match: 'worldEconomy', sample: { v: 2, countries: { us: { year: 2030, priceScale: 1.5 } }, previous: {}, history: {} } },
  { match: 'groupServices', sample: [{ provider: 'a', customer: 'b', group: 'g' }] },
  // The three group-service companions are carried only inside the groupServices conditional.
  { match: 'groupServicesPrepared', sample: 2029, needs: 'groupServices' },
  { match: 'groupServicesSettled', sample: 2029, needs: 'groupServices' },
  { match: 'groupServiceResults', sample: [{ group: 'g', year: 2029, invoice: 100 }], needs: 'groupServices' },
  { match: 'timelineForks', sample: [] },
  { match: 'workshop.firsts', sample: [] },
  // Through helpers that validate on the way through (a damaged flag does not survive).
  { match: 'nation.policy', covered: 'nationWorldFlags' },
  { match: 'market.news', covered: 'heavyWorldFlags' },
  { match: 'techWaves', covered: 'waveWorldFlags' },
  { match: 'techBase', covered: 'waveWorldFlags' },
  { match: 'aiFirsts', covered: 'benchWorldFlags' },
]

// Cache. The first six are repeat guards for lines and popups (milestonesLogged keeps the toddler firsts from being
// logged twice). housingMarket is rewritten every year and read by nobody; market.events remembers which boom or bust
// was already announced; aiRecentEvents and obituarySource are old keys that the save repair deletes on every load.
const CACHE: readonly string[] = [
  'flavorRecent', 'eventMemory', 'offlineEventHistory', 'offlineEventGeneration', 'core.resolvedScriptModals',
  'milestonesLogged', 'housingMarket', 'market.events', 'aiRecentEvents', 'obituarySource',
]

// Personal: everything else. lifeSeries and inbox are written by later R1 tasks and textMem by the text kit (see
// DECLARED_AHEAD). previousGeneration is only ever written, inside the handoff literal, so no scan sees it.
const PERSONAL: readonly string[] = [
  'adultNotice', 'backgroundYear', 'birthBackground', 'birthControl', 'birthSurname', 'biz.bought', 'biz.groupPick',
  'biz.milestonePopup', 'boughtListings', 'brokeYears', 'bumpedGraves', 'careerExperience', 'careerProfile',
  'closeted', 'codingLangs', 'codingSkill', 'collectorsAge', 'computer.broadband', 'computerLockedBy',
  'computerLockedUntil', 'computerMoney', 'cravingAge', 'creative.pieces', 'creditCleanYears', 'creditDefaults',
  'creditLastMiss', 'creditReviewedYear', 'crimeFamily', 'cryptoBuys', 'cvCaughtAge', 'deathRecorded', 'deported',
  'dev', 'devFamilyComputer', 'devFamilyPcSeen', 'devParentLaptopAge', 'devScreenPromise', 'devUsedLaptopYear',
  'diet', 'dietSurvivor', 'edu.moments', 'embezzled', 'era.pill', 'eventCooldowns', 'everydayBought', 'examScore',
  'eyesight', 'eyesightCorrected', 'eyewear', 'fin.team', 'finalOccupation', 'firedJobs', 'fosterCare', 'fugitive',
  'grandkidsSeen', 'greek', 'guardianId', 'hadGrandchild', 'healthInsurance', 'hero', 'heroicDeath',
  'history.covidVaccinated', 'history.done', 'history.polioVaccinated', 'history.raidYear', 'homelessLineAge',
  'homelessSince', 'household', 'identity.birthGender', 'identity.gender', 'identity.surgery', 'illegalImmigrant',
  'imm', 'inbox', 'inDenial', 'instruments', 'inventionImpact', 'investLossCarry', 'investmentsSettledYear',
  'jobListingSeed', 'jobsRejected', 'knownAddictions', 'lastAdmissionsQ', 'lastBirthAge', 'lastCodedAge',
  'lastGrades', 'lastInterviewQ', 'latentTalent', 'lawsuit.grievances', 'license.flightHours', 'lifeSeries',
  'livingLineAge', 'loanMisses', 'lowHealthWarned', 'lowHealthWarnedAge', 'lux.b', 'lux.fam.at', 'lux.heat',
  'lux.lots', 'lux.showN', 'luxury.bought', 'luxury.secretary', 'luxury.society', 'luxury.societyBanned',
  'luxury.societyRejected', 'luxury.staff', 'martialArts', 'mcs.mastered', 'memoryBest', 'midlifeCrisis',
  'missedPayments', 'missedThisYear', 'mobGrudge', 'nation.me', 'nepo.favors', 'out', 'overdosed', 'parentsStatus',
  'partTimeShifts', 'petBan', 'pregnancy', 'previousGeneration', 'prisonLife', 'professions', 'puberty',
  'readDictionary', 'recordedGrave', 'recordedRibbon', 'recoveredAddictions', 'rehabSuccess', 'relapseAge',
  'royalPrivateHoldings', 'royalty', 'screenTime', 'selectiveExamTaken', 'sexualityRealized', 'sharedProjects',
  'skill.voice', 'special.actor.bollywood', 'special.actor.booed', 'special.actor.comforted',
  'special.actor.critics', 'special.actor.dropped', 'special.actor.telenovela', 'special.actor.zombie',
  'special.athlete.canton', 'special.athlete.goldenOrb', 'special.athlete.lance', 'special.athlete.lastTitle',
  'special.athlete.scouted', 'special.author', 'special.authorStories', 'special.diedInAction', 'special.endorser',
  'special.inventor', 'special.list.actor.roles', 'special.mil.lastOrder', 'special.mil.lastPlace',
  'special.military.discharge', 'special.model.scoutDeclines', 'special.music.diamond', 'special.music.hoedown',
  'special.music.tour75', 'special.sports.fight.card', 'special.underworld', 'sterile', 'studioCopies',
  'surgery.counts', 'surgery.suedSurgeons', 'surrendered', 'talentAge', 'talentHintAge', 'talentHints',
  'talentHintsUsed', 'talentNoticeAge', 'talentsRevealed', 'taxableIncome', 'taxesPaid', 'textMem', 'timeMachine',
  'trainRobbed', 'triedSpicyDiet', 'valedictorian', 'visitedWinnipeg', 'walkHeartAttack', 'wealth.bound.door',
  'wealth.bound.strangers', 'wealth.cd', 'wealth.donated', 'wealth.pending', 'will.escrow', 'will.pot',
  'will.pressY', 'will.state', 'workshop',
]

// Keys built from a template or a helper. Each prefix here is a `flags[`prefix${x}`]` site in src/, bar heavy.,
// which heavyKey(industry, market) builds ('heavy.restaurant|us').
const PREFIXES: ReadonlyArray<readonly [prefix: string, cls: FlagClass, covered?: string]> = [
  ['skill.', 'personal'], ['biz.ipoHint.', 'personal'], ['own.', 'personal'], ['wealth.bound.', 'personal'],
  ['relEventAt.', 'personal'], ['relEventPerson.', 'personal'], ['special.', 'personal'], ['special.list.', 'personal'],
  ['special.own.', 'personal'], ['fame.scene.', 'personal'], ['heavy.', 'world', 'heavyWorldFlags'],
]

export const WORLD_FLAG_RULES: readonly FlagRule[] = [
  ...WORLD.map((r): FlagRule => ({ ...r, cls: 'world' })),
  ...CACHE.map((match): FlagRule => ({ match, cls: 'cache' })),
  ...PERSONAL.map((match): FlagRule => ({ match, cls: 'personal' })),
  ...PREFIXES.map(([match, cls, covered]): FlagRule => ({ match, prefix: true, cls, ...(covered === undefined ? {} : { covered }) })),
]

const EXACT = new Map<string, FlagClass>(WORLD_FLAG_RULES.filter((r) => !r.prefix).map((r) => [r.match, r.cls]))
// Longest prefix first, so the most specific rule is the first to match.
const BY_LENGTH = WORLD_FLAG_RULES.filter((r) => r.prefix).sort((a, b) => b.match.length - a.match.length)

/** The class of a flags key: an exact rule first, then the longest prefix rule. Null when nobody classified it. */
export function classifyFlag(key: string): FlagClass | null {
  const exact = EXACT.get(key)
  if (exact !== undefined) return exact
  for (const r of BY_LENGTH) if (key.startsWith(r.match)) return r.cls
  return null
}

/**
 * Personal keys that later R1 tasks write (G.3 lifeSeries, G.11 inbox, E.T1 textMem). They are classified now so those
 * tasks edit nothing here; the stale-rule check lets them be unused until they arrive.
 */
export const DECLARED_AHEAD: readonly string[] = ['lifeSeries', 'inbox', 'textMem']

// Ratchets. test/world-flags.test.ts counts, per file of src/, the sites that no scan can resolve to a key. A count
// above the figure here (or a nonzero count in a file not listed) fails. Lower a figure when a site is removed.
// To remove one: use a declared constant key, or build the key from a template that has a prefix rule above.

/** `flags[expr]` where expr is a variable or a call: a `key` parameter, `heavyKey(...)`, `CAP_PREFIX + id`. */
export const DYNAMIC_FLAG_SITES: Readonly<Record<string, number>> = {
  'src/game/activities/common.ts':     4,
  'src/game/business/deeptech-sim.ts': 2,
  'src/game/business/dynamics.ts':     2,
  'src/game/business/gamestudio.ts':   3,
  'src/game/business/heavy-rd.ts':     2,
  'src/game/business/util.ts':         4,
  'src/game/education.ts':             2,
  'src/game/finance.ts':               4,
  'src/game/health.ts':                5,
  'src/game/ribbons.ts':               1,
  'src/game/special/common.ts':        4,
}

/** Whole-object uses of `flags`: spreads, Object.keys, aliases such as `const f = g.flags`, the handoff literal and the type. */
export const WHOLE_FLAGS_SITES: Readonly<Record<string, number>> = {
  'src/game/business/heavy-rd.ts':          3,
  'src/game/business/supply-resilience.ts': 2,
  'src/game/business/tech-wave-factors.ts': 3,
  'src/game/business/util.ts':              1,
  // The save diet's focus walk (A.K9) reads every flag but the economy's own for the countries a life is tied to.
  'src/game/economy/focus.ts':              1,
  'src/game/history/market-events.ts':      1,
  'src/game/life.ts':                       2,
  'src/game/nation/state.ts':               1,
  'src/game/save-schema.ts':                4,
  'src/game/types.ts':                      1,
  'src/ui/components/ProfileSheet.tsx':     1,
}
