// Purple talent hints (talents.ts): the 🔮 line a Business, Investing... talent adds under a
// menu row (MenuBase.hint), a popup choice (ChoiceOption.hint) or the Annual Report's plan
// (AnnualReportData.talentHint). One look everywhere so players learn to spot them.
import { HINT_EMOJI } from '../../game/talents'
import { cleanHint } from './menuModel'

export { cleanHint, HINT_MAX } from './menuModel'

export interface TalentHintProps {
  /** Raw hint (may start with 🔮); nothing renders when it's empty. */
  text: unknown
  className?: string
}

/** The purple 🔮 hint line. Screen readers hear "Talent hint:" before the text. */
export function TalentHint({ text, className }: TalentHintProps) {
  const clean = cleanHint(text)
  if (!clean) return null
  return (
    <span className={className ? `talent-hint ${className}` : 'talent-hint'}>
      <span className="talent-hint-icon" aria-hidden="true">
        {HINT_EMOJI}
      </span>
      <span className="talent-hint-text">
        <span className="sr-only">Talent hint: </span>
        {clean}
      </span>
    </span>
  )
}
