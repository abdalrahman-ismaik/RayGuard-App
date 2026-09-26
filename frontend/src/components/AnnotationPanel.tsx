import { CircleCheck, CircleHelp, Crosshair, RotateCcw, ScanSearch } from 'lucide-react'
import type { ComparisonState } from '../hooks/useAnnotationComparison'
import type { AnnotationComparison } from '../types'
import '../annotation-comparison.css'

export const comparisonLabels: Record<NonNullable<AnnotationComparison['evaluation']>['outcome'], string> = {
  matched: 'Matched annotations', missed: 'Missed target', extra: 'Extra detection', mixed: 'Mixed result', empty: 'No annotated targets',
}

export function AnnotationPanel({ state, confidence, onInspect }: { state: ComparisonState; confidence: number; onInspect: () => void }) {
  if (!state.eligible) return null
  const { comparison, loading, error } = state
  const available = comparison?.status === 'available'
  const evaluation = available ? comparison.evaluation : null
  const label = loading ? 'Loading reference…' : evaluation ? comparisonLabels[evaluation.outcome] : 'Not evaluated'
  const Icon = evaluation?.outcome === 'matched' ? CircleCheck : evaluation && evaluation.outcome !== 'empty' ? Crosshair : CircleHelp
  return <section className="annotation-panel" aria-label="Published annotation comparison" onPointerDownCapture={onInspect} onKeyDownCapture={onInspect}>
    <h3><ScanSearch size={16} aria-hidden="true" />IEDXray test reference</h3>
    <p className={`comparison-outcome ${evaluation?.outcome ?? ''}`} role="status"><Icon size={18} aria-hidden="true" /><strong>{label}</strong></p>
    {available && <dl className="comparison-counts">
      <div><dt>Annotated</dt><dd>{comparison.boxes.length}</dd></div>
      <div><dt>Matched</dt><dd>{evaluation?.matched ?? '—'}</dd></div>
      <div><dt>Missed</dt><dd>{evaluation?.missed ?? '—'}</dd></div>
      <div><dt>Extra</dt><dd>{evaluation?.extra ?? '—'}</dd></div>
    </dl>}
    {error ? <p>{error}</p> : comparison?.reason ? <p>{comparison.reason}</p> : !loading && !evaluation ? <p>A completed, compatible model result is required.</p> : null}
    {!loading && (error || comparison?.status === 'unavailable') && <button type="button" className="secondary-button comparison-retry" onClick={state.retry}><RotateCcw size={14} aria-hidden="true" />Retry reference</button>}
    {evaluation && <p>Per-image comparison · IoU ≥ {comparison!.iou_threshold.toFixed(2)} · saved threshold {Math.round(confidence * 100)}%</p>}
    {evaluation?.outcome === 'empty' && <p>No targets are annotated for this task. This is not a safety verdict.</p>}
    {comparison && <details className="comparison-details"><summary>Reference &amp; limits{comparison.warnings.length > 0 ? ` (${comparison.warnings.length})` : ''}</summary>
      <p>Published dataset boxes are reference labels, not model predictions. Matches compare this image only; they are not overall model accuracy.</p>
      <p>One-to-one matching at IoU ≥ {comparison.iou_threshold.toFixed(2)}. Extra detections have no matching reference box.</p>
      {comparison.warnings.length > 0 && <ul>{comparison.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      {comparison.annotation_source && <dl><dt>Annotation file</dt><dd>{comparison.annotation_source.name}</dd><dt>Split / image ID</dt><dd>{comparison.annotation_source.split} / {comparison.image_id}</dd><dt>Task</dt><dd>{comparison.task}</dd><dt>Annotation SHA-256</dt><dd>{comparison.annotation_source.sha256}</dd></dl>}
    </details>}
  </section>
}
