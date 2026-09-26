// Browser workspace choices only. Applying them never starts acquisition or inference.
export type InputSource = 'upload' | 'demo' | 'folder'
export type WorkspaceMode = InputSource | 'review'

export interface WorkspaceLayout {
  adjustments: boolean
  inspector: boolean
  filmstrip: boolean
  width: number
}

export const DEFAULT_LAYOUT: WorkspaceLayout = { adjustments: true, inspector: true, filmstrip: true, width: 300 }

export interface WorkspaceSetup {
  mode: WorkspaceMode
  layout: WorkspaceLayout
  confidence: number
  followLatest: boolean
}
