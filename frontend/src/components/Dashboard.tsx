import {
  Activity, ArrowRight, Cable, ChevronDown, CircleAlert, CircleHelp, Cpu,
  Crosshair, FolderInput, History, Hourglass, ImageUp, Images, Info,
  ScanLine, ScanSearch, Settings2, Unplug,
} from 'lucide-react'
import type { useWorkspace } from '../hooks/useWorkspace'
import type { Run } from '../types'
import { runtimeLabel } from '../runtime'
import type { WorkspaceMode } from '../workspaceSetup'
import '../dashboard.css'

interface Props {
  workspace: ReturnType<typeof useWorkspace>
  onInspect: () => void
  onConfigure: (mode?: WorkspaceMode) => void
  onSession: () => void
  onSource: () => void
  onSelectRun: (run: Run) => void
}

const origin = (value?: string) => value === 'dataset_demo' ? 'Dataset replay' : value === 'folder' ? 'Folder intake' : value === 'upload' ? 'Manual upload' : 'Source not recorded'
const stateLabel = (run: Run, connected: boolean) => run.state === 'running' ? connected ? 'Inference in progress' : 'Run status unavailable while offline' : run.state === 'failed' ? 'Run failed' : run.result?.status === 'ok' ? 'Result available' : 'Result unavailable'
const intakeStates = { unconfigured: 'Not configured', paused: 'Paused', waiting: 'Waiting for images', receiving: 'Receiving images', backpressure: 'Queue full · processing backlog', error: 'Intake needs attention' }

function RunStatus({ run, connected }: { run: Run; connected: boolean }) {
  const Icon = run.state === 'running' ? connected ? Hourglass : Unplug
    : run.state === 'failed' ? CircleAlert : run.result?.status === 'ok' ? ScanSearch : CircleHelp
  return <span className="dashboard-run-status"><Icon size={18} aria-hidden="true" />{stateLabel(run, connected)}</span>
}

export function Dashboard({ workspace: w, onInspect, onConfigure, onSession, onSource, onSelectRun }: Props) {
  const unreviewed = w.runs.filter(run => run.state === 'succeeded' && run.result?.status === 'ok' && (!run.review || run.review.status === 'unreviewed')).length
  const activeRun = w.runs.find(run => run.id === w.activeId)
  const activity = w.connecting ? 'Checking local service…' : !w.connected ? 'Activity unavailable while offline.'
    : w.verifying ? 'Verifying model execution' : w.uploading ? 'Uploading an image.' : w.starting ? 'Starting detection.' : w.activeId ? 'Inference in progress'
      : w.demo?.enabled ? 'Dataset replay is running.' : w.intake?.enabled ? 'Folder receiver is enabled.' : 'Acquisition idle'
  const replayState = !w.connected ? 'Unavailable while offline' : !w.demo?.configured ? 'Not configured'
    : w.demo.state === 'error' ? 'Replay needs attention'
      : w.demo.batch_total > 0 ? `Batch ${w.demo.enabled ? 'running' : w.demo.state} · ${w.demo.completed_count}/${w.demo.batch_total} processed` : 'Replay not started'
  const sources = [
    { Icon: FolderInput, mode: 'folder', label: 'Folder receiver', detail: 'Image exports' },
    { Icon: ImageUp, mode: 'upload', label: 'Upload a scan', detail: 'Local image' },
    { Icon: Images, mode: 'demo', label: 'Dataset replay', detail: 'IEDXray test split' },
  ] as const
  return <div className="dashboard-home">
    <header className="dashboard-heading"><h1>Your inspection,<span> in focus.</span></h1></header>

    <section className="dashboard-shortcuts" aria-label="Inspection actions">
      {sources.map(({ Icon, mode, label, detail }) => <button type="button" key={mode} onClick={() => onConfigure(mode)}>
        <Icon size={27} strokeWidth={1.6} aria-hidden="true" /><span><strong>{label}</strong><small>{detail}</small></span>
      </button>)}
      <button type="button" onClick={onSession}><History size={27} strokeWidth={1.6} aria-hidden="true" /><span><strong>Review saved runs</strong><small>Results &amp; notes</small></span></button>
    </section>

    <div className="dashboard-overview">
      <section className="dashboard-current" aria-labelledby="current-inspection-title">
        <div className="dashboard-section-label"><span><ScanLine size={18} aria-hidden="true" />Current scan</span><span>{w.scan ? origin(w.scan.origin) : 'Local workspace'}</span></div>
        <h2 id="current-inspection-title" title={w.scan?.name}>{w.scan ? w.scan.name : 'Choose your first scan'}</h2>
        <div className="dashboard-current-content">
          {w.scan ? <figure className="dashboard-scan-preview"><img src={w.scan.image_url} alt={`Selected X-ray: ${w.scan.name}`} /><figcaption>Original · {w.scan.width} × {w.scan.height}</figcaption></figure>
            : <div className="dashboard-empty-preview" aria-hidden="true"><ScanLine size={52} strokeWidth={1} /></div>}
          <div className="dashboard-current-copy">
            {w.run ? <RunStatus run={w.run} connected={w.connected} /> : <p>{w.scan ? 'Detection not run' : 'Choose an image source to begin.'}</p>}
            {w.run?.state === 'succeeded' && <p className="dashboard-evidence-note">{w.run.result?.status === 'ok'
              ? <><Crosshair size={18} aria-hidden="true" /><span>{w.run.result.detections.length} regions reported<br /><small>{Math.round(w.run.confidence * 100)}% threshold</small></span></>
              : 'No valid result attached. Inspect the run record.'}</p>}
            {w.run?.state === 'failed' && <p className="dashboard-evidence-note">Open the run for error details.</p>}
          </div>
        </div>
        <div className="dashboard-primary-actions"><button type="button" className="primary-button" onClick={w.scan ? onInspect : () => onConfigure()}>
          {w.scan ? <ScanSearch size={19} aria-hidden="true" /> : <Settings2 size={19} aria-hidden="true" />}{w.scan ? 'Continue inspection' : 'Set up an inspection'}<ArrowRight size={17} aria-hidden="true" />
        </button></div>
        <p className="dashboard-safety-note"><CircleAlert size={16} aria-hidden="true" />Research output · no safety decision</p>
      </section>

      <section className="dashboard-acquisition" aria-labelledby="dashboard-activity-title">
        <h2 id="dashboard-activity-title"><Activity size={22} aria-hidden="true" />Acquisition activity</h2>
        <div className="dashboard-live-summary">
          <p>{activity}</p>
          {w.connected && w.activeId && <p className="dashboard-active-scan">{activeRun ? activeRun.scan.name : 'Loading active run details…'}</p>}
          {w.connected && w.activeId && w.run && w.activeId !== w.run.id && <p className="dashboard-activity-note">A different scan is open for review.</p>}
        </div>
        <dl className="dashboard-details">
          <div><dt><Images size={19} aria-hidden="true" />Dataset replay</dt><dd>{replayState}{w.connected && w.demo?.state === 'error' && w.demo.batch_total > 0 && <small>{w.demo.completed_count}/{w.demo.batch_total} processed</small>}</dd></div>
          <div><dt><FolderInput size={19} aria-hidden="true" />Folder receiver</dt><dd>{!w.connected ? 'Unavailable while offline' : w.intake ? intakeStates[w.intake.state] : 'Status unavailable'}
            {w.connected && !!w.intake?.pending_count && <small>{w.intake.pending_count} images queued</small>}
          </dd></div>
        </dl>
        <div className="dashboard-acquisition-actions">
          <button type="button" className="secondary-button" onClick={() => onConfigure()}><Settings2 size={17} aria-hidden="true" />Configure workspace</button>
          {(w.busy || w.demo?.batch_total || w.intake?.state === 'error' || w.demo?.state === 'error') ? <button type="button" className="text-button" onClick={onInspect}>View acquisition controls<ArrowRight size={15} aria-hidden="true" /></button> : null}
        </div>
      </section>
    </div>

    <div className="dashboard-context">
      <section className="dashboard-recent" aria-labelledby="recent-scans-title">
        <div className="dashboard-section-heading"><div><h2 id="recent-scans-title"><History size={22} aria-hidden="true" />Recent runs</h2><p>{w.runs.length} loaded · {unreviewed} results awaiting review</p></div><button type="button" className="text-button" onClick={onSession}>View session<ArrowRight size={15} aria-hidden="true" /></button></div>
        {w.runs.length ? <ul>{w.runs.slice(0, 3).map(run => <li key={run.id}><button type="button" disabled={w.uploading || w.starting} onClick={() => onSelectRun(run)}>
          <img src={run.scan.image_url} alt="" /><span className="dashboard-run-name"><strong>{run.scan.name}</strong><small>{origin(run.scan.origin)}</small></span>
          <span className="dashboard-run-state"><RunStatus run={run} connected={w.connected} /><small>{run.review?.status === 'follow_up' ? 'Follow-up flagged' : run.review?.status === 'reviewed' ? 'Reviewed' : 'Unreviewed'}</small></span><ArrowRight size={16} aria-hidden="true" />
        </button></li>)}</ul> : <p className="dashboard-empty-session">Your first run will appear here.</p>}
      </section>

      <section className="dashboard-readiness" aria-labelledby="dashboard-source-title">
        <div className="dashboard-section-heading"><h2 id="dashboard-source-title"><Cable size={22} aria-hidden="true" />Source configuration</h2></div>
        <dl className="dashboard-details">
          <div><dt><Cpu size={19} aria-hidden="true" />Detector</dt><dd>{w.connecting ? 'Checking local service…' : !w.connected ? 'Service offline' : w.health?.model.configured ? w.health.model.label : 'Setup required'}
            {w.connected && w.health?.runtime && <small>{runtimeLabel(w.health.runtime)}</small>}</dd></div>
          <div><dt><Images size={19} aria-hidden="true" />Test dataset</dt><dd>{!w.connected ? 'Unavailable while offline' : w.demo?.configured ? `${w.demo.total.toLocaleString()} test images available` : 'Not configured'}</dd></div>
        </dl>
        <details className="dashboard-disclosure">
          <summary>Source details<ChevronDown size={16} aria-hidden="true" /></summary>
          <div className="dashboard-disclosure-content"><dl className="dashboard-details"><div><dt><FolderInput size={19} aria-hidden="true" />Folder source</dt><dd>{!w.connected ? 'Unavailable while offline' : w.intake?.configured ? w.intake.source_label : 'Not configured'}</dd></div></dl>
            <p>Dataset: IEDXray published test split. Configuration is not inference validation.</p>
          </div>
        </details>
        <p className="dashboard-safety-note"><Unplug size={16} aria-hidden="true" />Scanner connection unverified.</p>
        <button type="button" className="text-button" onClick={onSource}>Source &amp; detector settings<ArrowRight size={15} aria-hidden="true" /></button>
      </section>
    </div>

    <details className="dashboard-disclosure dashboard-notes">
      <summary><Info size={17} aria-hidden="true" />Workspace notes<ChevronDown size={16} aria-hidden="true" /></summary>
      <div className="dashboard-disclosure-content"><ul>
        <li>Start acquisition explicitly from the inspection controls.</li>
        <li>Your scan view and unsaved review stay in this tab when changing pages.</li>
        <li>Session records clear when the local service restarts. Export records you need to keep.</li>
      </ul></div>
    </details>
  </div>
}
