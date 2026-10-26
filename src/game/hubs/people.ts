// The people adapter (G.8, G.9). Relationships is a custom sheet in the UI (RelationshipsSheet, PersonSheet), not a
// MenuGroup, so nothing that walks menus could see a person. peopleMenu dresses the same data as one: a heading per
// relationship group, then one `person.<id>` group per person, whose children are the person's own actions. The search
// index, the deep links and the cockpit read it; the sheets keep their markup and are not changed by it.
//
// The badge of a person (personBadge) is Estranged, then Owes you, then Drifting. The first two are behind the build flag
// peopleProfile (R4-U8, the same flag as the cockpit tiles in cockpit.ts) and both are facts the player already has: the person cut
// contact over the will (isEstranged), or the player lent them money that is still out (readTies). Neither reads the mode. With the
// flag off the badge is the one v5.2.0 had, Drifting alone.
//
// Pure, like every hub: no draw, no write to the game. The game layer cannot import the UI, so the label and subtitle
// rules of PersonSheet (personName, personSubtitle) are copied here, and test/nav-people.test.ts pins that they agree.
// Person action ids are shared by all people (relationships.ts build(def, pid) uses def.id), so a consumer keys a
// person's action by its full path (person.<id> then the action id), never by the action id alone.
import { fullName, getPerson, personAvatar, relationLabel } from '../core'
import { readTies } from '../events/wealth-core'
import { isEstranged } from '../events/will-core'
import { flagOn } from '../flags'
import { personActions, relationshipGroups } from '../relationships'
import type { GameState, MenuGroup, MenuNode, Person, RelationKind } from '../types'

/** The id of the Relationships root, the same as the bottom-bar tab. */
export const PEOPLE_ROOT_ID = 'relationships'

const PERSON_PREFIX = 'person.'

/** The relations whose cooling off is worth a flag: family you live next to, a partner, a best friend. The cockpit tile shares it. */
export const DRIFT_RELATIONS: ReadonlySet<RelationKind> = new Set<RelationKind>(['parent', 'spouse', 'partner', 'fiance', 'child', 'bestFriend'])
/** A living person in one of those relations whose relationship is below this is "Drifting". The cockpit tile shares it. */
export const DRIFT_BELOW = 25

/** `p12` gives `person.p12`. */
export function personGroupId(personId: string): string {
  return `${PERSON_PREFIX}${personId}`
}

/** `person.p12` gives `p12`; anything that is not a person group id (or has no person in it) gives null. */
export function personIdOf(groupId: string): string | null {
  if (typeof groupId !== 'string' || !groupId.startsWith(PERSON_PREFIX) || groupId.length === PERSON_PREFIX.length) return null
  return groupId.slice(PERSON_PREFIX.length)
}

/** Pets and people without a last name use the first name only (PersonSheet.personName). */
function nameOf(p: Person): string {
  return p.relation === 'pet' || !p.lastName ? p.firstName : fullName(p)
}

function ageText(age: number): string {
  return age === 1 ? '1 year old' : `${age} years old`
}

/** "Mother · 45 years old", "Dog · 3 years old", "Father · Deceased (age 71)" (PersonSheet.personSubtitle). */
function subtitleOf(p: Person): string {
  const rel = relationLabel(p)
  if (!p.alive) return `${rel} · Deceased (age ${p.age})`
  return `${rel} · ${ageText(p.age)}`
}

/** The Drifting rule alone: alive, one of the DRIFT_RELATIONS and under DRIFT_BELOW. A relationship that is not a number is not drifting. */
export function isDrifting(p: Person | undefined): boolean {
  return !!p && !!p.alive && DRIFT_RELATIONS.has(p.relation) && p.relationship < DRIFT_BELOW
}

/** True when the living person has cut contact (will-core `estr`). A record that cannot be read is not estranged, and never throws. */
export function cutContact(g: GameState, p: Person | undefined): boolean {
  if (!p || !p.alive || p.relation === 'pet') return false
  try {
    return isEstranged(g, p)
  } catch {
    return false
  }
}

/** What the living person still owes the player, in whole dollars (the wealth ties). 0 for a pet, the dead, no loan or a record that cannot be read. */
export function owedBy(g: GameState, p: Person | undefined): number {
  if (!p || !p.alive || p.relation === 'pet') return 0
  try {
    return readTies(g, p).owes
  } catch {
    return 0
  }
}

/**
 * The word on a person's row: `Estranged`, then `Owes you`, then `Drifting`, or null. The first two need the build flag
 * peopleProfile; with it off this is the Drifting rule alone, as in v5.2.0. At most 12 characters, a pure read of the state.
 */
export function personBadge(g: GameState, p: Person | undefined): string | null {
  if (!p || !p.alive) return null
  if (flagOn('peopleProfile')) {
    if (cutContact(g, p)) return 'Estranged'
    if (owedBy(g, p) > 0) return 'Owes you'
  }
  return isDrifting(p) ? 'Drifting' : null
}

/** The group of one person. It looks the person up again each time, so a stale group never shows old actions. */
export function personGroup(p: Person): MenuGroup {
  const id = p.id
  return {
    type: 'menu',
    id: personGroupId(id),
    label: nameOf(p),
    emoji: personAvatar(p),
    subtitle: subtitleOf(p),
    badge: (g) => personBadge(g, getPerson(g, id)),
    children: (g) => {
      const now = getPerson(g, id)
      return now ? personActions(g, now) : [{ type: 'info', id: 'person.gone', emoji: '\u{1F44B}', text: "They're no longer part of your life." }]
    },
  }
}

/** The groups the sheet shows (RelationshipsSheet.safeGroups): empty ones dropped, a failure logged and not thrown. */
function safeGroups(g: GameState): { title: string; people: Person[] }[] {
  try {
    return relationshipGroups(g).filter((grp) => grp.people.length > 0)
  } catch (err) {
    console.error('[hubs] relationshipGroups failed:', err)
    return []
  }
}

/** "Fiancé(e)" gives "fiance-e": lowercase ASCII, accents folded, every other run of characters one hyphen. */
function slug(title: string): string {
  const s = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s === '' ? 'group' : s
}

/** The Relationships tab as a menu: `rel.h.<slug>` headings labelled "Title (n)", each followed by its people. */
export const peopleMenu: MenuGroup = {
  type: 'menu',
  id: PEOPLE_ROOT_ID,
  label: 'Relationships',
  emoji: '\u{2764}\u{FE0F}',
  children: (g) => {
    const out: MenuNode[] = []
    for (const grp of safeGroups(g)) {
      out.push({ type: 'heading', id: `rel.h.${slug(grp.title)}`, label: `${grp.title} (${grp.people.length})` })
      for (const p of grp.people) out.push(personGroup(p))
    }
    return out
  },
}
