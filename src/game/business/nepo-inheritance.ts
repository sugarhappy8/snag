// Ownership succession at death. A named family successor is normally a management plan, but a
// living child or stepchild who is still employed also receives that company as a specific
// bequest. Conglomerates are one holding: all valid child designations across their divisions must
// agree on one person, otherwise none of them can pull the group out of the divisible estate.
import type { Asset, GameState, Person } from '../types'
import { groupsOf } from './conglomerate-state'
import { successorOf } from './nepo-state'
import { businessAssets, readBiz } from './state'

export interface SuccessionEstateUnit {
  assets: Asset[]
  /** The child who receives this holding outside the ordinary estate split. */
  recipient: Person | null
  /** The directly designated division the recipient was employed by. */
  leadAssetId: string | null
  /** Distinct, valid child designations on a group. Two or more means no specific bequest. */
  designations: Person[]
  group: { id: string; name: string } | null
  conflict: boolean
}

function childDesignation(g: GameState, a: Asset): Person | null {
  const successor = successorOf(g, a, readBiz(g, a))
  if (successor?.kind !== 'person') return null
  return successor.person.relation === 'child' || successor.person.relation === 'stepchild' ? successor.person : null
}

/** Pure, deterministic ownership units for death-time succession. */
export function successionEstateUnits(g: GameState): SuccessionEstateUnit[] {
  const units: SuccessionEstateUnit[] = []
  const grouped = new Set<string>()

  for (const grp of groupsOf(g)) {
    const direct = grp.members
      .map((member) => ({ asset: member.a, person: childDesignation(g, member.a) }))
      .filter((x): x is { asset: Asset; person: Person } => x.person !== null)
      .sort((x, y) => x.asset.id.localeCompare(y.asset.id))
    const byId = new Map<string, Person>()
    for (const x of direct) byId.set(x.person.id, x.person)
    const designations = [...byId.values()].sort((x, y) => x.id.localeCompare(y.id))
    const recipient = designations.length === 1 ? designations[0] : null
    units.push({
      assets: grp.members.map((member) => member.a),
      recipient,
      leadAssetId: recipient ? (direct.find((x) => x.person.id === recipient.id)?.asset.id ?? null) : null,
      designations,
      group: { id: grp.core.id, name: grp.core.name },
      conflict: designations.length > 1,
    })
    for (const member of grp.members) grouped.add(member.a.id)
  }

  for (const a of businessAssets(g)) {
    if (grouped.has(a.id)) continue
    const recipient = childDesignation(g, a)
    units.push({
      assets: [a],
      recipient,
      leadAssetId: recipient ? a.id : null,
      designations: recipient ? [recipient] : [],
      group: null,
      conflict: false,
    })
  }

  return units
}

/** The ownership unit containing this company (a solo company or its whole conglomerate). */
export function successionEstateUnit(g: GameState, assetId: string): SuccessionEstateUnit | null {
  return successionEstateUnits(g).find((unit) => unit.assets.some((a) => a.id === assetId)) ?? null
}
