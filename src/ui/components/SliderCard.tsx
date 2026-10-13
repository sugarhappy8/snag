// A queued slider prompt (InputModal input 'slider'): the popup ModalHost shows instead of a
// number field. It must be answered (no Cancel); the script gets the value as a string, money in
// internal dollars, exactly like a number field would hand it over.
import { useState } from 'react'
import type { InputModal } from '../../game/types'
import { submitInput, useApp } from '../store'
import { foundingSliderPreview } from '../../game/business/founding'
import { PopupFrame } from './Dialogs'
import { sliderOutput, sliderStart } from './menuModel'
import { SliderField, useSliderScale } from './Slider'

export function SliderInputCard({ modal }: { modal: InputModal }) {
  const game = useApp(s => s.game)
  const min = modal.min ?? 0
  const max = modal.max ?? min
  const money = modal.money === true
  const s = useSliderScale(min, max, modal.step, money)
  const [value, setValue] = useState(() => sliderStart(s, modal.defaultValue))
  const submit = () => submitInput(modal.id, sliderOutput(s, value, money))
  return (
    <PopupFrame label={modal.title}>
      {modal.emoji ? (
        <span className="popup-emoji" aria-hidden>
          {modal.emoji}
        </span>
      ) : null}
      <h2 className="popup-title">{modal.title}</h2>
      {modal.text ? <p className="popup-text">{modal.text}</p> : null}
      <div className="popup-field">
        <SliderField label={modal.title} min={min} max={max} step={modal.step} money={money} value={value} onChange={setValue} onSubmit={submit} preview={game ? foundingSliderPreview(game, modal.scriptId, modal.data) : undefined} autoFocus />
      </div>
      <div className="popup-actions">
        <button className="btn btn-primary btn-block" onClick={submit}>
          Confirm
        </button>
      </div>
    </PopupFrame>
  )
}
