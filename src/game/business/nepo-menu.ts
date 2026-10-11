// The menus for family at the company: the company screen's "Family at the Company" group (who works
// here and how they are doing, offer a job, promote / demote / raise / fire / make CEO, succession)
// and the Job rows on a relative's own sheet. Menus are pure: purple Business hints come from the
// same model the actions use (nepo-model.ts, the board's exact pass odds), never from g's RNG.
import { formatMoney } from '../core'
import { entitlement } from '../events/wealth-core'
import { hasTalent, talentHint } from '../talents'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode, Person } from '../types'
import { needsVote, passOdds, type Proposal } from './board'
import { refusedThisYear } from './board-vote'
import { manageBlock } from './gate'
import { designateStaff, designateSuccessor, clearSuccessor, demote, fire, handOverToSuccessor, hireRelative, liveBiz, makeCeo, movePlan, movePlanProposal, payProposal, planBlock, planHire, planProposal, promote, setPay, severanceFor, ceoBlock, ceoPayFor, ceoProposal, successorBlock, CUSHY_RANK, type HireOpts } from './nepo-actions'
import { readJob, readPast, type FamilyJob } from './nepo-job'
import { fitOf, fitWord, outlookFor, outlookText, ratingWord } from './nepo-model'
import { ABOVE_MARKET, MAX_PAY_MULT, ageBlock, marketPay, payAt, rankDef, rankTitle } from './nepo-roles'
import { CEO_MIN_AGE } from './nepo-succession'
import { successionReviewMenu } from './succession-review'
import { successionEstateUnit } from './nepo-inheritance'
import { employeesOf, employerOf, familyPayroll, heirsOf, hireBlock, isCeoOf, isRelative, readFamily, successorOf, yourKin, eligibleRelatives, kinWord } from './nepo-state'
import { companyEffects } from './nepo-year'
import { businessAssets, readBiz, runsIt, type BizState } from './state'
import { clampN, money, pct } from './util'

// ---------------------------------------------------------------------------
// Small helpers

function hinting(g: GameState, a: Asset): boolean {
  return hasTalent(g, 'Business') && !manageBlock(g, a)
}

/** 'The board votes on it: about 70% to pass' for a proposal that needs a vote, else ''. */
function boardLine(g: GameState, a: Asset, b: BizState, p: Proposal): string {
  if (!needsVote(g, a, b, p)) return ''
  if (refusedThisYear(g, b, p.kind)) return 'the board already turned down a relative this year'
  return `the board votes on it (about ${Math.round(passOdds(g, a, b, p) * 100)}% to pass)`
}

function hintText(g: GameState, a: Asset, parts: (string | '')[]): string | null {
  if (!hinting(g, a)) return null
  const text = parts.filter(Boolean).join('; ')
  return text ? talentHint(g, 'Business', text) : null
}

function liveRead(g: GameState, a: Asset): { a: Asset; b: BizState } | null {
  const cur = g.assets.find((x) => x.id === a.id)
  return cur ? { a: cur, b: readBiz(g, cur) } : null
}

function personOf(g: GameState, id: string): Person | undefined {
  return g.people.find((p) => p.id === id && p.alive)
}

function resentWord(n: number): string {
  return n >= 60 ? 'furious' : n >= 35 ? 'grumbling' : n >= 15 ? 'muttering' : 'calm'
}

function ratingLine(job: FamilyJob): string {
  return `${job.perf}/100 (${ratingWord(job.perf)})`
}

function moodWord(m: number): string {
  return m >= 75 ? 'thrilled' : m >= 55 ? 'content' : m >= 35 ? 'restless' : 'miserable'
}

// ---------------------------------------------------------------------------
// One relative who works here

function employeeActions(a: Asset, pid: string): MenuNode[] {
  const base = (key: string) => `nepo.${a.id}.${pid}.${key}`
  const block = (g: GameState): string | null => {
    const x = liveRead(g, a)
    if (!x) return 'You no longer own this company.'
    return manageBlock(g, x.a)
  }
  const readEmp = (g: GameState): { a: Asset; b: BizState; p: Person; job: FamilyJob } | null => {
    const x = liveRead(g, a)
    const p = personOf(g, pid)
    const job = p ? readJob(p) : null
    return x && p && job && job.assetId === a.id ? { ...x, p, job } : null
  }
  const nodes: MenuNode[] = []

  const promoteAct: MenuAction = {
    type: 'action',
    id: base('promote'),
    label: 'Promote',
    emoji: '\u{1F4C8}',
    subtitle: (g) => {
      const e = readEmp(g)
      if (!e) return ''
      const m = movePlan(g, e.b ? e.b : readBiz(g, a), e.p, e.job, 1)
      return m ? `${m.title} \u{00B7} ${money(m.pay)}/yr` : e.job.kind === 'cushy' ? 'A made-up job goes nowhere' : 'The CEO job has its own button'
    },
    disabledReason: (g) => {
      const e = readEmp(g)
      if (!e) return 'They no longer work here.'
      const m = movePlan(g, e.b, e.p, e.job, 1)
      if (!m) return e.job.kind === 'cushy' ? 'A made-up job cannot be promoted.' : 'Use "Make CEO" for the top job.'
      return block(g) ?? ageBlock(e.p, m.to)
    },
    hint: (g) => {
      const e = readEmp(g)
      if (!e) return null
      const m = movePlan(g, e.b, e.p, e.job, 1)
      if (!m) return null
      const o = outlookFor(e.p, m.to, 'real', e.job.skill)
      return hintText(g, e.a, [`${outlookText(o, m.to, 'real')}`, boardLine(g, e.a, e.b, movePlanProposal(e.p, m))])
    },
    run: (g) => {
      const x = liveBiz(g, a.id)
      const p = personOf(g, pid)
      if (x && p) promote(g, x.a, x.b, p)
    },
  }
  nodes.push(promoteAct)

  nodes.push({
    type: 'action',
    id: base('demote'),
    label: 'Demote',
    emoji: '\u{1F4C9}',
    subtitle: (g) => {
      const e = readEmp(g)
      if (!e) return ''
      if (isCeoOf(e.b, e.p)) return 'Replace as CEO with an outside manager, keep them as a VP'
      const m = movePlan(g, e.b, e.p, e.job, -1)
      return m ? `${m.title} \u{00B7} ${money(m.pay)}/yr \u{00B7} they will not enjoy it` : ''
    },
    disabledReason: (g) => {
      const e = readEmp(g)
      if (!e) return 'They no longer work here.'
      if (!isCeoOf(e.b, e.p) && !movePlan(g, e.b, e.p, e.job, -1)) return e.job.kind === 'cushy' ? 'Let them go instead.' : 'They are already at the bottom.'
      return block(g)
    },
    confirm: (g) => {
      const e = readEmp(g)
      return e ? `Demote ${e.p.firstName}?` : null
    },
    run: (g) => {
      const x = liveBiz(g, a.id)
      const p = personOf(g, pid)
      if (x && p) demote(g, x.a, x.b, p)
    },
  })

  nodes.push({
    type: 'action',
    id: base('pay'),
    label: 'Set Their Pay',
    emoji: '\u{1F4B5}',
    subtitle: (g) => {
      const e = readEmp(g)
      return e ? `${money(e.job.pay)}/yr now \u{00B7} the going rate is ${money(marketPay(e.b, e.job.rank))}` : ''
    },
    disabledReason: (g) => {
      const e = readEmp(g)
      if (!e) return 'They no longer work here.'
      return block(g) ?? (e.job.part ? 'A summer job pays the summer rate until they turn 18.' : null)
    },
    hint: (g) => {
      const e = readEmp(g)
      if (!e) return null
      const market = marketPay(e.b, e.job.rank)
      const ratio = e.job.pay / Math.max(1, market)
      return hintText(g, e.a, [ratio > ABOVE_MARKET ? `pay is ${ratio.toFixed(1)}x the going rate: the tax office disallows the part above ${ABOVE_MARKET}x and the board notices` : ratio < 0.85 ? `underpaid at ${pct(ratio)} of the going rate: a restless ${e.job.skill >= 70 ? 'star gets poached' : 'hire looks around'}` : 'paid about right'])
    },
    input: {
      kind: 'slider',
      label: 'Pay (% of the going rate for the job)',
      unit: '%',
      min: 50,
      max: Math.round(MAX_PAY_MULT * 100),
      step: 5,
      defaultValue: (g) => {
        const e = readEmp(g)
        return String(e ? Math.round(clampN((e.job.pay / Math.max(1, marketPay(e.b, e.job.rank))) * 100, 50, MAX_PAY_MULT * 100)) : 100)
      },
      preview: (g, v) => {
        const e = readEmp(g)
        if (!e) return ''
        const pay = payAt(e.b, e.job.rank, v / 100)
        const prop = payProposal(e.p, e.job, e.b, pay)
        const vote = pay > e.job.pay ? boardLine(g, e.a, e.b, prop) : ''
        const over = pay > marketPay(e.b, e.job.rank) * ABOVE_MARKET ? ' \u{00B7} above the deductible rate' : ''
        return `${money(pay)}/yr (${Math.round(v)}% of the going rate)${over}${vote ? ` \u{00B7} ${vote}` : ''}`
      },
    },
    run: (g, input) => {
      const x = liveBiz(g, a.id)
      const p = personOf(g, pid)
      if (x && p && block(g) === null) setPay(g, x.a, x.b, p, clampN(Number(input) || 100, 50, MAX_PAY_MULT * 100) / 100)
    },
  })

  nodes.push({
    type: 'action',
    id: base('ceo'),
    label: 'Make CEO',
    emoji: '\u{1F451}',
    subtitle: (g) => {
      const e = readEmp(g)
      if (!e) return ''
      if (isCeoOf(e.b, e.p)) return 'Already the CEO'
      return `${money(ceoPayFor(e.b, e.job))}/yr \u{00B7} ${runsIt(g, e.a) ? 'you step back from running it' : e.b.manager ? `buys out ${e.b.manager.firstName} ${e.b.manager.lastName}` : 'takes charge'}`
    },
    disabledReason: (g) => {
      const e = readEmp(g)
      if (!e) return 'They no longer work here.'
      return block(g) ?? ceoBlock(g, e.b, e.p, e.job)
    },
    hint: (g) => {
      const e = readEmp(g)
      if (!e || isCeoOf(e.b, e.p)) return null
      const o = outlookFor(e.p, 5, 'real', e.job.skill)
      return hintText(g, e.a, [outlookText(o, 5, 'real'), boardLine(g, e.a, e.b, ceoProposal(e.p, e.job, e.b, ceoPayFor(e.b, e.job)))])
    },
    confirm: (g) => {
      const e = readEmp(g)
      return e ? `Make ${e.p.firstName} ${e.p.lastName} CEO of ${a.name}?` : null
    },
    run: (g) => {
      const x = liveBiz(g, a.id)
      const p = personOf(g, pid)
      if (x && p) makeCeo(g, x.a, x.b, p)
    },
  })

  nodes.push({
    type: 'action',
    id: base('succ'),
    label: 'Groom as Successor',
    emoji: '\u{1F31F}',
    subtitle: (g) => {
      const e = readEmp(g)
      if (!e) return ''
      const s = successorOf(g, e.a, e.b)
      return s && s.kind === 'person' && s.person.id === e.p.id ? 'Already your successor' : 'Mentored, and they run the company when you stop'
    },
    disabledReason: (g) => {
      const e = readEmp(g)
      if (!e) return 'They no longer work here.'
      const s = successorOf(g, e.a, e.b)
      if (s && s.kind === 'person' && s.person.id === e.p.id) return 'They are already your successor.'
      return block(g) ?? successorBlock(e.p, e.job)
    },
    hint: (g) => {
      const e = readEmp(g)
      if (!e) return null
      const grow = outlookFor(e.p, 5, 'real', e.job.skill)
      return hintText(g, e.a, [`they top out near ${Math.round(grow.ceiling)} (a CEO needs 85)`, boardLine(g, e.a, e.b, ceoProposal(e.p, e.job, e.b, ceoPayFor(e.b, e.job)))])
    },
    run: (g) => {
      const x = liveBiz(g, a.id)
      const p = personOf(g, pid)
      if (x && p) designateSuccessor(g, x.a, x.b, p)
    },
  })

  nodes.push({
    type: 'action',
    id: base('fire'),
    label: 'Let Them Go',
    emoji: '\u{1F4E6}',
    subtitle: (g) => {
      const e = readEmp(g)
      return e ? `Severance ${money(severanceFor(e.b, e.job))} \u{00B7} the family will talk` : ''
    },
    disabledReason: (g) => (readEmp(g) ? block(g) : 'They no longer work here.'),
    confirm: (g) => {
      const e = readEmp(g)
      return e ? `Fire ${e.p.firstName}? ${e.p.relation === 'child' || e.p.relation === 'stepchild' ? 'It is your own child.' : 'Family does not forget.'}` : null
    },
    run: (g) => {
      const x = liveBiz(g, a.id)
      const p = personOf(g, pid)
      if (x && p) fire(g, x.a, x.b, p)
    },
  })
  return nodes
}

function employeeGroup(a: Asset, e: { p: Person; job: FamilyJob }): MenuGroup {
  const pid = e.p.id
  return {
    type: 'menu',
    id: `nepo.${a.id}.${pid}.emp`,
    label: `${e.p.firstName} ${e.p.lastName}`,
    emoji: e.p.gender === 'female' ? '\u{1F469}\u{200D}\u{1F4BC}' : '\u{1F468}\u{200D}\u{1F4BC}',
    subtitle: (g) => {
      const p = personOf(g, pid)
      const job = p ? readJob(p) : null
      return p && job ? `${job.title} \u{00B7} ${ratingLine(job)} \u{00B7} ${money(job.pay)}/yr` : 'No longer here'
    },
    header: (g) => {
      const p = personOf(g, pid)
      const job = p ? readJob(p) : null
      const x = liveRead(g, a)
      if (!p || !job || !x) return 'They no longer work here.'
      const market = marketPay(x.b, job.rank)
      const lines = [
        `${yourKin(p)}, ${p.age} \u{00B7} ${job.title}${isCeoOf(x.b, p) ? ' (runs the company)' : ''}${job.part ? ' (summer job)' : ''} since ${job.since}`,
        `Last year's rating ${ratingLine(job)} \u{00B7} mood ${moodWord(job.mood)} \u{00B7} pay ${money(job.pay)} (${pct(job.pay / Math.max(1, market))} of the going rate)`,
      ]
      if (job.kind === 'cushy') lines.push('A made-up job: a title, a desk and nothing to do. The staff know.')
      if (job.groom) lines.push('Being groomed to run the company one day.')
      if (job.unpaid > 0) lines.push('The company could not pay them in full last year.')
      return lines.join('\n')
    },
    hint: (g) => {
      const p = personOf(g, pid)
      const job = p ? readJob(p) : null
      const x = liveRead(g, a)
      if (!p || !job || !x) return null
      const fit = fitOf(job.skill, job.rank)
      return hintText(g, x.a, [`${p.firstName} is ${fitWord(fit)} (skill ${Math.round(job.skill)} against ${rankDef(job.rank).difficulty})`])
    },
    children: () => employeeActions(a, pid),
  }
}

// ---------------------------------------------------------------------------
// Offering a job

function offerAction(a: Asset, pid: string, key: string, label: string, emoji: string, opts: HireOpts): MenuAction {
  const read = (g: GameState): { a: Asset; b: BizState; p: Person } | null => {
    const x = liveRead(g, a)
    const p = personOf(g, pid)
    return x && p ? { ...x, p } : null
  }
  return {
    type: 'action',
    id: `nepo.${a.id}.${pid}.offer.${key}`,
    label,
    emoji,
    subtitle: (g) => {
      const e = read(g)
      if (!e) return ''
      const plan = planHire(g, e.b, e.p, opts)
      return `${plan.title} \u{00B7} ${money(plan.pay)}/yr${plan.part ? ' (summer pay)' : ''}`
    },
    disabledReason: (g) => {
      const e = read(g)
      if (!e) return 'They are not here.'
      return manageBlock(g, e.a) ?? planBlock(g, e.b, e.p, planHire(g, e.b, e.p, opts))
    },
    hint: (g) => {
      const e = read(g)
      if (!e) return null
      const plan = planHire(g, e.b, e.p, opts)
      const o = outlookFor(e.p, plan.rank, plan.kind)
      return hintText(g, e.a, [outlookText(o, plan.rank, plan.kind), boardLine(g, e.a, e.b, planProposal(e.p, plan))])
    },
    confirm: opts.kind === 'cushy' ? () => 'Make up a job? The staff will notice, and the pay is real.' : undefined,
    run: (g) => {
      const x = liveBiz(g, a.id)
      const p = personOf(g, pid)
      if (!x || !p) return
      hireRelative(g, x.a, x.b, p, opts)
    },
  }
}

function offerRoles(a: Asset, p: Person): MenuNode[] {
  const pid = p.id
  if (p.age < 18) return [offerAction(a, pid, 'r0', 'Summer Job', '\u{2600}\u{FE0F}', { rank: 0 })]
  const nodes: MenuNode[] = []
  const labels = ['Start at the Bottom', 'Associate', 'Manager', 'Director', 'Vice President']
  const emojis = ['\u{1F9D1}\u{200D}\u{1F4BC}', '\u{1F4CB}', '\u{1F4C2}', '\u{1F3E2}', '\u{1F4BC}']
  for (let r = 0; r <= 4; r++) nodes.push(offerAction(a, pid, `r${r}`, labels[r], emojis[r], { rank: r }))
  nodes.push(offerAction(a, pid, 'cushy', 'Make Up a Job', '\u{1F6CB}\u{FE0F}', { rank: CUSHY_RANK, kind: 'cushy' }))
  return nodes
}

function offerGroup(a: Asset, p: Person): MenuGroup {
  const pid = p.id
  return {
    type: 'menu',
    id: `nepo.${a.id}.${pid}.offer`,
    label: `${p.firstName} ${p.lastName}`,
    emoji: p.gender === 'female' ? '\u{1F469}' : '\u{1F468}',
    subtitle: (g) => {
      const q = personOf(g, pid)
      return q ? `${kinWord(q)[0].toUpperCase()}${kinWord(q).slice(1)}, ${q.age}` : ''
    },
    header: (g) => {
      const q = personOf(g, pid)
      if (!q) return ''
      const bits = [`${yourKin(q)} is ${q.age}.`]
      if (entitlement(q) >= 60) bits.push('Spoiled, and it shows.')
      if (typeof q.data.nepoSelfMade === 'number') bits.push('Earned their own way after you said no once.')
      const past = readPast(q)
      if (past?.how === 'fired') bits.push('You fired them once.')
      else if (past?.how === 'startup') bits.push('Left to start their own company.')
      return bits.join(' ')
    },
    children: (g) => {
      const q = personOf(g, pid)
      return q ? offerRoles(a, q) : []
    },
  }
}

// ---------------------------------------------------------------------------
// Succession

function successionNodes(a: Asset): MenuNode[] {
  const nodes: MenuNode[] = [successionReviewMenu(a)]
  nodes.push({
    type: 'info',
    id: `nepo.${a.id}.succ.info`,
    emoji: '\u{1F451}',
    text: (g) => {
      const x = liveRead(g, a)
      if (!x) return ''
      const s = successorOf(g, x.a, x.b)
      const heirs = heirsOf(g)
      const unit = successionEstateUnit(g, x.a.id)
      const recipient = unit?.recipient ?? null
      const holding = unit?.group ? unit.group.name : 'the company'
      let will = ''
      if (unit?.conflict) {
        const names = unit.designations.map((p) => p.firstName).join(' and ')
        const result = heirs.length === 0
          ? ''
          : heirs.length === 1
            ? ` By your will, ${heirs[0].firstName} would inherit the group with the rest of the estate.`
            : ` By your will, ${heirs.length} heirs divide your ownership shares; the group and its divisions stay intact.`
        will = ` ${unit.group?.name ?? 'The group'} has conflicting designated family successors (${names}), so no one receives it as a specific bequest.${result}`
      } else if (recipient) {
        if (heirs.length === 0) {
          will = ` As designated successor, ${recipient.firstName} would inherit ${holding} intact.`
        } else if (heirs.length === 1 && heirs[0].id === recipient.id) {
          will = ` By your will, ${recipient.firstName} would inherit ${holding} whole.`
        } else if (heirs.length === 1) {
          will = ` By your will, ${heirs[0].firstName} would inherit the rest of the estate; as designated successor, ${recipient.firstName} would inherit ${holding} intact.`
        } else if (heirs.length > 1) {
          will = ` By your will, ${heirs.length} heirs share the rest of the estate; as designated successor, ${recipient.firstName} would inherit ${holding} intact.`
        }
      } else if (heirs.length === 1) {
        will = ` By your will, ${heirs[0].firstName} would inherit ${holding} whole.`
      } else if (heirs.length > 1) {
        will = unit?.group
          ? ` By your will, ${heirs.length} heirs divide your ownership shares in ${holding}. Its divisions, cash and management stay together.`
          : ` By your will, ${heirs.length} heirs share the estate: if you died now ${holding} would be sold and the cash divided. Name one of your children as successor to keep it in the family.`
      }
      if (!s) return `No successor named${unit?.group ? ' for this division' : ''}. Name a son or daughter, or a key employee, and they take over when you step back.${will}`
      const who = s.kind === 'person' ? `${s.person.firstName} ${s.person.lastName}` : s.name
      return `Your successor: ${who}.${will}`
    },
  })
  nodes.push({
    type: 'action',
    id: `nepo.${a.id}.succ.hand`,
    label: 'Hand Over the CEO Job Now',
    emoji: '\u{1F91D}',
    subtitle: (g) => {
      const x = liveRead(g, a)
      const s = x ? successorOf(g, x.a, x.b) : null
      return s ? `to ${s.kind === 'person' ? s.person.firstName : s.name}; you keep the shares` : 'Name a successor first'
    },
    disabledReason: (g) => {
      const x = liveRead(g, a)
      if (!x) return 'You no longer own this company.'
      const s = successorOf(g, x.a, x.b)
      if (!s) return 'Name a successor first.'
      if (s.kind === 'person' && s.person.age < CEO_MIN_AGE) return `${s.person.firstName} is too young to run a company.`
      return manageBlock(g, x.a)
    },
    confirm: (g) => {
      const x = liveRead(g, a)
      const s = x ? successorOf(g, x.a, x.b) : null
      return s ? `Hand ${a.name} to ${s.kind === 'person' ? s.person.firstName : s.name}?` : null
    },
    run: (g) => {
      const x = liveBiz(g, a.id)
      if (x) handOverToSuccessor(g, x.a, x.b)
    },
  })
  nodes.push({
    type: 'action',
    id: `nepo.${a.id}.succ.clear`,
    label: 'Drop the Succession Plan',
    emoji: '\u{1F5D1}\u{FE0F}',
    subtitle: 'Nobody is groomed any more',
    visible: (g) => {
      const x = liveRead(g, a)
      return !!x && readFamily(x.b.family).succ.kind !== ''
    },
    disabledReason: (g) => manageBlock(g, a),
    run: (g) => {
      const x = liveBiz(g, a.id)
      if (x) clearSuccessor(g, x.b)
    },
  })
  nodes.push({
    type: 'menu',
    id: `nepo.${a.id}.succ.staff`,
    label: 'Name a Key Employee',
    emoji: '\u{1F4CB}',
    subtitle: 'A manager from the leadership team',
    visible: (g) => {
      const x = liveRead(g, a)
      return !!x && x.b.staff.length > 0
    },
    children: (g) => {
      const x = liveRead(g, a)
      if (!x) return []
      return x.b.staff.map((s): MenuAction => ({
        type: 'action',
        id: `nepo.${a.id}.succ.staff.${s.id}`,
        label: `${s.firstName} ${s.lastName}`,
        emoji: '\u{1F4BC}',
        subtitle: `${s.role} \u{00B7} skill ${s.skill}`,
        disabledReason: (gg) => manageBlock(gg, a),
        run: (gg) => {
          const y = liveBiz(gg, a.id)
          if (y) designateStaff(gg, y.a, y.b, s.id)
        },
      }))
    },
  })
  return nodes
}

// ---------------------------------------------------------------------------
// The company screen

/** One line on the staff morale and the press, for the header. */
function climateLine(b: BizState): string {
  const f = readFamily(b.family)
  const parts = [`Staff are ${resentWord(f.resent)} about the boss's family`]
  if (f.label >= 20) parts.push(f.label >= 50 ? 'the press has noticed' : 'a few people have noticed')
  return parts.join(' \u{00B7} ')
}

function familyGroup(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `nepo.family.${a.id}`,
    label: 'Family at the Company',
    emoji: '\u{1F46A}',
    subtitle: (g) => {
      const x = liveRead(g, a)
      if (!x) return ''
      const emps = employeesOf(g, a.id)
      return emps.length ? `${emps.length} ${emps.length === 1 ? 'relative' : 'relatives'} on the team \u{00B7} ${money(familyPayroll(g, a, x.b))}/yr` : 'Hire a son or daughter, or name a successor'
    },
    header: (g) => {
      const x = liveRead(g, a)
      if (!x) return ''
      const emps = employeesOf(g, a.id)
      const fx = companyEffects(x.b, emps)
      const lines = [
        'Relatives are paid out of company cash every year. Executive jobs, made-up ones and pay far above the going rate go to the board when there is one. A mismatched relative drags results; a good one helps (a little).',
        climateLine(x.b),
      ]
      if (emps.length) lines.push(`Their effect on next year: demand ${fx.demand >= 0 ? '+' : ''}${(fx.demand * 100).toFixed(1)}%, costs ${fx.cost >= 0 ? '-' : '+'}${Math.abs(fx.cost * 100).toFixed(1)}%.`)
      return lines.join('\n')
    },
    disabledReason: (g) => (g.character.age < 18 ? 'You must be 18 to run a company.' : null),
    children: (g) => {
      const x = liveRead(g, a)
      if (!x) return []
      const nodes: MenuNode[] = []
      const emps = employeesOf(g, a.id)
      nodes.push({ type: 'heading', id: `nepo.${a.id}.h.team`, label: emps.length ? 'On the payroll' : 'Nobody from the family works here yet' })
      for (const e of emps) nodes.push(employeeGroup(a, e))
      const elig = eligibleRelatives(g, x.b)
      if (elig.length > 0) {
        nodes.push({ type: 'heading', id: `nepo.${a.id}.h.offer`, label: 'Offer a job' })
        for (const p of elig) nodes.push(offerGroup(a, p))
      }
      nodes.push({ type: 'heading', id: `nepo.${a.id}.h.succ`, label: 'Succession' })
      nodes.push(...successionNodes(a))
      return nodes
    },
  }
}

/** Company screen rows: "Family at the Company" (who works here, offer a job, succession). [] when n/a. */
export function familyNodes(g: GameState, a: Asset): MenuNode[] {
  const x = liveRead(g, a)
  if (!x) return []
  const has = employeesOf(g, a.id).length > 0 || readFamily(x.b.family).succ.kind !== '' || eligibleRelatives(g, x.b).length > 0 || x.b.staff.length > 0
  return has ? [familyGroup(a)] : []
}

// ---------------------------------------------------------------------------
// A relative's own sheet

function jobRow(_g: GameState, a: Asset, p: Person, job: FamilyJob): MenuNode {
  const e = { p, job }
  return {
    ...employeeGroup(a, e),
    id: `nepo.${a.id}.${p.id}.sheet`,
    label: `Job at ${a.name}`,
    emoji: '\u{1F454}',
  } as MenuGroup
}

/** Person screen rows for a relative: their job at your company, or ask about one. [] when n/a. */
export function relativeNodes(g: GameState, p: Person): MenuNode[] {
  if (!p.alive || !isRelative(p)) return []
  const companies = businessAssets(g)
  if (companies.length === 0) return []
  const job = readJob(p)
  if (job) {
    const a = employerOf(g, p)
    return a ? [jobRow(g, a, p, job)] : []
  }
  if (p.age < 14) return []
  const options = companies.filter((a) => hireBlock(g, readBiz(g, a), p) === null)
  const past = readPast(p)
  if (options.length === 0) {
    const a0 = companies[0]
    const why = hireBlock(g, readBiz(g, a0), p)
    return why && (p.relation === 'child' || p.relation === 'stepchild') ? [{ type: 'info', id: `nepo.${p.id}.nojob`, emoji: '\u{1F454}', text: why }] : []
  }
  const sub = past?.how === 'fired' ? 'You fired them once' : past?.how === 'startup' ? 'Left to start their own company' : typeof p.data.nepoSelfMade === 'number' ? 'Earned their own way' : undefined
  if (options.length === 1) {
    const a = options[0]
    return [{ ...offerGroup(a, p), id: `nepo.${a.id}.${p.id}.sheetoffer`, label: `Job at ${a.name}`, emoji: '\u{1F454}', subtitle: sub ?? `Offer ${p.firstName} a job` } as MenuGroup]
  }
  return [
    {
      type: 'menu',
      id: `nepo.${p.id}.jobs`,
      label: 'Offer a Job',
      emoji: '\u{1F454}',
      subtitle: sub ?? `At one of your ${options.length} companies`,
      children: () => options.map((a): MenuNode => ({ ...offerGroup(a, p), id: `nepo.${a.id}.${p.id}.sheetoffer`, label: a.name, emoji: a.emoji, subtitle: 'Offer a job here' }) as MenuGroup),
    },
  ]
}

void formatMoney
void rankTitle
