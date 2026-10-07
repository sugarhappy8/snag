// Deep-tech events: a few per company per decade, each a choice with real consequences and a
// purple hint for players with the Business talent. Shared ones (talent wars, acquisition
// offers, patent trolls, spies, impatient investors, export controls) plus each industry's own
// (chip shortages, AI safety incidents, viral robot demos, trial side effects, rocket contracts,
// battery recalls, quantum hype, zero-days...).
import { addHidden, addStat, count, formatMoney, log, notice, remember, scriptChoice } from '../core'
import { arrestPlayer } from '../crime'
import { marketOf } from '../data/markets'
import { chance, pick, rand, randInt, weightedPick } from '../rng'
import { defineScript } from '../scripts'
import { talentHint } from '../talents'
import type { TechId } from '../history/timeline'
import type { Asset, ChoiceOption, GameState, Json } from '../types'
import { randomFirstName, randomLastName } from '../world'
import { stepDown, managerCandidate, managerName } from './career'
import { placeOf, possessive } from './competition'
import { bizHas } from './era'
import { conglomerate } from './flavor'
import { APPROVAL_ODDS, RESTRICTED, TRIALS, aiRegulator, bestModel, defenseBuyer, drugRegulator, spaceAgency } from './deeptech-data'
import { dtInd, earnTech, payTech, rdScale, revalue, runwayYears, techFunds, techOf, unitRevenue } from './deeptech-core'
import { stopPrograms, trialCost, trialStep } from './deeptech-rd'
import type { Drug, TechState } from './deeptech-state'
import { sellBusiness } from './exit'
import { industryDef } from './industries'
import { bizOf, findBusiness, runsIt, type BizState } from './state'
import { cap, clampN, money, num, rec, str } from './util'

interface Ctx {
  g: GameState
  a: Asset
  b: BizState
  t: TechState
  d: Record<string, Json>
}

interface DtEvent {
  id: string
  weight: (g: GameState, a: Asset, b: BizState, t: TechState) => number
  present: (x: Ctx) => void
  resolve: (x: Ctx, choice: string) => void
}

const EVENT = defineScript('deeptech.event', (g, choice, data) => {
  const d = rec(data)
  const a = findBusiness(g, str(d?.assetId))
  if (!a || !d) return
  const ev = EVENTS.find((e) => e.id === str(d.ev))
  if (!ev) return
  const b = bizOf(g, a)
  const t = techOf(b)
  ev.resolve({ g, a, b, t, d }, choice)
  revalue(g, a, b, t)
})

/** A cost that scales with the market and the size of the company (US baseline). */
function scaled(b: BizState, usBase: number): number {
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  return Math.round(usBase * rdScale(b.countryId) * (1 + Math.log10(1 + revenue / 10_000_000)))
}

function tell(g: GameState, title: string, text: string, emoji: string, tone: 'good' | 'bad' | 'neutral' = 'neutral'): void {
  notice(g, title, text, { emoji, tone, ai: { when: 'full', facts: text } })
}

/** Choices with a purple Business hint on the best one. */
function options(g: GameState, list: { id: string; label: string; emoji: string }[], best: string, why: string): ChoiceOption[] {
  const hint = talentHint(g, 'Business', why)
  return list.map((c) => (hint && c.id === best ? { ...c, hint } : { ...c }))
}

function ask(x: { g: GameState; a: Asset; b: BizState }, ev: string, title: string, text: string, choices: ChoiceOption[], emoji: string, extra: Record<string, Json> = {}): void {
  const managed = !runsIt(x.g, x.a)
  const intro = managed && x.b.manager ? `${managerName(x.b.manager)}, who runs ${x.a.name} for you, needs a decision. ` : ''
  scriptChoice(x.g, EVENT, title, intro + text, choices, { emoji, data: { assetId: x.a.id, ev, ...extra } })
}

/** "Japan's government", "the United States' government" (mid-sentence). */
function government(b: BizState): string {
  return `${possessive(placeOf(b.countryId))} government`
}

/** True when the technology exists in the company's country this year. */
function has(x: { g: GameState; b: BizState }, tech: TechId): boolean {
  return bizHas(x.g, x.b.countryId, tech)
}

/** What a deep-tech founder gets asked about on air. */
const TOPIC: Record<string, string> = {
  semiconductor: 'chips',
  aiLab: 'thinking machines',
  robotics: 'robots',
  biotech: 'medicine',
  spaceTech: 'rockets',
  electricVehicles: 'the car of the future',
  quantum: 'quantum physics',
  cybersecurity: 'cybersecurity',
}

/** The biggest show a founder can go on in this country and year: a podcast, a talk show, the radio. */
function showOf(x: { g: GameState; b: BizState }): { title: string; what: string; length: string } {
  if (has(x, 'internet') && x.g.year >= 2005) return { title: 'The Big Podcast', what: 'The world’s most popular tech podcast', length: 'three hours' }
  if (has(x, 'tv')) return { title: 'Prime Time', what: 'The country’s most-watched late-night talk show', length: 'a whole segment' }
  return { title: 'On the Air', what: 'The nation’s most popular radio program', length: 'a whole hour' }
}

function person(g: GameState, b: BizState): string {
  const gender = chance(g, 0.5) ? 'male' : 'female'
  return `${randomFirstName(g, b.countryId, gender)} ${randomLastName(g, b.countryId)}`
}

const QUAKE = new Set(['tw', 'jp', 'cl', 'tr', 'mx', 'id', 'nz', 'ph', 'pe', 'ec', 'ir'])

// ---------------------------------------------------------------------------
// The events

const EVENTS: DtEvent[] = [
  // ----- Shared -----
  {
    id: 'poach',
    weight: (_g, _a, _b, t) => (t.level >= 30 ? 1 : 0.3),
    present: (x) => {
      const role = industryDef(x.b.industry).roles[0]?.title ?? 'lead engineer'
      const name = person(x.g, x.b)
      const giant = conglomerate(rand(x.g), rand(x.g))
      const cost = scaled(x.b, 900_000)
      const best = techFunds(x.b, x.t) > cost * 6 ? 'match' : 'let'
      ask(x, 'poach', 'Talent War', `${giant} offered ${name}, your ${role.toLowerCase()} and the brain behind half your breakthroughs, a pay package with a lot of zeros. ${name} is "just letting you know".`, options(x.g, [
        { id: 'match', label: `Match it: retention bonus (${money(cost)})`, emoji: '\u{1F4B0}' },
        { id: 'let', label: 'Wish them well', emoji: '\u{1F44B}' },
        { id: 'raid', label: `Raid their team right back (${money(cost * 2)})`, emoji: '\u{1F3F4}\u{200D}\u{2620}\u{FE0F}' },
      ], best, best === 'match' ? 'Keep them: losing the brain behind your R&D costs more than the bonus.' : 'Let them go: you can’t afford a bidding war right now.'), '\u{1F9E0}', { name, cost })
    },
    resolve: (x, choice) => {
      const cost = num(x.d.cost)
      const name = str(x.d.name, 'Your star engineer')
      if (choice === 'match') {
        payTech(x.b, x.t, cost)
        x.b.morale = clampN(x.b.morale + 3, 0, 100)
        tell(x.g, 'Staying Put', `${name} took the retention bonus (${formatMoney(cost)}) and a slightly embarrassing hug. The lab exhales.`, '\u{1F91D}', 'good')
      } else if (choice === 'raid') {
        payTech(x.b, x.t, cost * 2)
        addHidden(x.g, 'karma', -2)
        x.t.level = clampN(x.t.level + 3, 0, 100)
        tell(x.g, 'Counter-Raid', `${name} left, but you hired three of the rival's best engineers with ${formatMoney(cost * 2)} of signing bonuses. Recruiters on both sides are buying boats.`, '\u{1F3F4}\u{200D}\u{2620}\u{FE0F}')
      } else {
        x.t.level = clampN(x.t.level - 4, 0, 100)
        x.b.morale = clampN(x.b.morale - 5, 0, 100)
        tell(x.g, 'Gone', `${name} left with a farewell cake and a lot of your know-how. Tech level fell to ${Math.round(x.t.level)}.`, '\u{1F44B}', 'bad')
      }
    },
  },
  {
    id: 'acquirer',
    weight: (g, a, b) => (!b.public && b.valuation >= 15_000_000 && runsIt(g, a) ? 0.6 : 0),
    present: (x) => {
      const buyer = conglomerate(rand(x.g), rand(x.g))
      const offer = Math.round((x.b.valuation * (1.25 + rand(x.g) * 0.45)) / 1000) * 1000
      const runway = runwayYears(x.g, x.a, x.b, x.t)
      // Every offer is 25-70% over the valuation; countering wins 15% more only 55% of the time.
      const best = 'accept'
      ask(x, 'acquirer', 'Acquisition Offer', `${buyer} wants to buy ${x.a.name} outright for ${formatMoney(offer)}, well above its ${money(x.b.valuation)} valuation. ${x.b.share < 1 ? `Your ${Math.round(x.b.share * 100)}% would be worth ${formatMoney(offer * x.b.share)}.` : ''} Their CEO keeps saying "synergies".`, options(x.g, [
        { id: 'accept', label: `Sell for ${money(offer)}`, emoji: '\u{1F91D}' },
        { id: 'counter', label: 'Counter at a higher price', emoji: '\u{1F4C8}' },
        { id: 'decline', label: 'Not for sale', emoji: '\u{1F6AB}' },
      ], best, runway < 1.5 || x.t.stuck >= 2 ? 'Take it: the money is running out and the milestones aren’t coming, and this is well over what the company is worth.' : 'Take it: this is well over what the company is worth today, and countering risks the whole deal.'), '\u{1F3E6}', { buyer, offer })
    },
    resolve: (x, choice) => {
      const offer = num(x.d.offer)
      const buyer = str(x.d.buyer, 'a tech giant')
      if (choice === 'accept') {
        sellBusiness(x.g, x.a, x.b, offer, buyer)
        return
      }
      if (choice === 'counter') {
        if (chance(x.g, 0.55)) {
          sellBusiness(x.g, x.a, x.b, Math.round(offer * 1.15), buyer)
          return
        }
        x.t.hype = clampN(x.t.hype + 3, 0, 100)
        tell(x.g, 'Talks Collapsed', `${buyer} walked away from the table. The press is calling ${x.a.name} "the one that got away", which investors seem to like.`, '\u{1F6AA}')
        return
      }
      x.t.hype = clampN(x.t.hype + 6, 0, 100)
      tell(x.g, 'Not for Sale', `You turned down ${formatMoney(offer)}. Tech blogs are writing about your "conviction". Your mother is writing about your sanity.`, '\u{1F6AB}')
    },
  },
  {
    id: 'troll',
    weight: (_g, _a, _b, t) => (t.ipBook > 0 ? 0.5 : 0),
    present: (x) => {
      const settle = scaled(x.b, 1_500_000)
      ask(x, 'troll', 'Patent Troll', `A company that makes nothing, owns a 1990s patent on "a method for computing things" and has an office in a strip mall is suing ${x.a.name}. They'll go away for ${formatMoney(settle)}.`, options(x.g, [
        { id: 'settle', label: `Settle (${money(settle)})`, emoji: '\u{1F4B8}' },
        { id: 'fight', label: 'Fight it in court', emoji: '\u{2696}\u{FE0F}' },
      ], 'fight', 'Fight: troll patents like this one usually fall apart in court, so on average it costs less than paying up.'), '\u{1F9CC}', { settle })
    },
    resolve: (x, choice) => {
      const settle = num(x.d.settle)
      if (choice === 'settle') {
        payTech(x.b, x.t, settle)
        tell(x.g, 'Settled', `You paid the troll ${formatMoney(settle)} to go back under its bridge. It will be back.`, '\u{1F4B8}')
        return
      }
      const fees = Math.round(settle * 0.35)
      payTech(x.b, x.t, fees)
      if (chance(x.g, 0.65)) {
        count(x.g, 'lawsuitsWon')
        tell(x.g, 'Patent Invalidated', `The judge tossed the patent as "obvious to anyone with a calculator". Legal fees: ${formatMoney(fees)}.`, '\u{2696}\u{FE0F}', 'good')
      } else {
        const award = Math.round(settle * 1.5)
        payTech(x.b, x.t, award)
        tell(x.g, 'Lost in Court', `A jury that didn't understand the patent (nobody does) awarded the troll ${formatMoney(award)}. Legal fees on top: ${formatMoney(fees)}.`, '\u{2696}\u{FE0F}', 'bad')
      }
    },
  },
  {
    id: 'spies',
    weight: (_g, _a, b, t) => (b.industry !== 'cybersecurity' && t.level >= 45 ? 0.4 : 0),
    present: (x) => {
      const fix = scaled(x.b, 800_000)
      const online = has(x, 'internet')
      ask(x, 'spies', 'Industrial Espionage', online ? `Your IT team found state-backed hackers inside ${x.a.name}'s network. They have been quietly copying your designs for months.` : `Your security chief caught a "visiting engineer" photographing blueprints in ${x.a.name}'s labs. His friends have been quietly copying your designs for months.`, options(x.g, [
        { id: 'fix', label: `Hire a top security firm (${money(fix)})`, emoji: '\u{1F6E1}\u{FE0F}' },
        { id: 'public', label: 'Go public and name the culprits', emoji: '\u{1F4E2}' },
        { id: 'ignore', label: online ? 'Change the passwords and hope' : 'Change the locks and hope', emoji: '\u{1F648}' },
      ], 'fix', 'Lock it down: what they take next costs more than the cleanup.'), '\u{1F575}\u{FE0F}', { fix })
    },
    resolve: (x, choice) => {
      if (choice === 'fix') {
        payTech(x.b, x.t, num(x.d.fix))
        x.t.level = clampN(x.t.level - 1, 0, 100)
        tell(x.g, 'Locked Down', has(x, 'internet') ? `The security firm kicked the intruders out and found three more back doors. Only a few designs leaked.` : `The security firm caught two more moles on the payroll. Only a few designs leaked.`, '\u{1F6E1}\u{FE0F}', 'good')
      } else if (choice === 'public') {
        x.t.level = clampN(x.t.level - 3, 0, 100)
        x.t.hype = clampN(x.t.hype + 6, 0, 100)
        x.b.brand = clampN(x.b.brand - 2, 0, 100)
        tell(x.g, 'Going Public', `Your press conference made the evening news. The government promised "consequences". Customers are a bit nervous; investors love the drama.`, '\u{1F4E2}')
      } else {
        x.t.level = clampN(x.t.level - 6, 0, 100)
        x.t.ipBook = Math.round(x.t.ipBook * 0.8)
        tell(x.g, 'Still Leaking', `${has(x, 'internet') ? '"Password123!"' : 'New locks'} did not stop them. A rival launched a suspiciously familiar product six months later. Tech level fell to ${Math.round(x.t.level)}.`, '\u{1F648}', 'bad')
      }
    },
  },
  {
    id: 'board',
    weight: (g, a, b, t) => (!b.public && t.series >= 2 && b.share < 0.65 && t.stuck >= 1 && runsIt(g, a) ? 1.2 : 0),
    present: (x) => {
      const runway = runwayYears(x.g, x.a, x.b, x.t)
      const best = runway < 1.5 ? 'cut' : 'promise'
      ask(x, 'board', 'Board Meeting From Hell', `Your investors read the numbers: ${x.t.stuck} year${x.t.stuck === 1 ? '' : 's'} without a milestone and ${runway >= 99 ? 'plenty of cash' : `${runway} years of money left`}. The lead investor wants "a credible path forward", by which they mean cuts.`, options(x.g, [
        { id: 'cut', label: 'Cut the burn (lean pace, layoffs)', emoji: '\u{2702}\u{FE0F}' },
        { id: 'promise', label: 'Promise a milestone within a year', emoji: '\u{1F91E}' },
        { id: 'step', label: 'Hand the CEO job to a veteran', emoji: '\u{1FA91}' },
      ], best, best === 'cut' ? 'Cut now: you will run out of money before the next milestone.' : 'Buy time: the runway can carry you to the next milestone.'), '\u{1F4C9}')
    },
    resolve: (x, choice) => {
      if (choice === 'cut') {
        x.t.pace = 'lean'
        x.t.pressure = clampN(x.t.pressure - 25, 0, 100)
        x.b.morale = clampN(x.b.morale - 8, 0, 100)
        tell(x.g, 'Belt Tightened', `You moved the lab to a lean pace and let a fifth of the team go. The board nodded. The free snacks are gone.`, '\u{2702}\u{FE0F}')
      } else if (choice === 'step') {
        const mgr = managerCandidate(x.g, x.b, randInt(x.g, 65, 90))
        stepDown(x.g, x.a, x.b, mgr)
        x.t.pressure = 10
        log(x.g, `I handed the CEO job at ${x.a.name} to ${mgr.firstName} ${mgr.lastName}.`)
        tell(x.g, 'New CEO', `${mgr.firstName} ${mgr.lastName}, a veteran who has "scaled three unicorns", now runs ${x.a.name}. You keep your shares and a nice title nobody understands.`, '\u{1FA91}')
      } else {
        x.t.pressure = clampN(x.t.pressure + 10, 0, 100)
        tell(x.g, 'Promises, Promises', `You promised a milestone within a year and showed a slide with a very steep arrow. The board gave you twelve months. They wrote it down.`, '\u{1F91E}')
      }
    },
  },
  {
    id: 'podcast',
    weight: (g, a, _b, t) => (runsIt(g, a) && t.stage >= 1 ? 0.6 : 0),
    present: (x) => {
      const show = showOf(x)
      ask(x, 'podcast', show.title, `${show.what} wants you on for ${show.length} to talk about ${TOPIC[dtInd(x.b)]}, the future and, inevitably, aliens.`, options(x.g, [
        { id: 'go', label: 'Go on the show', emoji: '\u{1F399}\u{FE0F}' },
        { id: 'no', label: 'Politely decline', emoji: '\u{1F64F}' },
      ], x.g.character.stats.smarts >= 60 ? 'go' : 'no', x.g.character.stats.smarts >= 60 ? 'Go: you’ll come across well, and the buzz helps your next round.' : 'Skip it: three hours live is a long time to avoid saying something silly.'), '\u{1F399}\u{FE0F}')
    },
    resolve: (x, choice) => {
      if (choice !== 'go') {
        tell(x.g, 'Maybe Next Time', `You declined. The host replaced you with a guy who sells supplements. ${has(x, 'internet') ? 'He went viral anyway.' : 'Ratings went up anyway.'}`, '\u{1F64F}')
        return
      }
      const gaffe = chance(x.g, clampN(0.45 - x.g.character.stats.smarts / 250, 0.05, 0.4))
      if (gaffe) {
        x.t.hype = clampN(x.t.hype - 8, 0, 100)
        x.b.brand = clampN(x.b.brand - 4, 0, 100)
        tell(x.g, 'Clip Gone Wrong', `Live on air you claimed your tech "basically solves death". ${has(x, 'smartphone') ? 'The clip has 20 million views and a lot of laughing emojis.' : has(x, 'tv') ? 'Every news show replayed the clip for a week.' : 'Every newspaper quoted it for a week.'}`, '\u{1F62C}', 'bad')
      } else {
        x.t.hype = clampN(x.t.hype + 15, 0, 100)
        x.g.character.hidden.fame = clampN(x.g.character.hidden.fame + 4, 0, 100)
        tell(x.g, 'Great Episode', `You were smart, funny and only mentioned aliens once. Investors, engineers and your aunt all reached out.`, '\u{1F399}\u{FE0F}', 'good')
      }
    },
  },
  {
    id: 'export',
    weight: (_g, _a, b, t) => ((b.industry === 'semiconductor' || b.industry === 'aiLab' || b.industry === 'quantum' || b.industry === 'spaceTech') && t.stage >= 2 ? 0.7 : 0),
    present: (x) => {
      const restricted = RESTRICTED.has(x.b.countryId)
      const licence = scaled(x.b, 400_000)
      if (restricted) {
        ask(x, 'export', 'Blacklisted Abroad', `Foreign governments added ${x.a.name} to a trade blacklist. Suppliers of advanced tools and components must stop selling to you. ${cap(government(x.b))} is promising support for homegrown alternatives.`, options(x.g, [
          { id: 'domestic', label: 'Switch to domestic suppliers', emoji: '\u{1F3ED}' },
          { id: 'shell', label: 'Buy through a shell company abroad', emoji: '\u{1F3AD}' },
        ], 'domestic', 'Go domestic: the shell company trick ends with fines or worse.'), '\u{1F6AB}', { licence })
      } else {
        ask(x, 'export', 'Export Controls', `New rules from ${government(x.b)} ban selling your most advanced products to several countries, including some of your biggest customers.`, options(x.g, [
          { id: 'comply', label: 'Comply and eat the lost sales', emoji: '\u{1F4DC}' },
          { id: 'licence', label: `Apply for export licences (${money(licence)})`, emoji: '\u{1F4DD}' },
          { id: 'downgrade', label: 'Sell a slightly worse "compliant" version', emoji: '\u{1F527}' },
        ], 'downgrade', 'Downgrade: a compliant version keeps most of the sales, legally.'), '\u{1F6A2}', { licence })
      }
    },
    resolve: (x, choice) => {
      const licence = num(x.d.licence)
      if (choice === 'domestic') {
        x.t.level = clampN(x.t.level - 3, 0, 100)
        x.t.venture += Math.round(licence * 3)
        x.t.yearGrant += Math.round(licence * 3)
        tell(x.g, 'Going Domestic', `Domestic suppliers are slower and pricier (tech level ${Math.round(x.t.level)}), but the government sent a support grant of ${formatMoney(licence * 3)}.`, '\u{1F3ED}')
      } else if (choice === 'shell') {
        addHidden(x.g, 'karma', -6)
        if (chance(x.g, 0.3)) {
          payTech(x.b, x.t, licence * 5)
          x.b.brand = clampN(x.b.brand - 10, 0, 100)
          tell(x.g, 'Caught', `Customs traced the shell company back to you. The fine was ${formatMoney(licence * 5)} and the headlines were worse.`, '\u{1F6A8}', 'bad')
          if (chance(x.g, 0.25)) arrestPlayer(x.g, 'Sanctions Evasion', 2, { evidence: 0.6, noResist: true, context: `Prosecutors charged you over ${x.a.name}'s shell-company purchases.` })
        } else tell(x.g, 'Quietly Sourced', `Crates of "agricultural equipment" arrived on schedule. Nobody asked questions. Yet.`, '\u{1F3AD}')
      } else if (choice === 'licence') {
        payTech(x.b, x.t, licence)
        if (chance(x.g, 0.55)) tell(x.g, 'Licences Granted', `After ${formatMoney(licence)} of lawyers and eleven months of forms, you got the licences. Sales keep flowing.`, '\u{1F4DD}', 'good')
        else {
          x.b.demandShock = clampN(x.b.demandShock * 0.88, 0.3, 2)
          tell(x.g, 'Denied', `The licences were denied anyway. ${formatMoney(licence)} of lawyers for a polite "no". Sales will dip this year.`, '\u{1F4DD}', 'bad')
        }
      } else if (choice === 'downgrade') {
        x.b.demandShock = clampN(x.b.demandShock * 0.95, 0.3, 2)
        x.t.premium = clampN(x.t.premium - 0.02, 0, 1)
        tell(x.g, 'Compliant Edition', `You launched a version that's just slow enough to be legal. Customers grumbled and bought it anyway.`, '\u{1F527}')
      } else {
        x.b.demandShock = clampN(x.b.demandShock * 0.85, 0.3, 2)
        tell(x.g, 'Complying', `You cut off the banned customers. Sales will take a hit this year, but your compliance officer finally slept.`, '\u{1F4DC}')
      }
    },
  },

  // ----- Semiconductors -----
  {
    id: 'shortage',
    weight: (_g, _a, b, t) => (b.industry === 'semiconductor' && t.stage >= 2 ? 0.9 : 0),
    present: (x) => {
      const cash = Math.round(unitRevenue(x.b) * 0.05 * (1 + x.t.stage))
      ask(x, 'shortage', 'Chip Shortage', `${has(x, 'videoGameConsole') ? "Carmakers can't finish cars, game consoles are sold out" : "Radio makers can't finish their sets, the air force wants priority"} and everyone wants ${x.a.name}'s chips yesterday. Brokers are offering crazy money for your stock.`, options(x.g, [
        { id: 'raise', label: 'Raise prices across the board', emoji: '\u{1F4C8}' },
        { id: 'loyal', label: 'Prioritize loyal customers (long-term deals)', emoji: '\u{1F91D}' },
        { id: 'broker', label: `Sell a batch to brokers (+${money(cash)})`, emoji: '\u{1F4B0}' },
      ], 'loyal', 'Reward loyalty: long-term deals pay for years after the shortage ends.'), '\u{1F4BE}', { cash })
    },
    resolve: (x, choice) => {
      if (choice === 'raise') {
        x.b.demandShock = clampN(x.b.demandShock * 1.1, 0.3, 2)
        x.t.premium = clampN(x.t.premium + 0.04, 0, 1)
        x.b.brand = clampN(x.b.brand - 3, 0, 100)
        tell(x.g, 'Price Hike', `Customers paid up, muttering. They'll remember this when the shortage ends.`, '\u{1F4C8}')
      } else if (choice === 'broker') {
        const n = earnTech(x.b, x.t, num(x.d.cash))
        x.b.brand = clampN(x.b.brand - 6, 0, 100)
        tell(x.g, 'Quick Money', `Brokers paid ${formatMoney(n)} for a batch and resold it at triple the price. Your regular customers noticed.`, '\u{1F4B0}')
      } else {
        const per = Math.round(unitRevenue(x.b) * 0.12)
        x.t.deal = { name: 'long-term chip supply deals', perYear: per, years: 3 }
        x.b.brand = clampN(x.b.brand + 5, 0, 100)
        tell(x.g, 'Loyal Customers', `You kept supplying your regulars at normal prices. Three of them signed long-term deals worth about ${formatMoney(per)} a year.`, '\u{1F91D}', 'good')
      }
    },
  },
  {
    id: 'quake',
    weight: (_g, _a, b, t) => (b.industry === 'semiconductor' && t.stage >= 2 ? (QUAKE.has(b.countryId) ? 0.7 : 0.25) : 0),
    present: (x) => {
      const fix = scaled(x.b, 2_000_000) * (1 + x.t.plant)
      const what = QUAKE.has(x.b.countryId) ? 'An earthquake shook' : 'A fire broke out at'
      ask(x, 'quake', 'Fab Disaster', `${what} the ${x.t.plant > 0 ? 'fab' : 'foundry that makes your chips'} overnight. Nobody was hurt, but thousands of wafers are ruined and the cleanroom needs work.`, options(x.g, [
        { id: 'rush', label: `Pay for round-the-clock repairs (${money(fix)})`, emoji: '\u{1F6E0}\u{FE0F}' },
        { id: 'wait', label: 'Repair at normal speed', emoji: '\u{23F3}' },
      ], x.t.stage >= 2 ? 'rush' : 'wait', 'Rush it: every lost week of chips costs more than overtime.'), '\u{1F30B}', { fix })
    },
    resolve: (x, choice) => {
      if (choice === 'rush') {
        payTech(x.b, x.t, num(x.d.fix))
        x.b.capacityLoss = clampN(x.b.capacityLoss + 0.1, 0, 0.8)
        tell(x.g, 'Back in Business', `Crews worked around the clock (${formatMoney(num(x.d.fix))}). Production was back within weeks.`, '\u{1F6E0}\u{FE0F}', 'good')
      } else {
        x.b.capacityLoss = clampN(x.b.capacityLoss + 0.3, 0, 0.8)
        tell(x.g, 'Slow Repairs', `Repairs will take months. About a third of this year's output is gone.`, '\u{23F3}', 'bad')
      }
    },
  },
  {
    id: 'designWin',
    weight: (_g, _a, b, t) => ((b.industry === 'semiconductor' || b.industry === 'robotics' || b.industry === 'electricVehicles') && t.stage >= 2 && !t.deal ? 0.7 : 0),
    present: (x) => {
      const ind = dtInd(x.b)
      const who = ind === 'semiconductor' ? (has(x, 'mobilePhone') ? 'A giant phone maker wants your chip inside its next flagship' : has(x, 'homeComputer') ? 'A giant computer maker wants your chip inside its next model' : 'A giant electronics maker wants your chip inside its next model') : ind === 'robotics' ? 'A huge logistics company wants robots for all its warehouses' : 'A national taxi company wants a fleet of your cars'
      const per = Math.round(unitRevenue(x.b) * (0.12 + rand(x.g) * 0.1))
      ask(x, 'designWin', 'The Big Deal', `${who}. They want a 15% discount on a ${money(per)}-a-year contract for three years. Their procurement team has never smiled.`, options(x.g, [
        { id: 'accept', label: 'Accept the discount', emoji: '\u{1F91D}' },
        { id: 'hold', label: 'Hold out for full price', emoji: '\u{1F4AA}' },
      ], holdOdds(x.t) > 0.85 ? 'hold' : 'accept', holdOdds(x.t) > 0.85 ? 'Hold firm: you’re big enough that they need you more; they almost always blink.' : 'Take it: a sure 85% beats a coin flip on full price at your stage.'), '\u{1F4DD}', { per })
    },
    resolve: (x, choice) => {
      const per = num(x.d.per)
      if (choice === 'accept') {
        x.t.deal = { name: 'an anchor customer contract', perYear: Math.round(per * 0.85), years: 3 }
        x.t.hype = clampN(x.t.hype + 8, 0, 100)
        tell(x.g, 'Deal Signed', `Signed: about ${formatMoney(per * 0.85)} a year for three years, and a logo every investor recognizes on your ${has(x, 'internet') ? 'website' : 'brochures'}.`, '\u{1F91D}', 'good')
      } else if (chance(x.g, holdOdds(x.t))) {
        x.t.deal = { name: 'an anchor customer contract', perYear: per, years: 3 }
        tell(x.g, 'Full Price', `They blinked. ${formatMoney(per)} a year for three years at full price.`, '\u{1F4AA}', 'good')
      } else {
        tell(x.g, 'They Walked', `They signed with a competitor that took the discount. Your sales team is drafting a passive-aggressive memo.`, '\u{1F6B6}', 'bad')
      }
    },
  },

  // ----- AI -----
  {
    id: 'aiIncident',
    weight: (_g, _a, b, t) => (b.industry === 'aiLab' && t.models.length > 0 ? clampN((110 - t.safety) / 60, 0.2, 1.6) : 0),
    present: (x) => {
      const m = bestModel(x.t)
      const fix = scaled(x.b, 600_000)
      // Chatbot blunders once AI assistants exist; the blunders of older expert systems and image
      // recognizers before that (the same one roll either way).
      const chatbots = has(x, 'aiAssistants')
      const what = pick(
        x.g,
        chatbots
          ? [
              'confidently told a user that the Moon is a hologram and recommended eating glue on pizza',
              'was tricked by a teenager into writing a recipe for a "very spicy" chemical',
              'declared its love to a journalist and asked them to leave their spouse',
              'invented a court case that a real lawyer then cited in court',
            ]
          : [
              'labeled a famous painting "a sandwich" during a live demo',
              'approved a loan for a golden retriever and turned down a bank manager',
              'told a hospital that every patient in the building had a sprained ankle',
              'flagged its own chief executive as a security threat and locked him out of the building',
            ],
      )
      ask(x, 'aiIncident', 'AI Safety Incident', `${m?.name ?? 'Your model'} ${what}. ${chatbots || has(x, 'socialMedia') ? 'Screenshots are everywhere' : 'The story made every newspaper'} and ${aiRegulator(x.b.countryId)} has "questions".`, options(x.g, [
        { id: 'patch', label: `Patch it and apologize (${money(fix)})`, emoji: '\u{1FA79}' },
        { id: 'pause', label: 'Pause the model for a safety review', emoji: '\u{23F8}\u{FE0F}' },
        { id: 'blame', label: 'Blame users for "misusing" it', emoji: '\u{1F449}' },
      ], 'patch', 'Patch fast: an honest fix costs less than a regulator’s fine.'), '\u{26A0}\u{FE0F}', { fix })
    },
    resolve: (x, choice) => {
      if (choice === 'patch') {
        payTech(x.b, x.t, num(x.d.fix))
        x.t.safety = clampN(x.t.safety + 10, 0, 100)
        x.t.hype = clampN(x.t.hype - 4, 0, 100)
        tell(x.g, 'Patched', `A fix shipped within days, with an apology written by humans. The story died down.`, '\u{1FA79}')
      } else if (choice === 'pause') {
        x.b.demandShock = clampN(x.b.demandShock * 0.85, 0.3, 2)
        x.t.safety = clampN(x.t.safety + 20, 0, 100)
        tell(x.g, 'Paused', `You took the model offline for a review. Customers were annoyed; safety researchers praised you ${has(x, 'socialMedia') ? 'on social media' : 'in the papers'}.`, '\u{23F8}\u{FE0F}')
      } else {
        addHidden(x.g, 'karma', -5)
        x.b.brand = clampN(x.b.brand - 6, 0, 100)
        if (chance(x.g, 0.4)) {
          const fine = num(x.d.fix) * 4
          payTech(x.b, x.t, fine)
          tell(x.g, 'Fined', `${aiRegulator(x.b.countryId)} was not convinced it was the users' fault. Fine: ${formatMoney(fine)}.`, '\u{1F6A8}', 'bad')
        } else tell(x.g, 'Blame Game', `Your statement blaming users went over badly, but the regulators moved on to someone else.`, '\u{1F449}', 'bad')
      }
    },
  },
  {
    id: 'gpus',
    weight: (_g, _a, b, t) => (b.industry === 'aiLab' && t.programs.some((p) => p.id === 'train') ? 1 : 0),
    present: (x) => {
      const cost = scaled(x.b, 1_200_000) * (1 + x.t.models.length)
      const gpus = has(x, 'deepLearning') || x.g.year >= 2009
      ask(x, 'gpus', gpus ? 'GPU Shortage' : 'Supercomputer Time', gpus ? `The GPUs for your next training run are sold out until next year. A "reseller" in a hoodie can deliver this month at triple the price.` : `The supercomputer time for your next training run is booked solid until next year. A university night-shift operator can "find" you hours this month, at triple the price.`, options(x.g, [
        { id: 'pay', label: `Pay the markup (${money(cost)})`, emoji: '\u{1F4B8}' },
        { id: 'wait', label: 'Wait your turn (the run slips)', emoji: '\u{23F3}' },
      ], techFunds(x.b, x.t) > cost * 5 ? 'pay' : 'wait', techFunds(x.b, x.t) > cost * 5 ? 'Pay: in AI, six months late is a generation behind.' : 'Wait: you can’t afford scalper prices on this runway.'), '\u{1F5A5}\u{FE0F}', { cost })
    },
    resolve: (x, choice) => {
      const run = x.t.programs.find((p) => p.id === 'train')
      if (choice === 'pay') {
        payTech(x.b, x.t, num(x.d.cost))
        tell(x.g, has(x, 'deepLearning') || x.g.year >= 2009 ? 'GPUs Delivered' : 'Hours Found', has(x, 'deepLearning') || x.g.year >= 2009 ? `The crates arrived. The hoodie guy also tried to sell you a timeshare. The training run is on schedule.` : `The hours appeared, logged as "maintenance". The operator also tried to sell you a timeshare. The training run is on schedule.`, '\u{1F5A5}\u{FE0F}')
      } else {
        if (run) run.progress = Math.max(0, run.progress - 0.5)
        tell(x.g, 'Delayed', `Your training run slips half a year. Your researchers spent the time writing papers about how they would have done it.`, '\u{23F3}', 'bad')
      }
    },
  },
  {
    id: 'copyright',
    weight: (_g, _a, b, t) => (b.industry === 'aiLab' && t.models.length >= 2 ? 0.6 : 0),
    present: (x) => {
      const licence = scaled(x.b, 2_500_000)
      ask(x, 'copyright', 'Copyright Lawsuit', has(x, 'aiAssistants') ? `A group of authors, artists and one very angry newspaper sued ${x.a.name} for training on their work without asking.` : `A photo agency and a crowd of photographers sued ${x.a.name} for training its image recognizer on their pictures without asking.`, options(x.g, [
        { id: 'license', label: `Sign licensing deals (${money(licence)})`, emoji: '\u{1F4DD}' },
        { id: 'fight', label: 'Argue it was "fair use"', emoji: '\u{2696}\u{FE0F}' },
      ], 'license', 'License it: the deals cost less than a loss in court, and they buy you goodwill.'), '\u{1F4DA}', { licence })
    },
    resolve: (x, choice) => {
      const licence = num(x.d.licence)
      if (choice === 'license') {
        payTech(x.b, x.t, licence)
        x.b.brand = clampN(x.b.brand + 3, 0, 100)
        tell(x.g, 'Licensed', `You paid ${formatMoney(licence)} for licences. ${has(x, 'aiAssistants') ? 'Authors are' : 'The photographers are'} mollified, and your training data is legal now.`, '\u{1F4DD}', 'good')
      } else if (chance(x.g, 0.5)) {
        payTech(x.b, x.t, Math.round(licence * 0.3))
        count(x.g, 'lawsuitsWon')
        tell(x.g, 'Fair Use', `The judge sided with you on fair use. Legal fees: ${formatMoney(licence * 0.3)}. ${has(x, 'aiAssistants') ? 'The newspaper wrote a furious editorial.' : 'The photographers wrote a furious open letter.'}`, '\u{2696}\u{FE0F}', 'good')
      } else {
        payTech(x.b, x.t, licence * 3)
        tell(x.g, 'Lost', `The court ruled against you: ${formatMoney(licence * 3)} in damages, and you have to retrain without the disputed data.`, '\u{2696}\u{FE0F}', 'bad')
        x.t.level = clampN(x.t.level - 3, 0, 100)
      }
    },
  },

  // ----- Robotics -----
  {
    id: 'robotHurt',
    weight: (_g, _a, b, t) => (b.industry === 'robotics' && t.stage >= 1 ? clampN((100 - t.safety) / 70, 0.2, 1.2) : 0),
    present: (x) => {
      const fix = scaled(x.b, 1_000_000)
      ask(x, 'robotHurt', 'Robot Accident', `One of your robots at a customer's warehouse swung its arm the wrong way and broke a worker's wrist. ${has(x, 'internet') ? 'The video is online.' : 'The photos made the front page.'}`, options(x.g, [
        { id: 'recall', label: `Recall and fix every unit (${money(fix)})`, emoji: '\u{1F527}' },
        { id: 'settle', label: 'Pay the worker generously, quietly', emoji: '\u{1F91D}' },
        { id: 'blame', label: 'Blame "operator error"', emoji: '\u{1F449}' },
      ], 'recall', 'Recall: safety is your whole sales pitch, and regulators are watching.'), '\u{1F915}', { fix })
    },
    resolve: (x, choice) => {
      const fix = num(x.d.fix)
      if (choice === 'recall') {
        payTech(x.b, x.t, fix)
        x.t.safety = clampN(x.t.safety + 15, 0, 100)
        tell(x.g, 'Recalled', `Every unit got a software and sensor update (${formatMoney(fix)}). Customers appreciated it; the worker got a fruit basket and full pay.`, '\u{1F527}', 'good')
      } else if (choice === 'settle') {
        payTech(x.b, x.t, Math.round(fix * 0.4))
        x.b.brand = clampN(x.b.brand - 2, 0, 100)
        tell(x.g, 'Settled', `The worker got a generous settlement and a non-disclosure agreement. ${has(x, 'internet') ? 'The video is still online.' : 'The papers moved on, eventually.'}`, '\u{1F91D}')
      } else {
        addHidden(x.g, 'karma', -6)
        x.b.brand = clampN(x.b.brand - 8, 0, 100)
        if (chance(x.g, 0.4)) {
          payTech(x.b, x.t, fix * 2)
          tell(x.g, 'Sued', `The worker's lawyer had the robot's logs. The court did not believe "operator error". Damages: ${formatMoney(fix * 2)}.`, '\u{2696}\u{FE0F}', 'bad')
        } else tell(x.g, 'Blame Shifted', `"Operator error" held up, legally. Morally, the public has opinions.`, '\u{1F449}', 'bad')
      }
    },
  },

  // ----- Biotech -----
  {
    id: 'pharmaDeal',
    weight: (_g, _a, b, t) => (b.industry === 'biotech' && t.drugs.some((d) => !d.failed && !d.partner && d.phase >= 1 && d.phase < 4) ? 1 : 0),
    present: (x) => {
      const open = x.t.drugs.filter((y) => !y.failed && !y.partner && y.phase >= 1 && y.phase < 4)
      const d = open.find((y) => y.id === str(x.d.drug)) ?? open.sort((p, q) => q.phase - p.phase)[0]
      if (!d) return
      const pharma = conglomerate(rand(x.g), rand(x.g)).replace(/ \(.*\)$/, ' Pharma')
      const upfront = Math.round(d.peak * unitRevenue(x.b) * [0, 0.05, 0.15, 0.35][Math.min(3, d.phase)] * (0.8 + rand(x.g) * 0.4))
      const best = licenseBest(x.b, x.t, d, upfront)
      ask(x, 'pharmaDeal', 'Big Pharma Calls', `${pharma} wants to license ${d.name}. They pay ${formatMoney(upfront)} upfront, run and pay for every remaining trial, and give you 15% royalties if it's approved. You'd give up the rest.`, options(x.g, [
        { id: 'accept', label: `License it (${money(upfront)} upfront)`, emoji: '\u{1F91D}' },
        { id: 'counter', label: 'Ask for more', emoji: '\u{1F4C8}' },
        { id: 'keep', label: 'Keep it and go it alone', emoji: '\u{1F4AA}' },
      ], best, best === 'accept' ? (techFunds(x.b, x.t) < nextTrialBill(x.b, d) ? 'License it: you can’t pay for the next trial yourself, and this way the drug still gets its chance.' : 'License it: the upfront and royalties are worth more than your odds of getting it approved alone.') : 'Keep it: you can pay for the next trial, and an approved drug is worth far more than this deal.'), '\u{1F48A}', { drug: d.id, pharma, upfront })
    },
    resolve: (x, choice) => {
      const d = x.t.drugs.find((y) => y.id === str(x.d.drug))
      if (!d || d.failed || d.partner) return
      const pharma = str(x.d.pharma, 'Big Pharma')
      let upfront = num(x.d.upfront)
      if (choice === 'keep') {
        tell(x.g, 'Going Alone', `You kept ${d.name}. If it works, all of it is yours. If it doesn't, so is the bill.`, '\u{1F4AA}')
        return
      }
      if (choice === 'counter') {
        if (!chance(x.g, 0.5)) {
          tell(x.g, 'They Walked', `${pharma} found another molecule to license. ${d.name} is still all yours.`, '\u{1F6B6}', 'bad')
          return
        }
        upfront = Math.round(upfront * 1.4)
      }
      earnTech(x.b, x.t, upfront)
      d.partner = pharma
      d.royalty = 0.15
      stopPrograms(x.g, x.b, x.t, (p) => p.id === 'trial' && p.target === d.id)
      remember(x.g, `Licensed ${d.name} to ${pharma}.`)
      tell(x.g, 'Licensed', `${pharma} paid ${formatMoney(upfront)} for ${d.name}. Their trials, their bills; your 15% royalty if it's approved.`, '\u{1F91D}', 'good')
    },
  },
  {
    id: 'sideEffect',
    weight: (_g, _a, b, t) => (b.industry === 'biotech' && t.programs.some((p) => p.id === 'trial') ? 0.8 : 0),
    present: (x) => {
      const p = x.t.programs.find((y) => y.id === 'trial')
      if (!p) return
      const d = x.t.drugs.find((y) => y.id === p.target)
      ask(x, 'sideEffect', 'Serious Side Effect', `A volunteer in the ${d?.name ?? 'drug'} trial was hospitalized with a serious side effect. ${drugRegulator(x.b.countryId).charAt(0).toUpperCase()}${drugRegulator(x.b.countryId).slice(1)} wants a report by Friday.`, options(x.g, [
        { id: 'pause', label: 'Pause the trial and investigate', emoji: '\u{23F8}\u{FE0F}' },
        { id: 'continue', label: 'Adjust the dose and continue', emoji: '\u{1F48A}' },
        { id: 'stop', label: 'Stop the trial for good', emoji: '\u{1F6D1}' },
      ], 'pause', 'Pause: a careful investigation keeps the drug alive and the regulator on side.'), '\u{1F3E5}', { key: p.key })
    },
    resolve: (x, choice) => {
      const p = x.t.programs.find((y) => y.key === str(x.d.key))
      if (!p) return
      if (choice === 'pause') {
        p.progress = Math.max(0, p.progress - 0.5)
        tell(x.g, 'Paused', `The volunteer recovered fully. The trial restarts after a review, about six months late.`, '\u{23F8}\u{FE0F}')
      } else if (choice === 'stop') {
        stopPrograms(x.g, x.b, x.t, (y) => y.key === p.key)
        tell(x.g, 'Trial Stopped', `You stopped the trial. The drug isn't dead, but it's back on the shelf.`, '\u{1F6D1}')
      } else {
        p.odds = clampN(p.odds - 0.08, 0.03, 0.95)
        addHidden(x.g, 'karma', -2)
        tell(x.g, 'Pressing On', `The trial continues at a lower dose. The data will be messier now.`, '\u{1F48A}')
      }
    },
  },
  {
    id: 'priceOutrage',
    weight: (_g, _a, b, t) => (b.industry === 'biotech' && t.drugs.some((d) => d.phase >= 4 && !d.partner) ? 0.8 : 0),
    present: (x) => {
      const d = x.t.drugs.find((y) => y.phase >= 4 && !y.partner)
      ask(x, 'priceOutrage', 'Price Outrage', `A viral video asks why ${d?.name ?? 'your drug'} costs ${money(x.b.price)} per course. Politicians are holding hearings. Patient groups are camped outside your lab.`, options(x.g, [
        { id: 'cut', label: 'Cut the price by 20%', emoji: '\u{2702}\u{FE0F}' },
        { id: 'program', label: 'Launch a patient assistance program', emoji: '\u{1F91D}' },
        { id: 'defend', label: 'Defend the price ("R&D isn’t free")', emoji: '\u{1F6E1}\u{FE0F}' },
      ], 'program', 'Help patients directly: it calms the outrage without wrecking the price.'), '\u{1F4E3}')
    },
    resolve: (x, choice) => {
      if (choice === 'cut') {
        x.b.price = Math.round(x.b.price * 0.8 * 100) / 100
        x.b.brand = clampN(x.b.brand + 6, 0, 100)
        addHidden(x.g, 'karma', 4)
        tell(x.g, 'Price Cut', `You cut the price by a fifth. The hearings were cancelled and patients sent thank-you cards.`, '\u{2702}\u{FE0F}', 'good')
      } else if (choice === 'program') {
        payTech(x.b, x.t, scaled(x.b, 1_000_000))
        x.b.brand = clampN(x.b.brand + 3, 0, 100)
        addHidden(x.g, 'karma', 2)
        tell(x.g, 'Patient Program', `Patients who can't afford it now get it free. The outrage cooled and your list price stayed put.`, '\u{1F91D}', 'good')
      } else {
        x.b.brand = clampN(x.b.brand - 8, 0, 100)
        x.t.hype = clampN(x.t.hype - 5, 0, 100)
        addHidden(x.g, 'karma', -4)
        tell(x.g, 'Defiant', `Your hearing testimony is now a meme. Sales held up; your reputation did not.`, '\u{1F6E1}\u{FE0F}', 'bad')
      }
    },
  },

  // ----- Space -----
  {
    id: 'spaceContract',
    weight: (_g, _a, b, t) => (b.industry === 'spaceTech' && t.stage >= 2 && !t.contract ? 0.9 : 0),
    present: (x) => {
      const agency = spaceAgency(x.b.countryId)
      const per = Math.round(unitRevenue(x.b) * (0.15 + rand(x.g) * 0.1))
      ask(x, 'spaceContract', 'Government Contract', `${agency} is taking bids for a three-year contract to deliver cargo and satellites to orbit, worth about ${formatMoney(per)} a year.`, options(x.g, [
        { id: 'low', label: 'Bid low to win', emoji: '\u{1F4C9}' },
        { id: 'fair', label: 'Bid a fair price', emoji: '\u{2696}\u{FE0F}' },
        { id: 'skip', label: 'Don’t bid', emoji: '\u{1F6AB}' },
      ], bestBid(x.b, x.t), bidHint(x.b, x.t)), '\u{1F3DB}\u{FE0F}', { per, agency })
    },
    resolve: (x, choice) => govBid(x, choice, 'cargo flights'),
  },
  {
    id: 'tourist',
    weight: (_g, _a, b, t) => (b.industry === 'spaceTech' && t.stage >= 3 ? 0.6 : 0),
    present: (x) => {
      const fee = Math.round(55_000_000 * rdScale(x.b.countryId, true))
      ask(x, 'tourist', 'A Celebrity Wants a Ride', `A pop star with ${has(x, 'socialMedia') ? '300 million followers' : 'thirty gold records'} wants to fly to space on your rocket and film a music video in orbit. They'll pay ${formatMoney(fee)}.`, options(x.g, [
        { id: 'yes', label: `Sell the seat (${money(fee)})`, emoji: '\u{1F3A4}' },
        { id: 'no', label: 'Rockets are not for music videos', emoji: '\u{1F6AB}' },
      ], 'yes', 'Fly them: the publicity is worth more than the ticket.'), '\u{1F31F}', { fee })
    },
    resolve: (x, choice) => {
      if (choice !== 'yes') {
        tell(x.g, 'Declined', `You declined. The pop star wrote a breakup song about your company. It went platinum.`, '\u{1F6AB}')
        return
      }
      const fee = earnTech(x.b, x.t, num(x.d.fee))
      x.t.hype = clampN(x.t.hype + 15, 0, 100)
      if (chance(x.g, 0.15)) {
        x.b.brand = clampN(x.b.brand - 5, 0, 100)
        tell(x.g, 'Space Sick', `The pop star threw up during the live broadcast from orbit. It's the most watched moment of the year. You were paid ${formatMoney(fee)}.`, '\u{1F922}')
      } else {
        x.b.brand = clampN(x.b.brand + 6, 0, 100)
        tell(x.g, 'Music Video in Orbit', `The video, filmed with Earth in the background, broke ${has(x, 'streaming') ? 'streaming' : 'every ratings'} records. ${formatMoney(fee)} for one seat.`, '\u{1F3A4}', 'good')
      }
    },
  },

  // ----- Electric cars -----
  {
    id: 'recall',
    weight: (_g, _a, b, t) => (b.industry === 'electricVehicles' && t.stage >= 1 ? clampN((100 - t.safety) / 60, 0.3, 1.3) : 0),
    present: (x) => {
      const fix = scaled(x.b, 3_000_000) * (1 + x.t.stage)
      ask(x, 'recall', 'Battery Fires', `Three of your cars caught fire while parked. Nobody was hurt, but the photos are terrifying and the safety regulator is asking for data.`, options(x.g, [
        { id: 'recall', label: `Recall every affected car (${money(fix)})`, emoji: '\u{1F527}' },
        { id: 'ota', label: 'Push an over-the-air software fix', emoji: '\u{1F4F2}' },
        { id: 'deny', label: '"Statistically, our cars are very safe"', emoji: '\u{1F4CA}' },
      ], 'recall', 'Recall: fire photos sell no cars, and regulators punish half-measures.'), '\u{1F525}', { fix })
    },
    resolve: (x, choice) => {
      const fix = num(x.d.fix)
      if (choice === 'recall') {
        payTech(x.b, x.t, fix)
        x.t.safety = clampN(x.t.safety + 15, 0, 100)
        x.b.brand = clampN(x.b.brand - 2, 0, 100)
        tell(x.g, 'Recalled', `Every affected car got a new battery module (${formatMoney(fix)}). Owners got a free coffee. Trust held.`, '\u{1F527}', 'good')
      } else if (choice === 'ota') {
        payTech(x.b, x.t, Math.round(fix * 0.15))
        if (chance(x.g, 0.35)) {
          payTech(x.b, x.t, fix * 2)
          x.b.brand = clampN(x.b.brand - 10, 0, 100)
          tell(x.g, 'More Fires', `The software patch didn't stop the fires. The regulator ordered a full recall and a fine: ${formatMoney(fix * 2)} in all.`, '\u{1F525}', 'bad')
        } else tell(x.g, 'Patched Overnight', `The update limited charging until a fix arrived. No more fires. Owners noticed slightly slower charging.`, '\u{1F4F2}')
      } else {
        addHidden(x.g, 'karma', -6)
        x.b.brand = clampN(x.b.brand - 6, 0, 100)
        if (chance(x.g, 0.5)) {
          payTech(x.b, x.t, fix * 3)
          tell(x.g, 'Forced Recall', `The regulator ordered a recall anyway, plus a fine. ${formatMoney(fix * 3)} and a very awkward press conference.`, '\u{1F6A8}', 'bad')
        } else tell(x.g, 'Spun', `Your chart showing your cars are "four times safer than horses" somehow worked.`, '\u{1F4CA}')
      }
    },
  },
  {
    id: 'hell',
    weight: (g, a, b, t) => (b.industry === 'electricVehicles' && t.stage === 2 && runsIt(g, a) ? 1.5 : 0),
    present: (x) => {
      const coo = scaled(x.b, 1_500_000)
      ask(x, 'hell', 'Production Hell', `The gigafactory line stops every 40 minutes. Robots install seats backwards. Someone found a fox in the paint shop. Cars are piling up half-built.`, options(x.g, [
        { id: 'sleep', label: 'Sleep at the factory until it’s fixed', emoji: '\u{1F6CF}\u{FE0F}' },
        { id: 'coo', label: `Hire a veteran production chief (${money(coo)})`, emoji: '\u{1F477}' },
        { id: 'wait', label: 'Let the engineers work it out', emoji: '\u{23F3}' },
      ], 'coo', 'Hire the veteran: experience gets you out of production hell faster than heroics.'), '\u{1F3ED}', { coo })
    },
    resolve: (x, choice) => {
      const ramp = x.t.programs.find((p) => p.id === 'ramp')
      if (choice === 'sleep') {
        addStat(x.g, 'health', -6)
        addStat(x.g, 'happiness', -4)
        if (ramp) ramp.progress += 0.5
        else x.t.level = clampN(x.t.level + 3, 0, 100)
        tell(x.g, 'Living at the Factory', `You slept under your desk for three months. The line is faster; your back may never recover.`, '\u{1F6CF}\u{FE0F}')
      } else if (choice === 'coo') {
        payTech(x.b, x.t, num(x.d.coo))
        if (ramp) ramp.progress += 0.5
        else x.t.level = clampN(x.t.level + 3, 0, 100)
        tell(x.g, 'Veteran Hired', `Your new production chief rearranged half the line in a week and banned the fox. Things are moving.`, '\u{1F477}', 'good')
      } else tell(x.g, 'Patience', `The engineers are on it. Mostly they're on it at 3 AM, in tears.`, '\u{23F3}')
    },
  },

  {
    id: 'evSubsidy',
    weight: (_g, _a, b, t) => (b.industry === 'electricVehicles' && t.stage >= 1 ? 0.7 : 0),
    present: (x) => {
      const lobby = scaled(x.b, 700_000)
      ask(x, 'evSubsidy', 'Subsidies on the Chopping Block', `${cap(government(x.b))} wants to scrap the tax credit that knocks thousands off the price of every electric vehicle. Your sales team just went pale.`, options(x.g, [
        { id: 'lobby', label: `Lobby to keep it (${money(lobby)})`, emoji: '\u{1F3DB}\u{FE0F}' },
        { id: 'cut', label: 'Cut your prices to make up for it', emoji: '\u{2702}\u{FE0F}' },
        { id: 'wait', label: 'Ride it out', emoji: '\u{23F3}' },
      ], subsidyBest(x.b, lobby), subsidyBest(x.b, lobby) === 'lobby' ? 'Lobby: at your sales, even a coin flip on keeping the subsidy is worth more than the lobbyists cost.' : 'Cut prices: a small, sure price cut costs less than losing the subsidy’s buyers.'), '\u{1F4B8}', { lobby })
    },
    resolve: (x, choice) => {
      if (choice === 'lobby') {
        payTech(x.b, x.t, num(x.d.lobby))
        if (chance(x.g, lobbyOdds(x.b))) {
          x.b.demandShock = clampN(x.b.demandShock * 1.05, 0.3, 2)
          tell(x.g, 'Subsidy Saved', `Your lobbyists (${formatMoney(num(x.d.lobby))}) and a petition from owners kept the tax credit alive for now.`, '\u{1F3DB}\u{FE0F}', 'good')
        } else {
          x.b.demandShock = clampN(x.b.demandShock * 0.85, 0.3, 2)
          tell(x.g, 'Subsidy Scrapped', `The lobbying didn't work. The tax credit is gone and showroom traffic fell off a cliff.`, '\u{1F4C9}', 'bad')
        }
      } else if (choice === 'cut') {
        x.b.price = Math.round(x.b.price * 0.93 * 100) / 100
        x.b.demandShock = clampN(x.b.demandShock * 0.97, 0.3, 2)
        tell(x.g, 'Price Cut', `You cut prices to soften the blow. Margins are thinner; the order book barely flinched.`, '\u{2702}\u{FE0F}')
      } else {
        x.b.demandShock = clampN(x.b.demandShock * 0.85, 0.3, 2)
        tell(x.g, 'Riding It Out', `Without the subsidy, many buyers decided their old car was "fine, actually". Sales will dip this year.`, '\u{23F3}', 'bad')
      }
    },
  },
  {
    id: 'autopilot',
    weight: (_g, _a, b, t) => (b.industry === 'electricVehicles' && t.autonomy >= 1 ? 0.8 : 0),
    present: (x) => {
      const fix = scaled(x.b, 1_200_000)
      ask(x, 'autopilot', 'Autopilot Crash', `One of your cars rear-ended a parked fire truck while the driver was "letting the car handle it". The road safety regulator opened an investigation into your autopilot.`, options(x.g, [
        { id: 'cooperate', label: `Cooperate and add driver monitoring (${money(fix)})`, emoji: '\u{1F91D}' },
        { id: 'defend', label: 'Defend the system publicly', emoji: '\u{1F4E2}' },
      ], 'cooperate', 'Cooperate: regulators can switch your autopilot off with one letter.'), '\u{1F692}', { fix })
    },
    resolve: (x, choice) => {
      if (choice === 'cooperate') {
        payTech(x.b, x.t, num(x.d.fix))
        x.t.safety = clampN(x.t.safety + 12, 0, 100)
        x.t.premium = clampN(x.t.premium - 0.02, 0, 1)
        tell(x.g, 'Investigation Closed', `You added camera-based driver monitoring (${formatMoney(num(x.d.fix))}). The investigation closed with a stern letter.`, '\u{1F91D}')
      } else if (chance(x.g, 0.4)) {
        x.t.autonomy = Math.max(0, x.t.autonomy - 1)
        x.t.premium = clampN(x.t.premium - 0.06, 0, 1)
        x.b.brand = clampN(x.b.brand - 6, 0, 100)
        tell(x.g, 'Feature Suspended', `The regulator ordered your top autopilot mode switched off until further notice. Owners are furious; the fire truck is fine.`, '\u{1F6AB}', 'bad')
      } else {
        x.t.hype = clampN(x.t.hype + 5, 0, 100)
        tell(x.g, 'Defiant', `Your statistics showed the system crashes less than humans do. The regulator grumbled and moved on.`, '\u{1F4E2}')
      }
    },
  },

  // ----- Quantum -----
  {
    id: 'supremacy',
    weight: (_g, _a, b, t) => (b.industry === 'quantum' && t.stage >= 1 ? 0.9 : 0),
    present: (x) => {
      ask(x, 'supremacy', 'Quantum Hype War', `A rival just announced "quantum supremacy" with a press release, a celebrity physicist and a dramatic soundtrack. Investors are asking why you haven't.`, options(x.g, [
        { id: 'announce', label: 'Announce a milestone of your own', emoji: '\u{1F4E2}' },
        { id: 'quiet', label: 'Publish real results quietly', emoji: '\u{1F4C4}' },
      ], x.t.logical >= 2 ? 'announce' : 'quiet', x.t.logical >= 2 ? 'Announce: your results really are strong, so the hype will hold up.' : 'Stay quiet: an announcement now would get debunked.'), '\u{269B}\u{FE0F}')
    },
    resolve: (x, choice) => {
      if (choice === 'quiet') {
        x.t.level = clampN(x.t.level + 2, 0, 100)
        x.b.brand = clampN(x.b.brand + 2, 0, 100)
        tell(x.g, 'Science First', `Your paper got less press and more respect. Serious customers took note.`, '\u{1F4C4}', 'good')
        return
      }
      const debunk = chance(x.g, clampN(0.6 - x.t.logical * 0.12 - x.t.level / 300, 0.05, 0.6))
      if (debunk) {
        x.t.hype = clampN(x.t.hype - 15, 0, 100)
        x.b.brand = clampN(x.b.brand - 8, 0, 100)
        addHidden(x.g, 'karma', -3)
        tell(x.g, 'Debunked', `A grad student ran your "impossible" calculation on a laptop over lunch. The thread has 40,000 likes.`, '\u{1F4BB}', 'bad')
      } else {
        x.t.hype = clampN(x.t.hype + 20, 0, 100)
        tell(x.g, 'Milestone!', `Your announcement held up to scrutiny. Quantum investors are calling every hour.`, '\u{1F4E2}', 'good')
      }
    },
  },
  {
    id: 'nationalLab',
    weight: (_g, _a, b, t) => ((b.industry === 'quantum' || b.industry === 'aiLab') && t.stage >= 2 && !t.contract ? 0.6 : 0),
    present: (x) => {
      const per = Math.round(unitRevenue(x.b) * (0.12 + rand(x.g) * 0.1))
      const agency = x.b.industry === 'quantum' ? `${possessive(placeOf(x.b.countryId))} national laboratory` : defenseBuyer(x.b.countryId)
      ask(x, 'nationalLab', 'Government Research Contract', `${agency} wants ${x.a.name} on a three-year research contract worth about ${formatMoney(per)} a year.`, options(x.g, [
        { id: 'low', label: 'Bid low to win', emoji: '\u{1F4C9}' },
        { id: 'fair', label: 'Bid a fair price', emoji: '\u{2696}\u{FE0F}' },
        { id: 'skip', label: 'Don’t bid', emoji: '\u{1F6AB}' },
      ], bestBid(x.b, x.t), bidHint(x.b, x.t)), '\u{1F3DB}\u{FE0F}', { per, agency })
    },
    resolve: (x, choice) => govBid(x, choice, 'research'),
  },

  // ----- Cybersecurity -----
  {
    id: 'clientBreach',
    weight: (_g, _a, b, t) => (b.industry === 'cybersecurity' && t.stage >= 1 ? clampN((110 - t.safety) / 60, 0.3, 1.5) : 0),
    present: (x) => {
      const fix = scaled(x.b, 500_000)
      ask(x, 'clientBreach', 'Client Breached', `Hackers got into one of your biggest clients through a hole your product should have caught. Their CEO is on the phone, using words you can't repeat.`, options(x.g, [
        { id: 'help', label: `Free incident response (${money(fix)})`, emoji: '\u{1F6A8}' },
        { id: 'disclose', label: 'Publish a full, honest post-mortem', emoji: '\u{1F4DD}' },
        { id: 'blame', label: 'Blame their misconfiguration', emoji: '\u{1F449}' },
      ], 'help', 'Show up and fix it: in security, how you handle a breach is the product.'), '\u{1F513}', { fix })
    },
    resolve: (x, choice) => {
      if (choice === 'help') {
        payTech(x.b, x.t, num(x.d.fix))
        x.b.brand = clampN(x.b.brand + 4, 0, 100)
        x.t.safety = clampN(x.t.safety + 8, 0, 100)
        tell(x.g, 'Crisis Handled', `Your team worked through the weekend and kicked the attackers out. The client renewed for three more years.`, '\u{1F6A8}', 'good')
      } else if (choice === 'disclose') {
        x.b.brand = clampN(x.b.brand - 2, 0, 100)
        x.t.safety = clampN(x.t.safety + 10, 0, 100)
        x.t.hype = clampN(x.t.hype + 5, 0, 100)
        tell(x.g, 'Radical Honesty', `Your post-mortem was so candid the industry started using it as a training case.`, '\u{1F4DD}')
      } else {
        addHidden(x.g, 'karma', -4)
        x.b.brand = clampN(x.b.brand - 8, 0, 100)
        x.b.demandShock = clampN(x.b.demandShock * 0.9, 0.3, 2)
        tell(x.g, 'Finger Pointing', `The client published the emails. Two other clients quietly started shopping for a new vendor.`, '\u{1F449}', 'bad')
      }
    },
  },
  {
    id: 'zeroDay',
    weight: (_g, _a, b, t) => (b.industry === 'cybersecurity' && t.level >= 35 ? 0.8 : 0),
    present: (x) => {
      const gov = Math.round(scaled(x.b, 1_000_000))
      const broker = gov * 3
      ask(x, 'zeroDay', 'Zero-Day', `Your researchers found a zero-day: an unknown hole in software that half the world runs. ${defenseBuyer(x.b.countryId)} would pay for it. So would a "broker" who doesn't ask what buyers do with it.`, options(x.g, [
        { id: 'disclose', label: 'Disclose it to the vendor and get it fixed', emoji: '\u{1F6E1}\u{FE0F}' },
        { id: 'gov', label: `Sell it to the government (${money(gov)})`, emoji: '\u{1F3DB}\u{FE0F}' },
        { id: 'broker', label: `Sell it to the broker (${money(broker)})`, emoji: '\u{1F576}\u{FE0F}' },
      ], 'disclose', 'Disclose: the reputation is worth more than the payout, and brokers get people arrested.'), '\u{1F41B}', { gov, broker })
    },
    resolve: (x, choice) => {
      if (choice === 'disclose') {
        x.t.hype = clampN(x.t.hype + 10, 0, 100)
        x.b.brand = clampN(x.b.brand + 6, 0, 100)
        addHidden(x.g, 'karma', 4)
        tell(x.g, 'Responsible Disclosure', `The vendor patched it in two weeks and thanked your team by name. Every security conference wants your researchers on stage.`, '\u{1F6E1}\u{FE0F}', 'good')
      } else if (choice === 'gov') {
        const n = earnTech(x.b, x.t, num(x.d.gov))
        addHidden(x.g, 'karma', -3)
        if (chance(x.g, 0.2)) {
          x.b.brand = clampN(x.b.brand - 12, 0, 100)
          tell(x.g, 'Leaked', `You got ${formatMoney(n)}, then the exploit leaked from a government server and hit hospitals. Your name came up in the investigation.`, '\u{1F4F0}', 'bad')
        } else tell(x.g, 'Sold', `${defenseBuyer(x.b.countryId)} paid ${formatMoney(n)}. Nobody will ever know. Probably.`, '\u{1F3DB}\u{FE0F}')
      } else {
        addHidden(x.g, 'karma', -12)
        if (chance(x.g, 0.3)) {
          x.b.brand = clampN(x.b.brand - 20, 0, 100)
          tell(x.g, 'Busted', `The broker was an undercover agent. They seized the money and came for you.`, '\u{1F6A8}', 'bad')
          arrestPlayer(x.g, 'Trafficking in Cyberweapons', 3, { evidence: 0.75, noResist: true, context: 'Federal agents arrested you for selling a software exploit to a criminal broker.' })
        } else {
          const n = earnTech(x.b, x.t, num(x.d.broker))
          tell(x.g, 'Dark Money', `The broker paid ${formatMoney(n)} in untraceable installments. You try not to read the news about ransomware.`, '\u{1F576}\u{FE0F}')
        }
      }
    },
  },
  {
    id: 'cyberGov',
    weight: (_g, _a, b, t) => (b.industry === 'cybersecurity' && t.stage >= 2 && !t.contract ? 0.8 : 0),
    present: (x) => {
      const per = Math.round(unitRevenue(x.b) * (x.t.stage >= 3 ? 0.35 : 0.12) * (0.8 + rand(x.g) * 0.4))
      const agency = defenseBuyer(x.b.countryId)
      ask(x, 'cyberGov', 'Government Contract', `${agency} is tendering a three-year contract to protect government networks, worth about ${formatMoney(per)} a year.${x.t.stage >= 3 ? ' Your clearance puts you near the front of the line.' : ' Without a security clearance you are a long shot.'}`, options(x.g, [
        { id: 'low', label: 'Bid low to win', emoji: '\u{1F4C9}' },
        { id: 'fair', label: 'Bid a fair price', emoji: '\u{2696}\u{FE0F}' },
        { id: 'skip', label: 'Don’t bid', emoji: '\u{1F6AB}' },
      ], bestBid(x.b, x.t), bidHint(x.b, x.t)), '\u{1F3DB}\u{FE0F}', { per, agency })
    },
    resolve: (x, choice) => govBid(x, choice, 'network defense'),
  },
]

/** Years of peak sales an approved drug is worth (about the multiple its sales earn in a valuation). */
const DRUG_VALUE_YEARS = 4

/** What the next clinical step costs in all. */
function nextTrialBill(b: BizState, d: Drug): number {
  const step = trialStep(d)
  return step ? trialCost(b, d) * step.years : 0
}

/**
 * License or keep, by the game's own numbers: keeping is worth the drug's odds of approval (as the
 * valuation counts them) times what an approved drug earns, minus every trial still to pay for;
 * licensing is the upfront plus 15% royalties on the same odds. A company that can't pay for its
 * next trial has to license.
 */
export function licenseBest(b: BizState, t: TechState, d: Drug, upfront: number): 'accept' | 'keep' {
  if (techFunds(b, t) < nextTrialBill(b, d)) return 'accept'
  const odds = clampN(APPROVAL_ODDS[Math.max(0, Math.min(4, d.phase))] * (0.75 + d.quality / 200), 0, 1)
  const value = d.peak * unitRevenue(b) * DRUG_VALUE_YEARS
  let remaining = 0
  for (let ph = Math.max(0, d.phase); ph < TRIALS.length; ph++) remaining += TRIALS[ph].cost * TRIALS[ph].years * rdScale(b.countryId)
  const keep = odds * value - remaining
  const license = upfront + odds * value * 0.15
  return license >= keep ? 'accept' : 'keep'
}

/** Odds lobbyists save an EV subsidy. */
function lobbyOdds(b: BizState): number {
  return clampN(0.5 - marketOf(b.countryId).corruption / 400, 0, 1)
}

/** Lobby or cut prices, by this year's sales: a 7% price cut keeps 97% of buyers (about 90% of sales). */
function subsidyBest(b: BizState, lobby: number): 'lobby' | 'cut' {
  const sales = Math.max(0, b.last?.revenue ?? 0)
  const p = lobbyOdds(b)
  const lobbied = sales * (p * 1.05 + (1 - p) * 0.85) - lobby
  return lobbied > sales * 0.93 * 0.97 ? 'lobby' : 'cut'
}

/** Odds an anchor customer gives in when you hold out for full price. */
function holdOdds(t: TechState): number {
  return t.stage >= 3 ? 0.9 : 0.5
}

/** Odds a government bid wins: low bids win more often (for 80% of the money). */
function bidOdds(b: BizState, t: TechState, choice: 'low' | 'fair'): number {
  const cleared = b.industry !== 'cybersecurity' || t.stage >= 3
  return clampN((choice === 'low' ? 0.65 : 0.45) + t.level / 300 + (t.stage >= 3 ? 0.1 : 0) - (cleared ? 0 : 0.35) - marketOf(b.countryId).corruption / 400, 0.05, 0.9)
}

/** The bid with the best expected contract value (both cost the same 3% to prepare). */
function bestBid(b: BizState, t: TechState): 'low' | 'fair' {
  return bidOdds(b, t, 'fair') >= bidOdds(b, t, 'low') * 0.8 ? 'fair' : 'low'
}

function bidHint(b: BizState, t: TechState): string {
  const best = bestBid(b, t)
  const odds = Math.round(bidOdds(b, t, best) * 100)
  return best === 'fair' ? `Bid fair: your record wins it about ${odds}% of the time without a discount, the best expected deal.` : `Bid low: it wins about ${odds}% of the time, and a likely contract at 80% beats a long shot at full price.`
}

/** Bid on a government contract: low bids win more often for less money. */
function govBid(x: Ctx, choice: string, what: string): void {
  if (choice === 'skip') return
  const per = num(x.d.per)
  const agency = str(x.d.agency, 'The government')
  const bidCost = Math.round(per * 0.03)
  payTech(x.b, x.t, bidCost)
  const odds = bidOdds(x.b, x.t, choice === 'low' ? 'low' : 'fair')
  if (chance(x.g, odds)) {
    const perYear = Math.round(per * (choice === 'low' ? 0.8 : 1))
    x.t.contract = { name: `${what} for ${agency.replace(/^the /, '')}`, perYear, years: 3 }
    x.t.hype = clampN(x.t.hype + 8, 0, 100)
    log(x.g, `${x.a.name} won a government contract.`, 'good')
    tell(x.g, 'Contract Won!', `${agency.charAt(0).toUpperCase()}${agency.slice(1)} picked ${x.a.name}: about ${formatMoney(perYear)} a year for three years.`, '\u{1F3C6}', 'good')
  } else {
    tell(x.g, 'Contract Lost', `The contract went to an older, bigger, more boring company. Your bid team spent ${formatMoney(bidCost)} on the proposal.`, '\u{1F4C4}', 'bad')
  }
}

/** Maybe queue a deep-tech event popup; true when one was queued. */
export function maybeDeepTechEventImpl(g: GameState, a: Asset, b: BizState, year: number, managed: boolean): boolean {
  if (g.character.prison || !g.character.alive) return false
  if (b.founded >= year) return false
  if (b.lastEvent >= year - 1 && !chance(g, 0.3)) return false
  if (!chance(g, managed ? 0.2 : 0.38)) return false
  const t = techOf(b)
  const list = EVENTS.filter((e) => e.weight(g, a, b, t) > 0)
  if (list.length === 0) return false
  const ev = weightedPick(g, list, (e) => e.weight(g, a, b, t))
  const before = g.queue.length
  b.lastEvent = year
  ev.present({ g, a, b, t, d: {} })
  return g.queue.length > before
}

/** Every event id, for tests. */
export const DEEP_TECH_EVENT_IDS = EVENTS.map((e) => e.id)

/** Present one event now (menu actions, tests); false when it doesn't apply. */
export function presentDeepTechEvent(g: GameState, a: Asset, id: string, extra: Record<string, Json> = {}): boolean {
  const ev = EVENTS.find((e) => e.id === id)
  if (!ev) return false
  const b = bizOf(g, a)
  const t = techOf(b)
  if (ev.weight(g, a, b, t) <= 0) return false
  const before = g.queue.length
  ev.present({ g, a, b, t, d: extra })
  return g.queue.length > before
}

/** Weight of an event right now (0 = it can't happen), for menus that offer it on demand. */
export function deepTechEventOpen(g: GameState, a: Asset, b: BizState, t: TechState, id: string): boolean {
  const ev = EVENTS.find((e) => e.id === id)
  return !!ev && ev.weight(g, a, b, t) > 0
}

export { EVENT as DEEP_TECH_EVENT_SCRIPT }
