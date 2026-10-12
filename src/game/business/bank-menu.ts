// Banking 2.0 menus: one compact dashboard and a few levers. Pure: rendering reads state, never
// writes it and never touches the game RNG (purple hints use the same pure model as the year).
import { yearActionsUsed } from '../core'
import { hasTalent, talentHint } from '../talents'
import type { Asset, GameState, MenuAction, MenuNode } from '../types'
import { getCountry } from '../world'
import { bankLeverBlock, runBankCampaign, setBankAppetite, setBankRate, switchBankProduct } from './bank-actions'
import { APPETITES, LEND_LINES, PRODUCTS, PRODUCT_IDS, hasProduct, loanTotal, minCapitalRatio, readBank, type Appetite, type ProductId } from './bank-state'
import { bankMarket, bankRank, bestAppetite, bestRates, campaignCost, capitalRatio, expectedPd, headlineLoanRate, lineRate, marketLoanRate, productGain, productGate, profitWords, rateWord, ratioBar, setupCost, bankTeamSkill } from './bank-model'
import { findBusiness, readBiz } from './state'
import { clampN, money, pct } from './util'

function ratioLine(ratio: number): string {
  return ratio >= 9.99 ? 'no loans yet' : pct(ratio, 1)
}

export function bankMenuNodes(g: GameState, a: Asset): MenuNode[] {
  const b = readBiz(g, a), book = readBank(b), m = bankMarket(g, b.countryId, g.year)
  const min = minCapitalRatio(b.countryId, g.year), ratio = capitalRatio(b, book)
  const rank = bankRank(b.countryId, g.year, book.deposits), L = book.last
  const country = getCountry(b.countryId).name
  const nodes: MenuNode[] = [
    { type: 'info', id: `bank.${a.id}.books`, emoji: '🏦', text: `Deposits ${money(book.deposits)} · loans ${money(loanTotal(book))} · bad loans ${pct(L?.badRate ?? 0, 1)}` },
    { type: 'info', id: `bank.${a.id}.capital`, emoji: '🧱', text: `Capital ${ratioLine(ratio)} vs ${pct(min, 1)} minimum ${ratioBar(ratio, min)}${ratio < min ? ' ⚠️' : ''}` },
    { type: 'info', id: `bank.${a.id}.trust`, emoji: '🤝', text: `Trust ${Math.round(book.trust)}/100 · ${L ? `last ${L.profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(L.profit))}` : 'no results yet'} · #${rank.rank.toLocaleString()} of ~${rank.of.toLocaleString()} in ${country}` },
  ]
  const alert = book.seize ? '⚖️ Regulators threaten to seize the bank: add capital now.'
    : book.run ? '🏃 Savers are queuing: a run is under way.'
    : ratio < min ? '⚠️ Below the minimum: regulators will force sales and fines. Add capital or lend less.'
    : m.crisis >= .5 ? `💥 ${m.crisisName ? m.crisisName.charAt(0).toUpperCase() + m.crisisName.slice(1) : 'A banking crisis'}: defaults are soaring.`
    : book.advance > 0 ? `💵 Still owes the central bank ${money(book.cbOwed)} from a run.` : ''
  if (alert) nodes.push({ type: 'info', id: `bank.${a.id}.alert`, emoji: '📣', text: alert })
  nodes.push({ type: 'info', id: `bank.${a.id}.market`, emoji: '📈', text: `Market: savings ${pct(m.savings, 2)} · business loans ${pct(marketLoanRate(m), 2)} · central bank ${pct(m.policy, 2)}` })
  nodes.push(savingsSlider(g, a), loanSlider(g, a), appetiteMenu(a), productsMenu(a), campaignAction(a), booksMenu(a))
  return nodes
}

function lever(a: Asset, key: string, label: string, emoji: string, run: (g: GameState, input?: string) => void, extra: Partial<MenuAction> = {}): MenuAction {
  return { type: 'action', id: `bank.${a.id}.${key}`, label, emoji, disabledReason: (g) => bankLeverBlock(g, a), run, ...extra }
}
function current(g: GameState, a: Asset) {
  const aa = findBusiness(g, a.id) ?? a
  const b = readBiz(g, aa)
  return { b, book: readBank(b), m: bankMarket(g, b.countryId, g.year) }
}

function savingsSlider(g: GameState, a: Asset): MenuAction {
  const { book, m } = current(g, a)
  const rate = Math.max(0, m.savings + book.savingsGap)
  return lever(a, 'savings', 'Savings Rate', '💰', (gg, input) => setBankRate(gg, a.id, 'savings', Number(input) / 100), {
    subtitle: `${pct(rate, 2)} · ${rateWord(book.savingsGap, 'savings')} (market ${pct(m.savings, 2)})`,
    hint: (gg) => {
      const x = current(gg, a)
      if (!hasTalent(gg, 'Business')) return null
      const best = bestRates(gg, x.b)
      const close = Math.abs(best.savingsGap - x.book.savingsGap) < .003 && Math.abs(best.loanGap - x.book.loanGap) < .003
      return talentHint(gg, 'Business', close ? `Your rates are already about the best pair (${profitWords(best.profit, money)} expected)`
        : `Best pair this year: savings ${pct(Math.max(0, x.m.savings + best.savingsGap), 2)}, loans ${pct(headlineLoanRate(x.m, best.loanGap), 2)} → ${profitWords(best.profit, money)}`)
    },
    input: {
      kind: 'slider', label: 'Savings rate you pay', unit: '%', step: .05,
      min: Math.round(Math.max(0, m.savings - .03) * 10000) / 100, max: Math.round((m.savings + .03) * 10000) / 100,
      defaultValue: () => (Math.round(rate * 10000) / 100).toFixed(2),
      preview: (gg, v) => {
        const x = current(gg, a), r = v / 100, gap = clampN(r - x.m.savings, -.03, .03)
        return `${pct(r, 2)} · ${rateWord(gap, 'savings')} · about ${money(x.book.deposits * Math.max(0, x.m.savings + gap))} a year to savers. Higher pulls in deposits faster.`
      },
    },
  })
}

function loanSlider(g: GameState, a: Asset): MenuAction {
  const { book, m } = current(g, a)
  const rate = headlineLoanRate(m, book.loanGap)
  return lever(a, 'loan', 'Loan Rate', '🏷️', (gg, input) => setBankRate(gg, a.id, 'loan', Number(input) / 100), {
    subtitle: `${pct(rate, 2)} business loans · ${rateWord(book.loanGap, 'loan')} (market ${pct(marketLoanRate(m), 2)})`,
    input: {
      kind: 'slider', label: 'Business loan rate you charge', unit: '%', step: .05,
      min: Math.round(Math.max(.005, marketLoanRate(m) - .03) * 10000) / 100, max: Math.round((marketLoanRate(m) + .05) * 10000) / 100,
      defaultValue: () => (Math.round(rate * 10000) / 100).toFixed(2),
      preview: (gg, v) => {
        const x = current(gg, a), gap = clampN(v / 100 - marketLoanRate(x.m), -.03, .05)
        return `${pct(v / 100, 2)} · ${rateWord(gap, 'loan')} · ${gap > .0075 ? 'fewer, riskier borrowers' : gap < -.005 ? 'borrowers queue up; thinner margins' : 'normal demand'}. Other lines move with it.`
      },
    },
  })
}

function appetiteMenu(a: Asset): MenuNode {
  return {
    type: 'menu', id: `bank.${a.id}.appetite`, label: 'Lending Appetite', emoji: '🎯',
    subtitle: (g) => { const ap = APPETITES[current(g, a).book.appetite]; return `${ap.emoji} ${ap.label}` },
    header: () => 'Who will you lend to? Riskier borrowers pay more, default more and need less capital cushion.',
    children: (g) => {
      const x = current(g, a)
      const ids = ['prime', 'balanced', 'highYield'] as Appetite[]
      const best: Appetite | null = hasTalent(g, 'Business') ? bestAppetite(g, x.b).appetite : null
      return ids.map((id) => lever(a, `appetite.${id}`, `${APPETITES[id].label}${x.book.appetite === id ? ' ✓' : ''}`, APPETITES[id].emoji, (gg) => setBankAppetite(gg, a.id, id), {
        subtitle: APPETITES[id].blurb,
        disabledReason: (gg) => bankLeverBlock(gg, a) ?? (current(gg, a).book.appetite === id ? 'Already your lending policy.' : null),
        hint: (gg) => (best === id ? talentHint(gg, 'Business', `Worth the most over the next few years in this economy${id === 'highYield' ? '; a downturn hits it hardest' : ''}`) : null),
      }))
    },
  }
}

function productRow(a: Asset, id: ProductId): MenuAction {
  const d = PRODUCTS[id]
  return lever(a, `product.${id}`, d.label, d.emoji, (gg) => switchBankProduct(gg, a.id, id, !hasProduct(current(gg, a).book, id)), {
    subtitle: (g) => {
      const x = current(g, a)
      if (hasProduct(x.book, id)) {
        const line = (LEND_LINES as readonly string[]).includes(id) ? id as typeof LEND_LINES[number] : null
        const detail = line ? ` · ${pct(lineRate(x.m, x.book, line), 1)} yield · ~${pct(expectedPd(g, x.b, x.book, x.m, line, bankTeamSkill(g, x.b)) * (PRODUCTS[line].lgd ?? .5), 1)} lost a year` : ''
        return `On since ${x.book.products[id]}${detail}`
      }
      return `${money(setupCost(x.b, x.book, id))} setup · ${d.blurb}`
    },
    disabledReason: (g) => {
      const block = bankLeverBlock(g, a)
      if (block) return block
      const x = current(g, a)
      if (hasProduct(x.book, id)) return id === 'business' ? 'Every bank keeps lending to businesses.' : null
      const gate = productGate(x.b, x.book, id, g.year)
      if (!gate.ok) return gate.why
      return x.b.cash < setupCost(x.b, x.book, id) ? `Needs ${money(setupCost(x.b, x.book, id))} of company cash.` : null
    },
    confirm: (g) => {
      const x = current(g, a)
      return hasProduct(x.book, id) ? `Stop offering ${d.label.toLowerCase()}? Existing ${(LEND_LINES as readonly string[]).includes(id) ? 'loans run off' : 'business winds down'}; restarting costs the setup again.` : null
    },
    hint: (g) => {
      const x = current(g, a)
      if (hasProduct(x.book, id) || !productGate(x.b, x.book, id, g.year).ok || !hasTalent(g, 'Business')) return null
      const gain = productGain(g, x.b, x.book, id), cost = setupCost(x.b, x.book, id)
      return talentHint(g, 'Business', gain > cost ? `Worth it: adds about ${money(gain - cost)} of value after its setup cost` : 'Not worth its setup cost in this economy')
    },
  })
}

function productsMenu(a: Asset): MenuNode {
  return {
    type: 'menu', id: `bank.${a.id}.products`, label: 'Products', emoji: '📦',
    subtitle: (g) => { const x = current(g, a); return `${PRODUCT_IDS.filter(id => hasProduct(x.book, id)).length} of ${PRODUCT_IDS.length} offered` },
    header: (g) => `Each line has its own yield, losses and growth. Setup costs come from company cash (${money(current(g, a).b.cash)}).`,
    // Products nobody has invented yet stay out of sight (no anachronistic spoilers).
    children: (g) => {
      const x = current(g, a)
      return PRODUCT_IDS.filter((id) => hasProduct(x.book, id) || id === 'ib' || productGate(x.b, x.book, id, g.year).ok).map((id) => productRow(a, id))
    },
  }
}

function campaignAction(a: Asset): MenuAction {
  return lever(a, 'campaign', 'Marketing Campaign', '📣', (g) => runBankCampaign(g, a.id), {
    subtitle: (g) => { const x = current(g, a); return `${money(campaignCost(x.b, x.book))} · once a year · more savers by year end${x.b.industry === 'onlineBank' ? ' · widens your reach' : ''}` },
    disabledReason: (g) => {
      const block = bankLeverBlock(g, a)
      if (block) return block
      const x = current(g, a)
      if (x.book.campaignYear >= g.year || yearActionsUsed(g, `bank.campaign.${a.id}`) > 0) return 'You already ran a campaign this year.'
      return x.b.cash < campaignCost(x.b, x.book) ? `Needs ${money(campaignCost(x.b, x.book))} of company cash.` : null
    },
  })
}

function booksMenu(a: Asset): MenuNode {
  return {
    type: 'menu', id: `bank.${a.id}.ledger`, label: 'The Books', emoji: '📜',
    subtitle: (g) => { const L = current(g, a).book.last; return L ? `${L.year}: ${L.profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(L.profit))}` : 'No year closed yet' },
    children: (g) => {
      const x = current(g, a), L = x.book.last
      const row = (k: string, text: string, emoji: string): MenuNode => ({ type: 'info', id: `bank.${a.id}.ledger.${k}`, text, emoji })
      if (!L) return [row('none', 'The first year closes at your next birthday.', 'ℹ️')]
      const out: MenuNode[] = [
        row('in', `${L.year}: interest ${money(L.interest)} · bonds ${money(L.bondIncome)} · fees ${money(L.fees)}${L.trading ? ` · trading ${L.trading >= 0 ? '+' : '−'}${money(Math.abs(L.trading))}` : ''}`, '💵'),
        row('out', `Paid savers ${money(L.depositCost)} · credit losses ${money(L.creditLosses)}${L.liquidityLosses ? ` · forced sales ${money(L.liquidityLosses)}` : ''}`, '💸'),
        row('cost', `Running costs ${money(L.costs)}${L.fine ? ` · fine ${money(L.fine)}` : ''} → ${L.profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(L.profit))}`, '🧾'),
        row('flow', `Deposits ${L.depositFlow >= 0 ? '+' : '−'}${money(Math.abs(L.depositFlow))} · loans ${L.loanFlow >= 0 ? '+' : '−'}${money(Math.abs(L.loanFlow))}${L.runWithdrawals ? ` · run ${money(L.runWithdrawals)}` : ''}`, '🔁'),
        row('client', `Client book: ${money(x.book.reserves)} reserves · ${money(x.book.bonds)} bonds at ${pct(x.book.bondYield, 1)} · ${money(x.book.badNet)} in workout`, '🏛️'),
      ]
      for (const h of [...x.book.hist].reverse().slice(0, 6)) out.push(row(`h${h.y}`, `${h.y}: ${h.profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(h.profit))} · deposits ${money(h.deposits)} · capital ${ratioLine(h.ratio)} · trust ${h.trust}`, '📅'))
      return out
    },
  }
}
