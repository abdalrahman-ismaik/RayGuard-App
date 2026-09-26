import { useId } from 'react'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'

export interface ViewAdjustmentValues {
  brightness: number
  contrast: number
  grayscale: boolean
  inverted: boolean
}

export const DEFAULT_VIEW_ADJUSTMENTS: ViewAdjustmentValues = {
  brightness: 100,
  contrast: 100,
  grayscale: false,
  inverted: false,
}

interface Props {
  value: ViewAdjustmentValues
  onChange: (next: ViewAdjustmentValues) => void
  disabled: boolean
  onInspect: () => void
  targetLabel?: string
}

export function ViewAdjustments({ value, onChange, disabled, onInspect, targetLabel = 'Display only' }: Props) {
  const id = useId()
  const inspect = () => { if (!disabled) onInspect() }
  const update = (next: ViewAdjustmentValues) => {
    if (disabled) return
    onInspect()
    onChange(next)
  }

  return <section className="view-adjustments-panel" aria-labelledby={`${id}-heading`}>
    <div className="adjustments-heading"><SlidersHorizontal size={17} aria-hidden="true" /><h2 id={`${id}-heading`}>Image adjustments</h2></div>
    <p>{targetLabel}</p>
    <fieldset className="adjustment-controls" disabled={disabled} aria-labelledby={`${id}-heading`}
      onPointerDownCapture={inspect} onKeyDownCapture={inspect}>
      <div className="adjustment-range">
        <label htmlFor={`${id}-brightness`}>Brightness <output>{value.brightness}%</output></label>
        <input id={`${id}-brightness`} type="range" min="50" max="200" value={value.brightness}
          aria-valuetext={`${value.brightness}%`} onChange={(event) => update({ ...value, brightness: Number(event.target.value) })} />
      </div>
      <div className="adjustment-range">
        <label htmlFor={`${id}-contrast`}>Contrast <output>{value.contrast}%</output></label>
        <input id={`${id}-contrast`} type="range" min="50" max="200" value={value.contrast}
          aria-valuetext={`${value.contrast}%`} onChange={(event) => update({ ...value, contrast: Number(event.target.value) })} />
      </div>
      <div className="adjustment-buttons">
        <button type="button" aria-pressed={value.grayscale} onClick={() => update({ ...value, grayscale: !value.grayscale })}>Grayscale</button>
        <button type="button" aria-pressed={value.inverted} onClick={() => update({ ...value, inverted: !value.inverted })}>Invert display</button>
        <button type="button" onClick={() => update({ ...DEFAULT_VIEW_ADJUSTMENTS })}><RotateCcw size={14} aria-hidden="true" />Reset image display</button>
      </div>
    </fieldset>
    <details className="adjustment-help"><summary>About image adjustments</summary><p>These are visual adjustments, not material discrimination. Source pixels, saved boxes and model input stay unchanged.</p></details>
  </section>
}
