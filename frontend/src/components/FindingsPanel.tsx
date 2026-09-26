import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, CircleAlert, Crosshair, LoaderCircle, ScanSearch } from 'lucide-react'
import { api } from '../api'
import type { Review, Run } from '../types'
import { ReviewPanel } from './ReviewPanel'
import { AnnotationPanel } from './AnnotationPanel'
import { ModelClasses } from './ModelClasses'
import type { ComparisonState } from '../hooks/useAnnotationComparison'

interface Props { run: Run | null; selectedId: string | null; onSelect: (id: string) => void; processing: boolean; awaitingResult?: boolean; onReview: (id: string, value: Pick<Review, 'status' | 'note'>) => Promise<void>; onInspect: () => void; comparison: ComparisonState }

export function FindingsPanel({ run, selectedId, onSelect, processing, awaitingResult = false, onReview, onInspect, comparison }: Props) {
  const [tab, setTab] = useState('Findings')
  const tabs = ['Findings', 'Review', 'Provenance']
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const currentRun = useRef(run?.id)
  currentRun.current = run?.id
  useEffect(() => { setExportError(null) }, [run?.id])
  const result = run?.state === 'succeeded' ? run.result : null
  const detections = result?.detections ?? []
  const selected = detections.find((item) => item.id === selectedId)
  const model = run?.model ?? run?.result?.model
  const deviceModel = run?.model?.kind === 'device' || (detections.length > 0 && detections.every(item => item.kind === 'device'))

  const exportRun = async () => {
    if (!run || exporting) return
    const id = run.id
    setExporting(true)
    setExportError(null)
    try {
      const record = await api.exportRun(id)
      const blob = new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `rayguard-${id}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) {
      if (currentRun.current === id) setExportError(cause instanceof Error ? cause.message : 'The run could not be exported. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return <aside id="findings" className="findings-panel" aria-label="Detection findings" tabIndex={-1}>
    <div className="findings-heading"><div className="section-heading"><h2>Evidence inspector</h2></div>
      <span className="count-badge">{result ? detections.length : '—'}</span>
    </div>
    <div className="inspector-tabs" role="tablist" aria-label="Evidence sections">{tabs.map((name, index) => <button key={name}
      type="button" role="tab" id={`evidence-tab-${name}`} aria-controls={`evidence-panel-${name}`} aria-selected={tab === name}
      tabIndex={tab === name ? 0 : -1} onClick={() => { if (run) onInspect(); setTab(name) }} onKeyDown={event => {
        let next: number
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
        else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = tabs.length - 1
        else return
        event.preventDefault(); if (run) onInspect(); setTab(tabs[next]); document.getElementById(`evidence-tab-${tabs[next]}`)?.focus()
      }}>{name}</button>)}</div>
    <div className="inspector-content">
    <section role="tabpanel" id="evidence-panel-Findings" aria-labelledby="evidence-tab-Findings" hidden={tab !== 'Findings'} tabIndex={0}>
    {model && <p className="findings-description">Run model: <strong>{run?.model?.label || model.id}</strong>.</p>}
    {deviceModel && <p className="findings-description">Device localization only. Threat status and device-to-threat associations are not supplied by this model.</p>}
    <AnnotationPanel state={comparison} confidence={run?.confidence ?? 0} onInspect={onInspect} />
    {processing ? <div className="findings-empty" role="status"><LoaderCircle size={29} className="spin" /><h3>Inspecting the scan</h3><p>Results appear here when the detector finishes.</p></div>
      : run?.state === 'failed' ? <div className="findings-empty error-state"><CircleAlert size={30} /><h3>Inference did not complete</h3><p>{run.error?.message || 'No valid result was returned. Check the local service and try again.'}</p></div>
      : !result ? <div className="findings-empty"><Crosshair size={32} strokeWidth={1.35} /><h3>{awaitingResult ? 'Awaiting a completed result' : 'Ready when you are'}</h3><p>{awaitingResult ? 'Evidence will appear when inference finishes.' : 'Run the detector to see localized regions and model scores.'}</p></div>
      : detections.length === 0 ? <div className="findings-empty"><ScanSearch size={31} strokeWidth={1.4} aria-hidden="true" /><h3>No detections reported</h3><p>No regions met this run’s {Math.round(run!.confidence * 100)}% threshold. This is not a safe or benign verdict.</p></div>
      : <>
        <p className="findings-description">Select a finding to locate it in the scan.</p>
        <ol className="finding-list">{detections.map((detection, index) => <li key={detection.id}>
          <button type="button" className={`finding-item ${selectedId === detection.id ? 'is-selected' : ''}`}
            aria-pressed={selectedId === detection.id} onClick={() => onSelect(detection.id)}>
            <span className="finding-number">{index + 1}</span><span className="finding-copy"><strong>{detection.category.label}</strong><small>{detection.kind === 'device' ? 'Device localization' : 'Localized region'}</small></span>
            <span className="finding-score">{(detection.confidence * 100).toFixed(1)}<small>%</small></span>
          </button>
        </li>)}</ol>
      </>}
    </section>
    <section role="tabpanel" id="evidence-panel-Review" aria-labelledby="evidence-tab-Review" hidden={tab !== 'Review'} tabIndex={0}>
      {run && run.state !== 'running' ? <ReviewPanel run={run} onReview={onReview} onInspect={onInspect} /> : <p className="findings-description">Review becomes available after a run finishes.</p>}
    </section>
    <section role="tabpanel" id="evidence-panel-Provenance" aria-labelledby="evidence-tab-Provenance" hidden={tab !== 'Provenance'} tabIndex={0}>
    {run && run.state !== 'running' ? <div className="run-details">
      {!processing && selected && <section className="finding-detail" aria-label="Selected finding details"><h3>Region coordinates</h3><code>{selected.box_xyxy.map((value) => value.toFixed(1)).join(', ')}</code><p>x₁, y₁, x₂, y₂ · image pixels</p><dl><dt>Category namespace</dt><dd>{selected.category.namespace}</dd><dt>Device association</dt><dd>{selected.device_id || 'Not supplied'}</dd></dl></section>}
      <div className="run-evidence">
        <div className="evidence-heading"><h3>Run record</h3><span className={`run-state ${run.state}`}>{run.state === 'succeeded' ? 'Completed' : 'Failed'}</span></div>
        <dl><dt>Threshold used</dt><dd>{Math.round(run.confidence * 100)}%</dd>
          <dt title="Includes process and model startup; not a latency benchmark.">Run duration</dt><dd>{run.elapsed_seconds === null ? 'Not recorded' : `${run.elapsed_seconds.toFixed(2)} s`}</dd>
          <dt>Run ID</dt><dd className="mono" title={run.id}>{run.id.slice(0, 12)}</dd></dl>
        {model && <section className="provenance-record" aria-label="Model and provenance"><h3>Model &amp; provenance</h3><dl><dt>Model</dt><dd>{model.id}</dd><dt>Task</dt><dd>{model.task}</dd><dt>Model record</dt><dd>{model.provenance}</dd>{result && <><dt>Run record</dt><dd>{result.run.provenance}</dd></>}</dl>
          {run.model && <ModelClasses classes={run.model.classes} task={run.model.task} />}
        </section>}
        <section className="provenance-record execution-record" aria-label="Execution device"><h3>Execution</h3>
          {run.execution ? <dl><dt>Actual device</dt><dd>{run.execution.actual_device ?? 'Not recorded'}</dd>
            <dt>Requested device</dt><dd>{run.execution.requested_device || 'Not recorded'}</dd>
            <dt>Hardware</dt><dd>{run.execution.device_name ?? 'Not recorded'}</dd>
            <dt>Precision</dt><dd>{run.execution.precision ?? 'Not recorded'}</dd>
            <dt>Backend</dt><dd>{run.execution.backend ?? 'Not recorded'}</dd>
            <dt>Policy</dt><dd>{run.execution.policy === 'auto' ? 'Auto' : run.execution.policy}</dd>
            <dt>Profile</dt><dd>{run.execution.profile || 'Not recorded'}</dd>
            <dt>Python</dt><dd>{run.execution.python ?? 'Not recorded'}</dd>
            <dt>PyTorch</dt><dd>{run.execution.torch ?? 'Not recorded'}</dd>
            <dt>Torchvision</dt><dd>{run.execution.torchvision ?? 'Not recorded'}</dd>
            <dt>CUDA runtime</dt><dd>{run.execution.cuda ?? 'Not recorded'}</dd>
            <dt>cuDNN</dt><dd>{run.execution.cudnn ?? 'Not recorded'}</dd>
            {run.execution.selection_reason && <><dt>Selection reason</dt><dd>{run.execution.selection_reason}</dd></>}
          </dl> : <p className="control-help">Not recorded for this run.</p>}
        </section>
        <button type="button" className="secondary-button export-button" disabled={exporting} onClick={() => { void exportRun() }}>
          {exporting ? <LoaderCircle size={15} className="spin" /> : <ArrowDownToLine size={15} />}{exporting ? 'Preparing export…' : 'Export run JSON'}
        </button>
        {exportError && <p className="export-error" role="alert">{exportError}</p>}
      </div>
    </div> : <p className="findings-description">Run settings and export appear here after execution.</p>}
    </section>
    </div>
    <div className="findings-disclaimer"><CircleAlert size={15} /><p>Research output. Detections support inspection; they do not establish a safety decision.</p></div>
  </aside>
}
