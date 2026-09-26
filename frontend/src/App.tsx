import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { CircleAlert, ChevronRight, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { Dashboard } from './components/Dashboard'
import { DashboardNavigation } from './components/DashboardNavigation'
import { pageHref, pageTitles, readPage, type DashboardPage } from './pages'
import { MainMenu } from './components/MainMenu'
import { AppearancePanel } from './components/AppearancePanel'
import { FindingsPanel } from './components/FindingsPanel'
import { Filmstrip } from './components/Filmstrip'
import { DatasetDemo } from './components/DatasetDemo'
import { DetectorSettings, InputPanel } from './components/InputPanel'
import { RuntimeStatus } from './components/RuntimeStatus'
import { runtimeLabel } from './runtime'
import { IntakeBar } from './components/IntakeBar'
import { ScanCanvas } from './components/ScanCanvas'
import { SessionHistory } from './components/SessionHistory'
import { DEFAULT_VIEW_ADJUSTMENTS, ViewAdjustments } from './components/ViewAdjustments'
import { useWorkspace } from './hooks/useWorkspace'
import { useAnnotationComparison } from './hooks/useAnnotationComparison'
import { EyeMotion, useReducedMotion } from './components/EyeMotion'
import { RayGuardIntro } from './components/RayGuardIntro'
import type { Run } from './types'
import { DEFAULT_LAYOUT, type WorkspaceSetup, type WorkspaceMode } from './workspaceSetup'
import './eye-motion.css'
import './dashboard-shell.css'
import './processing-split.css'

type Section = 'inspect' | 'session' | 'source'
const isWorkspace = (page: DashboardPage): page is Section => page === 'inspect' || page === 'session' || page === 'source'
const focusTarget = (page: DashboardPage) => page === 'dashboard' ? 'dashboard' : page === 'setup' ? 'main-menu' : 'workspace'
const hasCompletedResult = (run: Run | null): run is Run => Boolean(run?.state === 'succeeded' && run.result?.status === 'ok'
  && run.result.scan_id === run.scan.id && run.result.run.id === run.id)
const noComparison = { eligible: false, loading: false, comparison: null, error: null, retry: () => {} }

export default function App() {
  const workspace = useWorkspace()
  // Acquisition and review have separate identities. A held result never supplies
  // the active image, and a running image never borrows a completed run's boxes.
  const activeRun = workspace.activeId ? workspace.runs.find(run => run.id === workspace.activeId)
    ?? (workspace.run?.id === workspace.activeId ? workspace.run : null) : null
  const splitProcessing = workspace.starting || Boolean(workspace.activeId && (!activeRun || activeRun.state === 'running'))
  const processingScan = workspace.starting ? workspace.scan : activeRun?.scan ?? null
  const latestCompleted = workspace.runs.filter(hasCompletedResult).sort((a, b) =>
    (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at))[0] ?? null
  const heldReview = splitProcessing && !workspace.followLatest && Boolean(workspace.run && workspace.run.state !== 'running')
  const evidenceRun = splitProcessing ? heldReview ? workspace.run : latestCompleted : workspace.run
  const evidenceScan = splitProcessing ? evidenceRun?.scan ?? null : workspace.scan
  const evidenceSelection = evidenceRun?.id === workspace.run?.id ? workspace.selectedId : null
  const comparison = useAnnotationComparison(evidenceRun)
  const [page, setPage] = useState<DashboardPage>(() => readPage(window.location.hash))
  const [compact, setCompact] = useState(false)
  const [setupMode, setSetupMode] = useState<WorkspaceMode | null>(null)
  const [entered, setEntered] = useState(() => isWorkspace(readPage(window.location.hash)))
  const [section, setSection] = useState<Section>(() => { const initial = readPage(window.location.hash); return isWorkspace(initial) ? initial : 'inspect' })
  const [layout, setLayout] = useState(DEFAULT_LAYOUT)
  const [adjustments, setAdjustments] = useState({ ...DEFAULT_VIEW_ADJUSTMENTS })
  const reducedMotion = useReducedMotion()
  const [pauseMotion, setPauseMotion] = useState(false)
  const [intro, setIntro] = useState<'initial' | 'replay' | null>(() => reducedMotion ? null : 'initial')
  const previousIntro = useRef(intro)
  const replayButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { document.title = `RayGuard — ${pageTitles[page]}` }, [page])
  useEffect(() => {
    const onHashChange = () => {
      const next = readPage(window.location.hash)
      setPage(next)
      if (isWorkspace(next)) { setSection(next); setEntered(true) }
      requestAnimationFrame(() => document.getElementById(focusTarget(next))?.focus({ preventScroll: true }))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  const navigate = (next: DashboardPage) => {
    setPage(next)
    if (isWorkspace(next)) { setSection(next); setEntered(true) }
    window.location.hash = pageHref(next)
    requestAnimationFrame(() => document.getElementById(focusTarget(next))?.focus({ preventScroll: true }))
  }
  const onNavigate = (event: MouseEvent<HTMLAnchorElement>, next: DashboardPage) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (next === 'setup') setSetupMode(null)
    navigate(next)
  }
  const configure = (mode?: WorkspaceMode) => { setSetupMode(mode ?? null); navigate('setup') }
  const closeIntro = useCallback(() => setIntro(null), [])
  useEffect(() => {
    const completed = previousIntro.current
    previousIntro.current = intro
    if (intro || !completed) return
    // Focus after the dialog's unmount/close cleanup has restored native focus.
    const frame = requestAnimationFrame(() => {
      const target = completed === 'replay' && page === 'source' && replayButton.current && !replayButton.current.disabled
        ? replayButton.current : document.getElementById(focusTarget(page))
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [intro, page, section])
  useEffect(() => {
    if (intro && (reducedMotion || pauseMotion || (!workspace.connecting && !workspace.connected)
      || (intro === 'replay' && (workspace.activeId || workspace.starting || workspace.uploading || workspace.verifying)))) closeIntro()
  }, [intro, reducedMotion, pauseMotion, workspace.connecting, workspace.connected, workspace.activeId, workspace.starting, workspace.uploading, workspace.verifying, closeIntro])
  useEffect(() => { setAdjustments({ ...DEFAULT_VIEW_ADJUSTMENTS }) }, [evidenceScan?.id])
  const motionPaused = reducedMotion || pauseMotion || Boolean(intro)
  useEffect(() => {
    document.documentElement.dataset.motionPaused = String(pauseMotion)
    return () => { delete document.documentElement.dataset.motionPaused }
  }, [pauseMotion])
  const processing = workspace.starting || workspace.run?.state === 'running'
  const backgroundActive = Boolean(workspace.activeId && workspace.activeId !== workspace.run?.id && !workspace.uploading && !workspace.starting)
  const detections = workspace.run?.state === 'succeeded' ? workspace.run.result?.detections ?? [] : []
  const holdScan = () => workspace.setFollowLatest(false)
  const holdEvidence = () => {
    if (splitProcessing && evidenceRun && evidenceRun.id !== workspace.run?.id) workspace.selectRun(evidenceRun)
    else holdScan()
  }
  const selectFinding = (id: string) => { holdEvidence(); workspace.setSelectedId(id); setLayout(value => ({ ...value, inspector: true })) }
  const evidenceDetections = evidenceRun?.state === 'succeeded' ? evidenceRun.result?.detections ?? [] : []
  const selectRun = (run: Run) => {
    workspace.selectRun(run)
    navigate('inspect')
    requestAnimationFrame(() => document.getElementById('scan-viewer')?.focus())
  }
  const hasResult = workspace.run?.state === 'succeeded'
  const step = hasResult ? 2 : workspace.scan ? 1 : 0
  const demoMode = workspace.inputSource === 'demo'
  const folderMode = workspace.inputSource === 'folder'
  const openWorkspace = (setup: WorkspaceSetup) => {
    // Recheck current service state: it may have changed while the menu was open.
    if (setup.mode !== 'review') {
      if (workspace.busy || workspace.connecting) return
      if (setup.mode === 'demo' && (!workspace.connected || !workspace.demo?.configured)) return
      if (setup.mode === 'folder' && (!workspace.connected || !workspace.intake?.configured)) return
      workspace.selectSource(setup.mode)
      workspace.setConfidence(setup.confidence)
      workspace.setFollowLatest(setup.mode === 'upload' ? false : setup.followLatest)
    } else workspace.setFollowLatest(false)
    setLayout({ ...setup.layout })
    setSetupMode(null)
    navigate(setup.mode === 'review' ? 'session' : 'inspect')
  }
  const showIntake = Boolean(workspace.intake?.enabled || workspace.intake?.pending_count || workspace.intake?.error || workspace.intake?.issues.length || (workspace.activeId && workspace.scan?.origin === 'folder') || (!demoMode && !workspace.followLatest && workspace.newerCount > 0))
  const inputOrigin = !workspace.scan ? 'No scan selected' : workspace.scan.origin === 'dataset_demo' ? 'IEDXray dataset replay'
    : workspace.scan.origin === 'folder' ? 'Folder intake' : workspace.scan.origin === 'upload' ? 'Manual upload' : 'Source not recorded'
  const resultStatus = splitProcessing ? evidenceRun?.state === 'failed' ? 'Held review · inference failed'
    : evidenceRun ? `${evidenceDetections.length} regions in ${heldReview ? 'held review' : 'latest completed result'}` : 'No completed result yet'
    : processing ? 'Inference in progress' : workspace.run?.state === 'failed' ? 'Inference failed'
      : hasResult ? `${detections.length} regions reported` : 'No completed run'
  const acquisitionError = workspace.demo?.error?.message || workspace.intake?.error?.message
  const pausedReplay = workspace.demo?.state === 'paused' && workspace.demo.completed_count < workspace.demo.batch_total
  const intakeControl = <IntakeBar intake={workspace.intake} connected={workspace.connected} changing={workspace.changingIntake}
    runtimeReady={workspace.ready && !workspace.verifying}
    active={Boolean(workspace.activeId)} uploading={workspace.uploading || workspace.starting || Boolean(workspace.demo?.enabled) || workspace.changingDemo} followLatest={workspace.followLatest}
    newerCount={workspace.newerCount} backgroundActive={!demoMode && backgroundActive && !(splitProcessing && page === 'inspect')} motionPaused={motionPaused}
    onToggle={() => { void workspace.toggleIntake() }} onFollow={workspace.setFollowLatest} />

  return <div className={`dashboard-shell ${compact ? 'is-compact' : ''}`} data-page={page}>
    {intro && <RayGuardIntro onComplete={closeIntro} status={workspace.connecting ? 'Connecting to local service'
      : workspace.health?.runtime && !workspace.ready ? runtimeLabel(workspace.health.runtime) : workspace.health?.model.configured ? 'Workspace available' : 'Model configuration required'} />}
    <a className="skip-link" href={`#${focusTarget(page)}`} onClick={event => { event.preventDefault(); document.getElementById(focusTarget(page))?.focus() }}>Skip to {pageTitles[page]}</a>
    <DashboardNavigation page={page} compact={compact} onCompact={() => setCompact(value => !value)} onNavigate={onNavigate} />
    <div className="dashboard-body">
      <header className="dashboard-topbar">
        <div className="dashboard-breadcrumb"><span>Workspace</span><ChevronRight size={14} aria-hidden="true" /><strong>{pageTitles[page]}</strong></div>
        <div className="header-actions"><span className={`connection-status ${workspace.connected ? 'connected' : ''}`}>{workspace.connecting && !intro ? <EyeMotion paused={motionPaused} /> : <span className="status-dot" />}{workspace.connecting ? 'Connecting to local service' : workspace.connected ? 'Local service' : 'Offline'}</span><AppearancePanel /></div>
      </header>
      <div className="dashboard-page-content">
        {page !== 'inspect' && (workspace.busy || acquisitionError || pausedReplay) && <div className="dashboard-activity" role={acquisitionError ? 'alert' : 'status'}><span>{acquisitionError ? `Acquisition needs attention: ${acquisitionError}` : workspace.verifying ? 'Model verification is running. Ordinary inference waits for it to finish.' : workspace.busy ? 'Acquisition or inference is active. Navigating does not pause it.' : 'Dataset replay is paused. Resume uses the existing batch settings.'}</span><a href={pageHref(workspace.verifying ? 'source' : 'inspect')} onClick={event => onNavigate(event, workspace.verifying ? 'source' : 'inspect')}>{workspace.verifying ? 'View runtime verification' : workspace.busy ? 'View active inspection' : 'View acquisition controls'}</a></div>}
        {page === 'dashboard' && workspace.error && <div className="error-banner" role="alert"><CircleAlert size={18} /><span>{workspace.error}</span><button type="button" className="text-button" onClick={() => { void workspace.reconnect() }}>Reconnect service</button></div>}
        {page === 'dashboard' && <main id="dashboard" aria-label="Dashboard" tabIndex={-1}><Dashboard workspace={workspace} onInspect={() => navigate('inspect')} onConfigure={configure} onSession={() => navigate('session')} onSource={() => navigate('source')} onSelectRun={selectRun} /></main>}
        {page === 'setup' && <main id="main-menu" className="main-menu" tabIndex={-1}>
          <MainMenu initial={{ mode: setupMode ?? (section === 'session' ? 'review' : workspace.inputSource), layout, confidence: workspace.confidence, followLatest: workspace.followLatest }}
            health={workspace.health} intake={workspace.intake} demo={workspace.demo} connected={workspace.connected} connecting={workspace.connecting}
            busy={workspace.busy} verifying={workspace.verifying} changingRuntime={workspace.changingRuntime} deviceAction={workspace.deviceAction}
            onDevice={(device, restart, modelId) => { void workspace.setRuntimeDevice(device, restart, modelId) }} runsCount={workspace.runs.length} canResume={entered || workspace.busy}
            onOpen={openWorkspace} onResume={() => navigate(section)} onSettings={() => navigate('source')}
            onReconnect={() => { void workspace.reconnect() }} />
        </main>}
        <div className="analyst-frame" hidden={!isWorkspace(page)}>
          <main id="workspace" className="workspace-main" tabIndex={-1}>
        <div className="acquisition-area">
          {showIntake && (section !== 'inspect' || !folderMode) && <div className="active-intake">{intakeControl}</div>}
          {workspace.error && <div className="error-banner" role="alert"><CircleAlert size={18} /><span>{workspace.error}</span></div>}
          <div className="command-deck" hidden={section !== 'inspect'}>
            <div className="source-chooser" role="group" aria-label="Scan source"><span className="source-chooser-label">Image input</span>
              {folderMode ? <><strong>Folder receiver</strong><button type="button" disabled={workspace.busy} onClick={() => workspace.selectSource('upload')}>Upload</button><button type="button" onClick={() => configure()}>Change setup</button></>
                : <><button type="button" aria-pressed={!demoMode} disabled={workspace.busy} onClick={() => workspace.selectSource('upload')}>Upload</button>
                  <button type="button" aria-pressed={demoMode} disabled={workspace.busy} onClick={() => workspace.selectSource('demo')}>Dataset demo</button></>}
            </div>
            {folderMode ? intakeControl : demoMode ? <DatasetDemo demo={workspace.demo} connected={workspace.connected} configuredModel={Boolean(workspace.health?.model.configured)} runtimeReady={workspace.ready && !workspace.verifying}
              changing={workspace.changingDemo} active={Boolean(workspace.activeId)} blocked={workspace.uploading || workspace.starting || Boolean(workspace.intake?.enabled) || workspace.changingIntake}
              confidence={workspace.confidence} followLatest={workspace.followLatest} newerCount={workspace.newerCount}
              backgroundActive={backgroundActive && !(splitProcessing && page === 'inspect')} motionPaused={motionPaused}
              onAction={(value) => { void workspace.controlDemo(value) }} onFollow={workspace.setFollowLatest} onReconnect={() => { void workspace.reconnect() }} />
              : <InputPanel health={workspace.health} connected={workspace.connected} connecting={workspace.connecting}
                scan={workspace.scan} busy={workspace.busy} uploading={workspace.uploading} processing={processing} hasResult={hasResult}
                confidence={workspace.confidence} onConfidence={workspace.setConfidence} onUpload={(file) => { void workspace.upload(file) }}
                receiving={Boolean(workspace.intake?.enabled)} onRun={() => { void workspace.start() }} onReconnect={() => { void workspace.reconnect() }} />}
          </div>
        </div>
        <div className="section-toolbar">
          <h1>{section === 'inspect' ? 'Inspect a scan' : section === 'session' ? 'Session records' : 'Source & detector'}</h1>
          {section === 'inspect' && <><ol className="inspection-steps" aria-label="Inspection workflow">{['Choose scan', 'Run detection', 'Review result'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}><span aria-hidden="true">{index + 1}</span>{label}</li>)}</ol>
            <details className="layout-options"><summary><SlidersHorizontal size={15} />Layout options</summary><div className="layout-options-content">
              {([{ key: 'adjustments', label: 'Adjustment dock' }, { key: 'inspector', label: 'Evidence inspector' }, { key: 'filmstrip', label: 'Filmstrip' }] as const).map(({ key, label }) => <label key={key}><input type="checkbox" checked={layout[key]} onChange={event => setLayout(value => ({ ...value, [key]: event.target.checked }))} />{label}</label>)}
              <label className="inspector-width">Inspector width <output>{layout.width}px</output><input aria-label="Inspector width" type="range" min="280" max="380" step="20" value={layout.width} onChange={event => setLayout(value => ({ ...value, width: Number(event.target.value) }))} /></label>
              <button type="button" className="secondary-button" onClick={() => setLayout(DEFAULT_LAYOUT)}><RotateCcw size={14} />Reset layout</button>
            </div></details>
          </>}
        </div>
        <section className="inspection-page" aria-label="Inspection workstation" hidden={section !== 'inspect'}>
          {!layout.inspector && <div className="hidden-evidence-status" role="status"><span>Inspector hidden · {resultStatus}</span><button type="button" className="text-button" onClick={() => { setLayout(value => ({ ...value, inspector: true })); requestAnimationFrame(() => document.getElementById('findings')?.focus()) }}>Show evidence</button></div>}
          <div className={`inspection-workspace ${splitProcessing ? 'is-processing-split' : ''} ${!layout.adjustments ? 'without-adjustments' : ''} ${!layout.inspector ? 'without-inspector' : ''}`} style={{ '--inspector-width': `${layout.width}px` } as CSSProperties}>
            <div className="adjustment-dock" hidden={!layout.adjustments} role="region" aria-label="Image adjustment dock" tabIndex={0}><ViewAdjustments value={adjustments} onChange={setAdjustments} disabled={!evidenceScan || workspace.uploading || workspace.starting} onInspect={holdEvidence}
              targetLabel={splitProcessing ? heldReview ? 'Held image only' : 'Completed image only' : undefined} /></div>
            {splitProcessing && <ScanCanvas key="processing" viewerId="processing-scan-viewer" title="Processing scan" processingAbove returnFocusTo="scan-viewer" scan={processingScan}
              detections={[]} selectedId={null} adjustments={DEFAULT_VIEW_ADJUSTMENTS} comparison={noComparison} onSelect={() => {}}
              processing uploading={false} starting={workspace.starting} receiving={false} onInspect={() => {}}
              emptyState={{ title: 'Loading active scan', description: 'Waiting for the active run’s image record. The completed result stays separate.' }}
              motionPaused={motionPaused || section !== 'inspect' || page !== 'inspect'} connected={workspace.connected} />}
            <div key="evidence" className="completed-evidence" inert={splitProcessing && workspace.starting}>
            <ScanCanvas title={splitProcessing ? heldReview ? 'Held review' : 'Latest completed scan' : 'Scan viewer'} scan={evidenceScan} detections={evidenceDetections} selectedId={evidenceSelection} adjustments={adjustments}
              comparison={comparison}
              emptyState={splitProcessing ? { title: 'No completed result yet', description: 'The first completed scan and its evidence will appear when inference finishes.' } : undefined}
              onSelect={selectFinding} processing={!splitProcessing && processing} uploading={workspace.uploading} receiving={!splitProcessing && Boolean(workspace.intake?.enabled)} demoMode={demoMode} onInspect={holdEvidence}
              starting={workspace.starting} motionPaused={motionPaused || section !== 'inspect' || page !== 'inspect'} connected={workspace.connected} />
            <div className="inspector-dock" hidden={!layout.inspector}><FindingsPanel run={evidenceRun} selectedId={evidenceSelection} onSelect={selectFinding} processing={!splitProcessing && processing} awaitingResult={splitProcessing && !evidenceRun} onReview={workspace.review} onInspect={holdEvidence} comparison={comparison} /></div>
            </div>
          </div>
          <div className="filmstrip-dock" hidden={!layout.filmstrip}><Filmstrip runs={workspace.runs} pending={workspace.intake?.pending ?? []} selectedId={workspace.run?.id} disabled={workspace.uploading || workspace.starting} onSelect={selectRun} /></div>
        </section>
        <section className="session-page" aria-label="Session workspace" hidden={section !== 'session'}>
          <SessionHistory runs={workspace.runs} pending={workspace.intake?.pending ?? []} selectedId={workspace.run?.id} disabled={workspace.uploading || workspace.starting} onSelect={selectRun} />
        </section>
        <section className="source-page" aria-label="Source workspace" hidden={section !== 'source'}>
          <div className="source-settings-grid">
            <div className="detector-source-panel"><DetectorSettings health={workspace.health} connected={workspace.connected} connecting={workspace.connecting} confidence={workspace.confidence} busy={workspace.busy} onConfidence={workspace.setConfidence} />
              {workspace.health?.runtime && <RuntimeStatus runtime={workspace.health.runtime} scan={workspace.scan} connected={workspace.connected}
                busy={workspace.busy} verifying={workspace.verifying} onVerify={() => { void workspace.verifyRuntime() }} />}
            </div>
            <div className="receiver-source-panel"><h2>Image sources</h2>
              {!showIntake && !demoMode ? intakeControl : <p className="control-help">{demoMode ? 'The dataset demo uses recorded IEDXray test images. Open Inspect for replay controls.' : 'Active folder intake and its pause control stay above this page.'}</p>}
              <p className="control-help">Scanner connection is unverified. Folder intake receives exported images; it does not control scanner hardware.</p>
            </div>
          </div>
          <div className="source-record-panel"><h2>Selected scan &amp; model record</h2><dl>
            <dt>Scan</dt><dd>{workspace.scan?.name ?? 'Choose an image to inspect its record.'}</dd><dt>Input source</dt><dd>{inputOrigin}</dd>
            <dt>Configured model</dt><dd>{workspace.health?.model.label ?? 'Local service unavailable'}</dd><dt>Model task</dt><dd>{workspace.health?.model.task ?? 'Not available'}</dd>
            <dt>Image dimensions</dt><dd>{workspace.scan ? `${workspace.scan.width} × ${workspace.scan.height} pixels` : 'Not available'}</dd>
            <dt>Canonical image SHA-256</dt><dd className="mono">{workspace.scan?.sha256 ?? 'Not available'}</dd>
            {workspace.scan?.source_sha256 && <><dt>Source file SHA-256</dt><dd className="mono">{workspace.scan.source_sha256}</dd></>}
          </dl><p className="control-help">Model findings are research evidence. Empty detections do not establish a safe or benign scan.</p></div>
          <details className="presentation-controls"><summary>Presentation &amp; motion</summary>
            <div className="presentation-options"><button ref={replayButton} type="button" className="secondary-button"
              disabled={Boolean(workspace.activeId || workspace.starting || workspace.uploading || workspace.verifying) || pauseMotion || reducedMotion}
              onClick={() => setIntro('replay')}>Replay introduction</button>
              <label><input type="checkbox" checked={pauseMotion} onChange={event => setPauseMotion(event.target.checked)} />Pause animations</label>
              {reducedMotion && <p>Motion is paused by your system preference.</p>}
            </div>
          </details>
        </section>
        <footer className="workspace-footer"><span>{workspace.runs.length} session runs · {workspace.intake?.pending_count ?? 0} queued</span><span>{inputOrigin}</span><span>Research evidence · no safety decision</span></footer>
          </main>
        </div>
      </div>
    </div>
  </div>
}
