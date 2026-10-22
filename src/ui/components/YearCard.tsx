// The year card (R3-Q6, E.D3): the one popup that closes a year, and the same card drawn inline in the Life tab once
// the popup has been shown ten times. Both read a CardView (yearCardModel.ts), which cleans whatever was saved; nothing
// here writes the game. The categories are native details and summary, so they open and close from the keyboard with
// no script, and a closed group still names its count.
import { useEffect, type ReactElement } from 'react'
import type { NoticeModal } from '../../game/types'
import { dismissNotice } from '../store'
import { PopupFrame } from './Dialogs'
import { focusWithoutScroll } from './focusWithoutScroll'
import { cardLabel, cardOfModal, cardWhen, enterDismisses, groupMore, type CardView } from './yearCardModel'
import '../styles/notices.css'

/** The emoji of the popup when the notice brings none that can be trusted: a short string. */
const CARD_EMOJI = '📋'
const EMOJI_MAX = 8

function emojiOf(modal: NoticeModal): string {
  const e: unknown = modal.emoji
  return typeof e === 'string' && e.length > 0 && e.length <= EMOJI_MAX ? e : CARD_EMOJI
}

function Line({ glyph, text }: { glyph?: string; text: string }): ReactElement {
  return (
    <li className={glyph ? 'year-card-line has-glyph' : 'year-card-line'}>
      {glyph ? (
        <span className="year-card-glyph" aria-hidden>
          {glyph}
        </span>
      ) : null}
      {text}
    </li>
  )
}

/** The lines of the year, then its categories folded under their counts. Shared by the popup and the inline card. */
function CardBody({ card }: { card: CardView }): ReactElement {
  const hasLines = card.stories.length + card.people.length > 0 || card.money !== '' || card.world !== ''
  return (
    <>
      {hasLines ? (
        <ul className="year-card-lines">
          {card.stories.map((s, i) => (
            <Line key={`s${i}`} text={s} />
          ))}
          {card.money !== '' ? <Line glyph="💰" text={card.money} /> : null}
          {card.people.map((p, i) => (
            <Line key={`p${i}`} glyph="👥" text={p} />
          ))}
          {card.world !== '' ? <Line glyph="🌍" text={card.world} /> : null}
        </ul>
      ) : null}
      {card.groups.length > 0 ? (
        <div className="year-card-groups">
          {card.groups.map((g) => (
            <details key={g.k} className="year-card-group">
              <summary>
                <span className="year-card-label">{g.label}</span> <span className="year-card-count">{g.n}</span>
              </summary>
              <ul className="year-card-group-lines">
                {g.lines.map((line, i) => (
                  <li key={i} className="year-card-group-line">
                    {line}
                  </li>
                ))}
                {groupMore(g) > 0 ? <li className="year-card-more">{`and ${groupMore(g)} more`}</li> : null}
              </ul>
            </details>
          ))}
        </div>
      ) : null}
    </>
  )
}

/**
 * The year card as a popup: one OK, and the notice leaves the queue like any other. Enter works as it does on a notice,
 * except on a group row, where Enter opens and closes the group. Draws nothing for a notice with no readable card
 * (ModalHost never mounts it that way: planHead gives such a notice its own plain card).
 */
export function YearCardPopup({ modal }: { modal: NoticeModal }): ReactElement | null {
  const card = cardOfModal(modal)
  const id = modal.id

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as { tagName?: unknown; isContentEditable?: unknown } | null
      const tag = t !== null && typeof t.tagName === 'string' ? t.tagName.toUpperCase() : ''
      if (!enterDismisses(e.key, e.repeat, tag, t?.isContentEditable === true)) return
      e.preventDefault()
      dismissNotice(id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id])

  if (card === null) return null
  return (
    <PopupFrame className="year-card" label={cardLabel(card)}>
      <span className="popup-emoji" aria-hidden>
        {emojiOf(modal)}
      </span>
      <h2 className="popup-title">{card.head}</h2>
      <p className="year-card-when">{cardWhen(card)}</p>
      <CardBody card={card} />
      <div className="popup-actions">
        {/* Focused without scrolling: a tall card must open at its heading, with the first lines in view. */}
        <button ref={focusWithoutScroll} className="btn btn-primary btn-block" onClick={() => dismissNotice(id)}>
          OK
        </button>
      </div>
    </PopupFrame>
  )
}

/**
 * The year card in the Life tab, for a year whose popup has been shown ten times already. No OK: it is part of the page,
 * and it goes when the next year starts. Draws nothing without a card.
 */
export function YearCardInline({ card }: { card: CardView | null }): ReactElement | null {
  if (card === null) return null
  return (
    <section className="year-card is-inline" aria-label={cardLabel(card)}>
      <h3 className="year-card-head">{card.head}</h3>
      <p className="year-card-when">{cardWhen(card)}</p>
      <CardBody card={card} />
    </section>
  )
}
