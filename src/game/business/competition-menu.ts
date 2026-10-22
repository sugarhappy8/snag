// The Market & Competition screen on every company: a hub that shows how big the market is (the
// world or the home country) and where it is heading, your share, rank and dominance tier, then
// opens onto the sections (overview, leaderboard, segments, regions and countries, history, rival
// profiles) and the strategy moves (the classic four: a price offensive, a talent raid, buying a
// rival, lobbying; and entering countries, brand campaigns, defending home, supply chains and
// patent cross-licences, with a scenario table). Builders only read state; actions re-read the
// live business. The Business talent's purple hints come from the moves' own numbers. The sections
// live in market-menu.ts.
import { eventWords, marketEventImpacts } from '../history/market-events'
import { talentHint } from '../talents'
import type { Asset, GameState, MenuGroup, MenuNode } from '../types'
import { TIERS } from './competition-data'
import { marketViewOf, shareLine, shareText } from './competition'
import { acquireRival, acquisitionQuote, lobby, type AcquisitionQuote, lobbyCost, lobbyOdds, offensiveValue, OFFENSIVE_CUT, priceOffensive, raidCost, raidValue, talentRaid } from './competition-moves'
import { manageBlock } from './gate'
import { industryDef } from './industries'
import { cached, hinting, live, mAct, priced } from './market-menu-kit'
import { bestCampaign, bestEntry, campaignsMenu, defendAction, defendQuote, expandMenu, historyMenu, leaderboardMenu, licensesMenu, overviewMenu, regionsMenu, rivalsMenu, scenariosMenu, segmentsMenu, supplyAction, supplyQuote } from './market-menu'
import { hasSupplyChain, MODE_LABEL } from './market-reach'
import { placeName, placeFlag } from './market-places'
import { concentrationOf } from './market-view'
import { isDeepTech } from './deeptech-state'
import { financeMarketLine } from './finance-firm'
import { isFinanceFirm } from './finance-firm-state'
import { readBiz, runsIt } from './state'
import { industryNoun, money, pct, priceCapOf } from './util'

// The moves' numbers, computed once per company state (the planner behind them is not cheap).
function quoteOf(g: GameState, a: Asset, rivalId: string): AcquisitionQuote | null {
  const cur = live(g, a)
  return cached(g, cur, `quote.${rivalId}`, () => acquisitionQuote(g, readBiz(g, cur), rivalId))
}

function offenseOf(g: GameState, a: Asset): number {
  const cur = live(g, a)
  return cached(g, cur, 'offense', () => offensiveValue(g, readBiz(g, cur)))
}

function raidOf(g: GameState, a: Asset): number {
  const cur = live(g, a)
  return cached(g, cur, 'raid', () => raidValue(g, readBiz(g, cur)))
}

/** Expected fines a lobbying push saves, minus its bill (Business talent). */
function lobbyOf(g: GameState, a: Asset): number {
  const cur = live(g, a)
  return cached(g, cur, 'lobby', () => {
    const b = readBiz(g, cur)
    const at = marketViewOf(g, b).antitrust
    const fine = Math.max(0, b.last?.revenue ?? 0) * at.regime.fine * 0.6
    return at.p * 0.6 * 3 * fine * lobbyOdds(g, b) - lobbyCost(b)
  })
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
    if (priced(b) && priceCapOf(g, a.id) === null) moves.push({ id: 'offense', value: offenseOf(g, a), text: 'A price offensive pays this year' })
    if (v.rivals.some((r) => !r.legacy)) moves.push({ id: 'raid', value: raidOf(g, a), text: `Raid ${v.rivals[0]?.name ?? 'the top rival'}'s talent` })
    for (const r of v.rivals.filter((x) => !x.legacy).slice(0, 6)) {
      const q = quoteOf(g, a, r.id)
      if (q && !q.block && q.price <= Math.max(0, b.cash)) moves.push({ id: `buy.${r.id}`, value: q.value, text: `Buy out ${r.name}` })
    }
    const ent = bestEntry(g, a)
    if (ent) moves.push({ id: 'enter', value: ent.best.value, text: `Enter ${placeName(ent.country)} (${MODE_LABEL[(ent.best.move as { mode: keyof typeof MODE_LABEL }).mode].toLowerCase()})` })
    const camp = bestCampaign(g, a)
    if (camp) moves.push({ id: 'campaign', value: camp.q.value, text: `A brand campaign in ${placeName(camp.country)}` })
    const def = defendQuote(g, a)
    if (!def.block) moves.push({ id: 'defend', value: def.value, text: 'Defend the home market' })
    if (hasSupplyChain(b.industry)) {
      const sup = supplyQuote(g, a)
      if (!sup.block) moves.push({ id: 'supply', value: sup.value, text: 'Diversify your supply chains' })
    }
    const best = moves.filter((m) => Number.isFinite(m.value) && m.value > 500).sort((x, y) => y.value - x.value)[0]
    return best ?? null
  })
}

// ---------------------------------------------------------------------------
// The classic moves

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
      return `Prices reflect each rival's sales and what ${industryNoun(industryDef(b.industry).label)} businesses sell for. Most of their customers stay; their locations become yours. Regulators block deals that would make you too big, and a string of buy-outs raises your antitrust risk.`
    },
    children: (g) => {
      const b = readBiz(g, a)
      const v = marketViewOf(g, b)
      const list = v.rivals.filter((r) => !r.legacy).slice(0, 8)
      if (!list.length) return [{ type: 'info', id: `biz.mkt.buyNone.${a.id}`, text: 'There is nobody worth buying.', emoji: '\u{1F937}' }]
      return list.map((r) =>
        mAct(a, `buy.${r.id}`, r.name, placeFlag(r.hq), {
          subtitle: (gg) => {
            const q = quoteOf(gg, a, r.id)
            return q ? `${money(q.price)} · ${shareText(r.share)} of the market${q.outlets > 0 ? ` · ${q.outlets} ${q.outlets === 1 ? industryDef(b.industry).site : industryDef(b.industry).sitePlural}` : ''}` : 'Not for sale'
          },
          hint: (gg) => {
            const cur = live(gg, a)
            if (!hinting(gg, cur)) return null
            const q = quoteOf(gg, cur, r.id)
            if (!q || q.block) return null
            return talentHint(gg, 'Business', q.value > 0 ? `A good buy: about ${money(q.value)} more than it costs over the years` : `Overpriced: about ${money(-q.value)} more than it will ever earn you`)
          },
          disabled: (gg, bb) => {
            const q = quoteOf(gg, a, r.id)
            if (!q) return `${r.name} isn't for sale.`
            if (q.block) return q.block
            if (bb.cash < q.price) return `${a.name} has ${money(Math.max(0, bb.cash))} in cash; this deal needs ${money(q.price)}.`
            return null
          },
          confirm: (gg) => {
            const q = quoteOf(gg, a, r.id)
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

function classicMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.mkt.classic.${a.id}`,
    label: 'Competitive Moves',
    emoji: '\u{2694}\u{FE0F}',
    subtitle: 'Price offensive, talent raid, buy-outs, lobbying',
    hint: (g) => {
      const cur = live(g, a)
      if (!hinting(g, cur)) return null
      const m = bestMove(g, cur)
      return m && ['offense', 'raid'].includes(m.id) ? talentHint(g, 'Business', `${m.text}: about ${money(m.value)} better than standing still`) : null
    },
    children: (g) => {
      const b = readBiz(g, live(g, a))
      const v = marketViewOf(g, b)
      const nodes: MenuNode[] = []
      if (priced(b)) {
        nodes.push(
          mAct(a, 'offense', 'Price Offensive', '\u{1F3F7}\u{FE0F}', {
            subtitle: () => `Cut prices ${Math.round(OFFENSIVE_CUT * 100)}% for the year and shout about it: more customers this year and next`,
            hint: (gg) => {
              const cur = live(gg, a)
              if (!hinting(gg, cur)) return null
              const val = offenseOf(gg, cur)
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
              const val = raidOf(gg, cur)
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
              const val = lobbyOf(gg, cur)
              return talentHint(gg, 'Business', val > 0 ? `Worth it: it should save about ${money(val)} in expected fines` : 'Not worth it: the expected fines it saves are smaller than the bill')
            },
            disabled: (_g, bb) => (bb.cash < lobbyCost(bb) ? `${a.name} needs ${money(lobbyCost(bb))} in cash.` : null),
            run: (gg, cur, bb) => lobby(gg, cur, bb),
          }),
        )
      }
      if (!nodes.length) nodes.push({ type: 'info', id: `biz.mkt.classicNone.${a.id}`, text: 'Nothing to fight over yet: nobody else sells this.', emoji: '\u{1F3DC}\u{FE0F}' })
      return nodes
    },
  }
}

function protectMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.mkt.protect.${a.id}`,
    label: 'Protect & Partner',
    emoji: '\u{1F6E1}\u{FE0F}',
    subtitle: (g) => (isDeepTech(readBiz(g, live(g, a))) ? 'Defend home, diversify suppliers, swap patents' : 'Defend your home market, diversify suppliers'),
    hint: (g) => {
      const cur = live(g, a)
      if (!hinting(g, cur)) return null
      const m = bestMove(g, cur)
      return m && ['defend', 'supply'].includes(m.id) ? talentHint(g, 'Business', `${m.text}: about ${money(m.value)} better than standing still`) : null
    },
    children: () => [defendAction(a), supplyAction(a), licensesMenu(a)],
  }
}

// ---------------------------------------------------------------------------
// The screen

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
      return v.booked ? `${shareText(v.share)} of ${v.place === 'the world' ? 'the world' : v.place} ${v.noun} · #${v.rank} · ${TIERS[v.tier].label}` : `${v.rivals.length} named rivals · ${money(v.size)} a year`
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
      const b = readBiz(g, live(g, a))
      const v = marketViewOf(g, b)
      const c = concentrationOf(v)
      return `${v.scope === 'world' ? `The ${v.noun} business is global: your customers and rivals are everywhere.` : `The ${v.noun} business is local: you compete with everyone else in ${v.place}.`} ${v.growth >= 0.25 ? 'The market is taking off: whoever grabs customers now keeps them.' : v.growth <= -0.05 ? 'The market is in a slump: the weak fold first.' : v.share >= 0.4 ? 'You are the one everyone else is chasing.' : 'Share is won customer by customer.'} It is ${c.label}. Numbers are approximate.`
    },
    children: (g) => {
      const cur = live(g, a)
      const b = readBiz(g, cur)
      const v = marketViewOf(g, b)
      const top = v.rivals[0]
      const growth = v.growth >= 0.02 ? `growing ${Math.round(v.growth * 100)}% a year` : v.growth > -0.02 ? 'steady' : `shrinking ${Math.round(-v.growth * 100)}% a year`
      const nodes: MenuNode[] = [
        {
          type: 'info',
          id: `biz.mkt.top.${a.id}`,
          text: v.booked ? `${money(v.size)} a year in ${v.place}, ${growth}. You: ${shareText(v.share)}, #${v.rank} of ${v.rivals.length + 1} named players, ${TIERS[v.tier].label}${top ? `. Leader: ${top.name} ${shareText(top.share)}` : ''}` : `${money(v.size)} a year in ${v.place}, ${growth}. No sales on the books yet: your first full year puts you on the board.`,
          emoji: v.booked ? TIERS[v.tier].emoji : '\u{1F331}',
        },
      ]
      // The real booms and busts at work this year (history/market-events.ts).
      for (const x of marketEventImpacts(b.industry, b.countryId, g.year, v.scope === 'world')) {
        const words = eventWords(x.event, b.countryId, g.year)
        nodes.push({ type: 'info', id: `biz.mkt.event.${x.event.id}.${a.id}`, emoji: x.event.emoji, text: `${words.name}: ${x.text} ${words.text}` })
      }
      return [
        ...nodes,
        { type: 'heading', id: `biz.mkt.h.explore.${a.id}`, label: 'Explore the Market' },
        overviewMenu(cur),
        leaderboardMenu(cur),
        segmentsMenu(cur),
        regionsMenu(cur),
        historyMenu(cur),
        rivalsMenu(cur),
        { type: 'heading', id: `biz.mkt.h.strategy.${a.id}`, label: 'Strategy' },
        classicMenu(cur),
        expandMenu(cur),
        campaignsMenu(cur),
        protectMenu(cur),
        scenariosMenu(cur),
      ]
    },
  }
}

/** One info line for the company screen. */
export function marketInfoLine(g: GameState, a: Asset): string {
  const b = readBiz(g, a)
  return isFinanceFirm(b) ? financeMarketLine(g, b) : shareLine(g, b)
}
