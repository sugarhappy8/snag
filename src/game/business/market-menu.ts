// The sections of the Market & Competition screen: overview, leaderboard, segments, regions and
// countries, history, rival profiles, and the strategy moves beyond the classic four (entering a
// country, brand campaigns, defending the home market, supply chains, patent cross-licences) with
// the scenario table that shows what each is expected to do. Builders are pure menus (no RNG, no
// state writes, cached like the other hints); actions re-read the live business. The Business
// talent's purple hints come from the same quotes the actions use.
import { chartInfo, marketLadderSpec, marketSizeSpec, shareSpec } from '../charts'
import type { ChartSpec } from '../charts/spec'
import { eraOf } from '../history/timeline'
import { talentHint } from '../talents'
import type { Asset, GameState, MenuAction, MenuGroup, MenuInfo, MenuNode } from '../types'
import { marketStateOf, PRICE_POWER, SCALE_SAVING } from './competition-core'
import { mergerLimit, TIERS, type Regime } from './competition-data'
import { marketOwner, marketViewOf, shareText, type MarketView, type RivalView } from './competition'
import { acquireRival, acquisitionGains, acquisitionQuote, offensiveValue, OFFENSIVE_EDGE, raidValue } from './competition-moves'
import { industryDef } from './industries'
import { antitrustRead, demandRead, exactProfit, fogOn, profitRead, rivalLine, rivalLinesOf, rivalStars, scenarioScope, shareBand, unknownMarket, weakest, type Conf, type Fogged, type MarketFog } from './market-fog'
import { cached, hinting, live, mAct } from './market-menu-kit'
import { continentOf } from './market-regional'
import { demandWeights, hasSupplyChain, MODE_LABEL, MODE_TERM } from './market-reach'
import { placeFlag, placeName } from './market-places'
import {
  runCampaign, runDefend, runEnter, runLicense, runSupply,
  campaignCost, entryCandidates, entryOption, quoteCampaign, quoteDefend, quoteLicense, quoteSupply, shareGain, supplyCost,
  type EntryOption, type MoveQuote,
} from './market-strategy'
import {
  bar, concentrationOf, countryDetail, historyOf, leaderboard, localField, mySegment, profileOf, regionsOf, segmentsOf, spark, trendArrow,
  type CountryDetail, type LocalField,
} from './market-view'
import { bizWorth } from './economy'
import { businessAssets, readBiz, type BizState } from './state'
import { waveLines } from './tech-waves'
import { isDeepTech } from './deeptech-state'
import { money, pct, plural } from './util'

const MAX_ROWS = 12

/** Percentage points of share: '+1.2 pts', '+0.03 pts', 'no change'. */
export function pts(x: number): string {
  const a = Math.abs(x * 100)
  if (!(a >= 0.005)) return 'no change in share'
  return `${x >= 0 ? '+' : '-'}${a.toFixed(a < 0.1 ? 2 : 1)} pts share`
}

/** A demand slice: '19%', '0.4%', '<0.1%'. */
function slice(w: number): string {
  if (w < 0.001) return '<0.1%'
  return pct(w, w < 0.01 ? 1 : 0)
}

/** An info row. A row built from an estimate carries its confidence (and the year of an old reading) for the chip. */
function info(id: string, text: string, emoji: string, conf?: Conf, asOf?: number): MenuInfo {
  return { type: 'info', id, text, emoji, ...(conf !== undefined ? { conf } : {}), ...(asOf !== undefined ? { asOf } : {}) }
}

/**
 * A chart row on a market screen (R1-C14). The chart is built from the company and market as they are in the state the row
 * is drawn with, never from the ones the menu was opened with. The row says nothing until the market is booked.
 */
function marketChart(id: string, emoji: string, a: Asset, build: (g: GameState, view: MarketView, name: string) => ChartSpec | null): MenuInfo[] {
  return chartInfo(id, emoji, (_g, spec) => spec?.summary ?? '', (g) => {
    const cur = live(g, a)
    const view = marketViewOf(g, readBiz(g, cur))
    return view.booked ? build(g, view, cur.name) : null
  })
}

function approx(): string {
  return 'Shares, sizes and rankings here are approximate: the long tail of small companies is never counted one by one.'
}

function growthText(v: MarketView): string {
  const p = Math.round(v.growth * 100)
  if (v.growth >= 0.25) return `exploding (+${p}% a year)`
  if (v.growth >= 0.08) return `booming (+${p}% a year)`
  if (v.growth >= 0.02) return `growing ${p}% a year`
  if (v.growth > -0.02) return 'steady'
  return `shrinking ${-p}% a year`
}

function strictWord(r: Regime): string {
  return r.strict < 0.2 ? 'lax' : r.strict < 0.45 ? 'moderate' : r.strict < 0.7 ? 'strict' : 'very strict'
}

// ---------------------------------------------------------------------------
// Overview

export function overviewMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.mkt.overview.${a.id}`,
    label: 'Market Overview',
    emoji: '\u{1F4CA}',
    subtitle: (g) => {
      const v = marketViewOf(g, readBiz(g, live(g, a)))
      const c = concentrationOf(v)
      return `About ${money(v.size)} a year · ${growthText(v)} · ${c.label}`
    },
    header: () => approx(),
    children: (g) => {
      const cur = live(g, a)
      const b = readBiz(g, cur)
      const v = marketViewOf(g, b)
      const c = concentrationOf(v)
      const rows: MenuNode[] = []
      const real = v.rivals.filter((r) => r.real).length
      rows.push(info(`biz.mkt.ov.size.${a.id}`, `Market size: about ${money(v.size)} a year in ${v.place} · ${growthText(v)}`, v.scope === 'world' ? '\u{1F30D}' : placeFlag(b.countryId)))
      if (v.home) rows.push(info(`biz.mkt.ov.home.${a.id}`, `Home vs world: ${v.home.name} is about ${money(v.home.size)} of it · your share at home ≈ ${shareText(v.home.share)}, worldwide ${shareText(v.share)}`, '\u{1F3E0}'))
      else rows.push(info(`biz.mkt.ov.world.${a.id}`, `Home vs world: this trade is local to ${v.place}. Your share of the world's ${v.noun} spending is ${shareText(v.worldShare)}${v.worldShare < 0.0005 ? ' (it takes a global chain to register)' : ''}`, '\u{1F310}'))
      if (v.booked) {
        const tier = TIERS[v.tier]
        rows.push(info(`biz.mkt.ov.me.${a.id}`, `You: ${shareText(v.share)} · #${v.rank} of ${v.rivals.length + 1} named players · ${tier.label}`, tier.emoji))
      } else rows.push(info(`biz.mkt.ov.me.${a.id}`, 'No sales on the books yet: your first full year puts you on the board.', '\u{1F331}'))
      rows.push(info(`biz.mkt.ov.hhi.${a.id}`, `Concentration: index ≈ ${c.hhi.toLocaleString('en-US')} (${c.label}), like ${c.equivalentFirms.toFixed(1)} equal-sized firms. The top three hold ${shareText(c.top3)}.`, '\u{1F9EE}'))
      rows.push(info(`biz.mkt.ov.field.${a.id}`, `The field: ${real > 0 ? `${real} real companies` : `${v.rivals.length} named challengers`} in the top ${v.rivals.length}, plus ${v.scope === 'world' ? 'hundreds of smaller firms' : 'thousands of independents'} holding ${shareText(v.fringe)}`, '\u{1F465}'))
      if (v.unmet >= 0.05) rows.push(info(`biz.mkt.ov.unmet.${a.id}`, `Last year you turned away ${pct(v.unmet)} of the customers who wanted you, and rivals took them. More ${industryDef(b.industry).sitePlural} (Expansion) would keep them.`, '\u{1F6AA}'))
      if (v.dominance > 0) rows.push(info(`biz.mkt.ov.dom.${a.id}`, `Dominance: ${pct(SCALE_SAVING * v.dominance)} lower unit costs from sheer scale${v.scope === 'national' ? `, and customers accept ${pct(PRICE_POWER * v.dominance)} higher prices` : '; customers stay even when you charge more'}`, '\u{1F451}'))
      const at = v.antitrust
      const lobbied = (marketStateOf(b)?.antitrust.lobbyUntil ?? 0) >= g.year
      // The chance of a case is a hidden number: a word, and a percent only with the Business talent or a read (the size at which
      // regulators start looking is a published rule, so the "no risk" line stays as it is).
      const odds = at.label === 'none' ? null : antitrustRead(g, scenarioScope(cur), at.p)
      rows.push(
        info(
          `biz.mkt.ov.anti.${a.id}`,
          at.label === 'none'
            ? `Antitrust: no risk at your size (regulators here only go after companies with more than about ${at.acquisitions >= 2 ? '30' : '35'}% of a market)`
            : `Antitrust risk: ${odds ? odds.text : `${at.label} (about ${pct(at.p)} a year)`} · ${at.regime.name}${lobbied ? ' (lobbied)' : ''}${at.regime.breakUp ? ' · can break companies up' : ''}${at.acquisitions > 0 ? ` · ${at.acquisitions} buy-out${at.acquisitions === 1 ? '' : 's'} in the last 8 years add to it` : ''}${at.regional.length ? ` · also watched in ${at.regional.map((r) => placeName(r.country)).join(', ')}` : ''}`,
          '\u{1F3DB}\u{FE0F}',
          odds?.conf,
          odds?.asOf,
        ),
      )
      // At most three tech-wave rows (the history table can have several live in one trade).
      for (const [i, line] of waveLines(g, b).slice(0, 3).entries()) rows.push(info(`biz.mkt.ov.wave.${i}.${a.id}`, line, '\u{1F30A}'))
      rows.push(info(`biz.mkt.ov.era.${a.id}`, `It's ${eraOf(g.year).label}. ${v.scope === 'world' ? 'The business is global: customers and rivals are everywhere.' : `The business is local: you compete with everyone else in ${v.place}.`}`, '\u{1F570}\u{FE0F}'))
      return rows
    },
  }
}

// ---------------------------------------------------------------------------
// Leaderboard

export function leaderboardMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.mkt.leaders.${a.id}`,
    label: 'Leaderboard',
    emoji: '\u{1F3C6}',
    subtitle: (g) => {
      const v = marketViewOf(g, readBiz(g, live(g, a)))
      const top = v.rivals[0]
      return top ? `${top.name} leads with ${shareText(top.share)}${v.booked ? ` · you are #${v.rank}` : ''}` : 'Nobody else sells this yet'
    },
    header: (g) => `The top ten by share of ${marketOwner(marketViewOf(g, readBiz(g, live(g, a))).place)} market. Bars are relative to the leader. ${approx()}`,
    children: (g) => {
      const cur = live(g, a)
      const b = readBiz(g, cur)
      const v = marketViewOf(g, b)
      const rows = leaderboard(v, b, cur.name, 10)
      const max = Math.max(1e-9, ...rows.map((r) => r.share))
      const nodes: MenuNode[] = rows.map((r) =>
        info(
          `biz.mkt.lb.${a.id}.${r.id}`,
          `#${r.rank} ${r.me ? 'YOU · ' : ''}${r.name} · ${shareText(r.share)} ${trendArrow(r.trend)} · ${r.legacy ? 'state-backed' : r.tier}${r.real || r.me ? '' : ' · local challenger'}${r.seg ? ` · ${r.seg}` : ''} · ${placeName(r.hq)}\n${bar(r.share, max)}`,
          r.me ? '\u{2B50}' : placeFlag(r.hq),
        ),
      )
      nodes.push(info(`biz.mkt.lb.tail.${a.id}`, `Countless small players hold ${shareText(v.fringe)} between them${v.scope === 'national' ? ': the local independents' : ''}.`, '\u{1F465}'))
      if (v.booked) nodes.unshift(...marketChart(`biz.mkt.lb.chart.${a.id}`, '\u{1F3C6}', a, marketLadderSpec))
      return nodes
    },
  }
}

// ---------------------------------------------------------------------------
// Segments

export function segmentsMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.mkt.segments.${a.id}`,
    label: 'Segments',
    emoji: '\u{1F9E9}',
    subtitle: (g) => {
      const b = readBiz(g, live(g, a))
      const s = segmentsOf(b, marketViewOf(g, b)).find((x) => x.mine)
      return s ? `You play in ${s.label.toLowerCase()}` : 'Where you sit against the leaders'
    },
    header: () => `Every market splits by how much customers pay. Your segment follows your prices and quality. ${approx()}`,
    children: (g) => {
      const b = readBiz(g, live(g, a))
      const v = marketViewOf(g, b)
      const rows = segmentsOf(b, v)
      const nodes: MenuNode[] = rows.map((r) =>
        info(
          `biz.mkt.seg.${a.id}.${r.id}`,
          `${r.mine ? 'YOU ARE HERE · ' : ''}${r.label}: ${pct(r.weight)} of the money (about ${money(r.size)}) · you ${r.me > 0 ? shareText(r.me) : 'absent'}${r.rank > 0 ? ` (#${r.rank} of ${r.players})` : ''} · ${r.leader ? `leader ${r.leader.name} ${shareText(r.leader.share)}` : 'no leader yet'}`,
          r.mine ? '\u{1F4CD}' : '\u{25AB}\u{FE0F}',
        ),
      )
      const mine = mySegment(b, v.index)
      const open = rows.filter((r) => !r.mine && r.me === 0 && r.weight >= 0.12)[0]
      nodes.push(info(`biz.mkt.seg.tip.${a.id}`, open ? `Room to move: ${open.label.toLowerCase()} is ${pct(open.weight)} of the money and you have none of it. Prices and quality decide your segment.` : `You sit in ${rows.find((r) => r.id === mine)?.label.toLowerCase() ?? 'the middle'}. Charging much more or less, or changing quality, moves you.`, '\u{1F4A1}'))
      return nodes
    },
  }
}

// ---------------------------------------------------------------------------
// Regions and countries

/**
 * The rows of one country of a world market. `fog` is present for a market the player does not know (knownMarket): its demand,
 * its leader's share and its champions' shares then read as estimates, with a chip. Without it, or in Exact mode, the rows are
 * today's text.
 */
export function countryRows(a: Asset, d: CountryDetail, fog?: MarketFog): MenuNode[] {
  const id = d.row.id
  const k = (s: string) => `biz.mkt.c.${a.id}.${id}.${s}`
  const rows: MenuNode[] = []
  const appetite = d.appetite >= 1.5 ? 'hungry' : d.appetite >= 0.8 ? 'typical' : 'small'
  const dem = fog ? demandRead(fog.g, fog, id, d.row.demand) : null
  if (dem && dem.conf !== undefined) rows.push(info(k('size'), `Local demand: ${dem.text} a year · appetite ${appetite}`, '\u{1F4B0}', dem.conf, dem.asOf))
  else rows.push(info(k('size'), `Local demand: about ${money(d.row.demand)} a year (${slice(d.row.weight)} of the world) · appetite ${appetite}`, '\u{1F4B0}'))
  rows.push(info(k('me'), `Your share there: ${d.row.me > 0 ? shareText(d.row.me) : 'none'}${d.entered ? ` · ${MODE_LABEL[d.entered.mode as keyof typeof MODE_LABEL]?.toLowerCase() ?? d.entered.mode} since ${d.entered.year}` : d.row.presence > 0.3 ? ' · you have outlets there' : ' · you do not sell there directly'}`, '\u{1F4CD}'))
  const lead = d.row.leader
  const leadShare = lead ? readShare(fog, id, lead.share, lead.name) : null
  rows.push(info(k('lead'), lead && leadShare ? `Leader there: ${lead.name} (${placeName(lead.hq)}) with ${leadShare.text}` : 'Nobody dominates it', '\u{1F947}', leadShare?.conf, leadShare?.asOf))
  if (d.champions.length) {
    const shares = d.champions.map((c) => readShare(fog, id, c.share, c.name))
    const w = weakest(shares)
    rows.push(info(k('champs'), `Local champions: ${d.champions.map((c, i) => `${c.name} ${shares[i]!.text}`).join(' · ')}`, '\u{1F3E0}', w.conf, w.asOf))
  }
  rows.push(info(k('trade'), d.barriers.bloc ? `Trade: no tariffs between you and ${placeName(id)} (same bloc)` : `Trade: ${pct(d.barriers.tariff)} tariff on goods${d.barriers.effective < d.barriers.tariff * 0.5 ? ' (little of this business is physical goods)' : ''} · other barriers ${d.barriers.other < 0.25 ? 'light' : d.barriers.other < 0.5 ? 'moderate' : 'heavy'} · ${d.barriers.label}`, '\u{1F6C3}'))
  rows.push(info(k('fx'), d.fx.shared ? `Currency: the same currency as your home market (${d.fx.code})` : d.fx.label === 'none' ? 'Currency: your home currency' : `Currency exposure: ${d.fx.label} (${d.fx.code}; about ${pct(d.fx.swing)} a year of swings recently)`, '\u{1F4B1}'))
  rows.push(info(k('reg'), `Regulators: ${d.regime.name} · ${strictWord(d.regime)}${d.regime.breakUp ? ' · can break companies up' : ''} · merger limit about ${pct(d.mergerLimit)} combined share · cases start above about 35% local share${d.caseChance > 0 ? ` (yours: about ${pct(d.caseChance)} a year)` : ''}`, '\u{1F3DB}\u{FE0F}'))
  return rows
}

/** A share as a row says it: the number in a market the player knows, an estimate (with its chip) in one it does not. */
function readShare(fog: MarketFog | undefined, countryId: string, share: number, who: string): Fogged {
  return fog ? shareBand(fog.g, fog, countryId, share, who) : { text: shareText(share) }
}

/** The rows of one national market (the same trade in another country). `fog` as in countryRows. */
export function localRows(a: Asset, f: LocalField, v: MarketView, fog?: MarketFog): MenuNode[] {
  const k = (s: string) => `biz.mkt.l.${a.id}.${f.id}.${s}`
  const rows: MenuNode[] = []
  const dem = fog ? demandRead(fog.g, fog, f.id, f.demand) : null
  const outlets = f.outlets > 0 ? ` · you have ${f.outlets} outlet${f.outlets === 1 ? '' : 's'} there` : ''
  const appetite = f.appetite >= 1.5 ? 'hungry' : f.appetite >= 0.8 ? 'typical' : 'small'
  rows.push(info(k('size'), `Local market: ${dem && dem.conf !== undefined ? dem.text : `roughly ${money(f.demand)}`} a year · appetite ${appetite}${outlets}`, '\u{1F4B0}', dem?.conf, dem?.asOf))
  if (!f.top.length) rows.push(info(k('none'), 'No big names yet: a field of independents.', '\u{1F3DC}\u{FE0F}'))
  f.top.forEach((t, i) => {
    const s = readShare(fog, f.id, t.share, t.name)
    rows.push(info(k(`t${i}`), `${t.name} (${placeName(t.hq)}) · ${s.conf !== undefined ? s.text : `about ${s.text}`}${t.real ? '' : ' · local challenger'}`, placeFlag(t.hq), s.conf, s.asOf))
  })
  rows.push(info(k('tail'), `Independents hold about ${pct(f.fringe)} of customers, in thousands of small shops.`, '\u{1F465}'))
  rows.push(info(k('reg'), `Regulators: ${f.regime.name} · ${strictWord(f.regime)}${f.regime.breakUp ? ' · can break companies up' : ''} · merger limit about ${pct(mergerLimit(f.regime))}`, '\u{1F3DB}\u{FE0F}'))
  void v
  return rows
}

export function regionsMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.mkt.regions.${a.id}`,
    label: 'Regions & Countries',
    emoji: '\u{1F5FA}\u{FE0F}',
    subtitle: (g) => {
      const b = readBiz(g, live(g, a))
      const v = marketViewOf(g, b)
      return v.scope === 'world' ? `${v.booked ? `Your share at home ≈ ${shareText(v.home?.share ?? 0)}` : 'Demand, rivals and rules by country'}` : `${v.place} and the countries where you could expand`
    },
    header: (g) => {
      const v = marketViewOf(g, readBiz(g, live(g, a)))
      return v.scope === 'world' ? `Who holds what in each country, and the tariffs, currency and rules you would meet there. Splits are modeled from home advantage, trade barriers and your presence. ${approx()}` : `${v.noun} is a local trade: your share is fought in ${v.place}. Other countries show who you would face if you opened outlets there. ${approx()}`
    },
    children: (g) => {
      const b = readBiz(g, live(g, a))
      const v = marketViewOf(g, b)
      if (v.scope === 'national') return nationalRegions(g, a, b, v)
      const regions = regionsOf(g, b, v)
      return regions.map((r): MenuGroup => ({
        type: 'menu',
        id: `biz.mkt.region.${a.id}.${r.name}`,
        label: r.name,
        emoji: '\u{1F30D}',
        subtitle: `${slice(r.weight)} of demand (about ${money(r.demand)}) · you ${r.me > 0 ? shareText(r.me) : '0%'}${r.leader ? ` · leader ${r.leader.name} ${shareText(r.leader.share)}` : ''}`,
        children: (gg) => {
          const bb = readBiz(gg, live(gg, a))
          const vv = marketViewOf(gg, bb)
          const rr = regionsOf(gg, bb, vv).find((x) => x.name === r.name)
          const list = rr?.countries ?? []
          const shown = list.slice(0, MAX_ROWS)
          const nodes: MenuNode[] = shown.map((c): MenuGroup => ({
            type: 'menu',
            id: `biz.mkt.country.${a.id}.${c.id}`,
            label: c.name,
            emoji: placeFlag(c.id),
            subtitle: `${slice(c.weight)} of demand · you ${c.me > 0 ? shareText(c.me) : '0%'}${c.leader ? ` · ${c.leader.name} ${shareText(c.leader.share)}` : ''}`,
            children: (g3) => {
              const b3 = readBiz(g3, live(g3, a))
              const v3 = marketViewOf(g3, b3)
              const d = countryDetail(g3, b3, v3, c.id)
              return d ? countryRows(a, d, unknownMarket(g3, b3, c.id)) : []
            },
          }))
          if (list.length > shown.length) nodes.push(info(`biz.mkt.region.more.${a.id}.${r.name}`, `…and ${list.length - shown.length} smaller markets, together ${slice(list.slice(shown.length).reduce((t, c) => t + c.weight, 0))} of demand.`, '\u{1F4C9}'))
          return nodes
        },
      }))
    },
  }
}

function nationalRegions(g: GameState, a: Asset, b: BizState, v: MarketView): MenuNode[] {
  const w = demandWeights(b.industry)
  const abroad = [...new Set(b.outlets.filter((o) => o.countryId !== b.countryId).map((o) => o.countryId))]
  const biggest = [...w.entries()].filter(([c, x]) => c !== b.countryId && x > 0 && !abroad.includes(c)).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([c]) => c)
  const list = [b.countryId, ...abroad.slice(0, 4), ...biggest]
  const seen = new Set<string>()
  const nodes: MenuNode[] = []
  for (const c of list) {
    if (seen.has(c)) continue
    seen.add(c)
    nodes.push({
      type: 'menu',
      id: `biz.mkt.nat.${a.id}.${c}`,
      label: c === b.countryId ? `${placeName(c)} (home)` : placeName(c),
      emoji: placeFlag(c),
      subtitle: c === b.countryId ? `${shareText(v.share)} of ${v.noun} · #${v.rank}` : 'Who you would face there',
      children: (gg) => {
        const bb = readBiz(gg, live(gg, a))
        const vv = marketViewOf(gg, bb)
        return localRows(a, localField(gg, bb, vv, c), vv, unknownMarket(gg, bb, c))
      },
    })
  }
  void g
  return nodes
}

// ---------------------------------------------------------------------------
// History

export function historyMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.mkt.history.${a.id}`,
    label: 'History',
    emoji: '\u{1F4C8}',
    subtitle: (g) => {
      const v = marketViewOf(g, readBiz(g, live(g, a)))
      const h = v.history
      return h.length >= 2 ? `Share ${shareText(h[h.length - 1].share)} · ${spark(h.slice(-8).map((x) => x.share))}` : 'Fills in as you book years'
    },
    header: () => 'Your share, the leader’s share and the market’s size over the years you have been on the board (sparklines scale to each line’s own peak).',
    children: (g) => {
      const v = marketViewOf(g, readBiz(g, live(g, a)))
      const h = historyOf(v, 12)
      if (h.years.length < 2) return [info(`biz.mkt.hist.none.${a.id}`, 'Not enough history yet: two booked years make a trend.', '\u{1F331}')]
      const first = h.years[0]
      const last = h.years[h.years.length - 1]
      const lead = h.lead.map((x) => x ?? 0)
      const rows: MenuNode[] = [
        info(`biz.mkt.hist.me.${a.id}`, `Your share ${first}–${last}: ${shareText(h.me[0])} → ${shareText(h.me[h.me.length - 1])}\n${spark(h.me)}`, '\u{1F4C8}'),
      ]
      if (v.booked) rows.push(...marketChart(`biz.mkt.hist.chart.${a.id}`, '\u{1F4C8}', a, shareSpec))
      if (h.lead.some((x) => x !== null)) rows.push(info(`biz.mkt.hist.lead.${a.id}`, `Leader's share: ${shareText(lead[0])} → ${shareText(lead[lead.length - 1])}\n${spark(lead)}`, '\u{1F947}'))
      rows.push(info(`biz.mkt.hist.size.${a.id}`, `Market size: ${money(h.size[0])} → ${money(h.size[h.size.length - 1])} a year\n${spark(h.size)}`, '\u{1F4B0}'))
      if (v.booked) rows.push(...marketChart(`biz.mkt.hist.size.chart.${a.id}`, '\u{1F4B0}', a, marketSizeSpec))
      if (h.hhi.some((x) => x !== null)) {
        const hhi = h.hhi.map((x) => x ?? 0)
        rows.push(info(`biz.mkt.hist.hhi.${a.id}`, `Concentration: ${Math.round(hhi[0])} → ${Math.round(hhi[hhi.length - 1])}\n${spark(hhi)}`, '\u{1F9EE}'))
      }
      const recent = v.history.slice(-5).reverse()
      for (const r of recent) rows.push(info(`biz.mkt.hist.y.${a.id}.${r.year}`, `${r.year}: ${shareText(r.share)} · #${r.rank}${r.lead !== undefined ? ` · leader ${shareText(r.lead)}` : ''} · market ${money(r.size)}`, '\u{1F4C5}'))
      return rows
    },
  }
}

// ---------------------------------------------------------------------------
// Rival profiles

export function rivalsMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.mkt.rivals.${a.id}`,
    label: 'Rival Profiles',
    emoji: '\u{1F575}\u{FE0F}',
    subtitle: (g) => {
      const v = marketViewOf(g, readBiz(g, live(g, a)))
      return `${v.rivals.length} named competitors · tap one for its story`
    },
    header: () => `Real companies appear from the year they were founded (or reached your market) until they really ended. Local challengers are fictional. ${approx()}`,
    children: (g) => {
      const v = marketViewOf(g, readBiz(g, live(g, a)))
      const top = v.rivals.slice(0, MAX_ROWS)
      const nodes: MenuNode[] = top.map((r): MenuGroup => ({
        type: 'menu',
        id: `biz.mkt.rival.${a.id}.${r.id}`,
        label: r.name,
        emoji: placeFlag(r.hq),
        subtitle: `${shareText(r.share)} ${trendArrow(r.trend)} · ${r.legacy ? 'state-backed' : r.tier}${r.real ? '' : ' · local challenger'} · est. ${r.founded}`,
        children: (gg) => rivalRows(gg, a, r.id),
      }))
      if (v.rivals.length > top.length) nodes.push(info(`biz.mkt.rivals.more.${a.id}`, `…and ${v.rivals.length - top.length} smaller named players.`, '\u{1F465}'))
      return nodes
    },
  }
}

/**
 * What a rival sells, best-selling kinds first, with its quality in each: 'Sells: Street Lighting (64) · Hydro Dam (58)'. In
 * Realistic mode the quality is an estimate ('Street Lighting (45 to 85)') and the row carries the weakest confidence shown.
 */
function productsLine(g: GameState, b: BizState, r: RivalView): Fogged {
  const lines = rivalLinesOf(g, b, r)
  if (!lines.length) return { text: 'Sells: its basic range (no product lines of note yet)' }
  const shown = lines.slice(0, 4).map((l) => ({ family: l.family, read: rivalLine(g, b, r.id, l.family, l.quality) }))
  const text = `Sells: ${shown.map((x) => `${x.family} (${x.read.text})`).join(' \u{00B7} ')}${lines.length > 4 ? ` \u{00B7} +${lines.length - 4} more` : ''}`
  return { text, ...weakest(shown.map((x) => x.read)) }
}

function rivalRows(g: GameState, a: Asset, rivalId: string): MenuNode[] {
  const cur = live(g, a)
  const b = readBiz(g, cur)
  const v = marketViewOf(g, b)
  const p = profileOf(g, b, v, rivalId)
  if (!p) return [info(`biz.mkt.rp.gone.${a.id}.${rivalId}`, 'This company has left the market.', '\u{1F44B}')]
  const r = p.rival
  const k = (s: string) => `biz.mkt.rp.${a.id}.${rivalId}.${s}`
  // What the player cannot see of a rival is read through the estimate core (market-fog.ts); Exact mode keeps today's text.
  const fq = rivalStars(g, b, r, 'quality')
  const ft = rivalStars(g, b, r, 'tech')
  const sold = productsLine(g, b, r)
  const strong = weakest([fq, ft])
  const nodes: MenuNode[] = [
    info(k('who'), `${r.real ? 'A real company' : r.extra === 'spinoff' ? 'Your old spin-off' : r.extra === 'entrant' ? 'A newcomer drawn by your profits' : 'A fictional local challenger'} · founded ${r.founded} (${p.age} years) · based in ${placeName(r.hq)}`, placeFlag(r.hq)),
    info(k('size'), `Size: ${r.legacy ? 'state-backed' : r.tier} · ${shareText(r.share)} of the market ${trendArrow(r.trend)} · segment ${p.segment}${r.seg ? '' : ''}`, '\u{1F4CF}'),
    info(k('str'), `Strengths${fogOn() ? ' (estimated)' : r.real ? ' (modeled)' : ''}: quality ${fq.text} · technology ${ft.text} · prices ${p.strengths.priceEdge === 'cheaper' ? 'below yours' : p.strengths.priceEdge === 'pricier' ? 'above yours' : 'like yours'}`, '\u{1F4AA}', strong.conf, strong.asOf),
    info(k('where'), `Plays in: ${p.places.join(', ')}`, '\u{1F5FA}\u{FE0F}'),
    info(k('lines'), sold.text, '\u{1F4E6}', sold.conf, sold.asOf),
    ...p.recent.slice(0, 4).map((t, i) => info(k(`rec${i}`), t, '\u{1F4F0}')),
    info(k('next'), `Likely next${fogOn() ? ' (our guess)' : ''}: ${p.next}`, '\u{1F52E}'),
  ]
  if (!r.legacy) {
    nodes.push(
      mAct(a, `rbuy.${rivalId}`, `Buy out ${r.name}`, '\u{1F91D}', {
        subtitle: (gg) => {
          const bb = readBiz(gg, live(gg, a))
          const q = acquisitionQuote(gg, bb, rivalId)
          const def = industryDef(bb.industry)
          return q ? `${money(q.price)} · ${acquisitionGains(q, def.site, def.sitePlural)} come with it` : 'Not for sale'
        },
        disabled: (gg, bb) => {
          const q = acquisitionQuote(gg, bb, rivalId)
          if (!q) return `${r.name} isn't for sale.`
          if (q.block) return q.block
          if (bb.cash < q.price) return `${a.name} has ${money(Math.max(0, bb.cash))} in cash; this deal needs ${money(q.price)}.`
          return null
        },
        confirm: (gg) => {
          const q = acquisitionQuote(gg, readBiz(gg, live(gg, a)), rivalId)
          if (!q) return null
          const lines = q.lines.length ? ` Its ${plural(q.lines.length, 'product line')} (${q.lines.slice(0, 3).map((l) => l.family).join(', ')}${q.lines.length > 3 ? '…' : ''}) come with it.` : ''
          return `Buy ${r.name} for ${money(q.price)} of ${a.name}'s cash?${lines}`
        },
        run: (gg, c2, b2) => {
          acquireRival(gg, c2, b2, rivalId)
        },
      }),
    )
  }
  return nodes
}

// ---------------------------------------------------------------------------
// Strategy: entering countries

interface EntryList {
  options: EntryOption[]
}

function entryList(g: GameState, a: Asset): EntryList {
  return cached(g, live(g, a), 'entryList', () => {
    const b = readBiz(g, live(g, a))
    const v = marketViewOf(g, b)
    const w = bizWorth(g, b)
    const options = entryCandidates(b, v, 36)
      .map((c) => entryOption(g, b, v, c, w))
      .filter((x): x is EntryOption => !!x)
    return { options }
  })
}

export function bestEntry(g: GameState, a: Asset): EntryOption | null {
  const open = entryList(g, a).options.filter((o) => !o.best.block && o.best.value > 500)
  return open.sort((x, y) => y.best.value - x.best.value)[0] ?? null
}

function quoteLine(q: MoveQuote): string {
  return `${money(q.cost)} · ${pts(q.shareDelta)} · ${q.years} yrs`
}

function valueHint(g: GameState, a: Asset, q: MoveQuote | null, what: string): string | null {
  if (!q || !hinting(g, live(g, a)) || q.block) return null
  return talentHint(g, 'Business', q.value > 0 ? `${what}: worth about ${money(q.value)} more than it costs over ${q.years} years` : `${what}: not worth it, it costs about ${money(-q.value)} more than it brings`)
}

export function expandMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.mkt.expand.${a.id}`,
    label: 'Enter a New Country',
    emoji: '\u{1F6EB}',
    subtitle: 'Export, partner up or open a subsidiary',
    visible: (g) => marketViewOf(g, readBiz(g, live(g, a))).scope === 'world',
    hint: (g) => {
      const best = bestEntry(g, a)
      return best && hinting(g, live(g, a)) ? talentHint(g, 'Business', `Best bet: ${MODE_LABEL[(best.best.move as { mode: keyof typeof MODE_LABEL }).mode].toLowerCase()} in ${placeName(best.country)}, worth about ${money(best.best.value)} over ${best.best.years} years`) : null
    },
    header: () => `Three ways in: sell from home through distributors (cheap, pays the full tariff), partner with a local firm (shares the profit, dodges red tape) or open your own subsidiary (dear, but you build locally). Each runs for a term (${MODE_TERM.export} / ${MODE_TERM.jv} / ${MODE_TERM.sub} years), takes about three years to ramp up, and every extra country adds less than the last. ${approx()}`,
    children: (g) => {
      const list = entryList(g, a).options
      const byCont = new Map<string, EntryOption[]>()
      for (const o of list) {
        const cont = continentOf(o.country)
        const arr = byCont.get(cont)
        if (arr) arr.push(o)
        else byCont.set(cont, [o])
      }
      const nodes: MenuNode[] = []
      const best = bestEntry(g, a)
      if (best) nodes.push(info(`biz.mkt.exp.best.${a.id}`, `Best bet right now: ${placeName(best.country)} (${MODE_LABEL[(best.best.move as { mode: keyof typeof MODE_LABEL }).mode].toLowerCase()}), ${quoteLine(best.best)}`, '\u{1F31F}'))
      else nodes.push(info(`biz.mkt.exp.none.${a.id}`, list.length ? 'No country pays back right now: the market is too small, too closed, or your factories are already full.' : 'No country is open to you in this business yet.', '\u{1F937}'))
      for (const [cont, opts] of [...byCont.entries()].sort((x, y) => y[1].reduce((t, o) => t + o.best.shareDelta, 0) - x[1].reduce((t, o) => t + o.best.shareDelta, 0))) {
        nodes.push({
          type: 'menu',
          id: `biz.mkt.exp.cont.${a.id}.${cont}`,
          label: cont,
          emoji: '\u{1F30D}',
          subtitle: `${opts.length} market${opts.length === 1 ? '' : 's'}`,
          children: () => opts.slice(0, MAX_ROWS).map((o) => countryEntryMenu(a, o.country)),
        })
      }
      return nodes
    },
  }
}

function countryEntryMenu(a: Asset, country: string): MenuGroup {
  return {
    type: 'menu',
    id: `biz.mkt.exp.c.${a.id}.${country}`,
    label: placeName(country),
    emoji: placeFlag(country),
    subtitle: (g) => {
      const o = entryList(g, a).options.find((x) => x.country === country)
      return o ? `${slice(demandWeights(readBiz(g, live(g, a)).industry).get(country) ?? 0)} of demand · best: ${quoteLine(o.best)}` : 'Market'
    },
    children: (g) => {
      const b = readBiz(g, live(g, a))
      const v = marketViewOf(g, b)
      const d = countryDetail(g, b, v, country)
      const rows: MenuNode[] = d ? countryRows(a, d).slice(0, 7) : []
      const o = entryList(g, a).options.find((x) => x.country === country)
      for (const q of o?.all ?? []) {
        const mode = (q.move as { mode: 'export' | 'jv' | 'sub' }).mode
        rows.push(
          mAct(a, `enter.${country}.${mode}`, MODE_LABEL[mode], mode === 'export' ? '\u{1F4E6}' : mode === 'jv' ? '\u{1F91D}' : '\u{1F3ED}', {
            subtitle: () => quoteLine(q),
            hint: (gg) => valueHint(gg, a, q, MODE_LABEL[mode]),
            disabled: () => q.block,
            confirm: () => `${MODE_LABEL[mode]} in ${placeName(country)} for about ${money(q.cost)}? It runs ${q.years} years.`,
            run: (gg, cur, bb) => {
              runEnter(gg, cur, bb, country, mode)
            },
          }),
        )
      }
      return rows
    },
  }
}

// ---------------------------------------------------------------------------
// Strategy: campaigns, defence, supply chains, cross-licences

export function campaignsMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.mkt.campaigns.${a.id}`,
    label: 'Regional Brand Campaigns',
    emoji: '\u{1F4E2}',
    subtitle: 'Win one country’s customers for 3 years',
    hint: (g) => {
      const best = bestCampaign(g, a)
      return best && hinting(g, live(g, a)) ? talentHint(g, 'Business', `Best campaign: ${placeName(best.country)}, worth about ${money(best.q.value)} over ${best.q.years} years`) : null
    },
    header: (g) => {
      const v = marketViewOf(g, readBiz(g, live(g, a)))
      return `${v.scope === 'world' ? 'A push in one country works best where you already sell and fades after three years.' : `A push at home: ${v.place}'s customers see you everywhere for three years.`} Repeat campaigns in the same place add less.`
    },
    children: (g) => {
      const b = readBiz(g, live(g, a))
      const v = marketViewOf(g, b)
      const countries = campaignCountries(g, b, v)
      return countries.map((c) => {
        const q = cached(g, live(g, a), `camp.${c}`, () => quoteCampaign(g, readBiz(g, live(g, a)), marketViewOf(g, readBiz(g, live(g, a))), c))
        return mAct(a, `camp.${c}`, placeName(c), placeFlag(c), {
          subtitle: () => (q ? quoteLine(q) : ''),
          hint: (gg) => valueHint(gg, a, q, 'A campaign here'),
          disabled: () => q?.block ?? null,
          confirm: () => `Run a ${placeName(c)} brand campaign for about ${money(q?.cost ?? campaignCost(b, c))}?`,
          run: (gg, cur, bb) => {
            runCampaign(gg, cur, bb, c)
          },
        })
      })
    },
  }
}

function campaignCountries(g: GameState, b: BizState, v: MarketView): string[] {
  if (v.scope === 'national') return [b.countryId]
  const st = marketStateOf(b)
  const active = new Set([b.countryId, ...(st?.entries.filter((e) => e.until + 2 >= g.year).map((e) => e.country) ?? []), ...b.outlets.map((o) => o.countryId)])
  const w = demandWeights(b.industry)
  const rest = [...w.entries()].filter(([c, x]) => x > 0.01 && !active.has(c)).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([c]) => c)
  return [...active, ...rest].slice(0, MAX_ROWS)
}

export function bestCampaign(g: GameState, a: Asset): { country: string; q: MoveQuote } | null {
  return cached(g, live(g, a), 'bestCampaign', () => {
    const b = readBiz(g, live(g, a))
    const v = marketViewOf(g, b)
    const w = bizWorth(g, b)
    let best: { country: string; q: MoveQuote } | null = null
    for (const c of campaignCountries(g, b, v)) {
      const q = quoteCampaign(g, b, v, c, w)
      if (q && !q.block && q.value > 500 && (!best || q.value > best.q.value)) best = { country: c, q }
    }
    return best
  })
}

export function defendAction(a: Asset): MenuAction {
  return mAct(a, 'defend', 'Defend the Home Market', '\u{1F6E1}\u{FE0F}', {
    subtitle: (g) => {
      const q = defendQuote(g, a)
      return `${money(q.cost)} · customers stick to you for 3 years · ${pts(q.shareDelta)}`
    },
    hint: (g) => valueHint(g, a, defendQuote(g, a), 'Digging in'),
    disabled: (g) => defendQuote(g, a).block,
    confirm: (g) => `Spend ${money(defendQuote(g, a).cost)} on loyalty deals and price matching at home?`,
    run: (g, cur, bb) => {
      runDefend(g, cur, bb)
    },
  })
}

export function defendQuote(g: GameState, a: Asset): MoveQuote {
  return cached(g, live(g, a), 'defendQ', () => quoteDefend(g, readBiz(g, live(g, a))))
}

export function supplyAction(a: Asset): MenuAction {
  return mAct(a, 'supply', 'Diversify Supply Chains', '\u{1F6A2}', {
    visible: (g) => hasSupplyChain(readBiz(g, live(g, a)).industry),
    subtitle: (g) => `${money(supplyCost(readBiz(g, live(g, a))))} · insurance against disruptions, eases tariffs on exports · 5 years`,
    hint: (g) => valueHint(g, a, supplyQuote(g, a), 'Diversifying'),
    disabled: (g) => supplyQuote(g, a).block,
    confirm: (g) => `Spend ${money(supplyQuote(g, a).cost)} on second sources and new shipping routes?`,
    run: (g, cur, bb) => {
      runSupply(g, cur, bb)
    },
  })
}

export function supplyQuote(g: GameState, a: Asset): MoveQuote {
  return cached(g, live(g, a), 'supplyQ', () => quoteSupply(g, readBiz(g, live(g, a))))
}

export function licensesMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.mkt.license.${a.id}`,
    label: 'Patent Cross-Licences',
    emoji: '\u{1F4DC}',
    subtitle: 'Swap patents with a rival: better tech, a stronger rival',
    visible: (g) => isDeepTech(readBiz(g, live(g, a))),
    header: () => 'A cross-licence gives your technology and quality a lift for a fee, but the partner gets stronger too, and regulators dislike cosy deals between the market leaders.',
    children: (g) => {
      const b = readBiz(g, live(g, a))
      const v = marketViewOf(g, b)
      const pool = v.rivals.filter((r) => !r.legacy).slice(0, 8)
      if (!pool.length) return [info(`biz.mkt.lic.none.${a.id}`, 'Nobody worth swapping patents with.', '\u{1F937}')]
      return pool.map((r) => {
        const q = cached(g, live(g, a), `lic.${r.id}`, () => quoteLicense(g, readBiz(g, live(g, a)), marketViewOf(g, readBiz(g, live(g, a))), r.id))
        return mAct(a, `lic.${r.id}`, r.name, placeFlag(r.hq), {
          subtitle: () => (q ? `${money(q.cost)} · ${shareText(r.share)} of the market · tech +3, quality +2` : ''),
          hint: (gg) => valueHint(gg, a, q, 'A cross-licence'),
          disabled: () => q?.block ?? null,
          confirm: () => `Cross-license patents with ${r.name} for about ${money(q?.cost ?? 0)}?`,
          run: (gg, cur, bb) => {
            runLicense(gg, cur, bb, r.id)
          },
        })
      })
    },
  }
}

// ---------------------------------------------------------------------------
// Scenarios

export interface ScenarioRow {
  id: string
  label: string
  /** The move as the end of "If you …": 'cut prices hard', 'buy out Acme'. */
  ask: string
  emoji: string
  shareDelta: number | null
  value: number | null
  cost: number | null
  block: string | null
  note: string
}

/** What each move is expected to do to share and profit, from the real model (pure; cached). */
export function scenarioRows(g: GameState, a: Asset): ScenarioRow[] {
  return cached(g, live(g, a), 'scenarios', () => {
    const cur = live(g, a)
    const b = readBiz(g, cur)
    const v = marketViewOf(g, b)
    const w = bizWorth(g, b)
    const rows: ScenarioRow[] = []
    if (b.price > 0 && b.industry !== 'gameStudio') rows.push({ id: 'offense', label: 'Price offensive', ask: 'cut prices hard', emoji: '\u{1F3F7}\u{FE0F}', shareDelta: shareGain(g, b, OFFENSIVE_EDGE), value: offensiveValue(g, b), cost: null, block: null, note: '15% off for the year, two years of extra customers' })
    const top = v.rivals.find((r) => !r.legacy)
    if (top) rows.push({ id: 'raid', label: 'Talent raid', ask: `poach a team from ${top.name}`, emoji: '\u{1F3A3}', shareDelta: shareGain(g, b, 1 + top.share * 0.08), value: raidValue(g, b), cost: null, block: null, note: 'signing bonuses; a better product, a weaker rival' })
    let bestBuy: { name: string; share: number; value: number; price: number } | null = null
    for (const r of v.rivals.filter((x) => !x.legacy).slice(0, 5)) {
      const q = acquisitionQuote(g, b, r.id)
      if (q && !q.block && q.price <= Math.max(0, b.cash) && (!bestBuy || q.value > bestBuy.value)) bestBuy = { name: r.name, share: r.share * 0.7, value: q.value, price: q.price }
    }
    if (bestBuy) rows.push({ id: 'buy', label: `Buy out ${bestBuy.name}`, ask: `buy out ${bestBuy.name}`, emoji: '\u{1F91D}', shareDelta: bestBuy.share, value: bestBuy.value, cost: bestBuy.price, block: null, note: 'its customers, sites and products come with it; antitrust watches' })
    const be = bestEntry(g, a)
    if (be) rows.push({ id: 'enter', label: `Enter ${placeName(be.country)}`, ask: `move into ${placeName(be.country)}`, emoji: '\u{1F6EB}', shareDelta: be.best.shareDelta, value: be.best.value, cost: be.best.cost, block: null, note: MODE_LABEL[(be.best.move as { mode: keyof typeof MODE_LABEL }).mode].toLowerCase() })
    const bc = bestCampaign(g, a)
    if (bc) rows.push({ id: 'campaign', label: `Campaign in ${placeName(bc.country)}`, ask: `run a brand campaign in ${placeName(bc.country)}`, emoji: '\u{1F4E2}', shareDelta: bc.q.shareDelta, value: bc.q.value, cost: bc.q.cost, block: null, note: '3 years, fades without a renewal' })
    const dq = quoteDefend(g, b, w)
    rows.push({ id: 'defend', label: 'Defend the home market', ask: 'defend your home market', emoji: '\u{1F6E1}\u{FE0F}', shareDelta: dq.shareDelta, value: dq.block ? null : dq.value, cost: dq.cost, block: dq.block, note: 'stickier customers for 3 years' })
    if (hasSupplyChain(b.industry)) {
      const sq = quoteSupply(g, b, w)
      rows.push({ id: 'supply', label: 'Diversify supply chains', ask: 'spread your suppliers', emoji: '\u{1F6A2}', shareDelta: sq.shareDelta, value: sq.block ? null : sq.value, cost: sq.cost, block: sq.block, note: 'insurance against disruptions' })
    }
    if (isDeepTech(b) && top) {
      const lq = quoteLicense(g, b, v, top.id, w)
      if (lq) rows.push({ id: 'license', label: `Cross-license with ${top.name}`, ask: `cross-license with ${top.name}`, emoji: '\u{1F4DC}', shareDelta: lq.shareDelta, value: lq.block ? null : lq.value, cost: lq.cost, block: lq.block, note: 'your tech up, theirs too' })
    }
    return rows
  })
}

/**
 * "If you cut prices hard: share unchanged, about +$32M profit (15% off for the year, …)." In Realistic mode (when the state and
 * the company are given) the profit is the forecast the player may read: a range, 'about' one number, or a word, with the chip
 * its confidence earns. The share change and the cost are the model's and the player's own numbers and keep their digits.
 */
export function scenarioRead(r: ScenarioRow, g?: GameState, a?: Asset): Fogged {
  if (r.block) return { text: `If you ${r.ask}: not possible right now. ${r.block}` }
  const parts: string[] = []
  if (r.shareDelta !== null) {
    const x = Math.abs(r.shareDelta * 100)
    parts.push(!(x >= 0.005) ? 'share unchanged' : `share ${r.shareDelta >= 0 ? 'up' : 'down'} ${x.toFixed(x < 0.1 ? 2 : 1)} pts`)
  }
  let profit: Fogged | null = null
  if (r.value !== null) {
    profit = g && a ? profitRead(g, readBiz(g, live(g, a)), scenarioScope(a), r.id, r.value) : null
    parts.push(profit ? profit.text : exactProfit(r.value))
  }
  if (r.cost !== null) parts.push(`costs ${money(r.cost)}`)
  const text = `If you ${r.ask}: ${parts.join(', ')} (${r.note}).`
  return profit && profit.conf !== undefined ? { text, conf: profit.conf, ...(profit.asOf !== undefined ? { asOf: profit.asOf } : {}) } : { text }
}

export function scenarioLine(r: ScenarioRow, g?: GameState, a?: Asset): string {
  return scenarioRead(r, g, a).text
}

/** The true profit behind a scn: key, found through the companies the player owns (null when none matches, or the move is not on offer). */
export function scenarioTruth(g: GameState, key: string): number | null {
  const p = key.split(':')
  if (p[0] !== 'scn' || p.length !== 4 || p[3] !== 'value') return null
  for (const a of businessAssets(g)) if (scenarioScope(a) === p[1]) return scenarioRows(g, a).find((r) => r.id === p[2])?.value ?? null
  return null
}

export function scenariosMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.mkt.scenarios.${a.id}`,
    label: 'What-If Scenarios',
    emoji: '\u{1F52D}',
    subtitle: 'What each move should do to your share and profit',
    header: () => 'Rough estimates from the same model that books your year: the most share each move could add, and about how much it should make you after its costs. If you already sell all you can make, extra customers add nothing.',
    children: (g) => {
      return scenarioRows(g, a).map((r) => {
        const s = scenarioRead(r, g, a)
        return info(`biz.mkt.sc.${a.id}.${r.id}`, s.text, r.emoji, s.conf, s.asOf)
      })
    },
  }
}
