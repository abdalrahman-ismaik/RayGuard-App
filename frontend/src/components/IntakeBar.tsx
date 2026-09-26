import { FolderInput, LoaderCircle, Pause, Play } from 'lucide-react'
import type { Intake } from '../types'
import { EyeMotion } from './EyeMotion'

interface Props {
  intake: Intake | null
  connected: boolean
  changing: boolean
  active: boolean
  uploading: boolean
  runtimeReady?: boolean
  followLatest: boolean
  newerCount: number
  backgroundActive?: boolean
  motionPaused?: boolean
  onToggle: () => void
  onFollow: (value: boolean) => void
}

const stateLabels: Record<Intake['state'], string> = {
  unconfigured: 'Not configured', paused: 'Paused', waiting: 'Waiting for exports',
  receiving: 'Receiving images', backpressure: 'Queue full · processing backlog', error: 'Intake stopped',
}

export function IntakeBar({ intake, connected, changing, active, uploading, runtimeReady = true, followLatest, newerCount, backgroundActive, motionPaused, onToggle, onFollow }: Props) {
  return <section className="intake-bar" aria-label="Image source and intake">
    <div className="source-summary"><FolderInput size={20} /><div><h2>Folder receiver</h2><p>{intake?.configured ? intake.source_label : 'No export folder configured'}</p></div></div>
    <div className="intake-state"><span className={`source-state ${intake?.enabled ? 'is-active' : ''}`}><span className="status-dot" />{!connected ? 'Service offline' : intake ? stateLabels[intake.state] : 'Checking source'}</span>
      <span>{intake?.pending_count ?? 0} queued <span aria-hidden="true">·</span> {intake?.received_count ?? 0} received</span></div>
    <label className="follow-toggle"><input type="checkbox" checked={followLatest} onChange={(event) => onFollow(event.target.checked)} />Follow latest{!followLatest && newerCount > 0 && <span className="newer-count">{newerCount} new</span>}</label>
    <button type="button" className={intake?.enabled ? 'secondary-button intake-button' : 'primary-button intake-button'}
      disabled={!connected || changing || (!intake?.enabled && (!intake?.configured || uploading || active || !runtimeReady))} onClick={onToggle}>
      {changing ? <LoaderCircle size={16} className="spin" /> : intake?.enabled ? <Pause size={16} /> : <Play size={16} />}
      {changing ? 'Updating intake…' : intake?.enabled ? 'Pause intake' : 'Start intake'}
    </button>
    <p className="source-context">Scanner connection unverified.{intake?.enabled ? <span>New exports run at {Math.round(intake.confidence * 100)}% score threshold.</span> : active ? <span>Intake paused. The current run will finish.</span> : null}</p>
    {connected && !runtimeReady && <p className="intake-error" role="status">Runtime is not ready for intake. <a href="#source">Open Source for setup and verification.</a></p>}
    {connected && backgroundActive && <div className="background-activity" role="status"><EyeMotion paused={motionPaused} /><span>Running local inference · viewing held scan</span></div>}
    <details className="intake-guidance"><summary>Intake guidance</summary><p>{intake?.enabled ? 'Pause to upload manually.' : active ? 'Queued exports wait for intake to resume.' : 'Manual upload available. Start intake before exporting new images.'} Intake does not control scanner hardware.</p></details>
    {intake?.error && <p role={intake.state === 'error' ? 'alert' : 'status'} className="intake-error">{intake.error.message}</p>}
    {intake && intake.issues.length > 0 && <details className="intake-issues"><summary>{intake.issues.length} intake {intake.issues.length === 1 ? 'issue' : 'issues'}</summary><ul>{intake.issues.map((issue) => <li key={issue.id}><strong>{issue.name}</strong> — {issue.message}</li>)}</ul></details>}
  </section>
}
