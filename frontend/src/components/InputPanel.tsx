import { useRef, useState } from 'react'
import { ArrowUpFromLine, Cpu, LoaderCircle, Play, RefreshCw } from 'lucide-react'
import type { Health, Scan } from '../types'
import { runtimeLabel, runtimeReady } from '../runtime'
import { ModelClasses } from './ModelClasses'

interface Props {
  health: Health | null
  connected: boolean
  connecting: boolean
  scan: Scan | null
  busy: boolean
  uploading: boolean
  processing: boolean
  receiving: boolean
  hasResult: boolean
  confidence: number
  onConfidence: (value: number) => void
  onUpload: (file: File) => void
  onRun: () => void
  onReconnect: () => void
}

export function InputPanel(props: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const { health, connected, connecting, scan, busy, uploading, processing } = props
  const available = connected && runtimeReady(health)
  const uploadDisabled = busy || !connected

  return <section className="scan-actions" aria-label="Choose scan and run detection">
    <input ref={input} type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" aria-label="Upload X-ray image"
      className="visually-hidden" tabIndex={-1} disabled={uploadDisabled} onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) props.onUpload(file)
        event.target.value = ''
      }} />
    <button type="button" className={`${scan || props.receiving ? 'secondary-button' : 'primary-button'} scan-upload ${dragging ? 'is-dragging' : ''}`}
      disabled={uploadDisabled} onClick={() => input.current?.click()}
      onDragOver={(event) => { event.preventDefault(); if (!uploadDisabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)} onDrop={(event) => {
        event.preventDefault(); setDragging(false)
        if (!uploadDisabled && event.dataTransfer.files[0]) props.onUpload(event.dataTransfer.files[0])
      }}>
      {uploading ? <LoaderCircle className="spin" size={18} /> : <ArrowUpFromLine size={18} />}
      {uploading ? 'Preparing image…' : scan ? 'Replace scan' : 'Choose a scan'}
    </button>
    <p className="scan-action-context">{scan ? <span title={scan.name}>{scan.name}</span> : props.receiving ? 'New exports are processed automatically.' : 'PNG or JPEG · choose a file or drop it on the button'}</p>
    {scan && <button type="button" className={`${props.hasResult || props.receiving ? 'secondary-button' : 'primary-button'} run-button`}
      disabled={busy || !available} onClick={props.onRun}>
      {processing ? <LoaderCircle size={17} className="spin" /> : <Play size={16} fill="currentColor" />}
      {processing ? 'Running inference…' : 'Run inference'}
    </button>}
    {!connected && <button className="text-button reconnect" onClick={props.onReconnect} disabled={connecting}>
      <RefreshCw size={15} className={connecting ? 'spin' : ''} />{connecting ? 'Connecting…' : 'Reconnect service'}
    </button>}
    {connected && health && !health.model.configured && <p className="action-notice" role="status">Model configuration required before detection. Open Source for detector settings.</p>}
    {connected && health?.model.configured && health.runtime && !runtimeReady(health) && <p className="action-notice" role="status">{runtimeLabel(health.runtime)}. <a href="#source">Open Source for runtime verification.</a></p>}
  </section>
}

export function DetectorSettings(props: Pick<Props, 'health' | 'connected' | 'connecting' | 'confidence' | 'busy' | 'onConfidence'>) {
  const { health, connected, connecting } = props
  const available = connected && runtimeReady(health)
  return <section className="detector-settings" aria-label="Detector settings">
    <h2>Detector</h2>
    <p className="model-name"><Cpu size={18} /><strong>{health?.model.label || 'Local detector'}</strong></p>
    {health?.model.classes && <ModelClasses classes={health.model.classes} task={health.model.task} />}
    <p className="control-help"><a href="#main-menu">Choose a model in Workspace setup</a></p>
    <p className={`model-status ${available ? 'is-ready' : ''}`}><span className="status-dot" />{connecting ? 'Checking configuration' : !connected ? 'Service unavailable' : health?.runtime ? runtimeLabel(health.runtime) : available ? 'Configured · local execution' : 'Configuration required'}</p>
    {connected && health && !health.model.configured && <p className="configuration-note">{health.model.reason || 'Configure the local model before running inference.'}</p>}
    <div className="threshold-heading"><label htmlFor="confidence">Score threshold</label><output htmlFor="confidence">{props.confidence}%</output></div>
    <input id="confidence" type="range" min="1" max="100" step="1" value={props.confidence} disabled={props.busy}
      aria-describedby="threshold-help" onChange={(event) => props.onConfidence(Number(event.target.value))} />
    <p id="threshold-help" className="control-help">Applies to the next run. Scores are not calibrated probabilities.</p>
    <p className="configuration-note">Manual upload: PNG/JPEG{health ? ` · ${Math.round(health.limits.max_upload_bytes / 1024 / 1024)} MB maximum` : ''}.</p>
  </section>
}
