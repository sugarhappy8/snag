// Investment firms 2.0: one compact dashboard per firm type. Pure: rendering reads the committed
// state (readBiz/readFund), never writes it and never uses g's RNG. Every row is short; the one
// popup where a decision matters explains the rest.
import { hasTalent, talentHint } from '../talents'
import type { Asset, GameState, MenuAction, MenuNode } from '../types'
import { algoBlock, algoCost, campaignBlock, campaignCost, diligence, inventAlgorithm, investInPitch, passPitch, raisePopup, runCampaign, setCall, setCommission, setFee, setFollowOn, setHedgeTerms, setStrategy, setStyle } from './fund-actions'
import { callHint, comeClean } from './fund-events'
import { brokerEra, CALLS, quantBlock, STRATEGIES, STYLES, styleBlock } from './fund-model'
import { bestCommission, bestFee, commissionOutlook, feeOutlook, hedgeFeeOutlook, strategyOutlook, styleOutlook } from './fund-outlook'
import { readFund, type FundState, type FundStyle, type HedgeStrategy, type MacroCall } from './fund-state'
import { fundLine, lastLine, newsLine, rankText, signed, typeLine } from './fund-text'
import { ddCost, ddDone, gutRead, investingFund, openPitches, pitchesFor, proRata, raiseQuote, readLabel, roman, stageLabel, type Pitch } from './fund-vc'
import { manageBlock } from './gate'
import { findBusiness, readBiz, type BizState } from './state'
import { money, pct, units } from './util'
import { managerName } from './career'
import { financeLeadershipSkill, financeProfileShort } from './finance-leadership'
import { mandateDef, readBoard } from './board-state'

/** One line for the company header. */
export function fundInfoLine(_g: GameState, b: BizState): string {
  return typeLine(readFund(b))
}

/** Live read of the firm for a menu closure (the asset may have changed since the menu was built). */
function view(g: GameState, a: Asset): { b: BizState; f: FundState } | null {
  const live = findBusiness(g, a.id)
  if (!live) return null
  const b = readBiz(g, live)
  return { b, f: readFund(b) }
}

function talentRead(g: GameState, id: string, q: number): string {
  if (!hasTalent(g, 'Business') && !hasTalent(g, 'Investing')) return ''
  return talentHint(g, hasTalent(g, 'Business') ? 'Business' : 'Investing', `Your read: ${readLabel(gutRead(g, id, q))}`)
}

export function fundDashboard(g: GameState, a: Asset): MenuNode[] {
  const b = readBiz(g, a), f = readFund(b)
  const id = a.id
  const blocked = (gg: GameState) => manageBlock(gg, a)
  const direct = (gg: GameState): string | null => {
    const base = blocked(gg)
    if (base) return base
    const v = view(gg, a)
    return v?.b.ceo === 'manager' && v.b.manager
      ? `${managerName(v.b.manager)} controls day-to-day strategy, pricing and risk. Change the mandate under Leadership, or take over as CEO.`
      : null
  }
  const act = (key: string, label: string, emoji: string, run: (gg: GameState) => void, extra: Partial<MenuAction> = {}): MenuAction =>
    ({ type: 'action', id: `fund.${id}.${key}`, label, emoji, disabledReason: blocked, run, ...extra })
  const nodes: MenuNode[] = [
    { type: 'info', id: `fund.${id}.card`, emoji: '📊', text: gg => { const v = view(gg, a); return v ? typeLine(v.f) : '' } },
    { type: 'info', id: `fund.${id}.last`, emoji: '🗓️', text: gg => { const v = view(gg, a); return v ? lastLine(v.b, v.f) : '' } },
  ]
  if (b.ceo === 'manager' && b.manager) nodes.push({ type: 'info', id: `fund.${id}.manager`, emoji: '🧑‍💼', text: gg => {
    const v = view(gg, a)
    if (!v?.b.manager) return ''
    return `${managerName(v.b.manager)} runs the investment book · ${financeProfileShort(v.b.manager)} · effective ${Math.round(financeLeadershipSkill(v.b, v.b.manager))}/100.`
  } }, { type: 'info', id: `fund.${id}.mandate`, emoji: '📋', text: gg => {
    const v = view(gg, a)
    const mandate = mandateDef(readBoard(v?.b.board).mandate)
    return `${mandate.emoji} ${mandate.label} mandate controls the CEO's strategy, fees and risk. Change it under Leadership, or take over as CEO.`
  } })
  if (f.type === 'asset') nodes.push(...assetNodes(a, f, act, direct))
  else if (f.type === 'hedge') nodes.push(...hedgeNodes(g, a, b, f, act, direct))
  else if (f.type === 'vc') nodes.push(...vcNodes(a, f, act))
  else nodes.push(...brokerNodes(a, b, f, act, direct))
  if (f.type !== 'vc') nodes.push(act('campaign', 'Marketing Campaign', '📣', gg => { runCampaign(gg, id) }, {
    subtitle: `${money(campaignCost(b, f))} · once a year · more new clients`,
    disabledReason: gg => direct(gg) ?? (() => { const v = view(gg, a); return v ? campaignBlock(gg, id, v.b, v.f) : 'Company unavailable.' })(),
  }))
  nodes.push(trackRecord(a))
  if (f.ponzi) nodes.push(act('comeClean', 'Come Clean to Regulators', '🧾', gg => { comeClean(gg, id) }, {
    subtitle: 'End the fake returns: the firm closes and you face a lighter charge',
    confirm: () => 'Confess everything? The firm will be shut down and you will be charged.',
  }))
  return nodes
}

type Act = (key: string, label: string, emoji: string, run: (gg: GameState) => void, extra?: Partial<MenuAction>) => MenuAction
type Block = (g: GameState) => string | null

function assetNodes(a: Asset, f: FundState, act: Act, direct: Block): MenuNode[] {
  const id = a.id
  const style: MenuNode = { type: 'menu', id: `fund.${id}.style`, label: `Fund Style: ${STYLES[f.style].emoji} ${STYLES[f.style].label}`, emoji: '🎨',
    header: () => 'Pick how the fund invests next year. Your fee stays the same.',
    children: gg => {
      const v = view(gg, a)
      if (!v) return []
      return (Object.keys(STYLES) as FundStyle[]).map(s => act(`style.${s}`, `${STYLES[s].emoji} ${STYLES[s].label}${v.f.style === s ? ' ✓' : ''}`, '', g2 => { setStyle(g2, id, s) }, {
        emoji: STYLES[s].emoji, subtitle: STYLES[s].blurb, stayOpen: true,
        disabledReason: g2 => direct(g2) ?? styleBlock(s, v.b.countryId, g2.year) ?? (v.f.style === s ? 'Already your style.' : null),
        hint: g2 => { const w = view(g2, a); if (!w) return null; const o = styleOutlook(g2, w.b, w.f, s); return talentHint(g2, 'Business', `Expect to beat ~${pct(o.rank)} of peers; clients ${signed(o.flow, 0)} a year`) || null },
      }))
    } }
  const fee = act('fee', 'Management Fee', '💸', () => {}, {
    subtitle: `${pct(f.fee, 2)} of clients’ money a year · peers charge ~${pct(STYLES[f.style].normFee, 2)}`,
    input: { kind: 'slider', label: 'Management fee', min: .05, max: 2, step: .05, unit: '%', defaultValue: () => (f.fee * 100).toFixed(2),
      preview: (gg, v) => { const w = view(gg, a); if (!w) return ''; const o = feeOutlook(gg, w.b, w.f, v / 100); return `≈ ${money(o.revenue)} a year in fees · expected client flows ${signed(o.flow, 0)} a year` } },
    hint: gg => { const w = view(gg, a); return w ? talentHint(gg, 'Business', `Best balance of growth and margin: about ${pct(bestFee(gg, w.b, w.f), 2)}`) || null : null },
    disabledReason: direct,
    run: (gg, input) => { setFee(gg, id, Number(input) / 100) },
  })
  return [style, fee]
}

function hedgeNodes(g: GameState, a: Asset, b: BizState, f: FundState, act: Act, direct: Block): MenuNode[] {
  const id = a.id
  const out: MenuNode[] = [{ type: 'menu', id: `fund.${id}.strategy`, label: `Strategy: ${STRATEGIES[f.strategy].emoji} ${STRATEGIES[f.strategy].label}`, emoji: '♟️',
    header: () => 'Your strategy for next year.',
    children: gg => {
      const v = view(gg, a)
      if (!v) return []
      return (Object.keys(STRATEGIES) as HedgeStrategy[]).map(s => act(`strategy.${s}`, `${STRATEGIES[s].label}${v.f.strategy === s ? ' ✓' : ''}`, STRATEGIES[s].emoji, g2 => { setStrategy(g2, id, s) }, {
        subtitle: STRATEGIES[s].blurb, stayOpen: true,
        disabledReason: g2 => direct(g2) ?? (s === 'quant' ? quantBlock(v.b.countryId, g2.year) : null) ?? (v.f.strategy === s ? 'Already your strategy.' : null),
        hint: g2 => {
          const w = view(g2, a)
          if (!w) return null
          if (s === 'macro') return talentHint(g2, 'Business', 'Macro is a market call: your edge is the call itself') || null
          const o = strategyOutlook(g2, w.b, w.f, s)
          return talentHint(g2, 'Business', `About ${signed(o.expected, 0)} a year before fees, swings ±${pct(o.swing)}`) || null
        },
      }))
    } }]
  if (f.strategy === 'macro') {
    out.push({ type: 'menu', id: `fund.${id}.call`, label: `Market Call: ${CALLS[f.call].emoji} ${CALLS[f.call].label} at ${f.lev.toFixed(1)}×`, emoji: '🎯',
      header: () => 'One view on the market for next year. Leverage multiplies wins and losses.',
      children: gg => (Object.keys(CALLS) as MacroCall[]).map(c => act(`call.${c}`, `${CALLS[c].label}${readFund(readBiz(gg, findBusiness(gg, a.id) ?? a)).call === c ? ' ✓' : ''}`, CALLS[c].emoji, g2 => { setCall(g2, id, c) }, {
        subtitle: CALLS[c].blurb, stayOpen: true, disabledReason: direct,
        hint: g2 => { const w = view(g2, a); return w ? callHint(g2, w.b, c) || null : null },
      })) })
    out.push(act('lev', 'Leverage', '🏋️', () => {}, {
      subtitle: 'Borrow to bet bigger on your call',
      input: { kind: 'slider', label: 'Leverage', min: 1, max: 3, step: .5, unit: '×', defaultValue: () => String(f.lev),
        preview: (_gg, v) => `A 10% market move becomes about ${Math.round(v * 10)}% for the fund, before borrowing costs.` },
      disabledReason: direct,
      run: (gg, input) => { setHedgeTerms(gg, id, 'lev', Number(input)) },
    }))
  }
  out.push(act('mgmt', 'Management Fee', '💼', () => {}, {
    subtitle: `${pct(f.mgmt, 1)} of assets a year`,
    input: { kind: 'slider', label: 'Management fee', min: 0, max: 3, step: .25, unit: '%', defaultValue: () => String(f.mgmt * 100),
      preview: (gg, v) => { const w = view(gg, a); if (!w) return ''; const o = hedgeFeeOutlook(gg, w.b, w.f, v / 100, w.f.perf); return `≈ ${money(o.revenue)} a year in an average year · client flows ${signed(o.flow, 0)}` } },
    disabledReason: direct,
    run: (gg, input) => { setHedgeTerms(gg, id, 'mgmt', Number(input) / 100) },
  }), act('perf', 'Performance Fee', '🏆', () => {}, {
    subtitle: `${pct(f.perf)} of gains above the high-water mark`,
    input: { kind: 'slider', label: 'Performance fee', min: 0, max: 30, step: 1, unit: '%', defaultValue: () => String(Math.round(f.perf * 100)),
      preview: (gg, v) => { const w = view(gg, a); if (!w) return ''; const o = hedgeFeeOutlook(gg, w.b, w.f, w.f.mgmt, v / 100); return `≈ ${money(o.revenue)} a year in an average year · client flows ${signed(o.flow, 0)}` } },
    disabledReason: direct,
    run: (gg, input) => { setHedgeTerms(gg, id, 'perf', Number(input) / 100) },
  }), act('coinvest', 'Invest Company Cash in the Fund', '🤝', () => {}, {
    subtitle: f.coinvest > 0 ? `${money(f.coinvest)} of company cash rides with clients` : 'Put company cash alongside clients (gains and losses are the firm’s)',
    input: { kind: 'slider', label: 'Company cash in the fund', min: 0, max: Math.max(1, b.cash), money: true, defaultValue: () => String(Math.min(f.coinvest, Math.max(0, b.cash))),
      preview: (gg, v) => { const w = view(gg, a); if (!w) return ''; const o = strategyOutlook(gg, w.b, w.f, w.f.strategy); return `In an average year about ${money(v * o.expected)}; a bad year could lose ${money(v * Math.min(.95, o.swing * 2.5))}.` } },
    disabledReason: direct,
    run: (gg, input) => { setHedgeTerms(gg, id, 'coinvest', Number(input)) },
  }))
  if (hasTalent(g, 'Inventor')) out.push(act('algo', 'Invent a Trading Algorithm', '🧠', gg => { inventAlgorithm(gg, id) }, {
    subtitle: f.algoEdge > .001 ? `Current edge ${pct(f.algoEdge, 1)} a year, fading as rivals copy it` : `${money(algoCost(b))} · ready in 2 years · might be brilliant, might be noise`,
    disabledReason: gg => manageBlock(gg, a) ?? (() => { const v = view(gg, a); return v ? algoBlock(gg, v.b, v.f) : 'Company unavailable.' })(),
  }))
  return out
}

function pitchNode(a: Asset, p: Pitch, act: Act): MenuNode {
  const id = a.id
  const stake = p.ask / Math.max(1, p.pre + p.ask)
  return { type: 'menu', id: `fund.${id}.pitch.${p.id}`, label: `${p.name}`, emoji: p.emoji, subtitle: `${p.sector} · ${stageLabel(p.stage)} · asks ${money(p.ask)}`,
    header: () => `${p.name}: ${p.line}.\nFounder ${p.founder} ${p.trait}.`,
    children: gg => {
      const v = view(gg, a)
      if (!v) return []
      const dd = ddDone(v.f, gg.year, p.id)
      const fund = investingFund(v.f, gg.year)
      return [
        { type: 'info', id: `fund.${id}.pitch.${p.id}.terms`, emoji: '📝', text: `${money(p.ask)} for ${pct(stake, 1)} · valued at ${money(p.pre + p.ask)} after the money` },
        { type: 'info', id: `fund.${id}.pitch.${p.id}.dd`, emoji: '🔍', text: dd ? `Diligence: quality ${p.lo}–${p.hi} out of 100` : 'No diligence yet: you only have the pitch and your gut.' },
        act(`pitch.${p.id}.invest`, `Invest ${money(p.ask)}`, '💰', g2 => { investInPitch(g2, id, p.id) }, {
          subtitle: fund ? `From Fund ${roman(fund.n)} (${money(fund.dry)} left)` : 'No fund is investing',
          disabledReason: g2 => manageBlock(g2, a) ?? (!fund ? 'Raise a fund first.' : fund.dry < p.ask ? 'The fund doesn’t have enough left.' : null),
          hint: g2 => talentRead(g2, p.id, p.q) || null,
        }),
        act(`pitch.${p.id}.dd`, 'Do Due Diligence', '🔍', g2 => { diligence(g2, id, p.id) }, {
          subtitle: `${money(ddCost(v.b, p.ask))} of company cash · narrows the guesswork`, stayOpen: true,
          disabledReason: g2 => manageBlock(g2, a) ?? (dd ? 'Already done.' : v.b.cash < ddCost(v.b, p.ask) ? 'Not enough company cash.' : null),
        }),
        act(`pitch.${p.id}.pass`, 'Pass', '👋', g2 => { passPitch(g2, id, p.id) }),
      ]
    } }
}

function vcNodes(a: Asset, f: FundState, act: Act): MenuNode[] {
  const id = a.id
  const nodes: MenuNode[] = f.funds.filter(x => !x.done).slice(-3).map(x => ({ type: 'info' as const, id: `fund.${id}.fund.${x.n}`, emoji: '🏦', text: (gg: GameState) => { const v = view(gg, a); return v ? fundLine(v.f, x.n, gg.year) : '' } }))
  nodes.push({ type: 'menu', id: `fund.${id}.pitches`, label: 'This Year’s Pitches', emoji: '🎤',
    subtitle: gg => { const v = view(gg, a); return v ? pitchStatus(gg, v.b, v.f) : '' },
    header: () => 'Most startups fail. A few return the whole fund.',
    children: gg => {
      const v = view(gg, a)
      if (!v) return []
      const open = openPitches(gg, v.b, v.f, gg.year)
      return open.length ? open.map(p => pitchNode(a, p, act)) : [{ type: 'info', id: `fund.${id}.pitches.none`, emoji: '📭', text: pitchStatus(gg, v.b, v.f) }]
    } })
  nodes.push({ type: 'menu', id: `fund.${id}.portfolio`, label: 'Portfolio', emoji: '📂',
    subtitle: gg => { const v = view(gg, a); return v ? `${v.f.cos.filter(c => c.status === 'live').length} live startups` : '' },
    children: gg => portfolioNodes(gg, a, act) })
  nodes.push(act('raise', 'Raise a New Fund', '🏦', gg => { const live = findBusiness(gg, id); if (!live) return; const b2 = readBiz(gg, live); raisePopup(gg, live, b2, readFund(b2), raiseHint(gg, live)) }, {
    subtitle: (gg: GameState) => { const v = view(gg, a); if (!v) return ''; const q = raiseQuote(gg, v.b, v.f, gg.year); return q.block ? q.block : `Fund ${roman(q.n)}: LPs offer about ${money(q.size)}` },
    disabledReason: gg => manageBlock(gg, a) ?? (() => { const v = view(gg, a); return v ? raiseQuote(gg, v.b, v.f, gg.year).block : 'Company unavailable.' })(),
    hint: gg => raiseHint(gg, a) || null,
  }))
  return nodes
}

/** Why founders are (or aren't) waiting this year, in one short line. */
function pitchStatus(g: GameState, b: BizState, f: FundState): string {
  const n = openPitches(g, b, f, g.year).length
  if (n) return `${n} founder${n > 1 ? 's' : ''} waiting`
  if (pitchesFor(g, b, f, g.year).length) return 'You’ve heard every pitch this year. More next year.'
  const latest = f.funds.filter(x => !x.done).slice(-1)[0]
  return latest ? `Fund ${roman(latest.n)} has finished investing. Raise a new fund to hear new pitches.` : 'Raise a fund to hear pitches.'
}

function raiseHint(g: GameState, a: Asset): string {
  const v = view(g, a)
  if (!v) return ''
  const q = raiseQuote(g, v.b, v.f, g.year)
  return q.block ? '' : talentHint(g, 'Business', `The big push lands about ${pct(q.odds)} of the time`)
}

function portfolioNodes(g: GameState, a: Asset, act: Act): MenuNode[] {
  const v = view(g, a)
  if (!v) return []
  const id = a.id
  const live = v.f.cos.filter(c => c.status === 'live').sort((x, y) => y.own * y.val - x.own * x.val)
  const out: MenuNode[] = live.slice(0, 30).map(c => {
    const row = `${c.name} · ${stageLabel(c.stage)} · valued ${money(c.val)} · we own ${pct(c.own, 1)} (${money(c.own * c.val)}) · put in ${money(c.cost)}`
    if (!c.round) return { type: 'info' as const, id: `fund.${id}.co.${c.id}`, emoji: c.emoji, text: row }
    const round = c.round
    const want = proRata(c, round)
    // The round closes at the next birthday: a fund without the money left gets diluted anyway.
    const fund = v.f.funds.find(x => x.n === c.fund)
    const short = !fund || fund.dry < want
    const choice = round.take === 0 ? 'passing' : short ? `Fund ${roman(c.fund)} can’t cover it: diluted` : round.take === 1 ? 'investing' : 'auto: invest if the fund can'
    return { type: 'menu' as const, id: `fund.${id}.co.${c.id}`, label: `${c.name} is raising`, emoji: c.emoji, subtitle: `${stageLabel(round.stage)} at ${money(round.pre)} · keep our stake for ${money(want)} · ${choice}`,
      header: () => row,
      children: () => [
        act(`co.${c.id}.in`, `Invest ${money(want)} to keep our stake`, '💰', g2 => { setFollowOn(g2, id, c.id, true) }, { stayOpen: true, hint: g2 => talentRead(g2, `${c.id}|follow`, c.q) || null,
          ...(short ? { subtitle: `Fund ${roman(c.fund)} has only ${money(fund?.dry ?? 0)} left` } : {}) }),
        act(`co.${c.id}.out`, 'Pass and get diluted', '👋', g2 => { setFollowOn(g2, id, c.id, false) }, { stayOpen: true }),
      ] }
  })
  const done = v.f.cos.filter(c => c.status !== 'live').slice(-6).reverse()
  for (const c of done) out.push({ type: 'info', id: `fund.${id}.done.${c.id}`, emoji: c.status === 'dead' ? '💀' : '🏁', text: newsLine(v.f, `${c.status === 'dead' ? 'd' : c.unicorn ? 'u' : 'x'}:${c.id}`) })
  if (!out.length) out.push({ type: 'info', id: `fund.${id}.empty`, emoji: '📭', text: 'No startups yet. Back a few pitches.' })
  return out
}

function brokerNodes(a: Asset, b: BizState, f: FundState, act: Act, direct: Block): MenuNode[] {
  const id = a.id
  return [
    { type: 'info', id: `fund.${id}.era`, emoji: '🕰️', text: gg => { const era = brokerEra(b.countryId, gg.year); return `${era.label} · clients trade ~${era.trades} times a year · going rate ${pct(era.normCommission, 2)}` } },
    act('commission', 'Commission', '💵', () => {}, {
      subtitle: `${pct(f.commission, 2)} of every trade`,
      input: { kind: 'slider', label: 'Commission', min: 0, max: 2, step: .01, unit: '%', defaultValue: () => (f.commission * 100).toFixed(2),
        preview: (gg, v) => { const era = brokerEra(b.countryId, gg.year); const o = commissionOutlook(era.normCommission, v / 100); return `${money(10_000 * v / 100)} on a ${money(10_000)} trade · activity ×${o.activity.toFixed(2)} · new accounts ${signed(o.growth, 0)}` } },
      hint: gg => { const v = view(gg, a); return v ? talentHint(gg, 'Business', `Best balance of price and growth: about ${pct(bestCommission(v.b, v.f, gg.year), 2)} a trade`) || null : null },
      disabledReason: direct,
      run: (gg, input) => { setCommission(gg, id, Number(input) / 100) },
    }),
  ]
}

function trackRecord(a: Asset): MenuNode {
  return { type: 'menu', id: `fund.${a.id}.record`, label: 'Track Record', emoji: '📜',
    children: gg => {
      const v = view(gg, a)
      if (!v) return []
      const rows: MenuNode[] = [{ type: 'info', id: `fund.${a.id}.rep`, emoji: '⭐', text: `Reputation ${Math.round(v.f.rep * 100)}/100 · compliance ${Math.round(v.f.compliance)}/100` }]
      for (const m of [...v.f.marks].reverse()) {
        const text = v.f.type === 'broker' ? `${m.y}: market ${signed(m.m)}` : v.f.type === 'vc' ? `${m.y}: ${m.k >= 0 ? `funds ${m.r.toFixed(1)}× · ${rankText(m.k)}` : 'too early to judge'}` : `${m.y}: clients ${signed(m.r)} vs market ${signed(m.m)}${m.k >= 0 ? ` · ${rankText(m.k)}` : ''}`
        rows.push({ type: 'info', id: `fund.${a.id}.mark.${m.y}`, emoji: m.k >= .75 ? '🏆' : m.k >= 0 && m.k < .25 ? '📉' : '📄', text })
      }
      if (v.f.type === 'broker') rows.push({ type: 'info', id: `fund.${a.id}.acct`, emoji: '👥', text: `${units(v.f.accounts)} accounts holding ${money(v.f.aum)}` })
      return rows
    } }
}
