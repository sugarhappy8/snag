// The Research & Operations screen (R&D 3.0): what the country pays back, last year's lab ledger and the
// Operations R&D programs, one row each. Menus are pure: they re-read the live company every time they
// are built or tapped, never write state and never draw g.rng; a row that can't run carries the single
// reason its rule gives (lab-rules.ts opsBlock), so a tap and a screen reader get the same words. The
// money moves in lab-year.ts, whose entry points check everything again.
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { manageBlock } from './gate'
import { heavyEligible } from './heavy-rd'
import { labCreditRate, labTierOf, OPS_MAX_RUNG, opsProgram, type OpsProgram } from './lab-data'
import { opsBlock, opsGain, opsOdds, opsOffers, opsPrice, opsYears } from './lab-rules'
import { readLab } from './lab-state'
import { LAB_LABEL, LAB_TIP } from './lab-text'
import { doOps } from './lab-year'
import { live, mAct } from './market-menu-kit'
import { readBiz, type BizState } from './state'
import { money, plural } from './util'

const TRACK_EMOJI = { cost: '\u{1F4C9}', yield: '\u{1F3ED}', quality: '\u{2705}' } as const

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
      return [...headerRows(g, a, b), ...opsNodes(g, a, b)]
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
    disabled: (g, b) => opsBlock(g, b, p.id),
    run: (g, cur) => {
      doOps(g, cur, p.id)
    },
  })
}
