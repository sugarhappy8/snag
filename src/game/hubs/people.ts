// The people adapter (G.8, G.9). Relationships is a custom sheet in the UI (RelationshipsSheet, PersonSheet), not a
// MenuGroup, so nothing that walks menus could see a person. peopleMenu dresses the same data as one: a heading per
// relationship group, then one `person.<id>` group per person, whose children are the person's own actions. The search
// index, the deep links and the cockpit read it; the sheets keep their markup and are not changed by it.
//
// Pure, like every hub: no draw, no write to the game. The game layer cannot import the UI, so the label and subtitle
// rules of PersonSheet (personName, personSubtitle) are copied here, and test/nav-people.test.ts pins that they agree.
// Person action ids are shared by all people (relationships.ts build(def, pid) uses def.id), so a consumer keys a
// person's action by its full path (person.<id> then the action id), never by the action id alone.
import { fullName, getPerson, personAvatar, relationLabel } from '../core'
import { personActions, relationshipGroups } from '../relationships'
import type { GameState, MenuGroup, MenuNode, Person, RelationKind } from '../types'

/** The id of the Relationships root, the same as the bottom-bar tab. */
export const PEOPLE_ROOT_ID = 'relationships'

const PERSON_PREFIX = 'person.'

/** The relations whose cooling off is worth a flag: family you live next to, a partner, a best friend. */
const DRIFT_RELATIONS: ReadonlySet<RelationKind> = new Set<RelationKind>(['parent', 'spouse', 'partner', 'fiance', 'child', 'bestFriend'])
/** A living person in one of those relations whose relationship is below this is "Drifting". */
const DRIFT_BELOW = 25

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

function drifting(p: Person | undefined): string | null {
  if (!p || !p.alive || !DRIFT_RELATIONS.has(p.relation)) return null
  return p.relationship < DRIFT_BELOW ? 'Drifting' : null
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
    badge: (g) => drifting(getPerson(g, id)),
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
