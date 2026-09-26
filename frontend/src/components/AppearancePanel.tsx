import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Check, Moon, Palette, RotateCcw, Sun, X } from 'lucide-react'
import { applyAppearance, defaultAppearance, fonts, palettes, readAppearance } from '../appearance'
import '../appearance.css'

export function AppearancePanel() {
  const [appearance, setAppearance] = useState(readAppearance)
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLDetailsElement>(null)
  const id = useId()
  const selectedPalette = palettes.find(item => item.id === appearance.palette) ?? palettes[0]
  const selectedFont = fonts.find(item => item.id === appearance.font) ?? fonts[0]

  useLayoutEffect(() => { applyAppearance(appearance) }, [appearance])

  function close(returnFocus = false) {
    if (!menu.current) return
    menu.current.open = false
    if (returnFocus) menu.current.querySelector('summary')?.focus()
  }

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) close()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(true) }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const dark = selectedPalette.mode === 'dark'

  return <>
    <button type="button" className="theme-toggle" aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
      title={dark ? 'Use Onyx Light' : 'Use Onyx'}
      onClick={() => setAppearance(value => ({ ...value, palette: dark ? 'onyx-light' : 'onyx' }))}>
      {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}<span>{dark ? 'Light mode' : 'Dark mode'}</span>
    </button>
    <details className="appearance-menu" ref={menu} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary aria-label="Appearance"><Palette size={17} /><span>Appearance</span></summary>
    {open && <section className="appearance-panel" aria-labelledby={`${id}-title`}>
      <div className="appearance-heading"><div><h2 id={`${id}-title`}>Display preferences</h2><p>{selectedPalette.label} · {selectedFont.label}</p></div>
        <button type="button" className="appearance-close" aria-label="Close appearance" onClick={() => close(true)}><X size={18} /></button>
      </div>
      <fieldset className="appearance-palettes"><legend>Color palette</legend><p className="appearance-hint">Onyx in dark or light, plus earlier comparisons.</p>
        <div className="appearance-palette-grid">{palettes.map(palette => <label className="appearance-palette" key={palette.id}>
          <input type="radio" name={`${id}-palette`} aria-label={palette.label} value={palette.id} checked={appearance.palette === palette.id}
            onChange={() => setAppearance(value => ({ ...value, palette: palette.id }))} />
          <span className="appearance-swatches" aria-hidden="true">{palette.swatches.map(color => <span key={color} style={{ backgroundColor: color }} />)}</span>
          <span className="appearance-choice-name">{palette.label}{appearance.palette === palette.id && <Check size={12} aria-hidden="true" />}</span>
        </label>)}</div>
      </fieldset>
      <fieldset className="appearance-fonts"><legend>Interface font</legend><p className="appearance-hint">Preview each typeface. Colors stay the same.</p>
        <div className="appearance-font-grid">{fonts.map(font => <label className="appearance-font" key={font.id} style={{ fontFamily: font.family }}>
          <input type="radio" name={`${id}-font`} aria-label={font.label} value={font.id} checked={appearance.font === font.id}
            onChange={() => setAppearance(value => ({ ...value, font: font.id }))} />
          <span className="appearance-font-name">{font.label}{appearance.font === font.id && <Check size={14} aria-hidden="true" />}</span>
          <span className="appearance-font-sample" aria-hidden="true">Scan 024 · Aa 0O 1l</span>
          <span className="appearance-font-character">{font.character}</span>
        </label>)}</div>
      </fieldset>
      <div className="appearance-footer"><p>Changes apply immediately.<br />Scan pixels stay unchanged.</p>
        <button type="button" onClick={() => setAppearance({ ...defaultAppearance })}><RotateCcw size={14} />Reset appearance</button>
      </div>
    </section>}
    </details>
  </>
}
