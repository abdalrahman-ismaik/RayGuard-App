import { useState } from 'react'
import { LoaderCircle, Pause, Play, RefreshCw } from 'lucide-react'
import type { DatasetDemo as Demo, DemoAction } from '../types'
import { EyeMotion } from './EyeMotion'

interface Props {
  demo: Demo | null
  connected: boolean
  configuredModel: boolean
  runtimeReady?: boolean
  changing: boolean
  active: boolean
  blocked: boolean
  confidence: number
  followLatest: boolean
  newerCount: number
  backgroundActive?: boolean
  motionPaused?: boolean
  onAction: (value: DemoAction) => void
  onFollow: (value: boolean) => void
  onReconnect: () => void
}

const labels: Record<Demo['state'], string> = {
  unconfigured: 'Not linked', ready: 'Ready', running: 'Running', paused: 'Paused',
  completed: 'Batch completed', error: 'Demo stopped',
}

export function DatasetDemo({ demo, connected, configuredModel, runtimeReady = true, changing, active, blocked, confidence,
  followLatest, newerCount, backgroundActive, motionPaused, onAction, onFollow, onReconnect }: Props) {
  const [count, setCount] = useState(3)
  const [startIndex, setStartIndex] = useState<number | null>(null)
  const start = startIndex ?? (demo?.cursor ?? 0) + 1
  const validStart = Number.isInteger(start) && start >= 1 && start <= (demo?.total ?? 0)
  const paused = demo?.state === 'paused' && demo.completed_count < demo.batch_total
  const enabled = Boolean(demo?.enabled)
  const disabled = !connected || changing || (!enabled && (!demo?.configured || !configuredModel || !runtimeReady || blocked || active))
  const action = enabled ? 'pause' : paused ? 'resume' : 'start'

  return <section className="dataset-demo" aria-label="Dataset replay">
    <div className="demo-action-row">
      <button type="button" className={enabled ? 'secondary-button demo-button' : 'primary-button demo-button'}
        disabled={disabled || (action === 'start' && !validStart)}
        onClick={() => onAction(action === 'start' ? { action, start_index: start - 1, count, confidence: confidence / 100 } : { action })}>
        {changing ? <LoaderCircle size={17} className="spin" /> : enabled ? <Pause size={17} /> : <Play size={16} />}
        {changing ? 'Updating demo…' : enabled ? 'Pause demo' : paused ? 'Resume demo' : 'Start demo'}
      </button>
      <div className="demo-progress" role="status">
        <strong>{!connected ? 'Service offline' : demo ? labels[demo.state] : 'Checking dataset'}</strong>
        <span>{demo?.batch_total ? `${demo.completed_count} / ${demo.batch_total} completed` : `${(demo?.total ?? 0).toLocaleString()} test images`}</span>
      </div>
      <label className="follow-toggle"><input type="checkbox" checked={followLatest} onChange={(event) => onFollow(event.target.checked)} />Follow latest{!followLatest && newerCount > 0 && <span className="newer-count">{newerCount} new</span>}</label>
      {!connected && <button type="button" className="text-button" onClick={onReconnect}><RefreshCw size={15} />Reconnect service</button>}
    </div>
    <p className="demo-context">{demo?.source_label || 'IEDXray published test split'} · Recorded images, fresh model inference.</p>
    {connected && backgroundActive && <div className="background-activity" role="status"><EyeMotion paused={motionPaused} /><span>Running local inference · viewing held scan</span></div>}
    <p className="demo-position">{demo?.current_name ? <span title={demo.current_name}>{active ? 'Processing' : 'Last image'}: {demo.current_name}</span>
      : demo?.next_name ? <span title={demo.next_name}>Next: {demo.next_name}</span> : 'Link the local test images in the app configuration to begin.'}
      {!followLatest && <span>Viewing held scan.</span>}{!enabled && active && <span>Current inference will finish.</span>}</p>
    {demo?.error && <p className="demo-error" role="alert">{demo.error.message}</p>}
    {!configuredModel && connected && <p className="demo-error" role="status">Configure the detector in Source before starting.</p>}
    {configuredModel && connected && !runtimeReady && <p className="demo-error" role="status">Runtime is not ready for replay. <a href="#source">Open Source for setup and verification.</a></p>}
    <details className="replay-settings"><summary>Replay settings</summary>
      <div className="replay-fields"><label>Start at image<input type="number" min="1" max={demo?.total || 1} step="1" value={Number.isNaN(start) ? '' : start}
        disabled={enabled || active || changing || paused} onChange={(event) => setStartIndex(event.target.valueAsNumber)} /></label>
        <label>Images per batch<select value={count} disabled={enabled || active || changing || paused} onChange={(event) => setCount(Number(event.target.value))}>
          {[1, 3, 5, 10, 20].map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <p>{paused ? `Resume the remaining batch at ${Math.round((demo?.confidence ?? 0.25) * 100)}%.` : `Run up to ${count} consecutive images at ${confidence}%.`} {demo?.interval_seconds ?? 0} s between completed runs.</p>
      </div>
      {!validStart && !paused && <p className="demo-error">Choose a start image from 1 to {(demo?.total ?? 0).toLocaleString()}.</p>}
      <p className="control-help">One image at a time; stops at the batch or dataset end. This replay does not connect to scanner hardware or measure model accuracy.</p>
    </details>
  </section>
}
