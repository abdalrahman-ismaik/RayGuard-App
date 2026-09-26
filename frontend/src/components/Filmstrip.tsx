import { Images } from 'lucide-react'
import type { Intake, Run } from '../types'

interface Props { runs: Run[]; pending: Intake['pending']; selectedId?: string; disabled: boolean; onSelect: (run: Run) => void }

export function Filmstrip({ runs, pending, selectedId, disabled, onSelect }: Props) {
  return <section className="scan-filmstrip" aria-label="Saved scan filmstrip">
    <div className="filmstrip-heading"><h2><Images size={16} aria-hidden="true" />Scan filmstrip</h2><span>{runs.length} saved · {pending.length} queued</span></div>
    {runs.length === 0 ? <p className="filmstrip-empty">Run a scan or start a dataset demo to build your session.</p>
      : <div className="filmstrip-list" tabIndex={0} role="region" aria-label="Browse saved scans">{runs.map(run => <button type="button" key={run.id}
        className={`filmstrip-item ${run.id === selectedId ? 'is-current' : ''}`} aria-label={`View scan ${run.scan.name}`}
        aria-pressed={run.id === selectedId} disabled={disabled} onClick={() => onSelect(run)}>
        <img src={run.scan.image_url} alt="" loading="lazy" />
        <span className="filmstrip-copy"><strong title={run.scan.name}>{run.scan.name}</strong>
          <small>{run.scan.origin === 'dataset_demo' ? 'Dataset demo' : run.scan.origin === 'folder' ? 'Folder' : run.scan.origin === 'upload' ? 'Upload' : 'Source not recorded'} · {run.state === 'succeeded' ? `${run.result?.detections.length ?? '—'} findings` : run.state === 'failed' ? 'Failed' : 'Running'}</small>
          <small>{run.state === 'running' ? 'Inference in progress' : run.review?.status === 'reviewed' ? 'Reviewed' : run.review?.status === 'follow_up' ? 'Follow-up' : 'Unreviewed'}</small>
        </span>
      </button>)}</div>}
  </section>
}
