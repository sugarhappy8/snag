// Politics 2.0 menus: the Politics dashboard, Govern (taxes, budget, trade, laws, a cabinet post)
// and the Abuse of Power extensions (schemes, dirty money, keeping power). Pure: no RNG, no writes;
// every number on a row or a slider caption comes from the same functions the actions resolve with.
import { formatMoney, notice, scriptChoice, useYearAction } from '../core'
import { economyOf } from '../economy'
import { chance } from '../rng'
import { defineScript } from '../scripts'
import { readBiz } from '../business/state'
import type { GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import {
  BUDGET, BUDGET_LINES, GROUP_IDS, GROUPS, INPUT_LABEL, LEGAL, LEGAL_IDS, NEW_TAXES, NEW_TAX_IDS, SECTOR_LABEL, STATE_SECTORS, TARGET_INDUSTRIES, TAXES, TAX_IDS, TRADE_INPUT_IDS,
  budgetAvailable, environmentAvailable, industryAvailable, legalAvailable, newTaxAvailable, partyName, salesTaxLabel, taxAvailable,
  type BudgetLine, type LegalId, type NewTaxId, type Scope, type TariffInput, type TaxId, type TradeInput,
} from './data'
import { sharedBloc } from '../business/market-trade'
import { chargeChance, exposureChance, coupChance } from './consequences'
import { approvalTarget, openReport, ratingFor } from './yearly'
import { governmentSeats, legislatureOf } from './legislature'
import { legalBase } from './laws'
import { measureBlock, partnersOf, previewOf, propose, currentOf, decreeRule, type Measure } from './govern'
import { officeView, powerFor, powerLine, PORTFOLIO_TITLE, PORTFOLIOS, setPortfolio, type OfficeView, type Portfolio } from './office'
import { editMe, meView, policyOf, writeMe } from './state'
import { bringHome, homeCap, launder, launderFronts, launderQuote, moveOffshore, offshoreCaught, OFFSHORE_FEE, runScheme, schemeBlock, schemeQuote, SCHEMES, steerBlock, steerContract, steerQuote, steerTargets } from './graft'
import { persecute, persecuteBlock, persecuteOdds, REGIME, REGIME_IDS, regimeBlock, regimeOdds, rivalTargets, takeStep, mediaCost, securityCost, voteCost } from './regime'

const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`
const signed = (n: number, unit: string) => `${n > 0 ? '+' : ''}${n}${unit}`

function v0(g: GameState): OfficeView | null { return officeView(g) }

/** A slider action that proposes a measure built from the slider value. */
function measureSlider(id: string, label: string, emoji: string, opts: { min: number; max: number; step: number; unit: string; current: (g: GameState) => number; build: (g: GameState, value: number) => Measure; subtitle?: (g: GameState) => string; visible?: (g: GameState) => boolean }): MenuAction {
  return {
    type: 'action', id, label, emoji,
    subtitle: opts.subtitle,
    visible: opts.visible,
    disabledReason: (g) => {
      const v = v0(g)
      if (!v) return 'You need to hold office.'
      const m = opts.build(g, opts.current(g) === opts.min ? opts.max : opts.min)
      const why = measureBlock(g, m, v)
      return why && why !== 'That is already the law.' ? why : null
    },
    input: {
      kind: 'slider', label, min: opts.min, max: opts.max, step: opts.step, unit: opts.unit,
      defaultValue: (g) => String(opts.current(g)),
      preview: (g, value) => {
        const m = opts.build(g, value)
        const why = measureBlock(g, m)
        if (why === 'That is already the law.') return 'This is the law today. Slide to change it.'
        if (why) return why
        const p = previewOf(g, m)
        return p.lines.slice(0, 3).join(' ') || 'Little measurable effect.'
      },
    },
    run: (g, input) => {
      const value = Number(input)
      if (!Number.isFinite(value)) return
      propose(g, opts.build(g, value))
    },
  }
}

function layerName(scope: Scope): string {
  return scope === 'regional' ? 'regional' : scope === 'city' ? 'city' : 'national'
}

// ---------------------------------------------------------------------------
// Taxes

function taxesMenu(): MenuGroup {
  return {
    type: 'menu', id: 'nation.taxes', label: 'Taxes', emoji: '💵',
    visible: (g) => !!powerFor(v0(g), 'tax', decreeRule(g)),
    subtitle: (g) => {
      const v = v0(g), power = powerFor(v, 'tax', decreeRule(g))
      return power ? `${layerName(power.scope)[0].toUpperCase()}${layerName(power.scope).slice(1)} taxes${power.route === 'decree' ? ' · by decree' : ''}` : ''
    },
    header: () => 'Slide to the change you want versus the law as it was. Every bill shows what it would raise and who it would anger.',
    children: (g) => {
      const v = v0(g), power = powerFor(v, 'tax', decreeRule(g))
      if (!v || !power) return []
      const scope = power.scope
      const p = policyOf(g, g.character.countryId)
      const nodes: MenuNode[] = []
      for (const id of TAX_IDS) {
        const def = TAXES[id]
        if (!def.scopes.includes(scope) || !taxAvailable(id, g.year)) continue
        const name = id === 'sales' ? salesTaxLabel(g.character.countryId, g.year) : def.label
        const unit = def.unit === '%' ? '%' : ' pts'
        nodes.push(measureSlider(`nation.tax.${scope}.${id}`, name, def.emoji, {
          min: def.min, max: def.max, step: def.step, unit,
          current: (gg) => currentOf(policyOf(gg, gg.character.countryId), { k: 'tax', scope, id, value: 0 }),
          build: (_gg, value) => ({ k: 'tax', scope, id: id as TaxId, value: Math.round(value / def.step) * def.step }),
          subtitle: () => { const cur = (scope === 'regional' ? p.regional : scope === 'city' ? p.city : p.national).taxes[id] ?? 0; return cur ? `Now ${signed(cur, unit)} vs the old law` : 'At the old rate' },
        }))
      }
      if (scope === 'national') {
        nodes.push({ type: 'heading', id: 'nation.tax.new', label: 'New taxes' })
        for (const id of NEW_TAX_IDS) {
          const def = NEW_TAXES[id]
          if (!newTaxAvailable(id, g.year)) continue
          if (def.targeted) nodes.push(targetedTaxMenu(id))
          else nodes.push(measureSlider(`nation.newtax.${id}`, def.label, def.emoji, {
            min: 0, max: 3, step: 1, unit: '',
            current: (gg) => policyOf(gg, gg.character.countryId).newTaxes[id]?.level ?? 0,
            build: (_gg, value) => ({ k: 'newTax', id: id as NewTaxId, level: Math.round(value), industry: '' }),
            subtitle: () => `${def.blurb} ${p.newTaxes[id]?.level ? `Level ${p.newTaxes[id]!.level} now.` : 'None now.'}`,
          }))
        }
        nodes.push(breaksMenu())
      }
      return nodes
    },
  }
}

function targetedTaxMenu(id: NewTaxId): MenuGroup {
  const def = NEW_TAXES[id]
  return {
    type: 'menu', id: `nation.newtax.${id}`, label: def.label, emoji: def.emoji,
    subtitle: (g) => { const t = policyOf(g, g.character.countryId).newTaxes[id]; return t?.level ? `Level ${t.level} on ${t.industry}` : def.blurb },
    children: (g) => TARGET_INDUSTRIES.filter(i => industryAvailable(i, g.year)).map((industry) => measureSlider(`nation.newtax.${id}.${industry}`, industry, '🏭', {
      min: 0, max: 3, step: 1, unit: '',
      current: (gg) => { const t = policyOf(gg, gg.character.countryId).newTaxes[id]; return t?.industry === industry ? t.level : 0 },
      build: (_gg, value) => ({ k: 'newTax', id, level: Math.round(value), industry }),
    })),
  }
}

function breaksMenu(): MenuGroup {
  return {
    type: 'menu', id: 'nation.breaks', label: 'Tax breaks', emoji: '🎁',
    subtitle: (g) => { const n = Object.keys(policyOf(g, g.character.countryId).breaks).length; return n ? `${n} industr${n === 1 ? 'y' : 'ies'} get a break` : 'Corporate tax relief for one industry' },
    children: (g) => TARGET_INDUSTRIES.filter(i => industryAvailable(i, g.year)).map((industry) => measureSlider(`nation.break.${industry}`, industry, '🎁', {
      min: 0, max: 3, step: 1, unit: '',
      current: (gg) => policyOf(gg, gg.character.countryId).breaks[industry] ?? 0,
      build: (_gg, value) => ({ k: 'break', industry, level: Math.round(value) }),
    })),
  }
}

// ---------------------------------------------------------------------------
// Budget

function budgetMenu(): MenuGroup {
  return {
    type: 'menu', id: 'nation.budget', label: 'Budget', emoji: '🏦',
    visible: (g) => !!powerFor(v0(g), 'budget', decreeRule(g)),
    subtitle: (g) => {
      const e = economyOf(g)
      const d = e.budget?.deficit ?? 0
      return `${d > 0 ? `Deficit ${pct(d, 1)}` : `Surplus ${pct(-d, 1)}`} of GDP · debt ${pct(e.governmentDebt)} · rated ${policyOf(g, g.character.countryId).rating || ratingFor(g, g.character.countryId)}`
    },
    header: () => 'Fund each programme at 50-200% of normal. Spending feeds the industries that supply it; deficits pile up as debt, and a falling credit rating makes debt dearer.',
    children: (g) => {
      const v = v0(g), power = powerFor(v, 'budget', decreeRule(g))
      if (!v || !power) return []
      const scope = power.scope
      return BUDGET_LINES.filter(id => BUDGET[id].scopes.includes(scope) && budgetAvailable(id, g.year)).map((id) => measureSlider(`nation.budget.${scope}.${id}`, BUDGET[id].label, BUDGET[id].emoji, {
        min: 50, max: 200, step: 5, unit: '%',
        current: (gg) => Math.round(currentOf(policyOf(gg, gg.character.countryId), { k: 'budget', scope, id, level: 1 }) * 100),
        build: (_gg, value) => ({ k: 'budget', scope, id: id as BudgetLine, level: Math.round(value) / 100 }),
        subtitle: (gg) => `${BUDGET[id].blurb} Now ${Math.round(currentOf(policyOf(gg, gg.character.countryId), { k: 'budget', scope, id, level: 1 }) * 100)}%.`,
      }))
    },
  }
}

// ---------------------------------------------------------------------------
// Trade

function tariffMenu(input: TariffInput): MenuGroup {
  return {
    type: 'menu', id: `nation.tariff.${input}`, label: input === 'all' ? 'All imports' : INPUT_LABEL[input][0].toUpperCase() + INPUT_LABEL[input].slice(1), emoji: input === 'all' ? '🌐' : input === 'energy' ? '⛽' : input === 'technology' ? '💻' : input === 'essentials' ? '🌾' : '🏭',
    visible: (g) => input !== 'technology' || g.year >= 1955,
    children: (g) => ['all', ...partnersOf(g, input)].map((partner) => measureSlider(`nation.tariff.${input}.${partner}`, partner === 'all' ? 'From everyone' : getCountry(partner).name, partner === 'all' ? '🌍' : getCountry(partner).flag, {
      min: 0, max: 50, step: 5, unit: '%',
      current: (gg) => currentOf(policyOf(gg, gg.character.countryId), { k: 'tariff', input, partner, add: 0 }),
      build: (_gg, value) => ({ k: 'tariff', input, partner, add: Math.round(value / 5) * 5 }),
      subtitle: (gg) => {
        const cur = currentOf(policyOf(gg, gg.character.countryId), { k: 'tariff', input, partner, add: 0 })
        const back = policyOf(gg, gg.character.countryId).retaliation.find(r => r.from === partner && r.until >= gg.year)
        return `${cur ? `Extra tariff ${cur}%` : 'No extra tariff'}${back ? ` · they charge us +${back.add}%` : ''}`
      },
    })),
  }
}

function tradeMenu(): MenuGroup {
  return {
    type: 'menu', id: 'nation.trade', label: 'Trade', emoji: '📦',
    visible: (g) => !!powerFor(v0(g), 'trade', decreeRule(g)),
    subtitle: (g) => {
      const p = policyOf(g, g.character.countryId)
      const bits = [p.tariffs.length ? `${p.tariffs.length} tariff${p.tariffs.length === 1 ? '' : 's'}` : '', Object.keys(p.deals).length ? `${Object.keys(p.deals).length} deal${Object.keys(p.deals).length === 1 ? '' : 's'}` : '', Object.keys(p.sanctions).length ? `${Object.keys(p.sanctions).length} sanctioned` : ''].filter(Boolean)
      return bits.join(' · ') || 'Customs as usual'
    },
    header: (g) => `Tariffs protect home industries and raise prices; partners may hit back. ${powerFor(v0(g), 'trade', decreeRule(g))?.route === 'decree' ? 'You can do this by executive order.' : 'Each change needs a vote.'}`,
    children: () => {
      const nodes: MenuNode[] = [{ type: 'heading', id: 'nation.trade.h1', label: 'Tariffs' }, tariffMenu('all'), ...TRADE_INPUT_IDS.map(tariffMenu)]
      nodes.push({ type: 'heading', id: 'nation.trade.h2', label: 'Deals and sanctions' })
      nodes.push({
        type: 'menu', id: 'nation.deals', label: 'Trade deals', emoji: '🤝',
        children: (gg) => partnersOf(gg).filter(id => !sharedBloc(gg.character.countryId, id, gg.year)).map((partner) => {
          const on = !!policyOf(gg, gg.character.countryId).deals[partner]
          const m: Measure = { k: 'deal', partner, on: !on }
          return { type: 'action', id: `nation.deal.${partner}`, label: `${on ? 'Leave the deal with' : 'Negotiate a deal with'} ${getCountry(partner).name}`, emoji: on ? '✂️' : '🤝', disabledReason: (x) => measureBlock(x, m), run: (x) => propose(x, m) } as MenuAction
        }),
      })
      nodes.push({
        type: 'menu', id: 'nation.sanctions', label: 'Sanctions', emoji: '⛔',
        children: (gg) => partnersOf(gg).map((partner) => {
          const on = !!policyOf(gg, gg.character.countryId).sanctions[partner]
          const m: Measure = { k: 'sanction', partner, on: !on }
          return { type: 'action', id: `nation.sanction.${partner}`, label: `${on ? 'Lift sanctions on' : 'Sanction'} ${getCountry(partner).name}`, emoji: on ? '🕊️' : '⛔', disabledReason: (x) => measureBlock(x, m), run: (x) => propose(x, m) } as MenuAction
        }),
      })
      nodes.push({
        type: 'menu', id: 'nation.bans', label: 'Export bans', emoji: '🚫',
        children: (gg) => TRADE_INPUT_IDS.filter(i => i !== 'technology' || gg.year >= 1955).map((input) => {
          const on = !!policyOf(gg, gg.character.countryId).exportBans[input]
          const m: Measure = { k: 'exportBan', input: input as TradeInput, on: !on }
          return { type: 'action', id: `nation.ban.${input}`, label: `${on ? 'Allow exports of' : 'Ban exports of'} ${INPUT_LABEL[input]}`, emoji: on ? '✅' : '🚫', disabledReason: (x) => measureBlock(x, m), run: (x) => propose(x, m) } as MenuAction
        }),
      })
      return nodes
    },
  }
}

// ---------------------------------------------------------------------------
// Laws

function lawsMenu(): MenuGroup {
  return {
    type: 'menu', id: 'nation.laws', label: 'Laws & Regulation', emoji: '⚖️',
    visible: (g) => !!powerFor(v0(g), 'law', decreeRule(g)),
    children: (g) => {
      const v = v0(g), power = powerFor(v, 'law', decreeRule(g))
      if (!v || !power) return []
      const scope = power.scope
      const nodes: MenuNode[] = []
      if (scope !== 'city') nodes.push(measureSlider(`nation.minwage.${scope}`, 'Minimum wage', '💵', {
        min: -50, max: 80, step: 5, unit: '%',
        current: (gg) => currentOf(policyOf(gg, gg.character.countryId), { k: 'minWage', scope, value: 0 }),
        build: (_gg, value) => ({ k: 'minWage', scope, value: Math.round(value / 5) * 5 }),
        subtitle: () => 'Change versus the minimum the law sets today',
      }))
      if (scope !== 'national') return nodes
      const p = policyOf(g, g.character.countryId)
      const step = (k: 'labor' | 'environment', value: number, label: string, emoji: string): MenuAction => {
        const m: Measure = k === 'labor' ? { k: 'labor', value } : { k: 'environment', value }
        return { type: 'action', id: `nation.${k}.${value}`, label, emoji, disabledReason: (x) => measureBlock(x, m), run: (x) => propose(x, m) }
      }
      nodes.push({ type: 'heading', id: 'nation.laws.labor', label: `Labor rules (${p.labor > 0 ? 'strong' : p.labor < 0 ? 'weak' : 'normal'})` })
      nodes.push(step('labor', 1, 'Strengthen unions and job security', '✊'), step('labor', 0, 'Normal labor rules', '⚖️'), step('labor', -1, 'Make hiring and firing easy', '🪓'))
      if (environmentAvailable(g.year)) {
        nodes.push({ type: 'heading', id: 'nation.laws.env', label: `Environment (${p.environment > 0 ? 'strict' : p.environment < 0 ? 'lax' : 'normal'})` })
        nodes.push(step('environment', 1, 'Stricter pollution rules', '🌿'), step('environment', 0, 'Normal environmental rules', '⚖️'), step('environment', -1, 'Cut the green tape', '🏭'))
      }
      nodes.push({ type: 'heading', id: 'nation.laws.sectors', label: 'Industries' })
      nodes.push({
        type: 'menu', id: 'nation.dereg', label: 'Deregulate an industry', emoji: '✂️',
        subtitle: (gg) => { const n = Object.keys(policyOf(gg, gg.character.countryId).dereg); return n.length ? `Deregulated: ${n.map(s => SECTOR_LABEL[s as keyof typeof SECTOR_LABEL]).join(', ')}` : 'Cheaper to run, riskier' },
        children: (gg) => STATE_SECTORS.map((sector) => {
          const on = !!policyOf(gg, gg.character.countryId).dereg[sector]
          const m: Measure = { k: 'dereg', sector, on: !on }
          return { type: 'action', id: `nation.dereg.${sector}`, label: `${on ? 'Re-regulate' : 'Deregulate'} ${SECTOR_LABEL[sector]}`, emoji: on ? '📏' : '✂️', disabledReason: (x) => measureBlock(x, m), run: (x) => propose(x, m) } as MenuAction
        }),
      })
      nodes.push({
        type: 'menu', id: 'nation.nationalize', label: 'Nationalize or privatize', emoji: '🏛️',
        subtitle: (gg) => { const n = Object.keys(policyOf(gg, gg.character.countryId).nationalized); return n.length ? `State-owned: ${n.map(s => SECTOR_LABEL[s as keyof typeof SECTOR_LABEL]).join(', ')}` : 'Take an industry into public hands' },
        children: (gg) => STATE_SECTORS.map((sector) => {
          const on = !!policyOf(gg, gg.character.countryId).nationalized[sector]
          const m: Measure = { k: 'nationalize', sector, on: !on }
          return { type: 'action', id: `nation.nat.${sector}`, label: `${on ? 'Privatize' : 'Nationalize'} ${SECTOR_LABEL[sector]}`, emoji: on ? '🏷️' : '🏛️', subtitle: on ? undefined : 'Private firms in it lose most of their customers', disabledReason: (x) => measureBlock(x, m), run: (x) => propose(x, m) } as MenuAction
        }),
      })
      nodes.push({ type: 'heading', id: 'nation.laws.legal', label: 'Legal or banned' })
      for (const id of LEGAL_IDS) {
        if (!legalAvailable(id, g.year)) continue
        const def = LEGAL[id]
        const base = legalBase(g, g.character.countryId, id)
        const now = p.legal[id] ?? 0
        const legalNow = now === 0 ? base : now > 0
        const m: Measure = { k: 'legal', id: id as LegalId, value: legalNow ? (base ? -1 : 0) : (base ? 0 : 1) }
        nodes.push({ type: 'action', id: `nation.legal.${id}`, label: legalNow ? def.ban : def.legalize, emoji: def.emoji, subtitle: `${def.label}: ${legalNow ? 'legal' : 'banned'} now`, disabledReason: (x) => measureBlock(x, m), run: (x) => propose(x, m) })
      }
      return nodes
    },
  }
}

// ---------------------------------------------------------------------------
// A cabinet post

const CABINET_SCRIPT = 'nation.cabinet'

/** Odds the head of government gives you a portfolio (pure). */
export function cabinetOdds(g: GameState, v: OfficeView): number {
  const leg = legislatureOf(g, g.character.countryId)
  if (!leg.gov.includes(v.party)) return 0
  const me = meView(g)
  return Math.max(.05, Math.min(.85, .15 + (v.approval - 50) / 120 + me.capital / 250 + (v.terms - 1) * .08))
}

defineScript(CABINET_SCRIPT, (g, choice) => {
  const v = officeView(g)
  if (!v || !v.legislator && !v.regionalHead || v.portfolio || !(PORTFOLIOS as string[]).includes(choice)) return
  if (!useYearAction(g, 'nation.cabinet', 1)) return
  const odds = cabinetOdds(g, v)
  const me = editMe(g)
  me.capital = Math.max(0, me.capital - 10)
  writeMe(g, me)
  if (chance(g, odds)) {
    setPortfolio(g, choice as Portfolio)
    g.character.job!.salary = Math.round(g.character.job!.salary * 1.3 / 100) * 100
    notice(g, 'Cabinet Post', `You are the new ${PORTFOLIO_TITLE[choice as Exclude<Portfolio, ''>]}. The job comes with a 30% raise and real power.`, { emoji: '🎖️', tone: 'good' })
    return
  }
  notice(g, 'Passed Over', 'The head of government gave the job to someone else. Maybe next year.', { emoji: '😶' })
})

function cabinetAction(): MenuAction {
  return {
    type: 'action', id: 'nation.cabinet', label: 'Seek a Cabinet Post', emoji: '🎖️',
    visible: (g) => { const v = v0(g); return !!v && (v.legislator || v.regionalHead) && !v.portfolio },
    subtitle: (g) => { const v = v0(g); return v ? `Odds ${pct(cabinetOdds(g, v))} · costs 10 capital` : '' },
    disabledReason: (g) => {
      const v = v0(g)
      if (!v) return 'You need to hold office.'
      if (!legislatureOf(g, g.character.countryId).leaderParty || !legislatureOf(g, g.character.countryId).gov.includes(v.party)) return 'Your party is not in government.'
      if (g.yearActions['nation.cabinet']) return 'You already asked this year.'
      return null
    },
    run: (g) => scriptChoice(g, CABINET_SCRIPT, 'Cabinet Post', 'Which ministry would you like?', [
      ...PORTFOLIOS.map(id => ({ id, label: PORTFOLIO_TITLE[id], emoji: id === 'finance' ? '💰' : id === 'trade' ? '📦' : '🛡️' })),
      { id: 'cancel', label: 'Never mind', emoji: '✖️' },
    ], { emoji: '🎖️' }),
  }
}

// ---------------------------------------------------------------------------
// Govern + dashboard

export function governMenu(): MenuGroup {
  return {
    type: 'menu', id: 'nation.govern', label: 'Govern', emoji: '🏛️',
    visible: (g) => { const v = v0(g); return !!v && v.rank >= 1 },
    subtitle: (g) => { const v = v0(g); return v ? powerLine(v).slice(0, 90) : '' },
    header: (g) => { const v = v0(g); return v ? `${powerLine(v)}${decreeRule(g) ? ' You rule by decree: no votes needed.' : ''}` : '' },
    children: () => [taxesMenu(), budgetMenu(), tradeMenu(), lawsMenu(), cabinetAction(),
      { type: 'action', id: 'nation.report', label: 'State of the Nation', emoji: '📰', subtitle: 'This year\'s report card', visible: (g) => (v0(g)?.rank ?? 0) >= 2, run: (g) => openReport(g) }],
  }
}

function regimeLabel(g: GameState): string {
  const r = policyOf(g, g.character.countryId).institutions.regime
  return r === 'authoritarian' ? 'Rule by decree' : r === 'hybrid' ? 'Eroding democracy' : 'Democracy'
}

export function dashboardMenu(): MenuGroup {
  return {
    type: 'menu', id: 'nation.dashboard', label: 'Politics Dashboard', emoji: '📊',
    visible: (g) => { const v = v0(g); return !!v && v.rank >= 1 },
    subtitle: (g) => { const v = v0(g); const me = meView(g); return v ? `Approval ${v.approval}% · legitimacy ${Math.round(me.legitimacy)} · fear ${Math.round(me.fear)}` : '' },
    children: (g) => {
      const v = v0(g)
      if (!v) return []
      const country = g.character.countryId
      const me = meView(g), p = policyOf(g, country), e = economyOf(g)
      const t = approvalTarget(g, v)
      const leg = legislatureOf(g, country)
      const rows: MenuNode[] = []
      const info = (id: string, emoji: string, text: string) => rows.push({ type: 'info', id: `nation.dash.${id}`, emoji, text })
      info('office', '🏛️', `${v.title} · ${v.place} · ${v.termLeft} year${v.termLeft === 1 ? '' : 's'} left in term ${v.terms}${v.portfolio ? ` · ${PORTFOLIO_TITLE[v.portfolio]}` : ''}`)
      info('meters', '📈', `Approval ${v.approval}% (heading for ${Math.round(t.target)}%) · legitimacy ${Math.round(me.legitimacy)} · fear ${Math.round(me.fear)} · security loyalty ${Math.round(me.loyalty)} · political capital ${Math.round(me.capital)} · heat ${Math.round(me.heat)}`)
      info('groups', '👥', GROUP_IDS.map(id => `${GROUPS[id].emoji} ${t.groups[id]}%`).join(' · '))
      rows.push({ type: 'heading', id: 'nation.dash.h.economy', label: getCountry(country).name })
      info('economy', '💹', `Growth ${pct(e.growth, 1)} · unemployment ${pct(e.unemployment, 1)} · inflation ${pct(e.inflation, 1)}`)
      const d = e.budget?.deficit ?? 0
      info('budget', '🏦', `${d > 0 ? `Deficit ${pct(d, 1)}` : `Surplus ${pct(-d, 1)}`} of GDP · public debt ${pct(e.governmentDebt)} of GDP · credit rating ${p.rating || ratingFor(g, country, p)}`)
      const taxes = [...TAX_IDS.filter(id => p.national.taxes[id]).map(id => `${TAXES[id].label} ${signed(p.national.taxes[id]!, TAXES[id].unit === '%' ? '%' : ' pts')}`),
        ...NEW_TAX_IDS.filter(id => p.newTaxes[id]?.level).map(id => `${NEW_TAXES[id].label} L${p.newTaxes[id]!.level}`),
        ...Object.entries(p.breaks).map(([i, l]) => `break for ${i} L${l}`)]
      info('taxes', '💵', taxes.length ? taxes.join(' · ') : 'Taxes: the law as it was')
      const trade = [...p.tariffs.map(r => `${r.add}% on ${r.input === 'all' ? 'imports' : r.input}${r.partner === 'all' ? '' : ` from ${r.partner.toUpperCase()}`}`),
        ...Object.keys(p.deals).map(id => `deal with ${getCountry(id).name}`), ...Object.keys(p.sanctions).map(id => `sanctions on ${getCountry(id).name}`),
        ...Object.keys(p.exportBans).map(id => `no ${id} exports`)]
      info('trade', '📦', trade.length ? trade.join(' · ') : 'Trade: customs as usual')
      const hits = p.retaliation.filter(r => r.until >= g.year)
      if (hits.length) info('retaliation', '🎯', `Tariffs against us: ${hits.map(r => `${getCountry(r.from).name} ${r.add}%`).join(', ')}`)
      const budgets = BUDGET_LINES.filter(id => p.national.budget[id] !== undefined).map(id => `${BUDGET[id].label} ${Math.round(p.national.budget[id]! * 100)}%`)
      if (budgets.length) info('lines', '📋', budgets.join(' · '))
      const laws = [p.national.minWage ? `minimum wage ${signed(p.national.minWage, '%')}` : '', p.labor ? `${p.labor > 0 ? 'strong' : 'weak'} labor rules` : '', p.environment ? `${p.environment > 0 ? 'strict' : 'lax'} green rules` : '',
        ...Object.keys(p.dereg).map(s => `deregulated ${s}`), ...Object.keys(p.nationalized).map(s => `state-owned ${s}`), ...LEGAL_IDS.filter(id => p.legal[id]).map(id => `${LEGAL[id].label.toLowerCase()} ${p.legal[id]! > 0 ? 'legal' : 'banned'}`)].filter(Boolean)
      if (laws.length) info('laws', '⚖️', laws.join(' · '))
      rows.push({ type: 'heading', id: 'nation.dash.h.power', label: 'Power' })
      const govShare = governmentSeats(g)
      info('seats', '🗳️', `${regimeLabel(g)} · the government (${leg.gov.map(partyName).join(' + ')}) holds ${pct(govShare)} of seats${leg.gov.includes(v.party) ? ', your party included' : ''}`)
      const inst = p.institutions
      const instBits = [inst.courtPacked > 0 ? `courts ${pct(inst.courtPacked)} loyal` : '', inst.mediaControl > 0 ? `media ${pct(inst.mediaControl)} friendly` : '', inst.extraTerms ? (inst.extraTerms >= 99 ? 'no term limit' : `+${inst.extraTerms} term${inst.extraTerms === 1 ? '' : 's'} allowed`) : '', inst.emergencyUntil >= g.year ? `emergency until ${inst.emergencyUntil}` : '', inst.postponedUntil > g.year ? `election postponed to ${inst.postponedUntil}` : ''].filter(Boolean)
      if (instBits.length) info('institutions', '🏛️', instBits.join(' · '))
      if (v.leader) info('coup', '🪖', `Coup risk this year: ${pct(coupChance(g, v), 1)}`)
      const bills = Array.isArray(g.character.job?.data.bills) ? (g.character.job!.data.bills as unknown[]).length : 0
      info('bills', '📝', `${bills} bill${bills === 1 ? '' : 's'} waiting on your desk`)
      rows.push({ type: 'heading', id: 'nation.dash.h.danger', label: 'Scandals and investigations' })
      const open = me.cases.filter(c => c.status !== 'closed').sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.evidence - a.evidence)
      if (!open.length) info('cases', '😇', 'No open case files. Keep it that way.')
      for (const cs of open.slice(0, 4)) info(`case.${cs.id}`, cs.status === 'pending' ? '🚨' : '🗂️', cs.status === 'pending'
        ? `${cs.label} (${cs.year}) · public, under investigation · ${pct(chargeChance(g, cs))} a year they charge you once nothing protects you`
        : `${cs.label} (${cs.year}) · evidence ${pct(cs.evidence)} · ${pct(exposureChance(g, cs, true, false))} chance a year it surfaces`)
      if (open.length > 4) info('cases.more', '🗂️', `…and ${open.length - 4} more`)
      if (me.dirty || me.offshore || me.taken) info('money', '💼', `Slush fund ${formatMoney(me.dirty)} · offshore ${formatMoney(me.offshore)} · taken so far ${formatMoney(me.taken)} · seized ${formatMoney(me.seized)}`)
      const rivals = me.rivals.slice(0, 4)
      if (rivals.length) {
        rows.push({ type: 'heading', id: 'nation.dash.h.rivals', label: 'Rivals' })
        for (const r of rivals) info(`rival.${r.id}`, r.status === 'active' ? '🥊' : '🔒', `${r.name} (${r.role === 'party' ? 'party rival' : r.role}${r.role !== 'lobbyist' ? `, ${partyName(r.party)}` : ''}) · ${r.status === 'active' ? `strength ${Math.round(r.strength)}` : r.status} · ${r.goal}`)
      }
      if (p.reports.length) {
        const last = p.reports[p.reports.length - 1]
        info('report', '📰', `Last report (${last.year}): growth ${pct(last.growth, 1)}, unemployment ${pct(last.unemployment, 1)}, debt ${pct(last.debt)}`)
      }
      if (v.rank >= 2) rows.push({ type: 'action', id: 'nation.dash.open', label: 'Open the State of the Nation', emoji: '📰', run: (gg) => openReport(gg) })
      return rows
    },
  }
}

// ---------------------------------------------------------------------------
// Abuse of power extensions

function pocketsMenu(): MenuGroup {
  return {
    type: 'menu', id: 'nation.pockets', label: 'Line Your Pockets', emoji: '💰',
    subtitle: (g) => `Slush fund ${formatMoney(meView(g).dirty)} · heat ${Math.round(meView(g).heat)}`,
    header: () => 'Fictional schemes. Each pays dirty money into a slush fund (not your bank account) and leaves evidence that can surface for years. The odds of being caught are real and rise with every scheme.',
    children: (g) => {
      const v = v0(g)
      if (!v) return []
      const nodes: MenuNode[] = SCHEMES.filter(s => g.year >= s.from).map((def): MenuAction => ({
        type: 'action', id: `nation.scheme.${def.id}`, label: def.label, emoji: def.emoji,
        subtitle: def.blurb,
        disabledReason: (gg) => schemeBlock(gg, def),
        input: { kind: 'slider', label: 'How greedy?', min: 10, max: 100, step: 10, unit: '%', defaultValue: () => '30',
          preview: (gg, value) => { const vv = officeView(gg); if (!vv) return ''; const q = schemeQuote(gg, vv, def, value / 100); return `Take ${formatMoney(q.take)} · ${pct(q.caught)} chance an auditor flags it this year · leaves evidence ${pct(q.evidence)}` } },
        run: (gg, input) => { runScheme(gg, def.id, Number(input) / 100) },
      }))
      nodes.push({
        type: 'menu', id: 'nation.steer', label: 'Steer a contract to your company', emoji: '📜',
        disabledReason: (gg) => steerBlock(gg),
        children: (gg) => {
          const vv = officeView(gg)
          if (!vv) return []
          return steerTargets(gg).map((a): MenuAction => {
            const q = steerQuote(gg, vv, a)
            return { type: 'action', id: `nation.steer.${a.id}`, label: a.name, emoji: '🏢', subtitle: `${formatMoney(q.value)} contract · ${formatMoney(q.markup)} markup · ${pct(q.caught)} chance reporters notice`, disabledReason: (x) => steerBlock(x), run: (x) => { steerContract(x, a.id) } }
          })
        },
      })
      nodes.push(dirtyMoneyMenu())
      return nodes
    },
  }
}

function dirtyMoneyMenu(): MenuGroup {
  return {
    type: 'menu', id: 'nation.dirty', label: 'Dirty Money', emoji: '🧺',
    subtitle: (g) => `Slush fund ${formatMoney(meView(g).dirty)} · offshore ${formatMoney(meView(g).offshore)}`,
    header: () => 'Dirty money is not in your bank account and dies with you. Launder it through a company you control, park it offshore, or bring offshore money home as taxable "consulting fees".',
    children: (g) => {
      const me = meView(g)
      const nodes: MenuNode[] = []
      nodes.push({
        type: 'menu', id: 'nation.launder', label: 'Launder through a company', emoji: '🏢',
        disabledReason: (gg) => (meView(gg).dirty < 100 ? 'The slush fund is empty.' : !launderFronts(gg).length ? 'You need a company you control with sales last year.' : (gg.yearActions['graft.launder'] ?? 0) >= 2 ? 'Twice a year at most.' : null),
        children: (gg) => launderFronts(gg).map((a): MenuAction => {
          const q = launderQuote(gg, a)
          return { type: 'action', id: `nation.launder.${a.id}`, label: a.name, emoji: '🏢', subtitle: `Run ${formatMoney(q.amount)} through ${readBiz(gg, a).industry} books · ${formatMoney(q.kept)} arrives · ${pct(q.caught)} risk`, disabledReason: (x) => (launderQuote(x, a).amount < 100 ? 'Nothing to launder.' : null), run: (x) => { launder(x, a.id) } }
        }),
      })
      nodes.push({
        type: 'action', id: 'nation.offshore', label: 'Move money offshore', emoji: '🏝️',
        subtitle: `${pct(OFFSHORE_FEE)} fee · ${pct(offshoreCaught(g))} risk the wire is stopped`,
        disabledReason: (gg) => (meView(gg).dirty < 100 ? 'The slush fund is empty.' : gg.yearActions['graft.offshore'] ? 'Once a year.' : null),
        input: { kind: 'slider', label: 'How much', money: true, min: 100, max: Math.max(100, me.dirty), step: 100, defaultValue: () => String(Math.max(100, meView(g).dirty)) },
        run: (gg, input) => { moveOffshore(gg, Number(input)) },
      })
      nodes.push({
        type: 'action', id: 'nation.home', label: 'Bring money home as consulting fees', emoji: '💼',
        subtitle: `Up to ${formatMoney(homeCap(g))} a year · a 20% cut, then income tax`,
        disabledReason: (gg) => (meView(gg).offshore < 100 ? 'Nothing offshore.' : gg.yearActions['graft.home'] ? 'Once a year.' : null),
        input: { kind: 'slider', label: 'How much', money: true, min: 100, max: Math.max(100, Math.min(me.offshore, homeCap(g))), step: 100, defaultValue: () => String(Math.max(100, Math.min(meView(g).offshore, homeCap(g)))) },
        run: (gg, input) => { bringHome(gg, Number(input)) },
      })
      return nodes
    },
  }
}

function powerMenu(): MenuGroup {
  return {
    type: 'menu', id: 'nation.keep', label: 'Keep Power', emoji: '👑',
    subtitle: (g) => `${regimeLabel(g)} · legitimacy ${Math.round(meView(g).legitimacy)} · fear ${Math.round(meView(g).fear)}`,
    header: () => 'Fictional power grabs. Each one costs legitimacy, raises fear and invites courts, protests, sanctions and coups. Where institutions are strong, the worst of them are impossible.',
    children: (g) => {
      const v = v0(g)
      if (!v) return []
      const nodes: MenuNode[] = REGIME_IDS.map((id): MenuAction => {
        const def = REGIME[id]
        const cost = id === 'buyMedia' ? mediaCost(g, v) : id === 'security' ? securityCost(g) : id === 'buyVotes' ? voteCost(g) : 0
        return { type: 'action', id: `nation.regime.${id}`, label: def.label, emoji: def.emoji,
          subtitle: (gg) => `${def.blurb}${cost ? ` ${formatMoney(cost)}.` : ''} ${regimeBlock(gg, id) ? '' : `Works ${pct(regimeOdds(gg, id))}.`}`.trim(),
          disabledReason: (gg) => regimeBlock(gg, id), confirm: () => `${def.label}? Legitimacy ${def.legitimacy || 0}.`, run: (gg) => { takeStep(gg, id) } }
      })
      nodes.push({
        type: 'menu', id: 'nation.rivals', label: 'Deal with a rival', emoji: '⛓️',
        disabledReason: (gg) => persecuteBlock(gg, false),
        children: (gg) => rivalTargets(gg).flatMap((r): MenuAction[] => [
          { type: 'action', id: `nation.jail.${r.id}`, label: `Jail ${r.name}`, emoji: '⛓️', subtitle: `${pct(persecuteOdds(gg, false))} the charges stick`, disabledReason: (x) => persecuteBlock(x, false), run: (x) => { persecute(x, r.id, false) } },
          { type: 'action', id: `nation.exile.${r.id}`, label: `Drive ${r.name} into exile`, emoji: '✈️', subtitle: `${pct(persecuteOdds(gg, true))} they flee`, disabledReason: (x) => persecuteBlock(x, true), run: (x) => { persecute(x, r.id, true) } },
        ]),
      })
      return nodes
    },
  }
}

/** Rows the career module adds inside Abuse of Power. */
export function abuseNodes(): MenuNode[] {
  return [pocketsMenu(), powerMenu()]
}

/** The rows the career module puts at the top of the politician's job menu. */
export function nationJobNodes(): MenuNode[] {
  return [dashboardMenu(), governMenu()]
}

