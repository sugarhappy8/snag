// The confidence chip (R3 H.2): three dots after a number the player is only estimating. A row sets MenuBase.conf (0 to 3);
// the dots fill from the left, and a reading two or more years old adds "as of 2023" (MenuBase.asOf, see nodeConf). The label
// goes to a screen reader in aria-label, so the dots are the only thing drawn for sighted players besides the year.
import type { ReactElement } from 'react'

/** What a screen reader hears for conf 0 to 3. */
export const CONF_LABELS = ['a rough guess', 'a fair estimate', 'a good estimate', 'close to exact'] as const

export interface ConfChipProps {
  /** 0 to 3; anything else draws nothing. */
  conf: 0 | 1 | 2 | 3
  /** The year to print as "as of <year>"; the caller decides it is old enough to be worth saying (nodeConf). */
  asOf?: number | null
}

export function ConfChip({ conf, asOf }: ConfChipProps): ReactElement | null {
  if (typeof conf !== 'number' || !Number.isInteger(conf) || conf < 0 || conf > 3) return null
  const year = typeof asOf === 'number' && Number.isInteger(asOf) ? asOf : null
  const label = `Confidence: ${CONF_LABELS[conf]}${year === null ? '' : `, as of ${year}`}`
  return (
    <span className="conf-chip" role="img" aria-label={label}>
      <i className={conf >= 1 ? 'on' : undefined} />
      <i className={conf >= 2 ? 'on' : undefined} />
      <i className={conf >= 3 ? 'on' : undefined} />
      {year === null ? null : <span className="conf-asof">{`as of ${year}`}</span>}
    </span>
  )
}
