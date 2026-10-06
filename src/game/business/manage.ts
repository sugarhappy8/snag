// Management actions on an owned business: marketing, products, quality, expansion, money,
// leadership and the exits. Each action re-reads the business from state when it runs.
import { addHidden, addMoney, addStat, earnIncome, formatMoney, log, notice, scriptChoice, useYearAction } from '../core'
import { arrestPlayer } from '../crime'
import { industryDemand, isIndustryLegal, marketOf } from '../data/markets'
import { chance, rand, randInt } from '../rng'
import { defineScript } from '../scripts'
import { hasTalent, talentHint } from '../talents'
import type { Asset, ChoiceOption, GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { COUNTRIES, getCountry } from '../world'
import { becomeCeo, ceoPayNorm, installManager, managerCandidate, managerName, maxOwnerSalary, stepDown } from './career'
import {
  bestPlan,
  bizWorth,
  ceoSkill,
  equipmentValue,
  fxValue,
  insurancePremiumFor,
  LASTING_YEARS,
  localEcon,
  maxProduction,
  planFor,
  priceBounds,
  productsBoost,
  refreshValue,
  startupCost,
  staffPower,
  valuationOf,
  type Worth,
} from './economy'
import { eventChance } from './events'
import { canIpo, closeBusiness, declareBankruptcy, goPublic, sellBusiness, sellShares } from './exit'
import { conglomerate, investorFirm, localSport } from './flavor'
import { deepTechInfo, deepTechNodes, isDeepTech } from './deeptech'
import { earmarkedCash, isStudio, studioInfo, studioNodes } from './gamestudio'
import { manageBlock, noCash, tooBusy } from './gate'
import { staffMenu } from './staff'
import { industryDef } from './industries'
import { bizOf, ceoJob, findBusiness, readBiz, runsIt, totalOutlets, type BizState, type Manager, type Supplier } from './state'
import { companyCreditLimit, companyLoanRate, queueReport } from './yearly'
import { aPct, clampN, markBest, money, num, pct, plural, rec, str, toJson, units } from './util'

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
      opts.run(g, cur, bizOf(g, cur), input)
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
  const key = `${what}|${a.id}|${g.year}|${c.stats.smarts}|${c.hidden.discipline}|${c.education.degrees.length}|${c.conditions.length}|${c.prison ? 1 : 0}|${JSON.stringify(a.details)}`
  if (hintCache.has(key)) return hintCache.get(key) as T
  const v = make()
  hintCache.set(key, v)
  if (hintCache.size > 64) {
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
  label: (b: BizState) => string
  emoji: string
  base: number
  boost: number
  brand: number
}

const CAMPAIGNS: Campaign[] = [
  { id: 'social', label: () => 'Social Media Blitz', emoji: '\u{1F4F1}', base: 4_000, boost: 0.05, brand: 3 },
  { id: 'radio', label: () => 'Radio Spots', emoji: '\u{1F4FB}', base: 12_000, boost: 0.05, brand: 3 },
  { id: 'billboards', label: () => 'Billboards', emoji: '\u{1FAA7}', base: 22_000, boost: 0.07, brand: 4 },
  { id: 'influencers', label: () => 'Influencer Campaign', emoji: '\u{1F933}', base: 18_000, boost: 0.08, brand: 5 },
  { id: 'tv', label: () => 'TV Commercial', emoji: '\u{1F4FA}', base: 110_000, boost: 0.13, brand: 8 },
  { id: 'sponsor', label: (b) => `Sponsor the Local ${localSport(b.countryId).replace(/\b\w/g, (x) => x.toUpperCase())}`, emoji: '\u{1F3DF}\u{FE0F}', base: 60_000, boost: 0.06, brand: 10 },
]

const CAMPAIGN_TEXT: Record<string, (name: string) => string> = {
  social: (n) => `${n}'s posts got shared, stitched and meme'd.`,
  radio: (n) => `${n}'s jingle is now stuck in every commuter's head. Sorry, commuters.`,
  billboards: (n) => `${n}'s billboards went up along the busiest roads in town.`,
  influencers: (n) => `A dozen influencers unboxed, tasted or reviewed ${n} with suspicious enthusiasm.`,
  tv: (n) => `${n}'s commercial aired in prime time. Your mom called to say she saw it.`,
  sponsor: (n) => `${n}'s logo is on the jerseys now. The fans chant your name. Well, the team's.`,
}

function campaignAction(a: Asset, c: Campaign, b0: BizState): MenuAction {
  return act(a, `campaign.${c.id}`, c.label(b0), c.emoji, {
    hint: (g) => {
      if (!hinting(g, live(g, a))) return null
      const best = bestCampaign(g, live(g, a))
      return best && best.id === c.id ? talentHint(g, 'Business', `Best campaign right now: about ${money(best.value)} back on top of its cost`) : null
    },
    subtitle: (g) => `${money(adCost(readBiz(g, a), c.base))} · +${Math.round(c.boost * 100)}% customers this year`,
    run: (g, cur, b) => {
      if (!useYearAction(g, `biz.campaign.${cur.id}`, 2)) return tooBusy(g, 'run two campaigns for this company')
      const cost = adCost(b, c.base)
      if (b.cash < cost) return noCash(g, cur, cost, 'the campaign')
      b.cash -= cost
      b.yearCosts += cost
      if (c.id === 'influencers' && chance(g, INFLUENCER_FAIL)) {
        b.brand = clampN(b.brand - 6, 0, 100)
        notice(g, 'Influencer Fail', `One of your influencers posted the ad with the brief still in the caption ("say it's life-changing lol"). The internet noticed. Brand down to ${b.brand}%.`, { emoji: '\u{1F926}', tone: 'bad' })
        return
      }
      const viral = c.id === 'social' && chance(g, VIRAL_P)
      const boost = c.boost * (0.8 + rand(g) * 0.4) * (viral ? 2.5 : 1)
      b.campaignBoost = clampN(b.campaignBoost + boost, 0, 0.6)
      b.brand = clampN(b.brand + c.brand + (viral ? 6 : 0), 0, 100)
      log(g, `I ran a ${c.label(b).toLowerCase()} for ${cur.name}.`)
      notice(g, viral ? 'Gone Viral!' : 'Campaign Launched', `${CAMPAIGN_TEXT[c.id]?.(cur.name) ?? ''} Cost: ${formatMoney(cost)}. Expect about ${Math.round(boost * 100)}% more customers this year; brand is up to ${b.brand}%.`, {
        emoji: c.emoji,
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

/** Next year's expected profit at each marketing budget, plus the brand each builds for later. */
function budgetValues(g: GameState, a: Asset): Record<string, number> {
  return cachedHint(g, a, 'budget', () => {
    const b = readBiz(g, a)
    const w = bizWorth(g, b)
    const out: Record<string, number> = {}
    for (const x of BUDGETS) {
      const p = bestPlan(g, { ...b, marketingLevel: x.level }, { fast: true })
      out[String(x.level)] = p.profit + (x.level - b.marketingLevel) * 8 * w.brand * TARGET_SHARE
    }
    return out
  })
}

function bestBudget(g: GameState, a: Asset): { level: number; gain: number } {
  const v = budgetValues(g, a)
  const cur = readBiz(g, a).marketingLevel
  let level = cur
  for (const x of BUDGETS) if ((v[String(x.level)] ?? -Infinity) > (v[String(level)] ?? -Infinity) + 1) level = x.level
  return { level, gain: (v[String(level)] ?? 0) - (v[String(cur)] ?? v[String(level)] ?? 0) }
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
      if (!hinting(g, cur) || isStudio(readBiz(g, cur))) return null
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
      for (const c of CAMPAIGNS) nodes.push(campaignAction(a, c, b))
      nodes.push({ type: 'heading', id: `biz.budgetH.${a.id}`, label: 'Yearly budget' })
      for (const x of BUDGETS) {
        nodes.push(
          act(a, `budget.${x.level}`, `${x.label}${budgetLabel(b.marketingLevel) === x.label ? ' (current)' : ''}`, x.level === 0 ? '\u{1F507}' : x.level >= 2 ? '\u{1F4E2}' : '\u{1F509}', {
            subtitle: `${pct(def.marketingShare * x.level, 1)} of sales`,
            hint: (gg) => {
              const cur = live(gg, a)
              if (!hinting(gg, cur) || isStudio(readBiz(gg, cur))) return null
              const best = bestBudget(gg, cur)
              if (best.level !== x.level) return null
              return talentHint(gg, 'Business', best.level === readBiz(gg, cur).marketingLevel ? 'Best budget: keep it here' : `Best budget: about ${money(best.gain)} more profit a year, brand included`)
            },
            run: (gg, cur, bb) => {
              bb.marketingLevel = x.level
              notice(gg, 'Marketing Budget', `${cur.name} will now spend ${pct(def.marketingShare * x.level, 1)} of its sales on marketing.`, { emoji: '\u{1F4E3}' })
            },
          }),
        )
      }
      return nodes
    },
  }
}

// ---------------------------------------------------------------------------
// Products

function rdCost(b: BizState): number {
  const e = localEcon(b.industry, b.countryId, b.city)
  return Math.round(Math.max(e.capital * 0.12, Math.max(0, b.last?.revenue ?? 0) * 0.05))
}

/** Chance a launch works (the same odds launchProduct rolls). */
export function launchP(g: GameState, b: BizState): number {
  return clampN(0.25 + ceoSkill(g, b) / 250 + b.quality / 300 + 0.1 * staffPower(b, 'quality'), 0.1, 0.9)
}

/** A hit (15% of launches) is 1.8x the boost and 8 brand instead of 3. */
const HIT_P = 0.15

/**
 * Expected value of launching a product now: the extra demand while it's fresh (fading 10% a
 * year, capped across all lines) and the brand, against the R&D bill and the odds of a flop.
 */
function launchValue(g: GameState, b: BizState): { value: number; p: number } {
  const def = industryDef(b.industry)
  const w = bizWorth(g, b)
  const p = launchP(g, b)
  const boost = 0.1 * (0.6 + def.growth) * (1 + HIT_P * 0.8)
  const now = productsBoost(b, g.year)
  const after = productsBoost({ ...b, products: [...b.products, { name: '·', launched: g.year, boost }] }, g.year)
  const lifetime = 3.3
  const win = (after - now) * w.contrib * lifetime + fxValue(g, b, w, { brand: 3 * (1 - HIT_P) + 8 * HIT_P })
  const value = p * win + (1 - p) * fxValue(g, b, w, { brand: -2 }) - rdCost(b)
  return { value, p }
}

function productsMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.products.${a.id}`,
    label: 'Products',
    emoji: '\u{1F9EA}',
    subtitle: (g) => {
      const n = readBiz(g, a).products.length
      return n ? `${plural(n, 'product line')}` : 'Launch something new'
    },
    disabledReason: (g) => manageBlock(g, a),
    hint: (g) => {
      const cur = live(g, a)
      if (!hinting(g, cur)) return null
      const b = readBiz(g, cur)
      if (b.products.length >= 6) return talentHint(g, 'Business', 'Retire your most faded line to make room for a fresh one')
      const v = cachedHint(g, cur, 'launch', () => launchValue(g, b))
      return talentHint(g, 'Business', v.value > 0 ? `Launch something this year: about ${aPct(v.p)} chance it works, worth ${money(v.value)} on average` : 'Hold off on launches: the R&D would cost more than a new line earns')
    },
    header: (g) => `R&D for a launch costs about ${money(rdCost(readBiz(g, a)))}. Success depends on whoever runs the company, product quality and your quality team. Fresh products draw customers; old ones fade.`,
    children: (g) => {
      const b = readBiz(g, a)
      const def = industryDef(b.industry)
      const nodes: MenuNode[] = []
      if (b.products.length) {
        nodes.push({ type: 'heading', id: `biz.prodH.${a.id}`, label: 'Current lines' })
        const faded = [...b.products].sort((x, y) => x.boost * Math.max(0.25, 1 - 0.1 * (g.year - x.launched)) - y.boost * Math.max(0.25, 1 - 0.1 * (g.year - y.launched)))[0]
        for (const p of b.products) {
          nodes.push(
            act(a, `retire.${p.name}`, p.name, '\u{1F4E6}', {
              hint: (gg) => (b.products.length >= 6 && faded?.name === p.name && hinting(gg, live(gg, a)) ? talentHint(gg, 'Business', 'Retire this one to make room: it barely moves demand now') : null),
              subtitle: `Launched ${p.launched} · +${Math.round(p.boost * Math.max(0.25, 1 - 0.1 * Math.max(0, g.year - p.launched)) * 100)}% demand · tap to retire`,
              confirm: () => `Retire the ${p.name} line?`,
              run: (gg, cur, bb) => {
                bb.products = bb.products.filter((x) => x.name !== p.name)
                notice(gg, 'Line Retired', `${cur.name} discontinued ${p.name}. A few loyal fans are writing angry letters.`, { emoji: '\u{1F4E6}' })
              },
            }),
          )
        }
      }
      nodes.push({ type: 'heading', id: `biz.launchH.${a.id}`, label: 'Launch a new product' })
      const ideas = def.products.filter((x) => !b.products.some((p) => p.name === x))
      for (const idea of ideas) {
        nodes.push(
          act(a, `launch.${idea}`, idea, '\u{1F680}', {
            hint: (gg) => {
              const cur = live(gg, a)
              if (idea !== ideas[0] || !hinting(gg, cur)) return null
              const bb = readBiz(gg, cur)
              if (bb.products.length >= 6) return null
              const v = cachedHint(gg, cur, 'launch', () => launchValue(gg, bb))
              return v.value > 0 ? talentHint(gg, 'Business', `Launch this one next: about ${aPct(v.p)} chance it works, worth ${money(v.value)} on average`) : null
            },
            subtitle: `R&D about ${money(rdCost(b))}`,
            disabled: (_g, bb) => (bb.products.length >= 6 ? 'Six product lines is plenty. Retire one first.' : null),
            run: (gg, cur, bb) => launchProduct(gg, cur, bb, idea),
          }),
        )
      }
      return nodes
    },
  }
}

function launchProduct(g: GameState, a: Asset, b: BizState, idea: string): void {
  if (!useYearAction(g, `biz.launch.${a.id}`, 1)) return tooBusy(g, `launched a product at ${a.name}`)
  const cost = rdCost(b)
  if (b.cash < cost) return noCash(g, a, cost, 'the R&D')
  b.cash -= cost
  b.yearCosts += cost
  const def = industryDef(b.industry)
  const p = launchP(g, b)
  if (!chance(g, p)) {
    b.brand = clampN(b.brand - 2, 0, 100)
    log(g, `${a.name}'s ${idea} flopped.`, 'bad')
    notice(g, 'Flop', `${idea} launched to a deafening silence. ${formatMoney(cost)} of R&D, gone. The warehouse is full of merch nobody wants.`, { emoji: '\u{1F4A5}', tone: 'bad' })
    return
  }
  const hit = chance(g, HIT_P)
  const boost = Math.round((0.05 + rand(g) * 0.1) * (0.6 + def.growth) * (hit ? 1.8 : 1) * 1000) / 1000
  b.products.push({ name: idea, launched: g.year, boost })
  b.brand = clampN(b.brand + (hit ? 8 : 3), 0, 100)
  log(g, `${a.name} launched ${idea}${hit ? ' and it was a smash hit' : ''}.`, 'good')
  notice(g, hit ? 'Smash Hit!' : 'Product Launched', `${idea} is out (${formatMoney(cost)} in R&D). ${hit ? 'Customers are lining up around the block.' : 'Early reviews are solid.'} Expect about ${Math.round(boost * 100)}% more demand while it's fresh.`, {
    emoji: hit ? '\u{1F525}' : '\u{1F680}',
    tone: 'good',
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
      const upgrade = Math.round(equipmentValue(b) * 0.12)
      const training = Math.round(Math.max(1, b.employees) * 450 * localEcon(b.industry, b.countryId, b.city).level)
      const worth = (gg: GameState, fx: Parameters<typeof fxValue>[3]) => {
        const bb = readBiz(gg, live(gg, a))
        return fxValue(gg, bb, bizWorth(gg, bb), fx)
      }
      const worthIt = (gg: GameState, v: number) => talentHint(gg, 'Business', v > 0 ? `Worth it: about ${money(v)} more than it costs` : 'Not worth it yet: it costs more than the quality brings in')
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
          hint: (gg) => (hinting(gg, live(gg, a)) ? worthIt(gg, worth(gg, { cash: -upgrade, quality: 8.5 })) : null),
          subtitle: `About ${money(upgrade)}`,
          run: (gg, cur, bb) => {
            if (!useYearAction(gg, `biz.upgrade.${cur.id}`, 1)) return tooBusy(gg, `upgraded ${cur.name}'s equipment`)
            const cost = Math.round(equipmentValue(bb) * 0.12)
            if (bb.cash < cost) return noCash(gg, cur, cost, 'new equipment')
            bb.cash -= cost
            bb.yearCosts += cost
            const gain = randInt(gg, 6, 11)
            bb.quality = clampN(bb.quality + gain, 0, 100)
            notice(gg, 'Upgraded', `Shiny new equipment at ${cur.name} (${formatMoney(cost)}). Quality is up to ${bb.quality}%.`, { emoji: '\u{1F6E0}\u{FE0F}', tone: 'good' })
          },
        }),
        act(a, 'training', 'Staff Training Program', '\u{1F393}', {
          hint: (gg) => (hinting(gg, live(gg, a)) ? worthIt(gg, worth(gg, { cash: -training, quality: 4.5, morale: 3.5 })) : null),
          subtitle: `About ${money(training)}`,
          run: (gg, cur, bb) => {
            if (!useYearAction(gg, `biz.training.${cur.id}`, 1)) return tooBusy(gg, `run a training program at ${cur.name}`)
            const cost = Math.round(Math.max(1, bb.employees) * 450 * localEcon(bb.industry, bb.countryId, bb.city).level)
            if (bb.cash < cost) return noCash(gg, cur, cost, 'the training')
            bb.cash -= cost
            bb.yearCosts += cost
            bb.quality = clampN(bb.quality + randInt(gg, 3, 6), 0, 100)
            bb.morale = clampN(bb.morale + randInt(gg, 2, 5), 0, 100)
            notice(gg, 'Training Done', `Everyone at ${cur.name} sat through a training program (${formatMoney(cost)}). Quality ${bb.quality}%, morale ${bb.morale}%.`, { emoji: '\u{1F393}', tone: 'good' })
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

/** Years one more location in a city takes to pay for itself (Infinity: never), from the planner. */
function payback(g: GameState, a: Asset, countryId: string, city: string): number {
  return cachedHint(g, a, `payback.${countryId}.${city}`, () => {
    const b = readBiz(g, a)
    if (!isIndustryLegal(countryId, b.industry)) return Infinity
    const base = cachedHint(g, a, 'payback.base', () => bestPlan(g, b, { fast: true }).profit)
    const outlets = b.outlets.some((o) => o.countryId === countryId && o.city === city)
      ? b.outlets.map((o) => (o.countryId === countryId && o.city === city ? { ...o, count: o.count + 1 } : o))
      : [...b.outlets, { countryId, city, count: 1, opened: g.year }]
    const gain = bestPlan(g, { ...b, outlets }, { fast: true }).profit - base
    return gain > 0 ? expansionCost(b, countryId, city, 1) / gain : Infinity
  })
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

function openAction(a: Asset, countryId: string, city: string): MenuAction {
  return act(a, `open.${countryId}.${city}`, city, '\u{1F4CD}', {
    hint: (g) => {
      const cur = live(g, a)
      if (!hinting(g, cur) || isStudio(readBiz(g, cur))) return null
      const b = readBiz(g, cur)
      if (countryId === b.countryId) {
        const best = bestHomeCity(g, cur)
        return best && best.city === city ? talentHint(g, 'Business', `Best place to expand: a new location here pays for itself in ${yearsText(best.years)}`) : null
      }
      const years = payback(g, cur, countryId, city)
      return years <= PAYBACK_MAX ? talentHint(g, 'Business', `Pays for itself in ${yearsText(years)}`) : null
    },
    subtitle: (g) => {
      const b = readBiz(g, a)
      const here = b.outlets.find((o) => o.countryId === countryId && o.city === city)?.count ?? 0
      return `${money(expansionCost(b, countryId, city, 1))} each${here ? ` · ${here} here now` : ''}`
    },
    input: { kind: 'number', label: 'How many new locations?', min: 1, max: 25, defaultValue: () => '1' },
    run: (g, cur, b, input) => {
      const n = Math.round(clampN(Number(input) || 1, 1, 25))
      if (!isIndustryLegal(countryId, b.industry)) {
        notice(g, 'Not Allowed', `${industryDef(b.industry).label}s aren't allowed in ${getCountry(countryId).name}.`, { emoji: '\u{26D4}' })
        return
      }
      if (!useYearAction(g, `biz.expand.${cur.id}`, 3)) return tooBusy(g, `expanded ${cur.name} three times`)
      const cost = expansionCost(b, countryId, city, n)
      if (b.cash < cost) return noCash(g, cur, cost, `${plural(n, 'new location')}`)
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
      if (!isIndustryLegal(countryId, b.industry)) return 'Not allowed there'
      const d = industryDemand(countryId, b.industry)
      return `Demand ${d >= 1.3 ? 'high' : d <= 0.7 ? 'low' : 'normal'} · tax ${Math.round(marketOf(countryId).corporateTax * 100)}%`
    },
    disabledReason: (g) => {
      const b = readBiz(g, a)
      return isIndustryLegal(countryId, b.industry) ? null : `${industryDef(b.industry).label}s are not allowed in ${country.name}. ${marketOf(countryId).businessNote}`
    },
    header: () => marketOf(countryId).businessNote,
    hint: (g) => {
      const cur = live(g, a)
      if (!hinting(g, cur) || isStudio(readBiz(g, cur))) return null
      const best = bestAbroad(g, cur)
      return best && best.countryId === countryId ? talentHint(g, 'Business', `Best market abroad: a location in ${best.city} pays for itself in ${yearsText(best.years)}`) : null
    },
    children: () => country.cities.slice(0, 8).map((city) => openAction(a, countryId, city)),
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

function closeOutletAction(a: Asset, countryId: string, city: string): MenuAction {
  return act(a, `closeOutlet.${countryId}.${city}`, `Close in ${city}`, '\u{1F6AB}', {
    subtitle: (g) => {
      const o = readBiz(g, a).outlets.find((x) => x.countryId === countryId && x.city === city)
      return `${o?.count ?? 0} here · sell off the fit-out for about 35% of cost`
    },
    disabled: (_g, b) => (totalOutlets(b) <= 1 ? 'This is your last location. Close the whole business instead.' : null),
    input: { kind: 'number', label: 'How many to close?', min: 1, max: 100, defaultValue: () => '1' },
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
      if (!hinting(g, cur) || isStudio(readBiz(g, cur))) return null
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
      for (const city of home.cities.slice(0, 10)) nodes.push(openAction(a, b.countryId, city))
      nodes.push({ type: 'heading', id: `biz.abroadH.${a.id}`, label: 'Go international' }, abroadMenu(a))
      if (totalOutlets(b) > 1) {
        nodes.push({ type: 'heading', id: `biz.closeH.${a.id}`, label: 'Close locations' })
        for (const o of b.outlets) nodes.push(closeOutletAction(a, o.countryId, o.city))
      }
      return nodes
    },
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
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
      if (!useYearAction(g, `biz.consultant.${cur.id}`, 1)) return tooBusy(g, `hired a consultant for ${cur.name}`)
      const fee = adCost(b, 6_000)
      if (b.cash < fee) return noCash(g, cur, fee, 'the consultant')
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
        `For ${formatMoney(fee)}, a consultant in a very expensive suit studied ${cur.name}. They reckon the sweet spot is about ${best.price >= 100 ? money(best.price) : `$${best.price.toFixed(2)}`} per ${def.unitOne}, selling roughly ${units(best.units)} ${def.unit} this year. ${tip}`,
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
      notice(g, b.insured ? 'Insured' : 'Insurance Canceled', b.insured ? `${cur.name} is now insured against fire, flood and lawsuits for ${formatMoney(insurancePremiumFor(b))} a year.` : `You canceled ${cur.name}'s insurance. Feeling lucky?`, { emoji: '\u{1F6E1}\u{FE0F}' })
    },
  })
}

// ---------------------------------------------------------------------------
// Money

/**
 * What the owner may take out: cash beyond the company's loans and anything earmarked for
 * unreleased games. Paying out borrowed money and then declaring bankruptcy would let the
 * owner keep the loan, so lenders (and the game) don't allow it.
 */
function payable(a: Asset, b: BizState): number {
  return Math.max(0, b.cash - earmarkedCash(a) - b.debt)
}

function payoutBlocked(a: Asset, b: BizState): string | null {
  if (b.cash <= 0) return 'The company has no spare cash.'
  if (b.cash - earmarkedCash(a) <= 0) return 'Its cash is advances and pledges for games still in development. That money funds the games; it is not profit yet.'
  if (payable(a, b) <= 0) return `The company owes ${money(b.debt)} in loans. Its lenders won't let cash go to the owner until the debt is covered.`
  return null
}

function moneyNodes(a: Asset, g: GameState): MenuNode[] {
  const b = readBiz(g, a)
  const nodes: MenuNode[] = [
    act(a, 'inject', 'Invest My Own Money', '\u{1F4E5}', {
      subtitle: 'Move savings into company cash',
      disabled: (gg) => (gg.character.money <= 0 ? "You don't have any money to put in." : null),
      input: { kind: 'number', label: 'How much?', min: 1, max: Math.max(1, Math.round(g.character.money)), defaultValue: (gg) => String(Math.max(1, Math.round(Math.min(gg.character.money, Math.max(1_000, -b.cash))))) },
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
      subtitle: earmarkedCash(a) > 0 ? `Taxed as income · ${money(earmarkedCash(a))} of advances and pledges is set aside for unreleased games` : b.share < 1 ? `You get ${pct(b.share)} of any payout (taxed as income)` : 'Taxed as income',
      disabled: (_gg, bb) => payoutBlocked(a, bb),
      input: { kind: 'number', label: 'Total payout', min: 1, max: Math.max(1, Math.round(payable(a, b))), defaultValue: () => String(Math.max(1, Math.round(payable(a, b) * 0.25))) },
      run: (gg, cur, bb, input) => {
        const n = amount(input, payable(cur, bb))
        if (n <= 0) return
        bb.cash -= n
        const mine = Math.round(n * bb.share)
        earnIncome(gg, mine)
        bb.valuation = valuationOf(bb)
        refreshValue(cur, bb)
        log(gg, `I paid myself ${money(mine)} from ${cur.name}.`, 'good')
        notice(gg, 'Payday', `${cur.name} paid out ${formatMoney(n)}${bb.share < 1 ? `; your ${pct(bb.share)} share is ${formatMoney(mine)}` : ''}. It will be taxed as income at the end of the year.`, { emoji: '\u{1F4E4}', tone: 'good' })
      },
    }),
    act(a, 'borrow', 'Take a Company Loan', '\u{1F3E6}', {
      subtitle: (gg) => {
        const bb = readBiz(gg, a)
        return `Up to ${money(companyCreditLimit(bb))} at ${pct(companyLoanRate(bb), 1)} (${getCountry(bb.countryId).name} rates)`
      },
      disabled: (_gg, bb) => (companyCreditLimit(bb) < 1_000 ? 'No bank will lend this company more right now.' : null),
      input: { kind: 'number', label: 'How much?', min: 1, max: Math.max(1, companyCreditLimit(b)), defaultValue: () => String(Math.max(1, Math.round(companyCreditLimit(b) / 2))) },
      run: (gg, cur, bb, input) => {
        if (!useYearAction(gg, `biz.borrow.${cur.id}`, 2)) return tooBusy(gg, `asked the bank for money twice for ${cur.name}`)
        const n = amount(input, companyCreditLimit(bb))
        if (n <= 0) return
        const rate = companyLoanRate(bb)
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
        input: { kind: 'number', label: 'Repay how much?', min: 1, max: Math.max(1, Math.round(Math.min(b.debt, Math.max(0, b.cash)))), defaultValue: () => String(Math.max(1, Math.round(Math.min(b.debt, Math.max(0, b.cash))))) },
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
  return [
    act(a, 'salary', 'Set My Salary', '\u{1F4B5}', {
      subtitle: `Now ${money(b.ownerSalary)}/yr · typical here ${money(ceoPayNorm(b))}`,
      input: { kind: 'number', label: 'Yearly salary', min: 0, max: maxOwnerSalary(b), defaultValue: () => String(b.ownerSalary) },
      run: (gg, cur, bb, input) => {
        const n = amount(input, maxOwnerSalary(bb))
        bb.ownerSalary = n
        const job = ceoJob(gg, cur.id)
        if (job) job.salary = n
        notice(gg, 'Salary Set', `You'll pay yourself ${formatMoney(n)} a year from ${cur.name}'s cash (taxed as income).${n > ceoPayNorm(bb) * 2 ? ' The staff have noticed.' : ''}`, { emoji: '\u{1F4B5}' })
      },
    }),
    act(a, 'bonus', 'Take a Bonus', '\u{1F911}', {
      subtitle: 'A one-off payout to yourself (taxed as income)',
      disabled: (_gg, bb) => payoutBlocked(a, bb),
      input: { kind: 'number', label: 'Bonus amount', min: 1, max: Math.max(1, Math.round(Math.min(payable(a, b), maxOwnerSalary(b)))), defaultValue: () => String(Math.max(1, Math.round(Math.min(payable(a, b) * 0.1, maxOwnerSalary(b) / 4)))) },
      run: (gg, cur, bb, input) => {
        if (!useYearAction(gg, `biz.bonus.${cur.id}`, 1)) return tooBusy(gg, 'taken a bonus')
        const n = amount(input, Math.min(payable(cur, bb), maxOwnerSalary(bb)))
        if (n <= 0) return
        bb.cash -= n
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

const MANAGER_PICK = defineScript('business.manager', (g, choice, data) => {
  const d = rec(data)
  const a = findBusiness(g, str(d?.assetId))
  if (!a || !d || choice === 'cancel') return
  const b = bizOf(g, a)
  const list = Array.isArray(d.candidates) ? d.candidates : []
  const raw = rec(list[Number(choice.replace('m', ''))])
  if (!raw) return
  const m: Manager = {
    firstName: str(raw.firstName, 'Pat'),
    lastName: str(raw.lastName, 'Morgan'),
    gender: raw.gender === 'female' ? 'female' : 'male',
    skill: clampN(num(raw.skill, 55), 0, 100),
    salary: Math.max(0, num(raw.salary)),
    since: g.year,
  }
  const wasCeo = runsIt(g, a)
  if (wasCeo) stepDown(g, a, b, m)
  else installManager(g, b, m)
  log(g, `${managerName(m)} became general manager of ${a.name}.`)
  notice(
    g,
    'New General Manager',
    `${managerName(m)} (skill ${m.skill}/100, ${formatMoney(m.salary)} a year) now runs ${a.name} day to day.${wasCeo ? ' You stepped down as CEO but still own the company, so you are free to take another job.' : ''}`,
    { emoji: '\u{1F9D1}\u{200D}\u{1F4BC}' },
  )
})

/**
 * A general manager's yearly worth: their skill lifts sales (customers notice a well-run place),
 * trims overhead and sets the mood, against their salary.
 */
export function managerValue(w: Worth, m: Manager): number {
  return m.skill * (w.contrib / 1500 + w.overhead / 1000 + w.moraleTarget / 12 / LASTING_YEARS) - m.salary
}

function pickManager(g: GameState, a: Asset, b: BizState): void {
  const list = [managerCandidate(g, b, randInt(g, 38, 58)), managerCandidate(g, b, randInt(g, 55, 75)), managerCandidate(g, b, randInt(g, 72, 95))]
  const choices: ChoiceOption[] = [...list.map((m, i) => ({ id: `m${i}`, label: `${managerName(m)} · ${m.skill}/100 · ${money(m.salary)}`, emoji: m.gender === 'female' ? '\u{1F469}\u{200D}\u{1F4BC}' : '\u{1F468}\u{200D}\u{1F4BC}' })), { id: 'cancel', label: 'Never mind', emoji: '\u{2716}\u{FE0F}' }]
  if (hasTalent(g, 'Business')) {
    const w = bizWorth(g, b)
    const values = list.map((m) => managerValue(w, m))
    markBest(g, choices, (id) => (id.startsWith('m') ? (values[Number(id.slice(1))] ?? null) : null), () => 'Best pick: the most company for the money')
  }
  scriptChoice(
    g,
    MANAGER_PICK,
    'Hire a General Manager',
    `A headhunter in ${b.city} sent over three candidates to run ${a.name}:\n${list.map((m) => `• ${managerName(m)}: skill ${m.skill}/100, wants ${formatMoney(m.salary)} a year`).join('\n')}`,
    choices,
    { emoji: '\u{1F9D1}\u{200D}\u{1F4BC}', data: { assetId: a.id, candidates: toJson(list) } },
  )
}

function leadershipNodes(a: Asset, g: GameState): MenuNode[] {
  const b = readBiz(g, a)
  if (runsIt(g, a)) {
    return [
      act(a, 'stepDown', 'Step Down as CEO', '\u{1FA91}', {
        subtitle: 'Hire a general manager and become a passive owner',
        run: (gg, cur, bb) => pickManager(gg, cur, bb),
      }),
    ]
  }
  const job = g.character.job
  const title = b.founderName && b.founderName === `${g.character.firstName} ${g.character.lastName}` && !b.acquired ? 'Founder & CEO' : 'Owner & CEO'
  return [
    act(a, 'takeOver', 'Run It Myself (Become CEO)', '\u{1F454}', {
      subtitle: b.manager ? `Replace ${managerName(b.manager)} and take charge` : 'Take charge day to day',
      confirm: () => (job ? `Become CEO of ${a.name}? You'll leave your job as ${job.title}.` : null),
      run: (gg, cur, bb) => {
        const quit = becomeCeo(gg, cur, bb, title)
        log(gg, `I took over as CEO of ${cur.name}.`, 'good')
        notice(gg, 'In Charge', `You're now ${title} of ${cur.name}${quit ? ` (you left your job as ${quit})` : ''}. Your salary is ${formatMoney(bb.ownerSalary)} a year; change it any time.`, { emoji: '\u{1F454}', tone: 'good' })
      },
    }),
    act(a, 'replaceManager', 'Replace the General Manager', '\u{1F504}', {
      subtitle: b.manager ? `${managerName(b.manager)} · skill ${b.manager.skill}/100 · ${money(b.manager.salary)}/yr` : 'Hire someone to run it',
      run: (gg, cur, bb) => {
        if (!useYearAction(gg, `biz.mgr.${cur.id}`, 1)) return tooBusy(gg, `reshuffled ${cur.name}'s management`)
        pickManager(gg, cur, bb)
      },
    }),
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
  sellBusiness(g, a, b, num(o.amount), str(o.buyer, 'a buyer'))
})

function makeOffers(g: GameState, b: BizState): Offer[] {
  const v = Math.max(5_000, b.valuation)
  const def = industryDef(b.industry)
  const f = (lo: number, hi: number) => Math.round((v * (lo + (hi - lo) * rand(g))) / 100) * 100
  const offers: Offer[] = [
    { buyer: `a rival ${def.label.toLowerCase()} chain`, amount: f(0.78, 1.05) },
    { buyer: `${investorFirm(b.countryId, rand(g), rand(g))} (private equity)`, amount: f(0.88, 1.15) },
  ]
  if (v >= 2_000_000 || chance(g, 0.4)) offers.push({ buyer: conglomerate(rand(g), rand(g)), amount: f(0.95, 1.28) })
  if (chance(g, 0.5)) offers.push({ buyer: 'a local tycoon', amount: f(0.72, 1.12) })
  return offers.sort((x, y) => y.amount - x.amount)
}

function exitNodes(a: Asset, g: GameState): MenuNode[] {
  const b = readBiz(g, a)
  const nodes: MenuNode[] = []
  if (!b.public) {
    nodes.push(
      act(a, 'sell', 'Sell the Company', '\u{1F3F7}\u{FE0F}', {
        subtitle: `Valued at about ${money(b.valuation)}${b.share < 1 ? ` (your ${pct(b.share)}: ${money(b.valuation * b.share)})` : ''}`,
        run: (gg, cur, bb) => {
          if (!useYearAction(gg, `biz.sell.${cur.id}`, 2)) return tooBusy(gg, `shopped ${cur.name} around twice`)
          const offers = makeOffers(gg, bb)
          const choices: ChoiceOption[] = [...offers.map((o, i) => ({ id: `o${i}`, label: `${money(o.amount)} from ${o.buyer}`, emoji: '\u{1F4B5}' })), { id: 'keep', label: 'Keep it', emoji: '\u{2716}\u{FE0F}' }]
          if (hasTalent(gg, 'Business')) {
            // A sale is worth what it beats the company's value by; cooked books can sink it
            // (40%), and half the time the buyer calls the prosecutors.
            const w = bizWorth(gg, bb)
            const sale = (amount: number) =>
              bb.cooked > 0 ? (1 - SALE_COLLAPSE) * (amount - bb.valuation) * bb.share + SALE_COLLAPSE * fxValue(gg, bb, w, { brand: -15, arrest: 0.5 * 3 }) : (amount - bb.valuation) * bb.share
            markBest(gg, choices, (id) => (id === 'keep' ? 0 : id.startsWith('o') ? sale(offers[Number(id.slice(1))]?.amount ?? 0) : null), (id) =>
              id === 'keep' ? 'Best move: every offer is below what it is worth to you' : 'Best offer: the most money above what the company is worth',
            )
          }
          scriptChoice(
            gg,
            SELL,
            `Sell ${cur.name}`,
            `Your broker collected offers for the whole company (valued at about ${money(bb.valuation)}).${bb.share < 1 ? ` You own ${pct(bb.share)}, so that's your cut.` : ''}`,
            choices,
            { emoji: '\u{1F91D}', data: { assetId: cur.id, offers: toJson(offers) } },
          )
        },
      }),
      act(a, 'ipo', 'Go Public (IPO)', '\u{1F514}', {
        subtitle: (gg) => canIpo(readBiz(gg, a)) ?? `List on the ${marketOf(b.countryId).exchange?.code ?? 'regional exchange'}`,
        disabled: (_gg, bb) => canIpo(bb),
        confirm: () => `Take ${a.name} public? You'll sell a quarter of the company to the market and answer to shareholders from now on.`,
        run: (gg, cur, bb) => goPublic(gg, cur, bb),
      }),
    )
  } else {
    nodes.push(
      act(a, 'sellShares', 'Sell Shares', '\u{1F4C8}', {
        subtitle: `$${b.sharePrice.toFixed(2)}/share · your stake ${money(b.valuation * b.share)}`,
        input: { kind: 'number', label: 'Percent of your shares to sell', min: 1, max: 100, defaultValue: () => '10' },
        run: (gg, cur, bb, input) => {
          if (!useYearAction(gg, `biz.shares.${cur.id}`, 2)) return tooBusy(gg, 'sold shares twice')
          sellShares(gg, cur, bb, clampN(Number(input) || 0, 0, 100) / 100)
        },
      }),
    )
  }
  nodes.push(
    act(a, 'close', 'Close the Business', '\u{1F6AA}', {
      subtitle: 'Sell the equipment, pay the debts, lock the doors',
      confirm: (gg) => {
        const bb = readBiz(gg, a)
        return `Close ${a.name} for good? The fit-out sells for about ${money(equipmentValue(bb) * 0.35)}; debts of ${money(bb.debt)} get paid first.`
      },
      run: (gg, cur, bb) => closeBusiness(gg, cur, bb, equipmentValue(bb) * 0.35 + bb.inventory * localEcon(bb.industry, bb.countryId, bb.city).unitCost * 0.3),
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

export function infoRows(g: GameState, a: Asset): MenuNode[] {
  const b = readBiz(g, a)
  const def = industryDef(b.industry)
  const m = marketOf(b.countryId)
  const country = getCountry(b.countryId)
  const e = localEcon(b.industry, b.countryId, b.city)
  const rows: string[] = []
  rows.push(`${def.label} · ${b.city}, ${country.name} · ${b.acquired ? 'acquired' : 'founded'} ${b.founded}`)
  if (runsIt(g, a)) rows.push(`Run by you, the CEO · salary ${money(b.ownerSalary)}/yr`)
  else rows.push(b.manager ? `Run by ${managerName(b.manager)} (general manager, skill ${b.manager.skill}/100, ${money(b.manager.salary)}/yr)` : 'No one is running it day to day.')
  rows.push(b.public ? `Listed on the ${b.exchange} at $${b.sharePrice.toFixed(2)} · you own ${pct(b.share, 1)}` : b.share < 1 ? `You own ${pct(b.share)}; investors hold the rest` : 'You own 100%')
  rows.push(`${plural(totalOutlets(b), def.site, def.sitePlural)} · ${b.employees + b.staff.length} staff · morale ${b.morale}%`)
  rows.push(isStudio(b) ? `Studio craft ${b.quality}% · brand ${b.brand}% · morale drives every game you make` : `Quality ${b.quality}% · brand ${b.brand}% · ${b.products.length ? plural(b.products.length, 'product line') : 'no product lines yet'}`)
  if (isStudio(b)) rows.push(studioInfo(g, a))
  else {
    if (isDeepTech(b)) {
      const tech = deepTechInfo(g, a)
      if (tech) rows.push(tech)
    }
    rows.push(`Price ${b.price >= 100 ? money(b.price) : `$${b.price.toFixed(2)}`} per ${def.unitOne} (locals expect about ${e.goingPrice >= 100 ? money(e.goingPrice) : `$${e.goingPrice.toFixed(2)}`}) · plan ${units(b.production)} ${def.unit}`)
  }
  const s = b.last
  if (s) {
    rows.push(`${s.year}: sales ${money(s.revenue)} · ${s.net >= 0 ? 'profit' : 'loss'} ${money(Math.abs(s.net))} · corporate tax ${money(s.corpTax)}${s.salesTax > 0 ? ` · ${m.salesTaxName} remitted ${money(s.salesTax)}` : ''}`)
  } else {
    rows.push(b.openFraction < 1 ? `Opening soon: registration took a while, so this first year is short.` : 'First year of trading. Results come with the Annual Report.')
  }
  rows.push(`${b.public ? 'Market cap' : 'Valuation'} ${money(b.valuation)}${b.share < 1 ? ` (your stake ${money(b.valuation * b.share)})` : ''} · cash ${money(b.cash)}${b.debt > 0 ? ` · debt ${money(b.debt)}` : ''}`)
  rows.push(`${country.name}: corporate tax ${Math.round(m.corporateTax * 100)}%, ${m.salesTaxName} ${Math.round(m.salesTax * 100)}%, typical wage ${money(e.wage)}, inflation ${Math.round(m.inflation * 100)}%. ${m.businessNote}`)
  const emojis = [def.emoji, '\u{1F454}', '\u{1F4DC}', '\u{1F465}', '\u{2728}', '\u{1F3F7}\u{FE0F}', '\u{1F4CA}', '\u{1F4B0}', '\u{1F30D}']
  return rows.map((text, i): MenuNode => ({ type: 'info', id: `biz.info.${a.id}.${i}`, text, emoji: emojis[i] ?? '\u{2139}\u{FE0F}' }))
}

export function businessView(g: GameState, a: Asset): MenuNode[] {
  const nodes: MenuNode[] = [...infoRows(g, a)]
  nodes.push({ type: 'heading', id: `biz.runH.${a.id}`, label: 'Run the Company' })
  if (isStudio(readBiz(g, a))) {
    // Game studios make games: a pipeline, a back catalog and a team instead of price and production.
    nodes.push(...studioNodes(g, a))
    nodes.push(staffMenu(a), marketingMenu(a), expansionMenu(a), insuranceAction(a), cookBooksAction(a))
  } else {
    nodes.push(
      act(a, 'plan', 'Set Price & Production', '\u{1F4CA}', {
        hint: (gg) => {
          const cur = live(gg, a)
          if (!hinting(gg, cur)) return null
          const b = readBiz(gg, cur)
          const p = cachedHint(gg, cur, 'plan', () => bestPlan(gg, b, { quick: true, ownerDraw: runsIt(gg, cur) ? b.ownerSalary : 0 }))
          const close = Math.abs(p.price - b.price) <= Math.max(0.02, b.price * 0.03) && Math.abs(p.production - b.production) <= Math.max(1, p.production * 0.05)
          return talentHint(gg, 'Business', close ? 'Your plan is already close to the sweet spot' : `The report has a better plan for you: about ${money(Math.abs(p.profit))} ${p.profit >= 0 ? 'profit' : 'loss'} next year`)
        },
        subtitle: 'Open the planning report',
        run: (gg, cur, bb) => queueReport(gg, cur, bb),
      }),
    )
    // Deep-tech companies add their R&D lab, funding rounds and the like (business/deeptech.ts).
    if (isDeepTech(readBiz(g, a))) nodes.push(...deepTechNodes(g, a))
    nodes.push(staffMenu(a), marketingMenu(a), productsMenu(a), qualityMenu(a), expansionMenu(a), consultantAction(a), insuranceAction(a), cookBooksAction(a))
  }
  nodes.push({ type: 'heading', id: `biz.moneyH.${a.id}`, label: 'Money' })
  nodes.push(...ceoNodes(a, g), ...moneyNodes(a, g))
  nodes.push({ type: 'heading', id: `biz.leadH.${a.id}`, label: 'Leadership' })
  nodes.push(...leadershipNodes(a, g))
  nodes.push({ type: 'heading', id: `biz.exitH.${a.id}`, label: 'Exit' })
  nodes.push(...exitNodes(a, g))
  return nodes
}

