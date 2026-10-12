// Activities › 💡 Inventor's Workshop, and the Assets screen of an invention. Pure: menus only
// read state (readWorkshop/readInv never write and never touch g's RNG), including the hints.
import { formatMoney, yearActionsUsed } from '../core'
import { talentHint } from '../talents'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { BRAINSTORMS, brainstorm, brainstormBlock, brainstormOdds, buildBlock, buildCost, buildLimit, buildsLeft, startBuild, type Target } from './build'
import { CATEGORIES, DIFFICULTY_LABEL, stars, type IdeaDef } from './catalog'
import {
  benchFor, benchHint, companyLaunchBlock, crowdBlock, dealsLeft, filePatent, giveAway, isFirst, launchBlock, launchLimit, license, licenseQuote, makeInCompany, patentBlock, patentCost,
  pitch, pitchBlock, pitchVenue, routeQuotes, scrapIdea, sellBlock, sellStream, shopRights, startCrowd, streamSaleBlock, subjectOf, LAUNCH_MIN, PATENT_MIN, type Bench, type RouteQuote,
} from './launch'
import { patentActive, pitchOdds, trueAppeal } from './market'
import { blurbOf, findInvention, fittingCompanies, historyOpen, inventions, isGenius, MIN_AGE, readWorkshop, type Owned } from './notebook'
import { NOTEBOOK_MAX, noteDef, rankOf, type Inv, type NoteIdea, type Workshop } from './state'

const ROUTE_LABEL: Record<string, string> = { license: 'licensed', pitch: 'investor deal', crowd: 'crowdfunded, made by you', company: 'made in your company', open: 'free for the world', sold: 'rights sold', legacy: 'old lab' }

function quoteHint(g: GameState, ws: Workshop, b: Bench | null, route: RouteQuote['route']): string | null {
  if (!b || !isGenius(g)) return null
  const q = routeQuotes(g, ws, b).find((x) => x.route === route)
  return q ? talentHint(g, 'Inventor', `Expected: ~${formatMoney(q.value)}${q.company ? ' to the company' : ''}`) : null
}

function bench(g: GameState, t: Target): Bench | null {
  return benchFor(g, readWorkshop(g), t)
}

/** The six launch routes for an idea or a patented invention. */
function launchMenu(t: Target, name: string): MenuGroup {
  return {
    type: 'menu', id: `ws.launch.${t.kind}.${t.id}`, label: 'Launch It', emoji: '\u{1F680}',
    subtitle: (g) => `${dealsLeft(g)}/${launchLimit(g)} big deals left this year`,
    disabledReason: (g) => launchBlock(g, t),
    children: (g) => {
      const ws = readWorkshop(g)
      const b = bench(g, t)
      if (!b) return [{ type: 'info', id: `ws.launch.gone.${t.id}`, text: 'That idea is no longer on your bench.' }]
      const venue = pitchVenue(g)
      const lq = licenseQuote(g, ws, b)
      const nodes: MenuNode[] = [
        { type: 'info', id: `ws.launch.info.${t.id}`, emoji: b.def.emoji, text: `${name} · quality ${Math.round(b.q)} · ${b.patent ? (b.patent.scope === 'world' ? 'patented worldwide' : 'patented at home') : 'no patent: copycats welcome'}` },
        {
          type: 'action', id: `ws.sell.${t.kind}.${t.id}`, label: 'Sell the Rights', emoji: '\u{1F4B0}', subtitle: 'A lump sum now (taxed), 1-3 offers. The idea is gone.',
          hint: (gg) => quoteHint(gg, readWorkshop(gg), bench(gg, t), 'sell'), disabledReason: (gg) => sellBlock(gg, t), run: (gg) => { shopRights(gg, t) },
        },
        {
          type: 'action', id: `ws.license.${t.kind}.${t.id}`, label: 'License It', emoji: '\u{1F91D}', subtitle: `${lq.maker} makes it · you get ${(lq.rate * 100).toFixed(1)}% of every sale`,
          hint: (gg) => quoteHint(gg, readWorkshop(gg), bench(gg, t), 'license'), disabledReason: (gg) => launchBlock(gg, t),
          confirm: (gg) => { const bb = bench(gg, t); const q = bb ? licenseQuote(gg, readWorkshop(gg), bb) : lq; return `License the ${name} to ${q.maker} for ${(q.rate * 100).toFixed(1)}% royalties?` },
          run: (gg) => { license(gg, t) },
        },
        {
          type: 'action', id: `ws.pitch.${t.kind}.${t.id}`, label: venue.show ? `Pitch on ${venue.name}` : 'Pitch at the Invention Fair', emoji: venue.emoji, subtitle: 'Cash now for a cut of your royalties. Or public humiliation.',
          hint: (gg) => { const bb = bench(gg, t); return bb && isGenius(gg) && bb.pitched < 0 ? talentHint(gg, 'Inventor', `${Math.round(pitchOddsFor(gg, bb) * 100)}% chance of an offer`) : null },
          disabledReason: (gg) => pitchBlock(gg, t), run: (gg) => { pitch(gg, t) },
        },
        {
          type: 'action', id: `ws.crowd.${t.kind}.${t.id}`, label: 'Crowdfund It', emoji: '\u{1F3AF}', subtitle: 'Pre-orders fund your own production: a bigger margin',
          visible: (gg) => gg.year >= 2009 && gg.character.age >= 18, hint: (gg) => quoteHint(gg, readWorkshop(gg), bench(gg, t), 'crowd'),
          disabledReason: (gg) => crowdBlock(gg, t), run: (gg) => startCrowd(gg, t),
        },
      ]
      const companies = fittingCompanies(g, b.def.cat)
      if (companies.length) {
        nodes.push({
          type: 'menu', id: `ws.company.${t.kind}.${t.id}`, label: 'Make It in My Company', emoji: '\u{1F3ED}', subtitle: 'The company books 30% of every sale as profit',
          hint: (gg) => quoteHint(gg, readWorkshop(gg), bench(gg, t), 'company'),
          children: (gg) => fittingCompanies(gg, b.def.cat).map((c): MenuAction => ({
            type: 'action', id: `ws.company.${t.kind}.${t.id}.${c.id}`, label: c.name, emoji: '\u{1F3ED}', subtitle: 'Its profit lands in the company books',
            disabledReason: (ggg) => companyLaunchBlock(ggg, t, c.id), confirm: () => `Make the ${name} at ${c.name}?`, run: (ggg) => { makeInCompany(ggg, t, c.id) },
          })),
        })
      }
      nodes.push({
        type: 'action', id: `ws.open.${t.kind}.${t.id}`, label: 'Give It to the World', emoji: '\u{1F30D}', subtitle: 'Free for everyone: karma, fame and respect, no money',
        disabledReason: (gg) => launchBlock(gg, t), confirm: () => `Give the ${name} away for free? You won't earn a cent from it.`, run: (gg) => { giveAway(gg, t) },
      })
      return nodes
    },
  }
}

function pitchOddsFor(g: GameState, b: Bench): number {
  return pitchOdds(g, subjectOf(g, b), trueAppeal(g, b.def), readWorkshop(g).rep)
}

function buildAction(t: Target, def: IdeaDef): MenuAction {
  return {
    type: 'action', id: `ws.build.${t.kind}.${t.id}`, label: 'Build a Prototype', emoji: '\u{1F527}',
    subtitle: (g) => { const c = buildCost(g, def, 'cheap'); return `${buildsLeft(g)}/${buildLimit(g)} builds left · from ${c ? formatMoney(c) : 'free'}` },
    disabledReason: (g) => buildBlock(g, t), run: (g) => startBuild(g, t),
  }
}

function patentActions(t: Target, name: string, home: boolean): MenuAction[] {
  const scopes = home ? (['home', 'world'] as const) : (['world'] as const)
  return scopes.map((scope): MenuAction => ({
    type: 'action', id: `ws.patent.${scope}.${t.kind}.${t.id}`, label: scope === 'home' ? 'Patent at Home' : home ? 'Patent Worldwide' : 'Extend Patent Worldwide', emoji: scope === 'home' ? '\u{1F4DC}' : '\u{1F30D}',
    subtitle: (g) => { const b = bench(g, t); return b ? `${formatMoney(patentCost(g, b, scope))} · needs quality ${PATENT_MIN}+ · ${scope === 'home' ? 'sells at home only' : 'sells everywhere'}` : '' },
    disabledReason: (g) => patentBlock(g, t, scope),
    confirm: (g) => { const b = bench(g, t); return b ? `Pay ${formatMoney(patentCost(g, b, scope))} to patent the ${name}${scope === 'world' ? ' worldwide' : ` in ${getCountry(b.country).name}`}?` : null },
    run: (g) => { filePatent(g, t, scope) },
  }))
}

/** The prototype line of a notebook idea, saying what the next quality milestone unlocks. */
function qualityLine(idea: NoteIdea): string {
  const best = idea.q ? `Best prototype: ${Math.round(idea.q)}/100 after ${idea.builds} build${idea.builds === 1 ? '' : 's'}.` : 'No prototype yet.'
  if (idea.q < LAUNCH_MIN) return `${best} Build one that works (quality ${LAUNCH_MIN}+) to unlock launch deals; ${PATENT_MIN}+ for patents.`
  if (idea.q < PATENT_MIN) return `${best} Reach quality ${PATENT_MIN} to patent it.`
  return best
}

function ideaNode(g: GameState, idea: NoteIdea): MenuGroup {
  const def = noteDef(idea)
  const t: Target = { kind: 'idea', id: idea.id }
  const first = historyOpen(def, g.year)
  return {
    type: 'menu', id: `ws.idea.${idea.id}`, label: def.name, emoji: def.emoji,
    subtitle: `${CATEGORIES[def.cat].label} · ${DIFFICULTY_LABEL[def.d]} · ${idea.q ? `quality ${Math.round(idea.q)}` : 'no prototype yet'}${first ? ` · \u{23F3} beat ${def.real}` : ''}`,
    hint: (gg) => { const b = bench(gg, t); return b ? benchHint(gg, readWorkshop(gg), b) || null : null },
    children: (gg) => {
      const cur = readWorkshop(gg).ideas.find((i) => i.id === idea.id)
      if (!cur) return [{ type: 'info', id: `ws.idea.gone.${idea.id}`, text: 'That idea is no longer in your notebook.' }]
      const nodes: MenuNode[] = [
        { type: 'info', id: `ws.idea.info.${idea.id}`, emoji: def.emoji, text: `${blurbOf(gg, def)} ${stars(def.a)} · ${DIFFICULTY_LABEL[def.d]}` },
        { type: 'info', id: `ws.idea.q.${idea.id}`, emoji: '\u{1F529}', text: qualityLine(cur) },
      ]
      if (isFirst(def, gg.year)) nodes.push({ type: 'info', id: `ws.idea.race.${idea.id}`, emoji: '\u{23F3}', text: `History race: get it on the market by ${def.real} and the world will remember you.` })
      // Patent and launch rows appear once they can matter; until then the quality line says how to unlock them.
      nodes.push(buildAction(t, def), ...(cur.q >= PATENT_MIN ? patentActions(t, def.name, true) : []), ...(cur.q >= LAUNCH_MIN ? [launchMenu(t, def.name)] : []), {
        type: 'action', id: `ws.scrap.${idea.id}`, label: 'Scrap This Idea', emoji: '\u{1F5D1}\u{FE0F}', subtitle: 'Frees a page in your notebook',
        confirm: () => `Crumple up the ${def.name}?`, run: (g2) => { scrapIdea(g2, idea.id) },
      })
      return nodes
    },
  }
}

/** Info and actions for an invention (its Assets screen and the Workshop list). */
export function inventionNodes(g: GameState, a: Asset): MenuNode[] {
  const o = findInvention(g, a.id)
  if (!o) return [{ type: 'info', id: `ws.inv.gone.${a.id}`, text: 'You no longer own this.' }]
  const { inv, def } = o
  const t: Target = { kind: 'asset', id: a.id }
  const nodes: MenuNode[] = [
    { type: 'info', id: `ws.inv.info.${a.id}`, emoji: def.emoji, text: `${blurbOf(g, def)} ${CATEGORIES[def.cat].label} · quality ${Math.round(inv.q)}${inv.inventor ? ` · invented by ${inv.inventor}` : ''}` },
    { type: 'info', id: `ws.inv.patent.${a.id}`, emoji: '\u{1F4DC}', text: patentLine(g, inv) },
  ]
  if (inv.stage === 'patented') {
    nodes.push({ type: 'info', id: `ws.inv.wait.${a.id}`, emoji: '\u{1F4E6}', text: `Not on sale yet. Worth about ${formatMoney(a.value)} to a buyer today.${isFirst(def, g.year) ? ` Beat history: launch by ${def.real}!` : ''}` })
    const hint = (gg: GameState) => { const b = bench(gg, t); return b ? benchHint(gg, readWorkshop(gg), b) || null : null }
    nodes.push({ ...buildAction(t, def), hint }, ...(inv.patent?.scope === 'home' ? patentActions(t, def.name, false) : []), launchMenu(t, def.name))
    return nodes
  }
  const since = inv.launched > g.year - 1 ? `On sale from ${inv.launched}` : `On sale since ${inv.launched}`
  nodes.push({ type: 'info', id: `ws.inv.route.${a.id}`, emoji: '\u{1F680}', text: `${since} · ${ROUTE_LABEL[inv.route ?? ''] ?? 'on sale'}${inv.maker ? ` (${inv.maker})` : ''}${inv.route === 'company' ? '' : ` · ${(inv.rate * 100).toFixed(1)}% to you`}` })
  if (inv.last >= inv.launched) {
    nodes.push({ type: 'info', id: `ws.inv.last.${a.id}`, emoji: '\u{1F4CA}', text: `Last year: ${Math.round(inv.lastUnits).toLocaleString('en-US')} sold · ${formatMoney(inv.lastIncome)} ${inv.route === 'company' ? `to ${inv.maker}` : 'to you'}` })
    nodes.push({ type: 'info', id: `ws.inv.total.${a.id}`, emoji: '\u{1F4B0}', text: `Lifetime: ${Math.round(inv.units).toLocaleString('en-US')} sold · ${inv.route === 'company' ? `${formatMoney(inv.companyEarned)} profit for ${inv.maker}` : `${formatMoney(inv.earned)} earned`}` })
  }
  if (inv.route !== 'company') {
    nodes.push({
      type: 'action', id: `ws.inv.sell.${a.id}`, label: 'Sell Your Share', emoji: '\u{1F4B5}', subtitle: `About ${formatMoney(a.value)} now (taxed) instead of royalties later`,
      hint: (gg) => { const cur = findInvention(gg, a.id); return cur && isGenius(gg) ? talentHint(gg, 'Inventor', `Real appeal ${stars(trueAppeal(gg, cur.def))} · sold ${Math.round(cur.inv.lastUnits).toLocaleString('en-US')} last year`) : null },
      disabledReason: (gg) => streamSaleBlock(gg, a.id), confirm: (gg) => `Sell your share of the ${def.name} for ${formatMoney(findInvention(gg, a.id)?.a.value ?? 0)}?`,
      run: (gg) => { sellStream(gg, a.id) },
    })
  }
  return nodes
}

function patentLine(g: GameState, inv: Inv): string {
  const p = inv.patent
  if (!p) return 'No patent: copycats welcome.'
  const where = p.scope === 'world' ? 'worldwide' : `in ${getCountry(p.country).name}`
  return patentActive(p, g.year) ? `Patented ${where} until ${p.expires}.` : `Patent ${where} expired in ${p.expires}.`
}

export function inventionSubtitle(g: GameState, a: Asset): string {
  const o = findInvention(g, a.id)
  if (!o) return 'Invention'
  if (o.inv.stage === 'patented') return `Patented · not on sale yet · ${formatMoney(a.value)}`
  if (o.inv.route === 'company') return `Made by ${o.inv.maker || 'your company'}`
  return `On sale · ${formatMoney(o.inv.lastIncome)} last year · worth ${formatMoney(a.value)}`
}

function inventionNode(g: GameState, o: Owned): MenuGroup {
  return { type: 'menu', id: `ws.inv.${o.a.id}`, label: o.a.name, emoji: o.a.emoji, subtitle: inventionSubtitle(g, o.a), children: (gg) => { const cur = findInvention(gg, o.a.id); return cur ? inventionNodes(gg, cur.a) : [{ type: 'info', id: `ws.inv.gone2.${o.a.id}`, text: 'You no longer own this.' }] } }
}

function howItWorks(): MenuGroup {
  const lines = [
    '\u{1F4AD} Ideas land in your notebook (max 12): brainstorm, or wait for inspiration.',
    '\u{1F527} Build prototypes to raise quality. Bold builds can be masterpieces... or explode.',
    '\u{1F4DC} Patent at quality 40+ to stop copycats. Worldwide patents sell everywhere.',
    '\u{1F680} Launch at quality 30+: sell the rights, license it, pitch it, crowdfund it, make it yourself, or give it away.',
    '\u{1F4B0} Launched inventions sell for years: rising, peaking, then fading.',
    '\u{23F3} Geniuses (or skill 80+) can race history to its greatest inventions.',
  ]
  return { type: 'menu', id: 'ws.how', label: 'How It Works', emoji: '\u{2139}\u{FE0F}', children: () => lines.map((text, i) => ({ type: 'info', id: `ws.how.${i}`, text })) }
}

function pastNode(ws: Workshop): MenuGroup {
  return {
    type: 'menu', id: 'ws.past', label: 'Hall of Fame', emoji: '\u{1F3DB}\u{FE0F}', subtitle: `${ws.made.length} invention${ws.made.length === 1 ? '' : 's'} launched`,
    children: (g) => {
      const made = readWorkshop(g).made
      if (!made.length) return [{ type: 'info', id: 'ws.past.none', text: 'Nothing launched yet. Every legend starts in a garage.' }]
      return [...made].reverse().map((m, i) => ({ type: 'info', id: `ws.past.${i}`, emoji: m.emoji, text: `${m.year}: ${m.name} · ${ROUTE_LABEL[m.route] ?? m.route}${m.first ? ' · \u{1F3C6} beat history' : ''}` }))
    },
  }
}

export const workshopMenu: MenuGroup = {
  type: 'menu', id: 'workshop', label: "Inventor's Workshop", emoji: '\u{1F4A1}',
  visible: (g) => g.character.alive && g.character.age >= MIN_AGE,
  subtitle: (g) => { const ws = readWorkshop(g); const r = rankOf(ws.rep); return `${r.emoji} ${r.name} · skill ${Math.round(ws.skill)} · ${ws.ideas.length}/${NOTEBOOK_MAX} ideas` },
  header: (g) => {
    const ws = readWorkshop(g)
    const r = rankOf(ws.rep)
    return `${r.emoji} ${r.name} · reputation ${Math.round(ws.rep)} · skill ${Math.round(ws.skill)}\n\u{1F4D2} ${ws.ideas.length}/${NOTEBOOK_MAX} ideas · \u{1F680} ${ws.launches} launched · \u{1F4B0} ${formatMoney(ws.earned)} earned`
  },
  children: (g) => {
    const ws = readWorkshop(g)
    const nodes: MenuNode[] = [{
      type: 'action', id: 'ws.brainstorm', label: 'Brainstorm', emoji: '\u{1F4AD}',
      subtitle: (gg) => `${BRAINSTORMS - Math.min(BRAINSTORMS, yearActionsUsed(gg, 'workshop.brainstorm'))}/${BRAINSTORMS} left this year`,
      hint: (gg) => talentHint(gg, 'Inventor', `${Math.round(brainstormOdds(gg, readWorkshop(gg)) * 100)}% chance of an idea`) || null,
      disabledReason: (gg) => brainstormBlock(gg), run: (gg) => { brainstorm(gg) },
    }]
    nodes.push({ type: 'heading', id: 'ws.notebookH', label: `Notebook (${ws.ideas.length}/${NOTEBOOK_MAX})` })
    if (!ws.ideas.length) nodes.push({ type: 'info', id: 'ws.notebook.empty', text: 'Your notebook is empty. Brainstorm, or wait for inspiration to strike.' })
    const sorted = [...ws.ideas].sort((x, y) => Number(historyOpen(noteDef(y), g.year)) - Number(historyOpen(noteDef(x), g.year)) || y.q - x.q)
    for (const idea of sorted) nodes.push(ideaNode(g, idea))
    const owned = inventions(g)
    if (owned.length) {
      nodes.push({ type: 'heading', id: 'ws.inventionsH', label: 'My Inventions' })
      for (const o of owned) nodes.push(inventionNode(g, o))
    }
    nodes.push(pastNode(ws), howItWorks())
    return nodes
  },
}

/** For tests and tools: every target currently on the bench. */
export function benchTargets(g: GameState): Target[] {
  const ws = readWorkshop(g)
  return [...ws.ideas.map((i) => ({ kind: 'idea' as const, id: i.id })), ...inventions(g).filter((o) => o.inv.stage === 'patented').map((o) => ({ kind: 'asset' as const, id: o.a.id }))]
}
