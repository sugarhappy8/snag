// The Market & Competition screen on every company: how big its market is (the world or the home
// country) and where it's heading, the company's share, rank and dominance tier, the top rivals,
// customers lost to a lack of capacity, antitrust exposure, and competitive moves (buy out a
// rival, a price offensive, a talent raid, lobbying). Builders only read state; actions re-read
// the live business. The Business talent's purple hints come from the moves' own numbers.
import { eraOf } from '../history/timeline'
import { hasTalent, talentHint } from '../talents'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { marketStateOf, PRICE_POWER, SCALE_SAVING } from './competition-core'
import { TIERS } from './competition-data'
import { marketOwner, marketViewOf, shareLine, shareText, type MarketView } from './competition'
import { acquireRival, acquisitionQuote, lobby, lobbyCost, lobbyOdds, offensiveValue, OFFENSIVE_CUT, priceOffensive, raidCost, raidValue, talentRaid } from './competition-moves'
import { manageBlock } from './gate'
import { industryDef } from './industries'
import { bizOf, findBusiness, readBiz, runsIt, type BizState } from './state'
import { money, pct, priceCapOf, stars } from './util'

// ---------------------------------------------------------------------------
// Hint cache (menus re-render often; the what-ifs run the planner). Never stored in state.

const cache = new Map<string, unknown>()

function cached<T>(g: GameState, a: Asset, what: string, make: () => T): T {
  const key = `${what}|${g.lifeId}|${a.id}|${g.year}|${g.character.stats.smarts}|${hasTalent(g, 'Business') ? 1 : 0}|${JSON.stringify(a.details)}`
  if (cache.has(key)) return cache.get(key) as T
  const v = make()
  cache.set(key, v)
  if (cache.size > 48) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
  return v
}

function live(g: GameState, a: Asset): Asset {
  return findBusiness(g, a.id) ?? a
}

function hinting(g: GameState, a: Asset): boolean {
  return hasTalent(g, 'Business') && !manageBlock(g, a)
}

/** Companies with a price to cut (game studios sell games at launch prices instead). */
function priced(b: BizState): boolean {
  return b.industry !== 'gameStudio' && b.price > 0
}

function mAct(a: Asset, key: string, label: string, emoji: string, opts: {
  subtitle?: (g: GameState) => string
  hint?: (g: GameState) => string | null
  disabled?: (g: GameState, b: BizState) => string | null
  confirm?: (g: GameState) => string | null
  visible?: (g: GameState) => boolean
  run: (g: GameState, a: Asset, b: BizState) => void
}): MenuAction {
  return {
    type: 'action',
    id: `biz.mkt.${key}.${a.id}`,
    label,
    emoji,
    ...(opts.subtitle ? { subtitle: opts.subtitle } : {}),
    ...(opts.hint ? { hint: opts.hint } : {}),
    ...(opts.visible ? { visible: opts.visible } : {}),
    disabledReason: (g) => {
      const block = manageBlock(g, a)
      if (block) return block
      return opts.disabled ? opts.disabled(g, readBiz(g, a)) : null
    },
    confirm: opts.confirm,
    run: (g) => {
      const cur = findBusiness(g, a.id)
      if (!cur || manageBlock(g, cur)) return
      opts.run(g, cur, bizOf(g, cur))
    },
  }
}

// ---------------------------------------------------------------------------
// Words

function growthText(v: MarketView): string {
  const p = Math.round(v.growth * 100)
  if (v.growth >= 0.25) return `exploding (+${p}% a year)`
  if (v.growth >= 0.08) return `booming (+${p}% a year)`
  if (v.growth >= 0.02) return `growing ${p}% a year`
  if (v.growth > -0.02) return 'steady'
  return `shrinking ${-p}% a year`
}

function where(v: MarketView): string {
  return marketOwner(v.place)
}

function eraHeader(g: GameState, v: MarketView): string {
  const era = eraOf(g.year).label
  const scope = v.scope === 'world' ? `The ${v.noun} business is global: your customers and your rivals are everywhere.` : `The ${v.noun} business is local: you compete with everyone else in ${v.place}.`
  const mood = v.growth >= 0.25 ? 'And it is taking off: whoever grabs customers now keeps them.' : v.growth <= -0.05 ? 'And it is in a slump: the weak fold first.' : v.share >= 0.4 ? 'You are the one everyone else is chasing.' : 'Share is won customer by customer.'
  return `It's ${era}. ${scope} ${mood}`
}

function trendArrow(t: number): string {
  return t > 0 ? '\u{2197}\u{FE0F}' : t < 0 ? '\u{2198}\u{FE0F}' : '\u{27A1}\u{FE0F}'
}

// ---------------------------------------------------------------------------
// The Business talent: the best competitive move on the table

interface BestMove {
  text: string
  value: number
  id: string
}

function bestMove(g: GameState, a: Asset): BestMove | null {
  return cached(g, a, 'bestMove', () => {
    const b = readBiz(g, a)
    const v = marketViewOf(g, b)
    const moves: BestMove[] = []
    if (priced(b) && priceCapOf(g, a.id) === null) moves.push({ id: 'offense', value: offensiveValue(g, b), text: 'A price offensive pays this year' })
    if (v.rivals.some((r) => !r.legacy)) moves.push({ id: 'raid', value: raidValue(g, b), text: `Raid ${v.rivals[0]?.name ?? 'the top rival'}'s talent` })
    for (const r of v.rivals.slice(0, 6)) {
      const q = acquisitionQuote(g, b, r.id)
      if (q && !q.block && q.price <= Math.max(0, b.cash)) moves.push({ id: `buy.${r.id}`, value: q.value, text: `Buy out ${r.name}` })
    }
    const best = moves.filter((m) => Number.isFinite(m.value) && m.value > 500).sort((x, y) => y.value - x.value)[0]
    return best ?? null
  })
}

// ---------------------------------------------------------------------------
// Rows

function infoRows(g: GameState, a: Asset, v: MarketView, b: BizState): MenuNode[] {
  const rows: { text: string; emoji: string }[] = []
  rows.push({ text: `Market: about ${money(v.size)} a year in ${v.place} · ${growthText(v)}`, emoji: v.scope === 'world' ? '\u{1F30D}' : getCountry(b.countryId).flag })
  if (v.home) rows.push({ text: `${v.home.name}: about ${money(v.home.size)} of it · your share at home ≈ ${shareText(v.home.share)}`, emoji: '\u{1F3E0}' })
  else rows.push({ text: `World share: ${shareText(v.worldShare)}${v.worldShare < 0.0005 ? ' (it takes a global chain to register worldwide)' : ''}`, emoji: '\u{1F310}' })
  if (v.booked) {
    const tier = TIERS[v.tier]
    rows.push({ text: `Your share: ${shareText(v.share)} · #${v.rank} of ${v.rivals.length + 1} named players · ${tier.label}`, emoji: tier.emoji })
    const h = v.history.slice(-5)
    if (h.length >= 2) rows.push({ text: `Share by year: ${h.map((x) => `${x.year} ${shareText(x.share)}`).join(' → ')}`, emoji: '\u{1F4C8}' })
  } else rows.push({ text: 'No sales on the books yet: your first full year puts you on the board.', emoji: '\u{1F331}' })
  if (v.unmet >= 0.05) {
    const def = industryDef(b.industry)
    rows.push({ text: `Last year you turned away ${pct(v.unmet)} of the customers who wanted you, and rivals took them. More ${def.sitePlural} (Expansion) or capacity would keep them.`, emoji: '\u{1F6AA}' })
  }
  if (v.dominance > 0) {
    rows.push({ text: `Dominance: ${pct(SCALE_SAVING * v.dominance)} lower unit costs from sheer scale${v.scope === 'national' ? `, and customers accept ${pct(PRICE_POWER * v.dominance)} higher prices` : '; customers stay even when you charge more'}`, emoji: '\u{1F451}' })
  }
  const at = v.antitrust
  const lobbied = (marketStateOf(b)?.antitrust.lobbyUntil ?? 0) >= g.year
  rows.push({
    text: at.label === 'none' ? `Antitrust: no risk at your size (regulators here only go after companies with more than about 35% of a market)` : `Antitrust risk: ${at.label} (about ${pct(at.p)} a year) · ${at.regime.name}${lobbied ? ' (lobbied)' : ''}${at.regime.breakUp ? ' · can break companies up' : ''}`,
    emoji: '\u{1F3DB}\u{FE0F}',
  })
  return rows.map((r, i): MenuNode => ({ type: 'info', id: `biz.mkt.info.${a.id}.${i}`, text: r.text, emoji: r.emoji }))
}

function rivalRows(a: Asset, v: MarketView): MenuNode[] {
  const nodes: MenuNode[] = [{ type: 'heading', id: `biz.mkt.rivH.${a.id}`, label: 'Top Competitors' }]
  const top = v.rivals.slice(0, 6)
  if (!top.length) nodes.push({ type: 'info', id: `biz.mkt.rivNone.${a.id}`, text: 'Nobody else is selling this yet. Enjoy it while it lasts.', emoji: '\u{1F3DC}\u{FE0F}' })
  top.forEach((r, i) => {
    const tag = r.legacy ? ' · state-backed' : r.extra === 'spinoff' ? ' · your old spin-off' : r.extra === 'entrant' ? ' · newcomer' : ''
    nodes.push({
      type: 'info',
      id: `biz.mkt.riv.${a.id}.${i}`,
      text: `${r.name} (${getCountry(r.hq).name}, est. ${r.founded}) · ${shareText(r.share)} · quality ${stars(r.quality / 20)} ${trendArrow(r.trend)}${tag}`,
      emoji: getCountry(r.hq).flag,
    })
  })
  const more = v.rivals.length - top.length
  if (more > 0 || v.fringe > 0.001) {
    const tail = v.scope === 'world' ? 'hundreds of smaller firms' : 'thousands of independents'
    nodes.push({ type: 'info', id: `biz.mkt.rivMore.${a.id}`, text: `${more > 0 ? `…and ${more} more named rivals, ` : ''}plus ${tail} holding ${shareText(v.fringe)}`, emoji: '\u{1F465}' })
  }
  return nodes
}

function acquireMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.mkt.buy.${a.id}`,
    label: 'Buy Out a Rival',
    emoji: '\u{1F91D}',
    subtitle: 'Their customers and locations become yours',
    disabledReason: (g) => manageBlock(g, a),
    hint: (g) => {
      const cur = live(g, a)
      if (!hinting(g, cur)) return null
      const m = bestMove(g, cur)
      return m && m.id.startsWith('buy.') ? talentHint(g, 'Business', `${m.text}: worth about ${money(m.value)} more than it costs`) : null
    },
    header: (g) => {
      const b = readBiz(g, a)
      return `Prices reflect each rival's sales and what ${industryDef(b.industry).label.toLowerCase()} businesses sell for. Most of their customers stay; their locations become yours. Regulators block deals that would make you too big.`
    },
    children: (g) => {
      const b = readBiz(g, a)
      const v = marketViewOf(g, b)
      const list = v.rivals.filter((r) => !r.legacy).slice(0, 6)
      if (!list.length) return [{ type: 'info', id: `biz.mkt.buyNone.${a.id}`, text: 'There is nobody worth buying.', emoji: '\u{1F937}' }]
      return list.map((r) =>
        mAct(a, `buy.${r.id}`, r.name, getCountry(r.hq).flag, {
          subtitle: (gg) => {
            const q = acquisitionQuote(gg, readBiz(gg, a), r.id)
            return q ? `${money(q.price)} · ${shareText(r.share)} of the market${q.outlets > 0 ? ` · ${q.outlets} ${q.outlets === 1 ? industryDef(b.industry).site : industryDef(b.industry).sitePlural}` : ''}` : 'Not for sale'
          },
          hint: (gg) => {
            const cur = live(gg, a)
            if (!hinting(gg, cur)) return null
            const q = cached(gg, cur, `quote.${r.id}`, () => acquisitionQuote(gg, readBiz(gg, cur), r.id))
            if (!q || q.block) return null
            return talentHint(gg, 'Business', q.value > 0 ? `A good buy: about ${money(q.value)} more than it costs over the years` : `Overpriced: about ${money(-q.value)} more than it will ever earn you`)
          },
          disabled: (gg, bb) => {
            const q = acquisitionQuote(gg, bb, r.id)
            if (!q) return `${r.name} isn't for sale.`
            if (q.block) return q.block
            if (bb.cash < q.price) return `${a.name} has ${money(Math.max(0, bb.cash))} in cash; this deal needs ${money(q.price)}.`
            return null
          },
          confirm: (gg) => {
            const q = acquisitionQuote(gg, readBiz(gg, a), r.id)
            return q ? `Buy ${r.name} for ${money(q.price)} of ${a.name}'s cash?` : null
          },
          run: (gg, cur, bb) => {
            acquireRival(gg, cur, bb, r.id)
          },
        }),
      )
    },
  }
}

function moveRows(g: GameState, a: Asset, v: MarketView): MenuNode[] {
  const nodes: MenuNode[] = [{ type: 'heading', id: `biz.mkt.movesH.${a.id}`, label: 'Competitive Moves' }]
  const b = readBiz(g, a)
  if (priced(b)) {
    nodes.push(
      mAct(a, 'offense', 'Price Offensive', '\u{1F3F7}\u{FE0F}', {
        subtitle: () => `Cut prices ${Math.round(OFFENSIVE_CUT * 100)}% for the year and shout about it: more customers this year and next`,
        hint: (gg) => {
          const cur = live(gg, a)
          if (!hinting(gg, cur)) return null
          const val = cached(gg, cur, 'offense', () => offensiveValue(gg, readBiz(gg, cur)))
          return talentHint(gg, 'Business', val > 0 ? `Worth it: about ${money(val)} better over two years` : `Not worth it: the cut costs about ${money(-val)} more than the customers it wins`)
        },
        disabled: (gg) => (priceCapOf(gg, a.id) !== null ? 'You already promised to hold your prices this year.' : null),
        confirm: () => `Cut prices ${Math.round(OFFENSIVE_CUT * 100)}% and promise to hold them for the rest of the year?`,
        run: (gg, cur, bb) => priceOffensive(gg, cur, bb),
      }),
    )
  }
  if (v.rivals.some((r) => !r.legacy)) {
    nodes.push(
      mAct(a, 'raid', 'Talent Raid', '\u{1F3A3}', {
        subtitle: (gg) => `Poach a team from ${marketViewOf(gg, readBiz(gg, a)).rivals[0]?.name ?? 'the top rival'} · about ${money(raidCost(readBiz(gg, a)))} in signing bonuses`,
        hint: (gg) => {
          const cur = live(gg, a)
          if (!hinting(gg, cur)) return null
          const val = cached(gg, cur, 'raid', () => raidValue(gg, readBiz(gg, cur)))
          return talentHint(gg, 'Business', val > 0 ? `Worth it: about ${money(val)} more than the bonuses` : 'Not worth it: the bonuses cost more than the talent adds')
        },
        disabled: (_g, bb) => (bb.cash < raidCost(bb) ? `${a.name} needs ${money(raidCost(bb))} in cash for the signing bonuses.` : null),
        run: (gg, cur, bb) => talentRaid(gg, cur, bb),
      }),
      acquireMenu(a),
    )
  }
  if (v.antitrust.p > 0) {
    nodes.push(
      mAct(a, 'lobby', 'Lobby the Regulators', '\u{1F3DB}\u{FE0F}', {
        subtitle: (gg) => `About ${money(lobbyCost(readBiz(gg, a)))} · works about ${pct(lobbyOdds(gg, readBiz(gg, a)))} of the time · cuts antitrust risk for 3 years`,
        hint: (gg) => {
          const cur = live(gg, a)
          if (!hinting(gg, cur)) return null
          const bb = readBiz(gg, cur)
          const vv = marketViewOf(gg, bb)
          const fine = Math.max(0, bb.last?.revenue ?? 0) * vv.antitrust.regime.fine * 0.6
          const saved = vv.antitrust.p * 0.6 * 3 * fine * lobbyOdds(gg, bb)
          const val = saved - lobbyCost(bb)
          return talentHint(gg, 'Business', val > 0 ? `Worth it: it should save about ${money(val)} in expected fines` : 'Not worth it: the expected fines it saves are smaller than the bill')
        },
        disabled: (_g, bb) => (bb.cash < lobbyCost(bb) ? `${a.name} needs ${money(lobbyCost(bb))} in cash.` : null),
        run: (gg, cur, bb) => lobby(gg, cur, bb),
      }),
    )
  }
  return nodes
}

/** The Market & Competition screen for one company. */
export function marketMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.market.${a.id}`,
    label: 'Market & Competition',
    emoji: '\u{1F3C6}',
    subtitle: (g) => {
      const b = readBiz(g, live(g, a))
      const v = marketViewOf(g, b)
      return v.booked ? `${shareText(v.share)} of ${where(v)} ${v.noun} market · #${v.rank} · ${TIERS[v.tier].label}` : `${v.rivals.length} named rivals · ${money(v.size)} a year`
    },
    hint: (g) => {
      const cur = live(g, a)
      if (!hinting(g, cur)) return null
      const b = readBiz(g, cur)
      const v = marketViewOf(g, b)
      if (v.unmet >= 0.15 && runsIt(g, cur)) return talentHint(g, 'Business', `Scale up: you turned away ${pct(v.unmet)} of your customers last year and every one of them strengthened a rival`)
      const m = bestMove(g, cur)
      return m ? talentHint(g, 'Business', `${m.text}: about ${money(m.value)} better than standing still`) : talentHint(g, 'Business', 'Hold your position: no competitive move pays this year')
    },
    header: (g) => {
      const b = readBiz(g, a)
      return eraHeader(g, marketViewOf(g, b))
    },
    children: (g) => {
      const cur = live(g, a)
      const b = readBiz(g, cur)
      const v = marketViewOf(g, b)
      return [...infoRows(g, cur, v, b), ...rivalRows(cur, v), ...moveRows(g, cur, v)]
    },
  }
}

/** One info line for the company screen. */
export function marketInfoLine(g: GameState, a: Asset): string {
  return shareLine(g, readBiz(g, a))
}
