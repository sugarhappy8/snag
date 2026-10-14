// Management actions on an owned business: marketing, products, quality, expansion, money,
// leadership and the exits. Each action re-reads the business from state when it runs.
import { addHidden, addMoney, addStat, earnIncome, formatCents, formatMoney, log, moneyWith, notice, scriptChoice, shortMoney, useYearAction, yearActionsUsed } from '../core'
import { arrestPlayer } from '../crime'
import { venueOwnerMenu } from './venues'
import { isVenue } from './venues-data'
import { industryDemand, isIndustryLegal, marketOf } from '../data/markets'
import { chance, rand } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent, talentHint } from '../talents'
import type { TechId } from '../history/timeline'
import type { Asset, ChoiceOption, GameState, Json, MenuAction, MenuGroup, MenuNode } from '../types'
import { COUNTRIES, getCountry } from '../world'
import { askingSalary, baseManagerValue, becomeCeo, ceoPayNorm, ceoSeverance, ceoValue, handOver, headhunterFee, managerName, maxOwnerSalary, optimizerGain, ownerTakesOver, shortlist, SMART_SKILL, STYLE_INFO, styleOf, type SearchKind } from './career'
import {
  bestPlan,
  bizWorth,
  ceoSkill,
  citySaturation,
  densityRent,
  equipmentValue,
  fxValue,
  insurancePremiumFor,
  LASTING_YEARS,
  LINE_RENT,
  lineCost,
  linesOf,
  localEcon,
  marketCtxFor,
  maxProduction,
  planFor,
  productsPullOf,
  priceBounds,
  refreshValue,
  startupCost,
  valuationOf,
  type Worth,
} from './economy'
import { eventChance } from './events'
import { canIpo, closeBusiness, declareBankruptcy, goPublic, IPO_COLLAPSE, ipoPreview, sellBusiness, sellShares } from './exit'
import { FLOAT_DEFAULT, FLOAT_MAX, FLOAT_MIN, shareCountText } from './share-structure'
import { nationalStrategyMenu } from './expansion'
import { equityMenu, equityTerms, seatOf } from './executive'
import { settleAfterCeoChange } from './executive-shares'
import { conglomerate, investorFirm, localSport } from './flavor'
import { deepTechInfo, deepTechNodes, isDeepTech } from './deeptech'
import { DEVS_PER_OFFICE, earmarkedCash, isStudio, studioInfo, studioNodes } from './gamestudio'
import { financeInfo, financeNodes, isFinanceFirm } from './finance-firm'
import { bankPayoutBlock } from './bank'
import { rescueNodes, rescuePosition } from './rescue'
import { SHARE_SALES_PER_YEAR, shareSaleKey } from './own-trade'
import { techView } from './deeptech-core'
import { maxPrograms } from './deeptech-rd'
import { bizHas, eraNote } from './era'
import { boardAllows, boardNodes, hasBoard, needsVote, passOdds, vote, type Proposal } from './board'
import { nepoNodes } from './nepo'
import { settleReplacedCeo } from './nepo-actions'
import { afterSuccession, familyCandidates } from './nepo-succession'
import { briefNodes, capexCaption, passHint, payDividend } from './board-menu'
import { dividendMenu } from './dividend-menu'
import { controlsBoard, boardView, mandateDef, ownerSeats } from './board-state'
import { debtComfort, lowerFirst, oddsText, payableCash, payCap, payoutCash, refusedThisYear, sustainablePayout } from './board-vote'
import { manageBlock, noCash, tooBusy } from './gate'
import { staffMenu } from './staff'
import { marketInfoLine, marketMenu } from './competition-menu'
import { adultBrandName } from './competition'
import { marketKey, type MarketCtx } from './competition-core'
import { industryDef, lineOf } from './industries'
import { supplyInventoryValue } from './supply'
import { equipmentUpgradeCost, purchaseEquipmentUpgrade, purchaseTraining, repeatProgramGain, staffTrainingCost, supplyPolicyNodes } from './supply-policy'
import { economicReportMenu } from './economic-report'
import { complexityShare, productIdeas } from './products'
import { bestRdBudget, bestRdIdea, ordinaryProjects, pullValue, rdBlock, rdCrowding, rdProjects, rdQuote, rdRange, rdReserve, rdSlots, rdValue, rememberRetired, retireLines, retireOrder, startRd } from './rd'
import { heavyBlock, heavyCost, heavyEligible, heavyGain, heavyLead, heavyOdds, heavyOf, heavyOffers, heavyYears, startHeavy } from './heavy-rd'
import type { Breakthrough } from './heavy-data'
import { readMarketNews } from '../history/market-events'
import { fieldFor, kindTrend, lineInfo, productPull, type Field, type LinePull, type ProductPull } from './product-market'
import { demandTrend } from './product-data'
import { bizOf, CEO_STYLES, ceoJob, findBusiness, readBiz, runsIt, stakeValue, totalOutlets, type BizState, type Manager, type Supplier } from './state'
import { divisionExitNodes, divisionLine, groupOfCompany } from './conglomerate-division'
import { companyCreditLimit, companyLoanRate, queueReport } from './yearly'
import { clampN, industryNoun, labelPlural, markBest, money, num, pct, plural, priceCapOf, rec, str, toJson, units } from './util'
import { climateLine, dashboardRows } from './dashboard'
import { franchiseMenu } from './franchise'
import { milestonesMenu } from './milestones'
import { tidyNationalStrategy } from './national-view'

type Run = (g: GameState, a: Asset, b: BizState, input?: string) => void

/** A management action that re-reads the live business before running. */
function act(a: Asset, key: string, label: string, emoji: string, opts: {
  subtitle?: string | ((g: GameState) => string)
  hint?: (g: GameState) => string | null
  disabled?: (g: GameState, b: BizState) => string | null
  confirm?: (g: GameState) => string | null
  input?: MenuAction['input']
  run: Run
}): MenuAction {
  return {
    type: 'action',
    id: `biz.${key}.${a.id}`,
    label,
    emoji,
    subtitle: opts.subtitle,
    ...(opts.hint ? { hint: opts.hint } : {}),
    disabledReason: (g) => {
      const block = manageBlock(g, a)
      if (block) return block
      return opts.disabled ? opts.disabled(g, readBiz(g, a)) : null
    },
    confirm: opts.confirm,
    input: opts.input,
    run: (g, input) => {
      const cur = findBusiness(g, a.id)
      if (!cur || manageBlock(g, cur)) return
      const b = bizOf(g, cur)
      if (opts.disabled?.(g, b)) return
      opts.run(g, cur, b, input)
    },
  }
}

function amount(input: string | undefined, max: number): number {
  const n = Math.round(Number(String(input ?? '').replace(/[^0-9.]/g, '')))
  return Number.isFinite(n) ? clampN(n, 0, Math.max(0, max)) : 0
}

// ---------------------------------------------------------------------------
// The Business talent's company-screen hints. Menus re-render often and the what-ifs run the
// planner, so results are cached per company state (never stored in the game state).

const hintCache = new Map<string, unknown>()

function cachedHint<T>(g: GameState, a: Asset, what: string, make: () => T): T {
  const c = g.character
  const key = `${what}|${g.lifeId}|${c.id}|${a.id}|${g.year}|${c.stats.smarts}|${c.hidden.discipline}|${c.education.degrees.length}|${c.conditions.length}|${c.licenses.length}|${c.prison ? 1 : 0}|${JSON.stringify(a.details)}`
  if (hintCache.has(key)) return hintCache.get(key) as T
  const v = make()
  hintCache.set(key, v)
  // Room for a whole Locations screen of what-ifs (payback per city, best counts) per company.
  if (hintCache.size > 256) {
    const first = hintCache.keys().next().value
    if (first !== undefined) hintCache.delete(first)
  }
  return v
}

/** The live asset behind a menu row (menus are built from a snapshot). */
function live(g: GameState, a: Asset): Asset {
  return findBusiness(g, a.id) ?? a
}

/** Hints only for the talented, and only for companies the player can manage right now. */
function hinting(g: GameState, a: Asset): boolean {
  return hasTalent(g, 'Business') && !manageBlock(g, a)
}

/**
 * Companies the price-and-production planner models (economy.bestPlan). Game studios live on
 * launches and deep-tech companies on their own tech-driven planner, so the planner-based hints
 * (budget, plan, expansion) would mislead there; their own screens carry their hints.
 */
function priceAndOutput(b: BizState): boolean {
  return !isStudio(b) && !isDeepTech(b) && !isFinanceFirm(b)
}

/** A permanent shift in brand or quality targets, counted as the points it builds over a few years. */
const TARGET_SHARE = 0.5

/** Ad and campaign prices scale with the local media market and the size of the company. */
function adCost(b: BizState, usBase: number): number {
  const e = localEcon(b.industry, b.countryId, b.city)
  const size = Math.sqrt(Math.max(1, totalOutlets(b)))
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  return Math.round(Math.max(usBase * clampN(e.level, 0.2, 2) * size, revenue * 0.004 * (usBase / 10_000)))
}

// ---------------------------------------------------------------------------
// Marketing

interface Campaign {
  id: string
  /** The campaign's name in this company's country and year (no social media in 1950). */
  label: (g: GameState, b: BizState) => string
  emoji: (g: GameState, b: BizState) => string
  /** First-person log line: 'ran newspaper ads for'. */
  did: (g: GameState, b: BizState) => string
  base: number
  boost: number
  brand: number
}

/** Era checks for the company's own country. */
const has = (g: GameState, b: BizState, tech: TechId) => bizHas(g, b.countryId, tech)

// The same six slots in every era (same costs and odds, so the talent's numbers hold); only what
// they're called and how they're done follows the year: newspaper ads before web banners before
// social media, cinema ads before television, a celebrity endorsement before influencers.
const CAMPAIGNS: Campaign[] = [
  {
    id: 'social',
    label: (g, b) => (has(g, b, 'socialMedia') ? 'Social Media Blitz' : has(g, b, 'internet') ? 'Web Banner Ads' : 'Newspaper Ads'),
    emoji: (g, b) => (has(g, b, 'socialMedia') ? '\u{1F4F1}' : has(g, b, 'internet') ? '\u{1F5B1}\u{FE0F}' : '\u{1F4F0}'),
    did: (g, b) => (has(g, b, 'socialMedia') ? 'ran a social media blitz for' : has(g, b, 'internet') ? 'bought web banner ads for' : 'took out newspaper ads for'),
    base: 4_000,
    boost: 0.05,
    brand: 3,
  },
  {
    id: 'radio',
    label: (g, b) => (has(g, b, 'radio') ? 'Radio Spots' : 'Posters & Handbills'),
    emoji: (g, b) => (has(g, b, 'radio') ? '\u{1F4FB}' : '\u{1F4C3}'),
    did: (g, b) => (has(g, b, 'radio') ? 'bought radio spots for' : 'plastered the town with posters for'),
    base: 12_000,
    boost: 0.05,
    brand: 3,
  },
  { id: 'billboards', label: () => 'Billboards', emoji: () => '\u{1FAA7}', did: () => 'put up billboards for', base: 22_000, boost: 0.07, brand: 4 },
  {
    id: 'influencers',
    label: (g, b) => (has(g, b, 'smartphone') ? 'Influencer Campaign' : 'Celebrity Endorsement'),
    emoji: (g, b) => (has(g, b, 'smartphone') ? '\u{1F933}' : '\u{1F31F}'),
    did: (g, b) => (has(g, b, 'smartphone') ? 'paid influencers to post about' : 'signed a celebrity to endorse'),
    base: 18_000,
    boost: 0.08,
    brand: 5,
  },
  {
    id: 'tv',
    label: (g, b) => (has(g, b, 'tv') ? 'TV Commercial' : 'Cinema Advertisement'),
    emoji: (g, b) => (has(g, b, 'tv') ? '\u{1F4FA}' : '\u{1F39E}\u{FE0F}'),
    did: (g, b) => (has(g, b, 'tv') ? 'ran a TV commercial for' : 'ran an advertisement in the cinemas for'),
    base: 110_000,
    boost: 0.13,
    brand: 8,
  },
  {
    id: 'sponsor',
    label: (_g, b) => `Sponsor the Local ${localSport(b.countryId).replace(/\b\w/g, (x) => x.toUpperCase())}`,
    emoji: () => '\u{1F3DF}\u{FE0F}',
    did: (_g, b) => `sponsored the local ${localSport(b.countryId)} for`,
    base: 60_000,
    boost: 0.06,
    brand: 10,
  },
]

const CAMPAIGN_TEXT: Record<string, (g: GameState, b: BizState, name: string) => string> = {
  social: (g, b, n) =>
    has(g, b, 'socialMedia') ? `${n}'s posts got shared, stitched and meme'd.` : has(g, b, 'internet') ? `${n}'s banner ads blinked away on every website people in ${b.city} actually visit.` : `${n}'s ads ran in every newspaper in ${b.city}, right next to the crossword.`,
  radio: (g, b, n) => (has(g, b, 'radio') ? `${n}'s jingle is now stuck in every commuter's head. Sorry, commuters.` : `${n}'s posters went up on every wall and lamppost in ${b.city}, and boys handed out handbills on every corner.`),
  billboards: (_g, _b, n) => `${n}'s billboards went up along the busiest roads in town.`,
  influencers: (g, b, n) => (has(g, b, 'smartphone') ? `A dozen influencers unboxed, tasted or reviewed ${n} with suspicious enthusiasm.` : `A famous face now smiles out of ${n}'s ads, swearing by it with suspicious enthusiasm.`),
  tv: (g, b, n) => (has(g, b, 'tv') ? `${n}'s commercial aired in prime time. Your mom called to say she saw it.` : `${n}'s advertisement played before every picture at the local cinema. Your mom went twice to see it.`),
  sponsor: (_g, _b, n) => `${n}'s logo is on the jerseys now. The fans chant your name. Well, the team's.`,
}

function campaignAction(a: Asset, c: Campaign, b0: BizState, g0: GameState): MenuAction {
  return act(a, `campaign.${c.id}`, c.label(g0, b0), c.emoji(g0, b0), {
    hint: (g) => {
      if (!hinting(g, live(g, a))) return null
      const best = bestCampaign(g, live(g, a))
      return best && best.id === c.id ? talentHint(g, 'Business', `Best campaign right now: about ${money(best.value)} back on top of its cost`) : null
    },
    subtitle: (g) => `${money(adCost(readBiz(g, a), c.base))} · +${Math.round(c.boost * 100)}% customers this year`,
    run: (g, cur, b) => {
      const cost = adCost(b, c.base)
      if (b.cash < cost) return noCash(g, cur, cost, 'the campaign')
      if (!useYearAction(g, `biz.campaign.${cur.id}`, 2)) return tooBusy(g, 'run two campaigns for this company')
      b.cash -= cost
      b.yearCosts += cost
      if (c.id === 'influencers' && chance(g, INFLUENCER_FAIL)) {
        b.brand = clampN(b.brand - 6, 0, 100)
        if (has(g, b, 'smartphone')) notice(g, 'Influencer Fail', `One of your influencers posted the ad with the brief still in the caption ("say it's life-changing lol"). The internet noticed. Brand down to ${b.brand}%.`, { emoji: '\u{1F926}', tone: 'bad' })
        else notice(g, 'Endorsement Fail', `Your celebrity was photographed happily using a rival's product the week your ads came out. The papers loved it. Brand down to ${b.brand}%.`, { emoji: '\u{1F926}', tone: 'bad' })
        return
      }
      const viral = c.id === 'social' && chance(g, VIRAL_P)
      const boost = c.boost * (0.8 + rand(g) * 0.4) * (viral ? 2.5 : 1)
      b.campaignBoost = clampN(b.campaignBoost + boost, 0, 0.6)
      b.brand = clampN(b.brand + c.brand + (viral ? 6 : 0), 0, 100)
      log(g, `I ${c.did(g, b)} ${cur.name}.`)
      const hit = has(g, b, 'internet') ? 'Gone Viral!' : 'Talk of the Town!'
      notice(g, viral ? hit : 'Campaign Launched', `${CAMPAIGN_TEXT[c.id]?.(g, b, cur.name) ?? ''} Cost: ${formatMoney(cost)}. Expect about ${Math.round(boost * 100)}% more customers this year; brand is up to ${b.brand}%.`, {
        emoji: c.emoji(g, b),
        tone: 'good',
      })
    },
  })
}

/** Chance a social blitz goes viral (2.5x the boost, +6 brand) or influencers botch it (-6 brand). */
const VIRAL_P = 0.12
const INFLUENCER_FAIL = 0.12

/** Expected value of a campaign this year: customers it brings, brand it builds, minus its price. */
function campaignValue(g: GameState, b: BizState, w: Worth, c: Campaign): number {
  const cost = adCost(b, c.base)
  const viral = c.id === 'social' ? VIRAL_P : 0
  const fail = c.id === 'influencers' ? INFLUENCER_FAIL : 0
  const room = Math.max(0, 0.6 - b.campaignBoost)
  const boost = Math.min(room, c.boost * (1 + viral * 1.5))
  const brand = fxValue(g, b, w, { brand: c.brand + viral * 6 })
  return (1 - fail) * (boost * w.contrib + brand) + fail * fxValue(g, b, w, { brand: -6 }) - cost
}

function bestCampaign(g: GameState, a: Asset): { id: string; value: number } | null {
  return cachedHint(g, a, 'campaign', () => {
    const b = readBiz(g, a)
    const w = bizWorth(g, b)
    let best: { id: string; value: number } | null = null
    for (const c of CAMPAIGNS) {
      const value = campaignValue(g, b, w, c)
      if (value > 0 && (!best || value > best.value)) best = { id: c.id, value }
    }
    return best
  })
}

/** Marketing budgets the Business talent compares (multiples of the industry's normal spend). */
const BUDGET_LEVELS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]

/** Next year's expected profit at each marketing budget, plus the brand each builds for later. */
function budgetValues(g: GameState, a: Asset): Record<string, number> {
  return cachedHint(g, a, 'budget', () => {
    const b = readBiz(g, a)
    const w = bizWorth(g, b)
    const out: Record<string, number> = {}
    for (const level of [...new Set([...BUDGET_LEVELS, b.marketingLevel])]) {
      const p = bestPlan(g, { ...b, marketingLevel: level }, { fast: true })
      out[String(level)] = p.profit + (level - b.marketingLevel) * 8 * w.brand * TARGET_SHARE
    }
    return out
  })
}

function bestBudget(g: GameState, a: Asset): { level: number; gain: number } {
  const v = budgetValues(g, a)
  const cur = readBiz(g, a).marketingLevel
  let level = cur
  for (const x of BUDGET_LEVELS) if ((v[String(x)] ?? -Infinity) > (v[String(level)] ?? -Infinity) + 1) level = x
  return { level, gain: (v[String(level)] ?? 0) - (v[String(cur)] ?? v[String(level)] ?? 0) }
}

/** The live caption under the marketing budget slider (percent of a normal spend). */
function budgetPreview(g: GameState, a: Asset, pctOfNormal: number): string {
  const b = readBiz(g, live(g, a))
  const def = industryDef(b.industry)
  const level = clampN(pctOfNormal / 100, 0, 3)
  const revenue = Math.max(0, b.last?.revenue ?? 0)
  const spend = revenue * def.marketingShare * level
  return `${Math.round(level * 100)}% of a normal spend (${budgetLabel(level).toLowerCase()}) · ${pct(def.marketingShare * level, 1)} of sales${revenue > 0 ? ` · about ${money(spend)} a year at last year's sales` : ''}${level > b.marketingLevel ? ' · builds the brand' : level < b.marketingLevel ? ' · the brand will drift down' : ''}`
}

const BUDGETS: { level: number; label: string }[] = [
  { level: 0, label: 'None' },
  { level: 0.5, label: 'Light' },
  { level: 1, label: 'Normal' },
  { level: 2, label: 'Heavy' },
  { level: 3, label: 'Aggressive' },
]

function budgetLabel(level: number): string {
  let best = BUDGETS[2]
  for (const x of BUDGETS) if (Math.abs(x.level - level) < Math.abs(best.level - level)) best = x
  return best.label
}

function marketingMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.marketing.${a.id}`,
    label: 'Marketing',
    emoji: '\u{1F4E3}',
    subtitle: (g) => `${budgetLabel(readBiz(g, a).marketingLevel)} budget · brand ${readBiz(g, a).brand}%`,
    disabledReason: (g) => manageBlock(g, a),
    hint: (g) => {
      const cur = live(g, a)
      if (!hinting(g, cur) || !priceAndOutput(readBiz(g, cur))) return null
      const best = bestBudget(g, cur)
      if (best.level === readBiz(g, cur).marketingLevel || best.gain < 500) return talentHint(g, 'Business', 'Your marketing budget is about right')
      return talentHint(g, 'Business', `Switch to a ${budgetLabel(best.level).toLowerCase()} budget: about ${money(best.gain)} better a year`)
    },
    header: (g) => {
      const b = readBiz(g, a)
      const def = industryDef(b.industry)
      return `Ongoing marketing: ${budgetLabel(b.marketingLevel).toLowerCase()} (${pct(def.marketingShare * b.marketingLevel, 1)} of sales). Campaigns give this year's sales a push and build the brand; prices follow ${getCountry(b.countryId).name}'s media market.`
    },
    children: (g) => {
      const b = readBiz(g, a)
      const def = industryDef(b.industry)
      const nodes: MenuNode[] = [{ type: 'heading', id: `biz.campH.${a.id}`, label: 'Campaigns (2 a year)' }]
      for (const c of CAMPAIGNS) nodes.push(campaignAction(a, c, b, g))
      nodes.push({ type: 'heading', id: `biz.budgetH.${a.id}`, label: 'Yearly budget' })
      nodes.push(
        act(a, 'budget', 'Set the Yearly Budget', b.marketingLevel <= 0 ? '\u{1F507}' : b.marketingLevel >= 2 ? '\u{1F4E2}' : '\u{1F509}', {
          subtitle: `${budgetLabel(b.marketingLevel)} (${Math.round(b.marketingLevel * 100)}% of a normal spend) · ${pct(def.marketingShare * b.marketingLevel, 1)} of sales`,
          hint: (gg) => {
            const cur = live(gg, a)
            if (!hinting(gg, cur) || !priceAndOutput(readBiz(gg, cur))) return null
            const best = bestBudget(gg, cur)
            const now = readBiz(gg, cur).marketingLevel
            if (Math.abs(best.level - now) < 0.01 || best.gain < 500) return talentHint(gg, 'Business', 'Best budget: keep it about here')
            return talentHint(gg, 'Business', `Best budget: about ${Math.round(best.level * 100)}% of a normal spend (${budgetLabel(best.level).toLowerCase()}), about ${money(best.gain)} more profit a year, brand included`)
          },
          input: {
            kind: 'slider',
            label: 'Marketing budget (% of a normal spend)',
            unit: '%',
            min: 0,
            max: 300,
            step: 5,
            defaultValue: () => String(Math.round(b.marketingLevel * 100)),
            preview: (gg, v) => budgetPreview(gg, a, v),
          },
          run: (gg, cur, bb, input) => {
            const level = Math.round(clampN(Number(input), 0, 300) / 5) * 0.05
            bb.marketingLevel = clampN(Math.round(level * 100) / 100, 0, 3)
            notice(gg, 'Marketing Budget', `${cur.name} will now spend ${pct(def.marketingShare * bb.marketingLevel, 1)} of its sales on marketing (${budgetLabel(bb.marketingLevel).toLowerCase()}).`, { emoji: '\u{1F4E3}' })
          },
        }),
      )
      return nodes
    },
  }
}

// ---------------------------------------------------------------------------
// Products

/** Chance a project at a normal budget works (business/rd.ts). */
export { launchP } from './rd'

/** Lines shown one by one in the products menu; the rest are summarized. */
const TOP_LINES = 6
/** Ideas on the drawing board at a time (launch one and the next appears). */
const IDEAS_SHOWN = 5

function yearsWord(n: number): string {
  return n <= 1 ? 'about a year' : `about ${n} years`
}

/** 'growing ▲', 'steady', 'fading ▼': where a kind of product's demand is heading. */
function trendWord(t: -1 | 0 | 1): string {
  return t > 0 ? 'demand growing \u{25B2}' : t < 0 ? 'demand fading \u{25BC}' : 'demand steady'
}

/** '9%', '<1%': a share of the company's customers. */
function customersPct(x: number): string {
  return x > 0 && x < 0.005 ? '<1%' : pct(Math.max(0, x))
}

/** The rivals' side of a kind of product, for a subtitle: "rivals' 61" or 'no rival sells one yet'. */
function rivalsWord(offer: number, quality: number): string {
  return offer > 0.02 ? `rivals' ${Math.round(quality)}` : 'no rival sells one yet'
}

/** The range in the company's market this year (cached per company state; pure). */
function rangeOf(g: GameState, a: Asset): { pull: ProductPull; key: string } {
  return cachedHint(g, a, 'range', () => {
    const b = readBiz(g, a)
    const ctx = marketCtxFor(g, b, g.year)
    return { pull: productsPullOf(g, b, g.year, ctx), key: ctx.key }
  })
}

/** The live caption under an R&D budget slider (pure). */
function rdPreview(g: GameState, a: Asset, idea: string, budget: number): string {
  const cur = live(g, a)
  const b = readBiz(g, cur)
  const q = rdQuote(g, b, idea, budget)
  const total = rangeOf(g, cur).pull.total
  const parts = [`${money(budget)}`, `ready in ${yearsWord(q.years)}`, `${Math.round(q.odds * 100)}% odds`, `quality ~${q.quality} vs ${rivalsWord(q.offer, q.field)}`]
  if (q.lift > 0) parts.push(`about +${customersPct(q.lift / (1 + total))} customers at launch`)
  if (rdCrowding(b) > 1) parts.push(`the team is stretched: ${plural(ordinaryProjects(b).length, 'project')} already running`)
  if (budget > b.cash) parts.push(`${money(budget - Math.max(0, b.cash))} more than the company has`)
  return parts.join(' · ') + capexCaption(g, cur, b, budget, Math.max(0, (rdValue(g, b, idea, budget).value + budget) / 5))
}

/** The Business talent's best budget for one idea (cached per company state). */
function bestBudgetFor(g: GameState, a: Asset, idea: string): ReturnType<typeof bestRdBudget> {
  return cachedHint(g, a, `rdBudget.${idea}`, () => bestRdBudget(g, readBiz(g, a), idea))
}

function ideaAction(a: Asset, b0: BizState, idea: string, ctxKey: string, field: Field): MenuAction {
  const range = rdRange(b0, idea)
  const info = lineInfo(idea, b0.industry)
  const f = field.of(info.family)
  return act(a, `launch.${idea}`, idea, '\u{1F9EA}', {
    hint: (gg) => {
      const cur = live(gg, a)
      if (!hinting(gg, cur)) return null
      const best = bestBudgetFor(gg, cur, idea)
      return talentHint(gg, 'Business', best ? `Best R&D budget: about ${money(best.budget)} (${Math.round(best.odds * 100)}% odds, quality ~${best.quality}, worth about ${money(best.value)} on average)` : 'Not worth it now: no budget would earn back its cost while leaving the company a cash cushion')
    },
    subtitle: `Costs ~${shortMoney(range.normal)} to develop · ${trendWord(demandTrend(info.family, ctxKey, field.year))} · ${rivalsWord(f.offer, f.quality)}`,
    disabled: (_g, bb) => (bb.cash < range.min ? `Needs at least ${money(range.min)} of company cash (${money(range.min - Math.max(0, bb.cash))} short).` : null),
    input: {
      kind: 'slider',
      money: true,
      label: `R&D budget for ${idea}`,
      min: range.min,
      max: range.max,
      roundDefault: true,
      defaultValue: () => String(range.normal),
      preview: (gg, v) => rdPreview(gg, a, idea, v),
    },
    run: (gg, cur, bb, input) => {
      const r = rdRange(bb, idea)
      const budget = Math.round(clampN(Number(input) || r.normal, r.min, r.max))
      // Past this year's capital budget, a company with a board votes on it first (business/board.ts).
      if (rdBlock(bb, idea, budget) === null && bb.cash >= budget) {
        const v = rdValue(gg, bb, idea, budget)
        if (!boardAllows(gg, cur, bb, { kind: 'capex', by: 'owner', amount: budget, gain: Math.max(0, (v.value + budget) / 5), label: `Fund R&D on ${idea} (${money(budget)})` })) return
      }
      startRd(gg, cur, bb, idea, budget)
    },
  })
}

/**
 * The biggest named rivals whose version of a kind is worse than `quality`: the ones losing
 * customers to your line (product-market.ts applyProductRivalry). Pure.
 */
function beaten(g: GameState, b: BizState, ctx: MarketCtx, family: string, quality: number, n = 2): string[] {
  const versions = fieldFor(ctx).versions(family)
  return ctx.rivals
    .map((r, i) => ({ r, i, v: versions[i] ?? -1 }))
    .filter((x) => x.v >= 0 && x.v < quality && x.r.pull > 0 && !x.r.legacy)
    .sort((x, y) => y.r.pull - x.r.pull)
    .slice(0, n)
    .map((x) => adultBrandName(g, b, x.r.name, x.r.real, x.i))
}

/** One line on sale: its quality against the rivals' versions, its demand, its customers and whose it wins. */
function lineSubtitle(l: LinePull, total: number, trend: -1 | 0 | 1, beats: string[], from?: string, lead?: number): string {
  // A breakthrough nobody else sells yet: when the first rival can have its own (heavy-rd.ts heavyLead).
  const vs = l.offer > 0.02 ? ` vs rivals' ${Math.round(l.field)}` : lead !== undefined ? ` · no rival sells one · rivals can have their own from about ${lead}` : ' · no rival sells one'
  // Neutral wording: real companies only ever lose customers, never get called worse.
  const wins = beats.length ? ` · wins customers from ${beats.join(' and ')}` : ''
  return `Quality ${Math.round(l.effective)}${vs} · ${trendWord(trend)} · ${customersPct(l.lift / (1 + total))} of your customers${wins}${from ? ` · came with ${from}` : ''} · tap to retire`
}

/** When the first rival can have its own of a breakthrough on sale here (undefined: not a recorded breakthrough, or that time has passed). */
function leadOf(family: string, field: Field, year: number): number | undefined {
  const rec = field.heavy.find((r) => r.family === family)
  if (!rec) return undefined
  const lead = heavyLead(rec)
  return lead >= year ? lead : undefined
}

/** One breakthrough row: what it costs, how long, the odds, and when rivals could follow. */
function heavyAction(a: Asset, x: Breakthrough): MenuAction {
  const quote = (g: GameState) => {
    const b = readBiz(g, live(g, a))
    const years = heavyYears(b)
    return { cost: heavyCost(g, b) ?? 0, years, odds: Math.round(heavyOdds(g, b) * 100), lead: heavyLead({ year: g.year + years, years }) }
  }
  return act(a, `heavy.${x.name}`, x.name, '\u{1F52C}', {
    subtitle: (g) => {
      const q = quote(g)
      return `${money(q.cost)} · ${q.years} years · ${q.odds}% odds · rivals could follow about ${q.lead}`
    },
    confirm: (g) => {
      const q = quote(g)
      return `Start ${x.name}? It costs ${money(q.cost)}, takes ${q.years} years and has about ${q.odds}% odds of working. If it flops, the money is gone.`
    },
    disabled: (g, bb) => heavyBlock(g, bb, x.name, a.id),
    run: (gg, cur, bb) => {
      // Past this year's capital budget, a company with a board votes on it first, as for any R&D (business/board.ts).
      const cost = heavyCost(gg, bb)
      if (cost !== null && heavyBlock(gg, bb, x.name, a.id) === null) {
        if (!boardAllows(gg, cur, bb, { kind: 'capex', by: 'owner', amount: cost, gain: heavyGain(gg, bb, x.name), label: `Fund Heavy R&D on ${x.name} (${money(cost)})` })) return
      }
      startHeavy(gg, cur, bb, x.name)
    },
  })
}

/** The Heavy R&D part of the Products screen: the trade's latest news, then one row per breakthrough on offer. */
function heavyNodes(a: Asset, g: GameState, b: BizState): MenuNode[] {
  if (!heavyEligible(b)) return []
  const nodes: MenuNode[] = [{ type: 'heading', id: `biz.heavyH.${a.id}`, label: 'Heavy R&D' }]
  nodes.push({ type: 'info', id: `biz.heavyInfo.${a.id}`, emoji: '\u{1F52C}', text: 'A breakthrough costs far more than a normal line and often fails. If it works, the whole trade gets more customers, and rivals need as long as you did to catch up.' })
  const market = marketKey(b)
  readMarketNews(g)
    .filter((n) => n.industry === b.industry && n.market === market)
    .slice(-3)
    .reverse()
    .forEach((n, i) => nodes.push({ type: 'info', id: `biz.heavyNews.${a.id}.${i}`, emoji: n.emoji, text: `${n.title} (${n.year})` }))
  const offers = heavyOffers(g, b, a.id)
  if (!offers.length) nodes.push({ type: 'info', id: `biz.heavyNone.${a.id}`, text: 'No breakthrough on the drawing board that the world is ready for yet.', emoji: '\u{1F4AD}' })
  for (const x of offers) nodes.push(heavyAction(a, x))
  return nodes
}

function productsMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.products.${a.id}`,
    label: 'Products',
    emoji: '\u{1F9EA}',
    subtitle: (g) => {
      const b = readBiz(g, a)
      const n = b.products.length
      const dev = rdProjects(b).length
      const parts = [n ? plural(n, 'product line') : 'No lines yet']
      if (dev) parts.push(`${dev} in development`)
      return parts.join(' · ')
    },
    disabledReason: (g) => manageBlock(g, a),
    hint: (g) => {
      const cur = live(g, a)
      if (!hinting(g, cur)) return null
      const b = readBiz(g, cur)
      const trim = linesToRetire(g, b)
      if (trim > 0) return talentHint(g, 'Business', `Retire your ${trim === 1 ? 'weakest line' : `${trim} weakest lines`}: they cost more to run than they sell`)
      const best = cachedHint(g, cur, 'rdIdea', () => bestRdIdea(g, b, productIdeas(g, b, IDEAS_SHOWN), Math.max(0, b.cash - rdReserve(b))))
      return talentHint(g, 'Business', best ? `Develop ${best.idea}: about ${money(best.budget)} is the best budget (${Math.round(best.quote.odds * 100)}% odds, worth ${money(best.value)} on average)` : 'Hold off on R&D: no new line would earn back its cost, or the company needs its cash cushion')
    },
    header: (g) => {
      const b = readBiz(g, a)
      const share = complexityShare(b.products.length)
      return [
        `${b.products.length ? `${plural(b.products.length, 'line')} on sale.` : 'No product lines on sale yet.'} Each competes with the rivals' versions of it: the better yours, the more of their customers switch to you, and a kind of product few rivals sell yet pulls extra.`,
        'Every kind of product has its own demand from real history (growing, steady or fading). Different kinds add up; variants of one kind share its customers. Rivals improve their versions every year, so lines age.',
        `${share > 0 ? `Running this range costs about ${pct(share, 1)} of sales a year` : 'A big range costs money to run'} (packaging, stock, shelf space); more lines cost more each.`,
        `Every idea has its own development cost; fund it at half to four times that. Your team runs ${plural(rdSlots(b), 'project')} at once without strain.`,
      ].join('\n')
    },
    children: (g) => {
      const cur = live(g, a)
      const b = readBiz(g, cur)
      const nodes: MenuNode[] = []
      const ctx = marketCtxFor(g, b, g.year)
      const field = fieldFor(ctx)
      if (b.products.length) {
        const pull = productsPullOf(g, b, g.year, ctx)
        nodes.push({ type: 'heading', id: `biz.prodH.${a.id}`, label: `On sale (${b.products.length})` })
        const byName = new Map(pull.lines.map((l) => [l.name, l]))
        const top = [...b.products].sort((x, y) => (byName.get(y.name)?.lift ?? 0) - (byName.get(x.name)?.lift ?? 0) || y.launched - x.launched).slice(0, TOP_LINES)
        for (const p of top) {
          const l = byName.get(p.name)
          nodes.push(
            act(a, `retire.${p.name}`, p.name, '\u{1F4E6}', {
              subtitle: l ? lineSubtitle(l, pull.total, kindTrend(l.family, ctx.key, g.year, field.heavy), beaten(g, b, ctx, l.family, l.effective), p.from, leadOf(l.family, field, g.year)) : `Launched ${p.launched} · not selling here · tap to retire`,
              confirm: () => `Retire the ${p.name} line?`,
              run: (gg, c2, bb) => {
                // Only a line that is still on sale is retired: R&D never offers it again.
                const onSale = bb.products.some((x) => x.name === p.name)
                bb.products = bb.products.filter((x) => x.name !== p.name)
                if (onSale) rememberRetired(bb, [p.name])
                notice(gg, 'Line Retired', `${c2.name} discontinued ${p.name}. A few loyal fans are writing angry letters.`, { emoji: '\u{1F4E6}' })
              },
            }),
          )
        }
        if (b.products.length > top.length) nodes.push({ type: 'info', id: `biz.prodMore.${a.id}`, text: `…and ${plural(b.products.length - top.length, 'more line')}. The weakest: ${retireOrder(b, g.year, field.heavy)[0]?.name ?? '-'}.`, emoji: '\u{1F4DA}' })
        nodes.push(retireAction(a, b))
      }
      const dev = rdProjects(b)
      if (dev.length) {
        nodes.push({ type: 'heading', id: `biz.devH.${a.id}`, label: `In development (${dev.length})` })
        for (const p of dev.slice(0, TOP_LINES)) {
          const left = Math.max(0, p.years - p.progress)
          const quality = typeof p.quality === 'number' ? ` · quality ~${Math.round(p.quality)}` : ''
          nodes.push({ type: 'info', id: `biz.dev.${a.id}.${p.id}`, emoji: '\u{1F52C}', text: `${p.name}: ${left <= 1 ? 'ready at year-end' : `${left} years to go`} · ${Math.round(p.odds * 100)}% odds${quality} · ${money(p.budget)} budget${p.heavy === true ? ' · Heavy R&D' : ''}` })
        }
        if (dev.length > TOP_LINES) nodes.push({ type: 'info', id: `biz.devMore.${a.id}`, emoji: '\u{1F52C}', text: `…and ${plural(dev.length - TOP_LINES, 'more project')}.` })
      }
      nodes.push(...heavyNodes(a, g, b))
      nodes.push({ type: 'heading', id: `biz.launchH.${a.id}`, label: 'Develop a new product' })
      // An endless stream the year allows (no fitness app before smartphones, no web shop before the web).
      const ideas = productIdeas(g, b, IDEAS_SHOWN)
      if (!ideas.length) nodes.push({ type: 'info', id: `biz.launchNone.${a.id}`, text: 'Nothing new on the drawing board that the world is ready for yet.', emoji: '\u{1F4AD}' })
      for (const idea of ideas) nodes.push(ideaAction(a, b, idea, ctx.key, field))
      return nodes
    },
  }
}

/**
 * How many of the weakest lines cost more to keep than they bring in (the complexity they add
 * against the customers they still win), for the Business talent. Pure.
 */
function linesToRetire(g: GameState, b: BizState): number {
  if (b.products.length < 2 || !priceAndOutput(b)) return 0
  const w = bizWorth(g, b)
  const ctx = marketCtxFor(g, b, g.year)
  const field = fieldFor(ctx)
  const order = retireOrder(b, g.year, field.heavy)
  let keep = [...b.products]
  let n = 0
  for (const p of order) {
    const without = keep.filter((x) => x !== p)
    const lost = pullValue(ctx, b, w, productPull(b.industry, without, g.year, field).total, productPull(b.industry, keep, g.year, field).total)
    const saved = (complexityShare(keep.length) - complexityShare(without.length)) * Math.max(0, w.revenue)
    if (saved <= lost) break
    keep = without
    n += 1
  }
  return n
}

function retireAction(a: Asset, b0: BizState): MenuAction {
  const max = Math.max(1, b0.products.length)
  return act(a, 'retireMany', 'Retire Weak Lines', '\u{1F5D1}\u{FE0F}', {
    subtitle: 'The weakest go first (outdated, or in a kind nobody wants any more)',
    hint: (gg) => {
      const cur = live(gg, a)
      if (!hinting(gg, cur)) return null
      const n = linesToRetire(gg, readBiz(gg, cur))
      return n > 0 ? talentHint(gg, 'Business', `Retire ${plural(n, 'line')}: ${n === 1 ? 'it costs' : 'they cost'} more to run than ${n === 1 ? 'it sells' : 'they sell'}`) : null
    },
    input: {
      kind: 'slider',
      label: 'How many lines to retire?',
      min: 1,
      max,
      defaultValue: () => '1',
      preview: (gg, v) => {
        const b = readBiz(gg, live(gg, a))
        const n = Math.max(0, Math.min(b.products.length, Math.round(v)))
        const gone = retireOrder(b, gg.year, heavyOf(gg, b)).slice(0, n)
        const saved = complexityShare(b.products.length) - complexityShare(b.products.length - n)
        const names = gone.slice(0, 3).map((p) => p.name).join(', ')
        return `${names}${n > 3 ? ` and ${n - 3} more` : ''} · saves about ${pct(saved, 1)} of sales in running costs`
      },
    },
    run: (gg, cur, bb, input) => {
      const n = Math.round(clampN(Number(input) || 1, 1, bb.products.length))
      const gone = retireLines(bb, n, gg.year, heavyOf(gg, bb))
      if (!gone.length) return
      log(gg, `${cur.name} retired ${plural(gone.length, 'product line')}.`)
      notice(gg, 'Lines Retired', `${cur.name} discontinued ${gone.slice(0, 4).join(', ')}${gone.length > 4 ? ` and ${gone.length - 4} more` : ''}. The warehouse has room again, and a few loyal fans are writing angry letters.`, { emoji: '\u{1F5D1}\u{FE0F}' })
    },
  })
}

// ---------------------------------------------------------------------------
// Quality

const SUPPLIERS: { id: Supplier; label: string; note: string }[] = [
  { id: 'budget', label: 'Budget suppliers', note: '14% cheaper inputs, quality drifts down' },
  { id: 'standard', label: 'Standard suppliers', note: 'What most businesses use' },
  { id: 'premium', label: 'Premium suppliers', note: '18% dearer inputs, quality drifts up' },
]

const SUPPLIER_COST: Record<Supplier, number> = { budget: 0.86, standard: 1, premium: 1.18 }
const SUPPLIER_QUALITY: Record<Supplier, number> = { budget: -12, standard: 0, premium: 12 }

/** ...and gets less out of it (diminishing returns). */
function repeatGain(k: number): number {
  return repeatProgramGain(k)
}

function upgradeCost(b: BizState, k: number): number {
  return equipmentUpgradeCost(b, k)
}

function trainingCost(b: BizState, k: number): number {
  return staffTrainingCost(b, k)
}

/** What switching supplier is worth over a few years: cheaper inputs against where quality settles. */
function supplierValue(b: BizState, w: Worth, s: Supplier): number {
  const costs = (1 - SUPPLIER_COST[s] / SUPPLIER_COST[b.supplier]) * w.cogs * LASTING_YEARS
  return costs + (SUPPLIER_QUALITY[s] - SUPPLIER_QUALITY[b.supplier]) * w.quality * TARGET_SHARE
}

function qualityMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.quality.${a.id}`,
    label: 'Quality',
    emoji: '\u{2728}',
    subtitle: (g) => `Quality ${readBiz(g, a).quality}% · ${readBiz(g, a).supplier} suppliers`,
    disabledReason: (g) => manageBlock(g, a),
    header: () => 'Better quality lets you charge more and keeps customers coming back. It drifts toward what your suppliers, staff and morale can sustain.',
    children: (g) => {
      const b = readBiz(g, a)
      const ups = yearActionsUsed(g, `biz.upgrade.${a.id}`)
      const trains = yearActionsUsed(g, `biz.training.${a.id}`)
      const upgrade = upgradeCost(b, ups)
      const training = trainingCost(b, trains)
      const worth = (gg: GameState, fx: Parameters<typeof fxValue>[3]) => {
        const bb = readBiz(gg, live(gg, a))
        return fxValue(gg, bb, bizWorth(gg, bb), fx)
      }
      const worthIt = (gg: GameState, v: number) => talentHint(gg, 'Business', `Quality-only estimate: ${v > 0 ? `about ${money(v)} more than it costs` : 'the quality gain alone does not cover the cost'}. This excludes durable workforce resilience.`)
      let bestSupplier: Supplier | null = null
      if (hinting(g, a)) {
        const w = bizWorth(g, b)
        let top = 0
        bestSupplier = b.supplier
        for (const s of SUPPLIERS) {
          const v = supplierValue(b, w, s.id)
          if (v > top + 1) {
            top = v
            bestSupplier = s.id
          }
        }
      }
      const nodes: MenuNode[] = [
        act(a, 'upgrade', 'Upgrade Equipment', '\u{1F6E0}\u{FE0F}', {
          hint: (gg) => (hinting(gg, live(gg, a)) ? worthIt(gg, worth(gg, { cash: -upgrade, quality: 8.5 * repeatGain(ups) })) : null),
          subtitle: `About ${money(upgrade)}${ups > 0 ? ` · upgrade ${ups + 1} this year: dearer, smaller gains` : ''}`,
          run: (gg, cur, bb) => {
            const k = yearActionsUsed(gg, `biz.upgrade.${cur.id}`)
            const cost = upgradeCost(bb, k)
            if (bb.cash < cost) return noCash(gg, cur, cost, 'new equipment')
            if (!purchaseEquipmentUpgrade(gg, cur, bb)) return
            notice(gg, 'Upgraded', `New equipment at ${cur.name} (${formatMoney(cost)}). Quality is up to ${bb.quality}%; bounded automation reduces future labor bottlenecks, not missing materials.${k > 0 ? ' Each extra upgrade this year buys a little less.' : ''}`, { emoji: '\u{1F6E0}\u{FE0F}', tone: 'good' })
          },
        }),
        act(a, 'training', 'Staff Training Program', '\u{1F393}', {
          hint: (gg) => (hinting(gg, live(gg, a)) ? worthIt(gg, worth(gg, { cash: -training, quality: 4.5 * repeatGain(trains), morale: 3.5 * repeatGain(trains) })) : null),
          subtitle: `About ${money(training)}${trains > 0 ? ` · program ${trains + 1} this year: dearer, smaller gains` : ''}`,
          run: (gg, cur, bb) => {
            const k = yearActionsUsed(gg, `biz.training.${cur.id}`)
            const cost = trainingCost(bb, k)
            if (bb.cash < cost) return noCash(gg, cur, cost, 'the training')
            if (!purchaseTraining(gg, cur, bb)) return
            notice(gg, 'Training Done', `Everyone at ${cur.name} completed a training program (${formatMoney(cost)}). Quality ${bb.quality}%, morale ${bb.morale}%. Durable qualifications help fill skill gaps, but cannot create workers or materials.${k > 0 ? ' The staff are starting to recognize the slides.' : ''}`, { emoji: '\u{1F393}', tone: 'good' })
          },
        }),
        { type: 'heading', id: `biz.supH.${a.id}`, label: 'Supplier contract' },
      ]
      for (const s of SUPPLIERS) {
        nodes.push(
          act(a, `supplier.${s.id}`, `${s.label}${b.supplier === s.id ? ' (current)' : ''}`, s.id === 'premium' ? '\u{1F48E}' : s.id === 'budget' ? '\u{1F4E6}' : '\u{1F69A}', {
            hint: (gg) => (bestSupplier === s.id ? talentHint(gg, 'Business', b.supplier === s.id ? 'Best supplier for you: stay with them' : 'Best supplier for you: the savings and quality balance out in your favor') : null),
            subtitle: s.note,
            run: (gg, cur, bb) => {
              bb.supplier = s.id
              notice(gg, 'New Supplier Contract', `${cur.name} now buys from ${s.label.toLowerCase()}: ${s.note.toLowerCase()}.`, { emoji: '\u{1F4DD}' })
            },
          }),
        )
      }
      nodes.push(...supplyPolicyNodes(g, a))
      return nodes
    },
  }
}

// ---------------------------------------------------------------------------
// Expansion

/** Cost to open `n` more outlets in a city (capital + local registration where it's a new country). */
export function expansionCost(b: BizState, countryId: string, city: string, n: number): number {
  const cost = startupCost(b.industry, countryId, city)
  const newCountry = !b.outlets.some((o) => o.countryId === countryId)
  return Math.round(cost.capital * n + (newCountry ? cost.fee + cost.permits : Math.round(cost.fee * 0.2)))
}

/** Most outlets one purchase can open (repeat it as often as the cash allows). */
const MAX_OPEN_AT_ONCE = 100_000

/** Most outlets the company's cash pays for in a city right now (fees included). */
export function maxAffordable(b: BizState, countryId: string, city: string): number {
  const each = startupCost(b.industry, countryId, city).capital
  if (!(each > 0)) return 0
  const n = Math.floor((Math.max(0, b.cash) - expansionCost(b, countryId, city, 0)) / each)
  return Math.round(clampN(n, 0, MAX_OPEN_AT_ONCE))
}

/** The company with `n` more outlets in a city (a copy for what-ifs). */
function withOutlets(b: BizState, countryId: string, city: string, n: number, year: number): BizState {
  const outlets = b.outlets.some((o) => o.countryId === countryId && o.city === city)
    ? b.outlets.map((o) => (o.countryId === countryId && o.city === city ? { ...o, count: o.count + n } : o))
    : [...b.outlets, { countryId, city, count: n, opened: year }]
  return { ...b, outlets: outlets.filter((o) => o.count > 0) }
}

/** Next year's expected profit change from `n` more outlets in a city (the planner, no RNG). */
function expansionGain(g: GameState, a: Asset, countryId: string, city: string, n: number): number {
  return cachedHint(g, a, `gain.${countryId}.${city}.${n}`, () => {
    const b = readBiz(g, a)
    if (!isIndustryLegal(countryId, b.industry, g)) return -Infinity
    const base = cachedHint(g, a, 'payback.base', () => bestPlan(g, b, { fast: true }).profit)
    return bestPlan(g, withOutlets(b, countryId, city, n, g.year), { fast: true }).profit - base
  })
}

/** Years `n` more locations in a city take to pay for themselves (Infinity: never), from the planner. */
function payback(g: GameState, a: Asset, countryId: string, city: string, n = 1): number {
  const gain = expansionGain(g, a, countryId, city, n)
  return gain > 0 ? expansionCost(readBiz(g, a), countryId, city, n) / gain : Infinity
}

/** Years a marginal outlet must pay back within to be worth opening (the best-count hint). */
const MARGIN_YEARS = 5

/** Counts the best-count search tries (then the affordable maximum). */
const COUNT_GRID = [1, 2, 3, 5, 8, 12, 20, 30, 50, 80, 120, 200, 300, 500, 800, 1_200, 2_000, 3_000, 5_000, 8_000, 12_000, 20_000]

/**
 * The number of new outlets in a city that adds the most value (profit over MARGIN_YEARS minus
 * what they cost), among those the company can pay for. Null when even one wouldn't pay.
 */
function bestCount(g: GameState, a: Asset, countryId: string, city: string): { n: number; years: number } | null {
  return cachedHint(g, a, `bestCount.${countryId}.${city}`, () => {
    const b = readBiz(g, a)
    const max = Math.max(1, maxAffordable(b, countryId, city))
    const tries = [...new Set([...COUNT_GRID.filter((n) => n <= max), max])]
    let best: { n: number; years: number; value: number } | null = null
    for (const n of tries) {
      const gain = expansionGain(g, a, countryId, city, n)
      const cost = expansionCost(b, countryId, city, n)
      const value = gain * MARGIN_YEARS - cost
      if (gain > 0 && value > 0 && (!best || value > best.value)) best = { n, years: cost / gain, value }
    }
    return best ? { n: best.n, years: best.years } : null
  })
}

/** The live caption under the "how many outlets" slider (pure: the planner never rolls dice). */
function openPreview(g: GameState, a: Asset, countryId: string, city: string, n: number): string {
  const cur = live(g, a)
  const b = readBiz(g, cur)
  const def = industryDef(b.industry)
  const k = Math.max(1, Math.round(n))
  const e = localEcon(b.industry, countryId, city)
  const here = b.outlets.find((o) => o.countryId === countryId && o.city === city)?.count ?? 0
  const cs = citySaturation(e, countryId, city)
  const rent = (here + k) * e.rent * densityRent(here + k, cs) - here * e.rent * densityRent(here, cs)
  const parts = [`${plural(k, def.site, def.sitePlural)}: ${money(expansionCost(b, countryId, city, k))} up front`, `rent about ${money(rent)} a year`]
  if (priceAndOutput(b)) {
    const years = payback(g, cur, countryId, city, k)
    parts.push(Number.isFinite(years) ? `pays back in ${yearsText(years)}` : here + k > cs ? 'would lose money: the market there can’t take that many' : 'would lose money there')
  } else if (isStudio(b)) {
    parts.push(`desks for ${plural(k * DEVS_PER_OFFICE, 'more developer')}`)
  } else if (isDeepTech(b)) {
    parts.push(`room for ${plural(maxPrograms(withOutlets(b, countryId, city, k, g.year), techView(b)), 'R&D program')} at once`)
  }
  if (here + k > cs) parts.push(`${city} is crowded: each one sells less and rents climb`)
  return parts.join(' · ') + capexCaption(g, cur, b, expansionCost(b, countryId, city, k), priceAndOutput(b) ? expansionGain(g, cur, countryId, city, k) : 0)
}

/** Most years a new location may take to pay back and still be worth suggesting. */
const PAYBACK_MAX = 8

function yearsText(y: number): string {
  return y < 1.5 ? 'about a year' : `about ${Math.round(y)} years`
}

/** The home city where another location pays back fastest. */
function bestHomeCity(g: GameState, a: Asset): { city: string; years: number } | null {
  const b = readBiz(g, a)
  let best: { city: string; years: number } | null = null
  for (const city of getCountry(b.countryId).cities.slice(0, 10)) {
    const years = payback(g, a, b.countryId, city)
    if (years <= PAYBACK_MAX && (!best || years < best.years)) best = { city, years }
  }
  return best
}

function openAction(a: Asset, b0: BizState, countryId: string, city: string): MenuAction {
  const def0 = industryDef(b0.industry)
  const max = Math.max(1, maxAffordable(b0, countryId, city))
  return act(a, `open.${countryId}.${city}`, city, '\u{1F4CD}', {
    hint: (g) => {
      const cur = live(g, a)
      if (!hinting(g, cur) || !priceAndOutput(readBiz(g, cur))) return null
      const b = readBiz(g, cur)
      if (countryId === b.countryId) {
        const best = bestHomeCity(g, cur)
        if (!best || best.city !== city) return null
        const many = bestCount(g, cur, countryId, city)
        if (many && many.n > 1) return talentHint(g, 'Business', `Best place to expand: about ${plural(many.n, `new ${def0.site}`, `new ${def0.sitePlural}`)} here pay for themselves in ${yearsText(many.years)}`)
        return talentHint(g, 'Business', `Best place to expand: a new location here pays for itself in ${yearsText(best.years)}`)
      }
      const years = payback(g, cur, countryId, city)
      return years <= PAYBACK_MAX ? talentHint(g, 'Business', `Pays for itself in ${yearsText(years)}`) : null
    },
    subtitle: (g) => {
      const b = readBiz(g, a)
      const here = b.outlets.find((o) => o.countryId === countryId && o.city === city)?.count ?? 0
      return `${money(expansionCost(b, countryId, city, 1))} each${here ? ` · ${units(here)} here now` : ''}`
    },
    disabled: (gg, b) => (maxAffordable(b, countryId, city) < 1 && isIndustryLegal(countryId, b.industry, gg) ? `Not enough company cash: one new ${industryDef(b.industry).site} here costs ${money(expansionCost(b, countryId, city, 1))}.` : null),
    input: {
      kind: 'slider',
      label: `How many new ${def0.sitePlural} in ${city}?`,
      min: 1,
      max,
      defaultValue: () => '1',
      preview: (g, v) => openPreview(g, a, countryId, city, v),
    },
    run: (g, cur, b, input) => {
      const n = Math.round(clampN(Number(input) || 1, 1, MAX_OPEN_AT_ONCE))
      if (!isIndustryLegal(countryId, b.industry, g)) {
        notice(g, 'Not Allowed', `${labelPlural(industryDef(b.industry).label)} aren't allowed in ${getCountry(countryId).name}.`, { emoji: '\u{26D4}' })
        return
      }
      const cost = expansionCost(b, countryId, city, n)
      if (b.cash < cost) return noCash(g, cur, cost, `${plural(n, 'new location')}`)
      const gain = expansionGain(g, cur, countryId, city, n)
      if (!boardAllows(g, cur, b, { kind: 'capex', by: 'owner', amount: cost, gain: Number.isFinite(gain) ? Math.max(0, gain) : 0, label: `Open ${plural(n, `new ${industryDef(b.industry).site}`, `new ${industryDef(b.industry).sitePlural}`)} in ${city} for ${money(cost)}` })) return
      b.cash -= cost
      const existing = b.outlets.find((o) => o.countryId === countryId && o.city === city)
      if (existing) existing.count += n
      else b.outlets.push({ countryId, city, count: n, opened: g.year })
      b.production = Math.min(maxProduction(g, b), Math.round(b.production + planFor(g, b, g.year, { calm: true }).demand * (n / Math.max(1, totalOutlets(b)))))
      b.valuation = valuationOf(b)
      refreshValue(cur, b)
      const def = industryDef(b.industry)
      const abroad = countryId !== b.countryId
      log(g, `${cur.name} opened ${plural(n, `new ${def.site}`, `new ${def.sitePlural}`)} in ${city}${abroad ? `, ${getCountry(countryId).name}` : ''}.`, 'good')
      const m = marketOf(countryId)
      notice(
        g,
        'Grand Opening!',
        `${cur.name} opened ${plural(n, `new ${def.site}`, `new ${def.sitePlural}`)} in ${city} for ${formatMoney(cost)}.${abroad ? ` Operating in ${getCountry(countryId).name} means local wages, rents, ${m.salesTaxName} (${Math.round(m.salesTax * 100)}%) and corporate tax (${Math.round(m.corporateTax * 100)}%).` : ''} Production plans were raised to match.`,
        { emoji: '\u{1F38A}', tone: 'good' },
      )
    },
  })
}

function citiesMenu(a: Asset, countryId: string, label: string): MenuGroup {
  const country = getCountry(countryId)
  return {
    type: 'menu',
    id: `biz.expandIn.${a.id}.${countryId}`,
    label,
    emoji: country.flag,
    subtitle: (g) => {
      const b = readBiz(g, a)
      if (!isIndustryLegal(countryId, b.industry, g)) return 'Not allowed there'
      const d = industryDemand(countryId, b.industry)
      return `Demand ${d >= 1.3 ? 'high' : d <= 0.7 ? 'low' : 'normal'} · tax ${Math.round(marketOf(countryId).corporateTax * 100)}%`
    },
    disabledReason: (g) => {
      const b = readBiz(g, a)
      return isIndustryLegal(countryId, b.industry, g) ? null : `${labelPlural(industryDef(b.industry).label)} are not allowed in ${country.name}. ${eraNote(g, countryId, marketOf(countryId).businessNote)}`.trim()
    },
    header: (g) => eraNote(g, countryId, marketOf(countryId).businessNote),
    hint: (g) => {
      const cur = live(g, a)
      if (!hinting(g, cur) || !priceAndOutput(readBiz(g, cur))) return null
      const best = bestAbroad(g, cur)
      return best && best.countryId === countryId ? talentHint(g, 'Business', `Best market abroad: a location in ${best.city} pays for itself in ${yearsText(best.years)}`) : null
    },
    children: (g) => {
      const b = readBiz(g, a)
      return country.cities.slice(0, 8).map((city) => openAction(a, b, countryId, city))
    },
  }
}

/** The foreign markets worth a look (the same list Expand Abroad shows). */
function abroadCountries(b: BizState): string[] {
  return COUNTRIES.filter((c) => c.id !== b.countryId)
    .map((c) => {
      const e = localEcon(b.industry, c.id, c.cities[0] ?? '')
      return { c, score: e.demandMult * e.income * Math.sqrt(Math.max(0.3, marketOf(c.id).populationM)) * (0.5 + marketOf(c.id).easeOfBusiness / 100) }
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 14)
    .map((x) => x.c.id)
}

/** The foreign capital where a first location pays back fastest. */
function bestAbroad(g: GameState, a: Asset): { countryId: string; city: string; years: number } | null {
  const b = readBiz(g, a)
  let best: { countryId: string; city: string; years: number } | null = null
  for (const cid of abroadCountries(b)) {
    const city = getCountry(cid).cities[0]
    if (!city) continue
    const years = payback(g, a, cid, city)
    if (years <= PAYBACK_MAX && (!best || years < best.years)) best = { countryId: cid, city, years }
  }
  return best
}

function abroadMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.abroad.${a.id}`,
    label: 'Expand Abroad',
    emoji: '\u{1F30D}',
    subtitle: 'Each country is its own market',
    disabledReason: (g) => {
      const block = manageBlock(g, a)
      if (block) return block
      return totalOutlets(readBiz(g, a)) < 2 ? 'Get a second location at home first.' : null
    },
    header: () => 'Best markets for your industry, by local demand and spending power. Opening in a new country means registering there too.',
    children: (g) => {
      const b = readBiz(g, a)
      const scored = COUNTRIES.filter((c) => c.id !== b.countryId)
        .map((c) => {
          const e = localEcon(b.industry, c.id, c.cities[0] ?? '')
          return { c, score: e.demandMult * e.income * Math.sqrt(Math.max(0.3, marketOf(c.id).populationM)) * (0.5 + marketOf(c.id).easeOfBusiness / 100) }
        })
        .filter((x) => x.score > 0)
        .sort((x, y) => y.score - x.score)
        .slice(0, 14)
      const present = new Set(b.outlets.map((o) => o.countryId))
      const list = [...COUNTRIES.filter((c) => present.has(c.id) && c.id !== b.countryId), ...scored.map((x) => x.c).filter((c) => !present.has(c.id))]
      return list.map((c) => citiesMenu(a, c.id, c.name))
    },
  }
}

function closeOutletAction(a: Asset, b0: BizState, countryId: string, city: string): MenuAction {
  const here0 = b0.outlets.find((x) => x.countryId === countryId && x.city === city)?.count ?? 0
  const max = Math.max(1, Math.min(here0, totalOutlets(b0) - 1))
  return act(a, `closeOutlet.${countryId}.${city}`, `Close in ${city}`, '\u{1F6AB}', {
    subtitle: (g) => {
      const o = readBiz(g, a).outlets.find((x) => x.countryId === countryId && x.city === city)
      return `${units(o?.count ?? 0)} here · sell off the fit-out for about 35% of cost`
    },
    disabled: (_g, b) => (totalOutlets(b) <= 1 ? 'This is your last location. Close the whole business instead.' : null),
    input: {
      kind: 'slider',
      label: `How many to close in ${city}?`,
      min: 1,
      max,
      defaultValue: () => '1',
      preview: (g, v) => {
        const b = readBiz(g, live(g, a))
        const o = b.outlets.find((x) => x.countryId === countryId && x.city === city)
        if (!o) return ''
        const n = Math.round(clampN(v, 1, Math.max(1, Math.min(o.count, totalOutlets(b) - 1))))
        const e = localEcon(b.industry, countryId, city)
        const cs = citySaturation(e, countryId, city)
        const rent = o.count * e.rent * densityRent(o.count, cs) - (o.count - n) * e.rent * densityRent(o.count - n, cs)
        const parts = [`fit-out sells for about ${money(e.capital * n * 0.35)}`, `saves about ${money(rent)} a year in rent`]
        if (priceAndOutput(b)) {
          const kept = withOutlets(b, countryId, city, -n, g.year)
          const change = cachedHint(g, live(g, a), `close.${countryId}.${city}.${n}`, () => bestPlan(g, kept, { fast: true }).profit - bestPlan(g, b, { fast: true }).profit)
          parts.push(change >= 0 ? `profit up about ${money(change)} a year` : `profit down about ${money(-change)} a year`)
        }
        return parts.join(' · ')
      },
    },
    run: (g, cur, b, input) => {
      const o = b.outlets.find((x) => x.countryId === countryId && x.city === city)
      if (!o) return
      const n = Math.round(clampN(Number(input) || 1, 1, Math.min(o.count, totalOutlets(b) - 1)))
      if (n <= 0) return
      const refund = Math.round(localEcon(b.industry, countryId, city).capital * n * 0.35)
      o.count -= n
      b.outlets = b.outlets.filter((x) => x.count > 0)
      b.cash += refund
      b.morale = clampN(b.morale - 6, 0, 100)
      b.production = Math.min(b.production, maxProduction(g, b))
      b.valuation = valuationOf(b)
      refreshValue(cur, b)
      log(g, `${cur.name} closed ${plural(n, 'location')} in ${city}.`, 'neutral')
      notice(g, 'Closed', `${cur.name} shut ${plural(n, 'location')} in ${city} and sold the fit-out for ${formatMoney(refund)}. The remaining staff are nervously updating their résumés.`, { emoji: '\u{1F6AB}' })
    },
  })
}

// ---------------------------------------------------------------------------
// Capacity lines (industries that make goods): more output without another storefront

/** Most capacity lines company cash pays for now. */
function maxLines(b: BizState): number {
  const each = lineCost(b, 1)
  return each > 0 ? Math.round(clampN(Math.floor(Math.max(0, b.cash) / each), 0, MAX_OPEN_AT_ONCE)) : 0
}

/** Next year's expected profit change from `n` more capacity lines (negative n: selling them). */
function linesGain(g: GameState, a: Asset, n: number): number {
  return cachedHint(g, a, `lines.${n}`, () => {
    const b = readBiz(g, a)
    const base = cachedHint(g, a, 'payback.base', () => bestPlan(g, b, { fast: true }).profit)
    return bestPlan(g, { ...b, lines: Math.max(0, linesOf(b) + n) }, { fast: true }).profit - base
  })
}

/** The number of new lines that adds the most value over MARGIN_YEARS (null: none pays). */
function bestLines(g: GameState, a: Asset): { n: number; years: number } | null {
  return cachedHint(g, a, 'bestLines', () => {
    const b = readBiz(g, a)
    const max = Math.max(1, maxLines(b))
    let best: { n: number; years: number; value: number } | null = null
    for (const n of [...new Set([...COUNT_GRID.filter((x) => x <= max), max])]) {
      const gain = linesGain(g, a, n)
      const cost = lineCost(b, n)
      const value = gain * MARGIN_YEARS - cost
      if (gain > 0 && value > 0 && (!best || value > best.value)) best = { n, years: cost / gain, value }
    }
    return best ? { n: best.n, years: best.years } : null
  })
}

function buildLinesAction(a: Asset, b0: BizState): MenuAction {
  const line = lineOf(b0.industry) ?? { one: 'production line', many: 'production lines' }
  const max = Math.max(1, maxLines(b0))
  return act(a, 'lines', `Build ${titleCase(line.many)}`, '\u{1F3ED}', {
    subtitle: (g) => `${money(lineCost(readBiz(g, a), 1))} each · each adds half a ${industryDef(b0.industry).site}'s output, no new customers`,
    hint: (g) => {
      const cur = live(g, a)
      if (!hinting(g, cur) || !priceAndOutput(readBiz(g, cur))) return null
      const best = bestLines(g, cur)
      if (best) return talentHint(g, 'Business', `Build about ${plural(best.n, line.one, line.many)}: they pay for themselves in ${yearsText(best.years)}`)
      const plan = planFor(g, readBiz(g, cur), g.year, { calm: true })
      return talentHint(g, 'Business', plan.demand <= plan.capacity ? 'Not needed: you can already make everything you can sell' : 'Not worth it: the extra output wouldn’t earn back what the lines cost')
    },
    disabled: (_g, b) => (maxLines(b) < 1 ? `Not enough company cash: one ${line.one} costs ${money(lineCost(b, 1))}.` : null),
    input: {
      kind: 'slider',
      label: `How many ${line.many}?`,
      min: 1,
      max,
      defaultValue: () => '1',
      preview: (g, v) => {
        const cur = live(g, a)
        const b = readBiz(g, cur)
        const def = industryDef(b.industry)
        const n = Math.max(1, Math.round(v))
        const plan = planFor(g, b, g.year, { calm: true })
        const add = planFor(g, { ...b, lines: linesOf(b) + n }, g.year, { calm: true }).capacity - plan.capacity
        const upkeep = lineCost(b, n) * def.maint + n * localEcon(b.industry, b.countryId, b.city).rent * LINE_RENT
        const gain = linesGain(g, cur, n)
        return [
          `+${units(add)} ${def.unit} a year (capacity now ${units(plan.capacity)}, demand about ${units(plan.demand)})`,
          `${money(lineCost(b, n))} up front, about ${money(upkeep)} a year to run`,
          gain > 0 ? `pays back in ${yearsText(lineCost(b, n) / gain)}` : plan.demand <= plan.capacity ? 'would sit idle: you can already make what you sell' : 'would lose money: the extra output doesn’t cover what the lines cost',
        ].join(' · ') + capexCaption(g, cur, b, lineCost(b, n), gain)
      },
    },
    run: (g, cur, b, input) => {
      const n = Math.round(clampN(Number(input) || 1, 1, MAX_OPEN_AT_ONCE))
      const cost = lineCost(b, n)
      if (b.cash < cost) return noCash(g, cur, cost, plural(n, line.one, line.many))
      const gain = linesGain(g, cur, n)
      if (!boardAllows(g, cur, b, { kind: 'capex', by: 'owner', amount: cost, gain: Number.isFinite(gain) ? Math.max(0, gain) : 0, label: `Build ${plural(n, line.one, line.many)} for ${money(cost)}` })) return
      b.cash -= cost
      b.lines = linesOf(b) + n
      b.valuation = valuationOf(b)
      refreshValue(cur, b)
      log(g, `${cur.name} built ${plural(n, line.one, line.many)}.`, 'good')
      notice(g, 'Capacity Added', `${cur.name} built ${plural(n, `new ${line.one}`, `new ${line.many}`)} for ${formatMoney(cost)}. You can now make up to ${units(maxProduction(g, b))} ${industryDef(b.industry).unit} a year: raise production in the Annual Report to use it.`, { emoji: '\u{1F3ED}', tone: 'good' })
    },
  })
}

function sellLinesAction(a: Asset, b0: BizState): MenuAction {
  const line = lineOf(b0.industry) ?? { one: 'production line', many: 'production lines' }
  const max = Math.max(1, linesOf(b0))
  return act(a, 'sellLines', `Sell ${titleCase(line.many)}`, '\u{1F4E4}', {
    subtitle: 'The equipment sells for about 35% of its cost',
    disabled: (_g, b) => (linesOf(b) < 1 ? `You have no ${line.many} to sell.` : null),
    input: {
      kind: 'slider',
      label: `How many ${line.many} to sell?`,
      min: 1,
      max,
      defaultValue: () => '1',
      preview: (g, v) => {
        const cur = live(g, a)
        const b = readBiz(g, cur)
        const n = Math.round(clampN(v, 1, Math.max(1, linesOf(b))))
        const change = linesGain(g, cur, -n)
        return `sells for about ${money(lineCost(b, n) * 0.35)} · ${change >= 0 ? `profit up about ${money(change)} a year` : `profit down about ${money(-change)} a year`}`
      },
    },
    run: (g, cur, b, input) => {
      const n = Math.round(clampN(Number(input) || 1, 1, linesOf(b)))
      if (n < 1) return
      const refund = Math.round(lineCost(b, n) * 0.35)
      b.lines = linesOf(b) - n
      b.cash += refund
      b.production = Math.min(b.production, maxProduction(g, b))
      b.valuation = valuationOf(b)
      refreshValue(cur, b)
      log(g, `${cur.name} sold ${plural(n, line.one, line.many)}.`, 'neutral')
      notice(g, 'Equipment Sold', `${cur.name} sold ${plural(n, line.one, line.many)} for ${formatMoney(refund)}.`, { emoji: '\u{1F4E4}' })
    },
  })
}

function expansionMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.expand.${a.id}`,
    label: 'Locations',
    emoji: '\u{1F5FA}\u{FE0F}',
    subtitle: (g) => {
      const b = readBiz(g, a)
      const def = industryDef(b.industry)
      return plural(totalOutlets(b), def.site, def.sitePlural)
    },
    disabledReason: (g) => manageBlock(g, a),
    hint: (g) => {
      const cur = live(g, a)
      if (!hinting(g, cur) || !priceAndOutput(readBiz(g, cur))) return null
      const best = bestHomeCity(g, cur)
      return talentHint(g, 'Business', best ? `Expanding pays: a new location in ${best.city} earns its cost back in ${yearsText(best.years)}` : `Don't expand at home yet: a new location wouldn't pay for itself within ${PAYBACK_MAX} years`)
    },
    header: (g) => {
      const b = readBiz(g, a)
      const def = industryDef(b.industry)
      const lines = b.outlets.map((o) => `${o.count} × ${o.city}, ${getCountry(o.countryId).name}`)
      return `${cap(def.sitePlural)}: ${lines.join(' · ')}\nNew locations are paid from company cash (${money(b.cash)}).`
    },
    children: (g) => {
      const b = readBiz(g, a)
      const home = getCountry(b.countryId)
      const nodes: MenuNode[] = [{ type: 'heading', id: `biz.expandH.${a.id}`, label: `Open in ${home.name}` }]
      for (const city of home.cities.slice(0, 10)) nodes.push(openAction(a, b, b.countryId, city))
      nodes.push({ type: 'heading', id: `biz.abroadH.${a.id}`, label: 'Go international' }, abroadMenu(a))
      const line = lineOf(b.industry)
      if (line && priceAndOutput(b)) {
        nodes.push({ type: 'heading', id: `biz.capH.${a.id}`, label: `Production capacity (${plural(linesOf(b), line.one, line.many)})` })
        nodes.push(buildLinesAction(a, b))
        if (linesOf(b) > 0) nodes.push(sellLinesAction(a, b))
      }
      if (totalOutlets(b) > 1) {
        nodes.push({ type: 'heading', id: `biz.closeH.${a.id}`, label: 'Close locations' })
        for (const o of b.outlets) nodes.push(closeOutletAction(a, b, o.countryId, o.city))
      }
      return nodes
    },
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** 'fermentation cellars' → 'Fermentation Cellars' (menu row labels). */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (x) => x.toUpperCase())
}

// ---------------------------------------------------------------------------
// Consultant & creative accounting

function bestPrice(g: GameState, b: BizState): { price: number; units: number; profit: number } {
  const bounds = priceBounds(b)
  const e = localEcon(b.industry, b.countryId, b.city)
  const cap0 = maxProduction(g, b)
  let best = { price: bounds.going, units: 0, profit: -Infinity }
  for (let r = 0.6; r <= 2.01; r += 0.05) {
    const price = Math.round(bounds.going * r * 100) / 100
    const plan = planFor(g, b, g.year, { price, calm: true })
    const sold = Math.min(plan.demand, cap0)
    const profit = sold * (price / (1 + e.taxRate) - plan.unitCost)
    if (profit > best.profit) best = { price, units: Math.round(sold), profit }
  }
  return best
}

function consultantAction(a: Asset): MenuAction {
  return act(a, 'consultant', 'Hire a Business Consultant', '\u{1F9D1}\u{200D}\u{1F4BC}', {
    subtitle: (g) => `About ${money(adCost(readBiz(g, a), 6_000))} for a frank assessment`,
    run: (g, cur, b) => {
      const fee = adCost(b, 6_000)
      if (b.cash < fee) return noCash(g, cur, fee, 'the consultant')
      if (!useYearAction(g, `biz.consultant.${cur.id}`, 1)) return tooBusy(g, `hired a consultant for ${cur.name}`)
      b.cash -= fee
      b.yearCosts += fee
      const best = bestPrice(g, b)
      const def = industryDef(b.industry)
      const tips: string[] = []
      if (b.morale < 45) tips.push('your staff are miserable: pay them better or take them out')
      if (b.quality < 45) tips.push('quality is slipping: better suppliers or equipment')
      if (b.brand < 30) tips.push('nobody has heard of you: run a campaign')
      if (b.marketingLevel < 1) tips.push('you are underspending on marketing')
      if (b.staff.length === 0) tips.push(`hire a strong ${def.roles[0]?.title ?? 'manager'}`)
      if (b.inventory > b.production * 0.3 && def.perishable < 1) tips.push('you are sitting on too much stock')
      if (b.cash < 0) tips.push('you are out of cash')
      if (marketOf(b.countryId).inflation >= 0.15) tips.push('reprice every year: inflation here eats margins')
      const tip = tips.length ? `Their advice: ${tips.slice(0, 3).join('; ')}.` : 'Their advice: keep doing what you are doing, and pay them again next year.'
      notice(
        g,
        'Consultant’s Report',
        `For ${formatMoney(fee)}, a consultant in a very expensive suit studied ${cur.name}. They reckon the sweet spot is about ${best.price >= 100 ? money(best.price) : formatCents(best.price)} per ${def.unitOne}, selling roughly ${units(best.units)} ${def.unit} this year. ${tip}`,
        { emoji: '\u{1F4CA}' },
      )
    },
  })
}

function cookBooksAction(a: Asset): MenuAction {
  return act(a, 'cook', 'Cook the Books', '\u{1F373}', {
    subtitle: (g) => (readBiz(g, a).cooked > 0 ? 'Already "creatively accounted"' : 'Inflate the profits on paper'),
    disabled: (_g, b) => (b.cooked > 0 ? 'Your books are already cooked. Any more and they will catch fire.' : null),
    confirm: () => 'Fudge the numbers to make the company look more valuable? Auditors, buyers and prosecutors take a dim view of this.',
    run: (g, cur, b) => {
      b.cooked = 1
      addHidden(g, 'karma', -8)
      b.valuation = valuationOf(b)
      refreshValue(cur, b)
      log(g, `I cooked the books at ${cur.name}.`, 'bad')
      notice(g, 'Creative Accounting', `Revenue was "recognized early", costs were "reclassified" and ${cur.name} now looks worth ${money(b.valuation)} on paper. Better hope nobody looks too closely.`, { emoji: '\u{1F373}' })
    },
  })
}

/**
 * What insurance is worth a year: the disasters it would pay for (85% of the damage, the same
 * odds and damage range as the disaster event) minus the premium.
 */
function insuranceValue(g: GameState, a: Asset, b: BizState): number {
  const p = eventChance(g, b, 'disaster', !runsIt(g, a))
  const damage = (equipmentValue(b) * (0.12 + 0.125)) / Math.max(1, Math.sqrt(totalOutlets(b)))
  return p * damage * 0.85 - insurancePremiumFor(b)
}

function insuranceAction(a: Asset): MenuAction {
  return act(a, 'insurance', 'Business Insurance', '\u{1F6E1}\u{FE0F}', {
    hint: (g) => {
      const cur = live(g, a)
      if (!hinting(g, cur)) return null
      const b = readBiz(g, cur)
      const v = insuranceValue(g, cur, b)
      if (v >= 0) return talentHint(g, 'Business', b.insured ? 'Keep it: it pays for itself on average' : 'Get covered: it pays for itself on average')
      return talentHint(g, 'Business', `On average the premium costs about ${money(-v)} a year more than the damage it covers`)
    },
    subtitle: (g) => {
      const b = readBiz(g, a)
      return `${b.insured ? 'Covered' : 'Not covered'} · ${money(insurancePremiumFor(b))}/yr`
    },
    run: (g, cur, b) => {
      b.insured = !b.insured
      notice(g, b.insured ? 'Insured' : 'Insurance Canceled', b.insured ? `${cur.name} is now insured against fires, floods, storms and other disasters for ${formatMoney(insurancePremiumFor(b))} a year.` : `You canceled ${cur.name}'s insurance. Feeling lucky?`, { emoji: '\u{1F6E1}\u{FE0F}' })
    },
  })
}

// ---------------------------------------------------------------------------
// Money

/**
 * What the owner may take out: cash beyond the company's loans and anything earmarked for
 * unreleased games. Paying out borrowed money and then declaring bankruptcy would let the
 * owner keep the loan, so lenders (and the game) don't allow it; investors' money under a
 * liquidation preference stays in the company too (board-vote.payoutCash).
 */
function payable(a: Asset, b: BizState): number {
  return payoutCash(a, b)
}

function payoutBlocked(a: Asset, b: BizState): string | null {
  if (b.cash <= 0) return 'The company has no spare cash.'
  if (b.cash - earmarkedCash(a) <= 0) return 'Its cash is advances and pledges for games still in development. That money funds the games; it is not profit yet.'
  if (payableCash(a, b) <= 0) return bankPayoutBlock(b) ?? `The company owes ${money(b.debt)} in loans. Its lenders won't let cash go to the owner until the debt is covered.`
  if (payable(a, b) <= 0) return `The investors' ${money(b.pref ?? 0)} comes back to them first: the company must be worth more than that before cash goes to the shareholders.`
  return null
}

/**
 * The largest amount in [lo, hi] a proposal still passes with even odds (the board's odds fall as
 * the amount grows). Pure: the Business talent's read on the board.
 */
function maxPassing(g: GameState, a: Asset, b: BizState, make: (v: number) => Proposal, lo: number, hi: number): number {
  if (!(hi > lo) || passOdds(g, a, b, make(lo)) < 0.5) return lo
  if (passOdds(g, a, b, make(hi)) >= 0.5) return hi
  let x = lo
  let y = hi
  for (let i = 0; i < 18 && y - x > Math.max(1, hi * 0.005); i++) {
    const mid = (x + y) / 2
    if (passOdds(g, a, b, make(mid)) >= 0.5) x = mid
    else y = mid
  }
  return Math.round(x)
}

/** ' · needs the board (🔮 about 70% to pass)' for a slider caption. */
function boardCaption(g: GameState, a: Asset, b: BizState, p: Proposal): string {
  if (!needsVote(g, a, b, p)) return ''
  return ` \u{00B7} needs the board${hasTalent(g, 'Business') ? ` (\u{1F52E} ${oddsText(passOdds(g, a, b, p))} to pass)` : ''}`
}

function moneyNodes(a: Asset, g: GameState): MenuNode[] {
  const b = readBiz(g, a)
  const nodes: MenuNode[] = [
    act(a, 'inject', 'Invest My Own Money', '\u{1F4E5}', {
      subtitle: 'Move savings into company cash',
      disabled: (gg) => (gg.character.money <= 0 ? "You don't have any money to put in." : null),
      input: { kind: 'slider', money: true, label: 'How much?', min: 1, max: Math.max(1, Math.floor(g.character.money)), defaultValue: (gg) => String(Math.max(1, Math.round(Math.min(gg.character.money, Math.max(1_000, -b.cash))))),
        preview: (gg, v) => { const bb = readBiz(gg, live(gg, a)), pos = rescuePosition(bb); return `Personal funds ${money(gg.character.money - v)} · company cash ${money(bb.cash + v)} · ${Math.max(0, (bb.cash + v) / (pos.burn || pos.annual)).toFixed(1)} years of ${pos.burn ? 'losses' : 'base costs'}. Ownership unchanged; not revenue.` } },
      run: (gg, cur, bb, input) => {
        const n = amount(input, gg.character.money)
        if (n <= 0) return
        addMoney(gg, -n)
        bb.cash += n
        bb.invested += n
        log(gg, `I invested ${money(n)} of my own money in ${cur.name}.`)
        notice(gg, 'Cash Injected', `You moved ${formatMoney(n)} into ${cur.name}. Company cash: ${formatMoney(bb.cash)}.`, { emoji: '\u{1F4E5}' })
      },
    }),
    act(a, 'dividend', b.share < 1 ? 'Pay a Dividend' : 'Withdraw Profits', '\u{1F4E4}', {
      subtitle: (gg) => {
        const bb = readBiz(gg, live(gg, a))
        const parts = [earmarkedCash(a) > 0 ? `${money(earmarkedCash(a))} of advances and pledges is set aside for unreleased games` : bb.share < 1 ? `You get ${pct(bb.share)} of any payout` : '', 'taxed as income']
        if (hasBoard(gg, bb)) parts.push(`above ${money(sustainablePayout(live(gg, a), bb, boardView(gg, live(gg, a), bb)))} the board votes`)
        return cap(parts.filter(Boolean).join(' \u{00B7} '))
      },
      hint: (gg) => {
        const cur = live(gg, a)
        if (!hinting(gg, cur)) return null
        const bb = readBiz(gg, cur)
        return payable(cur, bb) > 0 ? passHint(gg, cur, bb, { kind: 'dividend', by: 'owner', amount: payable(cur, bb), label: '' }) : null
      },
      disabled: (_gg, bb) => payoutBlocked(a, bb),
      input: {
        kind: 'slider',
        money: true,
        label: 'Total payout',
        min: 1,
        max: Math.max(2, Math.round(payable(a, b))),
        defaultValue: (gg) => {
          const cur = live(gg, a)
          const bb = readBiz(gg, cur)
          const spare = hasBoard(gg, bb) ? sustainablePayout(cur, bb, boardView(gg, cur, bb)) : payable(cur, bb) * 0.25
          return String(Math.max(1, Math.round(spare > 0 ? spare : payable(cur, bb) * 0.25)))
        },
        preview: (gg, v) => {
          const cur = live(gg, a)
          const bb = readBiz(gg, cur)
          return `${bb.share < 1 ? `your ${pct(bb.share)}: ${money(v * bb.share)}` : `${money(v)} to you`} (taxed as income) \u{00B7} ${money(Math.max(0, bb.cash - v))} left in the company${boardCaption(gg, cur, bb, { kind: 'dividend', by: 'owner', amount: v, label: '' })}`
        },
      },
      run: (gg, cur, bb, input) => {
        const n = amount(input, payable(cur, bb))
        if (n <= 0) return
        payDividend(gg, cur, bb, n)
      },
    }),
    act(a, 'borrow', 'Take a Company Loan', '\u{1F3E6}', {
      subtitle: (gg) => {
        const bb = readBiz(gg, a)
        return `Up to ${money(companyCreditLimit(bb, gg))} at ${pct(companyLoanRate(bb, gg), 1)} (${getCountry(bb.countryId).name} rates)${hasBoard(gg, bb) ? ` \u{00B7} past ${money(debtComfort(bb))} of debt the board votes` : ''}`
      },
      disabled: (gg, bb) => (companyCreditLimit(bb, gg) < 1_000 ? 'No bank will lend this company more right now.' : null),
      input: {
        kind: 'slider',
        money: true,
        label: 'How much?',
        min: 1,
        max: Math.max(2, companyCreditLimit(b, g)),
        defaultValue: () => String(Math.max(1, Math.round(companyCreditLimit(b, g) / 2))),
        preview: (gg, v) => {
          const cur = live(gg, a)
          const bb = readBiz(gg, cur)
          return `about ${money(v * companyLoanRate(bb, gg))} a year in interest \u{00B7} company debt ${money(bb.debt + v)}${boardCaption(gg, cur, bb, { kind: 'debt', by: 'owner', amount: v, label: '' })}`
        },
      },
      run: (gg, cur, bb, input) => {
        const n = amount(input, companyCreditLimit(bb, gg))
        if (n <= 0) return
        if (yearActionsUsed(gg, `biz.borrow.${cur.id}`) >= 2) return tooBusy(gg, `asked the bank for money twice for ${cur.name}`)
        if (!boardAllows(gg, cur, bb, { kind: 'debt', by: 'owner', amount: n, label: `Borrow ${money(n)}` })) return
        useYearAction(gg, `biz.borrow.${cur.id}`, 2)
        const rate = companyLoanRate(bb, gg)
        bb.debtRate = bb.debt > 0 ? (bb.debtRate * bb.debt + rate * n) / (bb.debt + n) : rate
        bb.debt += n
        bb.cash += n
        notice(gg, 'Loan Approved', `${cur.name} borrowed ${formatMoney(n)} at ${pct(rate, 1)}. Company debt: ${formatMoney(bb.debt)}. Interest comes out of profits every year.`, { emoji: '\u{1F3E6}' })
      },
    }),
  ]
  if (b.debt > 0) {
    nodes.push(
      act(a, 'repay', 'Repay Company Debt', '\u{1F4B3}', {
        subtitle: `${money(b.debt)} owed at ${pct(b.debtRate, 1)}`,
        disabled: (_gg, bb) => (bb.cash <= 0 ? 'The company has no cash to repay with.' : null),
        input: { kind: 'number', money: true, label: 'Repay how much?', min: 1, max: Math.max(1, Math.round(Math.min(b.debt, Math.max(0, b.cash)))), defaultValue: () => String(Math.max(1, Math.round(Math.min(b.debt, Math.max(0, b.cash))))) },
        run: (gg, cur, bb, input) => {
          const n = amount(input, Math.min(bb.debt, Math.max(0, bb.cash)))
          if (n <= 0) return
          bb.debt -= n
          bb.cash -= n
          if (bb.debt <= 0) bb.debt = 0
          notice(gg, 'Debt Repaid', `${cur.name} repaid ${formatMoney(n)}. ${bb.debt > 0 ? `${formatMoney(bb.debt)} still owed.` : 'The company is debt-free!'}`, { emoji: '\u{1F4B3}', tone: 'good' })
        },
      }),
    )
  }
  return nodes
}

function ceoNodes(a: Asset, g: GameState): MenuNode[] {
  const b = readBiz(g, a)
  if (!runsIt(g, a)) return []
  const payP = (v: number): Proposal => ({ kind: 'ownerPay', by: 'owner', amount: v, label: `Raise your own salary to ${money(v)} a year` })
  const bonusP = (v: number): Proposal => ({ kind: 'bonus', by: 'owner', amount: v, label: `Pay yourself a ${money(v)} bonus` })
  return [
    act(a, 'salary', 'Set My Salary', '\u{1F4B5}', {
      subtitle: (gg) => {
        const cur = live(gg, a)
        const bb = readBiz(gg, cur)
        return `Now ${money(bb.ownerSalary)}/yr \u{00B7} typical here ${money(ceoPayNorm(bb))}${hasBoard(gg, bb) ? ` \u{00B7} above ${money(payCap(bb, boardView(gg, cur, bb)))} the board votes` : ''}`
      },
      hint: (gg) => {
        const cur = live(gg, a)
        if (!hinting(gg, cur)) return null
        const bb = readBiz(gg, cur)
        if (!hasBoard(gg, bb)) return null
        const capNow = payCap(bb, boardView(gg, cur, bb))
        const top = maxPassing(gg, cur, bb, payP, capNow, maxOwnerSalary(bb))
        return talentHint(gg, 'Business', top > capNow ? `The board would likely approve up to about ${money(top)} a year` : `Above ${money(capNow)} a year the board will likely say no`)
      },
      input: {
        kind: 'slider',
        money: true,
        label: 'Yearly salary',
        min: 0,
        max: Math.max(1, maxOwnerSalary(b)),
        defaultValue: () => String(b.ownerSalary),
        preview: (gg, v) => {
          const cur = live(gg, a)
          const bb = readBiz(gg, cur)
          return `${pct(v / Math.max(1, ceoPayNorm(bb)))} of the going rate for a CEO here${v > ceoPayNorm(bb) * 2 ? ' \u{00B7} the staff will notice' : ''}${v > bb.ownerSalary ? boardCaption(gg, cur, bb, payP(v)) : ''}`
        },
      },
      run: (gg, cur, bb, input) => {
        const n = amount(input, maxOwnerSalary(bb))
        if (n === bb.ownerSalary) return
        if (n > bb.ownerSalary && !boardAllows(gg, cur, bb, payP(n))) return
        bb.ownerSalary = n
        const job = ceoJob(gg, cur.id)
        if (job) job.salary = n
        notice(gg, 'Salary Set', `You'll pay yourself ${formatMoney(n)} a year from ${cur.name}'s cash (taxed as income).${n > ceoPayNorm(bb) * 2 ? ' The staff have noticed.' : ''}`, { emoji: '\u{1F4B5}' })
      },
    }),
    act(a, 'bonus', 'Take a Bonus', '\u{1F911}', {
      subtitle: (gg) => {
        const cur = live(gg, a)
        const bb = readBiz(gg, cur)
        return `A one-off payout to yourself (taxed as income)${hasBoard(gg, bb) ? ` \u{00B7} the board votes past ${money(Math.max(0, payCap(bb, boardView(gg, cur, bb)) - bb.ownerSalary))}` : ''}`
      },
      hint: (gg) => {
        const cur = live(gg, a)
        if (!hinting(gg, cur)) return null
        const bb = readBiz(gg, cur)
        if (!hasBoard(gg, bb)) return null
        const room = Math.max(0, payCap(bb, boardView(gg, cur, bb)) - bb.ownerSalary)
        const max = Math.min(payable(cur, bb), maxOwnerSalary(bb))
        const top = maxPassing(gg, cur, bb, bonusP, Math.min(room, max), max)
        return talentHint(gg, 'Business', top > room ? `The board would likely approve a bonus of up to about ${money(top)}` : room > 0 ? `Keep it under ${money(room)}: above that the board will likely say no` : 'Any bonus now will likely be voted down')
      },
      disabled: (_gg, bb) => payoutBlocked(a, bb),
      input: {
        kind: 'slider',
        money: true,
        label: 'Bonus amount',
        min: 1,
        max: Math.max(2, Math.round(Math.min(payable(a, b), maxOwnerSalary(b)))),
        defaultValue: () => String(Math.max(1, Math.round(Math.min(payable(a, b) * 0.1, maxOwnerSalary(b) / 4)))),
        preview: (gg, v) => {
          const cur = live(gg, a)
          const bb = readBiz(gg, cur)
          return `${money(Math.max(0, bb.cash - v))} left in the company${bb.last && bb.last.net < 0 ? ' \u{00B7} after a losing year: the staff will be furious' : ''}${boardCaption(gg, cur, bb, bonusP(v))}`
        },
      },
      run: (gg, cur, bb, input) => {
        const n = amount(input, Math.min(payable(cur, bb), maxOwnerSalary(bb)))
        if (n <= 0) return
        if (yearActionsUsed(gg, `biz.bonus.${cur.id}`) >= 1) return tooBusy(gg, 'taken a bonus')
        if (!boardAllows(gg, cur, bb, bonusP(n))) return
        useYearAction(gg, `biz.bonus.${cur.id}`, 1)
        bb.cash -= n
        bb.yearCosts += n
        bb.ownerDraws = (bb.ownerDraws ?? 0) + n
        earnIncome(gg, n)
        const greedy = bb.last && bb.last.net < 0
        if (greedy) {
          bb.morale = clampN(bb.morale - 8, 0, 100)
          addHidden(gg, 'karma', -3)
        }
        addStat(gg, 'happiness', 3)
        log(gg, `I paid myself a ${money(n)} bonus from ${cur.name}.`, 'good')
        notice(gg, 'Bonus!', `You awarded yourself a ${formatMoney(n)} bonus.${greedy ? ' After a losing year. The staff are furious and morale fell.' : ' Well deserved, according to you.'}`, { emoji: '\u{1F911}', tone: 'good' })
      },
    }),
  ]
}

// ---------------------------------------------------------------------------
// Leadership

function readCandidate(g: GameState, raw: Record<string, Json>): Manager {
  const style = CEO_STYLES.find((x) => x === raw.style)
  const personId = str(raw.personId)
  return {
    firstName: str(raw.firstName, 'Pat'),
    lastName: str(raw.lastName, 'Morgan'),
    gender: raw.gender === 'female' ? 'female' : 'male',
    skill: clampN(num(raw.skill, 55), 0, 100),
    salary: Math.max(0, num(raw.salary)),
    since: g.year,
    ...(style ? { style } : {}),
    integrity: clampN(num(raw.integrity, 70), 0, 100),
    ...(personId ? { personId } : {}),
  }
}

const MANAGER_PICK = defineScript('business.manager', (g, choice, data) => {
  const d = rec(data)
  const a = findBusiness(g, str(d?.assetId))
  if (!a || !d || choice === 'cancel' || manageBlock(g, a)) return
  const b = bizOf(g, a)
  const flow = str(d.flow) === 'stepDown' ? 'stepDown' : 'replace'
  if (choice === 'again' || choice === 'exec') {
    pickManager(g, a, b, choice === 'exec' ? 'executive' : 'standard', flow)
    return
  }
  const list = Array.isArray(d.candidates) ? d.candidates : []
  const raw = rec(list[Number(choice.replace('m', ''))])
  if (!raw) return
  const m = readCandidate(g, raw)
  const outgoing = b.ceo === 'manager' ? b.manager : null
  const severance = outgoing ? ceoSeverance(outgoing, g.year) : 0
  if (severance > Math.max(0, b.cash)) {
    notice(g, 'Not Enough Company Cash', `Replacing ${managerName(outgoing!)} now requires ${formatMoney(severance)} in severance. ${a.name} only has ${formatMoney(Math.max(0, b.cash))}.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return
  }
  if (!boardAllows(g, a, b, { kind: 'hire', by: 'owner', amount: m.salary, skill: m.skill, label: `Hire ${managerName(m)} as CEO at ${money(m.salary)} a year` })) return
  const wasCeo = runsIt(g, a)
  const h = handOver(g, a, b, m)
  // The departing CEO's shares go back to the founder (a division's, through its group).
  settleAfterCeoChange(g, b)
  const formerFamilyCeo = h.outgoing?.personId ? g.people.find((p) => p.id === h.outgoing?.personId) : undefined
  if (formerFamilyCeo && formerFamilyCeo.id !== m.personId) settleReplacedCeo(g, a, b, formerFamilyCeo)
  if (m.personId && b.manager) afterSuccession(g, a, b, b.manager)
  const style = STYLE_INFO[styleOf(m)]
  log(g, `${managerName(m)} became CEO of ${a.name}.`)
  notice(
    g,
    'New CEO',
    `${managerName(m)} (skill ${m.skill}/100, ${style.label.toLowerCase()}, ${formatMoney(m.salary)} a year) now runs ${a.name} day to day.${wasCeo ? ' You stepped down as CEO but still own the company, so you are free to take another job.' : ''}${h.severance > 0 && h.outgoing ? ` Buying out ${managerName(h.outgoing)}'s contract cost the company ${formatMoney(h.severance)}.` : ''}${h.moraleHit > 0 ? ` Yet another new boss: staff morale fell ${h.moraleHit} points.` : ''}${m.skill > SMART_SKILL ? ' Expect a yearly letter on what they change and why.' : ''}`,
    { emoji: '\u{1F9D1}\u{200D}\u{1F4BC}', tone: 'good' },
  )
})

/**
 * A general manager's yearly worth: their skill lifts sales (customers notice a well-run place),
 * trims overhead and sets the mood, against their salary. (career.ceoValue adds what the
 * optimizer earns for a CEO above 75.)
 */
export function managerValue(w: Worth, m: Manager): number {
  return baseManagerValue(w, m)
}

/** Pay a headhunter from company cash first, then the owner's pocket. Null means unaffordable. */
function payFee(g: GameState, b: BizState, fee: number): 'company' | 'owner' | 'split' | null {
  const cost = Math.max(0, Math.round(Number.isFinite(fee) ? fee : 0))
  const fromCompany = Math.min(cost, Math.max(0, b.cash))
  const fromOwner = cost - fromCompany
  if (fromOwner > Math.max(0, g.character.money)) return null
  if (fromCompany > 0) {
    b.cash -= fromCompany
  }
  if (fromOwner > 0) {
    addMoney(g, -fromOwner)
    b.invested += fromOwner
  }
  // The expense is the whole invoice regardless of whether the company paid it directly or the
  // owner covered a shortfall. Cash and cost basis above still record who funded it.
  b.yearCosts += cost
  return fromCompany > 0 && fromOwner > 0 ? 'split' : fromOwner > 0 ? 'owner' : 'company'
}

/**
 * A fresh shortlist from a headhunter (no limit: every search this year costs half as much
 * again). The popup offers another search, an executive search for stars, or keeping the CEO.
 */
function pickManager(g: GameState, a: Asset, b: BizState, kind: SearchKind, flow: 'replace' | 'stepDown'): void {
  const key = `biz.headhunt.${a.id}`
  const fee = headhunterFee(b, kind, yearActionsUsed(g, key))
  const by = payFee(g, b, fee)
  if (!by) {
    notice(g, 'Not Enough Cash', `The headhunter wants ${formatMoney(fee)}. ${a.name}'s cash and your personal funds cannot cover it.`, { emoji: '\u{1F4B8}', tone: 'bad' })
    return
  }
  useYearAction(g, key, Number.MAX_SAFE_INTEGER)
  const list = [...familyCandidates(g, a, b, (skill) => askingSalary(b, skill, 0)), ...shortlist(g, b, kind)]
  const used = yearActionsUsed(g, key)
  const cur = b.ceo === 'manager' && b.manager ? b.manager : null
  const sev = cur ? ceoSeverance(cur, g.year) : 0
  const face = (m: Manager) => (m.gender === 'female' ? '\u{1F469}\u{200D}\u{1F4BC}' : '\u{1F468}\u{200D}\u{1F4BC}')
  const choices: ChoiceOption[] = [
    ...list.map((m, i) => ({ id: `m${i}`, label: `${managerName(m)} \u{00B7} ${m.skill}/100 \u{00B7} ${STYLE_INFO[styleOf(m)].label} \u{00B7} ${money(m.salary)}`, emoji: m.skill >= 85 ? '\u{2B50}' : face(m) })),
    { id: 'again', label: `Another shortlist (${money(headhunterFee(b, 'standard', used))})`, emoji: '\u{1F504}' },
    { id: 'exec', label: `Executive search for a star (${money(headhunterFee(b, 'executive', used))})`, emoji: '\u{1F31F}' },
    { id: 'cancel', label: cur ? `Keep ${managerName(cur)}` : 'Never mind', emoji: '\u{2716}\u{FE0F}' },
  ]
  if (hasTalent(g, 'Business')) {
    const w = bizWorth(g, b)
    const gain = optimizerGain(g, b)
    // A year of each candidate's value; replacing someone also costs their severance (spread over the years it counts for).
    const values = list.map((m) => ceoValue(w, m, gain) - sev / LASTING_YEARS)
    const keep = cur ? ceoValue(w, cur, gain) : null
    markBest(g, choices, (id) => (id === 'cancel' ? keep : id.startsWith('m') ? (values[Number(id.slice(1))] ?? null) : null), (id) =>
      id === 'cancel' ? 'Best move: nobody here beats your CEO by enough to pay the severance' : `Best value: about ${money(values[Number(id.slice(1))] ?? 0)} a year for the company after pay${(list[Number(id.slice(1))]?.skill ?? 0) > SMART_SKILL ? ', and they plan with the numbers' : ''}`,
    )
  }
  const lines = list.map((m) => `\u{2022} ${managerName(m)}: skill ${m.skill}/100, ${STYLE_INFO[styleOf(m)].label.toLowerCase()} (${STYLE_INFO[styleOf(m)].note}), wants ${formatMoney(m.salary)} a year. ${equityTerms(m, seatOf(g, b))}.`)
  const notes = [`The search cost ${formatMoney(fee)}${by === 'owner' ? ' (paid from your own pocket: the company was empty)' : by === 'split' ? ' (split between company cash and your own pocket)' : ''}.`]
  if (cur && sev > 0) notes.push(`Replacing ${managerName(cur)} means buying out the contract: about ${formatMoney(sev)} in severance.`)
  if (list.some((m) => m.skill > SMART_SKILL)) notes.push('Anyone above 75 runs the company with the numbers, like a real executive.')
  scriptChoice(g, MANAGER_PICK, flow === 'stepDown' ? 'Hire a CEO' : 'Replace the CEO', `A headhunter in ${b.city} sent over ${list.length} candidates to run ${a.name}:\n${lines.join('\n')}\n${notes.join(' ')}`, choices, {
    emoji: '\u{1F9D1}\u{200D}\u{1F4BC}',
    data: { assetId: a.id, flow, candidates: toJson(list) },
  })
}

function leadershipNodes(a: Asset, g: GameState): MenuNode[] {
  const b = readBiz(g, a)
  const fee = (gg: GameState) => money(headhunterFee(readBiz(gg, live(gg, a)), 'standard', yearActionsUsed(gg, `biz.headhunt.${a.id}`)))
  if (runsIt(g, a)) {
    return [
      act(a, 'stepDown', 'Step Down as CEO', '\u{1FA91}', {
        subtitle: (gg) => `Hire a CEO and become a passive owner \u{00B7} headhunter ${fee(gg)}`,
        run: (gg, cur, bb) => pickManager(gg, cur, bb, 'standard', 'stepDown'),
      }),
    ]
  }
  const job = g.character.job
  const title = b.founderName && b.founderName === `${g.character.firstName} ${g.character.lastName}` && !b.acquired ? 'Founder & CEO' : 'Owner & CEO'
  const takeP = (gg: GameState, bb: BizState): Proposal => ({ kind: 'takeOver', by: 'owner', skill: ceoSkill(gg, { ...bb, ceo: 'owner' }), label: `Make ${gg.character.firstName} ${gg.character.lastName} CEO` })
  const fireP = (bb: BizState): Proposal => ({ kind: 'fire', by: 'owner', label: `Replace ${bb.manager ? managerName(bb.manager) : 'the CEO'} as CEO` })
  return [
    act(a, 'takeOver', 'Run It Myself (Become CEO)', '\u{1F454}', {
      subtitle: (gg) => {
        const bb = readBiz(gg, live(gg, a))
        const m = bb.manager
        return m && bb.ceo === 'manager' ? `Replace ${managerName(m)} and take charge \u{00B7} severance ${money(ceoSeverance(m, gg.year))}` : 'Take charge day to day'
      },
      hint: (gg) => {
        const cur = live(gg, a)
        const bb = readBiz(gg, cur)
        return passHint(gg, cur, bb, takeP(gg, bb))
      },
      disabled: (gg, bb) => (needsVote(gg, live(gg, a), bb, takeP(gg, bb)) && refusedThisYear(gg, bb, 'takeOver') ? 'The board already turned you down as CEO this year.' : null),
      confirm: () => (job ? `Become CEO of ${a.name}? You'll leave your job as ${job.title}${job.company ? ` at ${job.company}` : ''}.` : null),
      run: (gg, cur, bb) => {
        if (!boardAllows(gg, cur, bb, takeP(gg, bb))) return
        const h = ownerTakesOver(gg, bb)
        const quit = becomeCeo(gg, cur, bb, title)
        settleAfterCeoChange(gg, bb)
        log(gg, `I took over as CEO of ${cur.name}.`, 'good')
        notice(gg, 'In Charge', `You're now ${title} of ${cur.name}${quit ? ` (you ${quit})` : ''}. Your salary is ${formatMoney(bb.ownerSalary)} a year; change it any time.${h.severance > 0 && h.outgoing ? ` Buying out ${managerName(h.outgoing)}'s contract cost the company ${formatMoney(h.severance)}.` : ''}`, { emoji: '\u{1F454}', tone: 'good' })
      },
    }),
    act(a, 'replaceManager', 'Replace the CEO', '\u{1F504}', {
      subtitle: (gg) => {
        const bb = readBiz(gg, live(gg, a))
        const m = bb.ceo === 'manager' ? bb.manager : null
        return m ? `${managerName(m)} \u{00B7} skill ${m.skill}/100 \u{00B7} ${STYLE_INFO[styleOf(m)].label} \u{00B7} ${money(m.salary)}/yr \u{00B7} severance ${money(ceoSeverance(m, gg.year))} \u{00B7} headhunter ${fee(gg)}` : `Hire someone to run it \u{00B7} headhunter ${fee(gg)}`
      },
      hint: (gg) => {
        const cur = live(gg, a)
        const bb = readBiz(gg, cur)
        return bb.manager ? passHint(gg, cur, bb, fireP(bb)) : null
      },
      // Investors who control the board already said no to a change at the top this year.
      disabled: (gg, bb) => (hasBoard(gg, bb) && !controlsBoard(boardView(gg, live(gg, a), bb)) && (refusedThisYear(gg, bb, 'fire') || refusedThisYear(gg, bb, 'hire')) ? 'The board already turned down a change of CEO this year.' : null),
      run: (gg, cur, bb) => {
        // No yearly cap: severance, the headhunter and morale are the price of every change.
        if (bb.ceo === 'manager' && bb.manager && needsVote(gg, cur, bb, fireP(bb)) && !vote(gg, cur, bb, fireP(bb)).passed) return
        pickManager(gg, cur, bb, 'standard', 'replace')
      },
    }),
    ...briefNodes(g, a),
  ]
}

// ---------------------------------------------------------------------------
// Exits

interface Offer {
  buyer: string
  amount: number
}

/** Chance a buyer's due diligence finds cooked books and the deal collapses. */
const SALE_COLLAPSE = 0.4
/**
 * Underwriters audit the books before an IPO: cooked books can sink the listing (and half the time
 * the prosecutors hear about it), like a buyer's due diligence on a sale. True when the IPO may go ahead.
 */
export function ipoDueDiligence(g: GameState, a: Asset, b: BizState): boolean {
  if (b.cooked <= 0 || !chance(g, IPO_COLLAPSE)) return true
  b.cooked = 0
  b.brand = clampN(b.brand - 15, 0, 100)
  b.valuation = valuationOf(b)
  refreshValue(a, b)
  log(g, `The IPO of ${a.name} was pulled when the underwriters found the cooked books.`, 'bad')
  notice(g, 'IPO Pulled', `The underwriters' auditors found ${a.name}'s creative accounting while preparing the prospectus. The listing is off, the story is in the financial press, and the files went to the regulator.`, { emoji: '\u{1F6A8}', tone: 'bad' })
  if (chance(g, 0.5)) arrestPlayer(g, 'Accounting Fraud', 3, { evidence: 0.7, noResist: true, context: `Prosecutors charged you over ${a.name}'s cooked books.` })
  return false
}

const SELL = defineScript('business.sell', (g, choice, data) => {
  const d = rec(data)
  const a = findBusiness(g, str(d?.assetId))
  if (!a || !d || choice === 'keep') return
  const b = bizOf(g, a)
  const offers = Array.isArray(d.offers) ? d.offers : []
  const o = rec(offers[Number(choice.replace('o', ''))])
  if (!o) return
  if (b.cooked > 0 && chance(g, SALE_COLLAPSE)) {
    b.cooked = 0
    b.brand = clampN(b.brand - 15, 0, 100)
    log(g, `The sale of ${a.name} collapsed when the buyer found the cooked books.`, 'bad')
    notice(g, 'Deal Collapsed', `${str(o.buyer, 'The buyer')}'s auditors found your creative accounting during due diligence. The deal is off, and they forwarded everything to the authorities.`, { emoji: '\u{1F6A8}', tone: 'bad' })
    if (chance(g, 0.5)) arrestPlayer(g, 'Accounting Fraud', 3, { evidence: 0.7, noResist: true, context: `Prosecutors charged you over ${a.name}'s cooked books.` })
    return
  }
  // With outside owners, selling the whole company is the board's decision too.
  if (!boardAllows(g, a, b, { kind: 'sell', by: 'owner', amount: num(o.amount), label: `Sell ${a.name} to ${str(o.buyer, 'a buyer')} for ${money(num(o.amount))}` })) return
  sellBusiness(g, a, b, num(o.amount), str(o.buyer, 'a buyer'))
})

/** What buyers knock off a company resold before it booked a year under the owner who just bought it. */
const FLIP_DISCOUNT = 0.05

function makeOffers(g: GameState, b: BizState): Offer[] {
  // Buyers haggle over the business itself; its net cash (cash minus debt) is worth exactly what
  // it is, so no premium or discount applies to it (moving cash in before a sale gains nothing).
  const netCash = Number.isFinite(b.cash - b.debt) ? b.cash - b.debt : 0
  const operating = Math.max(5_000, b.valuation - netCash)
  const def = industryDef(b.industry)
  // A company bought off the market that hasn't booked a year under its new owner has shown buyers
  // nothing new: they pay at most what the business just changed hands for, less the cost of
  // another deal, so buying a listing and shopping it straight back out is never an arbitrage.
  const unproven = b.bought && (b.last?.year ?? -Infinity) < b.bought.year
  const cap = unproven ? b.bought!.operating * (1 - FLIP_DISCOUNT) : Infinity
  const f = (lo: number, hi: number) => Math.max(1_000, Math.round((Math.min(cap, operating * (lo + (hi - lo) * rand(g))) + netCash) / 100) * 100)
  const offers: Offer[] = [
    { buyer: `a rival ${industryNoun(def.label)} chain`, amount: f(0.78, 1.05) },
    { buyer: `${investorFirm(b.countryId, rand(g), rand(g))} (private equity)`, amount: f(0.88, 1.15) },
  ]
  // A conglomerate pays a premium for a track record; a company with no booked year gets none.
  if (operating + netCash >= 2_000_000 || chance(g, 0.4)) offers.push({ buyer: conglomerate(rand(g), rand(g)), amount: b.history.length ? f(0.95, 1.28) : f(0.85, 1) })
  if (chance(g, 0.5)) offers.push({ buyer: 'a local tycoon', amount: f(0.72, 1.12) })
  return offers.sort((x, y) => y.amount - x.amount)
}

/**
 * Shop a company (or a group's division) around: a broker's offers for the whole company, the
 * board voting on whichever the owner picks (business.sell). Two rounds a year.
 */
export function shopCompany(g: GameState, a: Asset, b: BizState): void {
  if (!useYearAction(g, `biz.sell.${a.id}`, 2)) return tooBusy(g, `shopped ${a.name} around twice`)
  const offers = makeOffers(g, b)
  const choices: ChoiceOption[] = [...offers.map((o, i) => ({ id: `o${i}`, label: `${money(o.amount)} from ${o.buyer}`, emoji: '\u{1F4B5}' })), { id: 'keep', label: 'Keep it', emoji: '\u{2716}\u{FE0F}' }]
  if (hasTalent(g, 'Business')) {
    // A sale is worth what it beats the company's value by, if the board lets it through;
    // cooked books can sink it (40%), and half the time the buyer calls the prosecutors.
    const w = bizWorth(g, b)
    const board = (amount: number) => (hasBoard(g, b) ? passOdds(g, a, b, { kind: 'sell', by: 'owner', amount, label: '' }) : 1)
    const sale = (amount: number) =>
      b.cooked > 0 ? (1 - SALE_COLLAPSE) * board(amount) * (amount - b.valuation) * b.share + SALE_COLLAPSE * fxValue(g, b, w, { brand: -15, arrest: 0.5 * 3 }) : board(amount) * (amount - b.valuation) * b.share
    markBest(g, choices, (id) => (id === 'keep' ? 0 : id.startsWith('o') ? sale(offers[Number(id.slice(1))]?.amount ?? 0) : null), (id) =>
      id === 'keep' ? 'Best move: every offer is below what it is worth to you' : `Best offer: the most money above what the company is worth${hasBoard(g, b) ? ` (the board: ${oddsText(board(offers[Number(id.slice(1))]?.amount ?? 0))} to approve)` : ''}`,
    )
  }
  scriptChoice(
    g,
    SELL,
    `Sell ${a.name}`,
    `Your broker collected offers for the whole company (valued at about ${money(b.valuation)}).${b.share < 1 ? ` You own ${pct(b.share)}, so that's your cut, after the investors' preference.` : ''}${hasBoard(g, b) ? ' The board votes on whichever offer you pick.' : ''}`,
    choices,
    { emoji: '\u{1F91D}', data: { assetId: a.id, offers: toJson(offers) } },
  )
}

function exitNodes(a: Asset, g: GameState): MenuNode[] {
  const b = readBiz(g, a)
  const nodes: MenuNode[] = []
  const closeValue = (bb: BizState) => equipmentValue(bb) * 0.35 + bb.inventory * localEcon(bb.industry, bb.countryId, bb.city).unitCost * 0.3
  const closeP = (bb: BizState): Proposal => ({ kind: 'close', by: 'owner', amount: Math.max(0, closeValue(bb) + supplyInventoryValue(bb) + bb.cash - bb.debt), label: `Close ${a.name} for good` })
  const ipoP: Proposal = { kind: 'ipo', by: 'owner', label: `Take ${a.name} public` }
  // A division of a group sells like any company, never lists on its own (the whole group lists)
  // and can be spun off (business/conglomerate-division.ts).
  const group = groupOfCompany(g, a)
  if (!b.public) {
    nodes.push(
      act(a, 'sell', group ? 'Sell This Division' : 'Sell the Company', '\u{1F3F7}\u{FE0F}', {
        subtitle: `Valued at about ${money(b.valuation)}${b.share < 1 ? ` (your ${pct(b.share)}: ${money(b.valuation * b.share)}) \u{00B7} the board must agree` : ''}${group ? ` \u{00B7} it leaves ${group.core.name}` : ''}`,
        run: (gg, cur, bb) => shopCompany(gg, cur, bb),
      }),
    )
    if (group) nodes.push({ type: 'info', id: `biz.ipoGroup.${a.id}`, emoji: '\u{1F514}', text: `${a.name} can't list on its own while it belongs to ${group.core.name}: take the whole group public from its screen.` })
    else {
      nodes.push(
        act(a, 'ipo', 'Go Public (IPO)', '\u{1F514}', {
          subtitle: (gg) => canIpo(readBiz(gg, a)) ?? `List on the ${marketOf(b.countryId).exchange?.code ?? 'regional exchange'}${hasBoard(gg, readBiz(gg, a)) ? ' \u{00B7} the board must agree' : ''}`,
          hint: (gg) => {
            const cur = live(gg, a)
            const bb = readBiz(gg, cur)
            if (canIpo(bb)) return null
            if (bb.cooked > 0 && hasTalent(gg, 'Business') && !manageBlock(gg, cur)) return talentHint(gg, 'Business', `Underwriters audit the books first: about ${pct(IPO_COLLAPSE)} chance they find the cooking (no IPO, and maybe prosecutors)`)
            return passHint(gg, cur, bb, ipoP)
          },
          disabled: (_gg, bb) => canIpo(bb),
          input: { kind: 'slider', label: 'Percent of the company to float', min: FLOAT_MIN, max: FLOAT_MAX, step: 1, unit: '%', defaultValue: () => String(FLOAT_DEFAULT),
            preview: (gg, v) => ipoPreview(gg, readBiz(gg, live(gg, a)), v) },
          confirm: (gg) => `Take ${a.name} public? You'll sell part of the company to the market as new shares and answer to shareholders (and independent directors) from now on.${readBiz(gg, live(gg, a)).cooked > 0 ? ' The underwriters will audit the books first.' : ''}`,
          run: (gg, cur, bb, input) => {
            const float = clampN(Math.round(Number(input) || FLOAT_DEFAULT), FLOAT_MIN, FLOAT_MAX)
            if (!boardAllows(gg, cur, bb, ipoP)) return
            if (!ipoDueDiligence(gg, cur, bb)) return
            goPublic(gg, cur, bb, float)
          },
        }),
      )
    }
  } else {
    nodes.push(
      act(a, 'sellShares', 'Sell Shares', '\u{1F4C8}', {
        subtitle: `${moneyWith(b.sharePrice, (x) => x.toFixed(2))}/share · ${shareCountText(b.sharesOut)} shares · your stake ${money(b.valuation * b.share)}`,
        input: { kind: 'number', label: 'Percent of your shares to sell', min: 1, max: 100, defaultValue: () => '10' },
        run: (gg, cur, bb, input) => {
          const fraction = clampN(Number(input) || 0, 0, 100) / 100
          if (fraction <= 0) return
          if (!useYearAction(gg, shareSaleKey(cur.id), SHARE_SALES_PER_YEAR)) return tooBusy(gg, 'sold shares twice')
          sellShares(gg, cur, bb, fraction)
        },
      }),
    )
  }
  nodes.push(...divisionExitNodes(g, a))
  nodes.push(
    act(a, 'close', 'Close the Business', '\u{1F6AA}', {
      subtitle: 'Sell the equipment, pay the debts, lock the doors',
      hint: (gg) => {
        const cur = live(gg, a)
        const bb = readBiz(gg, cur)
        return passHint(gg, cur, bb, closeP(bb))
      },
      confirm: (gg) => {
        const bb = readBiz(gg, a)
        return `Close ${a.name} for good? The fit-out sells for about ${money(equipmentValue(bb) * 0.35)}${supplyInventoryValue(bb) > 0 ? ` and raw inputs recover about ${money(supplyInventoryValue(bb))}` : ''}; debts of ${money(bb.debt)} get paid first.${needsVote(gg, live(gg, a), bb, closeP(bb)) ? ' The board votes first.' : ''}`
      },
      run: (gg, cur, bb) => {
        if (!boardAllows(gg, cur, bb, closeP(bb))) return
        closeBusiness(gg, cur, bb, closeValue(bb))
      },
    }),
    act(a, 'bankrupt', 'Declare Bankruptcy', '\u{1F4C9}', {
      subtitle: 'Walk away from the company’s debts (and your credit score)',
      confirm: () => `Declare bankruptcy for ${a.name}? The company closes, its debts are wiped, and your credit takes a big hit.`,
      run: (gg, cur, bb) => declareBankruptcy(gg, cur, bb, 'You pulled the plug, and'),
    }),
  )
  return nodes
}

// ---------------------------------------------------------------------------
// The owned-business screen

/**
 * The full fact sheet behind the dashboard (Company Details): who runs it, ownership, staff,
 * quality, market, the plan, last year's taxes, value and the country's business climate.
 */
export function infoRows(g: GameState, a: Asset): MenuNode[] {
  const b = readBiz(g, a)
  const def = industryDef(b.industry)
  const m = marketOf(b.countryId)
  const e = localEcon(b.industry, b.countryId, b.city)
  const rows: [string, string][] = []
  rows.push([def.emoji, `${def.label} \u{00B7} ${b.city}, ${getCountry(b.countryId).name} \u{00B7} ${b.acquired ? 'acquired' : 'founded'} ${b.founded}`])
  if (runsIt(g, a)) rows.push(['\u{1F454}', `Run by you, the CEO \u{00B7} salary ${money(b.ownerSalary)}/yr`])
  else rows.push(['\u{1F454}', b.manager ? `CEO ${managerName(b.manager)} \u{00B7} skill ${b.manager.skill}/100 \u{00B7} ${STYLE_INFO[styleOf(b.manager)].label.toLowerCase()} \u{00B7} ${money(b.manager.salary)}/yr${b.manager.bonus ? ` + ${money(b.manager.bonus)} bonus` : ''}${b.manager.skill > SMART_SKILL ? ' \u{00B7} plans with the numbers' : ''}` : 'No one is running it day to day.'])
  // A group's division: the membership line replaces the ownership line (business/conglomerate-division.ts).
  const division = divisionLine(g, a)
  rows.push(['\u{1F4DC}', division ?? (b.public ? `Listed on the ${b.exchange} at ${moneyWith(b.sharePrice, (x) => x.toFixed(2))} \u{00B7} you own ${pct(b.share, 1)}` : b.share < 1 ? `You own ${pct(b.share)}; investors hold the rest` : 'You own 100%')])
  rows.push(['\u{1F465}', `${plural(totalOutlets(b), def.site, def.sitePlural)} \u{00B7} ${b.employees + b.staff.length} staff \u{00B7} morale ${b.morale}%`])
  rows.push(['\u{2728}', isFinanceFirm(b) ? 'Balance-sheet business: staff skill drives the results' : isStudio(b) ? `Studio craft ${b.quality}% \u{00B7} brand ${b.brand}% \u{00B7} morale shapes every game` : `Quality ${b.quality}% \u{00B7} brand ${b.brand}% \u{00B7} ${b.products.length ? plural(b.products.length, 'product line') : 'no product lines yet'}`])
  rows.push(['\u{1F3C6}', marketInfoLine(g, a)])
  if (isFinanceFirm(b)) rows.push(['\u{1F3E6}', financeInfo(g, b)])
  else if (isStudio(b)) rows.push(['\u{1F3AE}', studioInfo(g, a)])
  else {
    if (isDeepTech(b)) {
      const tech = deepTechInfo(g, a)
      if (tech) rows.push(['\u{1F52C}', tech])
    }
    rows.push(['\u{1F3F7}\u{FE0F}', `Price ${b.price >= 100 ? money(b.price) : formatCents(b.price)} per ${def.unitOne} (locals expect ${e.goingPrice >= 100 ? money(e.goingPrice) : formatCents(e.goingPrice)}) \u{00B7} plan ${units(b.production)} ${def.unit}`])
  }
  const s = b.last
  if (s) rows.push(['\u{1F4CA}', `${s.year}: sales ${money(s.revenue)} \u{00B7} ${s.net >= 0 ? 'profit' : 'loss'} ${money(Math.abs(s.net))} \u{00B7} corporate tax ${money(s.corpTax)}${s.salesTax > 0 ? ` \u{00B7} ${m.salesTaxName} ${money(s.salesTax)}` : ''}`])
  rows.push(['\u{1F4B0}', `${b.public ? 'Market cap' : 'Valuation'} ${money(b.valuation)}${b.share < 1 || stakeValue(b) !== Math.round(b.valuation * b.share) ? ` (your stake ${money(stakeValue(b))}${division ? ', after the group\u{2019}s valuation' : ''})` : ''} \u{00B7} cash ${money(b.cash)}${b.debt > 0 ? ` \u{00B7} debt ${money(b.debt)}` : ''}`])
  rows.push(['\u{1F30D}', climateLine(b, e.wage)])
  const note = eraNote(g, b.countryId, m.businessNote).trim()
  if (note) rows.push(['\u{1F4DD}', note])
  return rows.filter(([, text]) => !!text).map(([emoji, text], i): MenuNode => ({ type: 'info', id: `biz.info.${a.id}.${i}`, text, emoji }))
}

/** Who the CEO answers to, and the hired CEO's last letter (short; the Board menu has the rest). */
function governanceRows(g: GameState, a: Asset): MenuNode[] {
  const b = readBiz(g, a)
  const st = boardView(g, a, b)
  const nodes: MenuNode[] = []
  if (hasBoard(g, b)) {
    const last = st.votes[st.votes.length - 1]
    nodes.push({ type: 'info', id: `biz.info.${a.id}.board`, emoji: '\u{1F3DB}\u{FE0F}', text: `Board: ${ownerSeats(st)} of ${st.members.length} seats yours${controlsBoard(st) ? '' : " (you don't control it)"} \u{00B7} mandate ${mandateDef(st.mandate).label}${last ? ` \u{00B7} last vote: ${lowerFirst(last.what)} (${last.passed ? 'passed' : 'rejected'})` : ''}` })
  } else if (b.ceo === 'manager' && b.manager) {
    nodes.push({ type: 'info', id: `biz.info.${a.id}.board`, emoji: '\u{1F4CB}', text: `No board: ${managerName(b.manager)} answers to you \u{00B7} mandate ${mandateDef(st.mandate).label}` })
  }
  if (b.ceo === 'manager' && b.manager && st.memo.length && st.letter >= g.year - 1) {
    const memo = st.memo.slice(0, 2).join(' ')
    nodes.push({ type: 'info', id: `biz.info.${a.id}.memo`, emoji: '\u{1F4DD}', text: `${managerName(b.manager)}'s letter: ${memo.length > 120 ? `${memo.slice(0, 117).replace(/\s+\S*$/, '')}\u{2026}` : memo}` })
  }
  return nodes
}

/** Company Details: the full fact sheet, one tap away from the dashboard. */
function detailsMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.details.${a.id}`,
    label: 'Company Details',
    emoji: '\u{1F4CB}',
    subtitle: 'Staff, quality, prices, taxes and the local climate',
    children: (g) => {
      const cur = findBusiness(g, a.id)
      return cur ? infoRows(g, cur) : [{ type: 'info', id: `biz.details.gone.${a.id}`, text: 'You no longer own this business.' }]
    },
  }
}

export function businessView(g: GameState, a: Asset): MenuNode[] {
  const health = readBiz(g, a)
  const finance = isFinanceFirm(health)
  // The dashboard card (business/dashboard.ts), governance, milestones and the full fact sheet.
  const nodes: MenuNode[] = [...dashboardRows(g, a), ...governanceRows(g, a), milestonesMenu(a), detailsMenu(a)]
  // National strategy programs are for product companies; financial firms run their own operations.
  const strategy = finance ? [] : [tidyNationalStrategy(nationalStrategyMenu(a), a)]
  if (isVenue(health.industry)) nodes.push(venueOwnerMenu(a))
  if (finance) {
    nodes.push({ type: 'heading', id: `biz.financeH.${a.id}`, label: 'Financial Operations' }, ...financeNodes(g, a), staffMenu(a), expansionMenu(a), insuranceAction(a))
  } else if (isStudio(readBiz(g, a))) {
    nodes.push({ type: 'heading', id: `biz.runH.${a.id}`, label: 'Run the Company' })
    // Game studios make games: a pipeline, a back catalog and a team instead of price and production.
    nodes.push(...studioNodes(g, a))
    nodes.push(marketMenu(a), staffMenu(a), marketingMenu(a), expansionMenu(a), ...strategy, insuranceAction(a), cookBooksAction(a))
  } else {
    nodes.push({ type: 'heading', id: `biz.runH.${a.id}`, label: 'Run the Company' })
    nodes.push(
      act(a, 'plan', 'Set Price & Production', '\u{1F4CA}', {
        hint: (gg) => {
          const cur = live(gg, a)
          if (!hinting(gg, cur)) return null
          const b = readBiz(gg, cur)
          if (!priceAndOutput(b)) return null
          const p = cachedHint(gg, cur, `plan.${priceCapOf(gg, cur.id) ?? ''}`, () => bestPlan(gg, b, { quick: true, ownerDraw: runsIt(gg, cur) ? b.ownerSalary : 0, maxPrice: priceCapOf(gg, cur.id) ?? undefined }))
          const close = Math.abs(p.price - b.price) <= Math.max(0.02, b.price * 0.03) && Math.abs(p.production - b.production) <= Math.max(1, p.production * 0.05)
          return talentHint(gg, 'Business', close ? 'Your plan is already close to the sweet spot' : `The report has a better plan for you: about ${money(Math.abs(p.profit))} ${p.profit >= 0 ? 'profit' : 'loss'} next year`)
        },
        subtitle: 'Open the planning report',
        run: (gg, cur, bb) => queueReport(gg, cur, bb),
      }),
    )
    // Deep-tech companies add their R&D lab, funding rounds and the like (business/deeptech.ts).
    if (isDeepTech(readBiz(g, a))) nodes.push(...deepTechNodes(g, a))
    const franchise = franchiseMenu(a, health)
    nodes.push(marketMenu(a), staffMenu(a), marketingMenu(a), productsMenu(a), qualityMenu(a), expansionMenu(a), ...(franchise ? [franchise] : []), ...strategy, consultantAction(a), insuranceAction(a), cookBooksAction(a))
  }
  nodes.push({ type: 'heading', id: `biz.moneyH.${a.id}`, label: 'Money' })
  nodes.push(economicReportMenu(a))
  nodes.push(...ceoNodes(a, g), ...moneyNodes(a, g), dividendMenu(a))
  nodes.push({ type: 'menu', id: `biz.rescue.${a.id}`, label: health.cash < 0 || (health.last?.net ?? 0) < 0 ? 'Financial Rescue & Ownership' : 'Capital & Ownership', emoji: '🛟', subtitle: 'Put in more money, buy out investors, buy back shares', children: gg => { const aa = findBusiness(gg, a.id); return aa ? rescueNodes(gg, aa) : [] } })
  nodes.push({ type: 'heading', id: `biz.leadH.${a.id}`, label: 'Leadership' })
  nodes.push(...leadershipNodes(a, g), ...boardNodes(g, a), ...nepoNodes(g, a))
  nodes.push(equityMenu(a.id))
  nodes.push({ type: 'heading', id: `biz.exitH.${a.id}`, label: 'Exit' })
  nodes.push(...exitNodes(a, g))
  return nodes
}
