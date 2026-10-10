// The conglomerate screens: "Form a Conglomerate" (a checklist of the player's companies, then a
// name), each group's screen (combined results, divisions, the group CEO, the mandate, the
// treasury, acquisitions, spin-offs and sales, the stock market, the group board) and the Business
// talent's purple hints (which company fits the group best, whether a spin-off unlocks value, which
// group CEO is worth the pay). Menus are pure: no state changes, no game RNG.
import { moneyWith, useYearAction } from '../core'
import { hasTalent, talentHint } from '../talents'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { getCountry } from '../world'
import { passOdds, type Proposal } from './board'
import { controlsBoard, directorName, mandateDef, MANDATES, ownerSeats, seatLabel, stanceLabel, type Mandate } from './board-state'
import { askingSalary, ceoSeverance, headhunterFee, managerName, SMART_SKILL, STYLE_INFO, styleOf } from './career'
import { acquisitionQuote } from './competition-moves'
import { marketViewOf, shareText } from './competition'
import {
  acquireForGroup,
  acquirePower,
  groupAcquireWhy,
  addToGroup,
  canGroupIpo,
  chairGroup,
  delistGroup,
  delistEffect,
  delistPlan,
  DELIST_PREMIUM,
  dividendSplit,
  formGroup,
  groupBiz,
  groupBlock,
  groupBoardView,
  groupDividend,
  groupHasBoard,
  groupMandateMerit,
  groupNeedsVote,
  groupPassOdds,
  groupProfit,
  groupSpare,
  groupIpo,
  joinBlock,
  joinMerit,
  movableCash,
  moveCash,
  planJoin,
  searchGroupCeo,
  sellGroupShares,
  setGroupMandate,
  shareSale,
  spinOff,
  spinPlan,
  suggestGroupName,
} from './conglomerate-actions'
import { spinHint } from './conglomerate-division'
import { captureOf, groupAcquireBlock, groupCeoValue, joinValue, ownerCapture, sectorList, synergyPlan, DEAL_YEARS, type DivisionInput } from './conglomerate-econ'
import { groupById, groupsOf, groupStake, groupValue, inGroup, sharePriceOf, type Group } from './conglomerate-state'
import { oddsText } from './board-vote'
import { industryDef } from './industries'
import { businessView, shopCompany } from './manage'
import { equityMenu } from './executive'
import { delegationMenu } from './conglomerate-management'
import { groupFamilyMenu } from './conglomerate-family'
import { groupServicesMenu, internalRevenue } from './group-services'
import { manageBlock, tooBusy } from './gate'
import { bizOf, businessAssets, findBusiness, readBiz, stakeValue } from './state'
import { clampN, money, pct, plural } from './util'

const PICK = 'biz.groupPick'

function inputs(grp: Group): DivisionInput[] {
  return grp.members.map((x) => ({ id: x.a.id, b: x.b, own: x.m.own }))
}

function hinting(g: GameState): boolean {
  return hasTalent(g, 'Business') && !groupBlock(g)
}

/** A group action that re-reads the live group before running. */
function gAct(groupId: string, key: string, label: string, emoji: string, opts: {
  subtitle?: string | ((g: GameState) => string)
  hint?: (g: GameState, grp: Group) => string | null
  disabled?: (g: GameState, grp: Group) => string | null
  confirm?: (g: GameState, grp: Group) => string | null
  input?: MenuAction['input']
  stayOpen?: boolean
  run: (g: GameState, grp: Group, input?: string) => void
}): MenuAction {
  return {
    type: 'action',
    id: `biz.group.${key}.${groupId}`,
    label,
    emoji,
    subtitle: opts.subtitle,
    ...(opts.hint
      ? {
          hint: (g: GameState) => {
            const grp = groupById(g, groupId)
            return grp && hinting(g) ? opts.hint!(g, grp) : null
          },
        }
      : {}),
    disabledReason: (g) => {
      const block = groupBlock(g)
      if (block) return block
      const grp = groupById(g, groupId)
      if (!grp) return 'The group no longer exists.'
      return opts.disabled ? opts.disabled(g, grp) : null
    },
    confirm: opts.confirm
      ? (g) => {
          const grp = groupById(g, groupId)
          return grp ? opts.confirm!(g, grp) : null
        }
      : undefined,
    input: opts.input,
    ...(opts.stayOpen ? { stayOpen: true } : {}),
    run: (g, input) => {
      const grp = groupById(g, groupId)
      if (!grp || groupBlock(g)) return
      if (opts.disabled?.(g, grp)) return
      opts.run(g, grp, input)
    },
  }
}

function amount(input: string | undefined, max: number): number {
  const n = Math.round(Number(String(input ?? '').replace(/[^0-9.]/g, '')))
  return Number.isFinite(n) ? clampN(n, 0, Math.max(0, max)) : 0
}

function signed(n: number): string {
  return n < 0 ? `-${money(-n)}` : money(n)
}

function info(id: string, text: string, emoji: string): MenuNode {
  return { type: 'info', id, text, emoji }
}

/** ' · 🔮 about 70% to pass' when the group board votes (only with the Business talent). */
function boardOdds(g: GameState, grp: Group, p: Proposal): string {
  if (!groupNeedsVote(g, grp, p)) return ''
  return ` \u{00B7} the group board votes${hasTalent(g, 'Business') ? ` (\u{1F52E} ${oddsText(groupPassOdds(g, grp, p))} to pass)` : ''}`
}

// ---------------------------------------------------------------------------
// The checklist: Form a Conglomerate

/** Companies that stand alone (not in a live group). */
function standalone(g: GameState): Asset[] {
  return businessAssets(g).filter((a) => !inGroup(g, a.details))
}

/** The ticked companies (only ones that can still join). */
function picked(g: GameState): Asset[] {
  const raw = g.flags[PICK]
  const ids = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  return standalone(g).filter((a) => ids.includes(a.id) && !joinBlock(g, a))
}

function setPicked(g: GameState, ids: string[]): void {
  if (ids.length) g.flags[PICK] = ids
  else delete g.flags[PICK]
}

function companyLine(g: GameState, a: Asset): string {
  const b = readBiz(g, a)
  return `${industryDef(b.industry).label} \u{00B7} ${b.city} \u{00B7} worth ${money(b.valuation)}${b.share < 0.999 ? ` \u{00B7} you own ${pct(b.share)}` : ''}${b.public ? ` \u{00B7} listed on the ${b.exchange}` : ''}`
}

/** The Business talent's best fit among `options` for a set of picks (value over DEAL_YEARS). */
function bestFit(g: GameState, base: Group | null, picks: Asset[], options: Asset[]): { id: string; yearly: number; value: number } | null {
  const pb = picks.map((a) => ({ id: a.id, b: readBiz(g, a) }))
  const capture = base ? captureOf(g, base.core) : ownerCapture(g)
  const without = base || pb.length >= 2 ? joinValue(g, base, pb, capture) : { yearly: 0, value: 0 }
  let best: { id: string; yearly: number; value: number } | null = null
  for (const a of options) {
    const v = joinValue(g, base, [...pb, { id: a.id, b: readBiz(g, a) }], capture)
    const add = { id: a.id, yearly: v.yearly - without.yearly, value: v.value - without.value }
    if (!best || add.value > best.value) best = add
  }
  return best
}

function fitText(g: GameState, fit: { yearly: number; value: number }, what: string): string {
  return fit.value > 0
    ? talentHint(g, 'Business', `${what}: about ${money(fit.yearly)} a year in synergies, worth about ${money(fit.value)} over ${DEAL_YEARS} years after fees and integration`)
    : talentHint(g, 'Business', `Even the best fit costs more than it adds (about ${money(-fit.value)} over ${DEAL_YEARS} years): these businesses have little to share`)
}

function toggleRow(g: GameState, a: Asset, on: boolean, fitId: string | null, fit: { yearly: number; value: number } | null): MenuAction {
  return {
    type: 'action',
    id: `biz.groupPick.${a.id}`,
    label: a.name,
    emoji: on ? '\u{2705}' : '\u{2B1C}',
    subtitle: companyLine(g, a),
    ...(fitId === a.id && fit ? { hint: (gg: GameState) => (hinting(gg) ? fitText(gg, fit, 'Best fit with your picks') : null) } : {}),
    disabledReason: (gg) => groupBlock(gg) ?? (on ? null : joinBlock(gg, a)),
    stayOpen: true,
    run: (gg) => {
      const ids = picked(gg).map((x) => x.id)
      setPicked(gg, ids.includes(a.id) ? ids.filter((x) => x !== a.id) : [...ids, a.id])
    },
  }
}

export const formGroupMenu: MenuGroup = {
  type: 'menu',
  id: 'biz.group.form',
  label: 'Form a Conglomerate',
  emoji: '\u{1F3D7}\u{FE0F}',
  subtitle: (g) => {
    const n = picked(g).length
    return n ? `${plural(n, 'company', 'companies')} picked` : 'Merge two or more of your companies into one group'
  },
  visible: (g) => g.character.alive && standalone(g).length >= 2,
  disabledReason: (g) => groupBlock(g),
  header: () =>
    'Tick two or more of your companies to merge into one group. Each keeps its own CEO, screen and market; together they share a back office, a treasury, a board and one stock listing. Related businesses sell to each other\u{2019}s customers and buy in bulk; unrelated ones mostly add complexity, and investors discount sprawling groups. Bankers and lawyers charge about 1.2% of each company\u{2019}s value, the first year brings integration costs, and boards with outside investors vote.',
  children: (g) => {
    const list = standalone(g)
    const picks = picked(g)
    const ids = picks.map((a) => a.id)
    const free = list.filter((a) => !ids.includes(a.id) && !joinBlock(g, a))
    const fit = hasTalent(g, 'Business') && picks.length >= 1 && free.length ? bestFit(g, null, picks, free) : null
    const nodes: MenuNode[] = [{ type: 'heading', id: 'biz.group.form.pickH', label: 'Pick the Companies' }]
    for (const a of list) nodes.push(toggleRow(g, a, ids.includes(a.id), fit?.id ?? null, fit))
    nodes.push({ type: 'heading', id: 'biz.group.form.dealH', label: 'The Deal' })
    if (picks.length < 2) {
      nodes.push(info('biz.group.form.need', 'Pick at least two companies.', '\u{261D}\u{FE0F}'))
      return nodes
    }
    const plan = planJoin(g, null, picks)
    nodes.push(
      info(
        'biz.group.form.terms',
        `You'd own ${pct(plan.share, 1)} of a group worth about ${money(plan.total)} \u{00B7} fees ${money(plan.fees)}${plan.shortfall > 0 ? ` (${money(plan.shortfall)} from your pocket)` : ''}${plan.votes.length ? ` \u{00B7} votes: ${plan.votes.join(', ')}` : ' \u{00B7} no votes needed'}`,
        '\u{1F4DD}',
      ),
    )
    nodes.push({
      type: 'action',
      id: 'biz.group.form.go',
      label: `Merge ${picks.length} Companies`,
      emoji: '\u{1F3E2}',
      subtitle: plan.block ?? 'Name the group and sign the papers',
      hint: (gg) => {
        if (!hinting(gg)) return null
        const p = planJoin(gg, null, picked(gg))
        const odds = p.votes.length ? mergeOdds(gg, p) : 1
        const head = p.value > 0 ? `A sound deal: about ${money(p.yearly)} a year in synergies, worth about ${money(p.value)} over ${DEAL_YEARS} years after fees, integration and any conglomerate discount` : `A costly deal: about ${money(-p.value)} lost over ${DEAL_YEARS} years once fees, integration and the conglomerate discount are counted`
        return talentHint(gg, 'Business', `${head}${p.votes.length ? `; the boards: ${oddsText(odds)} to approve` : ''}`)
      },
      disabledReason: (gg) => {
        const block = groupBlock(gg)
        if (block) return block
        const p = picked(gg)
        if (p.length < 2) return 'Pick at least two companies.'
        return planJoin(gg, null, p).block
      },
      confirm: (gg) => {
        const p = planJoin(gg, null, picked(gg))
        return `Merge ${p.parts.map((x) => x.a.name).join(', ')}? Fees of ${money(p.fees)} come out of the companies' cash${p.shortfall > 0 ? ` (${money(p.shortfall)} from your own pocket)` : ''}, and you'll own ${pct(p.share, 1)} of the group.${p.votes.length ? ` The boards of ${p.votes.join(', ')} vote first.` : ''}`
      },
      input: { kind: 'text', label: 'Name your group', placeholder: suggestGroupName(g), defaultValue: (gg) => suggestGroupName(gg) },
      run: (gg, input) => {
        const p = picked(gg)
        if (formGroup(gg, p.map((a) => a.id), input ?? '')) setPicked(gg, [])
      },
    })
    nodes.push({
      type: 'action',
      id: 'biz.group.form.clear',
      label: 'Clear the Picks',
      emoji: '\u{1F9F9}',
      stayOpen: true,
      run: (gg) => setPicked(gg, []),
    })
    return nodes
  },
}

/** The chance every board in a merger approves (each board votes independently). Pure. */
function mergeOdds(g: GameState, plan: ReturnType<typeof planJoin>, grp: Group | null = null): number {
  const merit = joinMerit(plan)
  let p = 1
  for (const part of plan.parts) {
    const cur = findBusiness(g, part.a.id)
    if (!cur) continue
    const b = readBiz(g, cur)
    const prop: Proposal = { kind: 'merge', by: 'owner', merit, gain: Math.max(0, plan.yearly), amount: plan.total, label: '' }
    p *= passOdds(g, cur, b, prop)
  }
  if (grp && groupHasBoard(grp.core)) p *= groupPassOdds(g, grp, { kind: 'merge', by: 'owner', merit, gain: Math.max(0, plan.yearly), amount: plan.total, label: '' })
  return p
}


// ---------------------------------------------------------------------------
// A group's screen

function divisionRow(g: GameState, groupId: string, a: Asset): MenuGroup {
  const b = readBiz(g, a)
  const profit = b.last ? `${b.last.net >= 0 ? 'profit' : 'loss'} ${money(Math.abs(b.last.net))}` : 'no results yet'
  return {
    type: 'menu',
    id: `biz.company.${a.id}`,
    label: a.name,
    emoji: a.emoji,
    subtitle: `${industryDef(b.industry).label} \u{00B7} ${b.city} \u{00B7} ${money(stakeValue(b))} yours \u{00B7} ${profit}`,
    header: (gg) => {
      const cur = findBusiness(gg, a.id)
      const grp = groupById(gg, groupId)
      return cur ? `${cur.emoji} ${cur.name}${grp ? ` \u{00B7} a division of ${grp.core.name}` : ''}` : 'You no longer own this business.'
    },
    children: (gg) => {
      const cur = findBusiness(gg, a.id)
      return cur ? businessView(gg, cur) : [info('biz.gone', 'You no longer own this business.', '\u{1F937}')]
    },
  }
}

function summaryRows(g: GameState, grp: Group): MenuNode[] {
  const id = grp.core.id
  const core = grp.core
  const rows: MenuNode[] = []
  const n = grp.members.length
  rows.push(info(`biz.group.i.${id}.0`, `${plural(n, 'division')} in ${sectorList(grp.members.map((x) => x.b.industry))} \u{00B7} formed ${core.founded}`, '\u{1F3E2}'))
  const stake = groupStake(grp)
  if (core.listing) {
    const l = core.listing
    rows.push(info(`biz.group.i.${id}.1`, `Listed on the ${l.exchange} at ${moneyWith(sharePriceOf(grp), (x) => x.toFixed(2))} a share (market cap ${money(groupValue(grp))}) \u{00B7} you own ${pct(core.share, 1)}, worth ${money(stake)}`, '\u{1F4C8}'))
  } else rows.push(info(`biz.group.i.${id}.1`, core.share < 0.999 ? `You own ${pct(core.share, 1)} of the group (${money(stake)}); outside shareholders hold the rest` : `You own all of the group: ${money(stake)}`, '\u{1F4BC}'))
  const books = grp.members.filter((x) => x.b.last)
  if (books.length) {
    const year = Math.max(...books.map((x) => x.b.last!.year))
    const sales = Math.max(0, books.reduce((s, x) => s + (x.b.last!.year === year ? x.b.last!.revenue : 0), 0) - internalRevenue(g, id, year))
    const profit = groupProfit(grp)
    rows.push(info(`biz.group.i.${id}.2`, `${year}: sales ${money(sales)} \u{00B7} ${profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(profit))} \u{00B7} cash ${signed(grp.members.reduce((s, x) => s + x.b.cash, 0))}${grp.members.some((x) => x.b.debt > 0) ? ` \u{00B7} debt ${money(grp.members.reduce((s, x) => s + x.b.debt, 0))}` : ''}`, '\u{1F4CA}'))
  } else rows.push(info(`biz.group.i.${id}.2`, 'No booked year yet: results come at the end of the year.', '\u{1F4CA}'))
  const value = groupValue(grp)
  const disc = core.discount
  rows.push(info(`biz.group.i.${id}.3`, `Group value ${money(value)}${disc >= 0.005 ? ` after a ${pct(disc, 1)} conglomerate discount (investors mark down sprawling, unrelated groups unless the results are strong)` : ' \u{00B7} no conglomerate discount'}`, '\u{1F4B0}'))
  const s = core.synergy
  if (s) {
    const gains = s.backOffice + s.crossSell + s.purchasing
    const costs = s.complexity + s.integration + s.hq
    rows.push(info(`biz.group.i.${id}.4`, `${s.year} synergies: back office +${money(s.backOffice)}, cross-selling ~+${money(s.crossSell)}, purchasing ~+${money(s.purchasing)} \u{00B7} sprawl -${money(s.complexity)}${s.integration ? `, integration -${money(s.integration)}` : ''}${s.hq ? `, group CEO -${money(s.hq)}` : ''} \u{00B7} net ${signed(gains - costs)}`, '\u{1F517}'))
  } else {
    const plan = synergyPlan(inputs(grp), captureOf(g, core))
    rows.push(info(`biz.group.i.${id}.4`, `Synergies start with the first booked year: about ${signed(plan.net)} a year at today's numbers, plus one-off integration costs`, '\u{1F517}'))
  }
  const m = core.manager
  rows.push(
    info(
      `biz.group.i.${id}.5`,
      core.ceo === 'manager' && m
        ? `Group CEO: ${managerName(m)} (skill ${m.skill}/100, ${STYLE_INFO[styleOf(m)].label.toLowerCase()}, ${money(m.salary)}/yr)${m.skill > SMART_SKILL ? ' \u{00B7} works the numbers' : ''} \u{00B7} captures ${pct(captureOf(g, core))} of the synergies`
        : `You chair the group yourself \u{00B7} you capture about ${pct(ownerCapture(g))} of the synergies`,
      '\u{1F454}',
    ),
  )
  const st = groupBoardView(g, grp)
  rows.push(
    info(
      `biz.group.i.${id}.6`,
      `${st ? `Group board: ${st.members.length} seats, ${ownerSeats(st)} yours${controlsBoard(st) ? '' : " (you don't control it)"}` : 'No group board of its own: you own all of it (each division still has a board with the group\u{2019}s people on it)'} \u{00B7} mandate: ${core.mandate ? `${mandateDef(core.mandate).label} for every division` : 'each division\u{2019}s own'}`,
      '\u{1F3DB}\u{FE0F}',
    ),
  )
  if (core.ceo === 'manager' && m && core.memo.length && core.letter >= g.year - 1) rows.push(info(`biz.group.i.${id}.7`, `${managerName(m)}'s last letter: ${core.memo.slice(0, 3).join(' ')}`, '\u{1F4DD}'))
  return rows
}

function ceoMenu(groupId: string): MenuGroup {
  return {
    type: 'menu',
    id: `biz.group.ceo.${groupId}`,
    label: 'Group CEO',
    emoji: '\u{1F454}',
    subtitle: (g) => {
      const grp = groupById(g, groupId)
      const m = grp?.core.manager
      return grp && grp.core.ceo === 'manager' && m ? `${managerName(m)} \u{00B7} skill ${m.skill}/100 \u{00B7} ${money(m.salary)}/yr` : 'You chair it yourself'
    },
    disabledReason: (g) => groupBlock(g),
    hint: (g) => {
      const grp = groupById(g, groupId)
      if (!grp || !hinting(g)) return null
      const ins = inputs(grp)
      const gb = groupBiz(g, grp)
      const pay = askingSalary(gb, 82)
      const hired = groupCeoValue(ins, 82, pay)
      const now = grp.core.ceo === 'manager' && grp.core.manager ? groupCeoValue(ins, grp.core.manager.skill, grp.core.manager.salary) : synergyPlan(ins, ownerCapture(g)).net
      return hired > now + 1000
        ? talentHint(g, 'Business', `A sharp group CEO (about skill 82 at ${money(pay)} a year) would add about ${money(hired - now)} a year after pay`)
        : talentHint(g, 'Business', `The group is too small for a hired group CEO to earn their pay over ${grp.core.ceo === 'manager' ? 'the one you have' : 'you'}`)
    },
    header: () => 'The group CEO autonomously oversees every division: recruiting CEOs at their own level or higher, retaining them, allocating capital, paying down expensive debt and choosing mandates. Higher skill approaches 100% modeled effectiveness, not guaranteed profits. Reserves, project commitments and minority shareholders remain protected. Automatic value-weighted group equity awards reduce your holdings permanently and can be disabled under Autonomous Management. Family Head Office offers five real positions. The group CEO still needs your own ownership grant; no self-awards.',
    children: (g) => {
      const grp = groupById(g, groupId)
      if (!grp) return []
      const hired = grp.core.ceo === 'manager' && grp.core.manager ? grp.core.manager : null
      const fee = (gg: GameState) => {
        const cur = groupById(gg, groupId)
        return cur ? money(headhunterFee(groupBiz(gg, cur), 'standard', 0)) : ''
      }
      const nodes: MenuNode[] = [
        gAct(groupId, 'hireCeo', hired ? 'Replace the Group CEO' : 'Hire a Group CEO', '\u{1F9D1}\u{200D}\u{1F4BC}', {
          subtitle: (gg) => `Headhunter from ${fee(gg)}${hired ? ` \u{00B7} severance ${money(ceoSeverance(hired, gg.year))}` : ''}`,
          run: (gg, cur) => searchGroupCeo(gg, cur.core.id, 'standard'),
        }),
      ]
      if (hired) {
        nodes.push(
          gAct(groupId, 'chair', 'Run It Myself', '\u{1FA91}', {
            subtitle: (gg) => `Buy out ${managerName(hired)} (${money(ceoSeverance(hired, gg.year))}) and chair the group yourself`,
            confirm: () => `Replace ${managerName(hired)} and run ${grp.core.name} yourself?`,
            run: (gg, cur) => {
              chairGroup(gg, cur.core.id)
            },
          }),
        )
      }
      return nodes
    },
  }
}

function mandateMenu(groupId: string): MenuGroup {
  return {
    type: 'menu',
    id: `biz.group.mandate.${groupId}`,
    label: 'Group Mandate',
    emoji: '\u{1F9ED}',
    subtitle: (g) => {
      const m = groupById(g, groupId)?.core.mandate
      return m ? `${mandateDef(m).label} for every division` : 'Each division\u{2019}s board decides'
    },
    disabledReason: (g) => groupBlock(g),
    hint: (g) => {
      const grp = groupById(g, groupId)
      if (!grp || !hinting(g)) return null
      const best = MANDATES.map((d) => ({ id: d.id, v: groupMandateMerit(g, grp, d.id) })).sort((x, y) => y.v - x.v)[0]
      if (!best || best.v <= 0.05) return talentHint(g, 'Business', 'No single mandate beats letting each division follow its own: they need different things')
      return talentHint(g, 'Business', `Across the divisions, a ${mandateDef(best.id).label} mandate fits best`)
    },
    header: () => 'Impose one mandate (and its spending, reserve and pay limits) on every division, or let each division\u{2019}s board set its own. Divisions with outside investors on their boards can only be asked, not told.',
    children: (g) => {
      const grp = groupById(g, groupId)
      if (!grp) return []
      const nodes: MenuNode[] = MANDATES.map((d) =>
        gAct(groupId, `mandate.${d.id}`, d.label, d.emoji, {
          subtitle: (gg) => {
            const cur = groupById(gg, groupId)
            const p: Proposal = { kind: 'mandate', by: 'owner', mandate: d.id, merit: cur ? groupMandateMerit(gg, cur, d.id) : 0, label: '' }
            return `${cur?.core.mandate === d.id ? 'Current: ' : ''}${d.brief}${cur ? boardOdds(gg, cur, p) : ''}`
          },
          disabled: (_gg, cur) => (cur.core.mandate === d.id ? 'That is already the group mandate.' : null),
          run: (gg, cur) => {
            setGroupMandate(gg, cur.core.id, d.id as Mandate)
          },
        }),
      )
      nodes.push(
        gAct(groupId, 'mandate.none', 'Let Each Division Decide', '\u{1F4CB}', {
          subtitle: 'Every division keeps its own board\u{2019}s mandate',
          disabled: (_gg, cur) => (cur.core.mandate ? null : 'The divisions already set their own.'),
          run: (gg, cur) => {
            setGroupMandate(gg, cur.core.id, null)
          },
        }),
      )
      return nodes
    },
  }
}

function moveMenu(groupId: string): MenuGroup {
  return {
    type: 'menu',
    id: `biz.group.move.${groupId}`,
    label: 'Move Cash Between Divisions',
    emoji: '\u{1F3E6}',
    subtitle: (g) => {
      const grp = groupById(g, groupId)
      return grp ? `${money(grp.members.reduce((s, x) => s + movableCash(g, x), 0))} can move now` : ''
    },
    disabledReason: (g) => groupBlock(g),
    header: () => 'The pooled treasury: move spare cash to the division that needs it. Only cash above a division\u{2019}s debts, its board\u{2019}s reserve and money earmarked for unreleased games can move, and divisions with outside investors of their own can\u{2019}t send or receive any (it would short-change them, or hand them a gift).',
    children: (g) => {
      const grp = groupById(g, groupId)
      if (!grp) return []
      return grp.members.map((x): MenuNode => {
        const spare = movableCash(g, x)
        if (spare <= 0) return info(`biz.group.move.${groupId}.${x.a.id}`, `${x.a.name}: ${x.m.own < 0.999 ? 'has outside investors of its own' : 'nothing to spare after its debts and reserve'} (cash ${signed(x.b.cash)})`, x.a.emoji)
        return {
          type: 'menu',
          id: `biz.group.moveFrom.${groupId}.${x.a.id}`,
          label: `From ${x.a.name}`,
          emoji: x.a.emoji,
          subtitle: `${money(spare)} it can spare \u{00B7} cash ${money(x.b.cash)}`,
          disabledReason: (gg) => groupBlock(gg),
          children: (gg) => {
            const cur = groupById(gg, groupId)
            if (!cur) return []
            const src = cur.members.find((m) => m.a.id === x.a.id)
            if (!src) return []
            const max = movableCash(gg, src)
            return cur.members
              .filter((m) => m.a.id !== x.a.id)
              .map((to) =>
                gAct(groupId, `move.${x.a.id}.${to.a.id}`, `To ${to.a.name}`, to.a.emoji, {
                  subtitle: `Cash ${signed(to.b.cash)}${to.b.debt > 0 ? ` \u{00B7} debt ${money(to.b.debt)}` : ''}`,
                  disabled: () => (to.m.own < 0.999 ? `${to.a.name} has outside investors of its own.` : max <= 0 ? `${x.a.name} has nothing to spare.` : null),
                  input: {
                    kind: 'slider',
                    money: true,
                    label: `Move from ${x.a.name} to ${to.a.name}`,
                    min: 1,
                    max: Math.max(2, max),
                    defaultValue: () => String(Math.max(1, Math.round(max / 2))),
                    preview: (_g2, v) => `${x.a.name} keeps ${money(Math.max(0, src.b.cash - v))} \u{00B7} ${to.a.name} gets ${money(to.b.cash + v)}`,
                  },
                  run: (g2, live, input) => {
                    const fromLive = live.members.find((m) => m.a.id === x.a.id)
                    if (!fromLive) return
                    moveCash(g2, live.core.id, x.a.id, to.a.id, amount(input, movableCash(g2, fromLive)))
                  },
                }),
              )
          },
        }
      })
    },
  }
}

function acquireMenu(groupId: string): MenuGroup {
  return {
    type: 'menu',
    id: `biz.group.acquire.${groupId}`,
    label: 'Acquire a Rival',
    emoji: '\u{1F988}',
    subtitle: 'Buy out a division\u{2019}s competitor with the group\u{2019}s cash',
    disabledReason: (g) => groupBlock(g),
    header: () => 'Buy a rival from one of your divisions\u{2019} markets: most of its customers stay, its sites become yours and your market share jumps. The whole treasury can pay for it (within each division\u{2019}s reserve). Regulators block deals that make you too big, and a dominant company draws antitrust cases. Spending past the division\u{2019}s budget goes to its board.',
    children: (g) => {
      const grp = groupById(g, groupId)
      if (!grp) return []
      return grp.members.map(
        (x): MenuGroup => ({
          type: 'menu',
          id: `biz.group.acquireIn.${groupId}.${x.a.id}`,
          label: `Rivals of ${x.a.name}`,
          emoji: x.a.emoji,
          subtitle: `${industryDef(x.b.industry).label} \u{00B7} the group can put ${money(acquirePower(g, grp, x))} behind it`,
          disabledReason: (gg) => groupBlock(gg),
          children: (gg) => {
            const cur = groupById(gg, groupId)
            const div = cur?.members.find((m) => m.a.id === x.a.id)
            if (!cur || !div) return []
            const v = marketViewOf(gg, div.b)
            const rivals = v.rivals.filter((r) => !r.legacy).slice(0, 5)
            if (!rivals.length) return [info(`biz.group.acqNone.${x.a.id}`, 'There is nobody worth buying.', '\u{1F937}')]
            return rivals.map((r) => {
              const q = acquisitionQuote(gg, div.b, r.id)
              // Regulators would stop it (on its own or with the sister divisions): no buy/overpriced read.
              const blocked = !q || !!q.block || !!groupAcquireBlock(gg, div.b, cur.members.filter((m) => m.a.id !== div.a.id).map((m) => m.b), r.share)
              return gAct(groupId, `acq.${x.a.id}.${r.id}`, r.name, getCountry(r.hq).flag, {
                subtitle: q ? `${money(q.price)} \u{00B7} ${shareText(r.share)} of the market \u{00B7} together ${shareText(q.combined)}` : 'Not for sale',
                hint: () => (q && !blocked ? talentHint(gg, 'Business', q.value > 0 ? `A good buy: about ${money(q.value)} more than it costs over the years` : `Overpriced: about ${money(-q.value)} more than it will ever earn`) : null),
                disabled: (g2, live) => {
                  const d2 = live.members.find((m) => m.a.id === x.a.id)
                  if (!d2) return `${r.name} isn't for sale.`
                  const why = groupAcquireWhy(g2, live, d2, r.id)
                  return why === 'Not for sale.' ? `${r.name} isn't for sale.` : why
                },
                confirm: () => (q ? `Buy ${r.name} for ${money(q.price)} of ${grp.core.name}'s cash?` : null),
                run: (g2, live) => {
                  acquireForGroup(g2, live.core.id, x.a.id, r.id)
                },
              })
            })
          },
        }),
      )
    },
  }
}

function addMenu(groupId: string): MenuGroup {
  const candidates = (g: GameState) => standalone(g)
  return {
    type: 'menu',
    id: `biz.group.add.${groupId}`,
    label: 'Add a Company',
    emoji: '\u{2795}',
    subtitle: (g) => {
      const n = candidates(g).length
      return n ? `${plural(n, 'company', 'companies')} of yours could join` : 'Start or buy another company first'
    },
    disabledReason: (g) => groupBlock(g),
    hint: (g) => {
      const grp = groupById(g, groupId)
      if (!grp || !hinting(g)) return null
      const options = candidates(g).filter((a) => !joinBlock(g, a))
      if (!options.length) return null
      const fit = bestFit(g, grp, [], options)
      const name = fit ? options.find((a) => a.id === fit.id)?.name : ''
      return fit ? fitText(g, fit, `${name} fits best`) : null
    },
    header: () => 'Bring another of your companies into the group. Its outside shareholders (if any) swap into group shares at fair value, its board and the group\u{2019}s board vote, and bankers and lawyers charge about 1.2% of its value. A listed company\u{2019}s shareholders get group shares at the market price.',
    children: (g) => {
      const grp = groupById(g, groupId)
      if (!grp) return []
      const list = candidates(g)
      if (!list.length) return [info(`biz.group.addNone.${groupId}`, 'None of your other companies stands alone. Start or buy one first.', '\u{1F937}')]
      const options = list.filter((a) => !joinBlock(g, a))
      const fit = hasTalent(g, 'Business') && options.length ? bestFit(g, grp, [], options) : null
      return list.map((a) =>
        gAct(groupId, `add.${a.id}`, a.name, a.emoji, {
          subtitle: (gg) => {
            const cur = groupById(gg, groupId)
            if (!cur) return ''
            const p = planJoin(gg, cur, [a])
            return `${companyLine(gg, a)} \u{00B7} fees ${money(p.fees)} \u{00B7} you'd own ${pct(p.share, 1)} of the group${p.votes.length ? ` \u{00B7} votes: ${p.votes.join(', ')}` : ''}`
          },
          ...(fit && fit.id === a.id ? { hint: (gg: GameState) => fitText(gg, fit, 'Best fit for the group') } : {}),
          disabled: (gg, cur) => planJoin(gg, cur, [a]).block,
          confirm: (gg, cur) => {
            const p = planJoin(gg, cur, [a])
            return `Bring ${a.name} into ${cur.core.name}? Fees: ${money(p.fees)}${p.shortfall > 0 ? ` (${money(p.shortfall)} from your pocket)` : ''}. You'd own ${pct(p.share, 1)} of the group.${p.votes.length ? ` Votes: ${p.votes.join(', ')}${hasTalent(gg, 'Business') ? ` (\u{1F52E} ${oddsText(mergeOdds(gg, p, cur))} to pass)` : ''}.` : ''}`
          },
          run: (gg, cur) => {
            addToGroup(gg, cur.core.id, a.id)
          },
        }),
      )
    },
  }
}

function spinMenu(groupId: string): MenuGroup {
  return {
    type: 'menu',
    id: `biz.group.spin.${groupId}`,
    label: 'Spin Off a Division',
    emoji: '\u{2702}\u{FE0F}',
    subtitle: 'It stands alone; every group shareholder gets their share of it',
    disabledReason: (g) => groupBlock(g),
    header: () => 'A spin-off hands the division to the group\u{2019}s shareholders: it leaves the back office and the treasury, loses its synergies and stops dragging (or lifting) the group\u{2019}s valuation. A listed group\u{2019}s spin-off lists on the same exchange. Lawyers charge about 1.2% of its value (half as much again for a listed group).',
    children: (g) => {
      const grp = groupById(g, groupId)
      if (!grp) return []
      return grp.members.map((x) =>
        gAct(groupId, `spin.${x.a.id}`, `Spin Off ${x.a.name}`, x.a.emoji, {
          subtitle: (gg) => {
            const cur = groupById(gg, groupId)
            if (!cur) return ''
            const p = spinPlan(gg, cur, x.a.id)
            return `${industryDef(x.b.industry).label} \u{00B7} worth ${money(x.b.valuation)} \u{00B7} fees ${money(p.fee)}${boardOdds(gg, cur, { kind: 'merge', by: 'owner', merit: 0, label: '' })}`
          },
          hint: (gg, cur) => spinHint(gg, cur, x.a.id),
          disabled: (gg, cur) => spinPlan(gg, cur, x.a.id).block,
          confirm: (gg, cur) => `Spin ${x.a.name} off from ${cur.core.name}? Fees: ${money(spinPlan(gg, cur, x.a.id).fee)}.${cur.members.length === 2 ? ` That leaves one company, so the group will be wound up.` : ''}`,
          run: (gg, cur) => {
            spinOff(gg, cur.core.id, x.a.id)
          },
        }),
      )
    },
  }
}

function sellMenu(groupId: string): MenuGroup {
  return {
    type: 'menu',
    id: `biz.group.sell.${groupId}`,
    label: 'Sell a Division',
    emoji: '\u{1F3F7}\u{FE0F}',
    subtitle: 'Collect offers for one division',
    disabledReason: (g) => groupBlock(g),
    header: () => 'Buyers pay for the division on its own (no conglomerate discount), and the proceeds go to its shareholders: your look-through share comes to you, taxed as a capital gain.',
    children: (g) => {
      const grp = groupById(g, groupId)
      if (!grp) return []
      return grp.members.map((x) =>
        gAct(groupId, `sell.${x.a.id}`, `Sell ${x.a.name}`, x.a.emoji, {
          subtitle: `Valued at about ${money(x.b.valuation)} \u{00B7} your share ${pct(x.b.share, 1)}`,
          disabled: (gg) => {
            const cur = findBusiness(gg, x.a.id)
            return cur ? manageBlock(gg, cur) : 'You no longer own this business.'
          },
          run: (gg) => {
            const cur = findBusiness(gg, x.a.id)
            if (cur) shopCompany(gg, cur, bizOf(gg, cur))
          },
        }),
      )
    },
  }
}

function marketNodes(groupId: string, grp: Group): MenuNode[] {
  if (!grp.core.listing) {
    return [
      gAct(groupId, 'ipo', 'Take the Group Public (IPO)', '\u{1F514}', {
        subtitle: (g) => {
          const cur = groupById(g, groupId)
          if (!cur) return ''
          return canGroupIpo(g, cur) ?? `Sell a quarter of the group on the stock market and raise money for the treasury${boardOdds(g, cur, { kind: 'ipo', by: 'owner', label: '' })}`
        },
        disabled: (g, cur) => canGroupIpo(g, cur),
        confirm: (_g, cur) => `Take ${cur.core.name} public? You'll sell a quarter of the group to the market, and independent directors join its board.`,
        run: (g, cur) => {
          groupIpo(g, cur.core.id)
        },
      }),
    ]
  }
  return [
    gAct(groupId, 'sellShares', 'Sell Group Shares', '\u{1F4C8}', {
      subtitle: (g) => {
        const cur = groupById(g, groupId)
        const l = cur?.core.listing
        return cur && l ? `${moneyWith(sharePriceOf(cur), (x) => x.toFixed(2))}/share \u{00B7} your stake ${money(groupStake(cur))}` : ''
      },
      input: {
        kind: 'slider',
        label: 'Percent of your group shares to sell',
        unit: '%',
        min: 1,
        max: 100,
        step: 1,
        defaultValue: () => '10',
        preview: (g, v) => {
          const cur = groupById(g, groupId)
          if (!cur) return ''
          const sale = shareSale(g, cur, clampN(v, 0, 100) / 100)
          return `${pct(sale.sold, 1)} of the group for about ${money(sale.gross)}${sale.tax > 0 ? ` (${money(sale.tax)} capital gains tax)` : ''}${sale.impact >= 0.01 ? ` \u{00B7} the sale knocks about ${pct(sale.impact / 2)} off the price` : ''}`
        },
      },
      run: (g, cur, input) => {
        const fraction = clampN(Number(input) || 0, 0, 100) / 100
        if (fraction <= 0) return
        if (!useYearAction(g, `biz.group.shares.${cur.core.id}`, 2)) return tooBusy(g, `sold ${cur.core.name} shares twice`)
        sellGroupShares(g, cur.core.id, fraction)
      },
    }),
    gAct(groupId, 'delist', 'Take the Group Private', '\u{1F512}', {
      subtitle: (g) => {
        const cur = groupById(g, groupId)
        if (!cur) return ''
        const p = delistPlan(g, cur)
        return `Buy out the other shareholders at a ${pct(DELIST_PREMIUM)} premium: ${money(p.cost + p.fees)}${p.fromYou > 0 ? ` (${money(p.fromYou)} from you)` : ' from the treasury'}`
      },
      hint: (g, cur) => {
        const l = cur.core.listing
        if (!l) return null
        const p: Proposal = { kind: 'sell', by: 'owner', amount: Math.round(groupValue(cur) * 1.25), label: '' }
        const odds = groupNeedsVote(g, cur, p) ? oddsText(groupPassOdds(g, cur, p)) : null
        const plan = delistPlan(g, cur)
        const effect = delistEffect(g, cur)
        const premium = money((plan.cost * DELIST_PREMIUM) / (1 + DELIST_PREMIUM) + plan.fees)
        const head =
          effect >= 0
            ? `The market values the group below what its divisions are worth: even after ${premium} of premium and fees, your net worth would rise by about ${money(effect)}`
            : `It would cost you about ${money(-effect)} of net worth: ${premium} of premium and fees${effect < -((plan.cost * DELIST_PREMIUM) / (1 + DELIST_PREMIUM) + plan.fees) - 1000 ? ', and the market\u{2019}s premium on the shares goes too' : ''}`
        return talentHint(g, 'Business', `${head}${odds ? `; the board: ${odds} to approve` : ''}`)
      },
      disabled: (g, cur) => delistPlan(g, cur).block,
      confirm: (g, cur) => {
        const p = delistPlan(g, cur)
        return `Take ${cur.core.name} private for ${money(p.cost + p.fees)}? ${money(p.fromGroup)} comes from the group's spare cash${p.fromYou > 0 ? ` and ${money(p.fromYou)} from your own pocket` : ''}.`
      },
      run: (g, cur) => {
        delistGroup(g, cur.core.id)
      },
    }),
  ]
}

function boardMenu(groupId: string): MenuGroup {
  return {
    type: 'menu',
    id: `biz.group.board.${groupId}`,
    label: 'Group Board',
    emoji: '\u{1F3DB}\u{FE0F}',
    visible: (g) => {
      const grp = groupById(g, groupId)
      return !!grp && groupHasBoard(grp.core)
    },
    subtitle: (g) => {
      const grp = groupById(g, groupId)
      const st = grp ? groupBoardView(g, grp) : null
      return st ? `${st.members.length} seats \u{00B7} ${ownerSeats(st)} yours` : ''
    },
    header: (g) => {
      const grp = groupById(g, groupId)
      const st = grp ? groupBoardView(g, grp) : null
      if (!grp || !st) return ''
      return `${grp.core.listing ? `${grp.core.name} is listed: independent directors answer to every shareholder.` : `Outside shareholders own ${pct(1 - grp.core.share)} of ${grp.core.name}.`} The group board votes on bringing companies in, spin-offs, the group mandate, the group CEO, listing and delisting, and reviews the group CEO every year. ${controlsBoard(st) ? 'Your people hold a majority, so you usually get your way.' : 'You don\u{2019}t hold a majority: they can outvote you, and replace you as group CEO.'}`
    },
    children: (g) => {
      const grp = groupById(g, groupId)
      const st = grp ? groupBoardView(g, grp) : null
      if (!grp || !st) return []
      const nodes: MenuNode[] = [{ type: 'heading', id: `biz.group.boardH.${groupId}`, label: 'Members' }]
      for (const d of st.members) nodes.push(info(`biz.group.boardM.${groupId}.${d.key}`, `${directorName(d)} \u{00B7} ${seatLabel(d.seat)} \u{00B7} ${stanceLabel(d.stance)}${d.seat === 'owner' ? '' : ` \u{00B7} goodwill ${d.loyalty}%`}`, d.seat === 'owner' ? '\u{1F464}' : d.seat === 'investor' ? '\u{1F4BC}' : '\u{2696}\u{FE0F}'))
      nodes.push({ type: 'heading', id: `biz.group.votesH.${groupId}`, label: 'Recent Votes' })
      if (!st.votes.length) nodes.push(info(`biz.group.noVotes.${groupId}`, 'No votes yet.', '\u{1F5F3}\u{FE0F}'))
      ;[...st.votes].reverse().forEach((v, i) => nodes.push(info(`biz.group.vote.${groupId}.${i}`, `${v.year}: ${v.what} \u{2014} ${v.passed ? 'passed' : 'rejected'} ${v.yes}\u{2013}${v.no}${v.note ? ` (${v.note})` : ''}`, v.passed ? '\u{2705}' : '\u{274C}')))
      return nodes
    },
  }
}

function dividendAction(groupId: string, grp: Group, g: GameState): MenuAction {
  const max = groupSpare(g, grp)
  return gAct(groupId, 'dividend', 'Pay a Group Dividend', '\u{1F4E4}', {
    subtitle: (gg) => {
      const cur = groupById(gg, groupId)
      return cur ? `${money(groupSpare(gg, cur))} spare above the divisions' reserves and debts \u{00B7} taxed as income` : ''
    },
    disabled: (gg, cur) => (groupSpare(gg, cur) < 1 ? 'No division has cash above its reserve and its debts.' : null),
    input: {
      kind: 'slider',
      money: true,
      label: 'Total payout',
      min: 1,
      max: Math.max(2, Math.round(max)),
      defaultValue: () => String(Math.max(1, Math.round(max / 2))),
      preview: (gg, v) => {
        const cur = groupById(gg, groupId)
        if (!cur) return ''
        const split = dividendSplit(gg, cur, v)
        return `${money(split.mine)} to you (taxed as income)${split.n - split.mine >= 1 ? `; ${money(split.n - split.mine)} to the other shareholders` : ''}`
      },
    },
    run: (gg, cur, input) => {
      groupDividend(gg, cur.core.id, amount(input, groupSpare(gg, cur)))
    },
  })
}

/** The whole screen of one group. */
export function groupView(g: GameState, groupId: string): MenuNode[] {
  const grp = groupById(g, groupId)
  if (!grp) return [info('biz.group.gone', 'This group no longer exists.', '\u{1F937}')]
  const nodes: MenuNode[] = [...summaryRows(g, grp)]
  nodes.push({ type: 'heading', id: `biz.group.divH.${groupId}`, label: `Divisions (${grp.members.length})` })
  for (const x of grp.members) nodes.push(divisionRow(g, groupId, x.a))
  nodes.push({ type: 'heading', id: `biz.group.runH.${groupId}`, label: 'Run the Group' })
  nodes.push(ceoMenu(groupId), mandateMenu(groupId), moveMenu(groupId), dividendAction(groupId, grp, g), acquireMenu(groupId), addMenu(groupId))
  nodes.push(equityMenu(groupId, true))
  nodes.push(delegationMenu(groupId), groupFamilyMenu(groupId))
  nodes.push(groupServicesMenu(groupId))
  nodes.push({ type: 'heading', id: `biz.group.restructH.${groupId}`, label: 'Restructure' })
  nodes.push(spinMenu(groupId), sellMenu(groupId))
  nodes.push({ type: 'heading', id: `biz.group.marketH.${groupId}`, label: 'Stock Market & Board' })
  nodes.push(...marketNodes(groupId, grp), boardMenu(groupId))
  return nodes
}

/** One group as a row in Business / Assets › Businesses. */
export function groupRow(grp: Group): MenuGroup {
  const id = grp.core.id
  return {
    type: 'menu',
    id: `biz.group.${id}`,
    label: grp.core.name,
    emoji: '\u{1F3E2}',
    subtitle: (gg) => {
      const cur = groupById(gg, id)
      if (!cur) return 'Wound up'
      const profit = groupProfit(cur)
      return `Group of ${plural(cur.members.length, 'company', 'companies')} \u{00B7} ${money(groupStake(cur))} yours${cur.members.some((x) => x.b.last) ? ` \u{00B7} ${profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(profit))}` : ''}${cur.core.listing ? ` \u{00B7} ${cur.core.listing.exchange}` : ''}`
    },
    header: (gg) => {
      const cur = groupById(gg, id)
      return cur ? `\u{1F3E2} ${cur.core.name}: ${cur.members.map((x) => x.a.name).join(', ')}` : 'This group no longer exists.'
    },
    children: (gg) => groupView(gg, id),
  }
}

/** Your groups, then "Form a Conglomerate". */
export function groupNodes(g: GameState): MenuNode[] {
  return [...groupsOf(g).map((grp) => groupRow(grp)), formGroupMenu]
}
