// The top of a person's page (R4-U4): the avatar, the name and "Mother · 45 years old". PersonSheet draws it alone while the lazy profile loads,
// and the profile (PersonProfile.tsx) draws it with the trait words that exposure has reached as `children`.
//
// A leaf of its own, and not part of PersonSheet.tsx, on purpose: the profile is a chunk loaded on demand, and a chunk that imports PersonSheet.tsx
// pulls the whole screen graph behind it (personActions, every menu) into a shared chunk of its own, which cost the first download about 5.5 KB
// of gzip in the build (R4-U4, measured with scripts/bundle-budget.mjs). This file imports only game/core, so the chunk stays a leaf.
// PersonSheet.tsx re-exports personName and personSubtitle, so every screen that imports them from there is unchanged.
import type { ReactNode } from 'react'
import { fullName, personAvatar, relationLabel } from '../../game/core'
import type { Person } from '../../game/types'

/** Display name: pets and people without a last name use the first name only. */
export function personName(p: Person): string {
  return p.relation === 'pet' || !p.lastName ? p.firstName : fullName(p)
}

function ageText(age: number): string {
  return age === 1 ? '1 year old' : `${age} years old`
}

/** "Mother · 45 years old" / "Dog · 3 years old" / "Father · Deceased (age 71)" */
export function personSubtitle(p: Person): string {
  const rel = relationLabel(p)
  if (!p.alive) return `${rel} · Deceased (age ${p.age})`
  return `${rel} · ${ageText(p.age)}`
}

/** The avatar of a person, or a plain face for a record that has none (a very old save can hold a person with no `data`). */
function avatarOf(p: Person): string {
  try {
    return personAvatar(p)
  } catch {
    return '🙂'
  }
}

export function PersonHero({ person, children }: { person: Person; children?: ReactNode }) {
  return (
    <div className="person-hero">
      <div className="person-avatar" aria-hidden>
        {avatarOf(person)}
      </div>
      <div className="person-name">{personName(person)}</div>
      <div className="person-sub">{personSubtitle(person)}</div>
      {children}
    </div>
  )
}
