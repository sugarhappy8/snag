// The profile of a living person (R4-U4, H.7): what PersonSheet draws in Realistic with `peopleProfile` on, for a person who is alive and not a pet
// (usesProfile of people-fog.ts, the one eager gate). It is a chunk of its own, loaded through src/ui/people/lazy.tsx (X48), and the only importer of
// FactRow and of the facts builder, so none of them is in the first download. Exact and a life with the flag off never get here: PersonSheet keeps
// today's markup for them.
//
//   hero         the avatar and the name as always; the pills are the trait words exposure has reached, not the whole list
//   facts        one card of FactRows: your own feeling as the one bar, the estimates with their chips, the job, how long you have known them, the
//                cash (an estimate when you are close, "Private." when you are not), and a row for the traits you have not seen yet
//   personality  the stats of the person's data as one word each, at most PEOPLE_CAPS.personality, and one row for the rest
//   notes        "Shared history": what the person remembers first (R4-U10, memoryLines of people-memory.ts: up to three sentences, only on a life
//                the social flag stamped), then the last six notes, as the old sheet listed them
//
//   connections "How you're connected" (R4-U9, connectionsOf of people-web.ts): at most six known rows, from today's data, after the personality card
//
// The reputation card, whose place is kept empty for R5 (D.7, X45), goes in the marked place in this file.
//
// Pure: the rows are the answer of personFacts for this game and this person, which draws nothing and writes nothing, so the same page twice in a
// year. A person the builder refuses (the mode or the flag changed under an open sheet) gets the hero alone until PersonSheet draws today's sheet
// again. The file imports PersonHero.tsx and never PersonSheet.tsx: see the first lines of PersonHero.tsx for why.
import type { ReactElement } from 'react'
import { personFacts, type FactRow as FactData } from '../../game/hubs/people-facts'
import { memoryLines } from '../../game/hubs/people-memory'
import { connectionsOf } from '../../game/hubs/people-web'
import type { GameState, Person } from '../../game/types'
import { FactRow } from './FactRow'
import { PersonHero } from './PersonHero'

export interface PersonProfileProps {
  g: GameState
  person: Person
}

/** The section a row belongs to: its id up to the first dot (`facts.happiness` is `facts`). */
const sectionOf = (row: FactData): string => (row.id.includes('.') ? row.id.slice(0, row.id.indexOf('.')) : row.id)

export function PersonProfile({ g, person }: PersonProfileProps): ReactElement {
  const facts = personFacts(g, person)
  if (facts === null) return <PersonHero person={person} />

  const inSection = (section: string): FactData[] => facts.rows.filter((r) => sectionOf(r) === section)
  const traits = inSection('traits')
  const pills = traits.filter((r) => r.state === 'known')
  const lines = [...inSection('facts'), ...traits.filter((r) => r.state !== 'known')]
  const personality = inSection('personality')
  const notes = inSection('notes')
  const connections = connectionsOf(g, person)
  const memories = memoryLines(g, person)

  return (
    <>
      <PersonHero person={person}>
        {pills.length > 0 ? (
          <div className="person-chips">
            {pills.map((r) => (
              <span className="pill" key={r.id}>
                {r.text}
              </span>
            ))}
          </div>
        ) : null}
      </PersonHero>

      <div className="card person-facts">
        {lines.map((r) => (
          <FactRow key={r.id} row={r} />
        ))}
      </div>

      {personality.length > 0 ? (
        <div className="person-section">
          <div className="menu-heading">Personality</div>
          <div className="card person-facts">
            {personality.map((r) => (
              <FactRow key={r.id} row={r} />
            ))}
          </div>
        </div>
      ) : null}

      {connections.length > 0 ? (
        <div className="person-section">
          <div className="menu-heading">How you&apos;re connected</div>
          <div className="card person-facts">
            {connections.map((r) => (
              <FactRow key={r.id} row={r} />
            ))}
          </div>
        </div>
      ) : null}

      {/* rep: reserved for R5 (D.7), draws nothing. */}

      {memories.length > 0 || notes.length > 0 ? (
        <div className="person-section">
          <div className="menu-heading">Shared history</div>
          <div className="card">
            <ul className="person-notes">
              {memories.map((line, i) => (
                <li key={`memory.${i}`}>{line}</li>
              ))}
              {notes.map((r) => (
                <li key={r.id}>{r.text}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  )
}
