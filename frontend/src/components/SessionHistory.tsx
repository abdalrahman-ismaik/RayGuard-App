import { ArrowUpRight, Clock3 } from 'lucide-react'
import { useState } from 'react'
import type { Intake, Run } from '../types'

interface Props { runs: Run[]; pending: Intake['pending']; selectedId?: string; disabled: boolean; onSelect: (run: Run) => void }

export function SessionHistory({ runs, pending, selectedId, disabled, onSelect }: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const visible = runs.filter(run => `${run.scan.name} ${run.id}`.toLowerCase().includes(search.trim().toLowerCase())
    && (filter === 'all' || (filter === 'failed' ? run.state === 'failed' : run.state !== 'running' && (run.review?.status ?? 'unreviewed') === filter)))
    .sort((a, b) => sort === 'name' ? a.scan.name.localeCompare(b.scan.name) : sort === 'oldest' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at))
  return <section id="session-history" className="history-section" aria-label="Session history" tabIndex={-1}>
    <div className="history-summary"><span className="history-title"><Clock3 size={16} /><h2>Session history</h2></span><span className="history-counts">{runs.length} {runs.length === 1 ? 'run' : 'runs'} · {pending.length} queued</span></div>
    <div className="history-tools">
      <label>Search scans<input className="history-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Filename or run ID" /></label>
      <label>Filter runs<select className="history-filter" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All runs</option><option value="unreviewed">Unreviewed</option><option value="follow_up">Follow-up</option><option value="reviewed">Reviewed</option><option value="failed">Failed</option></select></label>
      <label>Sort runs<select className="history-sort" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Filename</option></select></label>
    </div>
    <p className="history-filter-count" role="status">{visible.length} of {runs.length} runs shown{selectedId && !visible.some(run => run.id === selectedId) ? ' · Selected scan is outside this filter' : ''}</p>
    <div className="history-content">
    {pending.length > 0 && <ul className="pending-scans" aria-label="Queued scans">{pending.map((item) => <li key={item.id}><span className="run-state">Queued</span><span>{item.scan.name}</span></li>)}</ul>}
    {runs.length === 0 ? <div className="history-empty">Your completed and failed runs will appear here, with their original settings.</div>
      : visible.length === 0 ? <div className="history-empty">No runs match these filters. Adjust the search or filter to see your session.</div>
      : <><p className="history-scroll-hint">Scroll horizontally to see all run details.</p><div className="history-scroll" role="region" aria-label="Run history table" tabIndex={0}><table><thead><tr><th scope="col">Scan</th><th scope="col">Started</th><th scope="col">Source</th><th scope="col">Threshold</th><th scope="col">Findings</th><th scope="col">Status</th><th scope="col">Review</th><th scope="col"><span className="visually-hidden">Open run</span></th></tr></thead>
        <tbody>{visible.map((run) => <tr key={run.id} className={selectedId === run.id ? 'is-current' : ''}>
          <td><button className="history-name" onClick={() => onSelect(run)} disabled={disabled} aria-label={`View run for ${run.scan.name}`}><span className="mini-scan"><img src={run.scan.image_url} alt="" /></span><span title={run.scan.name}>{run.scan.name}<small>{run.id.slice(0, 8)}</small></span></button></td>
          <td>{new Date(run.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
          <td>{run.scan.origin === 'dataset_demo' ? 'Dataset demo' : run.scan.origin === 'folder' ? 'Folder' : run.scan.origin === 'upload' ? 'Upload' : 'Source not recorded'}</td>
          <td>{Math.round(run.confidence * 100)}%</td><td>{run.state === 'succeeded' ? run.result?.detections.length ?? '—' : '—'}</td>
          <td><span className={`run-state ${run.state}`}>{run.state === 'succeeded' ? 'Completed' : run.state === 'failed' ? 'Failed' : 'Running'}</span></td>
          <td><span className={`review-status ${run.review?.status ?? 'unreviewed'}`}>{run.state === 'running' ? '—' : run.review?.status === 'reviewed' ? 'Reviewed' : run.review?.status === 'follow_up' ? 'Follow-up' : 'Unreviewed'}</span></td>
          <td><button type="button" className="history-open icon-button" onClick={() => onSelect(run)} disabled={disabled} aria-label={`Open run ${run.id}`}><ArrowUpRight size={17} /></button></td>
        </tr>)}</tbody></table></div></>}
    </div>
  </section>
}
