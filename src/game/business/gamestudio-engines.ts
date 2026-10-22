import { firmCash } from '../cash'
import { log, notice } from '../core'
import { randFloat } from '../rng'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { refreshValue } from './economy'
import { manageBlock } from './gate'
import { ENGINE_TIERS, engineIpValue, engineTier, type EngineTerms, type EngineTier, type StudioEngine } from './gamestudio-engine-state'
import { assignedDevs, readStudio, type StudioState } from './gamestudio-state'
import { bizOf, findBusiness, readBiz } from './state'
import { clampN, money, toJson } from './util'

function current(g: GameState, assetId: string): Asset | undefined {
  const a = findBusiness(g, assetId)
  return a?.details.industry === 'gameStudio' ? a : undefined
}

export function engineDevelopmentBlock(g: GameState, a: Asset, tierId: EngineTier): string | null {
  const reason = manageBlock(g, a)
  if (reason) return reason
  const b = readBiz(g, a)
  const st = readStudio(a.details)
  const tier = engineTier(tierId)
  if (st.engines.length >= 32 || st.engineSeq >= 999_999_999) return 'Your studio engine catalog is full (32 engines).'
  if (b.employees - assignedDevs(st) < tier.minTeam) return `Needs at least ${tier.minTeam} unassigned developers. Hire developers or reduce other project teams first.`
  if (b.cash < tier.setup) return `Needs ${money(tier.setup)} in company cash for tools and R&D setup.`
  return null
}

export function startStudioEngine(g: GameState, assetId: string, tierId: EngineTier, input: string): void {
  const a = current(g, assetId)
  if (!a) return
  const reason = engineDevelopmentBlock(g, a, tierId)
  if (reason) return notice(g, 'Game Engine', reason, { emoji: '⚙️' })
  const st = readStudio(a.details)
  const b = bizOf(g, a)
  const tier = engineTier(tierId)
  const name = input.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 48)
  if (!name) return notice(g, 'Name Your Engine', 'Enter a name for your game engine.', { emoji: '⚙️' })
  if (st.engines.some((x) => x.name.toLowerCase() === name.toLowerCase())) return notice(g, 'Name Already Used', 'Choose a different name or a new version number.', { emoji: '⚙️' })
  const team = Math.min(tier.team, b.employees - assignedDevs(st))
  st.engineSeq += 1
  st.engines.push({
    id: `engine${st.engineSeq}`, name, tier: tier.id, stage: 'dev', progress: 0, quality: 45, team,
    started: g.year, released: 0, spent: tier.setup, terms: 'private', licenses: [], licenseSeq: 0,
    lastYear: 0, lastRevenue: 0, earned: 0, soldFor: 0,
  })
  firmCash(g, b, -tier.setup, 'capex', a.id)
  b.yearCosts += tier.setup
  a.details.studio = toJson(st)
  refreshValue(a, b)
  log(g, `${a.name} began developing the ${name} game engine.`, 'good')
  notice(g, 'Engine Development Started', `${name}: ${team} developers assigned. Tools cost ${money(tier.setup)} now; R&D costs up to ${money(tier.research)} per year, plus your existing developer payroll. About ${tier.years} year${tier.years === 1 ? '' : 's'} with ${tier.team} developers. You can use, license, or sell it when finished.`, { emoji: '⚙️', tone: 'good' })
}

/** Runs inside the studio statement: returns receipts and costs, never moves cash itself. */
export function simulateStudioEngines(g: GameState, st: StudioState, year: number, opts: {
  employees: number; wage: number; quality: number; leadership: number; brand: number; operations: number; open: number; market: number
}): { revenue: number; costs: number; notes: string[] } {
  let revenue = 0
  let costs = 0
  const notes: string[] = []
  const assigned = assignedDevs(st)
  const share = assigned > opts.employees && assigned > 0 ? opts.employees / assigned : 1
  const open = clampN(opts.open, 0, 1)
  for (const x of st.engines) {
    if (year < x.started || year <= x.lastYear || x.stage === 'sold') continue
    x.lastYear = year
    x.lastRevenue = 0
    const tier = engineTier(x.tier)
    if (x.stage === 'dev') {
      const team = x.team * share
      const ratio = clampN(team / tier.team, 0, 3)
      const progress = (100 / tier.years) * Math.pow(ratio, .8) * opts.operations * open
      const research = Math.round(tier.research * Math.min(1.5, ratio) * open)
      costs += research
      x.spent += Math.round(team * opts.wage * open) + research
      x.progress = clampN(x.progress + progress, 0, 100)
      if (progress > 0) x.quality = clampN(30 + opts.quality * .45 + opts.leadership * .2 + Math.min(10, ratio * 5), 20, 98)
      if (x.progress >= 100) {
        x.stage = 'ready'
        x.released = year
        x.team = 0
        notes.push(`The ${x.name} game engine is ready (quality ${Math.round(x.quality)}): use it in new games, offer licenses, or sell the IP`)
      }
      continue
    }
    // Existing three-year licenses keep their agreed terms even after new licensing closes.
    x.licenses = x.licenses.filter((l) => l.until >= year)
    const market = clampN(opts.market, 0, 2)
    const age = Math.max(0, year - x.released)
    if (x.terms !== 'private' && year > x.released && open > 0) {
      const audience = tier.reach * Math.pow(x.quality / 100, 2) * (.5 + opts.brand / 100) * market / (1 + age * .14)
      const entrants = Math.min(200 - x.licenses.length, Math.floor(Math.max(0, audience - x.licenses.length) * randFloat(g, .4, .8)))
      for (let i = 0; i < entrants; i++) {
        x.licenseSeq += 1
        x.licenses.push({ id: x.licenseSeq, start: year, until: year + 2, terms: x.terms,
          fee: x.terms === 'subscription' ? tier.fee : 0, royalty: x.terms === 'royalty' ? .05 : 0,
          sales: tier.sales * randFloat(g, .3, 2),
        })
      }
    }
    let active = 0
    for (const l of x.licenses) {
      if (l.start > year) continue
      active += 1
      const sales = l.sales * market * randFloat(g, .7, 1.3)
      x.lastRevenue += Math.round((l.fee + Math.max(0, sales - 1_000_000) * l.royalty) * open)
    }
    if (active > 0) costs += Math.round((active * tier.fee * .18 + tier.research * .15) * open)
    x.earned += x.lastRevenue
    revenue += x.lastRevenue
    if (active > 0) notes.push(`${x.name}: ${active} studio license${active === 1 ? '' : 's'} earned ${money(x.lastRevenue)}`)
  }
  return { revenue, costs, notes }
}

export function sellStudioEngine(g: GameState, assetId: string, engineId: string): void {
  const a = current(g, assetId)
  if (!a || manageBlock(g, a)) return
  const st = readStudio(a.details)
  const x = st.engines.find((e) => e.id === engineId && e.stage === 'ready')
  if (!x) return
  const b = bizOf(g, a)
  const price = engineIpValue(x, g.year)
  if (price <= 0) return
  x.stage = 'sold'
  x.soldFor = price
  x.terms = 'private'
  x.licenses = []
  x.lastRevenue = 0
  firmCash(g, b, price, 'royalty', a.id)
  b.yearIncome += price
  a.details.studio = toJson(st)
  refreshValue(a, b)
  log(g, `${a.name} sold the ${x.name} game engine IP for ${money(price)}.`, 'good')
  notice(g, 'Engine IP Sold', `${money(price)} was paid into ${a.name}. The buyer owns ${x.name} and all its licensing contracts now. Your existing games retain royalty-free use, but new games cannot use this engine.`, { emoji: '🤝', tone: 'good' })
}

function engineAction(a: Asset, id: string, label: string, opts: {
  subtitle?: string; confirm?: MenuAction['confirm']; input?: MenuAction['input'];
  run: (g: GameState, a: Asset, st: StudioState, x: StudioEngine, input?: string) => void
}, engineId: string): MenuAction {
  return {
    type: 'action', id: `studio.engine.${id}.${engineId}.${a.id}`, label, emoji: '⚙️',
    subtitle: opts.subtitle, confirm: opts.confirm, input: opts.input,
    disabledReason: (g) => manageBlock(g, a),
    run: (g, input) => {
      const found = current(g, a.id)
      if (!found || manageBlock(g, found)) return
      const st = readStudio(found.details)
      const x = st.engines.find((e) => e.id === engineId)
      if (!x || x.stage === 'sold') return
      opts.run(g, found, st, x, input)
    },
  }
}

function engineNode(a: Asset, x: StudioEngine): MenuGroup {
  return {
    type: 'menu', id: `studio.engine.${x.id}.${a.id}`, label: x.name, emoji: '⚙️',
    subtitle: x.stage === 'dev' ? `${engineTier(x.tier).label} · ${Math.round(x.progress)}% · ${x.team} devs` : x.stage === 'sold' ? `IP sold for ${money(x.soldFor)}` : `Quality ${Math.round(x.quality)} · ${x.licenses.length} licenses · ${money(x.lastRevenue)}/yr`,
    header: (g) => {
      const e = readStudio(current(g, a.id)?.details).engines.find((v) => v.id === x.id)
      if (!e) return 'This engine is no longer available.'
      const tier = engineTier(e.tier)
      return `${tier.label} · ${money(e.spent)} invested · ${money(e.earned)} lifetime licensing receipts.\n${e.stage === 'dev' ? `About ${tier.years} years with ${tier.team} developers. R&D up to ${money(tier.research)}/yr plus payroll. Set the team to 0 to pause; build a new version to improve an older engine.` : e.stage === 'sold' ? 'The buyer owns the engine and its licensing income. Existing games retain their use rights.' : `Royalty-free for your own ${tier.maxScope === 2 ? 'indie' : 'indie, AA, and AAA'} games. New licenses: ${e.terms}. Three-year contracts retain their original terms; demand depends on quality, studio brand, engine age, and the yearly market. Support costs apply. Selling transfers all IP and contracts.`}`
    },
    children: (g) => {
      const found = current(g, a.id)
      const e = readStudio(found?.details).engines.find((v) => v.id === x.id)
      if (!found || !e || e.stage === 'sold') return []
      if (e.stage === 'dev') return [
        engineAction(a, 'team', 'Set Engine Team', {
          input: { kind: 'slider', label: 'Developers (0 pauses development)', min: 0, max: readBiz(g, found).employees, defaultValue: () => String(e.team) },
          run: (gg, aa, st, engine, input) => {
            if (engine.stage !== 'dev' || input === undefined || !input.trim()) return
            const n = Number(input)
            if (!Number.isFinite(n)) return
            engine.team = Math.round(clampN(n, 0, readBiz(gg, aa).employees))
            aa.details.studio = toJson(st)
            notice(gg, 'Engine Team Set', `${engine.team} developers assigned to ${engine.name}.${engine.team === 0 ? ' Development is paused.' : ' Overlapping teams share developers and slow down.'}`, { emoji: '👥' })
          },
        }, e.id),
        engineAction(a, 'cancel', 'Cancel Engine Development', {
          confirm: () => `Cancel ${e.name}? ${money(e.spent)} already spent is not refunded. Developers become available for other projects.`,
          run: (gg, aa, st, engine) => {
            if (engine.stage !== 'dev') return
            st.engines = st.engines.filter((v) => v.id !== engine.id)
            aa.details.studio = toJson(st)
            refreshValue(aa, bizOf(gg, aa))
            notice(gg, 'Engine Cancelled', `${engine.name} was cancelled. No development costs were refunded.`, { emoji: '⚙️' })
          },
        }, e.id),
      ]
      const tier = engineTier(e.tier)
      return [
        {
          type: 'menu', id: `studio.engine.contracts.${e.id}.${a.id}`, label: 'License Contracts', emoji: '📜',
          subtitle: `${e.licenses.length} three-year licenses · ${money(e.lastRevenue)} receipts last year`,
          children: (gg): MenuNode[] => {
            const engine = readStudio(current(gg, a.id)?.details).engines.find((v) => v.id === e.id)
            if (!engine || engine.stage !== 'ready') return []
            if (!engine.licenses.length) return [{ type: 'info', id: `studio.engine.contracts.empty.${e.id}.${a.id}`, text: 'No clients yet. Open annual-fee or revenue-royalty licensing, then age up. Customers choose engines based on quality, reputation, age, and the market.' }]
            return engine.licenses.map((l) => ({
              type: 'info', id: `studio.engine.contract.${l.id}.${e.id}.${a.id}`,
              text: `Studio license #${l.id}: ${l.terms === 'subscription' ? `${money(l.fee)} per year` : `${Math.round(l.royalty * 100)}% of annual game receipts above ${money(1_000_000)}`} · fiscal years ${l.start}–${l.until}.`,
            }))
          },
        },
        ...(['private', 'subscription', 'royalty'] as EngineTerms[]).map((terms) => engineAction(a, `terms.${terms}`, `${terms === 'private' ? 'Keep Private / Close New Licensing' : terms === 'subscription' ? 'License for Annual Fees' : 'License for Revenue Royalties'}${terms === e.terms ? ' (current)' : ''}`, {
          subtitle: terms === 'private' ? 'No new clients; existing contracts continue until expiry' : terms === 'subscription' ? `${money(tier.fee)}/studio/year · three-year licenses` : `5% of each client's annual game receipts above ${money(1_000_000)} · three-year licenses`,
          run: (gg, aa, st, engine) => {
            if (engine.stage !== 'ready') return
            engine.terms = terms
            aa.details.studio = toJson(st)
            notice(gg, 'Engine Licensing Updated', `${engine.name}: ${terms === 'private' ? 'closed to new clients' : terms === 'subscription' ? 'annual-fee licenses available' : 'revenue-royalty licenses available'}. Existing three-year contracts keep their terms. Income arrives in the yearly studio accounts, not your personal balance.`, { emoji: '📜' })
          },
        }, e.id)),
        engineAction(a, 'sell', 'Sell Engine IP Outright', {
          subtitle: `${money(engineIpValue(e, g.year))} to company cash`,
          confirm: (gg) => {
            const cur = readStudio(current(gg, a.id)?.details).engines.find((v) => v.id === e.id)
            return cur ? `Sell ${cur.name} for ${money(engineIpValue(cur, gg.year))}? You lose ownership, all future licensing income, and use in new games. Existing games retain their royalty-free rights.` : 'This engine is no longer available.'
          },
          run: (gg, aa, _st, engine) => sellStudioEngine(gg, aa.id, engine.id),
        }, e.id),
      ]
    },
  }
}

export function studioEngineMenu(a: Asset): MenuGroup {
  const engines = readStudio(a.details).engines
  return {
    type: 'menu', id: `studio.engines.${a.id}`, label: 'Game Engines', emoji: '⚙️',
    subtitle: `${engines.filter((x) => x.stage === 'dev').length} in development · ${engines.filter((x) => x.stage === 'ready').length} owned · build, license, or sell`,
    disabledReason: (gg) => manageBlock(gg, a),
    header: () => 'Build technology your studio owns. Choose an engine when greenlighting a game to use it without royalties. License it to other studios for recurring company income, or sell the intellectual property outright. Engine teams share your existing developers; hire more or adjust project teams if needed.',
    children: (gg): MenuNode[] => {
      const found = current(gg, a.id)
      if (!found) return []
      return [
        ...ENGINE_TIERS.map((tier): MenuAction => ({
          type: 'action', id: `studio.engine.start.${tier.id}.${a.id}`, label: `Develop ${tier.label}`, emoji: '🛠️',
          subtitle: `${money(tier.setup)} setup · ${tier.team} devs / ~${tier.years} yr · ${money(tier.research)}/yr R&D + payroll`,
          input: { kind: 'text', label: 'Name your game engine', placeholder: 'e.g. Aurora Engine', defaultValue: () => `${a.name} Engine ${readStudio(found.details).engineSeq + 1}` },
          disabledReason: (xg) => {
            const cur = current(xg, a.id)
            return cur ? engineDevelopmentBlock(xg, cur, tier.id) : 'You no longer own this studio.'
          },
          run: (xg, input) => startStudioEngine(xg, a.id, tier.id, input ?? ''),
        })),
        ...readStudio(found.details).engines.map((x) => engineNode(found, x)),
      ]
    },
  }
}
