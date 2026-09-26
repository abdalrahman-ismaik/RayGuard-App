import { useId, useState, type FormEvent } from 'react'
import { ArrowRight, CircleAlert, FolderInput, History, Images, Upload } from 'lucide-react'
import type { DatasetDemo, Health, Intake, RuntimeDeviceAction } from '../types'
import { RuntimeDeviceSelector } from './RuntimeDeviceSelector'
import { runtimeLabel, runtimeReady } from '../runtime'
import { DEFAULT_LAYOUT, type WorkspaceMode, type WorkspaceSetup } from '../workspaceSetup'
import '../main-menu.css'

interface Props {
  initial: WorkspaceSetup
  health: Health | null
  intake: Intake | null
  demo: DatasetDemo | null
  connected: boolean
  connecting: boolean
  busy: boolean
  verifying?: boolean
  changingRuntime: boolean
  deviceAction: RuntimeDeviceAction
  onDevice: (device: string, restart: boolean, modelId?: string) => void
  runsCount: number
  canResume: boolean
  onOpen: (setup: WorkspaceSetup) => void
  onResume: () => void
  onSettings: () => void
  onReconnect: () => void
}

const workflows = [
  { mode: 'upload', label: 'Upload a scan', description: 'Choose an image, then run the detector.', Icon: Upload },
  { mode: 'demo', label: 'Dataset replay', description: 'Inspect recorded test images in a finite batch.', Icon: Images },
  { mode: 'folder', label: 'Folder receiver', description: 'Receive completed image exports from a folder.', Icon: FolderInput },
  { mode: 'review', label: 'Review saved runs', description: 'Browse existing results, notes and provenance.', Icon: History },
] as const

export function MainMenu({ initial, health, intake, demo, connected, connecting, busy, verifying = false, changingRuntime, deviceAction, onDevice, runsCount, canResume,
  onOpen, onResume, onSettings, onReconnect }: Props) {
  const [draft, setDraft] = useState<WorkspaceSetup>(() => ({ ...initial, layout: { ...initial.layout } }))
  const id = useId()
  const review = draft.mode === 'review'
  const current = workflows.find(item => item.mode === draft.mode)!
  const analyst = draft.layout.adjustments && draft.layout.inspector && draft.layout.filmstrip
  const focused = !draft.layout.adjustments && draft.layout.inspector && !draft.layout.filmstrip
  const layoutName = analyst ? 'Analyst Studio' : focused ? 'Focused review' : 'Custom panels'
  const modelStatus = connecting ? 'Checking local service' : !connected ? 'Local service offline'
    : health?.runtime ? runtimeLabel(health.runtime) : health?.model.configured ? 'Configured for local execution' : 'Detector setup required'
  const sourceMissing = draft.mode === 'demo' ? !connected || !demo?.configured
    : draft.mode === 'folder' ? !connected || !intake?.configured : false
  const disabled = connecting || (!review && (busy || sourceMissing))
  const sourceStatus = (mode: WorkspaceMode) => {
    if (mode === 'review') return `${runsCount} ${runsCount === 1 ? 'run' : 'runs'} loaded`
    if (mode === 'upload') return 'PNG / JPEG'
    if (connecting) return 'Checking source'
    if (!connected) return 'Service offline'
    return mode === 'demo' ? demo?.configured ? `${demo.total.toLocaleString()} test images` : 'Not configured'
      : intake?.configured ? 'Export folder configured' : 'Not configured'
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!disabled) onOpen({ ...draft, layout: { ...draft.layout } })
  }

  return <form className="menu-setup" onSubmit={submit} aria-labelledby={`${id}-title`}>
    <header className="menu-heading"><h1 id={`${id}-title`}>Set up your workspace</h1>
      <p>Choose a workflow and arrange your inspection tools.</p>
    </header>
    {busy && <div className="menu-busy" role="status"><CircleAlert size={18} aria-hidden="true" /><p>{changingRuntime
      ? 'Changing the runtime. Check Inference device below for progress. Ordinary inference waits for the service to return.' : verifying
      ? 'Model verification is active. Open Source settings for progress. Ordinary inference waits for the check to finish. Saved-run review remains available.'
      : 'Acquisition or inference is active. Return to the workspace for progress and intake or replay pause controls. The current inference will finish. Saved-run review remains available.'}</p></div>}
    <div className="menu-workbench">
      <fieldset className="menu-workflows"><legend>Workflow</legend>
        {workflows.map(({ mode, label, description, Icon }) => <label className={`menu-workflow ${draft.mode === mode ? 'is-selected' : ''}`} key={mode}>
          <input type="radio" name={`${id}-workflow`} aria-label={label} aria-describedby={`${id}-${mode}-description`} value={mode} checked={draft.mode === mode}
            disabled={busy && mode !== 'review'} onChange={() => setDraft(value => ({ ...value, mode }))} />
          <Icon size={20} aria-hidden="true" /><span className="menu-workflow-copy"><strong>{label}</strong><span id={`${id}-${mode}-description`}>{description}</span><small>{sourceStatus(mode)}</small></span>
        </label>)}
      </fieldset>
      <section className="menu-options" aria-labelledby={`${id}-options`} tabIndex={0}>
        <div className="menu-context"><h2 id={`${id}-options`}>{current.label}</h2>
          <p>{draft.mode === 'upload' ? 'Open the inspection view, then choose a local PNG or JPEG. The image stays on the local service.'
            : draft.mode === 'demo' ? 'Use the published IEDXray test split with fresh model inference. Start or resume replay from its controls in the workspace.'
              : draft.mode === 'folder' ? 'Process completed image exports from the configured folder. Intake starts only when you press Start intake. Scanner connection is unverified.'
                : runsCount ? 'Open Session to search loaded runs and inspect their recorded settings. Opening a record does not run the detector.'
                  : 'No saved runs are loaded. You can open the empty Session view or choose an image source to begin.'}</p>
        </div>
        <dl className="menu-readiness">
          {!review && <><dt>Detector</dt><dd>{connected && health ? health.model.label : 'Local detector'}<span>{modelStatus}</span></dd></>}
          {(draft.mode === 'demo' || draft.mode === 'folder') && <><dt>Source</dt><dd>{draft.mode === 'demo' ? demo?.source_label || 'IEDXray published test split' : intake?.source_label || 'Export folder'}<span>{sourceStatus(draft.mode)}</span></dd></>}
          {review && <><dt>Session</dt><dd>{runsCount} loaded {runsCount === 1 ? 'run' : 'runs'}<span>{connecting ? 'Checking local service' : connected ? 'Local service connected' : 'Local service offline'}</span></dd></>}
        </dl>
        {!review && (!connected || !runtimeReady(health)) && <p className="menu-notice">{!connected ? 'Reconnect the local service to load sources and run detection.' : 'The workspace can open now. Complete detector setup and verification in Source before running inference.'}</p>}
        {!review && sourceMissing && !connecting && <p className="menu-notice">{draft.mode === 'demo' ? 'Dataset replay needs a configured local test-image folder.' : 'Folder receiver needs a configured export folder.'} Open Source settings to inspect the configuration.</p>}
        <RuntimeDeviceSelector health={health} connected={connected} busy={busy} action={deviceAction} onApply={onDevice} onReconnect={onReconnect} />
        <fieldset className="menu-layouts" disabled={busy}><legend>Workspace layout</legend>
          <div className="menu-layout-list">
            <label><input type="radio" name={`${id}-layout`} aria-label="Analyst Studio" checked={analyst} onChange={() => setDraft(value => ({ ...value, layout: { ...DEFAULT_LAYOUT } }))} /><span><strong>Analyst Studio</strong><small>Adjustments, viewer, evidence and filmstrip</small></span></label>
            <label><input type="radio" name={`${id}-layout`} aria-label="Focused review" checked={focused} onChange={() => setDraft(value => ({ ...value, layout: { ...DEFAULT_LAYOUT, adjustments: false, filmstrip: false } }))} /><span><strong>Focused review</strong><small>Viewer and evidence, with more image space</small></span></label>
          </div>
          <details className="menu-panel-options"><summary>Panel options{!analyst && !focused ? ' · Custom' : ''}</summary><div>
            {([{ key: 'adjustments', label: 'Show adjustment dock' }, { key: 'inspector', label: 'Show evidence inspector' }, { key: 'filmstrip', label: 'Show filmstrip' }] as const).map(({ key, label }) => <label key={key}><input type="checkbox" checked={draft.layout[key]}
              onChange={event => setDraft(value => ({ ...value, layout: { ...value.layout, [key]: event.target.checked } }))} />{label}</label>)}
          </div></details>
        </fieldset>
        {!review && <fieldset className="menu-run-options" disabled={busy}>
          <legend className="visually-hidden">Starting run options</legend>
          <div className="menu-threshold-heading"><label htmlFor={`${id}-threshold`}>Starting score threshold</label><output htmlFor={`${id}-threshold`}>{draft.confidence}%</output></div>
          <input id={`${id}-threshold`} type="range" min="1" max="100" step="1" value={draft.confidence} aria-describedby={`${id}-threshold-help`}
            onChange={event => setDraft(value => ({ ...value, confidence: Number(event.target.value) }))} />
          <p id={`${id}-threshold-help`}>Applies to future runs. Model scores are not calibrated probabilities.</p>
          {draft.mode === 'demo' && demo?.state === 'paused' && demo.completed_count < demo.batch_total && <p className="menu-notice">The paused batch resumes at {Math.round(demo.confidence * 100)}%. This starting threshold applies to a new batch.</p>}
          {(draft.mode === 'demo' || draft.mode === 'folder') && <label className="menu-follow"><input type="checkbox" checked={draft.followLatest} onChange={event => setDraft(value => ({ ...value, followLatest: event.target.checked }))} /><span>Follow latest results<small>New runs replace the displayed scan until you begin inspecting it.</small></span></label>}
        </fieldset>}
      </section>
    </div>
    <div className="menu-utilities"><button type="button" className="text-button" onClick={onSettings}>Source settings</button>
      {!connected && <button type="button" className="text-button" disabled={connecting} onClick={onReconnect}>{connecting ? 'Connecting to local service…' : 'Reconnect service'}</button>}
      <p>Research workspace · no safety decision</p>
    </div>
    <footer className="menu-launch">
      <div className="menu-launch-summary"><strong>{current.label}</strong><p>{layoutName}{!review && ` · ${draft.confidence}% threshold`}</p><span>Opening the workspace does not start acquisition or inference.</span></div>
      <div className="menu-launch-actions">
        <button type="submit" className="primary-button" disabled={disabled}>Open workspace<ArrowRight size={17} aria-hidden="true" /></button>
        {canResume && <button type="button" className="secondary-button" onClick={onResume}>Return to workspace</button>}
      </div>
    </footer>
  </form>
}
