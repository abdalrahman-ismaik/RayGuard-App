export const palettes = [
  { id: 'onyx', label: 'Onyx', mode: 'dark', swatches: ['#080b10', '#10151b', '#e6edf4'] },
  { id: 'onyx-light', label: 'Onyx Light', mode: 'light', swatches: ['#e9edf2', '#ffffff', '#202d3b'] },
  { id: 'graphite', label: 'Graphite', mode: 'dark', swatches: ['#101419', '#252e39', '#a4c5ff'] },
  { id: 'midnight', label: 'Midnight', mode: 'dark', swatches: ['#0b1425', '#1e2e49', '#b2b8ff'] },
  { id: 'slate', label: 'Slate', mode: 'dark', swatches: ['#1b232b', '#323f4b', '#a6d4f7'] },
  { id: 'forest', label: 'Forest', mode: 'dark', swatches: ['#101c19', '#263b31', '#a9d5b5'] },
  { id: 'daylight', label: 'Daylight', mode: 'light', swatches: ['#edf1f6', '#ffffff', '#235bc4'] },
  { id: 'pearl', label: 'Pearl', mode: 'light', swatches: ['#eeefec', '#fffefb', '#2d675d'] },
  { id: 'sand', label: 'Sand', mode: 'light', swatches: ['#f0eae0', '#fffaf2', '#865125'] },
  { id: 'lavender', label: 'Lavender', mode: 'light', swatches: ['#efedf7', '#fdfbff', '#6c45a5'] },
] as const

export const fonts = [
  { id: 'instrument-serif', label: 'Instrument Serif', family: '"Instrument Serif", Georgia, serif', character: 'The reference font, throughout' },
  { id: 'barlow', label: 'Barlow', family: '"Barlow", "Segoe UI", sans-serif', character: 'Precise and open' },
  { id: 'geist', label: 'Geist', family: '"Geist", "Segoe UI", sans-serif', character: 'Crisp and balanced' },
  { id: 'inter', label: 'Inter', family: '"Inter", "Segoe UI", sans-serif', character: 'Open and familiar' },
  { id: 'manrope', label: 'Manrope', family: '"Manrope", "Segoe UI", sans-serif', character: 'Rounded and geometric' },
  { id: 'public-sans', label: 'Public Sans', family: '"Public Sans", "Segoe UI", sans-serif', character: 'Direct and understated' },
  { id: 'source-sans', label: 'Source Sans 3', family: '"Source Sans 3", "Segoe UI", sans-serif', character: 'Soft and humanist' },
  { id: 'plex', label: 'IBM Plex Sans', family: '"IBM Plex Sans", "Segoe UI", sans-serif', character: 'Distinctive and technical' },
  { id: 'system', label: 'System', family: '"Segoe UI", system-ui, sans-serif', character: 'Your device’s interface font' },
] as const

export interface Appearance {
  palette: typeof palettes[number]['id']
  font: typeof fonts[number]['id']
}

export const defaultAppearance: Appearance = { palette: 'onyx', font: 'instrument-serif' }
// The user rejected the first appearance set. Keep its key intact, but start
// the selected airport-console direction with its own browser preferences.
export const appearanceKey = 'rayguard-appearance-v2'

export function readAppearance(): Appearance {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(appearanceKey) ?? 'null')
    if (!saved || typeof saved !== 'object') return defaultAppearance
    const value = saved as Record<string, unknown>
    return {
      palette: palettes.find(item => item.id === value.palette)?.id ?? defaultAppearance.palette,
      font: fonts.find(item => item.id === value.font)?.id ?? defaultAppearance.font,
    }
  } catch { return defaultAppearance }
}

export function applyAppearance(appearance: Appearance) {
  const root = document.documentElement
  root.dataset.palette = appearance.palette
  root.dataset.font = appearance.font
  root.dataset.theme = palettes.find(item => item.id === appearance.palette)?.mode ?? 'dark'
  try { localStorage.setItem(appearanceKey, JSON.stringify(appearance)) } catch { /* Preferences still work for this session. */ }
}
