// The deep-tech rows on a company's screen: the R&D Lab (programs and pace), Funding &
// Investors (rounds, bridges, grants, IPO readiness) and each industry's own screen (fabs,
// compute and models, robot demos, the drug pipeline, launch control, the factory floor, the
// qubit lab, the threat center). Menu builders only read state; actions re-read the business.
import { addStat, formatCents, formatMoney, log, notice, remember, scriptChoice, useYearAction } from '../core'
import { chance, rand } from '../rng'
import { defineScript } from '../scripts'
import { talentHint } from '../talents'
import type { Asset, ChoiceOption, GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { localEcon } from './economy'
import { shareSummary } from './competition'
import {
  DEEP_TECH,
  DRUG_AREAS,
  NODES,
  PHASE_LABEL,
  PROGRAMS,
  RD_CREDIT,
  RESTRICTED,
  bestModel,
  drugRegulator,
  frontierScore,
  maxStage,
  nodeCap,
  stageName,
  type ProgramDef,
} from './deeptech-data'
import {
  PACES,
  bestTechPlan,
  burnRate,
  competitiveness,
  computeRent,
  dtInd,
  payTech,
  rdBudget,
  revalue,
  runwayYears,
  sellable,
  techFunds,
  techOf,
  techSkill,
  techView,
} from './deeptech-core'
import { deepTechEventOpen, presentDeepTechEvent } from './deeptech-events'
import { awardGrant, bridgeBlock, bestGrant, closeRound, grantAmount, grantBlock, grantKey, grantList, grantOdds, grantsOwed, lastPost, makeTermSheet, nextRoundNeed, pushOdds, roundBlock, termAdvice, type TermSheet } from './deeptech-funding'
import { BUDGET_MAX, BUDGET_MIN, bestProgram, bestTrial, cancelProgram, maxPrograms, programBlock, programCost, programLine, programTerms, startProgram, startTrial, stopPrograms, trialBlock, trialCost, trialName, trialOdds, wholeYears } from './deeptech-rd'
import { MAX_SERIES, SERIES, milestoneListingBlock, type Drug, type TechState } from './deeptech-state'
import { manageBlock, tooBusy } from './gate'
import { industryDef } from './industries'
import { bizOf, findBusiness, readBiz, runsIt, type BizState } from './state'
import { clampN, money, num, pct, plural, rec, str, toJson, units } from './util'

type Run = (g: GameState, a: Asset, b: BizState, t: TechState, input?: string) => void

/** Why the player can't make deep-tech decisions right now (prison, death, an heir too young). */
function dtBlock(g: GameState, a: Asset): string | null {
  const block = manageBlock(g, a)
  if (block) return block
  if (g.character.age < 18) return 'You must be 18 to run a company. Its general manager makes these calls until then.'
  return null
}

/** A deep-tech action that re-reads the live business before running. */
function dtAct(a: Asset, key: string, label: string, emoji: string, opts: {
  subtitle?: string | ((g: GameState) => string)
  disabled?: (g: GameState, b: BizState, t: TechState) => string | null
  confirm?: (g: GameState) => string | null
  hint?: (g: GameState) => string | null
  visible?: (g: GameState) => boolean
  input?: MenuAction['input']
  run: Run
}): MenuAction {
  return {
    type: 'action',
    id: `dt.${key}.${a.id}`,
    label,
    emoji,
    subtitle: opts.subtitle,
    visible: opts.visible,
    hint: opts.hint,
    disabledReason: (g) => {
      const block = dtBlock(g, a)
      if (block) return block
      if (!opts.disabled) return null
      const b = readBiz(g, a)
      return opts.disabled(g, b, techView(b))
    },
    confirm: opts.confirm,
    input: opts.input,
    run: (g, input) => {
      const cur = findBusiness(g, a.id)
      if (!cur || dtBlock(g, cur)) return
      const b = bizOf(g, cur)
      opts.run(g, cur, b, techOf(b), input)
    },
  }
}

function view(g: GameState, a: Asset): { b: BizState; t: TechState } {
  const b = readBiz(g, a)
  return { b, t: techView(b) }
}

function runwayText(years: number): string {
  return years >= 99 ? 'self-funding' : `${years} yr${years === 1 ? '' : 's'} of runway`
}

// ---------------------------------------------------------------------------
// R&D Lab

function yrs(n: number): string {
  const v = Math.round(n * 10) / 10
  return `${v} year${v === 1 ? '' : 's'}`
}

function programRow(a: Asset, def: ProgramDef, t0: TechState): MenuAction {
  return dtAct(a, `rd.${def.id}`, def.label(t0), def.emoji, {
    subtitle: (g) => {
      const { b, t } = view(g, a)
      return `${def.years} yr${def.years === 1 ? '' : 's'} · ${money(programCost(b, t, def))}/yr · ${Math.round(def.odds(t) * 100)}% base odds · ${def.blurb}`
    },
    disabled: (_g, b, t) => programBlock(b, t, def),
    hint: (g) => {
      const { b, t } = view(g, a)
      const best = bestProgram(g, a, b, t)
      return best && best.id === def.id ? talentHint(g, 'Business', 'Fund this one: the best value for your R&D money right now.') : null
    },
    confirm: (g) => {
      const { b, t } = view(g, a)
      const cost = programCost(b, t, def)
      const funds = techFunds(b, t)
      return funds < cost ? `${a.name} only has ${money(funds)} between its R&D account and cash, and this costs about ${money(cost)} a year at the planned budget. Start it anyway and find the money by year-end?` : null
    },
    // Fund it lean, as planned or flat out: faster and likelier, dearer in total (diminishing returns).
    input: {
      kind: 'slider',
      label: 'Budget (% of the plan)',
      min: BUDGET_MIN * 100,
      max: BUDGET_MAX * 100,
      step: 10,
      defaultValue: () => '100',
      preview: (g, v) => {
        const { b, t } = view(g, a)
        const terms = programTerms(b, t, def, v / 100)
        // What it really costs and takes at the lab's current pace: progress moves a whole pace
        // step at every year-end, and each year is billed at the pace's cost.
        const pace = PACES.find((x) => x.id === t.pace) ?? PACES[1]
        const n = wholeYears(terms.years, pace.speed)
        const yearly = terms.cost * pace.cost
        const funds = techFunds(b, t)
        const short = yearly > funds ? ` · more than the ${money(funds)} in the R&D account and cash covers` : ''
        return `${money(yearly)} a year for ${yrs(n)} at a ${pace.label.toLowerCase()} pace (${money(yearly * n)} in all) · ${Math.round(terms.odds * 100)}% base odds${short}`
      },
    },
    run: (g, cur, b, t, input) => {
      const k = input === undefined || input === '' ? 1 : clampN(Number(input) / 100, BUDGET_MIN, BUDGET_MAX)
      const p = startProgram(g, b, t, def, Number.isFinite(k) ? k : 1)
      if (!p) return
      log(g, `${cur.name} started an R&D program: ${p.name}.`)
      notice(g, 'Program Started', `${p.name} is underway at ${cur.name}. ${def.blurb} At a steady pace it takes ${yrs(wholeYears(p.years))} and about ${money(p.cost)} a year, paid from the R&D account first.`, { emoji: def.emoji })
    },
  })
}

function labMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `dt.lab.${a.id}`,
    label: 'R&D Lab',
    emoji: '\u{1F52C}',
    subtitle: (g) => {
      const { t } = view(g, a)
      return `Tech level ${Math.round(t.level)}/100 · ${plural(t.programs.length, 'program')} running · ${money(rdBudget(t))}/yr`
    },
    disabledReason: (g) => dtBlock(g, a),
    header: (g) => {
      const { b, t } = view(g, a)
      const ind = dtInd(b)
      const st = DEEP_TECH[ind].stages[Math.min(maxStage(ind), t.stage)]
      return [
        `Stage ${t.stage + 1} of ${maxStage(ind) + 1}: ${st.name}. ${st.blurb}`,
        `Tech level ${Math.round(t.level)}/100 (70 is as good as anyone on Earth; standing still means falling behind). Pace: ${t.pace}.`,
        `R&D budget ${money(rdBudget(t))}/yr · R&D account ${money(t.venture)} · company cash ${money(b.cash)} · ${runwayText(runwayYears(g, a, b, t))}.`,
        `Programs are paid every year from the R&D account, then company cash. Finished programs succeed or fail; failures still teach you something.`,
        `The lab runs ${maxPrograms(b, t)} programs at once; open more sites (Locations) to make room for more. At the top of the ladder, next-generation work never runs out: it just costs more and gains less every time.`,
      ].join('\n')
    },
    children: (g) => {
      const { b, t } = view(g, a)
      const ind = dtInd(b)
      const nodes: MenuNode[] = [{ type: 'heading', id: `dt.labH1.${a.id}`, label: `Running (${t.programs.length}/${maxPrograms(b, t)})` }]
      if (t.programs.length === 0) nodes.push({ type: 'info', id: `dt.labNone.${a.id}`, text: 'Nothing is running. Without R&D, nothing moves.', emoji: '\u{1F4A4}' })
      for (const p of t.programs) {
        nodes.push(
          dtAct(a, `cancel.${p.key}`, p.name, p.emoji, {
            subtitle: `${programLine(p)} · tap to cancel`,
            confirm: (gg) => {
              const owed = grantsOwed(gg, b, t, p).reduce((sum, x) => sum + x.amount, 0)
              return `Cancel ${p.name}? The ${money(p.spent)} spent so far is gone.${owed > 0 ? ` Grant money it hasn't spent yet (${money(owed)}) goes back to the agency.` : ''}`
            },
            run: (gg, cur, bb, tt) => {
              const gone = cancelProgram(gg, bb, tt, p.key)
              if (!gone) return
              revalue(gg, cur, bb, tt)
              log(gg, `${cur.name} cancelled ${gone.program.name}.`)
              notice(gg, 'Program Cancelled', `${gone.program.name} is shelved. The team moves on, a little wiser and a lot sadder.${gone.repaid > 0 ? ` ${formatMoney(gone.repaid)} of unspent grant money went back to the agency.` : ''}`, { emoji: '\u{1F5D1}\u{FE0F}' })
            },
          }),
        )
      }
      nodes.push({ type: 'heading', id: `dt.labH2.${a.id}`, label: 'Start a program' })
      for (const def of PROGRAMS[ind]) {
        if (def.gate(t, b.countryId) === 'Already done.') continue
        nodes.push(programRow(a, def, t))
      }
      if (ind === 'biotech') nodes.push({ type: 'info', id: `dt.labTrials.${a.id}`, text: 'Clinical trials for your drug candidates are started from the Drug Pipeline.', emoji: '\u{1F48A}' })
      nodes.push({ type: 'heading', id: `dt.labH3.${a.id}`, label: 'R&D pace' })
      const runway = runwayYears(g, a, b, t)
      const best = runway < 1.2 ? 'lean' : runway > 3.5 && t.programs.length > 0 ? 'blitz' : 'steady'
      for (const p of PACES) {
        nodes.push(
          dtAct(a, `pace.${p.id}`, `${p.label}${t.pace === p.id ? ' (current)' : ''}`, p.id === 'lean' ? '\u{1F422}' : p.id === 'blitz' ? '\u{1F407}' : '\u{1F6B6}', {
            subtitle: `${p.note} · speed ×${p.speed}, cost ×${p.cost}`,
            hint: (gg) => (p.id === best ? talentHint(gg, 'Business', p.id === 'lean' ? 'Go lean: the money runs out within a year at this rate.' : p.id === 'blitz' ? 'Floor it: you have the runway, and speed wins.' : 'Steady is right for your runway.') : null),
            run: (gg, cur, _bb, tt) => {
              tt.pace = p.id
              notice(gg, 'R&D Pace', `${cur.name}'s lab now runs at a ${p.label.toLowerCase()} pace: ${p.note.toLowerCase()}.`, { emoji: '\u{23F1}\u{FE0F}' })
            },
          }),
        )
      }
      return nodes
    },
  }
}

// ---------------------------------------------------------------------------
// Funding & Investors

const TERM = defineScript('deeptech.term', (g, choice, data) => {
  const d = rec(data)
  const a = findBusiness(g, str(d?.assetId))
  if (!a || !d) return
  const b = bizOf(g, a)
  const t = techOf(b)
  const ts: TermSheet = {
    series: Math.round(num(d.series)),
    investor: str(d.investor, 'investors'),
    amount: num(d.amount),
    pre: num(d.pre),
    equity: num(d.equity),
    down: d.down === true,
    bridge: d.bridge === true,
  }
  if (choice === 'walk') {
    log(g, `I walked away from a ${ts.bridge ? 'bridge round' : SERIES[ts.series]} term sheet for ${a.name}.`)
    return
  }
  if (choice === 'push' && d.pushed !== true) {
    const odds = pushOdds(g, a, b, t)
    const roll = rand(g)
    if (roll < odds.better) {
      ts.pre = Math.round(ts.pre * 1.25)
      ts.equity = ts.amount / (ts.pre + ts.amount)
      ts.down = lastPost(t) > 0 && ts.pre < lastPost(t) * 0.9
      presentTerms(g, a, b, t, ts, true, `${ts.investor} came back with better terms.`)
    } else if (roll < 1 - odds.walk) {
      presentTerms(g, a, b, t, ts, true, `${ts.investor} held firm: take it or leave it.`)
    } else {
      notice(g, 'They Walked', `${ts.investor} didn't like being pushed and passed on the deal. Try again next year.`, { emoji: '\u{1F6B6}', tone: 'bad' })
    }
    return
  }
  if (choice !== 'sign') return
  if (b.public || (!ts.bridge && t.series >= ts.series)) return
  closeRound(g, a, b, t, ts)
  const label = ts.bridge ? 'bridge round' : SERIES[ts.series]
  log(g, `${a.name} raised ${money(ts.amount)} in a ${label}.`, ts.down ? 'neutral' : 'good')
  remember(g, `${a.name} raised ${money(ts.amount)} (${label}) at a ${money(ts.pre)} pre-money valuation.`)
  notice(
    g,
    ts.down ? 'Down Round Closed' : `${label} Closed!`,
    `${ts.investor.charAt(0).toUpperCase()}${ts.investor.slice(1)} put ${formatMoney(ts.amount)} into ${a.name} at a ${formatMoney(ts.pre)} pre-money valuation, for ${pct(ts.equity, 1)} of the company. You now own ${pct(b.share, 1)}. The money sits in the R&D account: it pays for R&D, compute, trials and payroll, never for dividends.${ts.down ? ' It was a down round: worth less than last time. Morale and hype took a hit.' : ''}`,
    { emoji: ts.down ? '\u{1F4C9}' : '\u{1F4B0}', tone: ts.down ? 'neutral' : 'good' },
  )
})

function presentTerms(g: GameState, a: Asset, b: BizState, t: TechState, ts: TermSheet, pushed: boolean, intro = ''): void {
  const advice = termAdvice(g, a, b, t, ts, !pushed)
  const odds = pushOdds(g, a, b, t)
  const why = advice === 'sign' ? 'Sign it: the terms are fair for where you are, and runway is life.' : advice === 'push' ? `Push back: investors want in, so they will probably sweeten it (about ${Math.round(odds.better * 100)}%) and rarely walk.` : 'Walk away: the terms are too harsh and you can afford to wait.'
  const hint = talentHint(g, 'Business', why)
  const choices: ChoiceOption[] = [{ id: 'sign', label: `Sign: ${money(ts.amount)} for ${pct(ts.equity, 1)}`, emoji: '\u{270D}\u{FE0F}' }]
  if (!pushed) choices.push({ id: 'push', label: 'Push for better terms', emoji: '\u{1F4AA}' })
  choices.push({ id: 'walk', label: 'Walk away', emoji: '\u{1F6B6}' })
  const withHints = choices.map((c) => (hint && c.id === advice ? { ...c, hint } : c))
  const label = ts.bridge ? 'Bridge Round' : `${SERIES[ts.series]} Term Sheet`
  const prev = lastPost(t)
  const text = `${intro ? `${intro} ` : ''}${ts.investor.charAt(0).toUpperCase()}${ts.investor.slice(1)} offers ${formatMoney(ts.amount)} at a ${formatMoney(ts.pre)} pre-money valuation: ${pct(ts.equity, 1)} of ${a.name}, a board seat and the usual 1x liquidation preference (in a sale they get their money back first).${prev > 0 ? ` Your last round valued the company at ${money(prev)} after the money.` : ''}${ts.down ? ' This is a down round.' : ''} You'd own ${pct(b.share * (1 - ts.equity), 1)}.`
  scriptChoice(g, TERM, label, text, withHints, { emoji: '\u{1F4C4}', data: { assetId: a.id, ...(toJson(ts) as Record<string, never>), pushed } })
}

function fundingMenu(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `dt.fund.${a.id}`,
    label: 'Funding & Investors',
    emoji: '\u{1F4B0}',
    subtitle: (g) => {
      const { b, t } = view(g, a)
      return `${SERIES[t.series]} · you own ${pct(b.share)} · R&D account ${money(t.venture)}`
    },
    disabledReason: (g) => dtBlock(g, a),
    header: (g) => {
      const { b, t } = view(g, a)
      const need = nextRoundNeed(b, t)
      const lines = [
        `${SERIES[t.series]}. You own ${pct(b.share, 1)}${t.cofounder ? ` (your co-founder ${t.cofounder} holds a slice too)` : ''}. Investors have put in ${money(t.raised)}; in a sale they get that back before you see a cent.`,
        `R&D account: ${money(t.venture)}. Investor and grant money pays for R&D, compute, trials and payroll, never dividends. Burn ${money(burnRate(g, a, b, t))}/yr · ${runwayText(runwayYears(g, a, b, t))}.`,
      ]
      if (!b.public && t.series < MAX_SERIES) lines.push(`Next: ${SERIES[need.series]} investors want ${need.text}${need.met ? ' (you have it)' : ''}.`)
      return lines.join('\n')
    },
    children: (g) => {
      const { b, t } = view(g, a)
      const nodes: MenuNode[] = []
      for (const [i, r] of t.rounds.slice(-6).entries()) {
        nodes.push({ type: 'info', id: `dt.round.${a.id}.${i}`, text: `${r.year}: ${r.investor === 'your existing investors' ? 'Bridge round' : SERIES[r.series]} · ${money(r.raised)} at ${money(r.pre)} pre-money (${pct(r.equity, 1)})${r.down ? ' · down round' : ''}`, emoji: r.down ? '\u{1F4C9}' : '\u{1F4B5}' })
      }
      if (!b.public) {
        const need = nextRoundNeed(b, t)
        nodes.push(
          dtAct(a, 'raise', t.series >= MAX_SERIES ? 'No More Private Rounds' : `Raise a ${SERIES[need.series]}`, '\u{1F680}', {
            subtitle: `Pitch investors: ${need.text}`,
            disabled: (gg, bb, tt) => roundBlock(gg, bb, tt) ?? ((gg.yearActions[`dt.pitch.${a.id}`] ?? 0) >= 1 ? 'You already pitched investors this year.' : null),
            run: (gg, cur, bb, tt) => {
              if (roundBlock(gg, bb, tt)) return
              if (!useYearAction(gg, `dt.pitch.${cur.id}`, 1)) return tooBusy(gg, 'pitched investors')
              presentTerms(gg, cur, bb, tt, makeTermSheet(gg, cur, bb, tt), false)
            },
          }),
          dtAct(a, 'bridge', 'Raise a Bridge Round', '\u{1F309}', {
            subtitle: 'A smaller round from existing investors, on their terms',
            visible: (gg) => {
              const v = view(gg, a)
              return v.t.series >= 1 && roundBlock(gg, v.b, v.t) !== null && !v.b.public
            },
            disabled: (gg, bb, tt) => bridgeBlock(gg, bb, tt) ?? ((gg.yearActions[`dt.pitch.${a.id}`] ?? 0) >= 1 ? 'You already pitched investors this year.' : null),
            run: (gg, cur, bb, tt) => {
              if (bridgeBlock(gg, bb, tt)) return
              if (!useYearAction(gg, `dt.pitch.${cur.id}`, 1)) return tooBusy(gg, 'pitched investors')
              presentTerms(gg, cur, bb, tt, makeTermSheet(gg, cur, bb, tt, true), false)
            },
          }),
        )
      }
      nodes.push({ type: 'heading', id: `dt.grantsH.${a.id}`, label: `Government grants (${getCountry(b.countryId).name})` })
      const best = bestGrant(g, a, b, t)
      for (const gr of grantList(b)) {
        nodes.push(
          dtAct(a, `grant.${gr.id}`, gr.name, '\u{1F3DB}\u{FE0F}', {
            subtitle: (gg) => {
              const v = view(gg, a)
              const amt = grantAmount(v.b, v.t, gr)
              return `${amt > 0 ? `about ${money(amt)}` : gr.capex ? 'for capital projects' : 'for running R&D'} · ${Math.round(grantOdds(gg, a, v.b, v.t, gr) * 100)}% odds · ${gr.blurb}`
            },
            disabled: (gg, bb, tt) => grantBlock(gg, a, bb, tt, gr),
            hint: (gg) => (best && best.id === gr.id ? talentHint(gg, 'Business', 'Apply here first: the best odds-weighted money on offer.') : null),
            run: (gg, cur, bb, tt) => {
              if (grantBlock(gg, cur, bb, tt, gr)) return
              useYearAction(gg, grantKey(cur, gr), 1)
              const amount = grantAmount(bb, tt, gr)
              if (chance(gg, grantOdds(gg, cur, bb, tt, gr))) {
                awardGrant(gg, tt, gr, amount)
                revalue(gg, cur, bb, tt)
                log(gg, `${cur.name} won a ${gr.name} worth ${money(amount)}.`, 'good')
                notice(gg, 'Grant Awarded!', `${cur.name} won a ${gr.name}: ${formatMoney(amount)} into the R&D account. The paperwork was 140 pages. Worth it.`, { emoji: '\u{1F3DB}\u{FE0F}', tone: 'good' })
              } else {
                notice(gg, 'Application Rejected', `The ${gr.name} committee "received many strong applications this year". Yours was not chosen. You can try again next year.`, { emoji: '\u{1F4C4}' })
              }
            },
          }),
        )
      }
      const credit = RD_CREDIT[b.countryId] ?? 0
      if (credit > 0) nodes.push({ type: 'info', id: `dt.credit.${a.id}`, text: `R&D tax credit: ${Math.round(credit * 100)}% of R&D spending comes back every year in ${getCountry(b.countryId).name}.`, emoji: '\u{1F9FE}' })
      if (!b.public) {
        const block = milestoneListingBlock({ industry: b.industry, tech: b.tech, valuation: b.valuation, founded: b.founded, public: b.public, history: b.history })
        nodes.push({ type: 'info', id: `dt.ipo.${a.id}`, text: block ? `IPO: ${block}.` : 'IPO: exchanges would list you now on milestones. Go public from the Exit section.', emoji: '\u{1F514}' })
      }
      return nodes
    },
  }
}

// ---------------------------------------------------------------------------
// Industry screens

function infoNode(a: Asset, key: string, text: string, emoji: string): MenuNode {
  return { type: 'info', id: `dt.i.${key}.${a.id}`, text, emoji }
}

function chipsNodes(_g: GameState, a: Asset, b: BizState, t: TechState): MenuNode[] {
  const cap = nodeCap(t, b.countryId)
  const nodes: MenuNode[] = [
    infoNode(a, 'node', `Process node: ${NODES[t.node]}${t.node < NODES.length - 1 ? ` (next: ${NODES[t.node + 1]})` : ' (the cutting edge)'} · yield ${Math.round(t.yieldRate * 100)}%`, '\u{1F52C}'),
    infoNode(a, 'fab', t.plant > 0 ? `${plural(t.plant, 'fab')} of your own, also making chips for other companies` : 'Fabless: foundries make your chips. Build a fab from the R&D Lab.', '\u{1F3ED}'),
  ]
  if (RESTRICTED.has(b.countryId)) nodes.push(infoNode(a, 'ctrl', `Export controls: foreign tools stop at ${NODES[cap]} unless you build a domestic toolchain.`, '\u{1F6AB}'))
  if (t.deal) nodes.push(infoNode(a, 'deal', `${t.deal.name}: ${money(t.deal.perYear)}/yr for ${plural(t.deal.years, 'more year')}`, '\u{1F91D}'))
  return nodes
}

function aiNodes(g: GameState, a: Asset, b: BizState, t: TechState): MenuNode[] {
  const f = frontierScore(g.year)
  const best = bestModel(t)
  const nodes: MenuNode[] = [
    infoNode(a, 'frontier', `The frontier: about ${f}/100 this year and rising. ${best ? `Your best, ${best.name}, scores ${best.score} (competitiveness ${Math.round(competitiveness(t, g.year) * 100)}%).` : 'You have no model yet.'}`, '\u{1F30C}'),
    infoNode(a, 'compute', `Compute: ${plural(t.plant, 'GPU cluster')} owned, ${plural(t.rented, 'cluster')} rented (${money(computeRent(b, t))}/yr)`, '\u{1F5A5}\u{FE0F}'),
  ]
  for (const m of [...t.models].reverse().slice(0, 5)) nodes.push(infoNode(a, `model.${m.gen}`, `${m.name} (${m.year}): score ${m.score} · ${m.open ? 'open weights' : 'closed'}`, '\u{1F9E0}'))
  nodes.push(
    dtAct(a, 'rent', 'Rent a GPU Cluster', '\u{2601}\u{FE0F}', {
      subtitle: (gg) => {
        const v = view(gg, a)
        return `About ${money(computeRent({ ...v.b }, { ...v.t, rented: 1 }))}/yr each · more capacity, bigger training runs`
      },
      disabled: (_gg, bb, tt) => (tt.rented >= 40 ? 'The cloud provider has no more top-end GPUs to rent you. Build your own clusters in the R&D Lab.' : RESTRICTED.has(bb.countryId) && tt.rented >= 2 ? 'Export controls limit how much top-end compute you can rent.' : null),
      run: (gg, cur, bb, tt) => {
        tt.rented += 1
        notice(gg, 'More Compute', `${cur.name} now rents ${plural(tt.rented, 'GPU cluster')} (${formatMoney(computeRent(bb, tt))} a year, billed at year-end).`, { emoji: '\u{2601}\u{FE0F}' })
      },
    }),
    dtAct(a, 'unrent', 'Return a Rented Cluster', '\u{1F4E4}', {
      subtitle: 'Cut the cloud bill',
      visible: (gg) => view(gg, a).t.rented > 0,
      run: (gg, cur, _bb, tt) => {
        tt.rented = Math.max(0, tt.rented - 1)
        notice(gg, 'Less Compute', `${cur.name} returned a cluster. ${plural(tt.rented, 'cluster')} still rented.`, { emoji: '\u{1F4E4}' })
      },
    }),
  )
  if (best && !best.open) {
    nodes.push(
      dtAct(a, 'opensource', `Open-Source ${best.name}`, '\u{1F513}', {
        subtitle: 'Hype and talent up; your own API sales down',
        confirm: () => `Release ${best.name}'s weights to the world? You can't take that back.`,
        run: (gg, cur, bb, tt) => {
          const m = tt.models.find((x) => x.gen === best.gen)
          if (!m || m.open) return
          m.open = true
          tt.hype = clampN(tt.hype + 15, 0, 100)
          bb.brand = clampN(bb.brand + 5, 0, 100)
          log(gg, `${cur.name} open-sourced ${m.name}.`)
          notice(gg, 'Open Weights', `${m.name} is now free for anyone. Developers love you; your sales team is quietly updating their résumés.`, { emoji: '\u{1F513}' })
        },
      }),
    )
  }
  nodes.push(
    dtAct(a, 'enterprise', 'Pitch a Giant Corporation', '\u{1F3E2}', {
      subtitle: 'A multi-year enterprise AI deal, if your models are good enough',
      disabled: (gg, _bb, tt) => enterpriseBlock(gg, a, tt),
      // Only on a pitch you can make: the odds are 15% + 45% of competitiveness (55%+ here).
      hint: (gg) => (!enterpriseBlock(gg, a, t) && competitiveness(t, gg.year) >= 0.9 ? talentHint(gg, 'Business', 'Pitch now: your models are close enough to the frontier that you will probably win it, and the contract is worth far more than the pitch.') : null),
      run: (gg, cur, bb, tt) => {
        if (!useYearAction(gg, `dt.enterprise.${cur.id}`, 1)) return tooBusy(gg, 'pitched a big customer')
        const cost = payTech(bb, tt, Math.round(300_000 * (0.5 + localEcon(bb.industry, bb.countryId, bb.city).level)))
        if (chance(gg, clampN(0.15 + competitiveness(tt, gg.year) * 0.45, 0.1, 0.8))) {
          const unit = localEcon(bb.industry, bb.countryId, bb.city).baseDemand * localEcon(bb.industry, bb.countryId, bb.city).goingPrice
          const perYear = Math.round(unit * (0.1 + rand(gg) * 0.15))
          tt.deal = { name: 'an enterprise AI contract', perYear, years: 2 }
          revalue(gg, cur, bb, tt)
          log(gg, `${cur.name} signed an enterprise AI deal.`, 'good')
          notice(gg, 'Deal Signed!', `A giant corporation is rolling out your models to 200,000 employees: about ${formatMoney(perYear)} a year for two years. The pitch cost ${formatMoney(cost)} in travel and very good slides.`, { emoji: '\u{1F3E2}', tone: 'good' })
        } else {
          notice(gg, 'They Went With Someone Else', `After six months of demos, security reviews and lunches, the corporation picked a rival whose model scored a bit higher. The pitch cost ${formatMoney(cost)}.`, { emoji: '\u{1F937}', tone: 'bad' })
        }
      },
    }),
    bidAction(a, 'nationalLab', 'Bid for a Government AI Contract'),
  )
  return nodes
}

function enterpriseBlock(g: GameState, a: Asset, t: TechState): string | null {
  if (t.stage < 3) return 'Big corporations only sign with an enterprise platform.'
  if (t.deal) return `You already have ${t.deal.name} running.`
  if ((g.yearActions[`dt.enterprise.${a.id}`] ?? 0) >= 1) return 'You already pitched a big customer this year.'
  return null
}

function robotNodes(_g: GameState, a: Asset, _b: BizState, t: TechState): MenuNode[] {
  return [
    infoNode(a, 'robots', `${stageName('robotics', t.stage)} · ${plural(t.plant, 'production line')} · safety record ${Math.round(t.safety)}/100`, '\u{1F9BE}'),
    dtAct(a, 'demo', 'Live Demo Day', '\u{1F3A5}', {
      subtitle: 'Show the robot to the world, live. What could go wrong?',
      disabled: (gg, _bb, tt) => (tt.level < 20 ? 'Your robot can’t do anything worth filming yet.' : (gg.yearActions[`dt.demo.${a.id}`] ?? 0) >= 1 ? 'You already held a demo day this year.' : null),
      // At tech level 55+ the demo lands at least 61% of the time (30% + level/180 + safety/400).
      hint: (gg) => (t.level >= 55 && (gg.yearActions[`dt.demo.${a.id}`] ?? 0) < 1 ? talentHint(gg, 'Business', 'Go for it: your robot is good enough that a live demo will probably land.') : null),
      run: (gg, cur, bb, tt) => {
        if (!useYearAction(gg, `dt.demo.${cur.id}`, 1)) return tooBusy(gg, `held a demo day for ${cur.name}`)
        const cost = payTech(bb, tt, Math.round(250_000 * (0.5 + (localEcon(bb.industry, bb.countryId, bb.city).level))))
        const ok = chance(gg, clampN(0.3 + tt.level / 180 + tt.safety / 400, 0.15, 0.92))
        if (ok) {
          tt.hype = clampN(tt.hype + 20, 0, 100)
          bb.campaignBoost = clampN(bb.campaignBoost + 0.1, 0, 0.6)
          bb.brand = clampN(bb.brand + 5, 0, 100)
          log(gg, `${cur.name}'s live robot demo went viral.`, 'good')
          notice(gg, 'Gone Viral!', `Your robot made breakfast, folded a shirt and did a little dance, live, in front of 40 million viewers (${formatMoney(cost)} for the event). Orders are pouring in.`, { emoji: '\u{1F916}', tone: 'good' })
        } else {
          tt.hype = clampN(tt.hype + 3, 0, 100)
          bb.brand = clampN(bb.brand - 4, 0, 100)
          log(gg, `${cur.name}'s robot fell over during a live demo.`, 'bad')
          notice(gg, 'It Fell Over', `Thirty seconds in, the robot slipped on a banana peel (nobody knows who put it there) and fell off the stage. The clip is the internet's favorite thing this week.`, { emoji: '\u{1F34C}', tone: 'bad' })
        }
        revalue(gg, cur, bb, tt)
      },
    }),
  ]
}

function drugMenu(a: Asset, d0: Drug): MenuGroup {
  const area = DRUG_AREAS.find((x) => x.id === d0.area)
  return {
    type: 'menu',
    id: `dt.drug.${d0.id}.${a.id}`,
    label: d0.name,
    emoji: d0.failed ? '\u{274C}' : d0.phase >= 4 ? '\u{2705}' : '\u{1F48A}',
    subtitle: (g) => {
      const d = view(g, a).t.drugs.find((x) => x.id === d0.id) ?? d0
      const status = d.failed ? 'failed in trials' : d.phase >= 4 ? `approved ${d.approved}` : PHASE_LABEL[d.phase].toLowerCase()
      return `${area?.label ?? d.area} · ${status}${d.partner ? ` · licensed to ${d.partner}` : ''} · quality ${Math.round(d.quality)}/100`
    },
    header: (g) => {
      const { b, t } = view(g, a)
      const d = t.drugs.find((x) => x.id === d0.id) ?? d0
      const unit = Math.round(localEcon(b.industry, b.countryId, b.city).baseDemand * localEcon(b.industry, b.countryId, b.city).goingPrice)
      return `${d.name}, for ${area?.label ?? d.area}. Peak sales potential about ${money(d.peak * unit)} a year if approved. Patent filed ${d.filed}: protection until ${d.filed + 20}, then generics arrive. Regulator: ${drugRegulator(b.countryId)}.`
    },
    children: (g) => {
      const { b, t } = view(g, a)
      const d = t.drugs.find((x) => x.id === d0.id)
      if (!d) return [{ type: 'info', id: `dt.drugGone.${a.id}`, text: 'This candidate is no longer in the pipeline.' }]
      const funds = techFunds(b, t)
      const best = bestTrial(b, t, funds)
      const nodes: MenuNode[] = []
      if (!d.failed && d.phase < 4 && !d.partner) {
        nodes.push(
          dtAct(a, `trial.${d.id}`, `Start ${trialName(d, b.countryId).replace(`${d.name}: `, '')}`, d.phase >= 3 ? '\u{1F4DC}' : '\u{1F9EA}', {
            subtitle: `${money(trialCost(b, d))}/yr · ${Math.round(trialOdds(d) * 100)}% odds`,
            disabled: (_gg, bb, tt) => {
              const dd = tt.drugs.find((x) => x.id === d.id)
              return dd ? trialBlock(bb, tt, dd) : 'Gone.'
            },
            hint: (gg) => (best && best.id === d.id ? talentHint(gg, 'Business', 'Run this trial next: the best odds-weighted payoff in your pipeline.') : null),
            run: (gg, cur, bb, tt) => {
              const dd = tt.drugs.find((x) => x.id === d.id)
              if (!dd) return
              const p = startTrial(gg, bb, tt, dd)
              if (!p) return
              log(gg, `${cur.name} started a trial: ${p.name}.`)
              notice(gg, 'Trial Started', `${p.name} is enrolling patients. It runs ${plural(p.years, 'year')} at about ${money(p.cost)} a year.`, { emoji: '\u{1F9EA}' })
            },
          }),
        )
        if (d.phase >= 1)
          nodes.push(
            dtAct(a, `license.${d.id}`, 'Shop It to Big Pharma', '\u{1F91D}', {
              subtitle: 'Upfront cash and royalties; they run and pay for the trials',
              disabled: (gg) => ((gg.yearActions[`dt.license.${a.id}`] ?? 0) >= 1 ? 'You already shopped a drug around this year.' : null),
              run: (gg, cur) => {
                if (!useYearAction(gg, `dt.license.${cur.id}`, 1)) return tooBusy(gg, 'shopped a drug to big pharma')
                presentDeepTechEvent(gg, cur, 'pharmaDeal', { drug: d.id })
              },
            }),
          )
        nodes.push(
          dtAct(a, `drop.${d.id}`, 'Drop the Program', '\u{1F5D1}\u{FE0F}', {
            subtitle: 'Stop developing it for good',
            confirm: () => `Drop ${d.name}? Any trial running for it stops.`,
            run: (gg, cur, bb, tt) => {
              const dd = tt.drugs.find((x) => x.id === d.id)
              if (!dd) return
              dd.failed = true
              const repaid = stopPrograms(gg, bb, tt, (p) => p.id === 'trial' && p.target === dd.id)
              revalue(gg, cur, bb, tt)
              notice(gg, 'Program Dropped', `${dd.name} is shelved. Somewhere, a chemist is quietly crying.${repaid > 0 ? ` ${formatMoney(repaid)} of unspent grant money went back to the agency.` : ''}`, { emoji: '\u{1F5D1}\u{FE0F}' })
              log(gg, `${cur.name} dropped ${dd.name}.`)
            },
          }),
        )
      } else if (d.partner && d.phase < 4 && !d.failed) {
        nodes.push({ type: 'info', id: `dt.partner.${d.id}.${a.id}`, text: `${d.partner} runs and pays for the trials. You get 15% royalties if it's approved.`, emoji: '\u{1F91D}' })
      } else if (d.phase >= 4) {
        nodes.push({ type: 'info', id: `dt.approved.${d.id}.${a.id}`, text: d.partner ? `On the market through ${d.partner}; royalties come in every year.` : 'On the market. Set its price and production in the Annual Report.', emoji: '\u{1F4B5}' })
      }
      return nodes
    },
  }
}

function biotechNodes(_g: GameState, a: Asset, _b: BizState, t: TechState): MenuNode[] {
  const nodes: MenuNode[] = []
  const live = t.drugs.filter((d) => !d.failed)
  nodes.push(infoNode(a, 'pipe', live.length ? `${plural(live.length, 'drug')} in the pipeline · ${t.drugs.filter((d) => d.failed).length} failed so far. Discover new candidates in the R&D Lab.` : 'No candidates yet. Start a Drug Discovery Program in the R&D Lab.', '\u{1F9EC}'))
  for (const d of [...t.drugs].sort((x, y) => Number(x.failed) - Number(y.failed) || y.phase - x.phase)) nodes.push(drugMenu(a, d))
  return nodes
}

function spaceNodes(_g: GameState, a: Asset, _b: BizState, t: TechState): MenuNode[] {
  const nodes: MenuNode[] = [
    infoNode(a, 'rocket', `${stageName('spaceTech', t.stage)} · ${plural(t.tests, 'test flight')}, ${plural(t.wins, 'success', 'successes')}, ${plural(t.booms, 'explosion')}`, '\u{1F680}'),
  ]
  if (t.sats > 0) nodes.push(infoNode(a, 'sats', `${plural(t.sats, 'satellite batch', 'satellite batches')} in orbit selling data links from space (each lasts about six years)`, '\u{1F310}'))
  if (t.contract) nodes.push(infoNode(a, 'contract', `${t.contract.name}: ${money(t.contract.perYear)}/yr for ${plural(t.contract.years, 'more year')}`, '\u{1F3DB}\u{FE0F}'))
  nodes.push(
    dtAct(a, 'testflight', t.stage >= 3 ? 'Fly a Demonstration Mission' : 'Attempt a Test Flight', '\u{1F680}', {
      subtitle: (gg) => {
        const v = view(gg, a)
        return `About ${money(testFlightCost(v.b))} per rocket · ${Math.round(testOdds(gg, a, v.b, v.t) * 100)}% chance it reaches orbit`
      },
      disabled: (gg, _bb, tt) => (tt.stage < 2 ? 'You need a finished rocket on the pad (R&D Lab: Orbital Rocket).' : (gg.yearActions[`dt.flight.${a.id}`] ?? 0) >= 2 ? 'You already flew two missions this year.' : null),
      hint: (gg) => {
        const v = view(gg, a)
        return v.t.stage === 2 && (gg.yearActions[`dt.flight.${a.id}`] ?? 0) < 2 ? talentHint(gg, 'Business', 'Fly it: nothing else in this company makes money until you reach orbit.') : null
      },
      run: (gg, cur, bb, tt) => {
        if (!useYearAction(gg, `dt.flight.${cur.id}`, 2)) return tooBusy(gg, `flown two test missions for ${cur.name}`)
        testFlight(gg, cur, bb, tt)
      },
    }),
    bidAction(a, 'spaceContract', 'Bid for a Government Contract'),
  )
  return nodes
}

function testFlightCost(b: BizState): number {
  return Math.round(localEcon(b.industry, b.countryId, b.city).unitCost * 0.7)
}

function testOdds(g: GameState, a: Asset, b: BizState, t: TechState): number {
  return clampN(0.28 + t.level / 250 + 0.08 * Math.min(5, t.tests) + techSkill(g, a, b, t) / 400 + t.safety / 600, 0.15, 0.95)
}

function testFlight(g: GameState, a: Asset, b: BizState, t: TechState, quiet = false): void {
  const cost = payTech(b, t, testFlightCost(b))
  const ok = chance(g, testOdds(g, a, b, t))
  t.tests += 1
  if (ok) {
    t.wins += 1
    const first = t.stage < 3
    t.stage = Math.max(t.stage, 3)
    t.hype = clampN(t.hype + (first ? 25 : 8), 0, 100)
    b.brand = clampN(b.brand + (first ? 8 : 3), 0, 100)
    t.level = clampN(t.level + 3, 0, 100)
    if (first && sellable(g, b, t)) {
      const best = bestTechPlan(g, b, t)
      b.price = best.price
      b.production = best.production
    }
    log(g, `${a.name}'s rocket reached orbit${first ? ' for the first time' : ''}.`, 'good')
    if (first) remember(g, `${a.name}'s rocket reached orbit for the first time.`)
    if (quiet) {
      revalue(g, a, b, t)
      return
    }
    addStat(g, 'happiness', first ? 10 : 3)
    notice(g, first ? 'Orbit!' : 'Mission Success', `${first ? 'The rocket cleared the tower, threw away its stages on schedule and put a payload in orbit. Grown engineers cried in mission control.' : 'Another clean flight to orbit.'} (${formatMoney(cost)} of hardware.)${first ? ' Paying customers are lining up: set your launch price in the Annual Report.' : ''}`, { emoji: '\u{1F680}', tone: 'good' })
  } else {
    t.booms += 1
    t.hype = clampN(t.hype + 3, 0, 100)
    b.brand = clampN(b.brand - 3, 0, 100)
    t.level = clampN(t.level + 3, 0, 100)
    log(g, `${a.name}'s rocket exploded during a test flight.`, 'bad')
    if (!quiet) notice(g, 'Rapid Unscheduled Disassembly', `About ${Math.round(20 + rand(g) * 100)} seconds into the flight, the rocket became a very expensive firework (${formatMoney(cost)}). Nobody was hurt. The engineers call it "a learning opportunity"; the internet calls it "content".`, { emoji: '\u{1F4A5}', tone: 'bad' })
  }
  revalue(g, a, b, t)
}

function evNodes(_g: GameState, a: Asset, _b: BizState, t: TechState): MenuNode[] {
  return [
    infoNode(a, 'cars', `${stageName('electricVehicles', t.stage)} · ${plural(t.plant, 'factory unit')} · autopilot level ${t.autonomy + 1} · safety ${Math.round(t.safety)}/100`, '\u{1F697}'),
    dtAct(a, 'unveil', 'Unveil a New Model', '\u{1F3AC}', {
      subtitle: (gg) => `About ${money(unveilCost(view(gg, a).b))} for the show · preorders this year`,
      disabled: (_gg, _bb, tt) => (tt.stage < 1 ? 'Unveil a car you can actually build first.' : null),
      run: (gg, cur, bb, tt) => {
        if (!useYearAction(gg, `dt.unveil.${cur.id}`, 1)) return tooBusy(gg, `unveiled a car for ${cur.name}`)
        const cost = payTech(bb, tt, unveilCost(bb))
        const ok = chance(gg, clampN(0.55 + tt.level / 300, 0.3, 0.9))
        bb.campaignBoost = clampN(bb.campaignBoost + (ok ? 0.15 : 0.04), 0, 0.6)
        tt.hype = clampN(tt.hype + (ok ? 15 : 2), 0, 100)
        notice(gg, ok ? 'Preorders Flooding In' : 'Awkward Unveiling', ok ? `The new model drove onto the stage through a cloud of dry ice. Preorders crashed your website (${formatMoney(cost)} for the show).` : `The "unbreakable" window shattered on stage. Preorders came in anyway, just fewer of them (${formatMoney(cost)} for the show).`, { emoji: ok ? '\u{1F3AC}' : '\u{1F62C}', tone: ok ? 'good' : 'bad' })
        revalue(gg, cur, bb, tt)
      },
    }),
    dtAct(a, 'sleep', 'Sleep at the Factory', '\u{1F6CF}\u{FE0F}', {
      subtitle: 'Personally drag the line out of production hell',
      visible: (gg) => view(gg, a).t.stage === 2 && runsIt(gg, a),
      run: (gg, cur, _bb, tt) => {
        if (!useYearAction(gg, `dt.sleep.${cur.id}`, 1)) return tooBusy(gg, 'slept at the factory')
        addStat(gg, 'health', -6)
        addStat(gg, 'happiness', -3)
        const ramp = tt.programs.find((p) => p.id === 'ramp')
        if (ramp) ramp.progress = Math.round((ramp.progress + 0.5) * 100) / 100
        else tt.level = clampN(tt.level + 2, 0, 100)
        notice(gg, 'Living on the Line', `You moved a sleeping bag under a desk next to the paint shop. ${ramp ? 'The ramp program jumped ahead.' : 'Start the "Escape Production Hell" program to make it count.'} Your back filed a formal complaint.`, { emoji: '\u{1F6CF}\u{FE0F}' })
      },
    }),
  ]
}

/** A test flight flown by a general manager (log only, no popups). */
export function testFlightAuto(g: GameState, a: Asset, b: BizState, t: TechState): void {
  testFlight(g, a, b, t, true)
}

function unveilCost(b: BizState): number {
  return Math.round(600_000 * (0.5 + localEcon(b.industry, b.countryId, b.city).level))
}

function quantumNodes(_g: GameState, a: Asset, _b: BizState, t: TechState): MenuNode[] {
  return [
    infoNode(a, 'qubits', `${t.qubits.toLocaleString('en-US')} physical qubits · ${plural(t.logical, 'logical qubit')} · fridge reliability ${Math.round(t.safety)}/100`, '\u{269B}\u{FE0F}'),
    dtAct(a, 'announce', 'Announce a Breakthrough', '\u{1F4E2}', {
      subtitle: 'Hype now, peer review later',
      disabled: (gg) => ((gg.yearActions[`dt.announce.${a.id}`] ?? 0) >= 1 ? 'You already made an announcement this year.' : null),
      run: (gg, cur) => {
        if (!useYearAction(gg, `dt.announce.${cur.id}`, 1)) return tooBusy(gg, 'made a big announcement')
        if (!presentDeepTechEvent(gg, cur, 'supremacy')) notice(gg, 'Nothing to Announce', 'Your qubits are still noisy. Announce something once you have a working machine.', { emoji: '\u{1F914}' })
      },
    }),
    bidAction(a, 'nationalLab', 'Bid for a National Lab Contract'),
  ]
}

function cyberNodes(_g: GameState, a: Asset, _b: BizState, t: TechState): MenuNode[] {
  const nodes: MenuNode[] = [infoNode(a, 'cyber', `${stageName('cybersecurity', t.stage)} · security record ${Math.round(t.safety)}/100`, '\u{1F6E1}\u{FE0F}')]
  if (t.contract) nodes.push(infoNode(a, 'contract', `${t.contract.name}: ${money(t.contract.perYear)}/yr for ${plural(t.contract.years, 'more year')}`, '\u{1F3DB}\u{FE0F}'))
  nodes.push(
    dtAct(a, 'research', 'Publish Threat Research', '\u{1F4D1}', {
      subtitle: 'Name a hacking group, win the news cycle',
      run: (gg, cur, bb, tt) => {
        if (!useYearAction(gg, `dt.research.${cur.id}`, 1)) return tooBusy(gg, 'published a threat report')
        const cost = payTech(bb, tt, Math.round(150_000 * (0.5 + localEcon(bb.industry, bb.countryId, bb.city).level)))
        tt.hype = clampN(tt.hype + 8, 0, 100)
        bb.brand = clampN(bb.brand + 4, 0, 100)
        bb.campaignBoost = clampN(bb.campaignBoost + 0.05, 0, 0.6)
        notice(gg, 'Report Published', `Your report on a hacking group nicknamed "${pickName(gg)}" made headlines worldwide (${formatMoney(cost)}). Every CISO read it; several called sales.`, { emoji: '\u{1F4D1}', tone: 'good' })
        revalue(gg, cur, bb, tt)
      },
    }),
    bidAction(a, 'cyberGov', 'Bid for a Government Contract'),
  )
  return nodes
}

function pickName(g: GameState): string {
  const a = ['Velvet', 'Crimson', 'Silent', 'Glass', 'Frost', 'Copper', 'Midnight', 'Paper']
  const b = ['Panda', 'Kitten', 'Typhoon', 'Badger', 'Spider', 'Lynx', 'Heron', 'Mantis']
  return `${a[Math.floor(rand(g) * a.length)]} ${b[Math.floor(rand(g) * b.length)]}`
}

/** "Bid for a contract" rows open the matching event on demand (once a year). */
function bidAction(a: Asset, ev: string, label: string): MenuAction {
  return dtAct(a, `bid.${ev}`, label, '\u{1F3DB}\u{FE0F}', {
    subtitle: 'Three-year contract · win or lose, the proposal costs money',
    disabled: (gg, bb, tt) => (tt.contract ? 'You already have a government contract running.' : !deepTechEventOpen(gg, a, bb, tt, ev) ? 'Not yet: governments only buy from companies further along.' : (gg.yearActions[`dt.bid.${a.id}`] ?? 0) >= 1 ? 'You already bid on a contract this year.' : null),
    run: (gg, cur) => {
      if (!useYearAction(gg, `dt.bid.${cur.id}`, 1)) return tooBusy(gg, 'bid on a government contract')
      presentDeepTechEvent(gg, cur, ev)
    },
  })
}

function screenMenu(a: Asset, b0: BizState): MenuGroup {
  const ind = dtInd(b0)
  const sc = DEEP_TECH[ind].screen
  return {
    type: 'menu',
    id: `dt.screen.${a.id}`,
    label: sc.label,
    emoji: sc.emoji,
    subtitle: (g) => {
      const { b, t } = view(g, a)
      return stageName(dtInd(b), t.stage)
    },
    disabledReason: (g) => dtBlock(g, a),
    header: () => sc.header,
    children: (g) => {
      const { b, t } = view(g, a)
      switch (dtInd(b)) {
        case 'semiconductor':
          return chipsNodes(g, a, b, t)
        case 'aiLab':
          return aiNodes(g, a, b, t)
        case 'robotics':
          return robotNodes(g, a, b, t)
        case 'biotech':
          return biotechNodes(g, a, b, t)
        case 'spaceTech':
          return spaceNodes(g, a, b, t)
        case 'electricVehicles':
          return evNodes(g, a, b, t)
        case 'quantum':
          return quantumNodes(g, a, b, t)
        case 'cybersecurity':
          return cyberNodes(g, a, b, t)
      }
    },
  }
}

/** Extra rows on the company screen under "Run the Company". */
export function deepTechNodesImpl(g: GameState, a: Asset): MenuNode[] {
  const b = readBiz(g, a)
  return [labMenu(a), fundingMenu(a), screenMenu(a, b)]
}

/** One status line for the company screen. */
export function deepTechInfoImpl(g: GameState, a: Asset): string {
  const b = readBiz(g, a)
  const t = techView(b)
  const ind = dtInd(b)
  const def = industryDef(ind)
  const parts = [`Tech level ${Math.round(t.level)}/100`, stageName(ind, t.stage), b.public ? `listed on the ${b.exchange}` : SERIES[t.series]]
  parts.push(`R&D account ${money(t.venture)}`, runwayText(runwayYears(g, a, b, t)))
  if (sellable(g, b, t)) parts.push(`price ${b.price >= 100 ? money(b.price) : formatCents(b.price)} per ${def.unitOne}, plan ${units(b.production)} ${def.unit}`)
  return parts.join(' · ')
}

/** One clause for the AI prompt. */
export function deepTechSummaryImpl(g: GameState, a: Asset): string {
  const b = readBiz(g, a)
  const t = techView(b)
  const ind = dtInd(b)
  const parts = [`deep tech at "${stageName(ind, t.stage)}"`, `tech level ${Math.round(t.level)}/100`, b.public ? 'publicly listed' : `${SERIES[t.series]} startup`]
  if (ind === 'aiLab') {
    const best = bestModel(t)
    if (best) parts.push(`best model ${best.name} (score ${best.score})`)
  }
  if (ind === 'semiconductor') parts.push(`${NODES[t.node]} chips${t.plant ? `, ${plural(t.plant, 'fab')}` : ', fabless'}`)
  if (ind === 'biotech') {
    const approved = t.drugs.filter((d) => d.phase >= 4).map((d) => d.name)
    if (approved.length) parts.push(`approved drugs: ${approved.join(', ')}`)
  }
  if (ind === 'spaceTech') parts.push(`${t.wins} successful launches, ${t.booms} explosions`)
  if (ind === 'quantum') parts.push(`${t.qubits} qubits`)
  if (t.programs.length) parts.push(`working on ${t.programs.map((p) => p.name).slice(0, 2).join(' and ')}`)
  const r = runwayYears(g, a, b, t)
  if (r < 1) parts.push('running out of money')
  const share = shareSummary(g, b)
  if (share) parts.push(share)
  return parts.join(', ')
}
