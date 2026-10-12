// A division's own screen inside a group: the membership row (manage.ts infoRows) and the exit
// rows that change in a group (manage.ts exitNodes): no listing of its own (the whole group
// lists), a spin-off instead. Pure menu builders; actions re-read the live state when they run.
import { hasTalent, talentHint } from '../talents'
import type { Asset, GameState, MenuAction, MenuGroup, MenuNode } from '../types'
import { addToGroup, groupBlock, joinBlock, planJoin, spinOff, spinPlan } from './conglomerate-actions'
import { DEAL_YEARS } from './conglomerate-econ'
import { groupById, groupIdOf, groupsOf, inGroup, readMembership, stakeOnLeaving, type Group } from './conglomerate-state'
import { managerName } from './career'
import { findBusiness, readBiz } from './state'
import { money, pct, plural } from './util'

/** The live group of a company (null when it stands alone). */
export function groupOfCompany(g: GameState, a: Asset): Group | null {
  const cur = findBusiness(g, a.id)
  if (!cur) return null
  const b = readBiz(g, cur)
  return inGroup(g, b) ? groupById(g, groupIdOf(b)) : null
}

/** 'Division of Okafor Holdings (the group owns 100%) · your look-through stake 64%' (null when standalone). */
export function divisionLine(g: GameState, a: Asset): string | null {
  const grp = groupOfCompany(g, a)
  if (!grp) return null
  const b = readBiz(g, a)
  // The group's stake as the group reads it (it follows any outside money the division raised).
  const own = grp.members.find((x) => x.a.id === a.id)?.m.own ?? readMembership(b.group)?.own ?? 1
  const ceo = grp.core.ceo === 'manager' && grp.core.manager ? `group CEO ${managerName(grp.core.manager)}` : 'you chair the group'
  return `Division of ${grp.core.name}${own < 0.999 ? ` (the group owns ${pct(own)}; the rest belongs to investors who came in later)` : ''} \u{00B7} your look-through stake ${pct(b.share, 1)} \u{00B7} ${ceo} \u{00B7} run the group from Business \u{203A} ${grp.core.name}`
}

/** A standalone company's way into one of the player's groups ([] without groups). */
function joinNodes(g: GameState, a: Asset): MenuNode[] {
  const groups = groupsOf(g)
  if (!groups.length) return []
  const menu: MenuGroup = {
    type: 'menu',
    id: `biz.joinGroup.${a.id}`,
    label: 'Add to Group',
    emoji: '\u{1F3E2}',
    subtitle: `Make ${a.name} a division of ${groups.length === 1 ? groups[0].core.name : 'one of your groups'}`,
    disabledReason: (gg) => groupBlock(gg) ?? joinBlock(gg, a),
    children: (gg) =>
      groupsOf(gg).map((grp): MenuAction => {
        const id = grp.core.id
        return {
          type: 'action',
          id: `biz.joinGroup.${a.id}.${id}`,
          label: `Join ${grp.core.name}`,
          emoji: '\u{1F91D}',
          subtitle: (g2) => {
            const cur = groupById(g2, id)
            if (!cur) return ''
            const p = planJoin(g2, cur, [a])
            return `${plural(cur.members.length, 'division')} \u{00B7} fees ${money(p.fees)} \u{00B7} you'd own ${pct(p.share, 1)} of the group${p.votes.length ? ` \u{00B7} votes: ${p.votes.join(', ')}` : ''}`
          },
          hint: (g2) => {
            const cur = groupById(g2, id)
            if (!cur || !hasTalent(g2, 'Business') || groupBlock(g2)) return null
            const p = planJoin(g2, cur, [a])
            return p.value > 0
              ? talentHint(g2, 'Business', `A good fit: about ${money(p.yearly)} a year in synergies, worth about ${money(p.value)} over ${DEAL_YEARS} years after fees and integration`)
              : talentHint(g2, 'Business', `A poor fit: about ${money(-p.value)} lost over ${DEAL_YEARS} years once fees, integration and the conglomerate discount are counted`)
          },
          disabledReason: (g2) => {
            const cur = groupById(g2, id)
            return groupBlock(g2) ?? (cur ? planJoin(g2, cur, [a]).block : 'The group no longer exists.')
          },
          confirm: (g2) => {
            const cur = groupById(g2, id)
            if (!cur) return null
            const p = planJoin(g2, cur, [a])
            return `Bring ${a.name} into ${cur.core.name}? Fees: ${money(p.fees)}${p.shortfall > 0 ? ` (${money(p.shortfall)} from your pocket)` : ''}. You'd own ${pct(p.share, 1)} of the group.${p.votes.length ? ` Votes: ${p.votes.join(', ')}.` : ''}`
          },
          run: (g2) => {
            addToGroup(g2, id, a.id)
          },
        }
      }),
  }
  return [menu]
}

/** The spin-off row on a division's screen, or "Add to Group" for a company that stands alone. */
export function divisionExitNodes(g: GameState, a: Asset): MenuNode[] {
  const grp = groupOfCompany(g, a)
  if (!grp) return joinNodes(g, a)
  const id = grp.core.id
  const action: MenuAction = {
    type: 'action',
    id: `biz.spinOff.${a.id}`,
    label: `Spin Off from ${grp.core.name}`,
    emoji: '\u{2702}\u{FE0F}',
    subtitle: (gg) => {
      const cur = groupById(gg, id)
      if (!cur) return ''
      const p = spinPlan(gg, cur, a.id)
      return `Stand alone again${cur.core.listing ? `, listed on the ${cur.core.listing.exchange}` : ''} \u{00B7} fees ${money(p.fee)}${cur.core.share < 0.999 || cur.core.listing ? ' \u{00B7} the group board votes' : ''}`
    },
    hint: (gg) => {
      if (!hasTalent(gg, 'Business') || groupBlock(gg)) return null
      const cur = groupById(gg, id)
      if (!cur) return null
      return spinHint(gg, cur, a.id)
    },
    disabledReason: (gg) => {
      const block = groupBlock(gg)
      if (block) return block
      const cur = groupById(gg, id)
      if (!cur || !cur.members.some((x) => x.a.id === a.id)) return `${a.name} is no longer part of the group.`
      return spinPlan(gg, cur, a.id).block
    },
    confirm: (gg) => {
      const cur = groupById(gg, id)
      if (!cur) return null
      const p = spinPlan(gg, cur, a.id)
      const x = cur.members.find((m) => m.a.id === a.id)
      return `Spin ${a.name} off from ${cur.core.name}? It leaves the shared back office and treasury; every group shareholder gets their share of it (you keep ${pct(x ? stakeOnLeaving(cur, x) : readBiz(gg, a).share, 1)}). Fees: ${money(p.fee)}.`
    },
    run: (gg) => {
      spinOff(gg, id, a.id)
    },
  }
  return [action]
}

/** The Business talent's read on spinning a division off (honest: the same numbers the deal uses). */
export function spinHint(g: GameState, grp: Group, assetId: string): string | null {
  const p = spinPlan(g, grp, assetId)
  const yours = p.value * grp.core.share
  if (p.value > 0) return talentHint(g, 'Business', `Spinning it off unlocks about ${money(yours)} for you: the conglomerate discount it lifts outweighs the synergies it loses and the fees`)
  return talentHint(g, 'Business', `Keep it: spinning it off would cost you about ${money(-yours)} (${p.yearly < 0 ? `${money(-p.yearly)} a year of lost synergies over ${DEAL_YEARS} years, ` : ''}fees${p.discount > 0 ? ', and a bigger discount on the rest' : ''})`)
}
