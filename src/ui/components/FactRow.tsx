// One line of a person's profile (R4-U4, H.7): a row of personFacts (src/game/hubs/people-facts.ts) on two lines. The first has the label with its
// emoji and, to the right, what the player may read: the text of a fact, the words of an estimate or "Private." for a purse that is not
// theirs to see. The second has the confidence chip of an estimate (three dots, and "as of 2023" for an old reading) or the reason a fact is unknown.
//
// An unknown row says so in a word ("Unknown") as well as in a muted text, and an estimate carries its chip, whose words go to a screen reader in
// aria-label: no state is told by colour alone. The Relationship row is the one bar (your own feeling, a StatBar in the old bar grid); every other row
// is plain text and does not use that grid, because its auto value column squeezes the track on a word such as "outstanding" at 360 px.
//
// Total: a chip that is not 0 to 3 draws nothing, a bar that is not a finite number draws the row as text, and the text is a React child, so a row
// can never put markup on the page. Pure: it reads the row and nothing else. Only PersonProfile.tsx imports this file, so it is in the lazy chunk
// (test/lazy-zones.test.ts); the type of a row comes in with `import type`.
import type { ReactElement } from 'react'
import type { FactRow as FactData } from '../../game/hubs/people-facts'
import { ConfChip } from './ConfChip'
import { StatBar } from './StatBar'

export interface FactRowProps {
  row: FactData
}

/** True for a confidence the chip can draw: a whole number from 0 to 3. */
const chipFits = (conf: unknown): conf is 0 | 1 | 2 | 3 => typeof conf === 'number' && Number.isInteger(conf) && conf >= 0 && conf <= 3

export function FactRow({ row }: FactRowProps): ReactElement {
  const how = row.how ? <span className="fact-how">{row.how}</span> : null

  if (typeof row.bar === 'number' && Number.isFinite(row.bar)) {
    return (
      <div className="fact-row fact-bar">
        <div className="person-bars">
          <StatBar label={row.label} emoji={row.emoji} value={row.bar} />
        </div>
        {how}
      </div>
    )
  }

  const chip = row.state === 'estimate' && chipFits(row.conf) ? <ConfChip conf={row.conf} asOf={row.asOf} /> : null
  return (
    <div className={`fact-row fact-${row.state}`}>
      <div className="fact-line">
        <span className="fact-label">
          <span aria-hidden>{row.emoji}</span> {row.label}
          {row.state === 'unknown' ? <span className="fact-state">Unknown</span> : null}
        </span>
        <span className="fact-text">{row.text}</span>
      </div>
      {chip || how ? (
        <div className="fact-meta">
          {chip}
          {how}
        </div>
      ) : null}
    </div>
  )
}
