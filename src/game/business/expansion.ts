// Actions, menus and yearly progression for national strategy and the Inventor talent.
import { count, formatMoney, log, notice } from '../core'
import { chance } from '../rng'
import { hasTalent } from '../talents'
import type { Asset, GameState, MenuGroup, MenuNode } from '../types'
import { COUNTRIES, getCountry } from '../world'
import { STRATEGIES, expansionOf, nationalMarket, saveExpansion, type Research } from './dynamics'
import { manageBlock } from './gate'
import { industryDef } from './industries'
import { bizOf, findBusiness, readBiz, type BizState } from './state'
import { money, pct } from './util'

export function strategyCost(b: BizState): number { return Math.round(Math.max(5_000, (b.last?.revenue ?? 100_000) * .025)) }
export function studyCost(b: BizState): number { return Math.round(Math.max(2_000, (b.last?.revenue ?? 100_000) * .003)) }
function pay(b: BizState, cost: number): boolean {
  if (!Number.isFinite(cost) || cost < 0 || b.cash < cost) return false
  b.cash -= cost
  b.yearCosts += cost
  return true
}

export function studyMarket(g: GameState, assetId: string, country: string): boolean {
  const a = findBusiness(g, assetId)
  if (!a || manageBlock(g, a) || !COUNTRIES.some(c => c.id === country)) return false
  const b = bizOf(g, a), x = expansionOf(b)
  if (x.studies.some(s => s.country === country && s.year === g.year) || !pay(b, studyCost(b))) return false
  x.studies = [...x.studies.filter(s => s.country !== country), { country, year: g.year }]
  saveExpansion(b, x)
  const n = nationalMarket(g, b.industry, country)
  log(g, `I studied the ${industryDef(b.industry).label.toLowerCase()} market in ${getCountry(country).name}.`)
  notice(g, 'Market Study', `${n.label}. Customers currently favor ${n.taste}. Input costs are ${pct(n.costs - 1, 1)} relative to the normal local level. ${hasTalent(g, 'Inventor') ? 'Your Inventor talent uncovered research directions. Open Inventor Lab to develop one; a study stays useful for three years.' : 'Use National Strategy to choose a response. Each program has an upfront cost and a fixed term.'}`, { emoji: '🔎' })
  return true
}

export function adoptStrategy(g: GameState, assetId: string, country: string, id: string): boolean {
  const a = findBusiness(g, assetId), s = STRATEGIES.find(s => s.id === id)
  if (!a || !s || manageBlock(g, a)) return false
  const b = bizOf(g, a), x = expansionOf(b)
  const active = x.strategies.filter(p => p.country === country && p.expires > g.year)
  if (!b.outlets.some(o => o.countryId === country) || active.length >= 3 || active.some(p => p.id === id) || !pay(b, strategyCost(b))) return false
  x.strategies = [...x.strategies.filter(p => p.expires > g.year), { id, country, started: g.year, expires: g.year + s.term }]
  saveExpansion(b, x)
  log(g, `I started ${s.label.toLowerCase()} in ${getCountry(country).name} for ${a.name}.`)
  notice(g, s.label, `${formatMoney(strategyCost(b))} paid from company cash. ${s.brief}. Runs through ${g.year + s.term - 1}; the effect expires before trading in ${g.year + s.term}. Up to three programs can run in each country.`, { emoji: '🧭' })
  return true
}

/** These are explicitly alternate-history inventions, never factual launch-date claims. */
export function researchIdeas(b: BizState): { early: string; frontier: string } {
  if (/energy|fusion|battery|solar/.test(b.industry)) return { early: 'Next-generation grid storage', frontier: 'Stable cold-fusion power cell' }
  if (/bio|pharma|clinic|medical/.test(b.industry)) return { early: 'Precision regenerative treatment', frontier: 'Universal tissue-repair platform' }
  if (/software|ai|chip|quantum|robot|game/.test(b.industry)) return { early: 'Adaptive autonomous computing', frontier: 'Self-organizing cognitive substrate' }
  if (/farm|food|restaurant|cafe|bakery|grocery/.test(b.industry)) return { early: 'Closed-loop food production', frontier: 'Molecular nutrition synthesizer' }
  if (/logistic|auto|aero|space/.test(b.industry)) return { early: 'Autonomous transport network', frontier: 'Inertial transport drive' }
  return { early: `${industryDef(b.industry).label} adaptive production`, frontier: `${industryDef(b.industry).label} self-renewing materials` }
}

export function researchQuote(g: GameState, b: BizState, kind: Research['kind']) {
  const frontier = kind === 'frontier'
  return { name: researchIdeas(b)[kind], kind, started: g.year, years: frontier ? 5 : 3,
    budget: Math.round(Math.max(frontier ? 500_000 : 100_000, (b.last?.revenue ?? 0) * (frontier ? .35 : .15))),
    odds: frontier ? .45 : .75 }
}

export function startInvention(g: GameState, assetId: string, kind: Research['kind']): boolean {
  const a = findBusiness(g, assetId)
  if (!a || manageBlock(g, a) || !hasTalent(g, 'Inventor') || (kind !== 'early' && kind !== 'frontier')) return false
  const b = bizOf(g, a), x = expansionOf(b), q = researchQuote(g, b, kind)
  if (x.research || !x.studies.some(s => s.country === b.countryId && s.year <= g.year && g.year - s.year <= 2) || x.patents.some(p => p.name === q.name && p.expires > g.year) || !pay(b, q.budget)) return false
  x.research = q
  saveExpansion(b, x)
  count(g, 'inventionProjects')
  log(g, `I funded ${q.name} at ${a.name} for ${money(q.budget)}.`)
  notice(g, 'Research Started', `${q.name}: ${q.years} years, ${pct(q.odds)} chance of a working product. The entire ${formatMoney(q.budget)} budget is paid now. ${kind === 'early' ? 'Success gives this fictional technology a 15-year lead over competitors.' : 'This is speculative science within the game; success opens a new product category with 20 years of exclusivity.'} Failure consumes the budget.`, { emoji: '💡' })
  return true
}

export function inventionYear(g: GameState, a: Asset, b: BizState): void {
  const x = expansionOf(b)
  if (x.lastYear >= g.year) return
  x.lastYear = g.year
  const r = x.research
  if (r && g.year >= r.started + r.years) {
    x.research = null
    if (chance(g, r.odds)) {
      const expires = g.year + (r.kind === 'early' ? 15 : 20)
      x.patents.push({ name: r.name, kind: r.kind, launched: g.year, expires })
      count(g, 'inventions')
      notice(g, 'Breakthrough!', `${a.name} invented ${r.name}. You alone can commercialize this product until ${expires}. Demand and production efficiency improve while exclusive; you still need capacity, staff and solvent operations. Competitors may use the technology once exclusivity expires.`, { emoji: '💡', tone: 'good' })
      log(g, `I brought ${r.name} to market through ${a.name}.`, 'good')
    } else notice(g, 'Research Failed', `${a.name}'s ${r.name} project did not produce a viable product. The research budget is spent; a fresh market study can inform another attempt.`, { emoji: '🧪', tone: 'bad' })
  }
  const expired = x.patents.filter(p => p.expires === g.year)
  if (expired.length) notice(g, 'Competitors Catch Up', `${expired.map(p => p.name).join(', ')} is no longer exclusive to ${a.name}. The exceptional demand and cost advantage has ended.`, { emoji: '🌍' })
  saveExpansion(b, x)
}

function countryMenu(a: Asset, country: string): MenuGroup {
  return { type: 'menu', id: `biz.national.${a.id}.${country}`, label: getCountry(country).name, emoji: getCountry(country).flag,
    subtitle: g => { const n = nationalMarket(g, readBiz(g, a).industry, country); return `${n.label} · customers favor ${n.taste}` },
    children: g => {
      const b = readBiz(g, a), x = expansionOf(b), n = nationalMarket(g, b.industry, country)
      const active = x.strategies.filter(p => p.country === country && p.expires > g.year)
      return [
        { type: 'info', id: `national.summary.${a.id}.${country}`, text: `${g.year}: demand ${pct(n.demand)} of normal; input costs ${pct(n.costs)}; confidence ${pct(n.confidence)}. ${active.length}/3 programs active. Conditions change each year.`, emoji: '📊' },
        { type: 'action', id: `national.study.${a.id}.${country}`, label: 'Study This Market', emoji: '🔎', subtitle: `${money(studyCost(b))} from company cash`, disabledReason: gg => manageBlock(gg, a) ?? (expansionOf(readBiz(gg, a)).studies.some(s => s.country === country && s.year === gg.year) ? 'Already studied this year.' : readBiz(gg, a).cash < studyCost(readBiz(gg, a)) ? 'Not enough company cash.' : null), run: gg => { studyMarket(gg, a.id, country) } },
        ...STRATEGIES.map((s): MenuNode => ({ type: 'action', id: `national.strategy.${a.id}.${country}.${s.id}`, label: s.label, emoji: '🧭', subtitle: `${s.brief} · ${money(strategyCost(b))} · ${s.term} years`,
          disabledReason: gg => { const bb = readBiz(gg, a), active = expansionOf(bb).strategies.filter(p => p.country === country && p.expires > gg.year); return manageBlock(gg, a) ?? (!bb.outlets.some(o => o.countryId === country) ? 'Open a location here first using Expansion.' : active.some(p => p.id === s.id) ? `Active until ${active.find(p => p.id === s.id)!.expires}.` : active.length >= 3 ? 'Three programs are already active here.' : bb.cash < strategyCost(bb) ? 'Not enough company cash.' : null) },
          confirm: gg => `Spend ${money(strategyCost(readBiz(gg, a)))} of company cash on ${s.label.toLowerCase()} in ${getCountry(country).name}?`, run: gg => { adoptStrategy(gg, a.id, country, s.id) } })),
      ]
    } }
}

export function nationalStrategyMenu(a: Asset): MenuGroup {
  return { type: 'menu', id: `biz.national.${a.id}`, label: 'National Strategy', emoji: '🌍', subtitle: 'Annual conditions, market studies and 10 strategy programs', children: g => {
    const b = readBiz(g, a), present = new Set(b.outlets.map(o => o.countryId))
    return [
      ...COUNTRIES.filter(c => present.has(c.id)).map(c => countryMenu(a, c.id)),
      { type: 'menu', id: `biz.national.explore.${a.id}`, label: 'Compare Other Countries', emoji: '🗺️', subtitle: 'Open a location using Expansion to run local programs', children: gg => COUNTRIES.filter(c => !present.has(c.id)).map(c => {
        const n = nationalMarket(gg, readBiz(gg, a).industry, c.id)
        return { type: 'info', id: `national.compare.${a.id}.${c.id}`, emoji: c.flag, text: `${c.name}: ${n.label}; demand ${pct(n.demand)}; costs ${pct(n.costs)}; customers favor ${n.taste}.` }
      }) },
    ]
  } }
}

export function inventorMenu(a: Asset): MenuGroup {
  return { type: 'menu', id: `biz.inventor.${a.id}`, label: 'Inventor Lab', emoji: '💡', subtitle: 'Study → research → prototype → exclusive product', visible: g => hasTalent(g, 'Inventor'), children: g => {
    const b = readBiz(g, a), x = expansionOf(b)
    const nodes: MenuNode[] = [{ type: 'info', id: `inventor.help.${a.id}`, text: 'Study your home market first. Fund one project at a time from company cash. Early technologies gain 15 years of exclusivity; fictional frontier discoveries gain 20. A monopoly covers the invention, while the rest of your industry still competes.', emoji: '🧪' }]
    if (x.research) nodes.push({ type: 'info', id: `inventor.progress.${a.id}`, text: `${x.research.name}: results in ${Math.max(0, x.research.started + x.research.years - g.year)} years. Budget ${money(x.research.budget)} already paid; success chance ${pct(x.research.odds)}.`, emoji: '⏳' })
    nodes.push(...x.patents.map((p, i): MenuNode => ({ type: 'info', id: `inventor.patent.${a.id}.${i}`, text: `${p.name} · ${p.expires > g.year ? `exclusive until ${p.expires}` : 'competitors can now use it'}`, emoji: '📜' })))
    for (const kind of ['early', 'frontier'] as const) {
      const q = researchQuote(g, b, kind)
      nodes.push({ type: 'action', id: `inventor.start.${a.id}.${kind}`, label: q.name, emoji: '💡', subtitle: `${money(q.budget)} · ${q.years} years · ${pct(q.odds)} success`,
        disabledReason: gg => { const bb = readBiz(gg, a), xx = expansionOf(bb); return manageBlock(gg, a) ?? (!hasTalent(gg, 'Inventor') ? 'Requires Inventor talent.' : xx.research ? 'Finish your current project first.' : !xx.studies.some(s => s.country === bb.countryId && s.year <= gg.year && gg.year - s.year <= 2) ? 'Study your home market in National Strategy first.' : xx.patents.some(p => p.name === q.name && p.expires > gg.year) ? 'You already hold this exclusive technology.' : bb.cash < researchQuote(gg, bb, kind).budget ? 'Not enough company cash.' : null) },
        confirm: gg => `Commit ${money(researchQuote(gg, readBiz(gg, a), kind).budget)} to ${q.name}? Research can fail and the budget is non-refundable.`, run: gg => { startInvention(gg, a.id, kind) } })
    }
    return nodes
  } }
}
