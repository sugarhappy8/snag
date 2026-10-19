// The Research & Operations screen (R&D 3.0): what the country pays back, last year's lab ledger, the
// Operations R&D programs (one row each), the patents and the research team. Menus are pure: they re-read the live company every time they
// are built or tapped, never write state and never draw g.rng; a row that can't run carries the single
// reason its rule gives (lab-rules.ts opsBlock, patentBlock, licenseBlock, teamBlock), so a tap and a screen reader get the same words. The
// money moves in lab-year.ts, whose entry points check everything again. The start, patent and hire rows carry the
// Business talent's purple hint: the expected value from the same rule the action uses (opsValue, patentValue,
// teamValue), worked out once per company state (market-menu-kit cached) and never a roll.
import { talentHint } from '../talents'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { bizWorth, type Worth } from './economy'
import { manageBlock } from './gate'
import { heavyEligible } from './heavy-rd'
import { labCreditRate, labTierOf, OPS_MAX_RUNG, opsProgram, PATENT_AGE, TEAM_MIN_YEARS, TEAM_ODDS, type OpsProgram } from './lab-data'
import { licenseBlock, opsBlock, opsGain, opsOdds, opsOffers, opsPrice, opsValue, opsYears, patentableFamilies, patentBlock, patentTerms, patentValue, teamBlock, teamCap, teamFee, teamPay, teamValue } from './lab-rules'
import { readLab, teamPower, teamSlots } from './lab-state'
import { LAB_LABEL, LAB_TIP } from './lab-text'
import { doHire, doLicense, doOps, doPatent, doRelease } from './lab-year'
import { cached, hinting, live, mAct } from './market-menu-kit'
import { HORIZON } from './rd'
import { readBiz, type BizState } from './state'
import { money, plural } from './util'

const TRACK_EMOJI = { cost: '\u{1F4C9}', yield: '\u{1F3ED}', quality: '\u{2705}' } as const

/** What the company is worth to a decision, worked out once for every hint on the screen (cached per company state). */
function worthOf(g: GameState, cur: Asset): Worth {
  return cached(g, cur, 'lab.worth', () => bizWorth(g, readBiz(g, cur)))
}

/**
 * A purple hint for a row: `make` gives the sentence from the live company (null: say nothing), shown only
 * to a Business-talented owner who can manage the company. It reads stored state and expected values only.
 */
function hintFor(a: Asset, make: (g: GameState, cur: Asset, b: BizState) => string | null): (g: GameState) => string | null {
  return (g) => {
    const cur = live(g, a)
    if (!hinting(g, cur)) return null
    const text = make(g, cur, readBiz(g, cur))
    return text ? talentHint(g, 'Business', text) || null : null
  }
}

/** The screen: one group for a product company, nothing for deep-tech, finance and studio companies, which keep their own R&D. */
export function labMenus(a: Asset, b: BizState): MenuNode[] {
  if (!heavyEligible(b)) return []
  return [labGroup(a)]
}

function labGroup(a: Asset): MenuGroup {
  return {
    type: 'menu',
    id: `biz.lab.${a.id}`,
    label: LAB_LABEL.group,
    emoji: '\u{1F52C}',
    subtitle: LAB_TIP.group(),
    disabledReason: (g) => manageBlock(g, a),
    children: (g) => {
      const b = readBiz(g, live(g, a))
      return [...headerRows(g, a, b), ...opsNodes(g, a, b), ...patentNodes(g, a, b), ...teamNodes(a, b)]
    },
  }
}

/** The tier, what the country pays back on R&D and what the lab booked last year. */
function headerRows(g: GameState, a: Asset, b: BizState): MenuNode[] {
  const nodes: MenuNode[] = []
  const tier = labTierOf(b.industry)
  if (tier) nodes.push({ type: 'info', id: `biz.labTier.${a.id}`, emoji: '\u{1F3ED}', text: LAB_TIP.tier(LAB_LABEL.tier[tier], String(OPS_MAX_RUNG[tier])) })
  const rate = labCreditRate(b.countryId)
  nodes.push({ type: 'info', id: `biz.labCredit.${a.id}`, emoji: '\u{1F4B5}', text: rate > 0 ? LAB_TIP.credit(String(Math.round(rate * 100))) : LAB_TIP.noCredit() })
  const last = readLab(b).ledger.find((r) => r.year === g.year - 1)
  const text = last ? LAB_TIP.ledger(last.credit + last.grant > 0 ? money(last.credit + last.grant) : '', last.royalty > 0 ? money(last.royalty) : '', last.payroll > 0 ? money(last.payroll) : '') : ''
  if (text) nodes.push({ type: 'info', id: `biz.labLast.${a.id}`, emoji: '\u{1F4D2}', text })
  return nodes
}

/** The Operations R&D part: a row for each program at work, then one action for each program on offer. */
function opsNodes(g: GameState, a: Asset, b: BizState): MenuNode[] {
  const nodes: MenuNode[] = [{ type: 'heading', id: `biz.labOpsH.${a.id}`, label: LAB_LABEL.ops }]
  for (const p of readLab(b).programs) {
    const def = opsProgram(p.id)
    if (!def) continue
    nodes.push({ type: 'info', id: `biz.labRun.${a.id}.${p.id}`, emoji: '\u{1F52C}', text: LAB_TIP.running(def.label, plural(Math.max(1, p.years - p.progress), 'year'), String(Math.round(p.odds * 100))) })
  }
  const offers = opsOffers(g, b)
  if (!offers.length) nodes.push({ type: 'info', id: `biz.labNone.${a.id}`, emoji: '\u{1F4AD}', text: LAB_TIP.none() })
  for (const p of offers) nodes.push(opsAction(a, p))
  return nodes
}

/** The numbers a row shows, from the same functions the start and the year end use. */
function quote(g: GameState, a: Asset, p: OpsProgram): { price: string; years: string; odds: string; effect: string } {
  const b = readBiz(g, live(g, a))
  return {
    price: money(opsPrice(b, p.rung)),
    years: plural(opsYears(b, p.rung), 'year'),
    odds: String(Math.round(opsOdds(g, b, p.rung) * 100)),
    effect: (opsGain(g, b, p.id).effect * 100).toFixed(1),
  }
}

/** One program on offer: price, years, odds and the most it can change; greyed out with the one reason when it can't start. */
function opsAction(a: Asset, p: OpsProgram): MenuAction {
  return mAct(a, `lab.ops.${p.id}`, p.label, TRACK_EMOJI[p.track], {
    subtitle: (g) => {
      const q = quote(g, a, p)
      return LAB_TIP.ops(q.price, q.years, q.odds, LAB_TIP[p.track](q.effect))
    },
    confirm: (g) => {
      const q = quote(g, a, p)
      return LAB_TIP.confirm(p.label, q.price, q.years, q.odds)
    },
    // A program that can't go ahead (busy track, cooldown) says nothing: its reason is on the row. Cash alone doesn't hide it.
    hint: hintFor(a, (g, cur, b) => {
      if (opsBlock(g, b, p.id, true)) return null
      const value = cached(g, cur, `lab.ops.${p.id}`, () => opsValue(g, b, p.id, worthOf(g, cur)))
      return value > 0 ? LAB_TIP.opsHint(money(value), String(HORIZON)) : LAB_TIP.noPay()
    }),
    disabled: (g, b) => opsBlock(g, b, p.id),
    run: (g, cur) => {
      doOps(g, cur, p.id)
    },
  })
}

const PATENT_EMOJI = '\u{1F4DC}'
const slug = (family: string): string => family.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/** The Patents part: one action for each line that can be patented, one row for each patent held, and a licence action on a held one. */
function patentNodes(g: GameState, a: Asset, b: BizState): MenuNode[] {
  const nodes: MenuNode[] = [{ type: 'heading', id: `biz.labPatentH.${a.id}`, label: LAB_LABEL.patents }]
  const families = patentableFamilies(g, b)
  const held = readLab(b).patents
  if (!families.length && !held.length) nodes.push({ type: 'info', id: `biz.labPatentNone.${a.id}`, emoji: '\u{1F4AD}', text: LAB_TIP.patentNone(String(PATENT_AGE)) })
  for (const family of families) nodes.push(patentAction(a, family))
  for (const p of held) {
    nodes.push({ type: 'info', id: `biz.labPatent.${a.id}.${slug(p.family)}`, emoji: PATENT_EMOJI, text: p.mode === 'license' ? LAB_TIP.licensedRow(p.family, String(p.until)) : LAB_TIP.held(p.family, plural(Math.max(1, p.until - g.year), 'year')) })
    if (p.mode === 'hold') nodes.push(licenseAction(a, p.family))
  }
  return nodes
}

/** What filing costs and shields, read from the live company. */
function patentQuote(g: GameState, a: Asset, family: string): { fee: string; years: string } {
  const t = patentTerms(g, readBiz(g, live(g, a)), family)
  return { fee: money(t.fee), years: plural(t.years, 'year') }
}

/** One line that can be patented: the fee and the years rivals can't sell one; greyed out with the one reason patentBlock gives. */
function patentAction(a: Asset, family: string): MenuAction {
  return mAct(a, `lab.patent.${slug(family)}`, family, PATENT_EMOJI, {
    subtitle: (g) => {
      const q = patentQuote(g, a, family)
      return LAB_TIP.patent(q.fee, q.years)
    },
    confirm: (g) => {
      const q = patentQuote(g, a, family)
      return LAB_TIP.patentConfirm(family, q.fee, q.years)
    },
    // The better way to hold it, and what that is worth; nothing for a family that can't be filed (its reason is on the row).
    hint: hintFor(a, (g, cur, b) => {
      if (patentBlock(g, b, family, true)) return null
      const pv = cached(g, cur, `lab.patent.${family}`, () => patentValue(g, b, family, worthOf(g, cur)))
      if (!(pv.value > 0)) return LAB_TIP.noPay()
      return (pv.mode === 'license' ? LAB_TIP.patentLicense : LAB_TIP.patentHold)(money(pv.value))
    }),
    disabled: (g, b) => patentBlock(g, b, family),
    run: (g, cur) => {
      doPatent(g, cur, family)
    },
  })
}

/** Licence a held patent: one way, no fee; greyed out with the one reason licenseBlock gives. */
function licenseAction(a: Asset, family: string): MenuAction {
  return mAct(a, `lab.license.${slug(family)}`, LAB_LABEL.license(family), PATENT_EMOJI, {
    subtitle: () => LAB_TIP.license(),
    confirm: (g) => LAB_TIP.licenseConfirm(family, String(g.year + 1)),
    disabled: (g, b) => licenseBlock(g, b, family),
    run: (g, cur) => {
      doLicense(g, cur, family)
    },
  })
}

const TEAM_EMOJI = '\u{1F9D1}\u{200D}\u{1F52C}'

/** The research team: what it is now (scientists, pay, the odds and slots they add), then the hire and release rows. */
function teamNodes(a: Asset, b: BizState): MenuNode[] {
  const n = readLab(b).team.length
  const points = Math.round(100 * TEAM_ODDS * teamPower(n))
  return [
    { type: 'heading', id: `biz.labTeamH.${a.id}`, label: LAB_LABEL.team },
    { type: 'info', id: `biz.labTeam.${a.id}`, emoji: TEAM_EMOJI, text: LAB_TIP.team(String(n), String(teamCap(b)), money(teamPay(b)), String(points), plural(teamSlots(n), 'more slot')) },
    hireAction(a),
    releaseAction(a),
  ]
}

/** What a scientist costs, read from the live company. */
function teamQuote(g: GameState, a: Asset): { fee: string; pay: string } {
  const b = readBiz(g, live(g, a))
  return { fee: money(teamFee(b)), pay: money(teamPay(b)) }
}

/** Hire a scientist: the fee now, the pay every year; greyed out with the one reason teamBlock gives. */
function hireAction(a: Asset): MenuAction {
  return mAct(a, 'lab.hire', LAB_LABEL.hire, TEAM_EMOJI, {
    subtitle: (g) => {
      const q = teamQuote(g, a)
      return LAB_TIP.hire(q.fee, q.pay)
    },
    confirm: (g) => {
      const q = teamQuote(g, a)
      return LAB_TIP.hireConfirm(q.fee, q.pay, String(TEAM_MIN_YEARS))
    },
    // What the next scientist adds against a year's pay; nothing when the trade has no team or it is full (the reason is on the row).
    hint: hintFor(a, (g, cur, b) => {
      if (readLab(b).team.length >= teamCap(b)) return null
      const tv = cached(g, cur, 'lab.team', () => teamValue(g, b, worthOf(g, cur)))
      return tv.value > 0 ? LAB_TIP.teamHint(money(tv.gain), money(tv.pay)) : LAB_TIP.noPay()
    }),
    disabled: (g, b) => teamBlock(g, b, 'hire'),
    run: (g, cur) => {
      doHire(g, cur)
    },
  })
}

/** Let the longest-serving scientist go (after the minimum service): the fee, and the same reason when it can't. */
function releaseAction(a: Asset): MenuAction {
  return mAct(a, 'lab.release', LAB_LABEL.release, TEAM_EMOJI, {
    subtitle: (g) => LAB_TIP.release(teamQuote(g, a).fee, String(TEAM_MIN_YEARS)),
    confirm: (g) => LAB_TIP.releaseConfirm(teamQuote(g, a).fee),
    disabled: (g, b) => teamBlock(g, b, 'release'),
    run: (g, cur) => {
      doRelease(g, cur)
    },
  })
}
